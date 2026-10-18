import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { sanitizeOutput } from '../security/sanitize';
import { ZipExtractor, ZipSecurityError } from './zip-extractor';
import { DockerRunner, dockerRunner, SandboxContainer } from './docker-runner';
import { executionLogger, ExecutionLogRecord } from '../logging/execution-logger';

export interface TestCaseInput {
  id?: string;
  inputData?: string;
  expectedOutput?: string;
  scoreWeight?: number;
}

export interface ExecutionJobRequest {
  submissionId: string;
  assignmentId?: string;
  language?: string;
  fileRelativePath?: string;
  zipFilePath?: string;
  testCases?: TestCaseInput[];
}

export type SandboxOutcome =
  | 'PASSED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'SECURITY_VIOLATION'
  | 'COMPILATION_ERROR';

export interface TestCaseResult {
  testCaseId?: string;
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
  durationMs: number;
  error?: string;
}

export interface ExecutionJobResponse {
  outcome: SandboxOutcome;
  passedTests: number;
  totalTests: number;
  executionTimeMs: number;
  output?: string;
  errorMessage?: string;
  testResults?: TestCaseResult[];
}

export class ExecutionService {
  private runner: DockerRunner;
  private activeContainers = 0;

  constructor(customRunner?: DockerRunner) {
    this.runner = customRunner || dockerRunner;
  }

  /**
   * Resolve submission zip file location from relative or absolute paths.
   */
  public resolveZipPath(req: ExecutionJobRequest): string {
    const rawPath = req.zipFilePath || req.fileRelativePath;
    if (!rawPath) {
      throw new Error('Missing zip file path in request (fileRelativePath or zipFilePath required)');
    }

    if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) {
      return rawPath;
    }

    const candidatePaths = [
      path.resolve(process.cwd(), rawPath),
      path.resolve(process.cwd(), rawPath.replace(/^\//, '')),
      path.resolve(process.cwd(), '../api', rawPath.replace(/^\//, '')),
      path.resolve(process.cwd(), '../../apps/api', rawPath.replace(/^\//, '')),
      path.resolve(process.cwd(), '../../apps/api/uploads/submissions', path.basename(rawPath)),
      path.resolve(process.cwd(), 'uploads/submissions', path.basename(rawPath))
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    throw new Error(`Submission zip file could not be found. Checked paths:\n${candidatePaths.join('\n')}`);
  }

  /**
   * Fetch test cases from API Gateway if not supplied in request.
   */
  private async fetchTestCasesFromGateway(assignmentId: string): Promise<TestCaseInput[]> {
    try {
      const url = `${config.CORE_API_URL}/api/assignments/internal/${assignmentId}`;
      const response = await fetch(url, {
        headers: {
          'x-internal-key': config.CORE_API_KEY
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const json: any = await response.json();
        if (json && json.data && Array.isArray(json.data.testCases)) {
          return json.data.testCases.map((tc: any) => ({
            id: tc.id,
            inputData: tc.inputData || '',
            expectedOutput: tc.expectedOutput || '',
            scoreWeight: tc.scoreWeight || 1
          }));
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message, assignmentId }, 'Could not fetch test cases from API Gateway');
    }
    return [];
  }

  /**
   * Detect main Java entrypoint class from source files.
   */
  private findMainClassName(javaFiles: string[]): string {
    for (const file of javaFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/public\s+static\s+void\s+main\s*\(\s*String/i.test(content)) {
        // Extract class name
        const match = content.match(/public\s+class\s+([A-Za-z0-9_]+)/);
        if (match && match[1]) {
          return match[1];
        }
        return path.basename(file, '.java');
      }
    }

    // Default heuristic: Main
    const mainFile = javaFiles.find((f) => path.basename(f) === 'Main.java');
    if (mainFile) return 'Main';

    if (javaFiles.length > 0) {
      return path.basename(javaFiles[0], '.java');
    }

    return 'Main';
  }

  /**
   * Main Execution Pipeline:
   * 1. Check concurrency
   * 2. Unpack zip
   * 3. Spawn container
   * 4. Compile Java (javac)
   * 5. Run test cases
   * 6. Classify outcome
   * 7. Cleanup & Audit Log
   */
  public async executeSubmission(req: ExecutionJobRequest): Promise<ExecutionJobResponse> {
    const startTime = Date.now();
    const submissionId = req.submissionId;
    const language = req.language || 'Java';

    if (this.activeContainers >= config.MAX_CONCURRENT_CONTAINERS) {
      logger.warn({ active: this.activeContainers }, 'Sandbox queue concurrency reached limit');
    }

    this.activeContainers++;
    const tempDir = path.resolve(process.cwd(), `tmp/sub_${submissionId}_${Date.now()}`);

    let container: SandboxContainer | null = null;
    let outcome: SandboxOutcome = 'FAILED';
    let passedTests = 0;
    let totalTests = 0;
    let outputMsg = '';
    let errorMsg: string | undefined = undefined;
    let testResults: TestCaseResult[] = [];
    let securityAlert: string | null = null;
    let exitCode = 0;

    try {
      // 1. Locate zip
      const zipPath = this.resolveZipPath(req);

      // 2. Unpack safely
      let extracted;
      try {
        extracted = ZipExtractor.extract(zipPath, tempDir);
      } catch (err: any) {
        if (err instanceof ZipSecurityError) {
          outcome = 'SECURITY_VIOLATION';
          securityAlert = err.message;
          errorMsg = `Security violation during zip inspection: ${err.message}`;
          return {
            outcome,
            passedTests: 0,
            totalTests: 0,
            executionTimeMs: Date.now() - startTime,
            errorMessage: errorMsg
          };
        }
        throw err;
      }

      if (extracted.javaFiles.length === 0) {
        outcome = 'COMPILATION_ERROR';
        errorMsg = 'No .java source code files found in the submitted archive.';
        return {
          outcome,
          passedTests: 0,
          totalTests: 0,
          executionTimeMs: Date.now() - startTime,
          errorMessage: errorMsg
        };
      }

      // 3. Resolve test cases
      let testCases = req.testCases || [];
      if (testCases.length === 0 && req.assignmentId) {
        testCases = await this.fetchTestCasesFromGateway(req.assignmentId);
      }
      if (testCases.length === 0) {
        outcome = 'FAILED';
        errorMsg = 'No test cases configured for this assignment. Cannot evaluate submission.';
        return {
          outcome,
          passedTests: 0,
          totalTests: 0,
          executionTimeMs: Date.now() - startTime,
          errorMessage: errorMsg,
          testResults: []
        };
      }
      totalTests = testCases.length;

      // 4. Create and start isolated container
      container = await this.runner.createSandboxContainer(submissionId);
      await container.putDirectory(tempDir, '/workspace');

      // 5. Compile step
      const compileCmd = ['/bin/bash', '-c', 'javac -encoding UTF-8 $(find /workspace -name "*.java")'];
      const compileResult = await container.exec({
        cmd: compileCmd,
        timeoutSec: config.COMPILE_TIMEOUT_SEC
      });

      exitCode = compileResult.exitCode;

      if (compileResult.timedOut) {
        outcome = 'TIMEOUT';
        errorMsg = `Compilation timed out after ${config.COMPILE_TIMEOUT_SEC} seconds.`;
        return {
          outcome,
          passedTests: 0,
          totalTests,
          executionTimeMs: Date.now() - startTime,
          errorMessage: errorMsg
        };
      }

      if (compileResult.exitCode !== 0) {
        outcome = 'COMPILATION_ERROR';
        errorMsg = sanitizeOutput(compileResult.stderr || compileResult.stdout || 'Compilation failed');
        return {
          outcome,
          passedTests: 0,
          totalTests,
          executionTimeMs: Date.now() - startTime,
          output: sanitizeOutput(compileResult.stdout),
          errorMessage: errorMsg
        };
      }

      // 6. Test execution step
      const mainClass = this.findMainClassName(extracted.javaFiles);
      const overallDeadline = startTime + config.OVERALL_TIMEOUT_SEC * 1000;

      for (let i = 0; i < testCases.length; i++) {
        if (Date.now() > overallDeadline) {
          outcome = 'TIMEOUT';
          errorMsg = `Overall execution exceeded limit of ${config.OVERALL_TIMEOUT_SEC} seconds.`;
          break;
        }

        const tc = testCases[i];
        const runCmd = ['/bin/bash', '-c', `java -cp /workspace ${mainClass}`];

        const execResult = await container.exec({
          cmd: runCmd,
          stdin: tc.inputData || '',
          timeoutSec: config.TEST_CASE_TIMEOUT_SEC
        });

        // Detect Timeout
        if (execResult.timedOut) {
          outcome = 'TIMEOUT';
          errorMsg = `Test case ${i + 1} timed out (> ${config.TEST_CASE_TIMEOUT_SEC}s)`;
          testResults.push({
            testCaseId: tc.id,
            passed: false,
            actualOutput: '',
            expectedOutput: tc.expectedOutput || '',
            durationMs: execResult.durationMs,
            error: 'Time Limit Exceeded'
          });
          break;
        }

        // Detect OOM
        if (execResult.oomKilled || execResult.exitCode === 137) {
          outcome = 'SECURITY_VIOLATION';
          securityAlert = 'Process terminated due to Out-Of-Memory (RAM limit 512MB exceeded)';
          errorMsg = securityAlert;
          break;
        }

        // Detect Fork Bomb / PID Exhaustion
        const combinedErr = (execResult.stderr + ' ' + execResult.stdout).toLowerCase();
        if (
          combinedErr.includes('resource temporarily unavailable') ||
          combinedErr.includes('unable to create native thread') ||
          combinedErr.includes('cannot create gc thread') ||
          combinedErr.includes('fork')
        ) {
          outcome = 'SECURITY_VIOLATION';
          securityAlert = 'Process throttled by PIDs limit (Fork Bomb attack detected)';
          errorMsg = securityAlert;
          break;
        }

        // Detect Host / System escape
        if (
          combinedErr.includes('permission denied') &&
          (combinedErr.includes('/etc') || combinedErr.includes('/root') || combinedErr.includes('/proc'))
        ) {
          outcome = 'SECURITY_VIOLATION';
          securityAlert = 'Unauthorized attempt to access restricted host/kernel path';
          errorMsg = securityAlert;
          break;
        }

        // Compare output with CRLF normalization, line trailing space trimming, and token fallback
        const normalize = (s: string) =>
          s
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map((l) => l.trimEnd())
            .join('\n')
            .trim();

        const actual = normalize(execResult.stdout || '');
        const expected = normalize(tc.expectedOutput || '');
        let passed = actual === expected;

        if (!passed && expected.length > 0) {
          const actualTokens = actual.split(/\s+/).filter(Boolean);
          const expectedTokens = expected.split(/\s+/).filter(Boolean);
          if (actualTokens.length === expectedTokens.length && actualTokens.length > 0) {
            passed = actualTokens.every((tok, idx) => tok === expectedTokens[idx]);
          }
        }

        if (passed) {
          passedTests++;
        }

        testResults.push({
          testCaseId: tc.id,
          passed,
          actualOutput: sanitizeOutput(actual),
          expectedOutput: expected,
          durationMs: execResult.durationMs,
          error: passed
            ? undefined
            : sanitizeOutput(execResult.stderr) || 'Output mismatch: expected output did not match actual output.'
        });
      }

      // 7. Determine Final Outcome
      if (outcome !== 'TIMEOUT' && outcome !== 'SECURITY_VIOLATION') {
        outcome = passedTests === totalTests ? 'PASSED' : 'FAILED';
        outputMsg = `Passed ${passedTests}/${totalTests} test cases.`;
      }
    } catch (err: any) {
      logger.error({ err: err.message, submissionId }, 'Unexpected error during sandbox run');
      outcome = 'COMPILATION_ERROR';
      errorMsg = sanitizeOutput(err.message);
    } finally {
      this.activeContainers--;

      // Clean up container (NFR-14)
      if (container) {
        await container.destroy();
      }

      // Clean up local temp directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore temp cleanup error
      }

      // Record Audit Log (NFR-18)
      const executionTimeMs = Date.now() - startTime;
      const logRecord: ExecutionLogRecord = {
        submissionId,
        assignmentId: req.assignmentId,
        language,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        durationMs: executionTimeMs,
        exitCode,
        outcome,
        resourceUsage: {
          memoryPeakMb: config.SANDBOX_MEMORY_MB,
          cpuTimeMs: executionTimeMs
        },
        securityAlert,
        passedTests,
        totalTests
      };
      executionLogger.logExecution(logRecord);
    }

    return {
      outcome,
      passedTests,
      totalTests,
      executionTimeMs: Date.now() - startTime,
      output: outputMsg,
      errorMessage: errorMsg,
      testResults
    };
  }
}

export const executionService = new ExecutionService();

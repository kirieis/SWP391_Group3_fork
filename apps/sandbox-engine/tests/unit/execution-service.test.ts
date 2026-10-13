import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { ExecutionService } from '../../src/engine/execution.service';
import { DockerRunner, SandboxContainer, ExecResult } from '../../src/engine/docker-runner';

class MockDockerRunner extends DockerRunner {
  public mockExecHandler?: (cmd: string[]) => ExecResult;
  public destroyedContainers: string[] = [];

  constructor() {
    super({} as any);
  }

  public override async ping(): Promise<boolean> {
    return true;
  }

  public override async createSandboxContainer(submissionId: string): Promise<SandboxContainer> {
    const containerId = `mock_c_${submissionId}`;

    return {
      id: containerId,
      putDirectory: async () => {},
      exec: async (options) => {
        if (this.mockExecHandler) {
          return this.mockExecHandler(options.cmd);
        }
        return {
          exitCode: 0,
          stdout: '42\n',
          stderr: '',
          timedOut: false,
          oomKilled: false,
          durationMs: 50
        };
      },
      destroy: async () => {
        this.destroyedContainers.push(containerId);
      },
      inspect: async () => null
    };
  }
}

describe('ExecutionService Unit Tests', () => {
  const tmpDir = path.resolve(__dirname, '../../tmp/unit_test_exec');
  let mockRunner: MockDockerRunner;
  let service: ExecutionService;
  let sampleZipPath: string;

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const zip = new AdmZip();
    zip.addFile('Main.java', Buffer.from('public class Main { public static void main(String[] args) {} }'));
    sampleZipPath = path.join(tmpDir, 'student_submission.zip');
    zip.writeZip(sampleZipPath);
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    mockRunner = new MockDockerRunner();
    service = new ExecutionService(mockRunner);
  });

  it('should return PASSED when all test cases match', async () => {
    mockRunner.mockExecHandler = (cmd) => {
      if (cmd[2]?.includes('javac')) {
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, oomKilled: false, durationMs: 100 };
      }
      return { exitCode: 0, stdout: 'Echo 10\n', stderr: '', timedOut: false, oomKilled: false, durationMs: 50 };
    };

    const res = await service.executeSubmission({
      submissionId: 'sub_pass_1',
      zipFilePath: sampleZipPath,
      testCases: [
        { id: 'tc1', inputData: '10', expectedOutput: 'Echo 10', scoreWeight: 10 }
      ]
    });

    expect(res.outcome).toBe('PASSED');
    expect(res.passedTests).toBe(1);
    expect(res.totalTests).toBe(1);
    expect(mockRunner.destroyedContainers).toContain('mock_c_sub_pass_1');
  });

  it('should return COMPILATION_ERROR when javac fails', async () => {
    mockRunner.mockExecHandler = (cmd) => {
      if (cmd[2]?.includes('javac')) {
        return { exitCode: 1, stdout: '', stderr: 'Main.java:2: error: cannot find symbol', timedOut: false, oomKilled: false, durationMs: 100 };
      }
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, oomKilled: false, durationMs: 50 };
    };

    const res = await service.executeSubmission({
      submissionId: 'sub_compile_err',
      zipFilePath: sampleZipPath
    });

    expect(res.outcome).toBe('COMPILATION_ERROR');
    expect(res.errorMessage).toContain('cannot find symbol');
    expect(mockRunner.destroyedContainers).toContain('mock_c_sub_compile_err');
  });

  it('should return TIMEOUT when execution exceeds time limit', async () => {
    mockRunner.mockExecHandler = (cmd) => {
      if (cmd[2]?.includes('javac')) {
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, oomKilled: false, durationMs: 100 };
      }
      return { exitCode: 124, stdout: '', stderr: '', timedOut: true, oomKilled: false, durationMs: 5000 };
    };

    const res = await service.executeSubmission({
      submissionId: 'sub_timeout',
      zipFilePath: sampleZipPath,
      testCases: [{ id: 'tc1', inputData: '', expectedOutput: '1' }]
    });

    expect(res.outcome).toBe('TIMEOUT');
    expect(res.errorMessage).toContain('timed out');
  });

  it('should return SECURITY_VIOLATION when fork bomb error occurs', async () => {
    mockRunner.mockExecHandler = (cmd) => {
      if (cmd[2]?.includes('javac')) {
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, oomKilled: false, durationMs: 100 };
      }
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'java.lang.OutOfMemoryError: unable to create native thread',
        timedOut: false,
        oomKilled: false,
        durationMs: 200
      };
    };

    const res = await service.executeSubmission({
      submissionId: 'sub_fork_bomb',
      zipFilePath: sampleZipPath,
      testCases: [{ id: 'tc1', inputData: '', expectedOutput: '1' }]
    });

    expect(res.outcome).toBe('SECURITY_VIOLATION');
    expect(res.errorMessage).toContain('PIDs limit');
  });

  it('should return FAILED when test case output does not match expected', async () => {
    mockRunner.mockExecHandler = (cmd) => {
      if (cmd[2]?.includes('javac')) {
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, oomKilled: false, durationMs: 100 };
      }
      return { exitCode: 0, stdout: 'Wrong Output\n', stderr: '', timedOut: false, oomKilled: false, durationMs: 50 };
    };

    const res = await service.executeSubmission({
      submissionId: 'sub_failed_1',
      zipFilePath: sampleZipPath,
      testCases: [{ id: 'tc1', inputData: '1', expectedOutput: 'Correct Output' }]
    });

    expect(res.outcome).toBe('FAILED');
    expect(res.passedTests).toBe(0);
    expect(res.totalTests).toBe(1);
  });

  it('should return COMPILATION_ERROR when no java files exist in submission', async () => {
    const noJavaZip = path.join(tmpDir, 'no_java.zip');
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('hello'));
    zip.writeZip(noJavaZip);

    const res = await service.executeSubmission({
      submissionId: 'sub_no_java',
      zipFilePath: noJavaZip
    });

    expect(res.outcome).toBe('COMPILATION_ERROR');
    expect(res.errorMessage).toContain('No .java source code files found');
  });

  it('should return SECURITY_VIOLATION when OOM killed occurs', async () => {
    mockRunner.mockExecHandler = (cmd) => {
      if (cmd[2]?.includes('javac')) {
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, oomKilled: false, durationMs: 100 };
      }
      return { exitCode: 137, stdout: '', stderr: '', timedOut: false, oomKilled: true, durationMs: 50 };
    };

    const res = await service.executeSubmission({
      submissionId: 'sub_oom',
      zipFilePath: sampleZipPath,
      testCases: [{ id: 'tc1', inputData: '1', expectedOutput: '1' }]
    });

    expect(res.outcome).toBe('SECURITY_VIOLATION');
    expect(res.errorMessage).toContain('Out-Of-Memory');
  });

  it('should return SECURITY_VIOLATION when unauthorized filesystem access is attempted', async () => {
    mockRunner.mockExecHandler = (cmd) => {
      if (cmd[2]?.includes('javac')) {
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, oomKilled: false, durationMs: 100 };
      }
      return { exitCode: 1, stdout: '', stderr: 'permission denied accessing /etc/shadow', timedOut: false, oomKilled: false, durationMs: 50 };
    };

    const res = await service.executeSubmission({
      submissionId: 'sub_unauthorized',
      zipFilePath: sampleZipPath,
      testCases: [{ id: 'tc1', inputData: '1', expectedOutput: '1' }]
    });

    expect(res.outcome).toBe('SECURITY_VIOLATION');
    expect(res.errorMessage).toContain('restricted host/kernel path');
  });

  it('should return COMPILATION_ERROR when zip file path is missing', async () => {
    const res = await service.executeSubmission({ submissionId: 'sub_missing_path' });
    expect(res.outcome).toBe('COMPILATION_ERROR');
    expect(res.errorMessage).toContain('Missing zip file path');
  });
});

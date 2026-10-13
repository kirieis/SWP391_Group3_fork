import fs from 'fs';
import path from 'path';
import { ExecutionLogger } from '../../src/logging/execution-logger';

describe('ExecutionLogger & Log Retention (NFR-18)', () => {
  const tmpLogDir = path.resolve(__dirname, '../../tmp/unit_test_logs');
  let logger: ExecutionLogger;

  beforeAll(() => {
    if (!fs.existsSync(tmpLogDir)) {
      fs.mkdirSync(tmpLogDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpLogDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    logger = new ExecutionLogger(tmpLogDir);
  });

  it('should write execution log record to daily log file', () => {
    logger.logExecution({
      submissionId: 'sub_test_logger',
      language: 'Java',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 150,
      exitCode: 0,
      outcome: 'PASSED',
      resourceUsage: { memoryPeakMb: 512, cpuTimeMs: 150 },
      securityAlert: null,
      passedTests: 3,
      totalTests: 3
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(tmpLogDir, `executions-${dateStr}.log`);

    expect(fs.existsSync(logFilePath)).toBe(true);
    const content = fs.readFileSync(logFilePath, 'utf-8');
    expect(content).toContain('sub_test_logger');
    expect(content).toContain('PASSED');
  });

  it('should prune logs older than retention period', () => {
    const oldLogFile = path.join(tmpLogDir, 'executions-2020-01-01.log');
    fs.writeFileSync(oldLogFile, '{"old": true}\n');

    // Set file modification time to 40 days ago
    const pastTime = (Date.now() - 40 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(oldLogFile, pastTime, pastTime);

    const prunedCount = logger.pruneOldLogs(30);
    expect(prunedCount).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(oldLogFile)).toBe(false);
  });
});

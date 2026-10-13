import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface ExecutionLogRecord {
  submissionId: string;
  assignmentId?: string;
  language: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  exitCode: number;
  outcome: 'PASSED' | 'FAILED' | 'TIMEOUT' | 'SECURITY_VIOLATION' | 'COMPILATION_ERROR';
  resourceUsage: {
    memoryPeakMb?: number;
    cpuTimeMs?: number;
  };
  securityAlert?: string | null;
  passedTests: number;
  totalTests: number;
}

export class ExecutionLogger {
  private logDir: string;

  constructor(logDir = config.LOG_DIR) {
    this.logDir = path.resolve(process.cwd(), logDir);
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Log an execution event into daily audit log file (NFR-18).
   */
  public logExecution(record: ExecutionLogRecord): void {
    try {
      this.ensureLogDir();
      const dateStr = new Date().toISOString().split('T')[0];
      const logFilePath = path.join(this.logDir, `executions-${dateStr}.log`);

      const line = JSON.stringify(record) + '\n';
      fs.appendFileSync(logFilePath, line, 'utf-8');

      logger.info(
        {
          submissionId: record.submissionId,
          outcome: record.outcome,
          durationMs: record.durationMs,
          securityAlert: record.securityAlert
        },
        'Execution audit log recorded'
      );
    } catch (err) {
      logger.error({ err, submissionId: record.submissionId }, 'Failed to write execution log');
    }
  }

  /**
   * Prune logs older than retention days (default 30 days).
   */
  public pruneOldLogs(retentionDays = config.LOG_RETENTION_DAYS): number {
    try {
      if (!fs.existsSync(this.logDir)) return 0;

      const now = Date.now();
      const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(this.logDir);
      let removedCount = 0;

      for (const file of files) {
        if (!file.startsWith('executions-') || !file.endsWith('.log')) continue;

        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        logger.info({ removedCount, retentionDays }, 'Pruned expired execution audit logs');
      }
      return removedCount;
    } catch (err) {
      logger.error({ err }, 'Failed to prune old logs');
      return 0;
    }
  }
}

export const executionLogger = new ExecutionLogger();

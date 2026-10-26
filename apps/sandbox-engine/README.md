# AITA Sandbox Engine

The **Sandbox Engine** is an isolated code execution environment responsible for compiling, executing, and evaluating student code submissions securely against unit test suites.

---

## 1. Architecture & Security Sandbox Design

- **Technology**: Node.js / TypeScript, Docker Engine SDK, RabbitMQ Consumer.
- **Queue Consumer**: Listens to RabbitMQ `submission_queue` for execution jobs (`SUBMISSION_EXECUTE`).
- **Isolation Mechanism**:
  - Ephemeral Docker containers instantiated per submission (`docker run --rm`).
  - Network isolation: `--network none` (strictly disables outbound/inbound network access).
  - Storage limits: Read-only root filesystem with tmpfs mounts limited in size.
  - Resource limits:
    - Memory cap: `--memory 256m` / `--memory-swap 256m` (prevent OOM attacks).
    - CPU limit: `--cpus 1.0` (prevents CPU exhaustion / fork bombs).
    - Execution timeout: Hard timeout kill (default 10s per test case, 30s aggregate).
  - Security Profile: Unprivileged user execution (`user: 1001:1001`), dropping Linux capabilities (`--cap-drop ALL`).

---

## 2. NFR-18 Compliance: Execution Audit Logging & Retention

According to **SRS NFR-18** (*"System must log every sandbox execution in detail... Retain for minimum 30 days"*):

### Implementation Location
- Source code: [`src/logging/execution-logger.ts`](src/logging/execution-logger.ts)
- Unit tests: [`tests/unit/execution-logger.test.ts`](tests/unit/execution-logger.test.ts)

### Audit Record Schema (`ExecutionLogRecord`)
Every execution produces an immutable JSON line entry in `logs/executions-YYYY-MM-DD.log`:
```typescript
{
  "submissionId": "uuid-string",
  "assignmentId": "uuid-string",
  "language": "java",
  "startTime": "2026-10-26T13:00:00.000Z",
  "endTime": "2026-10-26T13:00:02.150Z",
  "durationMs": 2150,
  "exitCode": 0,
  "outcome": "PASSED" | "FAILED" | "TIMEOUT" | "SECURITY_VIOLATION" | "COMPILATION_ERROR",
  "resourceUsage": {
    "memoryPeakMb": 48.5,
    "cpuTimeMs": 1420
  },
  "securityAlert": null | "Fork bomb detected" | "Unauthorized file system access",
  "passedTests": 5,
  "totalTests": 5
}
```

### Log Retention & Auto-Pruning
- Logs are partitioned daily into discrete log files (`executions-YYYY-MM-DD.log`).
- Retention policy: **30 days** (`LOG_RETENTION_DAYS = 30`).
- Automated pruning: Triggered on engine startup and scheduled cron sweep (`executionLogger.pruneOldLogs()`). Files older than 30 days are safely deleted to conserve storage while maintaining regulatory compliance.

---

## 3. Supported Languages & Runtimes

- **Java**: OpenJDK 17 LTS + JUnit 5 Console Runner.
- **Python**: Python 3.11 + pytest (roadmap).
- **C/C++**: GCC 12 + GoogleTest (roadmap).

---

## 4. Running Locally

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run sandbox engine in development mode
npm run dev
```

# Module 5 — Queue Worker Integration Contract

> **Version**: 0.1.0 (Milestone 2)  
> **Service**: `@aita/queue-worker`  
> **Port**: N/A (background worker, no HTTP server)  
> **Queue**: `submission-grading` (BullMQ / Redis)

---

## 1. Job Payload Schema

Module 1 (API Gateway) enqueues jobs with this payload when a student submits code via `POST /api/submissions`.

```typescript
interface SubmissionJobPayload {
  submissionId: string;   // UUID — used as BullMQ jobId for idempotency
  assignmentId: string;   // UUID of the assignment
  studentId: string;      // UUID of the student
  language: string;       // e.g. "java", "python"
  fileRelativePath: string; // Path relative to API root, e.g. "uploads/submissions/sub_xxx.zip"
  submittedAt: string;    // ISO 8601 datetime
}
```

### Enqueue Example (from Module 1)

```typescript
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis({ host: 'localhost', port: 6379 });
const queue = new Queue('submission-grading', { connection });

await queue.add('grade', {
  submissionId: 'abc-123',
  assignmentId: 'assign-456',
  studentId: 'student-789',
  language: 'java',
  fileRelativePath: 'uploads/submissions/sub_20261005_abc123.zip',
  submittedAt: '2026-10-05T09:00:00.000Z',
}, {
  jobId: 'abc-123',  // MUST equal submissionId for idempotency
});
```

---

## 2. Module 1 Callback API

Module 5 reports progress by calling Module 1's internal endpoint.

| Field | Type | Description |
|-------|------|-------------|
| **Endpoint** | `PATCH /api/submissions/:submissionId/result` | |
| **Auth** | Header `x-internal-key: <INTERNAL_API_KEY>` | Default: `aita_internal_secret_key_2026` |

### Callback Body

```typescript
interface Module1CallbackBody {
  status: 'RUNNING_TESTS' | 'GRADED' | 'COMPILATION_ERROR' | 'TIMEOUT' | 'SECURITY_VIOLATION';
  step: 'QUEUED' | 'BUILDING' | 'RUNNING_TESTS' | 'AST_ANALYSIS' | 'AI_REVIEW' | 'COMPLETE';
  progressPercent: number;  // 0-100
  message: string;
  totalScore?: number;      // 0-10 scale, only on final callback
}
```

### Callback Sequence (Happy Path)

| Step | status | step | progressPercent | totalScore |
|------|--------|------|-----------------|------------|
| 1 | `RUNNING_TESTS` | `RUNNING_TESTS` | 25 | — |
| 2 | `RUNNING_TESTS` | `AST_ANALYSIS` | 65 | — |
| 3 | `GRADED` | `COMPLETE` | 100 | 0-10 |

### Callback Sequence (Terminal Sandbox Outcome)

| Step | status | step | progressPercent | totalScore |
|------|--------|------|-----------------|------------|
| 1 | `RUNNING_TESTS` | `RUNNING_TESTS` | 25 | — |
| 2 | `TIMEOUT` / `SECURITY_VIOLATION` / `COMPILATION_ERROR` | `COMPLETE` | 100 | 0 |

> **Note**: Terminal sandbox outcomes complete the job immediately — AST analysis is **skipped**.

---

## 3. Module 2 (Sandbox) Contract

| Field | Value |
|-------|-------|
| **URL** | `http://localhost:5001` |
| **Endpoint** | `POST /execute` |
| **Timeout** | 120 seconds |

### Request

```typescript
interface SandboxRequest {
  submissionId: string;
  assignmentId: string;
  language: string;
  fileRelativePath: string;
}
```

### Response

```typescript
interface SandboxResponse {
  outcome: 'PASSED' | 'FAILED' | 'TIMEOUT' | 'SECURITY_VIOLATION' | 'COMPILATION_ERROR';
  passedTests: number;
  totalTests: number;
  executionTimeMs: number;
  output?: string;
  errorMessage?: string;
}
```

---

## 4. Module 4 (AST Engine) Contract

| Field | Value |
|-------|-------|
| **URL** | `http://localhost:8001` |
| **Endpoint** | `POST /analyze` |
| **Timeout** | 30 seconds |

### Request

```typescript
interface AstAnalysisRequest {
  submissionId: string;
  assignmentId: string;
  language: string;
  fileRelativePath: string;
}
```

### Response

```typescript
interface AstAnalysisResponse {
  similarityPercent: number;   // 0-100
  message: string;
  syntaxError?: boolean;
  matchedSubmissions?: Array<{ submissionId: string; similarityPercent: number }>;
}
```

### Plagiarism Thresholds

| Level | Threshold | Action |
|-------|-----------|--------|
| Clean | < 30% | No action |
| Warning | >= 30% | Logged |
| Danger | >= 60% | Flagged as `SUSPICIOUS` |

> **Non-blocking**: If AST service is down or reports syntax errors, plagiarism is marked as `SKIPPED` and grading proceeds normally.

---

## 5. Error Classification

| Category | Trigger | BullMQ Behavior |
|----------|---------|-----------------|
| **Infrastructure** | Network error, ECONNREFUSED, 5xx, 429 | Throw → retries (4 attempts, exponential 2s/4s/8s) |
| **Business Outcome** | TIMEOUT, SECURITY_VIOLATION, COMPILATION_ERROR | Report to Module 1, complete job, **no retry** |
| **Validation** | Invalid payload, 4xx (except 429) | `UnrecoverableError` → **no retry**, report failure |

### Retry Exhaustion Safety Net

If all 4 attempts fail, the worker sends a final callback to Module 1 with `status: "COMPILATION_ERROR"` and `step: "COMPLETE"` to prevent submissions from hanging in `RUNNING_TESTS` forever.

---

## 6. Queue Configuration

```
Queue Name:        submission-grading
Default Attempts:  4 (1 initial + 3 retries)
Backoff:           exponential, 2000ms base (2s → 4s → 8s)
RemoveOnComplete:  keep last 100
RemoveOnFail:      keep last 500
Concurrency:       WORKER_CONCURRENCY env (default: 5)
```

---

## 7. Git Analytics (US-11)

Standalone service — not part of the grading pipeline.

### Method

```typescript
analyzeRepository(repoUrl: string): Promise<GitAnalyticsResult>
```

### Response

```typescript
interface GitAnalyticsResult {
  repository: string;           // "owner/repo"
  totalCommits: number;
  memberStats: Array<{
    author: string;
    commits: number;
    additions: number;
    deletions: number;
  }>;
  analyzedAt: string;           // ISO 8601
}
```

### Notes
- Uses GitHub REST API (public, no auth required)
- Rate-limited to 60 req/hour without a token
- Falls back to mock data if API is unreachable

---

## 8. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis server host |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_PASSWORD` | _(empty)_ | Redis password |
| `REDIS_DB` | `0` | Redis database index |
| `WORKER_CONCURRENCY` | `5` | Number of concurrent job processors |
| `API_GATEWAY_URL` | `http://localhost:5000` | Module 1 base URL |
| `INTERNAL_API_KEY` | `aita_internal_secret_key_2026` | Auth key for Module 1 callback |
| `SANDBOX_URL` | `http://localhost:5001` | Module 2 base URL |
| `AST_ENGINE_URL` | `http://localhost:8001` | Module 4 base URL |
| `USE_MOCKS` | `false` | Use in-memory mock clients |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | Environment name |

---

## 9. Task 3: Deadline Enforcement & Classification

### Deadline Verification in Worker
Before initiating Sandbox execution, the Worker verifies submission timeliness:
1. If `job.data.deadline` is present, it directly compares `submittedAt > deadline`.
2. Otherwise, calls Module 1: `GET /api/assignments/:assignmentId/deadline-check`.
3. If deadline is exceeded:
   - Status: `DEADLINE_EXCEEDED`
   - Step: `COMPLETE` (100%)
   - Sandbox, AST, and GenAI steps are completely bypassed.
   - Total score: `0`

### Unsubmitted Students (N/A Status)
- For ended assignments, students who made 0 submissions are flagged with status: `NOT_SUBMITTED`.
- Lecturer dashboard categorizes assignments into:
  - `ACTIVE`: Deadline is in the future.
  - `ENDED`: Deadline is in the past.

---

## 10. Task 5: Existing Assignments Query & Class Filtering

### Query Endpoint Contract
- Endpoint: `GET /api/assignments`
- Query Parameters:
  - `classIds`: Comma-separated list of class IDs (e.g., `class-1,class-2`) to filter assignments created across multiple classes.
  - `classId`: Single class filter.
  - `status`: `ACTIVE` | `ENDED` | `ALL`.
  - `search`: Case-insensitive title/description search.

### Response
```typescript
interface AssignmentQueryResponse {
  success: boolean;
  data: AssignmentItem[];
  total: number;
}
```


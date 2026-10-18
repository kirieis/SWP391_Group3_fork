# Module 5 — Queue Worker & Git Analytics Contract Specification

> **Module**: 5 — Queue Worker & Git Analytics Engine  
> **Workspace**: `@aita/queue-worker`  
> **Target Framework**: Node.js 20, TypeScript 5.6+, BullMQ 5.12+, Redis 7  
> **Architecture Role**: Orchestrator (stateless worker engine; never writes directly to DB; never hosts WebSocket server; delegates all DB persistence and client WebSocket broadcasts to Module 1 API Gateway).

---

## 1. Scope & System Architecture

```
                       ┌─────────────────────────┐
                       │   Client UI (Next.js)   │
                       └────────────┬────────────┘
                                    │ HTTP / WebSocket (Module 1)
                                    ▼
                       ┌─────────────────────────┐
                       │   Module 1: API Gateway │
                       └─────┬──────────────┬────┘
           Enqueue Jobs      │              │ Enqueue Analytics
           (producer.ts)     ▼              ▼
                    ┌──────────────────────────────┐
                    │       Redis 7 (BullMQ)       │
                    │  - submission-grading (p=1)  │
                    │  - batch-grading (p=5)       │
                    │  - ai-review-retry (delayed) │
                    │  - git-analysis (p=2)        │
                    └──────────────┬───────────────┘
                                   │ Job Consumption
                                   ▼
         ┌──────────────────────────────────────────────────┐
         │       Module 5: Queue Worker & Git Analytics     │
         │  ┌────────────────────┐  ┌─────────────────────┐ │
         │  │ Submission Worker  │  │ Git Analytics Worker│ │
         │  └─────────┬──────────┘  └──────────┬──────────┘ │
         └────────────┼────────────────────────┼────────────┘
                      │                        │
       Orchestrates Steps:                     │ Clones & Analyzes:
       1. Sandbox Engine (Module 3)            │ - Isolated Git CLI
       2. AST Plagiarism (Module 4)            │ - Ignore rules (lockfiles)
       3. GenAI Review (Module 2)              │ - Author identity mapping
                      │                        │ - Contribution calculation
                      ▼                        ▼
       Callbacks via HTTP PATCH ───────────────┘
       (Module 1 Gateway /api/submissions/:id/result & /api/git-analysis/:id/result)
```

---

## 2. Queue Names & Job IDs

| Queue Name | Priority | Concurrency | Limiter | Purpose | Job ID Format |
|---|---|---|---|---|---|
| `submission-grading` | 1 (high) | `WORKER_CONCURRENCY` (default 5) | None | Standard & manual re-grade submissions | Normal: `${submissionId}`<br>Re-grade: `${submissionId}:${gradingRunNo}` |
| `batch-grading` | 5 (low) | `BATCH_CONCURRENCY` (default 2) | max 10 jobs / 1000ms | Lecturer batch re-grading | `${submissionId}:batch:${batchId}` |
| `ai-review-retry` | 3 (mid) | 2 | None | Delayed retries when GenAI is temporarily unavailable | `retry:genai:${submissionId}` |
| `git-analysis` | 2 (normal) | `GIT_CONCURRENCY` (default 3) | None | US-11 Git contribution & free-rider analysis | `git:${analysisId}` |

---

## 3. Submission Grading Contracts

### 3.1 Input Payload (`SubmissionJobInput`)
```typescript
interface SubmissionJobInput {
  submissionId: string;
  sourceCode: string;
  language: "java" | "python" | "c" | "cpp";
  assignmentId?: string;
  gradingRunNo?: number;    // incremented on re-grade (e.g. 2, 3...)
  batchId?: string;         // lecturer batch execution ID
  reason?: string;          // reason for re-grade
  studentId?: string;
  testCases?: Array<{
    input: string;
    expectedOutput: string;
    weight?: number;
  }>;
  checkpoint?: {            // persists progress across transient retries
    step: "SANDBOX" | "PLAGIARISM" | "GENAI" | "COMPLETE";
    sandboxResult?: SandboxExecutionResult;
    plagiarismResult?: PlagiarismCheckResult;
  };
}
```

### 3.2 Six-Step UI Progress Stepper
Each step triggers an HTTP PATCH callback to Module 1 with `step`, `progressPercent`, and descriptive `message`:
1. `QUEUED` (0%) — Job picked up by worker
2. `SANDBOX` (20%) — Source code executing in isolated sandbox
3. `AST_CHECK` (40%) — Plagiarism analysis via AST Winnowing
4. `GENAI_REVIEW` (60%) — AI code style & clean code review
5. `AGGREGATING` (80%) — Total score calculation & verdict aggregation
6. `COMPLETE` (100%) — Final result persists in DB, ready for UI display

### 3.3 Terminal Statuses
- `GRADED`: All steps completed successfully.
- `COMPILATION_ERROR`: Sandbox reported build error (GenAI generates explanatory feedback for student).
- `RUNTIME_ERROR`: Unhandled exception or test case crash during execution.
- `TIME_LIMIT_EXCEEDED`: Execution exceeded sandbox timeout.
- `MEMORY_LIMIT_EXCEEDED`: Execution exceeded sandbox memory limit.
- `AI_REVIEW_PENDING`: GenAI service was temporarily unavailable (circuit breaker / 5xx). Final grade saved; background retry scheduled.
- `FAILED`: Fatal unrecoverable error or retries exhausted.

---

## 4. US-11 Git Analytics Engine Contract

### 4.1 Input Payload (`GitAnalysisJobInput`)
```typescript
interface GitAnalysisJobInput {
  analysisId: string;
  projectId: string;
  repoUrl: string;               // Must be https://github.com/... or https://gitlab.com/...
  branch?: string;              // default: 'main'
  members: Array<{
    studentId: string;
    name: string;
    emails: string[];
    githubUsernames: string[];
  }>;
  requestedBy: string;          // Lecturer/Admin userId
}
```

### 4.2 State Machine Transitions
```
                ┌─────────┐
                │ QUEUED  │ (0%)
                └────┬────┘
                     ▼
                ┌─────────┐
                │ CLONING │ (20%)
                └────┬────┘
                     ▼
           ┌─────────────────┐
           │ PARSING_COMMITS │ (40%)
           └─────────┬───────┘
                     ▼
           ┌─────────────────┐
           │ CALCULATING_LOC │ (60%)
           └─────────┬───────┘
                     ▼
              ┌────────────┐
              │ EVALUATING │ (80%)
              └──────┬─────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
  ┌───────────┐      ┌─────────────────────┐
  │ COMPLETED │      │ FREE_RIDER_DETECTED │ (100%)
  └───────────┘      └─────────────────────┘
         ▲
         │ (if any step fails)
         ▼
     ┌────────┐
     │ FAILED │ (100%)
     └────────┘
```

### 4.3 Evaluation Rules
1. **Low Activity Guard**: If `totalCommits < 5`, `lowActivity = true` and `freeRiderDetected = false` (avoids false-positives on nascent repos).
2. **Threshold**: A student is flagged as a `freeRider` if `percentage < 5.0%` of effective team LOC.
3. **Ignore Patterns**: Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), build dist folders (`dist/`, `build/`, `target/`), and minified bundles are excluded from LOC metrics.
4. **Unmapped Commits**: Commits not matching registered student emails/usernames are collected in `unmappedCommits` for audit.

---

## 5. Teammate Confirmations & Assumptions

| Tag | Topic | Details / Working Assumption |
|---|---|---|
| `[ASSUMPTION]` | Callback Endpoints | Module 1 exposes `PATCH /api/submissions/:id/result` and `PATCH /api/git-analysis/:id/result`. Internal authorization is verified with header `x-internal-api-key`. |
| `[ASSUMPTION]` | Redis Configuration | Redis is configured with `--maxmemory-policy noeviction`. BullMQ relies on this to ensure jobs and streams are never silently evicted. |
| `[ASSUMPTION]` | Git Isolation | Container running queue-worker has git 2.38+ installed. All clones use `--bare --filter=blob:none` into ephemeral directories removed on exit. |
| `[ASSUMPTION]` | GenAI Circuit Breaker | When GenAI fails (status 429/500/503/504), submission is marked `AI_REVIEW_PENDING` with full sandbox scores intact, and enqueued to `ai-review-retry` with exponential delay. |

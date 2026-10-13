# Project Context: AITA-INTELLIGENT — Module 5 (Redis Queue & Git Analytics)
 
Scope for Milestone 3 (Weeks 6-8):
1. **Full End-to-End Orchestration**: Queue -> Sandbox (Module 2) -> AST (Module 4) -> GenAI (Module 3) -> Callback to Module 1.
2. **Batch Grading Queue**: Asynchronous class-wide grading queue (`batch-grading`) with rate limiter and lower priority/concurrency.
3. **Git Analytics Engine (US-11)**: Clone/fetch, parse commits, calculate LOC, identity mapping, free-rider detection (< 5%), state machine.
4. **Testing, Hardening & Deployment**: >= 80% coverage, CI workflow, Dockerfile, deployment docs, self-UAT.

## Architecture & Monorepo Structure
- Root workspace: Monorepo with `apps/api`, `apps/ast-engine`, `apps/sandbox-engine`, `apps/web`.
- This module lives inside: `apps/queue-worker/` (or structured under `apps/api/src/queue` & `apps/api/src/worker`).

## Teammates & Fixed Integration Contracts
- **An (Module 1 - API Gateway & Portal)**:
  - Produces jobs into BullMQ queue `submission-grading` when students call `POST /api/submissions`.
  - Stored files location: `apps/api/uploads/submissions/sub_<timestamp>_<randomHex>.zip`.
  - Callback Endpoint: `PATCH /api/submissions/:submissionId/result`.
  - Auth Header: `x-internal-key: <INTERNAL_API_KEY>` (Default in env: `aita_internal_secret_key_2026`).
  - Fixed Allowed Status Enum in DB: `["PENDING", "QUEUED", "RUNNING_TESTS", "GRADED", "COMPILATION_ERROR", "TIMEOUT", "SECURITY_VIOLATION"]`.
  - Progress Stepper Steps: `["QUEUED", "BUILDING", "RUNNING_TESTS", "AST_ANALYSIS", "AI_REVIEW", "COMPLETE"]`.
- **Thiên (Module 2 - Docker Sandbox)**:
  - Docker container execution via Dockerode. Standalone HTTP service (`http://localhost:5001`).
  - Business outcomes: `TIMEOUT`, `SECURITY_VIOLATION`, `COMPILATION_ERROR`, or `PASSED`/`FAILED` with score.
- **Nhật (Module 4 - AST Plagiarism Engine)**:
  - Python FastAPI service (`http://localhost:8001`).
  - Endpoint: `POST /analyze`. Thresholds: Warning >= 30%, Danger >= 60% (`PLAGIARISM_DETECTED`).
  - Optional non-blocking step: If AST service is down or code has syntax errors, report `SKIPPED`. Never fail the whole job.

## Hard Rules when Editing Code
1. **Never invent endpoints or field names**: All contracts live in `src/contracts/` using Zod schemas and TypeScript types.
2. **Never write directly to MSSQL Database**: Module 5 only reports progress via Module 1's callback API.
3. **Mock Client First**: Every client (`module1.client.ts`, `sandbox.client.ts`, `ast.client.ts`) must have a corresponding mock implementation switchable via `USE_MOCKS=true`.
4. **Error Classification Semantics**:
   - *Infrastructure Error* (Network, connection refused, 5xx, 429) -> Throw -> BullMQ retries with exponential backoff.
   - *Business Outcome* (`TIMEOUT`, `SECURITY_VIOLATION`, `COMPILATION_ERROR`) -> NOT an error. Report to Module 1, complete job immediately, DO NOT call AST.
   - *Validation Error* (Corrupt payload, 4xx other than 429) -> `UnrecoverableError` -> Do not retry, report failure to Module 1.
5. **Idempotency**: Always set `jobId = submissionId`. Re-enqueuing the same submission must not create duplicate processing.
6. **Logging**: Structured logging via `pino`. Never log raw source code or secrets. Always include `submissionId` and `jobId`.
7. **Quality**: TypeScript strict mode. Pass ESLint and Prettier with zero warnings.

## Output Style
Give a short design plan first, then code. Clearly list any open questions at the end.

## UPDATE — Milestone 3 (Weeks 6-8) Scope & Rules

### Full Pipeline (Module 5 is the ORCHESTRATOR only)
Module 1 enqueues -> Worker -> Module 2 Sandbox -> Module 4 AST -> Module 3 GenAI -> Module 5 calls Module 1 callback API.
- Module 5 NEVER writes to the database directly and NEVER runs a WebSocket server. Module 1 receives callbacks and emits WebSocket events to the UI.
- Every pipeline step change must be reported to Module 1 via callback so the UI stepper stays in sync. Status names come ONLY from `src/contracts/status.contract.ts`.

### Team Contracts in Milestone 3
- **An (Module 1)**: owns Submission, Prisma/MSSQL, WebSocket, Lecturer Dashboard. Module 5 reports status, receives repo URLs/members, and sends Git reports.
- **Thiên (Module 2)**: Sandbox result format. Business outcomes `TIMEOUT`, `SECURITY_VIOLATION`, `COMPILATION_ERROR` are NOT errors and must never be retried.
- **Nhật (Module 4)**: AST receives Java source (after Sandbox succeeded). AST is OPTIONAL: failure or unparsable code => `SKIPPED`, pipeline continues. Similarity > 60% => withhold-score flag.
- **Huy (Module 3)**: GenAI Gateway handles multi-provider fallback. Module 5 calls the gateway with a per-step timeout. On failure, report sandbox + AST results, set `AI_REVIEW_PENDING`, and schedule delayed retry.

### Orchestration Rules
1. **Checkpointing**: Persist results into `job.updateData()` after each step. Retries resume from the failed step. Never re-run Sandbox after GenAI failure.
2. **Stop Rules**: `SECURITY_VIOLATION` / `TIMEOUT` => skip AST & GenAI. `COMPILATION_ERROR` => call GenAI ONLY for Vietnamese compile-error explanation (NFR-17) if available; skip AST.
3. **GenAI Failure**: Never leave job stuck in `AI_REVIEW`. Send sandbox + AST results to Module 1 with `AI_REVIEW_PENDING` and schedule delayed retry (`ai-review-retry`).
4. **Job Identity**: `jobId = submissionId` for first grading. Re-grades use `${submissionId}:${gradingRunNo}` [ASSUMPTION], with `reason: INITIAL | REGRADE | BATCH`.
5. **Batch Grading**: Separate queue `batch-grading` with lower priority/concurrency and rate limiter. Module 1 enqueues with `addBulk` and returns 202 immediately.
6. **Timeouts**: Per-step timeouts (`SANDBOX_TIMEOUT_MS`, `AST_TIMEOUT_MS`, `GENAI_TIMEOUT_MS`) + overall `PIPELINE_TIMEOUT_MS` from env.
7. **Redis Memory Policy**: Check `maxmemory-policy noeviction` on startup and warn loudly if wrong.

### Git Analytics (US-11) Rules
- Separate queue `git-analysis` and processor.
- State machine: `CLONING` -> `PARSING_COMMITS` -> `CALCULATING_LOC` -> `EVALUATING` -> `COMPLETED` | `FREE_RIDER_DETECTED` | `FAILED`.
- Free-rider rule: contribution share < 5% => flag member (`computeContributionShare`).
- **Security**:
  - `execFile`/`spawn` with argument arrays only. NEVER shell interpolation.
  - Strict URL validation: HTTPS only, allowlist `github.com`, no credentials, no options injection (`--upload-pack`), `--` passed before URL.
  - Safe environment: `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`, `GIT_CONFIG_NOSYSTEM=1`, `-c core.hooksPath=/dev/null`, `-c protocol.file.allow=never`.
  - Clone into unique temp dir and always clean up in `finally`.
  - Errors like invalid URL, repo not found/private, empty repo, over-size report `FAILED` with clear reason code and do NOT crash or retry.
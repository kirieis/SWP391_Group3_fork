# Milestone 3 — Phân hệ 5 (Redis Queue & Teamwork Analytics): Bộ prompt hoàn chỉnh

Phạm vi Tuần 6-8 của Thịnh (theo task file):

1. Điều phối end-to-end: Queue → Sandbox (P2) → AST (P4) → GenAI (P3) → cập nhật qua API Module 1 → Module 1 emit WebSocket.
2. Queue chấm hàng loạt (batch) không block API Gateway.
3. Git Analytics (US11, chống free-riding): clone/fetch, đọc commit, tính commit + LOC theo thành viên, state machine 6.4.3, cờ `FREE_RIDER_DETECTED` khi đóng góp < 5%.
4. Unit test (góp phần coverage ≥ 80%), UAT, deploy thật.

Thứ tự dùng:

| Bước | Nội dung | Dán vào đâu |
|---|---|---|
| A | Cập nhật rules file (thêm phần Milestone 3) | Rules file của AI IDE |
| B0 | Prompt kiểm tra code Milestone 2 còn lại | AI IDE (chạy trước) |
| B1 | Điều phối end-to-end + batch | AI IDE |
| B2 | Git Analytics | AI IDE (sau B1, hoặc song song nếu có hợp đồng với An) |
| B3 | Test, hardening, deploy, tự UAT | AI IDE (cuối) |
| C | Tin nhắn chốt hợp đồng | Gửi An, Thiên, Huy, Nhật |

> Quy ước giữ nguyên Milestone 2: `[ASSUMPTION]` = giả định tạm của Thịnh, chưa ai xác nhận. Khi bạn kia chốt thì sửa đúng 1 chỗ trong `src/contracts/` rồi bỏ nhãn.

---

## PHẦN A — Cập nhật rules file cho AI IDE

Mở rules file đã có từ Milestone 2 (`CLAUDE.md` / `AGENTS.md` / `.cursor/rules/...`). **Sửa dòng Scope** và **thêm khối dưới đây vào cuối** (đừng xóa các luật cũ về contracts, clients, mocks, error semantics).

````markdown
## UPDATE — Milestone 3 (Weeks 6-8) scope
Scope is now: (1) full end-to-end orchestration including GenAI (Module 3), (2) batch grading queue, (3) Git Analytics (US11), (4) unit tests to support >=80% coverage, (5) real deployment.
Milestone 2 rules above still apply. Do not rewrite working Milestone 2 code; extend it.

## Full pipeline (Module 5 is the ORCHESTRATOR only)
Module 1 enqueues -> Worker -> Module 2 Sandbox -> Module 4 AST -> Module 3 GenAI -> Module 5 calls Module 1 callback API.
- Module 5 NEVER writes to the database directly and NEVER runs a WebSocket server. Module 1 receives my callback and emits WebSocket events to the UI.
- Every pipeline step change must be reported to Module 1 via the callback so the UI stepper (6 steps, owned by An) stays in sync. Status names come ONLY from `src/contracts/status.contract.ts`.

## Team contracts that matter in Milestone 3
- An (Module 1): owns Submission, Prisma/MSSQL, WebSocket, Lecturer Dashboard, SCORE_AUDIT_LOGS, Appeals. I need from An: final status list + the 6 UI stepper steps, callback API, how the GitHub repo URL and team members (name, student id, git emails/usernames) reach me, where Git contribution reports are stored (new tables are An's decision), and bulk/batch and re-grade (appeal) payloads.
- Thiên (Module 2): Sandbox result format must match what Module 1 stores. Business outcomes `TIMEOUT`, `SECURITY_VIOLATION`, `COMPILATION_ERROR` are NOT errors and must never be retried.
- Nhật (Module 4): AST receives the Java source (after Sandbox succeeded). AST remains OPTIONAL: failure or unparsable code => AST result `SKIPPED`, pipeline continues. Similarity > 60% => withhold-score flag (exact flag name from his contract).
- Huy (Module 3): GenAI Gateway does its own multi-provider fallback with an internal time cap (NFR-07). I do NOT implement provider fallback, API keys, or prompts. I only call his gateway/API, with a per-step timeout, and handle its failure (see below).

## Orchestration rules
1. Checkpointing: after each step succeeds, persist its result into job data (`job.updateData`) so a retry resumes at the failed step. A retry after GenAI failure must NOT re-run the Sandbox (expensive, and may re-execute untrusted code).
2. Stop rules: `SECURITY_VIOLATION` / `COMPILATION_ERROR` / `TIMEOUT` => skip AST. COMPILATION_ERROR => call GenAI ONLY for the Vietnamese compile-error explanation (NFR-17) if Huy's contract exposes it; otherwise skip. Never let a failure here block reporting the sandbox result.
3. GenAI failure (all providers down / gateway timeout / 429 exhaustion): the submission must NEVER stay stuck in `REVIEWING_AI`. Report the sandbox + AST results first, then set an "AI Review Pending" status (exact name from contract) and schedule a delayed retry job (`ai-review-retry`). Do not fail the whole grading.
4. Job identity: `jobId = submissionId` is only valid for the first grading. Re-grade (accepted appeal, US05) and batch re-grade need a new identity, e.g. `${submissionId}:${gradingRunNo}` [ASSUMPTION], plus `reason: INITIAL | REGRADE | BATCH`. Never silently drop a re-grade because an old completed job exists.
5. Batch grading uses a SEPARATE queue (`batch-grading`) with lower priority/concurrency and a rate limiter, so grading a whole class never starves single submissions and never blocks the API Gateway. Producer API is `addBulk`; Module 1 returns 202 immediately and never waits.
6. Per-step timeouts + one overall pipeline timeout, all from env. No unbounded await anywhere.
7. BullMQ requires Redis `maxmemory-policy noeviction`. Check this on startup and warn loudly if wrong.

## Git Analytics (US11) rules
- It is a SEPARATE queue (`git-analysis`) and separate processor from grading. A slow clone must never delay grading.
- State machine (SRS 6.4.3), reported to Module 1 on every transition: `CLONING` -> `PARSING_COMMITS` -> `CALCULATING_LOC` -> `EVALUATING` -> `COMPLETED` | `FREE_RIDER_DETECTED`. Extra terminal state `FAILED` with a reason code [ASSUMPTION].
- Free-rider rule: a member's contribution < 5% => flag that member (threshold from env, default 5). The exact contribution formula is NOT confirmed (see open items); implement it behind a single pure function `computeContributionShare()` and a documented config.
- SECURITY (the repo URL is untrusted input from a user):
  - Use `execFile`/`spawn` with an argument array. NEVER build shell strings. NEVER use `exec` with interpolated URL.
  - Validate URL with a strict parser: https only, host allowlist (default `github.com`), no credentials in URL, no `file:`, `ssh:`, `git:` or local paths, no `--` style values that could be read as git options (always pass `--` before the URL).
  - Environment for every git call: `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`, `GIT_CONFIG_NOSYSTEM=1`, `-c core.hooksPath=/dev/null`, `-c protocol.file.allow=never`. Never run repo code, hooks, or submodule updates.
  - Hard limits from env: clone timeout, max repo size, max commits. Clone into a unique temp dir and ALWAYS delete it in `finally`.
  - Never log tokens or full URLs with credentials.
- Errors that must NOT crash the job and must NOT be retried: invalid URL, repo not found / no access (private), empty repo, over-size. Report `FAILED` + clear reason code to Module 1 so the lecturer sees a readable message. Network/timeouts ARE retryable.
- Parsing: use `git log --numstat --no-merges` with a machine-parseable `--pretty` format. Handle binary files (`-` in numstat), renames, and exclude lockfiles/generated/vendor paths via a configurable ignore list. Map git author identities to students through the member list from Module 1 (email + username aliases, case-insensitive); keep commits of unmapped authors in an `UNMAPPED` bucket and report it, never drop it silently.

## Testing and quality
- vitest with coverage thresholds >= 80% (lines, branches, functions) enforced in config. Pure logic (state machine, contribution share, numstat parser, classifyError, URL validator) must be pure functions with tests.
- Git parser tests create real temporary git repos in the test (git init, commits with different authors) instead of mocking git output only.
- ESLint + Prettier zero warnings. No `console.log`.

## Open contract items for Milestone 3 (blocking — mark as [ASSUMPTION] until checked)
- [ ] An: final status list + 6 stepper steps mapping + callback payload for each step
- [ ] An: batch and re-grade (appeal) enqueue payload; who generates `batchId` / `gradingRunNo`
- [ ] An: how repo URL + members (emails/usernames) reach me; where Git reports are stored (tables, API); how the lecturer dashboard reads them
- [ ] Huy: GenAI endpoint(s), request/response (clean code score 0-100, Vietnamese feedback, compile-error explanation), failure format, his internal time cap
- [ ] Thiên: final Sandbox result format, sync vs polling, who cleans up the source files
- [ ] Nhật: final AST request/response including the withhold flag name and error format
- [ ] Lecturer/SRS: exact contribution formula for the 5% rule
- [ ] Shared: Azure/AWS target, managed Redis (TLS `rediss://`), who deploys what
````

---

## PHẦN B0 — Prompt kiểm tra hiện trạng (chạy trước)

````markdown
Read the project rules file first and follow it. Do NOT write any new feature yet.

Audit the existing Module 5 code from Milestone 2 against the Milestone 3 scope in the rules file and report:
1. What already exists (queue, worker, clients, mocks, contracts, tests) and whether it compiles, lints and passes tests (run them).
2. Gaps versus the rules: checkpointing on retry, stop rules, GenAI step, batch queue, re-grade job identity, git-analysis queue, coverage thresholds, Redis noeviction check.
3. Anything in the code that still hardcodes a URL, status string or field name outside `src/contracts/` or `src/config.ts`.
4. Every `[ASSUMPTION]` and `TODO(contract)` currently in the repo, grouped by teammate (An, Thiên, Nhật, Huy), plus whether the teammate's real code in this repo (if present) now contradicts it. Read the other modules' code ONLY to check contracts; do not edit it.
5. A short ordered implementation plan for Milestone 3 with risks.

Output a concise report. Do not change files.
````

---

## PHẦN B1 — Prompt chính: điều phối end-to-end + batch

````markdown
Read the project rules file first and follow it strictly. Extend the existing Module 5 code from Milestone 2; do not rewrite what works.

## Goal
Complete the end-to-end grading orchestration: Module 1 enqueues -> Sandbox (Module 2) -> AST (Module 4) -> GenAI (Module 3) -> callback to Module 1 (which emits WebSocket). Add a batch-grading queue that never blocks the API Gateway.

## Tech stack (unchanged)
Node.js 20, TypeScript strict, bullmq + ioredis, axios, zod, pino, vitest, ESLint + Prettier (zero warnings).

## Pipeline per job
1. Validate payload (zod contract). Payload now also carries `reason: INITIAL | REGRADE | BATCH`, optional `batchId`, and `gradingRunNo` [ASSUMPTION].
2. Step SANDBOX -> callback status for "sandbox running"; call Sandbox; on result persist checkpoint.
   - TIMEOUT / SECURITY_VIOLATION: report final status, finish as success, skip AST and GenAI.
   - COMPILATION_ERROR: report final status; call GenAI only for Vietnamese compile-error explanation if the contract exposes it (failure here is non-fatal); skip AST.
3. Step AST -> callback "checking plagiarism"; call AST; persist checkpoint. Failure or unparsable code => result SKIPPED, warning logged, continue. Similarity above the threshold => attach the withhold flag from the contract.
4. Step GENAI -> callback `REVIEWING_AI`; call GenAI gateway with source, language, sandbox summary (not full stdout dumps); persist checkpoint. Expect clean-code score 0-100 and Vietnamese feedback.
   - GenAI failure after the gateway's own fallback: do NOT fail the job. Send the sandbox + AST results to Module 1 with the "AI Review Pending" status and add a delayed `ai-review-retry` job (delay and max rounds from env).
5. Final callback to Module 1 with the combined result and final status. Module 1 handles scoring display and WebSocket.
6. On resume after retry, skip steps that already have a checkpoint.

## Requirements
1. Keep `classifyError` semantics: infrastructure error => retry (exponential backoff); business outcomes => success; validation => UnrecoverableError. Extend it with a `GenAiUnavailableError` mapped to the "AI Review Pending" path (not a retry of the whole job).
2. Queues: `submission-grading` (interactive, higher priority) and `batch-grading` (bulk, lower concurrency, BullMQ `limiter`, lower priority). Both use the SAME processor function. Provide `enqueueSubmission()` and `enqueueBatch(payloads)` using `addBulk`, returning immediately. Job id strategy per rules (never drop a re-grade).
3. Batch progress: expose a small function `getBatchProgress(batchId)` (counts of waiting/active/completed/failed) that Module 1 can call or expose [ASSUMPTION: transport TBD with An]. Do not build an HTTP server unless the contract says so; if one is needed, keep it minimal (health + batch progress) and say so.
4. Clients: add `genai.client.ts` + mock (mock can simulate success, partial outage, total outage, slow response). Update module1 client for the new statuses and the checkpointed combined result. All timeouts from env: `SANDBOX_TIMEOUT_MS`, `AST_TIMEOUT_MS`, `GENAI_TIMEOUT_MS`, `PIPELINE_TIMEOUT_MS`.
5. On startup: validate env (zod), ping Redis, check `maxmemory-policy` is `noeviction` and warn if not.
6. Graceful shutdown for all workers; do not lose active jobs (BullMQ stalled-job settings from env).
7. Observability: structured logs with `submissionId`, `jobId`, `step`, `durationMs`, `attempt`; a `/health` check function ready for the deploy step. Never log source code.
8. Update `docs/module5-queue-contract.md` (statuses, payload incl. batch/re-grade, GenAI contract, error table, all open items per teammate).

## Tests (vitest, mocked clients)
- full happy path through all 3 steps
- Sandbox TIMEOUT / SECURITY_VIOLATION => AST and GenAI NOT called, no retry
- COMPILATION_ERROR => AST not called, GenAI called only for explanation, GenAI failure non-fatal
- AST failure => SKIPPED, continues to GenAI
- GenAI total outage => result reported with "AI Review Pending" + delayed retry job scheduled, submission not stuck
- retry after GenAI-step failure resumes from checkpoint (Sandbox client called exactly once)
- re-grade with the same submissionId is NOT dropped
- batch of N jobs goes to `batch-grading`, interactive job added meanwhile is processed first
- retries exhausted => terminal callback

## Working method
Short plan + list of assumptions first. Then implement. End with: (a) every `[ASSUMPTION]`, (b) what each teammate still must confirm, (c) commands to run and the test results.
````

---

## PHẦN B2 — Prompt chính: Git Analytics (US11)

````markdown
Read the project rules file first and follow it strictly (especially the Git Analytics SECURITY rules). Build this as a separate module inside Module 5; do not touch the grading pipeline except for shared utilities (logger, config, module1 client).

## Goal (US11, anti free-riding, MVP)
A lecturer provides a GitHub repo URL for a student team. Module 5 clones/fetches it, reads the commit history, splits it per team member, counts commits and lines of code (LOC) added/removed, evaluates contribution, flags free-riders, and sends the report to Module 1 for storage and display on the Lecturer Dashboard. Pull requests are out of scope (MVP).

## Input (job payload on queue `git-analysis`) [ASSUMPTION until An confirms]
```json
{
  "analysisId": "uuid",
  "projectId": "string",
  "repoUrl": "https://github.com/org/repo",
  "branch": "main (optional)",
  "members": [
    { "studentId": "string", "name": "string", "emails": ["a@x.com"], "githubUsernames": ["user"] }
  ],
  "requestedBy": "lecturerId"
}
```

## State machine (SRS 6.4.3)
`CLONING` -> `PARSING_COMMITS` -> `CALCULATING_LOC` -> `EVALUATING` -> `COMPLETED` | `FREE_RIDER_DETECTED`. Terminal `FAILED` with reason code. Implement as an explicit, pure state machine (`transition(state, event)`) so it is unit-testable, and report every transition to Module 1 via the callback client.

## Implementation requirements
1. `url-validator.ts`: strict validation per rules (https only, host allowlist from env, no credentials, no option-like values). Pure + tested with malicious inputs (`--upload-pack=...`, `file:///etc`, `ssh://`, `https://user:pw@github.com/x/y`, URLs with newlines/spaces, `../`).
2. `git-runner.ts`: the ONLY place that spawns git. `execFile`/`spawn` with arrays, timeouts, output size caps, the safe env/config from the rules, `--` before the URL. Clone with `--no-tags --bare` (or equivalent) into a unique temp dir; delete in `finally`. Support re-analysis via fetch when a cached clone exists only if it is safe and simple; otherwise always fresh clone (state the choice).
3. `log-parser.ts`: parse `git log --numstat --no-merges` with a custom delimiter format. Handle binary files (`-`), renames (`{a => b}`), empty commits, huge diffs, odd encodings. Pure function: raw string in, typed commit records out.
4. `identity-mapper.ts`: map each commit author (name/email) to a member using emails, GitHub noreply emails (`123+user@users.noreply.github.com`), usernames, case-insensitive; unmatched => `UNMAPPED` bucket. Report unmapped authors in the result.
5. `ignore-rules.ts`: configurable ignore globs for LOC (lockfiles, `dist/`, `node_modules/`, generated, vendored, images, minified). Default list in config.
6. `contribution.ts`: pure `computeContributionShare(members)` returning share per member. Default formula [ASSUMPTION, to be confirmed with the lecturer/SRS]: `share = 0.5 * commitShare + 0.5 * locShare` where `locShare` uses additions + deletions after ignore rules; weights in env. Free-rider if `share < FREE_RIDER_THRESHOLD_PERCENT` (default 5). Edge cases: team of 1, total commits 0, members with 0 commits (flag), only one author, very low total activity (do not flag everybody; add a `lowActivity` note).
7. Result sent to Module 1: per member `{ studentId, commits, additions, deletions, net, sharePercent, isFreeRider }`, plus `unmapped`, `totals`, `analyzedAt`, `repoUrl` (no credentials), `commitRange`. Final state `COMPLETED` or `FREE_RIDER_DETECTED`.
8. Error mapping, no job crash: invalid URL => `FAILED/INVALID_URL`; not found or private => `FAILED/REPO_NOT_FOUND_OR_NO_ACCESS` with a message a lecturer can understand; empty repo => `FAILED/EMPTY_REPO`; too large => `FAILED/REPO_TOO_LARGE`; network/timeouts => retryable. None of these may leave the analysis stuck in `CLONING`.
9. Queue: `git-analysis`, concurrency from env (default 2), attempts/backoff like grading, but long job timeout and stalled-job settings suited to clones. Provide `enqueueGitAnalysis()` and a mock module1 callback for local runs.
10. Update `docs/module5-queue-contract.md` with the Git section and open items (where reports are stored, tables, API, dashboard read path).

## Tests
- numstat parser: normal, binary, rename, empty, huge, multi-author fixtures
- URL validator: valid + at least 10 malicious cases
- identity mapper: email, noreply, username, case, alias, unmapped
- contribution: equal team, one free-rider, two free-riders, team of 1, zero commits, low activity, boundary exactly at 5%
- state machine: all valid transitions, invalid transitions rejected
- integration: create a real temp git repo inside the test with 3 authors and known commits, run `git-runner` + parser + mapper, assert exact per-member counts; also a failing clone (nonexistent path/host blocked by validator) ends in `FAILED` without throwing

## Working method
Short plan + assumptions first, then implement. End with: (a) every `[ASSUMPTION]`, (b) open items for An and the lecturer, (c) commands and test results.
````

---

## PHẦN B3 — Prompt cuối: test, hardening, deploy, tự UAT

````markdown
Read the project rules file first and follow it. Milestone 3 acceptance is on a REAL deployed environment (not localhost), requires >=80% unit-test coverage, and other teams will bug-hunt our system (each serious bug costs points). Do the following for Module 5 only.

1. Coverage: set vitest thresholds (lines, branches, functions, statements >= 80%) and make `npm run test:coverage` fail below them. Run it, list files below 80%, and add meaningful tests (no assertion-free tests) until the threshold is met. Report the final numbers.
2. Quality gates: `npm run lint` (ESLint + Prettier) with zero warnings, `tsc --noEmit` clean. Add them to a CI workflow file (`.github/workflows/module5.yml`) running lint, typecheck, tests with coverage, on every push/PR.
3. Dockerfile for the worker: multi-stage build, non-root user, `git` installed (required by Git Analytics), no dev dependencies in the final image, healthcheck, graceful shutdown on SIGTERM. Add a service entry for local `docker-compose` that reuses the team's Redis (coordinate, do not duplicate Redis config).
4. Deployment readiness: all config via env, `.env.example` complete, Redis URL supports TLS (`rediss://`), startup fails fast with a clear message on missing/invalid env, document that managed Redis must use `maxmemory-policy noeviction`. Write `docs/module5-deploy.md` with exact steps for the target (Azure or AWS: ask me which if not in the repo), environment variables, and a rollback note.
5. Self-UAT / bug-hunt: act as an adversarial tester against Module 5 using the mocks and a local Redis, and write results to `docs/module5-uat.md`. Cover at least:
   - duplicate enqueue of the same submission, re-grade, appeal flow
   - Redis restart mid-job, worker killed mid-job (stalled job recovery), double worker instances
   - Sandbox/AST/GenAI each: timeout, 5xx, 429, malformed JSON, slow response, partial outage
   - 100 concurrent jobs (NFR-08 prep) and a 500-job batch while single submissions keep flowing
   - Git: malicious URLs, private repo, empty repo, huge repo, repo with unmapped authors, repo deleted mid-clone, disk cleanup after failure
   - every submission/analysis ends in a terminal or explicitly pending status (never stuck)
   For each finding: severity, reproduction, fix (implement the fix and add a regression test).
6. Final summary: coverage numbers, remaining risks, and a checklist of what still depends on An, Thiên, Huy, Nhật.

Do not modify other modules' code. Do not add features beyond the scope.
````

---

## PHẦN C — Tin nhắn chốt hợp đồng (gửi nhóm)

**Gửi An (Module 1) — quan trọng nhất:**
> An ơi, Milestone 3 mình nối cả chuỗi Queue → Sandbox → AST → GenAI rồi gọi ngược Module 1. Cần An chốt:
> 1) Danh sách status cuối cùng của `Submission` và 6 bước stepper trên UI (mỗi bước ứng với status/callback nào) để mình báo đúng từng bước, kể cả "AI Review Pending" khi GenAI hỏng.
> 2) Payload khi chấm lại (appeal được accept) và chấm cả lớp: mình đề xuất thêm `reason: INITIAL|REGRADE|BATCH`, `gradingRunNo`, `batchId`. Với batch, An chỉ gọi enqueue rồi trả 202, đừng chờ.
> 3) Git Analytics: repo URL và danh sách thành viên (tên, mã SV, email git, username GitHub) đến chỗ mình bằng cách nào? Báo cáo đóng góp lưu ở bảng nào (An quyết định schema), mình gọi API nào để ghi, Dashboard đọc ra sao?
> 4) Bạn emit WebSocket từ callback của mình nhé, bên mình sẽ không dựng WebSocket server.

**Gửi Huy (Module 3):**
> Huy ơi, mình gọi GenAI Gateway của bạn từ Worker. Bạn chốt giúp: endpoint, request (source, language, kèm kết quả sandbox không?), response (điểm Clean Code 0-100, feedback tiếng Việt, giải thích lỗi biên dịch cho NFR-17), format lỗi khi toàn bộ provider hỏng, và thời gian tối đa gateway tự fallback (để mình đặt timeout lớn hơn một chút). Mình sẽ không tự fallback provider; nếu gateway báo hỏng, Submission sẽ ở trạng thái "AI Review Pending" và mình đặt job retry sau, không để treo `REVIEWING_AI`.

**Gửi Thiên (Module 2):**
> Thiên ơi, để ghép vào pipeline thật mình cần format kết quả Sandbox cuối cùng (trùng với format An lưu), chạy đồng bộ hay mình polling, và ai dọn file source sau khi chạy xong. Mình vẫn coi `TIMEOUT`/`SECURITY_VIOLATION`/`COMPILATION_ERROR` là kết quả hợp lệ, không retry. Nếu P2P tìm ra lỗ hổng cần vá thì báo mình để chỉnh quy tắc dừng pipeline.

**Gửi Nhật (Module 4):**
> Nhật ơi, mình gọi AST ngay sau khi Sandbox chạy xong (chỉ khi không TIMEOUT/SECURITY_VIOLATION/COMPILATION_ERROR). Bạn chốt giúp request/response cuối, tên cờ khi similarity > 60% (`SCORE_WITHHELD` hay `PLAGIARISM_DETECTED`), và format lỗi khi parse fail. Mình vẫn coi AST là bước phụ: lỗi thì bỏ qua và ghi warning.

**Gửi giảng viên/nhóm (một câu cần xác nhận):**
> Quy tắc free-rider "đóng góp < 5%" tính theo công thức nào: số commit, LOC, hay kết hợp? Mình đang tạm dùng 50% commit + 50% LOC (đã loại file sinh tự động), cần xác nhận để ghi vào báo cáo.

---

## Gợi ý dùng hiệu quả

- Làm **A → B0** trước để AI hiểu hiện trạng và biết đã có gì từ Milestone 2.
- Chạy **B1** và **B2** ở hai phiên làm việc riêng (hai nhánh git riêng) để diff dễ review; B2 độc lập với pipeline chấm bài.
- Luôn dùng `USE_MOCKS=true` cho đến khi hợp đồng với bạn kia chốt xong; khi chốt thì chỉ sửa `src/contracts/` và client thật.
- **Ưu tiên theo rủi ro điểm:** (1) pipeline end-to-end chạy ổn trên bản deploy thật, (2) coverage ≥ 80%, (3) không có submission nào bị treo, (4) Git Analytics không crash khi URL sai. Đây là các tiêu chí dễ bị đối thủ P2P bắt lỗi.
- Đầu Tuần 6, nếu nhóm đối thủ đã hack được Sandbox hoặc qua mặt AST ở Milestone 2, ưu tiên cập nhật quy tắc dừng pipeline trước khi làm tính năng mới.
- Phần công thức free-rider và schema lưu báo cáo là hai việc cần chốt sớm nhất với giảng viên/An vì ảnh hưởng đến cả code lẫn bài báo IEEE.

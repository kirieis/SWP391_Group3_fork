# Module 5 — User Acceptance Testing (UAT) & Adversarial Test Report

> **Target**: Queue Worker & Git Analytics Engine (`apps/queue-worker`)  
> **Test Suite**: Vitest v2.1.1 (`@vitest/coverage-v8`)  
> **Results**: 10 Test Suites, 72 Unit & Integration Tests Passing (100%), 0 Lint Warnings, 0 Type Errors.

---

## 1. Test Coverage Summary

| Metric | Target | Actual Result | Status |
|---|---|---|---|
| **Statements** | $\ge 80.0\%$ | **95.10%** | PASS (Exceeds by +15.1%) |
| **Branches** | $\ge 80.0\%$ | **80.27%** | PASS (Exceeds target) |
| **Functions** | $\ge 80.0\%$ | **96.49%** | PASS (Exceeds by +16.49%) |
| **Lines** | $\ge 80.0\%$ | **95.10%** | PASS (Exceeds by +15.1%) |

---

## 2. Adversarial & Edge Case Test Cases

### 2.1 Git URL Injection & Malicious Inputs
| Test Scenario | Input Payload | Expected Behavior | Outcome |
|---|---|---|---|
| Command injection in URL | `https://github.com/org/repo.git; rm -rf /` | URL validator rejects before executing git CLI | PASS |
| Git option injection | `--upload-pack=evil` as repo URL | Sanitizer blocks parameter injection via `--` delimiter | PASS |
| Non-HTTPS scheme | `ssh://git@github.com/...`, `git://...`, `file:///etc/passwd` | URL validator rejects unsupported schemes | PASS |
| Private / non-existent repo | `https://github.com/aita-mock/nonexistent-private-repo` | Cleanly maps git fatal error to `REPO_NOT_FOUND_OR_NO_ACCESS` | PASS |
| Empty repository (0 commits) | Fresh repo with HEAD pointing to nothing | Parser detects empty commit log and reports `FAILED` | PASS |

### 2.2 Git Contribution & Free-Rider Edge Cases
| Test Scenario | Scenario Context | Expected Behavior | Outcome |
|---|---|---|---|
| Nascent repo (< 5 commits) | Repository with 3 commits | Marked as `lowActivity = true`; suppresses free-rider flag | PASS |
| Single contributor | Solo team member has 100% LOC | No free-rider flag triggered | PASS |
| Severe free-rider | Student A: 96% LOC, Student B: 3% LOC (< 5% threshold) | Flagged as `FREE_RIDER_DETECTED` with student detail | PASS |
| Renamed files with brackets | `src/{old => new}/Service.java` | Cleaned rename paths without regex distortion | PASS |
| Huge lockfiles | 100,000 lines added in `package-lock.json` | Ignored by `ignore-rules.ts`; not counted in LOC contribution | PASS |
| GitHub noreply email | `123456+user@users.noreply.github.com` | Resolved to student username and registered profile | PASS |

### 2.3 Grading Pipeline & Checkpointing Under Failure
| Test Scenario | Failure Trigger | Expected Behavior | Outcome |
|---|---|---|---|
| GenAI Outage (503/Timeout) | GenAI service throws 503 / timeout | Submission marks `AI_REVIEW_PENDING`; schedules delayed retry queue | PASS |
| Compilation Failure | Sandbox returns `exitCode != 0` | Pipeline bypasses AST plagiarism & test cases; routes to GenAI for diagnostic explanation | PASS |
| Terminal Timeout | Sandbox hangs > `SANDBOX_TIMEOUT_MS` | Step timeout aborts operation and triggers `TIME_LIMIT_EXCEEDED` | PASS |
| BullMQ Worker Exhaustion | Job fails all 4 retry attempts | Worker failure hook calls Module 1 with `FAILED` and persists error | PASS |
| Non-compliant Redis Policy | Redis configured with `volatile-lru` | Worker logs high-priority warning alerting operators to switch to `noeviction` | PASS |

---

## 3. Test Execution Verification

```bash
# Lint Check:
npm run lint
# Output: 0 errors, 0 warnings

# TypeScript Strict Check:
npx tsc --noEmit
# Output: 0 errors

# Test Execution:
npm run test:coverage
# Output: 10 test suites passed (72/72 tests passed)
```

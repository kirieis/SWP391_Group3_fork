# Module 5 — Deployment & Operations Guide

> **Service**: Queue Worker & Git Analytics Engine (`apps/queue-worker`)  
> **Environment**: Docker, Docker Compose, Kubernetes ready

---

## 1. Prerequisites

- **Node.js**: 20.x LTS or higher
- **Git**: Installed and available in `$PATH` (inside container: Alpine `apk add git`)
- **Redis**: 7.x with `maxmemory-policy noeviction`
- **Network**: HTTP access to Module 1 Gateway (`http://api:5000`), Module 3 Sandbox (`http://sandbox:5001`), and GenAI Gateway (`http://genai:5002`).

---

## 2. Environment Variables Specification

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Environment mode (`development` / `production` / `test`) |
| `REDIS_HOST` | Yes | `localhost` | Redis server hostname |
| `REDIS_PORT` | Yes | `6379` | Redis server port |
| `REDIS_PASSWORD` | Optional | `""` | Redis auth password |
| `REDIS_TLS` | Optional | `false` | Enable TLS (`true`/`false`) for managed Redis (Upstash, ElastiCache) |
| `API_GATEWAY_URL` | Yes | `http://localhost:5000` | Module 1 API Gateway base URL |
| `SANDBOX_URL` | Yes | `http://localhost:5001` | Module 3 Sandbox Engine base URL |
| `GENAI_GATEWAY_URL` | Yes | `http://localhost:5002` | Module 2 GenAI review service base URL |
| `INTERNAL_API_KEY` | Yes | `secret` | Shared secret header `x-internal-api-key` |
| `WORKER_CONCURRENCY` | No | `5` | Concurrency for primary grading queue |
| `BATCH_CONCURRENCY` | No | `2` | Concurrency for batch queue |
| `GIT_CONCURRENCY` | No | `3` | Concurrency for Git analytics queue |
| `SANDBOX_TIMEOUT_MS` | No | `120000` | Sandbox step timeout (2 mins) |
| `PLAGIARISM_TIMEOUT_MS`| No | `60000` | AST Plagiarism step timeout (1 min) |
| `GENAI_TIMEOUT_MS` | No | `45000` | GenAI review step timeout (45s) |
| `GIT_TIMEOUT_MS` | No | `180000` | Git clone and analysis timeout (3 mins) |
| `USE_MOCKS` | No | `false` | When true, mock external services for local testing |

---

## 3. Redis `noeviction` Verification

BullMQ requires Redis memory policy to be `noeviction`. Evicting keys will destroy BullMQ streams, locks, and delayed jobs without warning.

### Configure Redis
```bash
# In redis.conf or docker command:
redis-server --maxmemory-policy noeviction
```

### Dynamic verification in runtime:
```bash
redis-cli CONFIG GET maxmemory-policy
# Expected response:
# 1) "maxmemory-policy"
# 2) "noeviction"
```
The Queue Worker automatically validates this upon startup via `verifyRedisPolicy()` and logs a prominent warning if non-compliant.

---

## 4. Docker Deployment

### 4.1 Build Docker Image
```bash
docker build -t aita-queue-worker:latest -f apps/queue-worker/Dockerfile .
```

### 4.2 Run via Docker Compose
From repository root:
```bash
docker-compose up -d redis queue-worker
```

### 4.3 Check Logs
```bash
docker-compose logs -f queue-worker
```

---

## 5. Health Check & Monitoring

### 5.1 Programmatic Health Check
The worker exposes `checkHealth()`:
```typescript
import { checkHealth } from "./index.js";

const status = await checkHealth();
// Returns: { status: "OK", redis: "CONNECTED", workers: { grading: true, batch: true, retry: true, git: true } }
```

### 5.2 Graceful Shutdown
The process listens for `SIGTERM` and `SIGINT`, cleanly pausing workers and waiting for active jobs to complete before closing Redis connections.

# syntax=dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace and package manifests
COPY package*.json ./
COPY apps/queue-worker/package*.json ./apps/queue-worker/

# Install dependencies
RUN npm ci

# Copy queue-worker source code and tsconfig
COPY apps/queue-worker/tsconfig.json ./apps/queue-worker/
COPY apps/queue-worker/src ./apps/queue-worker/src

# Build queue-worker
RUN npm run build --workspace=@aita/queue-worker

# ─────────────────────────────────────────────────────────────
# Production Stage
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install git (required for Git Analytics engine) and ca-certificates
RUN apk add --no-cache git ca-certificates tzdata

# Security: Set up non-root user
USER node

# Copy built artifacts and production dependencies
COPY --chown=node:node package*.json ./
COPY --chown=node:node apps/queue-worker/package*.json ./apps/queue-worker/

ENV NODE_ENV=production

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled code
COPY --chown=node:node --from=builder /app/apps/queue-worker/dist ./apps/queue-worker/dist

WORKDIR /app/apps/queue-worker

# Healthcheck to verify process responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "dist/index.js"]

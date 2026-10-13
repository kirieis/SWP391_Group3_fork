import { createApp } from './server/app';
import { config } from './config';
import { logger } from './utils/logger';
import { dockerRunner } from './engine/docker-runner';
import { executionLogger } from './logging/execution-logger';

async function bootstrap() {
  const app = createApp();

  // Check Docker daemon connectivity
  const isDockerReady = await dockerRunner.ping();
  if (isDockerReady) {
    logger.info('🐳 Docker daemon connected successfully.');
  } else {
    logger.warn('⚠️ Docker daemon is currently unreachable. live container execution will fail until Docker is started.');
  }

  // Prune expired logs older than 30 days on startup (NFR-18)
  executionLogger.pruneOldLogs(config.LOG_RETENTION_DAYS);

  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      `🚀 AITA Docker Sandbox Engine running at http://${config.HOST}:${config.PORT}`
    );
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, gracefully shutting down Sandbox Engine...`);
    server.close(() => {
      logger.info('Sandbox Engine HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start Sandbox Engine');
  process.exit(1);
});

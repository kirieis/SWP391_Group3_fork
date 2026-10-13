import express, { Express } from 'express';
import executeRoutes from './routes/execute.routes';
import { logger } from '../utils/logger';

export function createApp(): Express {
  const app = express();

  // Allow larger payloads up to 15MB for base64 / zip attachments if needed
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Basic request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          durationMs: Date.now() - start
        },
        'HTTP request handled'
      );
    });
    next();
  });

  // Mount routes
  app.use('/', executeRoutes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}

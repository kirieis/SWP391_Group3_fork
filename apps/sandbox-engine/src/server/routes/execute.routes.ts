import { Router } from 'express';
import { executeController } from '../controllers/execute.controller';
import { dockerRunner } from '../../engine/docker-runner';

const router = Router();

// Healthcheck endpoint
router.get('/health', async (_req, res) => {
  const dockerAlive = await dockerRunner.ping();
  return res.status(200).json({
    status: 'ok',
    service: 'aita-sandbox-engine',
    dockerDaemonConnected: dockerAlive,
    timestamp: new Date().toISOString()
  });
});

// Primary execute endpoint matching queue-worker contract
router.post('/execute', executeController);

// Alias endpoint
router.post('/api/sandbox/execute', executeController);

export default router;

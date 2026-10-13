import request from 'supertest';
import { createApp } from '../../src/server/app';

describe('Express App & API Routing', () => {
  const app = createApp();

  it('GET /health should return 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('aita-sandbox-engine');
  });

  it('POST /execute should return 400 when submissionId is missing', async () => {
    const res = await request(app).post('/execute').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });

  it('POST /execute should return 403 when internal token is invalid', async () => {
    const res = await request(app)
      .post('/execute')
      .set('x-internal-key', 'wrong_token')
      .send({ submissionId: 'test_123' });
    expect(res.status).toBe(403);
  });

  it('POST /execute should return 200 with COMPILATION_ERROR when execution encounters missing zip', async () => {
    const res = await request(app)
      .post('/execute')
      .set('x-internal-key', 'aita_internal_secret_key_2026')
      .send({ submissionId: 'test_123', zipFilePath: '/non/existent.zip' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('COMPILATION_ERROR');
  });

  it('GET /unknown-route should return 404', async () => {
    const res = await request(app).get('/some-non-existent-endpoint');
    expect(res.status).toBe(404);
  });
});

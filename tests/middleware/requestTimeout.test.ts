import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requestTimeout } from '../../src/middleware/requestTimeout.js';

describe('requestTimeout', () => {
  it('uses the configured timeout budget', async () => {
    const app = express();
    app.get('/slow', requestTimeout(10), async (_req, res) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!res.headersSent) res.json({ ok: true });
    });

    const res = await request(app).get('/slow');

    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
  });

  it('can be disabled with a non-positive timeout', async () => {
    const app = express();
    app.get('/fast', requestTimeout(0), (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/fast');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

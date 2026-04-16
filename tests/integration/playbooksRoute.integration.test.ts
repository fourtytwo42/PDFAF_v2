import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('GET /v1/playbooks', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DB_PATH = join(tmpdir(), `pdfaf-playbooks-api-${Date.now()}.db`);
  });

  it('returns playbooks and toolReliability arrays', async () => {
    const { createApp } = await import('../../src/app.js');
    const { getDb } = await import('../../src/db/client.js');
    getDb();
    const app = createApp();
    const res = await request(app).get('/v1/playbooks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.playbooks)).toBe(true);
    expect(Array.isArray(res.body.toolReliability)).toBe(true);
  });
});

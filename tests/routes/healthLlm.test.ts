import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileAsyncMock = vi.fn();

vi.mock('node:util', () => ({
  promisify: vi.fn(() => execFileAsyncMock),
}));

vi.mock('../../src/db/client.js', () => ({
  getDb: vi.fn(() => ({
    prepare: (sql: string) => {
      if (sql.includes('SELECT 1')) {
        return { get: () => ({ 1: 1 }) };
      }
      if (sql.includes('FROM playbooks')) {
        return { all: () => [{ status: 'active', c: 2 }] };
      }
      if (sql.includes('FROM tool_outcomes')) {
        return { get: () => ({ c: 4 }) };
      }
      if (sql.includes('FROM queue_items')) {
        return { get: () => ({ c: 3, avg_ms: 1200 }) };
      }
      return { get: () => ({ c: 0 }), all: () => [] };
    },
  })),
}));

vi.mock('../../src/metrics.js', () => ({
  remediationStatsLast24h: vi.fn(() => ({ count: 5, avgMs: 1300 })),
}));

describe('healthRouter LLM reporting', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
    execFileAsyncMock.mockReset();
    execFileAsyncMock.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'qpdf' && args[0] === '--version') return { stdout: 'qpdf 11.0.0\n' };
      if (cmd === 'python3' && args[0] === '--version') return { stdout: 'Python 3.12.0\n' };
      if (cmd === 'python3' && args[0] === '-c') return { stdout: '' };
      if (cmd === 'tesseract' && args[0] === '--version') return { stdout: 'tesseract 5.4.0\n' };
      if (cmd === 'ocrmypdf' && args[0] === '--version') return { stdout: '16.10.0\n' };
      throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
    });
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.unstubAllGlobals();
  });

  async function createHealthApp() {
    const { healthRouter } = await import('../../src/routes/health.js');
    const app = express();
    app.use('/v1/health', healthRouter);
    return app;
  }

  it('reports configured=false and reachable=false when no LLM base URL is set', async () => {
    delete process.env['OPENAI_COMPAT_BASE_URL'];
    vi.stubGlobal('fetch', vi.fn());

    const app = await createHealthApp();
    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.dependencies.llm).toEqual({ configured: false, reachable: false });
    expect(res.body.degradedReasons ?? []).not.toContain('llm_unreachable');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports configured and reachable when the /models probe succeeds', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://llm.example/v1';
    process.env['OPENAI_COMPAT_API_KEY'] = 'secret-key';

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://llm.example/v1/models');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-key');
      return { ok: true };
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = await createHealthApp();
    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.dependencies.llm).toEqual({ configured: true, reachable: true });
    expect(res.body.degradedReasons ?? []).not.toContain('llm_unreachable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports llm_unreachable when the /models probe fails', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://llm.example/v1';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );

    const app = await createHealthApp();
    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.dependencies.llm).toEqual({ configured: true, reachable: false });
    expect(res.body.degradedReasons).toContain('llm_unreachable');
  });
});

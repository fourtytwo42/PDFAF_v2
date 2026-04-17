import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('bootstrapOpenAiModelFromServer', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.unstubAllGlobals();
  });

  it('sets OPENAI_COMPAT_MODEL from /v1/models when AUTO=1', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '0';
    process.env['OPENAI_COMPAT_MODEL_AUTO'] = '1';
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://example:9/v1';
    process.env['OPENAI_COMPAT_API_KEY'] = 'k';
    process.env['OPENAI_COMPAT_MODEL'] = 'will-be-replaced';

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://example:9/v1/models');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer k');
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'gemma-4-E2B-it-Q4_K_M' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');
    await bootstrapOpenAiModelFromServer();

    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('gemma-4-E2B-it-Q4_K_M');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses local auth fallback when OPENAI_COMPAT_API_KEY is empty', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '0';
    process.env['OPENAI_COMPAT_MODEL_AUTO'] = '1';
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://example:9/v1';

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer local');
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'auto-picked-model' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');
    await bootstrapOpenAiModelFromServer();

    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('auto-picked-model');
  });

  it('retries after transient fetch failure and eventually sets the model', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '0';
    process.env['OPENAI_COMPAT_MODEL_AUTO'] = '1';
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://retry.example/v1';
    process.env['PDFAF_LLAMA_READY_TIMEOUT_MS'] = '1200';

    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('server not ready');
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'eventual-model' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');
    await bootstrapOpenAiModelFromServer();

    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('eventual-model');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no-ops when AUTO is not 1', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '0';
    process.env['OPENAI_COMPAT_MODEL_AUTO'] = '';
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://example:9/v1';
    process.env['OPENAI_COMPAT_MODEL'] = 'keep-me';

    vi.stubGlobal('fetch', vi.fn());

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');
    await bootstrapOpenAiModelFromServer();

    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('keep-me');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('no-ops when local embedded LLM mode is enabled', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '1';
    process.env['OPENAI_COMPAT_MODEL_AUTO'] = '1';
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://example:9/v1';
    process.env['OPENAI_COMPAT_MODEL'] = 'keep-me';

    vi.stubGlobal('fetch', vi.fn());

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');
    await bootstrapOpenAiModelFromServer();

    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('keep-me');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when AUTO=1 but base URL is missing', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '0';
    process.env['OPENAI_COMPAT_MODEL_AUTO'] = '1';
    delete process.env['OPENAI_COMPAT_BASE_URL'];

    vi.stubGlobal('fetch', vi.fn());

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');

    await expect(bootstrapOpenAiModelFromServer()).rejects.toThrow(
      'OPENAI_COMPAT_MODEL_AUTO=1 requires OPENAI_COMPAT_BASE_URL',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when /models never returns a model id', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '0';
    process.env['OPENAI_COMPAT_MODEL_AUTO'] = '1';
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://example:9/v1';
    process.env['PDFAF_LLAMA_READY_TIMEOUT_MS'] = '1';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      })),
    );

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');

    await expect(bootstrapOpenAiModelFromServer()).rejects.toThrow(
      /OPENAI_COMPAT_MODEL_AUTO=1 but no model id from http:\/\/example:9\/v1\/models within 1ms/,
    );
  });
});

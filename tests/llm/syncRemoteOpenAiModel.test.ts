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

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'http://example:9/v1/models') {
          return {
            ok: true,
            json: async () => ({ data: [{ id: 'gemma-4-E2B-it-Q4_K_M' }] }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );

    const { bootstrapOpenAiModelFromServer } = await import('../../src/llm/syncRemoteOpenAiModel.js');
    await bootstrapOpenAiModelFromServer();

    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('gemma-4-E2B-it-Q4_K_M');
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('openAiCompatClient', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function importClient() {
    return import('../../src/services/semantic/openAiCompatClient.js');
  }

  it('getLlmEndpoints returns none when no env is configured', async () => {
    const { getLlmEndpoints } = await importClient();
    expect(getLlmEndpoints()).toEqual([]);
  });

  it('getLlmEndpoints returns normalized primary endpoint with default model', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1/';
    process.env['OPENAI_COMPAT_API_KEY'] = 'pk';
    delete process.env['OPENAI_COMPAT_MODEL'];

    const { getLlmEndpoints } = await importClient();
    expect(getLlmEndpoints()).toEqual([
      {
        baseUrl: 'http://primary.example/v1',
        apiKey: 'pk',
        model: 'google/gemma-4-E2B-it',
        label: 'primary',
      },
    ]);
  });

  it('getLlmEndpoints returns fallback-only configuration with default model', async () => {
    process.env['OPENAI_COMPAT_FALLBACK_BASE_URL'] = 'http://fallback.example/v1/';
    process.env['OPENAI_COMPAT_FALLBACK_API_KEY'] = 'fk';
    delete process.env['OPENAI_COMPAT_FALLBACK_MODEL'];

    const { getLlmEndpoints } = await importClient();
    expect(getLlmEndpoints()).toEqual([
      {
        baseUrl: 'http://fallback.example/v1',
        apiKey: 'fk',
        model: 'google/gemma-4-E2B-it',
        label: 'fallback',
      },
    ]);
  });

  it('getLlmEndpoints returns both primary and fallback endpoints', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1/';
    process.env['OPENAI_COMPAT_API_KEY'] = 'pk';
    process.env['OPENAI_COMPAT_MODEL'] = 'primary-model';
    process.env['OPENAI_COMPAT_FALLBACK_BASE_URL'] = 'http://fallback.example/v1/';
    process.env['OPENAI_COMPAT_FALLBACK_API_KEY'] = 'fk';
    process.env['OPENAI_COMPAT_FALLBACK_MODEL'] = 'fallback-model';

    const { getLlmEndpoints } = await importClient();
    expect(getLlmEndpoints()).toEqual([
      {
        baseUrl: 'http://primary.example/v1',
        apiKey: 'pk',
        model: 'primary-model',
        label: 'primary',
      },
      {
        baseUrl: 'http://fallback.example/v1',
        apiKey: 'fk',
        model: 'fallback-model',
        label: 'fallback',
      },
    ]);
  });

  it('returns parsed tool-call payload and sends tools and tool_choice only when provided', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';
    process.env['OPENAI_COMPAT_API_KEY'] = 'pk';
    process.env['OPENAI_COMPAT_MODEL'] = 'primary-model';

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer pk');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body['model']).toBe('primary-model');
      expect(body['temperature']).toBe(0.2);
      expect(body['messages']).toEqual([{ role: 'user', content: 'hello' }]);
      expect(body['tools']).toEqual([{ type: 'function', function: { name: 'pick' } }]);
      expect(body['tool_choice']).toEqual({ type: 'function', function: { name: 'pick' } });

      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: 'pick',
                      arguments: '{"value":1}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { chatCompletionToolCall } = await importClient();
    const out = await chatCompletionToolCall({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'function', function: { name: 'pick' } }],
      toolChoice: { type: 'function', function: { name: 'pick' } },
    });

    expect(out).toEqual({
      endpoint: {
        baseUrl: 'http://primary.example/v1',
        apiKey: 'pk',
        model: 'primary-model',
        label: 'primary',
      },
      payload: {
        name: 'pick',
        arguments: { value: 1 },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns parsed inline JSON payload and omits tools when none are provided', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';
    process.env['OPENAI_COMPAT_API_KEY'] = 'pk';
    process.env['OPENAI_COMPAT_MODEL'] = 'primary-model';

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body['tools']).toBeUndefined();
      expect(body['tool_choice']).toBeUndefined();
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"answer":"ok"}',
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { chatCompletionToolCall } = await importClient();
    const out = await chatCompletionToolCall({
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(out.payload).toEqual({
      name: 'inline_json',
      arguments: { answer: 'ok' },
    });
    expect(out.endpoint.label).toBe('primary');
    expect(out.endpoint.model).toBe('primary-model');
  });

  it('fails over from primary HTTP error to fallback success', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';
    process.env['OPENAI_COMPAT_API_KEY'] = 'pk';
    process.env['OPENAI_COMPAT_MODEL'] = 'primary-model';
    process.env['OPENAI_COMPAT_FALLBACK_BASE_URL'] = 'http://fallback.example/v1';
    process.env['OPENAI_COMPAT_FALLBACK_API_KEY'] = 'fk';
    process.env['OPENAI_COMPAT_FALLBACK_MODEL'] = 'fallback-model';

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      if (url === 'http://primary.example/v1/chat/completions') {
        expect(headers['Authorization']).toBe('Bearer pk');
        return { ok: false, status: 500, json: async () => ({}) };
      }
      expect(headers['Authorization']).toBe('Bearer fk');
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: 'pick',
                      arguments: '{"source":"fallback"}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { chatCompletionToolCall } = await importClient();
    const out = await chatCompletionToolCall({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'function', function: { name: 'pick' } }],
    });

    expect(out.endpoint).toEqual({
      baseUrl: 'http://fallback.example/v1',
      apiKey: 'fk',
      model: 'fallback-model',
      label: 'fallback',
    });
    expect(out.payload.arguments).toEqual({ source: 'fallback' });
  });

  it('fails over when primary returns malformed tool JSON', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';
    process.env['OPENAI_COMPAT_FALLBACK_BASE_URL'] = 'http://fallback.example/v1';

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://primary.example/v1/chat/completions') {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        name: 'pick',
                        arguments: '{"broken"',
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: 'pick',
                      arguments: '{"source":"fallback"}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { chatCompletionToolCall } = await importClient();
    const out = await chatCompletionToolCall({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'function', function: { name: 'pick' } }],
    });

    expect(out.endpoint.label).toBe('fallback');
    expect(out.payload.arguments).toEqual({ source: 'fallback' });
  });

  it('fails over when primary returns unparseable inline content', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';
    process.env['OPENAI_COMPAT_FALLBACK_BASE_URL'] = 'http://fallback.example/v1';

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://primary.example/v1/chat/completions') {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'not json',
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"source":"fallback"}',
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { chatCompletionToolCall } = await importClient();
    const out = await chatCompletionToolCall({
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(out.endpoint.label).toBe('fallback');
    expect(out.payload).toEqual({
      name: 'inline_json',
      arguments: { source: 'fallback' },
    });
  });

  it('throws no_llm_endpoints when no endpoints are configured', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { chatCompletionToolCall } = await importClient();
    await expect(chatCompletionToolCall({ messages: [] })).rejects.toThrow('no_llm_endpoints');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves the last failure reason when both endpoints fail', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';
    process.env['OPENAI_COMPAT_FALLBACK_BASE_URL'] = 'http://fallback.example/v1';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'http://primary.example/v1/chat/completions') {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: false, status: 503, json: async () => ({}) };
      }),
    );

    const { chatCompletionToolCall } = await importClient();
    await expect(chatCompletionToolCall({ messages: [{ role: 'user', content: 'hello' }] })).rejects.toThrow(
      'chat_completion_failed:http_503',
    );
  });

  it('returns timeout when the request aborts due to timeoutMs', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';

    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener('abort', () => {
            const err = new Error('aborted');
            (err as Error & { name: string }).name = 'AbortError';
            reject(err);
          });
        }),
      ),
    );

    const { chatCompletionToolCall } = await importClient();
    const pending = chatCompletionToolCall({
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 5,
    });
    const expectation = expect(pending).rejects.toThrow('chat_completion_failed:timeout');
    await vi.advanceTimersByTimeAsync(10);

    await expectation;
  });

  it('throws aborted immediately when caller signal is already aborted', async () => {
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://primary.example/v1';
    vi.stubGlobal('fetch', vi.fn());

    const ac = new AbortController();
    ac.abort();

    const { chatCompletionToolCall } = await importClient();
    await expect(
      chatCompletionToolCall({
        messages: [{ role: 'user', content: 'hello' }],
        signal: ac.signal,
      }),
    ).rejects.toThrow('aborted');
    expect(fetch).not.toHaveBeenCalled();
  });
});

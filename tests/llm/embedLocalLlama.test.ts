import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const renameSyncMock = vi.fn();
const unlinkSyncMock = vi.fn();
const spawnMock = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  renameSync: renameSyncMock,
  unlinkSync: unlinkSyncMock,
}));

function createChild() {
  const handlers = new Map<string, (arg1?: unknown, arg2?: unknown) => void>();
  return {
    killed: false,
    on: vi.fn((event: string, cb: (arg1?: unknown, arg2?: unknown) => void) => {
      handlers.set(event, cb);
      return undefined;
    }),
    kill: vi.fn(function kill() {
      this.killed = true;
      return true;
    }),
    emit: (event: string, arg1?: unknown, arg2?: unknown) => handlers.get(event)?.(arg1, arg2),
  };
}

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

describe('embedLocalLlama', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    renameSyncMock.mockReset();
    unlinkSyncMock.mockReset();
    spawnMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.unstubAllGlobals();
  });

  it('skips startup when OPENAI_COMPAT_BASE_URL is already set', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '1';
    process.env['OPENAI_COMPAT_BASE_URL'] = 'http://external.example/v1';

    const { startEmbeddedLlmIfEnabled } = await import('../../src/llm/embedLocalLlama.js');
    await startEmbeddedLlmIfEnabled();

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('spawns local-file mode when GGUF and mmproj are present and sets env from /models', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '1';
    process.env['PDFAF_LLAMA_READY_TIMEOUT_MS'] = '50';

    const child = createChild();
    spawnMock.mockReturnValue(child);
    existsSyncMock.mockImplementation((path: string) =>
      path.endsWith('gemma-4-E2B-it-Q4_K_M.gguf') || path.endsWith('mmproj-F16.gguf'),
    );

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'gemma-4-E2B-it-Q4_K_M.gguf' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { startEmbeddedLlmIfEnabled } = await import('../../src/llm/embedLocalLlama.js');
    await startEmbeddedLlmIfEnabled();

    const [, args, options] = spawnMock.mock.calls[0] as [string, string[], { cwd: string }];
    expect(args).toContain('-m');
    expect(args).toContain('--mmproj');
    expect(args).not.toContain('-hf');
    expect(options.cwd).toContain('llama-work');
    expect(process.env['OPENAI_COMPAT_BASE_URL']).toBe('http://127.0.0.1:1234/v1');
    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('gemma-4-E2B-it-Q4_K_M.gguf');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('spawns HF mode when local model files are absent', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '1';
    process.env['PDFAF_LLAMA_READY_TIMEOUT_MS'] = '50';

    const child = createChild();
    spawnMock.mockReturnValue(child);
    existsSyncMock.mockReturnValue(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'remote-model.gguf' }] }),
      })),
    );

    const { startEmbeddedLlmIfEnabled } = await import('../../src/llm/embedLocalLlama.js');
    await startEmbeddedLlmIfEnabled();

    const [, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(args).toContain('-hf');
    expect(args).toContain('unsloth/gemma-4-E2B-it-GGUF');
    expect(args).not.toContain('--mmproj');
    expect(process.env['OPENAI_COMPAT_MODEL']).toBe('remote-model.gguf');
  });

  it('throws and stops the child when readiness times out', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '1';
    process.env['PDFAF_LLAMA_READY_TIMEOUT_MS'] = '1';

    const child = createChild();
    spawnMock.mockReturnValue(child);
    existsSyncMock.mockReturnValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ data: [] }),
      })),
    );

    const { startEmbeddedLlmIfEnabled } = await import('../../src/llm/embedLocalLlama.js');

    await expect(startEmbeddedLlmIfEnabled()).rejects.toThrow(
      /Embedded llama-server did not become ready at http:\/\/127\.0\.0\.1:1234\/v1\/models within 1ms/,
    );
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('skips desktop local mode when installed artifacts are incomplete', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '1';
    process.env['PDFAF_DESKTOP_MODE'] = '1';
    process.env['LLAMA_SERVER_BIN'] = 'C:\\PDFAF\\llm\\bin\\llama-server.exe';
    process.env['GEMMA4_GGUF_FILE'] = 'C:\\PDFAF\\llm\\models\\gemma.gguf';
    process.env['GEMMA4_MMPROJ_FILE'] = 'C:\\PDFAF\\llm\\models\\mmproj.gguf';

    existsSyncMock.mockImplementation((path: string) => path === 'C:\\PDFAF\\llm\\bin\\llama-server.exe');

    const { startEmbeddedLlmIfEnabled } = await import('../../src/llm/embedLocalLlama.js');
    await startEmbeddedLlmIfEnabled();

    expect(spawnMock).not.toHaveBeenCalled();
    expect(process.env['OPENAI_COMPAT_BASE_URL']).toBeUndefined();
  });

  it('stopEmbeddedLlm is safe with no child and kills active child once', async () => {
    process.env['PDFAF_RUN_LOCAL_LLM'] = '1';
    process.env['PDFAF_LLAMA_READY_TIMEOUT_MS'] = '50';

    const child = createChild();
    spawnMock.mockReturnValue(child);
    existsSyncMock.mockReturnValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'ready-model' }] }),
      })),
    );

    const { startEmbeddedLlmIfEnabled, stopEmbeddedLlm } = await import('../../src/llm/embedLocalLlama.js');

    stopEmbeddedLlm();
    expect(child.kill).not.toHaveBeenCalled();

    await startEmbeddedLlmIfEnabled();
    stopEmbeddedLlm();
    stopEmbeddedLlm();

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

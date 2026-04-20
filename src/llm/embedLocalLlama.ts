import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  GEMMA4_GGUF_FILE,
  GEMMA4_HF_REPO,
  GEMMA4_MMPROJ_FILE,
  LLAMA_SERVER_BIN,
  PDFAF_LLAMA_PORT,
  PDFAF_LLAMA_READY_TIMEOUT_MS,
  PDFAF_LLAMA_WORKDIR,
  runLocalLlmEnabled,
} from '../config.js';
import { logError, logInfo } from '../logging.js';

let llamaChild: ChildProcess | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function preferWorkdirFile(filename: string): string {
  const rootFile = join(process.cwd(), filename);
  const workFile = join(PDFAF_LLAMA_WORKDIR, filename);
  if (existsSync(rootFile) && !existsSync(workFile)) {
    try {
      renameSync(rootFile, workFile);
    } catch {
      /* ignore — may be same file or permission */
    }
  }
  return workFile;
}

async function waitForModelsJson(baseV1: string, apiKey: string): Promise<{ firstModelId: string | null }> {
  const url = `${baseV1.replace(/\/$/, '')}/models`;
  const deadline = Date.now() + PDFAF_LLAMA_READY_TIMEOUT_MS;
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        await sleep(500);
        continue;
      }
      const j = (await res.json()) as { data?: Array<{ id?: string }> };
      const id = j.data?.[0]?.id ?? null;
      if (id) return { firstModelId: id };
    } catch {
      /* server not ready */
    }
    await sleep(500);
  }
  return { firstModelId: null };
}

function applyCompatEnv(baseV1: string, apiKey: string, firstModelId: string): void {
  process.env['OPENAI_COMPAT_BASE_URL'] = baseV1;
  process.env['OPENAI_COMPAT_API_KEY'] = apiKey;
  process.env['OPENAI_COMPAT_MODEL'] = firstModelId;
}

/**
 * If `PDFAF_RUN_LOCAL_LLM=1` and `OPENAI_COMPAT_BASE_URL` is unset, spawn `llama-server` (Gemma 4 E2B instruct
 * GGUF defaults: `unsloth/gemma-4-E2B-it-GGUF` + `gemma-4-E2B-it-Q4_K_M.gguf`, same weights family as
 * `google/gemma-4-E2B-it`) and point OpenAI-compat env at it. First HF fetch can take many minutes.
 */
export async function startEmbeddedLlmIfEnabled(): Promise<void> {
  if (!runLocalLlmEnabled()) return;

  if ((process.env['OPENAI_COMPAT_BASE_URL'] ?? '').trim()) {
    logInfo({
      message: 'embed_llm_skipped',
      details: { reason: 'OPENAI_COMPAT_BASE_URL is already set' },
    });
    return;
  }

  const host = '127.0.0.1';
  const port = PDFAF_LLAMA_PORT;
  const baseV1 = `http://${host}:${port}/v1`;
  const apiKey = (process.env['OPENAI_COMPAT_API_KEY'] ?? '').trim() || 'local';
  const reused = await waitForModelsJson(baseV1, apiKey);
  if (reused.firstModelId) {
    applyCompatEnv(baseV1, apiKey, reused.firstModelId);
    logInfo({
      message: 'embed_llm_reused',
      details: { baseV1, model: reused.firstModelId },
    });
    return;
  }

  mkdirSync(PDFAF_LLAMA_WORKDIR, { recursive: true });

  const workGguf = preferWorkdirFile(GEMMA4_GGUF_FILE);
  const workMmproj = preferWorkdirFile(GEMMA4_MMPROJ_FILE);
  const rootJson = join(process.cwd(), `${GEMMA4_GGUF_FILE}.json`);
  const workJson = join(PDFAF_LLAMA_WORKDIR, `${GEMMA4_GGUF_FILE}.json`);
  if (existsSync(rootJson) && !existsSync(workJson)) {
    try {
      renameSync(rootJson, workJson);
    } catch {
      /* ignore */
    }
  }
  for (const base of [process.cwd(), PDFAF_LLAMA_WORKDIR]) {
    const dip = join(base, `${GEMMA4_GGUF_FILE}.downloadInProgress`);
    if (existsSync(dip)) {
      try {
        unlinkSync(dip);
      } catch {
        /* ignore */
      }
    }
  }

  const localModelReady = existsSync(workGguf) && existsSync(workMmproj);
  const args = localModelReady
    ? [
        '-m',
        workGguf,
        '--mmproj',
        workMmproj,
        '--host',
        host,
        '--port',
        String(port),
        '--reasoning-budget',
        '0',
        '--chat-template-kwargs',
        '{"enable_thinking": false}',
        '--reasoning-format',
        'deepseek',
      ]
    : [
        '-hf',
        GEMMA4_HF_REPO,
        '-m',
        GEMMA4_GGUF_FILE,
        '--host',
        host,
        '--port',
        String(port),
        '--reasoning-budget',
        '0',
        '--chat-template-kwargs',
        '{"enable_thinking": false}',
        '--reasoning-format',
        'deepseek',
      ];

  logInfo({
    message: 'embed_llm_spawn',
    details: {
      bin: LLAMA_SERVER_BIN,
      repo: GEMMA4_HF_REPO,
      gguf: GEMMA4_GGUF_FILE,
      mmproj: localModelReady ? GEMMA4_MMPROJ_FILE : '(auto)',
      localModelReady,
      port,
      cwd: PDFAF_LLAMA_WORKDIR,
    },
  });

  llamaChild = spawn(LLAMA_SERVER_BIN, args, {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: PDFAF_LLAMA_WORKDIR,
  });

  llamaChild.on('error', err => {
    logError({ message: 'embed_llm_spawn_failed', error: String(err) });
  });

  llamaChild.on('exit', (code, signal) => {
    logInfo({ message: 'embed_llm_exit', details: { code, signal } });
    llamaChild = null;
  });

  const { firstModelId } = await waitForModelsJson(baseV1, apiKey);
  if (!firstModelId) {
    logError({
      message: 'embed_llm_timeout',
      details: { baseV1, timeoutMs: PDFAF_LLAMA_READY_TIMEOUT_MS },
    });
    stopEmbeddedLlm();
    throw new Error(
      `Embedded llama-server did not become ready at ${baseV1}/models within ${PDFAF_LLAMA_READY_TIMEOUT_MS}ms. Install llama.cpp llama-server and ensure HF access, or set OPENAI_COMPAT_BASE_URL to an external endpoint.`,
    );
  }

  // Always use the id from llama-server (GGUF basename), not a HF Transformers id like google/gemma-4-E2B-it.
  applyCompatEnv(baseV1, apiKey, firstModelId);

  logInfo({
    message: 'embed_llm_ready',
    details: { baseV1, model: process.env['OPENAI_COMPAT_MODEL'] },
  });
}

export function stopEmbeddedLlm(): void {
  if (!llamaChild || llamaChild.killed) return;
  try {
    llamaChild.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  llamaChild = null;
}

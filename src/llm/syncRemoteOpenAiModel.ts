import {
  getOpenAiCompatApiKey,
  getOpenAiCompatBaseUrl,
  PDFAF_LLAMA_READY_TIMEOUT_MS,
  runLocalLlmEnabled,
} from '../config.js';
import { logError, logInfo } from '../logging.js';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * When `OPENAI_COMPAT_MODEL_AUTO=1` and `OPENAI_COMPAT_BASE_URL` is set (sidecar / external server),
 * poll `GET …/v1/models` and set `process.env.OPENAI_COMPAT_MODEL` to the first id (GGUF basename).
 * Skipped when `PDFAF_RUN_LOCAL_LLM=1` (embedded path already sets the model).
 */
export async function bootstrapOpenAiModelFromServer(): Promise<void> {
  if (runLocalLlmEnabled()) return;
  if (process.env['OPENAI_COMPAT_MODEL_AUTO'] !== '1') return;

  const base = getOpenAiCompatBaseUrl().trim();
  if (!base) {
    throw new Error('OPENAI_COMPAT_MODEL_AUTO=1 requires OPENAI_COMPAT_BASE_URL');
  }

  const baseV1 = base.replace(/\/$/, '');
  const url = `${baseV1}/models`;
  const apiKey = getOpenAiCompatApiKey().trim() || 'local';
  const deadline = Date.now() + PDFAF_LLAMA_READY_TIMEOUT_MS;
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let firstModelId: string | null = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const j = (await res.json()) as { data?: Array<{ id?: string }> };
        const id = j.data?.[0]?.id ?? null;
        if (id) {
          firstModelId = id;
          break;
        }
      }
    } catch {
      /* server not ready */
    }
    await sleep(500);
  }

  if (!firstModelId) {
    logError({
      message: 'openai_model_auto_failed',
      details: { url, timeoutMs: PDFAF_LLAMA_READY_TIMEOUT_MS },
    });
    throw new Error(
      `OPENAI_COMPAT_MODEL_AUTO=1 but no model id from ${url} within ${PDFAF_LLAMA_READY_TIMEOUT_MS}ms`,
    );
  }

  process.env['OPENAI_COMPAT_MODEL'] = firstModelId;
  logInfo({ message: 'openai_model_auto_ready', details: { model: firstModelId } });
}

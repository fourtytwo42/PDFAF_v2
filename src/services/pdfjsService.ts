import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFJS_TIMEOUT_MS } from '../config.js';
import type { PdfjsResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Detect whether we're running as raw TypeScript (tsx dev) or compiled JS.
// import.meta.url ends in .ts when tsx is executing source directly.
const IS_DEV_TS = fileURLToPath(import.meta.url).endsWith('.ts');

function buildWorkerOptions(): { workerPath: string; options: ConstructorParameters<typeof Worker>[1] } {
  if (IS_DEV_TS) {
    // Dev: spawn a .mjs bootstrap that registers the tsx ESM loader manually,
    // then imports the .ts worker. Node v20+ doesn't propagate --import hooks
    // to workers, so we must re-register inside the worker process.
    return {
      workerPath: join(__dirname, 'pdfjsWorkerBootstrap.mjs'),
      options: {},
    };
  }
  // Production: the worker is compiled to .js alongside this file.
  return {
    workerPath: join(__dirname, 'pdfjsWorker.js'),
    options: {},
  };
}

export async function extractWithPdfjs(
  pdfPath: string,
  timeoutOptions?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<PdfjsResult> {
  const { workerPath, options } = buildWorkerOptions();
  const timeoutMs = Math.max(1, timeoutOptions?.timeoutMs ?? PDFJS_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      ...options,
      workerData: pdfPath,
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`pdfjs timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(Object.assign(new Error('pdfjs extraction aborted'), { name: 'AbortError' }));
    };
    if (timeoutOptions?.signal) {
      if (timeoutOptions.signal.aborted) {
        onAbort();
        return;
      }
      timeoutOptions.signal.addEventListener('abort', onAbort, { once: true });
    }

    worker.on('message', (msg: { ok: boolean; result?: PdfjsResult; error?: string }) => {
      clearTimeout(timer);
      timeoutOptions?.signal?.removeEventListener('abort', onAbort);
      if (msg.ok && msg.result) {
        resolve(msg.result);
      } else {
        reject(new Error(msg.error ?? 'pdfjs worker failed'));
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timer);
      timeoutOptions?.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    worker.on('exit', (code) => {
      clearTimeout(timer);
      timeoutOptions?.signal?.removeEventListener('abort', onAbort);
      if (code !== 0) {
        reject(new Error(`pdfjs worker exited with code ${code}`));
      }
    });
  });
}

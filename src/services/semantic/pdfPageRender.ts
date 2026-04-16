import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);
import {
  SEMANTIC_MAX_IMAGE_BYTES,
  SEMANTIC_PAGE_JPEG_QUALITY,
  SEMANTIC_PAGE_RENDER_MAX_PX,
} from '../../config.js';

/**
 * Render a single PDF page to a JPEG data URL for vision APIs.
 */
export async function renderPageToJpegDataUrl(
  buffer: Buffer,
  pageNumber1Based: number,
): Promise<string | null> {
  if (pageNumber1Based < 1) return null;

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  // Copy bytes: pdf.js may detach the ArrayBuffer; layout/semantic may open the same PDF buffer sequentially.
  const data = Uint8Array.from(buffer);
  const loadingTask = pdfjs.getDocument({ data, disableFontFace: true, verbosity: 0 });
  const pdf = await loadingTask.promise;

  try {
    if (pageNumber1Based > pdf.numPages) return null;
    const page = await pdf.getPage(pageNumber1Based);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = SEMANTIC_PAGE_RENDER_MAX_PX / Math.max(baseViewport.width, baseViewport.height);
    const viewport = page.getViewport({ scale: Math.min(scale, 2) });

    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');

    const renderTask = page.render({
      canvasContext: ctx as never,
      viewport,
    });
    await renderTask.promise;

    let quality = SEMANTIC_PAGE_JPEG_QUALITY;
    let jpeg = canvas.toBuffer('image/jpeg', quality);
    while (jpeg.length > SEMANTIC_MAX_IMAGE_BYTES && quality > 40) {
      quality -= 8;
      jpeg = canvas.toBuffer('image/jpeg', quality);
    }
    if (jpeg.length > SEMANTIC_MAX_IMAGE_BYTES) {
      return null;
    }

    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  } finally {
    await pdf.destroy().catch(() => {});
  }
}

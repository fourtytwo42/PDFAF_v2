// This file runs ONLY as a worker thread — never imported directly.
import { workerData, parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { MAX_SAMPLE_PAGES } from '../config.js';
import type { PdfjsResult } from '../types.js';

async function run(pdfPath: string): Promise<PdfjsResult> {
  // Use the legacy build — required for Node.js environments.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdfjs requires workerSrc to be set even in Node. Point it at the bundled
  // worker file so pdfjs can spin up its own internal worker thread.
  const workerUrl = new URL(import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href;

  // Read file as buffer (works for any path, avoids URL encoding issues)
  const data = await readFile(pdfPath);
  const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  const loadingTask = pdfjs.getDocument({
    data: uint8,
    disableFontFace: true,
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  const sampleCount  = Math.min(pageCount, MAX_SAMPLE_PAGES);
  const sampleIndices = samplePages(pageCount, sampleCount);

  const textByPage: string[] = new Array(pageCount).fill('');
  let textCharCount = 0;
  let imageOnlyPageCount = 0;
  const links: PdfjsResult['links'] = [];
  const formFields: PdfjsResult['formFields'] = [];

  for (const pageIdx of sampleIndices) {
    const page = await pdf.getPage(pageIdx + 1); // pdfjs is 1-indexed

    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    textByPage[pageIdx] = pageText;
    textCharCount += pageText.length;

    const opList = await page.getOperatorList();
    if (detectImageOnlyPage(opList, pageText)) imageOnlyPageCount++;

    const annotations = await page.getAnnotations();
    for (const ann of annotations) {
      if (ann.subtype === 'Link' && ann.url) {
        links.push({ text: (ann.contents ?? ann.url ?? '').trim(), url: ann.url, page: pageIdx });
      } else if (ann.subtype === 'Widget') {
        formFields.push({ name: ann.fieldName ?? '', page: pageIdx });
      }
    }

    page.cleanup();
  }

  // Metadata
  const meta = await pdf.getMetadata().catch(() => null);
  const metadata: PdfjsResult['metadata'] = {};
  if (meta?.info) {
    const info = meta.info as Record<string, unknown>;
    if (info['Title'])    metadata.title    = String(info['Title']);
    if (info['Language']) metadata.language = String(info['Language']);
    if (info['Author'])   metadata.author   = String(info['Author']);
    if (info['Subject'])  metadata.subject  = String(info['Subject']);
  }

  await pdf.destroy();

  return { pageCount, textByPage, textCharCount, imageOnlyPageCount, metadata, links, formFields };
}

// ─── Image-only detection ────────────────────────────────────────────────────

const IMAGE_OPS = new Set([82, 83, 84, 85, 86, 87, 88]);

function detectImageOnlyPage(opList: any, pageText: string): boolean {
  if (pageText.length > 50) return false;
  let imageOps = 0;
  let totalOps = 0;
  for (const op of (opList.fnArray ?? [])) {
    totalOps++;
    if (IMAGE_OPS.has(op)) imageOps++;
  }
  return totalOps > 0 && imageOps / totalOps > 0.8;
}

// ─── Page sampling ───────────────────────────────────────────────────────────

function samplePages(pageCount: number, sampleCount: number): number[] {
  if (sampleCount >= pageCount) return Array.from({ length: pageCount }, (_, i) => i);
  const indices = new Set<number>([0, pageCount - 1]);
  const step = (pageCount - 1) / (sampleCount - 1);
  for (let i = 1; i < sampleCount - 1; i++) indices.add(Math.round(i * step));
  return Array.from(indices).sort((a, b) => a - b);
}

// ─── Entry ───────────────────────────────────────────────────────────────────

run(workerData as string)
  .then(result => parentPort!.postMessage({ ok: true, result }))
  .catch(err   => parentPort!.postMessage({ ok: false, error: String(err) }));

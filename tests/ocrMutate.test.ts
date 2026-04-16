import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { runPythonMutationBatch } from '../src/python/bridge.js';

async function tinyTextPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('Hi', { x: 50, y: 100, size: 12 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('ocr_scanned_pdf python mutation', () => {
  it('either applies OCR or reports a clear failure when OCR stack is missing', async () => {
    const buf = await tinyTextPdf();
    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      {
        op: 'ocr_scanned_pdf',
        params: {
          languages: 'eng',
          skipExistingText: false,
          deskew: true,
          rotatePages: true,
          forceOcr: true,
        },
      },
    ]);

    const ocrApplied = result.applied.includes('ocr_scanned_pdf');

    if (ocrApplied) {
      expect(result.success).toBe(true);
      expect(out.length).toBeGreaterThan(0);
    } else {
      expect(result.success).toBe(false);
      const err = result.failed.map(f => `${f.op}: ${f.error}`).join(' | ').toLowerCase();
      expect(err).toMatch(/ocrmypdf|tesseract|ghostscript|\bgs\b|not found|no such file|errno|failed|error|timeout|spawn|no stdout/i);
    }
  }, 120_000);
});

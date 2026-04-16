import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';

/**
 * Word PDFs use /InlineShape and /Shape instead of /Figure; Acrobat still runs
 * "Figures alternate text" on them.
 */
describe('repair_alt_text_structure + Word InlineShape / Shape roles', () => {
  it('fills missing /Alt and reports figures for InlineShape and Shape tags', async () => {
    const pdfPath = join(
      process.cwd(),
      'Output/corpus_1_2_local_pass/corpus_1__11_font_unicode_child_abuse_19972007_remediated.pdf',
    );
    if (!existsSync(pdfPath)) {
      return;
    }
    const buf = readFileSync(pdfPath);
    const before = await analyzePdf(pdfPath, '11.pdf');
    expect(before.snapshot.figures.length).toBeGreaterThan(0);
    const missingBefore = before.snapshot.figures.filter(
      f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
    );
    expect(missingBefore.length).toBeGreaterThan(0);

    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      { op: 'repair_alt_text_structure', params: {} },
    ]);
    expect(result.success).toBe(true);

    const tmp = join(tmpdir(), `pdfaf-inline-${randomUUID()}.pdf`);
    writeFileSync(tmp, out);
    try {
      const after = await analyzePdf(tmp, '11.pdf');
      const missingAfter = after.snapshot.figures.filter(
        f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
      );
      expect(missingAfter.length).toBe(0);
    } finally {
      unlinkSync(tmp);
    }
  });
});

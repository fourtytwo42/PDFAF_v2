import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';

/**
 * CHRI-style PDFs: lone /Figure + MCID (no child struct) is usually a chart/table export.
 * repair_alt_text_structure should assign a non-empty /Alt (Table placeholder) so Acrobat passes.
 */
describe('leaf MCID-only figure alt (table-style placeholder)', () => {
  it('fills missing alt on corpus_1__16 CHRI remediated PDF', async () => {
    const pdfPath = join(
      process.cwd(),
      'Output/corpus_1_2_local_pass/corpus_1__16_remediated_wave_structure_figure_CHRI_RB_4074_remediated.pdf',
    );
    if (!existsSync(pdfPath)) {
      return;
    }
    const buf = readFileSync(pdfPath);
    const before = await analyzePdf(pdfPath, '16.pdf');
    const missingBefore = before.snapshot.figures.filter(
      f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
    );
    expect(missingBefore.length).toBeGreaterThan(0);

    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      { op: 'repair_alt_text_structure', params: {} },
    ]);
    expect(result.success).toBe(true);

    const tmp = join(tmpdir(), `pdfaf-chri16-${randomUUID()}.pdf`);
    writeFileSync(tmp, out);
    try {
      const after = await analyzePdf(tmp, '16.pdf');
      const missingAfter = after.snapshot.figures.filter(
        f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
      );
      expect(missingAfter.length).toBe(0);
      const leaf = after.snapshot.figures.find(f => f.structRef === '33_0');
      expect(leaf?.altText).toMatch(/^Table \(page \d+\)$/);
    } finally {
      unlinkSync(tmp);
    }
  });
});

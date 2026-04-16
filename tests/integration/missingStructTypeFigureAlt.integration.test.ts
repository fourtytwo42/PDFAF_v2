import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';

/**
 * Acrobat "Figures alternate text" can fail when /Figure omits /Type /StructElem
 * (valid in the wild); _fill_missing_figure_alts must still set /Alt.
 */
describe('repair_alt_text_structure + figures without /Type /StructElem', () => {
  it('fills missing /Alt on Figure tags that omit /Type', async () => {
    const pdfPath = join(
      process.cwd(),
      'Output/corpus_1_2_local_pass/corpus_1__17_remediated_wave_heading_figure_reentry_4078_remediated.pdf',
    );
    if (!existsSync(pdfPath)) {
      return;
    }
    const buf = readFileSync(pdfPath);
    const before = await analyzePdf(pdfPath, '17_remediated.pdf');
    const missingBefore = before.snapshot.figures.filter(f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()));
    expect(missingBefore.length).toBeGreaterThan(0);

    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      { op: 'repair_alt_text_structure', params: {} },
    ]);
    expect(result.success).toBe(true);

    const tmp = join(tmpdir(), `pdfaf-figtype-${randomUUID()}.pdf`);
    writeFileSync(tmp, out);
    try {
      const after = await analyzePdf(tmp, '17_remediated.pdf');
      const missingAfter = after.snapshot.figures.filter(
        f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
      );
      expect(missingAfter.length).toBe(0);
    } finally {
      unlinkSync(tmp);
    }
  });
});

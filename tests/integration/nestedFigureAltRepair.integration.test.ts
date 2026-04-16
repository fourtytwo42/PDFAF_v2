import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';

/**
 * Nested /Figure chains + Span ActualText under figures (Acrobat Nested + Fig alt).
 */
describe('repair_alt_text_structure nested figure / ICCJIA stacks', () => {
  it('clears nestedFigureAltCount and keeps outer figure alt', async () => {
    const pdfPath = join(
      process.cwd(),
      'Output/corpus_1_2_local_pass/corpus_1__14_remediated_wave_nested_alt_state_survey_4082_remediated.pdf',
    );
    if (!existsSync(pdfPath)) {
      return;
    }
    const buf = readFileSync(pdfPath);
    const before = await analyzePdf(pdfPath, '14.pdf');
    expect((before.snapshot.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0) > 0).toBe(true);

    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      { op: 'repair_alt_text_structure', params: {} },
    ]);
    expect(result.success).toBe(true);

    const tmp = join(tmpdir(), `pdfaf-nested-${randomUUID()}.pdf`);
    writeFileSync(tmp, out);
    try {
      const after = await analyzePdf(tmp, '14.pdf');
      expect(after.snapshot.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0).toBe(0);
      const missing = after.snapshot.figures.filter(
        f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
      );
      expect(missing.length).toBe(0);
    } finally {
      unlinkSync(tmp);
    }
  });
});

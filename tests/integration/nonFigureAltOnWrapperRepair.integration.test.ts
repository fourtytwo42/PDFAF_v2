import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';
import { applyPostRemediationAltRepair } from '../../src/services/remediation/altStructureRepair.js';

/**
 * Regression: post-remediation batch must clear Acrobat "Other elements alternate text" patterns
 * (non-Figure /Alt on MCID wrappers) after mark_untagged_content_as_artifact.
 */
describe('applyPostRemediationAltRepair clears non-Figure alt wrappers', () => {
  it('drops nonFigureWithAltCount on Byrne strategic plan (remediated fixture)', async () => {
    const pdfPath = join(
      process.cwd(),
      'Output',
      'corpus_stress_varied_remediated',
      '18_id4734_score75_p71_4734-Illinois_Edward_Byrne_Memorial_Justice_Research_Grant_Strategic_Plan_2024-2029.pdf',
    );
    if (!existsSync(pdfPath)) {
      return;
    }
    const before = await analyzePdf(pdfPath, '4734.pdf', { bypassCache: true });
    expect(before.snapshot.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0).toBeGreaterThan(0);

    const buf = readFileSync(pdfPath);
    const repaired = await applyPostRemediationAltRepair(
      buf,
      '4734.pdf',
      before.result,
      before.snapshot,
    );

    const tmp = join(tmpdir(), `pdfaf-nf-alt-${randomUUID()}.pdf`);
    writeFileSync(tmp, repaired.buffer);
    try {
      const after = await analyzePdf(tmp, '4734.pdf', { bypassCache: true });
      expect(after.snapshot.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0).toBe(0);
    } finally {
      unlinkSync(tmp);
    }
  });
});

import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runPythonAnalysis, runPythonMutationBatch } from '../../src/python/bridge.js';

const PDF_4661 = join(
  process.cwd(),
  'Input/corpus_stress_varied_blockers/08_id4661_score61_p2_4661-Limited_Release_of_Information_Form.pdf',
);

describe('fill_form_field_tooltips', () => {
  it.skipIf(!existsSync(PDF_4661))('sets /TU on checkbox widgets missing tooltips (4661)', async () => {
    const buf = await readFile(PDF_4661);
    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      { op: 'fill_form_field_tooltips', params: {} },
    ]);
    expect(result.success).toBe(true);
    expect(result.applied).toContain('fill_form_field_tooltips');

    const tmp = join(tmpdir(), `pdfaf-4661-tu-${randomUUID()}.pdf`);
    await writeFile(tmp, out);
    try {
      const analysis = await runPythonAnalysis(tmp);
      const missing = analysis.formFields.filter(f => !f.tooltip?.trim());
      expect(missing).toEqual([]);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  });
});

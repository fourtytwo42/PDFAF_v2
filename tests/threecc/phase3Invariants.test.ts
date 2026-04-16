import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const PY = process.env['PYTHON'] ?? 'python3';
const here = dirname(fileURLToPath(import.meta.url));
const helper = join(here, '../../python/pdf_analysis_helper.py');

describe('Phase 3 structure invariants (post-mutate)', () => {
  it('keeps Marked true and structure tree after orphan insert mutator', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-inv-'));
    const pdfPath = join(dir, 'o.pdf');
    execFileSync(PY, [helper, '--write-3cc-orphan', pdfPath], { encoding: 'utf-8' });
    const req = join(dir, 'req.json');
    const outPdf = join(dir, 'out.pdf');
    writeFileSync(
      req,
      JSON.stringify({
        input_path: pdfPath,
        output_path: outPdf,
        mutations: [{ op: 'orphan_v1_insert_p_for_mcid', params: { mcid: 0 } }],
      }),
    );
    const mutOut = execFileSync(PY, [helper, '--mutate', req], { encoding: 'utf-8' });
    const batch = JSON.parse(mutOut) as { success: boolean };
    expect(batch.success).toBe(true);

    const raw = execFileSync(PY, [helper, outPdf], { encoding: 'utf-8' });
    const d = JSON.parse(raw) as {
      markInfo?: { Marked?: boolean } | null;
      structureTree?: unknown;
      isTagged?: boolean;
    };
    expect(d.isTagged).toBe(true);
    expect(d.markInfo?.Marked).toBe(true);
    expect(d.structureTree).not.toBeNull();

    const dump = execFileSync(PY, [helper, '--dump-structure-page', '0', outPdf], { encoding: 'utf-8' });
    const rep = JSON.parse(dump) as { parentTreeNumsPairCount?: number | null };
    expect(rep.parentTreeNumsPairCount ?? 0).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

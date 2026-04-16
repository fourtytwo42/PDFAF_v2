import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';

const PY = process.env['PYTHON'] ?? 'python3';
const here = dirname(fileURLToPath(import.meta.url));
const helper = join(here, '../../python/pdf_analysis_helper.py');

describe('Phase 3 snapshot fields (analyzePdf)', () => {
  it('marks orphan fixture and exposes orphanMcids + mcidTextSpans', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-p3snap-'));
    const pdfPath = join(dir, 'orphan.pdf');
    execFileSync(PY, [helper, '--write-3cc-orphan', pdfPath], { encoding: 'utf-8' });

    const { snapshot } = await analyzePdf(pdfPath, 'orphan.pdf');
    expect(snapshot.threeCcGoldenOrphanV1).toBe(true);
    expect(snapshot.threeCcGoldenV1).toBe(false);
    expect(snapshot.orphanMcids?.some(o => o.page === 0 && o.mcid === 0)).toBe(true);
    const span = snapshot.mcidTextSpans?.find(s => s.mcid === 0);
    expect(span?.resolvedText).toMatch(/Orphan Title/i);
  }, 60_000);
});

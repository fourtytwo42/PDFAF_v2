import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const PY = process.env['PYTHON'] ?? 'python3';
const here = dirname(fileURLToPath(import.meta.url));
const helper = join(here, '../../python/pdf_analysis_helper.py');

describe('Phase 3c-c golden PDF (Python)', () => {
  it('writes golden fixture and analysis marks threeCcGoldenV1 with mcidTextSpans', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-3cc-'));
    const pdfPath = join(dir, 'golden.pdf');
    execFileSync(PY, [helper, '--write-3cc-golden', pdfPath], { encoding: 'utf-8' });
    const raw = execFileSync(PY, [helper, pdfPath], { encoding: 'utf-8' });
    const d = JSON.parse(raw) as {
      threeCcGoldenV1?: boolean;
      mcidTextSpans?: Array<{ page: number; mcid: number }>;
      paragraphStructElems?: Array<{ structRef?: string }>;
    };
    expect(d.threeCcGoldenV1).toBe(true);
    expect(d.mcidTextSpans?.length).toBeGreaterThanOrEqual(1);
    expect(d.mcidTextSpans?.[0]?.mcid).toBe(0);
    expect(d.paragraphStructElems?.length).toBeGreaterThanOrEqual(1);
    const dump = execFileSync(PY, [helper, '--dump-structure-page', '0', pdfPath], { encoding: 'utf-8' });
    const rep = JSON.parse(dump) as { goldenMarker?: boolean; mcidMatches?: unknown[] };
    expect(rep.goldenMarker).toBe(true);
    expect((rep.mcidMatches ?? []).length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('caps mcidTextSpans length invariant (single page stays under MAX_MCID_SPANS)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-3cc-'));
    const pdfPath = join(dir, 'golden2.pdf');
    execFileSync(PY, [helper, '--write-3cc-golden', pdfPath], { encoding: 'utf-8' });
    const raw = execFileSync(PY, [helper, pdfPath], { encoding: 'utf-8' });
    const d = JSON.parse(raw) as { mcidTextSpans?: unknown[] };
    expect((d.mcidTextSpans ?? []).length).toBeLessThanOrEqual(500);
  }, 60_000);

  it('orphan fixture: orphan marker, orphanMcids, resolved MCID text; insert then paragraph row', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-3cc-'));
    const pdfPath = join(dir, 'orphan.pdf');
    execFileSync(PY, [helper, '--write-3cc-orphan', pdfPath], { encoding: 'utf-8' });
    const raw = execFileSync(PY, [helper, pdfPath], { encoding: 'utf-8' });
    const d = JSON.parse(raw) as {
      threeCcGoldenOrphanV1?: boolean;
      threeCcGoldenV1?: boolean;
      orphanMcids?: Array<{ page: number; mcid: number }>;
      mcidTextSpans?: Array<{ mcid: number; resolvedText?: string }>;
      paragraphStructElems?: unknown[];
    };
    expect(d.threeCcGoldenOrphanV1).toBe(true);
    expect(d.threeCcGoldenV1).not.toBe(true);
    expect(d.orphanMcids?.some(o => o.mcid === 0)).toBe(true);
    expect((d.paragraphStructElems ?? []).length).toBe(0);
    const span = d.mcidTextSpans?.find(s => s.mcid === 0);
    expect(span?.resolvedText).toMatch(/Orphan Title/i);

    const req = join(dir, 'mut.json');
    const outPdf = join(dir, 'after.pdf');
    writeFileSync(
      req,
      JSON.stringify({
        input_path: pdfPath,
        output_path: outPdf,
        mutations: [{ op: 'orphan_v1_insert_p_for_mcid', params: { mcid: 0 } }],
      }),
    );
    execFileSync(PY, [helper, '--mutate', req], { encoding: 'utf-8' });
    const raw2 = execFileSync(PY, [helper, outPdf], { encoding: 'utf-8' });
    const d2 = JSON.parse(raw2) as { paragraphStructElems?: Array<{ tag: string }>; orphanMcids?: unknown[] };
    expect((d2.paragraphStructElems ?? []).length).toBeGreaterThanOrEqual(1);
    expect((d2.orphanMcids ?? []).length).toBe(0);
  }, 60_000);

  it('orphan fixture: wrap_singleton_orphan_mcid inserts /P like fixture-specific op', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-3cc-'));
    const pdfPath = join(dir, 'orph-wrap.pdf');
    execFileSync(PY, [helper, '--write-3cc-orphan', pdfPath], { encoding: 'utf-8' });
    const req = join(dir, 'mut-wrap.json');
    const outPdf = join(dir, 'after-wrap.pdf');
    writeFileSync(
      req,
      JSON.stringify({
        input_path: pdfPath,
        output_path: outPdf,
        mutations: [{ op: 'wrap_singleton_orphan_mcid', params: { page: 0, mcid: 0 } }],
      }),
    );
    execFileSync(PY, [helper, '--mutate', req], { encoding: 'utf-8' });
    const raw2 = execFileSync(PY, [helper, outPdf], { encoding: 'utf-8' });
    const d2 = JSON.parse(raw2) as { orphanMcids?: unknown[] };
    expect((d2.orphanMcids ?? []).length).toBe(0);
  }, 60_000);

  it('analysis includes taggedContentAudit with expected keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-3cc-'));
    const pdfPath = join(dir, 'audit.pdf');
    execFileSync(PY, [helper, '--write-3cc-golden', pdfPath], { encoding: 'utf-8' });
    const raw = execFileSync(PY, [helper, pdfPath], { encoding: 'utf-8' });
    const d = JSON.parse(raw) as {
      taggedContentAudit?: {
        orphanMcidCount: number;
        mcidTextSpanCount: number;
        suspectedPathPaintOutsideMc: number;
      };
    };
    expect(d.taggedContentAudit?.orphanMcidCount).toBeDefined();
    expect(d.taggedContentAudit?.mcidTextSpanCount).toBeGreaterThanOrEqual(1);
    expect(typeof d.taggedContentAudit?.suspectedPathPaintOutsideMc).toBe('number');
  }, 60_000);

  it('golden fixture mcidTextSpans includes resolvedText for Tj literal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-3cc-'));
    const pdfPath = join(dir, 'golden-res.pdf');
    execFileSync(PY, [helper, '--write-3cc-golden', pdfPath], { encoding: 'utf-8' });
    const raw = execFileSync(PY, [helper, pdfPath], { encoding: 'utf-8' });
    const d = JSON.parse(raw) as { mcidTextSpans?: Array<{ resolvedText?: string }> };
    const rt = d.mcidTextSpans?.find(() => true)?.resolvedText;
    expect(rt).toMatch(/Golden Title/i);
  }, 60_000);
});

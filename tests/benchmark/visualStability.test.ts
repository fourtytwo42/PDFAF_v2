import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { comparePdfFiles, compareRenderedPages, compareVisualStabilityRun } from '../../src/services/benchmark/visualStability.js';
import { getPdfPageCount } from '../../src/services/semantic/pdfPageRender.js';

function page(width: number, height: number, pixels: number[]): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  return {
    width,
    height,
    data: new Uint8ClampedArray(pixels),
  };
}

describe('compareRenderedPages', () => {
  it('reports zero drift for identical pages', () => {
    const before = page(2, 1, [
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
    const after = page(2, 1, [
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);

    const diff = compareRenderedPages(before, after);

    expect(diff.dimensionMismatch).toBe(false);
    expect(diff.differentPixelCount).toBe(0);
    expect(diff.totalPixelCount).toBe(2);
    expect(diff.differentPixelRatio).toBe(0);
    expect(diff.meanAbsoluteChannelDelta).toBe(0);
    expect(diff.maxChannelDelta).toBe(0);
  });

  it('reports dimension mismatch as visible drift', () => {
    const before = page(1, 1, [0, 0, 0, 255]);
    const after = page(2, 1, [
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]);

    const diff = compareRenderedPages(before, after);

    expect(diff.dimensionMismatch).toBe(true);
    expect(diff.differentPixelCount).toBe(2);
    expect(diff.totalPixelCount).toBe(2);
    expect(diff.differentPixelRatio).toBe(1);
    expect(diff.meanAbsoluteChannelDelta).toBe(255);
    expect(diff.maxChannelDelta).toBe(255);
  });
});

describe('getPdfPageCount', () => {
  it('returns the page count for a real fixture PDF', async () => {
    const pdf = await readFile(resolve('Input/experiment-corpus/00-fixtures/pdfaf_fixture_inaccessible.pdf'));

    const count = await getPdfPageCount(pdf);

    expect(count).toBe(30);
  });
});

describe('comparePdfFiles', () => {
  it('compares every page when requested', async () => {
    const pdfPath = resolve('Input/experiment-corpus/00-fixtures/pdfaf_fixture_inaccessible.pdf');

    const report = await comparePdfFiles({
      beforePath: pdfPath,
      afterPath: pdfPath,
      allPages: true,
    });

    expect(report.stable).toBe(true);
    expect(report.pages).toHaveLength(30);
    expect(report.worstPage?.pageNumber1Based).toBe(1);
  });
});

describe('compareVisualStabilityRun', () => {
  it('reports a stable run using the shared run-level validator', async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), 'pdfaf-visual-run-'));
    try {
      await mkdir(resolve(runDir, 'pdfs'), { recursive: true });
      const fixturePath = resolve('Input/experiment-corpus/00-fixtures/pdfaf_fixture_inaccessible.pdf');
      const fixture = await readFile(fixturePath);
      await writeFile(resolve(runDir, 'pdfs', 'fixture-inaccessible.pdf'), fixture);
      await writeFile(resolve(runDir, 'manifest.snapshot.json'), JSON.stringify({
        runId: 'run-test',
        generatedAt: '2026-04-26T00:00:00.000Z',
        manifestPath: resolve('Input/experiment-corpus/manifest.json'),
        corpusRoot: resolve('Input/experiment-corpus'),
        mode: 'remediate',
        semanticEnabled: false,
        writePdfs: true,
        selectedEntries: [{
          id: 'fixture-inaccessible',
          file: '00-fixtures/pdfaf_fixture_inaccessible.pdf',
          cohort: '00-fixtures',
          sourceType: 'fixture',
          intent: 'fixture',
        }],
      }, null, 2));

      const report = await compareVisualStabilityRun({ runDir, strict: true });

      expect(report.strict).toBe(true);
      expect(report.selectedCount).toBe(1);
      expect(report.comparedCount).toBe(1);
      expect(report.stableCount).toBe(1);
      expect(report.driftCount).toBe(0);
      expect(report.missingCount).toBe(0);
      expect(report.worstRowId).toBe('fixture-inaccessible');
      expect(report.rows[0]?.pageCount).toBe(30);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});

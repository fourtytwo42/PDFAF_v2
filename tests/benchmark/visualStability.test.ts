import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareRenderedPages } from '../../src/services/benchmark/visualStability.js';
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

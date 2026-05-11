import { describe, expect, it } from 'vitest';
import { classifyAnalyzerVariance } from '../../scripts/all-input-analyzer-variance-object-diagnostic.js';

function metrics(overrides: Partial<Parameters<typeof classifyAnalyzerVariance>[0][number]> = {}): Parameters<typeof classifyAnalyzerVariance>[0][number] {
  return {
    score: 59,
    grade: 'F',
    heading: 0,
    alt: 100,
    table: 100,
    pdfua: 79,
    reading: 79,
    pageCount: 10,
    textCharCount: 1000,
    isTagged: true,
    headingCount: 0,
    rootReachableHeadingCount: 0,
    paragraphStructElemCount: 4,
    tableCount: 1,
    checkerVisibleFigureCount: 2,
    checkerVisibleFigureAltCount: 2,
    orphanMcidCount: 0,
    parentTreeMissingMcidEntries: 0,
    tableHeaderDebt: 0,
    irregularTableCount: 0,
    stronglyIrregularTableCount: 0,
    ...overrides,
  };
}

describe('all-input analyzer variance object diagnostic classifier', () => {
  it('classifies stable repeated analysis separately from route volatility', () => {
    expect(classifyAnalyzerVariance([
      metrics(),
      metrics(),
      metrics(),
    ])).toMatchObject({
      classification: 'stable_source_analysis',
      scoreRange: 0,
    });
  });

  it('classifies mixed object variance when multiple evidence families move', () => {
    expect(classifyAnalyzerVariance([
      metrics({ score: 46, heading: 0, alt: 0, table: 0, headingCount: 0, tableCount: 0 }),
      metrics({ score: 59, heading: 60, alt: 88, table: 100, headingCount: 4, tableCount: 2 }),
    ])).toMatchObject({
      classification: 'mixed_object_variance',
      varyingFamilies: expect.arrayContaining(['heading', 'figure_alt', 'table']),
    });
  });

  it('classifies single-family table variance', () => {
    expect(classifyAnalyzerVariance([
      metrics({ score: 69, table: 0, tableCount: 1, irregularTableCount: 4 }),
      metrics({ score: 88, table: 79, tableCount: 1, irregularTableCount: 0 }),
    ])).toMatchObject({
      classification: 'table_object_variance',
      varyingFamilies: ['table'],
    });
  });
});

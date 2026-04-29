import { describe, expect, it } from 'vitest';
import { classifyStage156Residual } from '../../scripts/stage156-mixed-residual-diagnostic.js';

describe('Stage 156 mixed residual diagnostic', () => {
  it('selects figure-alt continuation when safe checker-visible figure targets remain', () => {
    const result = classifyStage156Residual({
      publicationId: 'v1-v1-4453',
      afterScore: 69,
      afterGrade: 'D',
      headingStructure: 100,
      readingOrder: 100,
      altText: 20,
      tableMarkup: 90,
      falsePositiveApplied: 0,
      safeFigureAltCount: 6,
      safeTableHeaderCount: 0,
      safeTableNormalizeCount: 0,
    });

    expect(result.residualClass).toBe('safe_figure_alt_continuation');
    expect(result.recommendedFirstPath).toBe('figure_alt');
  });

  it('selects table continuation when content-backed table targets remain', () => {
    const result = classifyStage156Residual({
      publicationId: 'v1-v1-4519',
      afterScore: 63,
      afterGrade: 'D',
      headingStructure: 80,
      readingOrder: 80,
      altText: 90,
      tableMarkup: 20,
      falsePositiveApplied: 0,
      safeFigureAltCount: 0,
      safeTableHeaderCount: 3,
      safeTableNormalizeCount: 0,
    });

    expect(result.residualClass).toBe('safe_table_markup_continuation');
    expect(result.recommendedFirstPath).toBe('table');
  });

  it('parks known analyzer or OCR volatility rows', () => {
    const result = classifyStage156Residual({
      publicationId: 'v1-v1-3451',
      afterScore: 59,
      afterGrade: 'F',
      headingStructure: 0,
      readingOrder: 96,
      altText: 100,
      tableMarkup: 100,
      falsePositiveApplied: 0,
      safeFigureAltCount: 0,
      safeTableHeaderCount: 0,
      safeTableNormalizeCount: 0,
    });

    expect(result.residualClass).toBe('analyzer_volatility');
    expect(result.recommendedFirstPath).toBe('none');
  });

  it('does not select heading or reading-order dominated rows without figure/table targets', () => {
    const result = classifyStage156Residual({
      publicationId: 'v1-v1-4078',
      afterScore: 70,
      afterGrade: 'C',
      headingStructure: 45,
      readingOrder: 45,
      altText: 100,
      tableMarkup: 100,
      falsePositiveApplied: 0,
      safeFigureAltCount: 0,
      safeTableHeaderCount: 0,
      safeTableNormalizeCount: 0,
    });

    expect(result.residualClass).toBe('heading_or_reading_order_not_this_stage');
    expect(result.recommendedFirstPath).toBe('none');
  });
});

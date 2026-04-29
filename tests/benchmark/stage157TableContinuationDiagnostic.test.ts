import { describe, expect, it } from 'vitest';
import { classifyStage157Table } from '../../scripts/stage157-table-continuation-diagnostic.js';

describe('Stage 157 table continuation diagnostic', () => {
  it('selects clean table header continuation candidates', () => {
    const result = classifyStage157Table({
      publicationId: 'v1-v1-4519',
      afterScore: 74,
      afterGrade: 'C',
      headingStructure: 95,
      readingOrder: 96,
      altText: 100,
      tableMarkup: 35,
      falsePositiveApplied: 0,
      headerTargetCount: 3,
      normalizeTargetCount: 0,
    });

    expect(result.tableClass).toBe('table_header_continuation_candidate');
    expect(result.implementable).toBe(true);
  });

  it('selects table normalization continuation candidates', () => {
    const result = classifyStage157Table({
      publicationId: 'v1-v1-4147',
      afterScore: 69,
      afterGrade: 'D',
      headingStructure: 94,
      readingOrder: 96,
      altText: 100,
      tableMarkup: 0,
      falsePositiveApplied: 0,
      headerTargetCount: 0,
      normalizeTargetCount: 12,
    });

    expect(result.tableClass).toBe('table_normalize_continuation_candidate');
    expect(result.implementable).toBe(true);
  });

  it('parks known analyzer and OCR volatility rows', () => {
    const result = classifyStage157Table({
      publicationId: 'v1-v1-4683',
      afterScore: 60,
      afterGrade: 'D',
      headingStructure: 43,
      readingOrder: 100,
      altText: 20,
      tableMarkup: 6,
      falsePositiveApplied: 0,
      headerTargetCount: 10,
      normalizeTargetCount: 0,
    });

    expect(result.tableClass).toBe('analyzer_volatility');
    expect(result.implementable).toBe(false);
  });

  it('does not select heading or reading-order dominated rows', () => {
    const result = classifyStage157Table({
      publicationId: 'v1-v1-4635',
      afterScore: 44,
      afterGrade: 'F',
      headingStructure: 45,
      readingOrder: 45,
      altText: 20,
      tableMarkup: 0,
      falsePositiveApplied: 0,
      headerTargetCount: 1,
      normalizeTargetCount: 0,
    });

    expect(result.tableClass).toBe('heading_or_reading_order_blocked');
    expect(result.implementable).toBe(false);
  });
});

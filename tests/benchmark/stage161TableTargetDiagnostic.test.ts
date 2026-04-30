import { describe, expect, it } from 'vitest';
import { classifyStage161TableTarget } from '../../scripts/stage161-table-target-diagnostic.js';

const base = {
  publicationId: 'v1-v1-4147',
  afterGrade: 'D',
  headingStructure: 95,
  readingOrder: 96,
  altText: 100,
  tableMarkup: 35,
  falsePositiveApplied: 0,
  safeHeaderTargetCount: 0,
  safeNormalizeTargetCount: 1,
};

describe('Stage 161 table target diagnostic', () => {
  it('selects stable table residual rows with explicit targets', () => {
    const result = classifyStage161TableTarget(base);

    expect(result.tableClass).toBe('stable_explicit_table_target');
    expect(result.implementable).toBe(true);
  });

  it('separates mixed table and alt residuals', () => {
    const result = classifyStage161TableTarget({
      ...base,
      publicationId: 'v1-v1-4453',
      altText: 20,
      safeHeaderTargetCount: 2,
    });

    expect(result.tableClass).toBe('stable_mixed_table_alt_target');
    expect(result.implementable).toBe(true);
  });

  it('rejects route-harm rows blocked by heading or reading order', () => {
    const result = classifyStage161TableTarget({
      ...base,
      publicationId: 'v1-v1-4519',
      headingStructure: 45,
      readingOrder: 45,
    });

    expect(result.tableClass).toBe('heading_or_reading_order_blocked');
    expect(result.implementable).toBe(false);
  });

  it('parks analyzer and OCR volatile rows', () => {
    const result = classifyStage161TableTarget({
      ...base,
      publicationId: 'orig-structure-4076',
    });

    expect(result.tableClass).toBe('analyzer_or_route_volatility');
  });

  it('rejects rows without safe table targets', () => {
    const result = classifyStage161TableTarget({
      ...base,
      safeNormalizeTargetCount: 0,
      safeHeaderTargetCount: 0,
    });

    expect(result.tableClass).toBe('no_safe_table_target');
    expect(result.implementable).toBe(false);
  });
});

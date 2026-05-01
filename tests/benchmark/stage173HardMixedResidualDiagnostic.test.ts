import { describe, expect, it } from 'vitest';
import {
  classifyStage173MixedResidual,
  type Stage173ClassificationInput,
} from '../../scripts/stage173-hard-mixed-residual-diagnostic.js';

function input(overrides: Partial<Stage173ClassificationInput> = {}): Stage173ClassificationInput {
  return {
    altText: 100,
    tableMarkup: 100,
    pdfUaCompliance: 100,
    falsePositiveApplied: 0,
    safeUnattemptedAltTargetCount: 0,
    safeTableTargetCount: 0,
    orphanMcidCount: 0,
    pdfuaOrphanOnly: false,
    ...overrides,
  };
}

describe('Stage 173 hard mixed residual classifier', () => {
  it('selects a single safe alt ownership path only when alt is the sole low category', () => {
    expect(classifyStage173MixedResidual(input({
      altText: 0,
      safeUnattemptedAltTargetCount: 2,
    }))).toMatchObject({
      classification: 'safe_alt_ownership_candidate',
      implementable: true,
    });
  });

  it('selects a single safe table repair path only when table markup is the sole low category', () => {
    expect(classifyStage173MixedResidual(input({
      tableMarkup: 72,
      safeTableTargetCount: 1,
    }))).toMatchObject({
      classification: 'safe_table_repair_candidate',
      implementable: true,
    });
  });

  it('selects a single safe PDF/UA orphan cleanup path only when PDF/UA is the sole low category', () => {
    expect(classifyStage173MixedResidual(input({
      pdfUaCompliance: 71,
      orphanMcidCount: 12,
      pdfuaOrphanOnly: true,
    }))).toMatchObject({
      classification: 'safe_pdfua_orphan_cleanup_candidate',
      implementable: true,
    });
  });

  it('parks 4213-style mixed alt, table, and PDF/UA debt for an ordered transaction stage', () => {
    expect(classifyStage173MixedResidual(input({
      altText: 0,
      tableMarkup: 72,
      pdfUaCompliance: 71,
      safeUnattemptedAltTargetCount: 3,
      safeTableTargetCount: 2,
      orphanMcidCount: 64,
      pdfuaOrphanOnly: true,
    }))).toMatchObject({
      classification: 'mixed_requires_ordered_transaction',
      implementable: false,
    });
  });

  it('does not select a low category without a safe target', () => {
    expect(classifyStage173MixedResidual(input({
      altText: 0,
    }))).toMatchObject({
      classification: 'no_single_safe_path',
      implementable: false,
    });
  });

  it('does not select rows with false-positive-applied evidence', () => {
    expect(classifyStage173MixedResidual(input({
      altText: 0,
      safeUnattemptedAltTargetCount: 2,
      falsePositiveApplied: 1,
    }))).toMatchObject({
      classification: 'no_single_safe_path',
      implementable: false,
    });
  });
});

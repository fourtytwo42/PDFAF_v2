import { describe, expect, it } from 'vitest';
import {
  classifyStage148ReadingOrder,
  type Stage148ReadingOrderEvidence,
} from '../../scripts/stage148-native-reading-order-diagnostic.js';

function evidence(overrides: Partial<Stage148ReadingOrderEvidence> = {}): Stage148ReadingOrderEvidence {
  return {
    publicationId: 'v1-v1-stable',
    afterScore: 69,
    afterGrade: 'D',
    pdfClass: 'native_tagged',
    readingOrderScore: 35,
    headingScore: 90,
    altTextScore: 100,
    tableScore: 100,
    formScore: 100,
    pdfUaScore: 71,
    structureTreeDepth: 4,
    suspiciousPageCount: 2,
    sampledStructurePageOrderDriftCount: 0,
    multiColumnOrderRiskPages: 0,
    paragraphStructElemCount: 24,
    mcidTextSpanCount: 240,
    orphanMcidCount: 0,
    treeHeadingCount: 1,
    extractedHeadingsMissingFromTree: false,
    degenerateStructureTree: false,
    tableBlocked: false,
    formBlocked: false,
    figureAltBlocked: false,
    hasContentBackedStructure: true,
    hasNativeStructureToolAttempt: false,
    hasNativeStructureToolSuccess: false,
    hasReadingOrderToolAttempt: false,
    acceptedTools: [],
    ...overrides,
  };
}

describe('Stage 148 native reading-order diagnostic classifier', () => {
  it('selects native reading-order repair when low reading order has content-backed structure', () => {
    expect(classifyStage148ReadingOrder(evidence())).toMatchObject({
      candidateClass: 'native_reading_order_repair_candidate',
      implementable: true,
    });
  });

  it('parks known analyzer-volatility rows', () => {
    expect(classifyStage148ReadingOrder(evidence({ publicationId: 'orig-structure-4076' }))).toMatchObject({
      candidateClass: 'analyzer_volatility',
      implementable: false,
    });
  });

  it('classifies severe table or form deficits as blockers', () => {
    expect(classifyStage148ReadingOrder(evidence({ tableScore: 0, tableBlocked: true }))).toMatchObject({
      candidateClass: 'table_or_form_blocked_reading_order',
      implementable: false,
    });
    expect(classifyStage148ReadingOrder(evidence({ formScore: 0, formBlocked: true }))).toMatchObject({
      candidateClass: 'table_or_form_blocked_reading_order',
      implementable: false,
    });
  });

  it('does not treat mixed figure/heading debt as reading-order first', () => {
    expect(classifyStage148ReadingOrder(evidence({
      headingScore: 45,
      altTextScore: 20,
      figureAltBlocked: true,
    }))).toMatchObject({
      candidateClass: 'figure_alt_mixed_not_reading_order_first',
      implementable: false,
    });
  });

  it('parks reading-order caps caused by heading reachability debt', () => {
    expect(classifyStage148ReadingOrder(evidence({
      headingScore: 45,
      treeHeadingCount: 0,
      extractedHeadingsMissingFromTree: true,
    }))).toMatchObject({
      candidateClass: 'no_safe_candidate',
      implementable: false,
      reason: 'reading_order_cap_is_heading_reachability_not_native_order',
    });
  });

  it('requires content-backed evidence unless native structure tools already succeeded', () => {
    expect(classifyStage148ReadingOrder(evidence({
      hasContentBackedStructure: false,
      paragraphStructElemCount: 0,
      mcidTextSpanCount: 0,
    }))).toMatchObject({
      candidateClass: 'no_safe_candidate',
      implementable: false,
    });
    expect(classifyStage148ReadingOrder(evidence({
      hasContentBackedStructure: false,
      paragraphStructElemCount: 0,
      mcidTextSpanCount: 0,
      hasNativeStructureToolSuccess: true,
    }))).toMatchObject({
      candidateClass: 'structure_bootstrap_candidate',
      implementable: true,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifyStage184MixedStructural,
  type Stage184ClassificationInput,
} from '../../scripts/stage184-hard2-mixed-structural-diagnostic.js';

function input(overrides: Partial<Stage184ClassificationInput> = {}): Stage184ClassificationInput {
  return {
    score: 50,
    headingStructure: 35,
    readingOrder: 45,
    altText: 20,
    tableMarkup: 0,
    pdfUaCompliance: 71,
    linkQuality: 100,
    falsePositiveApplied: 0,
    extractedHeadingCount: 296,
    treeHeadingCount: 0,
    extractedHeadingsMissingFromTree: true,
    customHeadingRoleCount: 295,
    standardHeadingRoleCount: 0,
    safeTableTargetCount: 2,
    safeAltTargetCount: 0,
    orphanMcidCount: 1,
    annotationRiskCount: 0,
    pdfClass: 'native_tagged',
    ...overrides,
  };
}

describe('Stage 184 hard-holdout-2 mixed structural classifier', () => {
  it('selects 4105-style custom heading role reachability first', () => {
    expect(classifyStage184MixedStructural(input())).toMatchObject({
      classification: 'heading_reachability_first_candidate',
      implementable: true,
    });
  });

  it('parks heading mismatch without custom heading-role evidence', () => {
    expect(classifyStage184MixedStructural(input({
      customHeadingRoleCount: 0,
    }))).toMatchObject({
      classification: 'analyzer_heading_mismatch_debt',
      implementable: false,
    });
  });

  it('selects table first only after heading and reading order are stable', () => {
    expect(classifyStage184MixedStructural(input({
      headingStructure: 94,
      readingOrder: 96,
      extractedHeadingsMissingFromTree: false,
      customHeadingRoleCount: 0,
      standardHeadingRoleCount: 40,
      tableMarkup: 44,
      safeTableTargetCount: 2,
    }))).toMatchObject({
      classification: 'table_first_candidate',
      implementable: true,
    });
  });

  it('does not accept false-positive-applied evidence', () => {
    expect(classifyStage184MixedStructural(input({
      falsePositiveApplied: 1,
    }))).toMatchObject({
      classification: 'no_safe_single_path',
      implementable: false,
    });
  });
});

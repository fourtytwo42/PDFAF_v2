import { describe, expect, it } from 'vitest';
import {
  classifyStage179PartialAlt,
  type Stage179Signals,
} from '../../scripts/stage179-partial-alt-ownership-diagnostic.js';

function signals(overrides: Partial<Stage179Signals> = {}): Stage179Signals {
  return {
    altText: 50,
    pdfUaCompliance: 100,
    linkQuality: 100,
    headingStructure: 98,
    readingOrder: 100,
    tableMarkup: 100,
    figureCount: 0,
    figureWithAltCount: 0,
    checkerVisibleFigureCount: 0,
    checkerVisibleFigureWithAltCount: 0,
    directSafeCheckerVisibleMissingAltCount: 0,
    safeRoleMapRetagTargetCount: 0,
    attemptedAltTargetRefs: [],
    nonFigureWithAltCount: 13,
    emptyNonFigureAltActualCount: 13,
    nestedFigureAltCount: 0,
    orphanedAltEmptyElementCount: 0,
    orphanMcidCount: 0,
    suspectedPathPaintOutsideMc: 0,
    taggedAnnotationRiskCount: 0,
    imageOnlyPageCount: 0,
    ...overrides,
  };
}

describe('Stage 179 partial-alt ownership classifier', () => {
  it('selects empty non-Figure alt/ActualText cleanup candidates', () => {
    expect(classifyStage179PartialAlt({
      id: 'font-3437',
      rowKind: 'primary',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toEqual({
      partialAltClass: 'orphan_figure_alt_ownership_candidate',
      implementable: true,
      reason: 'empty non-Figure /Alt or /ActualText risk(s) can be stripped safely: 13',
    });
  });

  it('selects hidden checker-visible missing-alt targets when present', () => {
    expect(classifyStage179PartialAlt({
      id: 'figure-4754',
      rowKind: 'secondary_mixed',
      falsePositiveApplied: 0,
      signals: signals({
        figureCount: 13,
        checkerVisibleFigureCount: 17,
        checkerVisibleFigureWithAltCount: 4,
        directSafeCheckerVisibleMissingAltCount: 9,
        nonFigureWithAltCount: 0,
        emptyNonFigureAltActualCount: 0,
      }),
    })).toMatchObject({
      partialAltClass: 'hidden_checker_alt_target_candidate',
      implementable: true,
    });
  });

  it('parks mixed table or heading debt rows', () => {
    expect(classifyStage179PartialAlt({
      id: 'font-4057',
      rowKind: 'secondary_mixed',
      falsePositiveApplied: 0,
      signals: signals({ tableMarkup: 44, altText: 20 }),
    })).toMatchObject({
      partialAltClass: 'mixed_table_or_heading_not_alt_first',
      implementable: false,
    });
  });

  it('parks protected or analyzer volatility controls', () => {
    expect(classifyStage179PartialAlt({
      id: 'structure-4076',
      rowKind: 'parked_control',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toMatchObject({
      partialAltClass: 'protected_or_analyzer_volatility',
      implementable: false,
    });
  });

  it('does not select non-empty non-Figure alt debt as an automatic cleanup', () => {
    expect(classifyStage179PartialAlt({
      id: 'structure-4131',
      rowKind: 'primary',
      falsePositiveApplied: 0,
      signals: signals({ nonFigureWithAltCount: 4, emptyNonFigureAltActualCount: 2 }),
    })).toMatchObject({
      partialAltClass: 'no_safe_target',
      implementable: false,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifyStage166MixedTail,
  type Stage166Signals,
} from '../../scripts/stage166-mixed-tail-diagnostic.js';

function signals(overrides: Partial<Stage166Signals> = {}): Stage166Signals {
  return {
    titleLanguage: 100,
    headingStructure: 90,
    bookmarks: 100,
    altText: 100,
    pdfUaCompliance: 90,
    tableMarkup: 100,
    linkQuality: 100,
    readingOrder: 100,
    metadataTitle: 'Report',
    bookmarkCount: 4,
    firstBookmarkTitles: ['Report'],
    headingCount: 8,
    h1Count: 1,
    headingTreeDepth: 2,
    checkerVisibleFigureCount: 0,
    checkerVisibleMissingAltCount: 0,
    directSafeCheckerVisibleMissingAltCount: 0,
    safeRoleMapRetagTargetCount: 0,
    attemptedAltTargetRefs: [],
    irregularTableCount: 0,
    stronglyIrregularTableCount: 0,
    unattemptedStrongTableRefs: [],
    ...overrides,
  };
}

describe('Stage 166 mixed-tail diagnostic classifier', () => {
  it('selects title/bookmark/heading topup when weak title and duplicate H1 debt coexist', () => {
    expect(classifyStage166MixedTail({
      publicationId: 'figure-4754',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({
        titleLanguage: 50,
        headingStructure: 44,
        bookmarks: 65,
        h1Count: 12,
        headingCount: 44,
        altText: 20,
        pdfUaCompliance: 71,
      }),
    })).toEqual({
      mixedTailClass: 'figure_title_bookmark_heading_candidate',
      implementable: true,
      reason: 'filename-like/weak title plus duplicate H1 heading debt (12 H1s, 44 headings)',
    });
  });

  it('selects stable table continuation only when unattempted strong table refs remain', () => {
    expect(classifyStage166MixedTail({
      publicationId: 'font-4057',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({
        tableMarkup: 44,
        headingStructure: 94,
        readingOrder: 96,
        stronglyIrregularTableCount: 2,
        unattemptedStrongTableRefs: ['600_0'],
      }),
    })).toMatchObject({
      mixedTailClass: 'stable_table_continuation_candidate',
      implementable: true,
    });
  });

  it('parks protected analyzer-volatility rows even when candidate-like signals exist', () => {
    expect(classifyStage166MixedTail({
      publicationId: 'long-4683',
      sourceKind: 'legacy_parked_control',
      falsePositiveApplied: 0,
      signals: signals({
        titleLanguage: 50,
        headingStructure: 44,
        h1Count: 10,
        headingCount: 40,
      }),
    })).toMatchObject({
      mixedTailClass: 'protected_or_analyzer_volatility',
      implementable: false,
    });
  });

  it('does not select low-alt rows when PDF/UA or mixed structural risk remains', () => {
    expect(classifyStage166MixedTail({
      publicationId: 'figure-4754',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({
        titleLanguage: 100,
        headingStructure: 86,
        altText: 20,
        pdfUaCompliance: 71,
        directSafeCheckerVisibleMissingAltCount: 7,
      }),
    })).toMatchObject({
      mixedTailClass: 'mixed_alt_pdfua_not_safe',
      implementable: false,
    });
  });

  it('keeps clean controls out of Stage 166 behavior', () => {
    expect(classifyStage166MixedTail({
      publicationId: 'fixture-inaccessible',
      sourceKind: 'legacy_required_control',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toMatchObject({
      mixedTailClass: 'no_safe_candidate',
      implementable: false,
    });
  });
});

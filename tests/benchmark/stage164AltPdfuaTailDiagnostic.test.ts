import { describe, expect, it } from 'vitest';
import {
  classifyStage164AltPdfua,
  type Stage164Signals,
} from '../../scripts/stage164-alt-pdfua-tail-diagnostic.js';

function signals(overrides: Partial<Stage164Signals> = {}): Stage164Signals {
  return {
    altText: 20,
    pdfUaCompliance: 85,
    linkQuality: 90,
    headingStructure: 85,
    readingOrder: 90,
    tableMarkup: 88,
    checkerVisibleFigureCount: 3,
    checkerVisibleFigureWithAltCount: 2,
    checkerVisibleMissingAltCount: 1,
    directSafeCheckerVisibleMissingAltCount: 1,
    contentlessCheckerVisibleMissingAltCount: 0,
    safeRoleMapRetagTargetCount: 0,
    attemptedAltTargetRefs: [],
    terminalFigureToolCount: 0,
    scoreShapeFigureRejectionCount: 0,
    invariantFigureFailureCount: 0,
    ...overrides,
  };
}

describe('Stage 164 alt/PDF-UA diagnostic classifier', () => {
  it('selects direct checker-visible missing-alt rows as stable alt candidates', () => {
    expect(classifyStage164AltPdfua({
      publicationId: 'figure-4754',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toEqual({
      altPdfuaClass: 'stable_checker_visible_alt_candidate',
      implementable: true,
      reason: 'direct checker-visible missing-alt target(s) remain: 1',
    });
  });

  it('classifies low-alt rows with PDF/UA debt as mixed candidates', () => {
    expect(classifyStage164AltPdfua({
      publicationId: 'font-4057',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({ pdfUaCompliance: 50, linkQuality: 74 }),
    })).toMatchObject({
      altPdfuaClass: 'alt_pdfua_mixed_candidate',
      implementable: true,
    });
  });

  it('parks PDF/UA and link residuals when alt coverage is not the limiter', () => {
    expect(classifyStage164AltPdfua({
      publicationId: 'fixture-inaccessible',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({
        altText: 88,
        pdfUaCompliance: 71,
        linkQuality: 73,
        checkerVisibleMissingAltCount: 0,
        directSafeCheckerVisibleMissingAltCount: 0,
      }),
    })).toMatchObject({
      altPdfuaClass: 'link_pdfua_primary_not_alt',
      implementable: false,
    });
  });

  it('keeps protected volatility rows out of Stage 164 behavior', () => {
    expect(classifyStage164AltPdfua({
      publicationId: 'short-4176',
      sourceKind: 'legacy_parked_control',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toMatchObject({
      altPdfuaClass: 'heading_or_analyzer_volatility',
      implementable: false,
    });
  });

  it('rejects contentless checker-visible targets instead of broadening alt assignment', () => {
    expect(classifyStage164AltPdfua({
      publicationId: 'long-4680',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({
        checkerVisibleMissingAltCount: 2,
        directSafeCheckerVisibleMissingAltCount: 0,
        contentlessCheckerVisibleMissingAltCount: 2,
        safeRoleMapRetagTargetCount: 0,
      }),
    })).toMatchObject({
      altPdfuaClass: 'visual_risk_or_no_safe_target',
      implementable: false,
    });
  });
});

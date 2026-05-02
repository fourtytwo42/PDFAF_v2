import { describe, expect, it } from 'vitest';
import {
  classifyStage178AltPdfua,
  type Stage178Signals,
} from '../../scripts/stage178-alt-pdfua-residual-diagnostic.js';

function signals(overrides: Partial<Stage178Signals> = {}): Stage178Signals {
  return {
    altText: 20,
    pdfUaCompliance: 71,
    linkQuality: 100,
    headingStructure: 86,
    readingOrder: 100,
    tableMarkup: 100,
    checkerVisibleFigureCount: 12,
    checkerVisibleFigureWithAltCount: 1,
    directSafeCheckerVisibleMissingAltCount: 4,
    safeRoleMapRetagTargetCount: 0,
    attemptedAltTargetRefs: ['1_0', '2_0', '3_0'],
    terminalFigureToolCount: 0,
    orphanMcidCount: 0,
    suspectedPathPaintOutsideMc: 0,
    taggedAnnotationRiskCount: 0,
    ...overrides,
  };
}

describe('Stage 178 alt/PDF-UA residual classifier', () => {
  it('selects stable direct checker-visible alt candidates', () => {
    expect(classifyStage178AltPdfua({
      id: 'figure-4754',
      rowKind: 'primary',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toEqual({
      altPdfuaClass: 'stable_checker_visible_alt_candidate',
      implementable: true,
      reason: 'direct checker-visible missing-alt target(s) remain: 4',
    });
  });

  it('selects stable alt ownership repair candidates from safe retag evidence', () => {
    expect(classifyStage178AltPdfua({
      id: 'font-4057',
      rowKind: 'mixed',
      falsePositiveApplied: 0,
      signals: signals({
        directSafeCheckerVisibleMissingAltCount: 0,
        safeRoleMapRetagTargetCount: 2,
        tableMarkup: 88,
      }),
    })).toMatchObject({
      altPdfuaClass: 'stable_alt_ownership_repair_candidate',
      implementable: true,
    });
  });

  it('selects PDF/UA cleanup only after alt is stable and concrete cleanup evidence exists', () => {
    expect(classifyStage178AltPdfua({
      id: 'near-pass',
      rowKind: 'extra_control',
      falsePositiveApplied: 0,
      signals: signals({
        altText: 100,
        pdfUaCompliance: 71,
        directSafeCheckerVisibleMissingAltCount: 0,
        orphanMcidCount: 3,
      }),
    })).toMatchObject({
      altPdfuaClass: 'alt_pdfua_orphan_cleanup_candidate',
      implementable: true,
    });
  });

  it('parks protected and analyzer volatile rows', () => {
    expect(classifyStage178AltPdfua({
      id: 'long-4683',
      rowKind: 'parked_control',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toMatchObject({
      altPdfuaClass: 'protected_or_analyzer_volatility',
      implementable: false,
    });
  });

  it('parks mixed rows instead of using them for a single alt path', () => {
    expect(classifyStage178AltPdfua({
      id: 'font-4057',
      rowKind: 'mixed',
      falsePositiveApplied: 0,
      signals: signals({
        directSafeCheckerVisibleMissingAltCount: 0,
        safeRoleMapRetagTargetCount: 0,
        tableMarkup: 44,
      }),
    })).toMatchObject({
      altPdfuaClass: 'mixed_alt_table_heading_candidate',
      implementable: false,
    });
  });
});

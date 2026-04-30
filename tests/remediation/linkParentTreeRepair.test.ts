import { describe, expect, it } from 'vitest';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';
import {
  shouldTryStage165LinkParentTreeRepair,
  stage165LinkParentTreeBenefit,
} from '../../src/services/remediation/linkParentTreeRepair.js';

function analysis(score = 79, overrides: Record<string, number> = {}): AnalysisResult {
  const defaults: Record<string, number> = {
    heading_structure: 96,
    reading_order: 76,
    alt_text: 72,
    table_markup: 100,
    link_quality: 73,
    pdf_ua_compliance: 71,
  };
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    pdfClass: 'native_tagged',
    categories: Object.entries({ ...defaults, ...overrides }).map(([key, categoryScore]) => ({
      key,
      score: categoryScore,
    })),
  } as unknown as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 2,
    textCharCount: 1200,
    isTagged: true,
    structureTree: {},
    links: [{ text: 'More information', url: 'https://example.test' }],
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 6,
      nonLinkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 6,
      nonLinkAnnotationsMissingStructParent: 0,
    },
    detectionProfile: {
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 6,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 6,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    },
    fonts: [],
    ...overrides,
  } as unknown as DocumentSnapshot;
}

describe('Stage 165 link ParentTree repair helpers', () => {
  it('selects small link ownership debt on stable near-pass tagged PDFs', () => {
    expect(shouldTryStage165LinkParentTreeRepair({
      analysis: analysis(),
      snapshot: snapshot(),
      protectedFloorScore: 77,
    })).toBe(true);
  });

  it('skips protected rows that are already below their protected floor', () => {
    expect(shouldTryStage165LinkParentTreeRepair({
      analysis: analysis(79),
      snapshot: snapshot(),
      protectedFloorScore: 89,
    })).toBe(false);
  });

  it('skips large annotation debt handled by the Stage 162 path', () => {
    expect(shouldTryStage165LinkParentTreeRepair({
      analysis: analysis(),
      snapshot: snapshot({
        annotationAccessibility: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 50,
          nonLinkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingContents: 0,
          linkAnnotationsMissingStructParent: 50,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        detectionProfile: {
          annotationSignals: {
            pagesMissingTabsS: 0,
            pagesAnnotationOrderDiffers: 0,
            linkAnnotationsMissingStructure: 50,
            nonLinkAnnotationsMissingStructure: 0,
            linkAnnotationsMissingStructParent: 50,
            nonLinkAnnotationsMissingStructParent: 0,
          },
        } as DocumentSnapshot['detectionProfile'],
      }),
      protectedFloorScore: null,
    })).toBe(false);
  });

  it('accepts evidence-preserving link ownership improvement with stable score', () => {
    const decision = stage165LinkParentTreeBenefit({
      beforeAnalysis: analysis(79),
      afterAnalysis: analysis(79, { link_quality: 83, pdf_ua_compliance: 83 }),
      beforeSnapshot: snapshot(),
      afterSnapshot: snapshot({
        annotationAccessibility: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingContents: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        detectionProfile: {
          annotationSignals: {
            pagesMissingTabsS: 0,
            pagesAnnotationOrderDiffers: 0,
            linkAnnotationsMissingStructure: 0,
            nonLinkAnnotationsMissingStructure: 0,
            linkAnnotationsMissingStructParent: 0,
            nonLinkAnnotationsMissingStructParent: 0,
          },
        } as DocumentSnapshot['detectionProfile'],
      }),
    });

    expect(decision).toMatchObject({
      safe: true,
      beforeDebt: 12,
      afterDebt: 0,
    });
  });

  it('rejects link repair if a core category regresses', () => {
    const decision = stage165LinkParentTreeBenefit({
      beforeAnalysis: analysis(),
      afterAnalysis: analysis(79, { reading_order: 65, link_quality: 83 }),
      beforeSnapshot: snapshot(),
      afterSnapshot: snapshot(),
    });

    expect(decision).toMatchObject({
      safe: false,
      reason: 'core_category_regressed',
    });
  });
});

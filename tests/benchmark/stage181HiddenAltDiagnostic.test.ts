import { describe, expect, it } from 'vitest';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import { classifyStage181HiddenAlt } from '../../src/services/remediation/stage181HiddenAlt.js';

function analysis(overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 86,
    reading_order: 100,
    alt_text: 20,
    table_markup: 100,
    link_quality: 100,
    pdf_ua_compliance: 71,
    ...overrides,
  };
  return {
    score: 81,
    grade: 'B',
    pdfClass: 'native_tagged',
    categories: Object.entries(categories).map(([key, score]) => ({
      key: key as CategoryKey,
      score: score ?? 0,
      applicable: true,
    })),
    issues: [],
    suggestions: [],
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 10,
    textByPage: ['title'],
    textCharCount: 5000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Title', page: 0, structRef: '10_0' }],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 10, suspectedPathPaintOutsideMc: 0 },
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
      pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      readingOrderSignals: {
        missingStructureTree: false,
        structureTreeDepth: 4,
        degenerateStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 0,
      },
      headingSignals: {
        extractedHeadingCount: 1,
        treeHeadingCount: 1,
        headingTreeDepth: 2,
        extractedHeadingsMissingFromTree: false,
      },
      figureSignals: {
        extractedFigureCount: 1,
        treeFigureCount: 1,
        nonFigureRoleCount: 0,
        treeFigureMissingForExtractedFigures: false,
      },
      listSignals: {
        listItemMisplacedCount: 0,
        lblBodyMisplacedCount: 0,
        listsWithoutItems: 0,
      },
      tableSignals: {
        tablesWithMisplacedCells: 0,
        misplacedCellCount: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
        directCellUnderTableCount: 0,
      },
      sampledPages: [0],
      confidence: 'high',
    },
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    ...overrides,
  } as unknown as DocumentSnapshot;
}

describe('Stage 181 diagnostic classification', () => {
  it('classifies hidden checker-visible alt targets', () => {
    expect(classifyStage181HiddenAlt({
      analysis: analysis(),
      snapshot: snapshot({
        figures: [
          { structRef: '1966_0', page: 1, hasAlt: false, isArtifact: false, role: 'Figure', rawRole: 'Figure', reachable: true, directContent: true, subtreeMcidCount: 1 },
        ],
        checkerFigureTargets: [
          { structRef: '1966_0', page: 1, hasAlt: false, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
        ],
      }),
    })).toMatchObject({
      classification: 'hidden_checker_visible_alt_target',
      shouldAttempt: true,
    });
  });

  it('classifies role-map alt ownership candidates', () => {
    expect(classifyStage181HiddenAlt({
      analysis: analysis({ alt_text: 60 }),
      snapshot: snapshot({
        figures: [
          { structRef: '75_0', page: 0, hasAlt: false, isArtifact: false, role: 'Figure', rawRole: 'InlineShape', reachable: true, directContent: true, subtreeMcidCount: 1 },
        ],
        checkerFigureTargets: [
          { structRef: 'done_0', page: 0, hasAlt: true, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
        ],
      }),
    })).toMatchObject({
      classification: 'orphan_figure_alt_ownership_candidate',
      shouldAttempt: true,
    });
  });

  it('parks protected or analyzer volatility controls', () => {
    expect(classifyStage181HiddenAlt({
      analysis: analysis(),
      snapshot: snapshot(),
      parked: true,
    })).toMatchObject({
      classification: 'mixed_heading_or_protected_volatility',
      shouldAttempt: false,
    });
  });
});


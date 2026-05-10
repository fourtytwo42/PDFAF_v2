import { describe, expect, it } from 'vitest';
import {
  classifyVisibleTitleAnchorGap,
  selectExternalVisibleTitleSeed,
} from '../../scripts/all-input-visible-title-anchor-diagnostic.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    filename: '0034-test.pdf',
    score: 35,
    grade: 'F',
    pdfClass: 'native_untagged',
    categories: [
      { key: 'heading_structure', score: 0, applicable: true, weight: 1, severity: 'failure', findings: [] },
      { key: 'reading_order', score: 30, applicable: true, weight: 1, severity: 'failure', findings: [] },
    ],
    failureFamily: 'structure_reading_order_heavy',
    routingHints: [],
    manualReviewReasons: [],
    scoreCapsApplied: [],
    verificationLevel: 'verified',
    measurementStatus: 'measured',
    ...overrides,
  } as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 12,
    textCharCount: 12000,
    isTagged: false,
    metadata: { title: '', language: '', author: '', subject: '', creator: '', producer: '' },
    structTitle: null,
    headings: [],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    paragraphStructElems: [],
    structureTree: null,
    orphanMcids: [],
    mcidTextSpans: [],
    nativeTitleBtCandidates: [],
    detectionProfile: {
      readingOrderSignals: {
        missingStructureTree: true,
        structureTreeDepth: 0,
        degenerateStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 0,
      },
      headingSignals: {
        extractedHeadingCount: 0,
        treeHeadingCount: 0,
        headingTreeDepth: 0,
        extractedHeadingsMissingFromTree: false,
      },
      figureSignals: {
        extractedFigureCount: 0,
        treeFigureCount: 0,
        nonFigureRoleCount: 0,
        treeFigureMissingForExtractedFigures: false,
      },
      pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      tableSignals: {
        tablesWithMisplacedCells: 0,
        misplacedCellCount: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
        directCellUnderTableCount: 0,
      },
      listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
    },
    ...overrides,
  } as DocumentSnapshot;
}

describe('all-input visible title anchor diagnostic', () => {
  it('selects a bookmark title only when pdftotext pages contain the title', () => {
    const seed = selectExternalVisibleTitleSeed({
      bookmarks: [
        'Page 1',
        '2022 Victim Service Planning Research Report (2)',
        'Acknowledgements',
      ],
      metadataTitle: '',
      textPages: [
        'Compiled by someone Governor State of Illinois',
        '2022 Victim Service Planning Research Report August 2023 Prepared by Research Staff',
      ],
    });

    expect(seed).toEqual(expect.objectContaining({
      source: 'bookmark',
      text: '2022 Victim Service Planning Research Report',
      page: 1,
    }));
  });

  it('classifies native untagged zero-heading rows with external title evidence as a gap', () => {
    const seed = selectExternalVisibleTitleSeed({
      bookmarks: ['2022 Victim Service Planning Research Report'],
      textPages: ['cover', '2022 Victim Service Planning Research Report August 2023'],
    });
    const result = classifyVisibleTitleAnchorGap({
      analysis: analysis(),
      snapshot: snapshot(),
      internalCandidate: null,
      internalActive: false,
      internalClass: 'no_safe_candidate',
      seed,
    });

    expect(result.classification).toBe('bookmark_visible_text_anchor_gap');
    expect(result.recommendation).toContain('existing-mutator probe');
  });

  it('does not classify rows with existing internal anchors as fallback candidates', () => {
    const result = classifyVisibleTitleAnchorGap({
      analysis: analysis(),
      snapshot: snapshot(),
      internalCandidate: { text: 'Known internal title' },
      internalActive: true,
      internalClass: 'visible_anchor_candidate',
      seed: {
        text: 'External Title',
        source: 'bookmark',
        page: 1,
        pageTextPrefix: 'External Title',
        score: 85,
        reasons: [],
      },
    });

    expect(result.classification).toBe('existing_internal_anchor_candidate');
  });

  it('rejects generated weak bookmark titles', () => {
    expect(selectExternalVisibleTitleSeed({
      bookmarks: ['Page 1', 'Table of Contents', 'Prepared by Research Staff'],
      textPages: ['Page 1 Table of Contents Prepared by Research Staff'],
    })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { buildIcjiaParity, isFilenameLikeTitle } from '../../src/services/compliance/icjiaParity.js';
import type { DocumentSnapshot } from '../../src/types.js';

function makeSnap(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 6,
    textByPage: Array(6).fill('Readable page text'),
    textCharCount: 2000,
    imageOnlyPageCount: 0,
    metadata: { title: 'Quarterly Report', language: 'en-US' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [
      { level: 1, text: 'Quarterly Report', page: 0 },
      { level: 2, text: 'Findings', page: 1 },
    ],
    figures: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: {
      type: 'Document',
      children: [{ type: 'Sect', children: [{ type: 'H1', children: [] }, { type: 'P', children: [] }] }],
    },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    detectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        structureTreeDepth: 2,
        degenerateStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 1,
      },
      headingSignals: {
        extractedHeadingCount: 2,
        treeHeadingCount: 1,
        headingTreeDepth: 2,
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
      listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    ...overrides,
  };
}

describe('icjiaParity', () => {
  it('rejects filename-like titles', () => {
    expect(isFilenameLikeTitle('report_v3_final')).toBe(true);
    expect(isFilenameLikeTitle('report.pdf')).toBe(true);
    expect(isFilenameLikeTitle('Quarterly Report')).toBe(false);
  });

  it('floors reading_order at 30 when structure depth is <= 1', () => {
    const parity = buildIcjiaParity(makeSnap({
      structureTree: { type: 'Document', children: [] },
      detectionProfile: {
        ...makeSnap().detectionProfile!,
        readingOrderSignals: {
          ...makeSnap().detectionProfile!.readingOrderSignals,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
        },
      },
    }));
    expect(parity.categories.reading_order.score).toBe(30);
  });

  it('caps text extractability at 85 when non-embedded fonts remain', () => {
    const parity = buildIcjiaParity(makeSnap({
      fonts: [{ name: 'Arial', isEmbedded: false, hasUnicode: true }],
    }));
    expect(parity.categories.text_extractability.score).toBe(85);
  });

  it('counts duplicate H1 headings as a parity heading failure', () => {
    const parity = buildIcjiaParity(makeSnap({
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 1, text: 'B', page: 1 },
      ],
    }));
    expect(parity.categories.heading_structure.score).toBe(94);
  });
});

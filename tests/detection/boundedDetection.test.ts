import { describe, expect, it } from 'vitest';
import { deriveDetectionProfile } from '../../src/services/detection/boundedDetection.js';
import type { DocumentSnapshot } from '../../src/types.js';

function makeSnapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 6,
    textByPage: [
      'Report Header\nIntro text\nPage 1 footer',
      'Report Header\nBody text\nPage 2 footer',
      'Report Header\nBody text\nPage 3 footer',
      'Report Header\nBody text\nPage 4 footer',
      'Report Header\nBody text\nPage 5 footer',
      'Report Header\nBody text\nPage 6 footer',
    ],
    textCharCount: 1200,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [{ text: 'Example', url: 'https://example.com', page: 2 }],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Doc',
    headings: [
      { level: 1, text: 'Intro', page: 0 },
      { level: 1, text: 'Results', page: 4 },
      { level: 1, text: 'Appendix', page: 2 },
    ],
    figures: [{ hasAlt: false, isArtifact: false, page: 3 }],
    tables: [
      {
        hasHeaders: false,
        headerCount: 0,
        totalCells: 6,
        page: 2,
        cellsMisplacedCount: 2,
        irregularRows: 3,
      },
    ],
    paragraphStructElems: [
      { tag: 'P', text: 'a', page: 0, structRef: '1_0', bbox: [50, 700, 250, 720] },
      { tag: 'P', text: 'b', page: 0, structRef: '1_1', bbox: [320, 700, 520, 720] },
      { tag: 'P', text: 'c', page: 4, structRef: '1_2', bbox: [50, 650, 250, 670] },
      { tag: 'P', text: 'd', page: 4, structRef: '1_3', bbox: [320, 650, 520, 670] },
      { tag: 'P', text: 'e', page: 2, structRef: '1_4', bbox: [50, 600, 250, 620] },
      { tag: 'P', text: 'f', page: 2, structRef: '1_5', bbox: [320, 600, 520, 620] },
      { tag: 'P', text: 'g', page: 2, structRef: '1_6', bbox: [50, 550, 250, 570] },
      { tag: 'P', text: 'h', page: 2, structRef: '1_7', bbox: [320, 550, 520, 570] },
    ],
    threeCcGoldenV1: false,
    threeCcGoldenOrphanV1: false,
    orphanMcids: [{ page: 2, mcid: 7 }],
    mcidTextSpans: [],
    taggedContentAudit: {
      orphanMcidCount: 1,
      mcidTextSpanCount: 4,
      suspectedPathPaintOutsideMc: 12,
    },
    acrobatStyleAltRisks: {
      nonFigureWithAltCount: 0,
      nestedFigureAltCount: 0,
      orphanedAltEmptyElementCount: 0,
    },
    listStructureAudit: {
      listCount: 1,
      listItemCount: 1,
      listItemMisplacedCount: 1,
      lblBodyMisplacedCount: 1,
      listsWithoutItems: 1,
    },
    annotationAccessibility: {
      pagesMissingTabsS: 1,
      pagesAnnotationOrderDiffers: 2,
      linkAnnotationsMissingStructure: 1,
      nonLinkAnnotationsMissingStructure: 1,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 1,
      nonLinkAnnotationsMissingStructParent: 1,
    },
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

describe('deriveDetectionProfile', () => {
  it('derives bounded structural signals from existing snapshot data', () => {
    const profile = deriveDetectionProfile(makeSnapshot());
    expect(profile.sampledPages.length).toBeGreaterThan(0);
    expect(profile.readingOrderSignals.headerFooterPollutionRisk).toBe(true);
    expect(profile.readingOrderSignals.sampledStructurePageOrderDriftCount).toBeGreaterThan(0);
    expect(profile.readingOrderSignals.multiColumnOrderRiskPages).toBeGreaterThan(0);
    expect(profile.pdfUaSignals.orphanMcidCount).toBe(1);
    expect(profile.annotationSignals.linkAnnotationsMissingStructParent).toBe(1);
    expect(profile.listSignals.listsWithoutItems).toBe(1);
    expect(profile.tableSignals.stronglyIrregularTableCount).toBe(1);
  });

  it('uses deterministic capped sampling for suspicious pages', () => {
    const profile = deriveDetectionProfile(makeSnapshot({ pageCount: 20, textByPage: Array(20).fill('body') }));
    expect(profile.sampledPages.length).toBeLessThanOrEqual(10);
    expect([...profile.sampledPages].sort((a, b) => a - b)).not.toEqual(profile.sampledPages);
  });
});

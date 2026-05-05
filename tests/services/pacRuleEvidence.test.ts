import { describe, expect, it } from 'vitest';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../../src/services/compliance/pacRuleEvidence.js';
import type { DocumentSnapshot } from '../../src/types.js';

function baseDetectionProfile(): NonNullable<DocumentSnapshot['detectionProfile']> {
  return {
    readingOrderSignals: {
      missingStructureTree: false,
      structureTreeDepth: 2,
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
      extractedFigureCount: 0,
      treeFigureCount: 0,
      nonFigureRoleCount: 0,
      treeFigureMissingForExtractedFigures: false,
    },
    pdfUaSignals: {
      orphanMcidCount: 0,
      suspectedPathPaintOutsideMc: 0,
      taggedAnnotationRiskCount: 0,
    },
    annotationSignals: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingStructure: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
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
  };
}

function makeSnap(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 3,
    textByPage: ['Title', 'Body', 'End'],
    textCharCount: 1000,
    imageOnlyPageCount: 0,
    metadata: {
      title: 'Quarterly Accessibility Report',
      language: 'en-US',
      author: '',
      subject: '',
    },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true, Suspects: false },
    viewerPreferences: { displayDocTitle: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Quarterly Accessibility Report',
    headings: [{ level: 1, text: 'Quarterly Accessibility Report', page: 0 }],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    paragraphStructElems: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: {
      type: 'Document',
      children: [{ type: 'Sect', children: [{ type: 'H1', children: [] }, { type: 'P', children: [] }] }],
    },
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
    },
    taggedContentAudit: {
      orphanMcidCount: 0,
      mcidTextSpanCount: 0,
      suspectedPathPaintOutsideMc: 0,
    },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    detectionProfile: baseDetectionProfile(),
    ...overrides,
  };
}

function byId(rows: PacRuleEvidence[], ruleId: string): PacRuleEvidence {
  const row = rows.find(r => r.ruleId === ruleId);
  if (!row) throw new Error(`Missing rule ${ruleId}`);
  return row;
}

describe('buildPacRuleEvidence', () => {
  it('emits clean passes for core metadata, MarkInfo, structure, language, and orphan MCIDs', () => {
    const rows = buildPacRuleEvidence(makeSnap());

    expect(byId(rows, 'pdfua.metadata.xmp_present').status).toBe('pass');
    expect(byId(rows, 'pdfua.metadata.title_present').status).toBe('pass');
    expect(byId(rows, 'pdfua.metadata.pdfua_identifier_present').status).toBe('pass');
    expect(byId(rows, 'pdfua.settings.marked_true').status).toBe('pass');
    expect(byId(rows, 'pdfua.settings.suspects_absent_or_false').status).toBe('pass');
    expect(byId(rows, 'pdfua.settings.display_doc_title_present_or_unknown').status).toBe('pass');
    expect(byId(rows, 'pdfua.language.document_lang_present').status).toBe('pass');
    expect(byId(rows, 'pdfua.language.document_lang_syntax_valid').status).toBe('pass');
    expect(byId(rows, 'pdfua.structure.struct_tree_present').status).toBe('pass');
    expect(byId(rows, 'pdfua.content.orphan_mcids_absent').status).toBe('pass');
  });

  it('fails missing PDF/UA identifier', () => {
    const rows = buildPacRuleEvidence(makeSnap({ pdfUaVersion: null }));

    expect(byId(rows, 'pdfua.metadata.pdfua_identifier_present').status).toBe('fail');
  });

  it('fails PAC catalog settings when Suspects is true or DisplayDocTitle is missing', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      markInfo: { Marked: true, Suspects: true },
      viewerPreferences: { displayDocTitle: false },
    }));

    expect(byId(rows, 'pdfua.settings.suspects_absent_or_false')).toMatchObject({
      status: 'fail',
      confidence: 'verified',
    });
    expect(byId(rows, 'pdfua.settings.display_doc_title_present_or_unknown')).toMatchObject({
      status: 'fail',
      confidence: 'verified',
    });
  });

  it('marks DisplayDocTitle not applicable when title is missing', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      metadata: { ...makeSnap().metadata, title: '' },
      structTitle: '',
      viewerPreferences: { displayDocTitle: false },
    }));

    expect(byId(rows, 'pdfua.metadata.title_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.settings.display_doc_title_present_or_unknown').status).toBe('not_applicable');
  });

  it('fails missing and malformed document language evidence', () => {
    const missing = buildPacRuleEvidence(makeSnap({
      lang: null,
      metadata: { ...makeSnap().metadata, language: '' },
    }));
    expect(byId(missing, 'pdfua.language.document_lang_present').status).toBe('fail');
    expect(byId(missing, 'pdfua.language.document_lang_syntax_valid').status).toBe('not_applicable');

    const malformed = buildPacRuleEvidence(makeSnap({ lang: 'not valid lang' }));
    expect(byId(malformed, 'pdfua.language.document_lang_present').status).toBe('pass');
    expect(byId(malformed, 'pdfua.language.document_lang_syntax_valid').status).toBe('fail');
  });

  it('fails informative Figure without alt', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      figures: [{
        hasAlt: false,
        isArtifact: false,
        page: 1,
        role: 'Figure',
        structRef: '12_0',
      }],
    }));

    const rule = byId(rows, 'pdfua.figure.alt_present');
    expect(rule.status).toBe('fail');
    expect(rule.count).toBe(1);
    expect(rule.source?.structRef).toBe('12_0');
  });

  it('fails checker-visible Figure without alt', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 2,
        role: 'Figure',
        resolvedRole: 'Figure',
        reachable: true,
        directContent: true,
        parentPath: ['Document', 'Figure'],
        structRef: '18_0',
      }],
    }));

    expect(byId(rows, 'pdfua.figure.checker_visible_alt_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.figure.checker_visible_alt_present').source?.structRef).toBe('18_0');
  });

  it('warns on weak figure alt', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      figures: [{
        hasAlt: true,
        altText: 'Image',
        isArtifact: false,
        page: 0,
        role: 'Figure',
      }],
    }));

    expect(byId(rows, 'pdfua.figure.alt_not_weak').status).toBe('warn');
    expect(byId(rows, 'pdfua.quality.alt_not_generated').status).toBe('warn');
  });

  it('fails annotation and ParentTree debt from annotationAccessibility', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      annotationAccessibility: {
        pagesMissingTabsS: 2,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 3,
        nonLinkAnnotationsMissingStructure: 1,
        nonLinkAnnotationsMissingContents: 4,
        linkAnnotationsMissingStructParent: 5,
        nonLinkAnnotationsMissingStructParent: 1,
      },
    }));

    expect(byId(rows, 'pdfua.parent_tree.annotation_struct_parent_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.annotations.tagged_annotations_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.annotations.tab_order_structure').status).toBe('fail');
    expect(byId(rows, 'pdfua.annotations.nonlink_contents_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.annotation.alt_or_contents_present').status).toBe('fail');
  });

  it('fails direct cells under Table and irregular rows', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      tables: [{
        hasHeaders: false,
        headerCount: 0,
        totalCells: 6,
        page: 0,
        rowCount: 2,
        cellsMisplacedCount: 2,
        irregularRows: 2,
        rowCellCounts: [2, 4],
      }],
      detectionProfile: {
        ...baseDetectionProfile(),
        tableSignals: {
          tablesWithMisplacedCells: 1,
          misplacedCellCount: 2,
          irregularTableCount: 1,
          stronglyIrregularTableCount: 1,
          directCellUnderTableCount: 2,
        },
      },
    }));

    expect(byId(rows, 'pdfua.table.headers_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.table.cells_nested_under_rows').status).toBe('fail');
    expect(byId(rows, 'pdfua.table.rows_regular').status).toBe('fail');
    expect(byId(rows, 'pdfua.table.strong_regular_structure').status).toBe('fail');
  });

  it('fails orphan MCIDs and path-paint audit rules', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      taggedContentAudit: {
        orphanMcidCount: 3,
        mcidTextSpanCount: 5,
        suspectedPathPaintOutsideMc: 2,
      },
      detectionProfile: {
        ...baseDetectionProfile(),
        pdfUaSignals: {
          orphanMcidCount: 3,
          suspectedPathPaintOutsideMc: 2,
          taggedAnnotationRiskCount: 0,
        },
      },
    }));

    expect(byId(rows, 'pdfua.content.orphan_mcids_absent').status).toBe('fail');
    expect(byId(rows, 'pdfua.content.path_paint_tagged_or_artifacted').status).toBe('fail');
  });

  it('warns on filename-like title', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      metadata: { ...makeSnap().metadata, title: 'report_final_v3.pdf' },
      structTitle: '',
    }));

    expect(byId(rows, 'pdfua.quality.title_not_filename_like').status).toBe('warn');
  });

  it('marks structure-child rules not applicable when no structure is present', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      isTagged: false,
      markInfo: null,
      structureTree: null,
      detectionProfile: {
        ...baseDetectionProfile(),
        readingOrderSignals: {
          ...baseDetectionProfile().readingOrderSignals,
          missingStructureTree: true,
          structureTreeDepth: 0,
        },
      },
    }));

    expect(byId(rows, 'pdfua.structure.struct_tree_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.parent_tree.annotation_struct_parent_present').status).toBe('not_applicable');
    expect(byId(rows, 'pdfua.annotations.tagged_annotations_present').status).toBe('not_applicable');
    expect(byId(rows, 'pdfua.content.orphan_mcids_absent').status).toBe('not_applicable');
  });
});

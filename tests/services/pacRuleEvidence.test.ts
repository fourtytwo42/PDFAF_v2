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
    parentTreeAudit: {
      missingParentTree: false,
      pagesMissingStructParents: 0,
      missingMcidParentTreeEntries: 0,
      invalidParentTreeEntries: 0,
      annotationReferenceMismatchCount: 0,
      objectReferenceMismatchCount: 0,
    },
    contentTaggingAudit: {
      textOutsideMarkedContentOrArtifact: 0,
      imageOutsideMarkedContentOrArtifact: 0,
      pathOutsideMarkedContentOrArtifact: 0,
      artifactInsideTaggedContent: 0,
      taggedContentInsideArtifact: 0,
      contentOutsidePageBounds: 0,
    },
    tableHeaderAudit: {
      tablesChecked: 0,
      headerAssociationMissingCount: 0,
      orphanHeaderCellCount: 0,
      dataCellsWithoutHeaderCount: 0,
    },
    fontSyntaxAudit: {
      fontsChecked: 1,
      missingToUnicodeCMapCount: 0,
      invalidToUnicodeCMapCount: 0,
      cidToGidMapRiskCount: 0,
      trueTypeEncodingMismatchCount: 0,
      wModeMismatchCount: 0,
      externalCMapReferenceCount: 0,
    },
    languageAudit: {
      altTextLanguageInvalidCount: 0,
      actualTextLanguageInvalidCount: 0,
      annotationContentsLanguageInvalidCount: 0,
      formTuLanguageInvalidCount: 0,
      outlineLanguageInvalidCount: 0,
      expansionTextLanguageInvalidCount: 0,
      structureLangInvalidCount: 0,
    },
    renderedContrastAudit: {
      measured: false,
      lowContrastTextRunCount: 0,
      uncertainTextRunCount: 0,
    },
    tocNoteAudit: {
      tocItemMissingLinkCount: 0,
      tocDestinationMissingCount: 0,
      noteMissingIdCount: 0,
      duplicateNoteIdCount: 0,
      noteMissingLabelOrReferenceCount: 0,
    },
    optionalContentAudit: {
      optionalContentConfigMissingNameCount: 0,
      optionalContentAsInvalidCount: 0,
      embeddedFileMissingFOrUfCount: 0,
      dynamicXfaPresent: false,
    },
    linkReachabilityAudit: {
      checked: false,
      unreachableUriCount: 0,
      unsafeUriCount: 0,
    },
    aiVisualTagAudit: {
      evaluated: false,
      falsePositiveTagCount: 0,
      falseNegativeTagCount: 0,
      likelyMisclassifiedTagCount: 0,
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
    expect(byId(rows, 'pdfua.parent_tree.present').status).toBe('pass');
    expect(byId(rows, 'pdfua.font.to_unicode_cmap_present').status).toBe('pass');
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

  it('fails direct ParentTree audit debt', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      parentTreeAudit: {
        missingParentTree: true,
        pagesMissingStructParents: 2,
        missingMcidParentTreeEntries: 3,
        invalidParentTreeEntries: 1,
        annotationReferenceMismatchCount: 4,
        objectReferenceMismatchCount: 1,
      },
    }));

    expect(byId(rows, 'pdfua.parent_tree.present')).toMatchObject({ status: 'fail', confidence: 'verified' });
    expect(byId(rows, 'pdfua.parent_tree.page_structparents_present')).toMatchObject({ status: 'fail', count: 2 });
    expect(byId(rows, 'pdfua.parent_tree.mcid_entries_valid')).toMatchObject({ status: 'fail', count: 4 });
    expect(byId(rows, 'pdfua.parent_tree.annotation_object_refs_consistent')).toMatchObject({ status: 'fail', count: 5 });
  });

  it('fails bounded content tagging and artifact boundary debt', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      contentTaggingAudit: {
        textOutsideMarkedContentOrArtifact: 3,
        imageOutsideMarkedContentOrArtifact: 2,
        pathOutsideMarkedContentOrArtifact: 1,
        artifactInsideTaggedContent: 1,
        taggedContentInsideArtifact: 2,
        contentOutsidePageBounds: 0,
      },
    }));

    expect(byId(rows, 'pdfua.content.text_tagged_or_artifacted')).toMatchObject({ status: 'fail', count: 3 });
    expect(byId(rows, 'pdfua.content.image_tagged_or_artifacted')).toMatchObject({ status: 'fail', count: 2 });
    expect(byId(rows, 'pdfua.content.path_paint_tagged_or_artifacted')).toMatchObject({ status: 'fail', count: 1 });
    expect(byId(rows, 'pdfua.content.artifact_tag_boundary_valid')).toMatchObject({ status: 'fail', count: 3 });
  });

  it('fails table header association audit debt', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      tables: [{ hasHeaders: true, headerCount: 1, totalCells: 4, page: 0 }],
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 2,
        orphanHeaderCellCount: 1,
        dataCellsWithoutHeaderCount: 3,
      },
    }));

    expect(byId(rows, 'pdfua.table.header_association_present')).toMatchObject({ status: 'fail', count: 5 });
    expect(byId(rows, 'pdfua.table.header_cells_associated')).toMatchObject({ status: 'fail', count: 1 });
  });

  it('emits font and expanded language audit rows', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      fontSyntaxAudit: {
        fontsChecked: 2,
        missingToUnicodeCMapCount: 1,
        invalidToUnicodeCMapCount: 1,
        cidToGidMapRiskCount: 1,
        trueTypeEncodingMismatchCount: 1,
        wModeMismatchCount: 1,
        externalCMapReferenceCount: 0,
      },
      languageAudit: {
        altTextLanguageInvalidCount: 1,
        actualTextLanguageInvalidCount: 1,
        annotationContentsLanguageInvalidCount: 1,
        formTuLanguageInvalidCount: 1,
        outlineLanguageInvalidCount: 1,
        expansionTextLanguageInvalidCount: 0,
        structureLangInvalidCount: 1,
      },
    }));

    expect(byId(rows, 'pdfua.font.to_unicode_cmap_present').status).toBe('fail');
    expect(byId(rows, 'pdfua.font.to_unicode_cmap_valid').status).toBe('fail');
    expect(byId(rows, 'pdfua.font.cid_to_gidmap_valid').status).toBe('warn');
    expect(byId(rows, 'pdfua.font.truetype_encoding_consistent').status).toBe('warn');
    expect(byId(rows, 'pdfua.font.wmode_consistent').status).toBe('fail');
    expect(byId(rows, 'pdfua.language.alt_text_lang_valid').status).toBe('fail');
    expect(byId(rows, 'pdfua.language.form_tu_lang_valid').status).toBe('fail');
    expect(byId(rows, 'pdfua.language.outline_lang_valid').status).toBe('fail');
  });

  it('keeps rendered contrast, link reachability, and AI checks diagnostic until measured/evaluated', () => {
    const rows = buildPacRuleEvidence(makeSnap());

    expect(byId(rows, 'wcag.contrast.text_contrast_measured')).toMatchObject({
      status: 'warn',
      confidence: 'manual_review_required',
    });
    expect(byId(rows, 'pdfua.link.uri_reachability_checked')).toMatchObject({
      status: 'warn',
      confidence: 'manual_review_required',
    });
    expect(byId(rows, 'pdfua.ai.visual_tag_mismatch_absent')).toMatchObject({
      status: 'warn',
      confidence: 'manual_review_required',
    });

    const measured = buildPacRuleEvidence(makeSnap({
      renderedContrastAudit: { measured: true, lowContrastTextRunCount: 2, uncertainTextRunCount: 0 },
      linkReachabilityAudit: { checked: true, unreachableUriCount: 1, unsafeUriCount: 1 },
      aiVisualTagAudit: { evaluated: true, falsePositiveTagCount: 1, falseNegativeTagCount: 0, likelyMisclassifiedTagCount: 1 },
    }));
    expect(byId(measured, 'wcag.contrast.text_contrast_measured')).toMatchObject({ status: 'fail', count: 2 });
    expect(byId(measured, 'pdfua.link.uri_reachability_checked')).toMatchObject({ status: 'fail', count: 2 });
    expect(byId(measured, 'pdfua.ai.visual_tag_mismatch_absent')).toMatchObject({ status: 'fail', count: 2 });
  });

  it('fails TOC/Note, optional content, file-spec, and XFA evidence when direct debt exists', () => {
    const rows = buildPacRuleEvidence(makeSnap({
      tocNoteAudit: {
        tocItemMissingLinkCount: 1,
        tocDestinationMissingCount: 1,
        noteMissingIdCount: 1,
        duplicateNoteIdCount: 1,
        noteMissingLabelOrReferenceCount: 1,
      },
      optionalContentAudit: {
        optionalContentConfigMissingNameCount: 1,
        optionalContentAsInvalidCount: 1,
        embeddedFileMissingFOrUfCount: 2,
        dynamicXfaPresent: true,
      },
    }));

    expect(byId(rows, 'pdfua.toc.toci_links_valid')).toMatchObject({ status: 'fail', count: 2 });
    expect(byId(rows, 'pdfua.note.ids_unique')).toMatchObject({ status: 'fail', count: 3 });
    expect(byId(rows, 'pdfua.optional_content.config_valid')).toMatchObject({ status: 'fail', count: 2 });
    expect(byId(rows, 'pdfua.filespec.f_and_uf_present')).toMatchObject({ status: 'fail', count: 2 });
    expect(byId(rows, 'pdfua.xfa.dynamic_absent').status).toBe('fail');
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
    expect(byId(rows, 'pdfua.parent_tree.present').status).toBe('not_applicable');
    expect(byId(rows, 'pdfua.content.text_tagged_or_artifacted').status).toBe('not_applicable');
  });
});

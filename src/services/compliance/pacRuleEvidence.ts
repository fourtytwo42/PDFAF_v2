import type { CategoryKey, DocumentSnapshot } from '../../types.js';
import { isFilenameLikeTitle } from './icjiaParity.js';
import { isWeakFigureAlt } from '../scorer/altTextHeuristics.js';
import { normalizedTableSignals } from '../scorer/tableRegularityHeuristics.js';

export type PacRuleStatus = 'pass' | 'warn' | 'fail' | 'not_applicable';
export type PacRuleSeverity = 'pass' | 'warning' | 'failure';
export type PacRuleConfidence = 'verified' | 'heuristic' | 'manual_review_required';

export interface PacRuleEvidenceSource {
  page?: number;
  structRef?: string;
  category?: CategoryKey;
  objectRef?: string;
  details?: string;
}

export interface PacRuleEvidence {
  ruleId: string;
  status: PacRuleStatus;
  severity: PacRuleSeverity;
  category: CategoryKey;
  message: string;
  confidence: PacRuleConfidence;
  source?: PacRuleEvidenceSource;
  count?: number;
}

interface RuleInput {
  ruleId: string;
  status: PacRuleStatus;
  category: CategoryKey;
  message: string;
  confidence?: PacRuleConfidence;
  source?: PacRuleEvidenceSource;
  count?: number;
}

function rule(input: RuleInput): PacRuleEvidence {
  return {
    ruleId: input.ruleId,
    status: input.status,
    severity: severityForStatus(input.status),
    category: input.category,
    message: input.message,
    confidence: input.confidence ?? 'verified',
    ...(input.source ? { source: input.source } : {}),
    ...(input.count !== undefined ? { count: input.count } : {}),
  };
}

function severityForStatus(status: PacRuleStatus): PacRuleSeverity {
  if (status === 'fail') return 'failure';
  if (status === 'warn') return 'warning';
  return 'pass';
}

function nonEmpty(value: string | null | undefined): boolean {
  return (value ?? '').trim().length > 0;
}

function effectiveLanguage(snapshot: DocumentSnapshot): string {
  return (snapshot.lang ?? snapshot.metadata.language ?? '').trim();
}

function languageSyntaxValid(value: string): boolean {
  // BCP-47 is large; this intentionally catches malformed values without pretending full IANA validation.
  return /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value);
}

function hasStructure(snapshot: DocumentSnapshot): boolean {
  return snapshot.structureTree !== null;
}

function noStructureRule(ruleId: string, category: CategoryKey, message: string): PacRuleEvidence {
  return rule({
    ruleId,
    status: 'not_applicable',
    category,
    message,
    confidence: 'verified',
  });
}

function annotationSignals(snapshot: DocumentSnapshot): NonNullable<DocumentSnapshot['annotationAccessibility']> {
  const detection = snapshot.detectionProfile?.annotationSignals;
  const direct = snapshot.annotationAccessibility;
  return {
    pagesMissingTabsS: Math.max(detection?.pagesMissingTabsS ?? 0, direct?.pagesMissingTabsS ?? 0),
    pagesAnnotationOrderDiffers: Math.max(
      detection?.pagesAnnotationOrderDiffers ?? 0,
      direct?.pagesAnnotationOrderDiffers ?? 0,
    ),
    linkAnnotationsMissingStructure: Math.max(
      detection?.linkAnnotationsMissingStructure ?? 0,
      direct?.linkAnnotationsMissingStructure ?? 0,
    ),
    nonLinkAnnotationsMissingStructure: Math.max(
      detection?.nonLinkAnnotationsMissingStructure ?? 0,
      direct?.nonLinkAnnotationsMissingStructure ?? 0,
    ),
    nonLinkAnnotationsMissingContents: direct?.nonLinkAnnotationsMissingContents ?? 0,
    linkAnnotationsMissingStructParent: Math.max(
      detection?.linkAnnotationsMissingStructParent ?? 0,
      direct?.linkAnnotationsMissingStructParent ?? 0,
    ),
    nonLinkAnnotationsMissingStructParent: Math.max(
      detection?.nonLinkAnnotationsMissingStructParent ?? 0,
      direct?.nonLinkAnnotationsMissingStructParent ?? 0,
    ),
  };
}

function taggedContentSignals(snapshot: DocumentSnapshot): {
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
} {
  return {
    orphanMcidCount:
      snapshot.detectionProfile?.pdfUaSignals?.orphanMcidCount ??
      snapshot.taggedContentAudit?.orphanMcidCount ??
      snapshot.orphanMcids?.length ??
      0,
    suspectedPathPaintOutsideMc:
      snapshot.detectionProfile?.pdfUaSignals?.suspectedPathPaintOutsideMc ??
      snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ??
      0,
  };
}

function metadataRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const title = snapshot.metadata.title?.trim() || snapshot.structTitle?.trim() || '';
  const suspects = snapshot.markInfo?.Suspects;
  const displayDocTitle = snapshot.viewerPreferences?.displayDocTitle;
  return [
    rule({
      ruleId: 'pdfua.metadata.xmp_present',
      status: snapshot.pdfUaVersion || snapshot.metadata.language ? 'pass' : 'warn',
      category: 'pdf_ua_compliance',
      message: snapshot.pdfUaVersion || snapshot.metadata.language
        ? 'XMP-backed metadata evidence is present.'
        : 'XMP metadata presence is not directly captured by the current snapshot.',
      confidence: snapshot.pdfUaVersion || snapshot.metadata.language ? 'verified' : 'heuristic',
    }),
    rule({
      ruleId: 'pdfua.metadata.title_present',
      status: title ? 'pass' : 'fail',
      category: 'title_language',
      message: title ? 'Document title metadata is present.' : 'Document title metadata is missing.',
    }),
    rule({
      ruleId: 'pdfua.metadata.pdfua_identifier_present',
      status: snapshot.pdfUaVersion ? 'pass' : 'fail',
      category: 'pdf_ua_compliance',
      message: snapshot.pdfUaVersion
        ? `PDF/UA identifier is present (${snapshot.pdfUaVersion}).`
        : 'PDF/UA identifier is missing from XMP metadata.',
    }),
    rule({
      ruleId: 'pdfua.settings.marked_true',
      status: snapshot.markInfo?.Marked === true ? 'pass' : 'fail',
      category: 'pdf_ua_compliance',
      message: snapshot.markInfo?.Marked === true
        ? '/MarkInfo /Marked is true.'
        : '/MarkInfo /Marked is missing or not true.',
    }),
    rule({
      ruleId: 'pdfua.settings.suspects_absent_or_false',
      status: suspects === true ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: suspects === true
        ? '/MarkInfo /Suspects is true.'
        : '/MarkInfo /Suspects is absent or false.',
      confidence: 'verified',
    }),
    rule({
      ruleId: 'pdfua.settings.display_doc_title_present_or_unknown',
      status: !title ? 'not_applicable' : displayDocTitle === true ? 'pass' : 'fail',
      category: 'title_language',
      message: !title
        ? 'DisplayDocTitle is not checked because document title metadata is missing.'
        : displayDocTitle === true
          ? '/ViewerPreferences /DisplayDocTitle is true.'
          : '/ViewerPreferences /DisplayDocTitle is missing or not true.',
      confidence: 'verified',
    }),
  ];
}

function languageRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const lang = effectiveLanguage(snapshot);
  return [
    rule({
      ruleId: 'pdfua.language.document_lang_present',
      status: lang ? 'pass' : 'fail',
      category: 'title_language',
      message: lang ? `Document language is present (${lang}).` : 'Document language is missing.',
    }),
    rule({
      ruleId: 'pdfua.language.document_lang_syntax_valid',
      status: !lang ? 'not_applicable' : languageSyntaxValid(lang) ? 'pass' : 'fail',
      category: 'title_language',
      message: !lang
        ? 'Language syntax cannot be checked because no document language is present.'
        : languageSyntaxValid(lang)
          ? 'Document language has a valid BCP-47-like syntax.'
          : `Document language appears malformed: ${lang}.`,
      confidence: 'heuristic',
    }),
  ];
}

function structureRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  if (!hasStructure(snapshot)) {
    return [
      rule({
        ruleId: 'pdfua.structure.struct_tree_present',
        status: 'fail',
        category: 'pdf_ua_compliance',
        message: 'Structure tree is missing.',
      }),
      noStructureRule('pdfua.structure.rolemap_nonstandard_mapped_heuristic', 'pdf_ua_compliance', 'RoleMap evidence requires a structure tree.'),
      noStructureRule('pdfua.structure.parent_key_integrity_heuristic', 'reading_order', 'Parent-key integrity evidence requires a structure tree.'),
    ];
  }

  const nonFigureRoleCount = snapshot.detectionProfile?.figureSignals?.nonFigureRoleCount ?? 0;
  const degenerate = snapshot.detectionProfile?.readingOrderSignals?.degenerateStructureTree === true;
  return [
    rule({
      ruleId: 'pdfua.structure.struct_tree_present',
      status: 'pass',
      category: 'pdf_ua_compliance',
      message: 'Structure tree is present.',
    }),
    rule({
      ruleId: 'pdfua.structure.rolemap_nonstandard_mapped_heuristic',
      status: nonFigureRoleCount > 0 ? 'warn' : 'pass',
      category: 'pdf_ua_compliance',
      message: nonFigureRoleCount > 0
        ? `${nonFigureRoleCount} figure-like structure element(s) use non-Figure roles; RoleMap parity should be verified.`
        : 'No known non-standard figure-like role mapping risk was detected.',
      confidence: 'heuristic',
      count: nonFigureRoleCount,
    }),
    rule({
      ruleId: 'pdfua.structure.parent_key_integrity_heuristic',
      status: degenerate ? 'warn' : 'pass',
      category: 'reading_order',
      message: degenerate
        ? 'Structure tree is shallow or degenerate; parent-key integrity needs manual/external verification.'
        : 'No parent-key integrity risk is visible from current structure-depth evidence.',
      confidence: 'heuristic',
    }),
  ];
}

function annotationRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  if (!hasStructure(snapshot)) {
    return [
      noStructureRule('pdfua.parent_tree.annotation_struct_parent_present', 'link_quality', 'Annotation ParentTree evidence requires a structure tree.'),
      noStructureRule('pdfua.annotations.tagged_annotations_present', 'pdf_ua_compliance', 'Tagged annotation evidence requires a structure tree.'),
      noStructureRule('pdfua.annotations.tab_order_structure', 'reading_order', 'Annotation tab-order evidence requires a structure tree.'),
      noStructureRule('pdfua.annotations.nonlink_contents_present', 'alt_text', 'Non-link annotation contents evidence requires a structure tree.'),
    ];
  }

  const aa = annotationSignals(snapshot);
  const missingStructParent = aa.linkAnnotationsMissingStructParent + aa.nonLinkAnnotationsMissingStructParent;
  const missingStructure = aa.linkAnnotationsMissingStructure + aa.nonLinkAnnotationsMissingStructure;
  return [
    rule({
      ruleId: 'pdfua.parent_tree.annotation_struct_parent_present',
      status: missingStructParent > 0 ? 'fail' : 'pass',
      category: 'link_quality',
      message: missingStructParent > 0
        ? `${missingStructParent} visible annotation(s) are missing /StructParent.`
        : 'Visible annotations do not show /StructParent debt.',
      count: missingStructParent,
    }),
    rule({
      ruleId: 'pdfua.annotations.tagged_annotations_present',
      status: missingStructure > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: missingStructure > 0
        ? `${missingStructure} visible annotation(s) are not associated with structure.`
        : 'Visible annotations do not show missing-structure debt.',
      count: missingStructure,
    }),
    rule({
      ruleId: 'pdfua.annotations.tab_order_structure',
      status: aa.pagesMissingTabsS > 0 ? 'fail' : 'pass',
      category: 'reading_order',
      message: aa.pagesMissingTabsS > 0
        ? `${aa.pagesMissingTabsS} page(s) with annotations are missing /Tabs /S.`
        : 'Pages with annotations do not show missing /Tabs /S debt.',
      count: aa.pagesMissingTabsS,
    }),
    rule({
      ruleId: 'pdfua.annotations.nonlink_contents_present',
      status: aa.nonLinkAnnotationsMissingContents > 0 ? 'fail' : 'pass',
      category: 'alt_text',
      message: aa.nonLinkAnnotationsMissingContents > 0
        ? `${aa.nonLinkAnnotationsMissingContents} non-link annotation(s) are missing /Contents.`
        : 'Non-link annotations do not show missing /Contents debt.',
      count: aa.nonLinkAnnotationsMissingContents,
    }),
  ];
}

function altRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const informativeFigures = snapshot.figures.filter(figure => !figure.isArtifact);
  const missingFigureAlt = informativeFigures.filter(figure => !figure.hasAlt || !nonEmpty(figure.altText));
  const weakFigureAlt = informativeFigures.filter(figure => isWeakFigureAlt(figure.altText, figure.hasAlt));
  const checkerFigures = (snapshot.checkerFigureTargets ?? []).filter(figure =>
    figure.reachable &&
    !figure.isArtifact &&
    ((figure.resolvedRole ?? figure.role ?? '').replace(/^\//, '').toLowerCase() === 'figure')
  );
  const checkerMissingAlt = checkerFigures.filter(figure => !figure.hasAlt || !nonEmpty(figure.altText));
  const formFields = [
    ...snapshot.formFields.map(field => ({ tooltip: field.tooltip, page: field.page })),
    ...snapshot.formFieldsFromPdfjs.map(field => ({ tooltip: field.tooltip ?? undefined, page: field.page })),
  ];
  const formMissingTu = formFields.filter(field => !nonEmpty(field.tooltip));
  const nonLinkMissing = snapshot.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0;

  return [
    rule({
      ruleId: 'pdfua.figure.alt_present',
      status: informativeFigures.length === 0 ? 'not_applicable' : missingFigureAlt.length > 0 ? 'fail' : 'pass',
      category: 'alt_text',
      message: informativeFigures.length === 0
        ? 'No informative Figure evidence is present.'
        : missingFigureAlt.length > 0
          ? `${missingFigureAlt.length} of ${informativeFigures.length} informative figure(s) are missing non-empty alternate text.`
          : 'All informative figures have non-empty alternate text.',
      count: missingFigureAlt.length,
      source: missingFigureAlt[0] ? {
        page: missingFigureAlt[0].page,
        structRef: missingFigureAlt[0].structRef,
        category: 'alt_text',
      } : undefined,
    }),
    rule({
      ruleId: 'pdfua.figure.alt_not_weak',
      status: informativeFigures.length === 0 ? 'not_applicable' : weakFigureAlt.length > 0 ? 'warn' : 'pass',
      category: 'alt_text',
      message: informativeFigures.length === 0
        ? 'No informative Figure evidence is present.'
        : weakFigureAlt.length > 0
          ? `${weakFigureAlt.length} figure alternate text value(s) look generic, boilerplate, or unreadable.`
          : 'Figure alternate text does not match known weak-alt patterns.',
      confidence: 'heuristic',
      count: weakFigureAlt.length,
    }),
    rule({
      ruleId: 'pdfua.figure.checker_visible_alt_present',
      status: checkerFigures.length === 0 ? 'not_applicable' : checkerMissingAlt.length > 0 ? 'fail' : 'pass',
      category: 'alt_text',
      message: checkerFigures.length === 0
        ? 'No checker-visible Figure target evidence is present.'
        : checkerMissingAlt.length > 0
          ? `${checkerMissingAlt.length} of ${checkerFigures.length} checker-visible figure(s) are missing non-empty alternate text.`
          : 'All checker-visible figures have non-empty alternate text.',
      count: checkerMissingAlt.length,
      source: checkerMissingAlt[0] ? {
        page: checkerMissingAlt[0].page,
        structRef: checkerMissingAlt[0].structRef,
        category: 'alt_text',
      } : undefined,
    }),
    rule({
      ruleId: 'pdfua.form.tu_present',
      status: formFields.length === 0 ? 'not_applicable' : formMissingTu.length > 0 ? 'fail' : 'pass',
      category: 'form_accessibility',
      message: formFields.length === 0
        ? 'No form fields are present.'
        : formMissingTu.length > 0
          ? `${formMissingTu.length} of ${formFields.length} form field(s) are missing alternate names/tooltips.`
          : 'All visible form field evidence includes alternate names/tooltips.',
      count: formMissingTu.length,
    }),
    rule({
      ruleId: 'pdfua.annotation.alt_or_contents_present',
      status: snapshot.annotationAccessibility === undefined ? 'not_applicable' : nonLinkMissing > 0 ? 'fail' : 'pass',
      category: 'alt_text',
      message: snapshot.annotationAccessibility === undefined
        ? 'Annotation alternate-description evidence is not present in the snapshot.'
        : nonLinkMissing > 0
          ? `${nonLinkMissing} non-link annotation(s) are missing /Contents.`
          : 'Non-link annotation alternate-description evidence is clean.',
      count: nonLinkMissing,
    }),
  ];
}

function tableRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  if (snapshot.tables.length === 0) {
    return [
      noStructureRule('pdfua.table.headers_present', 'table_markup', 'No table evidence is present.'),
      noStructureRule('pdfua.table.cells_nested_under_rows', 'table_markup', 'No table evidence is present.'),
      noStructureRule('pdfua.table.rows_regular', 'table_markup', 'No table evidence is present.'),
      noStructureRule('pdfua.table.strong_regular_structure', 'table_markup', 'No table evidence is present.'),
    ];
  }

  const missingHeaders = snapshot.tables.filter(table => !table.hasHeaders).length;
  const signals = normalizedTableSignals(snapshot, snapshot.detectionProfile?.tableSignals);
  return [
    rule({
      ruleId: 'pdfua.table.headers_present',
      status: missingHeaders > 0 ? 'fail' : 'pass',
      category: 'table_markup',
      message: missingHeaders > 0
        ? `${missingHeaders} of ${snapshot.tables.length} table(s) lack header cells.`
        : 'All table evidence includes header cells.',
      count: missingHeaders,
    }),
    rule({
      ruleId: 'pdfua.table.cells_nested_under_rows',
      status: signals.directCellUnderTableCount > 0 ? 'fail' : 'pass',
      category: 'table_markup',
      message: signals.directCellUnderTableCount > 0
        ? `${signals.directCellUnderTableCount} table cell(s) appear directly under /Table instead of /TR.`
        : 'No direct TH/TD-under-Table debt was detected.',
      count: signals.directCellUnderTableCount,
    }),
    rule({
      ruleId: 'pdfua.table.rows_regular',
      status: signals.irregularTableCount > 0 ? 'fail' : 'pass',
      category: 'table_markup',
      message: signals.irregularTableCount > 0
        ? `${signals.irregularTableCount} table(s) have irregular row structure.`
        : 'Table row structure is regular or only advisory.',
      count: signals.irregularTableCount,
    }),
    rule({
      ruleId: 'pdfua.table.strong_regular_structure',
      status: signals.stronglyIrregularTableCount > 0 ? 'fail' : 'pass',
      category: 'table_markup',
      message: signals.stronglyIrregularTableCount > 0
        ? `${signals.stronglyIrregularTableCount} table(s) have strongly irregular row structure.`
        : 'No strongly irregular table structure was detected.',
      count: signals.stronglyIrregularTableCount,
    }),
  ];
}

function contentRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  if (!hasStructure(snapshot)) {
    return [
      noStructureRule('pdfua.content.orphan_mcids_absent', 'pdf_ua_compliance', 'Orphan MCID evidence requires a structure tree.'),
      noStructureRule('pdfua.content.path_paint_tagged_or_artifacted', 'pdf_ua_compliance', 'Path-paint tagging evidence requires a structure tree.'),
      noStructureRule('pdfua.content.text_tagged_or_artifacted', 'reading_order', 'Text tagging evidence requires a structure tree.'),
      noStructureRule('pdfua.content.image_tagged_or_artifacted', 'pdf_ua_compliance', 'Image tagging evidence requires a structure tree.'),
      noStructureRule('pdfua.content.artifact_tag_boundary_valid', 'pdf_ua_compliance', 'Artifact/tag boundary evidence requires a structure tree.'),
    ];
  }

  const signals = taggedContentSignals(snapshot);
  const tagging = snapshot.contentTaggingAudit;
  const textOutside = tagging?.textOutsideMarkedContentOrArtifact ?? 0;
  const imageOutside = tagging?.imageOutsideMarkedContentOrArtifact ?? 0;
  const pathOutside = Math.max(signals.suspectedPathPaintOutsideMc, tagging?.pathOutsideMarkedContentOrArtifact ?? 0);
  const boundaryDebt =
    (tagging?.artifactInsideTaggedContent ?? 0) +
    (tagging?.taggedContentInsideArtifact ?? 0) +
    (tagging?.malformedMarkedContentStack ?? 0);
  const contentConfidence: PacRuleConfidence = tagging
    ? (tagging.pageStreamsChecked !== undefined &&
        tagging.totalPageStreams !== undefined &&
        tagging.pageStreamsChecked >= tagging.totalPageStreams &&
        (tagging.formXObjectsChecked ?? 0) === 0
      ? 'verified'
      : 'heuristic')
    : 'manual_review_required';
  return [
    rule({
      ruleId: 'pdfua.content.orphan_mcids_absent',
      status: signals.orphanMcidCount > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: signals.orphanMcidCount > 0
        ? `${signals.orphanMcidCount} marked-content MCID(s) appear outside the structure tree.`
        : 'No orphan marked-content MCID debt was detected.',
      count: signals.orphanMcidCount,
    }),
    rule({
      ruleId: 'pdfua.content.path_paint_tagged_or_artifacted',
      status: pathOutside > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: pathOutside > 0
        ? `${pathOutside} path-paint operator(s) appear outside marked-content blocks.`
        : 'No path-paint outside marked-content debt was detected.',
      confidence: contentConfidence,
      count: pathOutside,
    }),
    rule({
      ruleId: 'pdfua.content.text_tagged_or_artifacted',
      status: textOutside > 0 ? 'fail' : 'pass',
      category: 'reading_order',
      message: textOutside > 0
        ? `${textOutside} text-rendering operator(s) appear outside marked-content or artifact blocks.`
        : 'No text outside marked-content/artifact blocks was detected.',
      confidence: contentConfidence,
      count: textOutside,
    }),
    rule({
      ruleId: 'pdfua.content.image_tagged_or_artifacted',
      status: imageOutside > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: imageOutside > 0
        ? `${imageOutside} image-paint operator(s) appear outside marked-content or artifact blocks.`
        : 'No image paint outside marked-content/artifact blocks was detected.',
      confidence: contentConfidence,
      count: imageOutside,
    }),
    rule({
      ruleId: 'pdfua.content.artifact_tag_boundary_valid',
      status: boundaryDebt > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: boundaryDebt > 0
        ? `${boundaryDebt} nested artifact/tag boundary issue(s) were detected.`
        : 'No nested artifact/tag boundary issue was detected.',
      confidence: contentConfidence,
      count: boundaryDebt,
    }),
  ];
}

function parentTreeAuditRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  if (!hasStructure(snapshot)) {
    return [
      noStructureRule('pdfua.parent_tree.present', 'pdf_ua_compliance', 'ParentTree evidence requires a structure tree.'),
      noStructureRule('pdfua.parent_tree.page_structparents_present', 'reading_order', 'Page StructParents evidence requires a structure tree.'),
      noStructureRule('pdfua.parent_tree.mcid_entries_valid', 'pdf_ua_compliance', 'MCID ParentTree evidence requires a structure tree.'),
      noStructureRule('pdfua.parent_tree.annotation_object_refs_consistent', 'link_quality', 'Object-reference evidence requires a structure tree.'),
    ];
  }
  const audit = snapshot.parentTreeAudit;
  const invalidMcid = (audit?.missingMcidParentTreeEntries ?? 0) + (audit?.invalidParentTreeEntries ?? 0);
  const refDebt = (audit?.annotationReferenceMismatchCount ?? 0) + (audit?.objectReferenceMismatchCount ?? 0);
  return [
    rule({
      ruleId: 'pdfua.parent_tree.present',
      status: audit?.missingParentTree ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: audit?.missingParentTree ? 'Structure tree is missing /ParentTree.' : 'ParentTree is present or no direct missing-ParentTree debt was detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
    }),
    rule({
      ruleId: 'pdfua.parent_tree.page_structparents_present',
      status: (audit?.pagesMissingStructParents ?? 0) > 0 ? 'fail' : 'pass',
      category: 'reading_order',
      message: (audit?.pagesMissingStructParents ?? 0) > 0
        ? `${audit!.pagesMissingStructParents} page(s) with tagged content or annotations are missing /StructParents.`
        : 'No page /StructParents debt was detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: audit?.pagesMissingStructParents ?? 0,
    }),
    rule({
      ruleId: 'pdfua.parent_tree.mcid_entries_valid',
      status: invalidMcid > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: invalidMcid > 0
        ? `${invalidMcid} missing or invalid ParentTree MCID entr${invalidMcid === 1 ? 'y' : 'ies'} were detected.`
        : 'No invalid ParentTree MCID entries were detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: invalidMcid,
    }),
    rule({
      ruleId: 'pdfua.parent_tree.annotation_object_refs_consistent',
      status: refDebt > 0 ? 'fail' : 'pass',
      category: 'link_quality',
      message: refDebt > 0
        ? `${refDebt} annotation/object reference mismatch(es) were detected.`
        : 'No annotation/object reference mismatch was detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: refDebt,
    }),
  ];
}

function tableHeaderAuditRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const audit = snapshot.tableHeaderAudit;
  if ((audit?.tablesChecked ?? snapshot.tables.length) === 0) {
    return [
      noStructureRule('pdfua.table.header_association_present', 'table_markup', 'No table evidence is present.'),
      noStructureRule('pdfua.table.header_cells_associated', 'table_markup', 'No table evidence is present.'),
    ];
  }
  const headerAssociationDebt = audit?.dataCellsWithoutHeaderCount ?? audit?.headerAssociationMissingCount ?? 0;
  const orphanHeaderDebt = audit?.orphanHeaderCellCount ?? 0;
  return [
    rule({
      ruleId: 'pdfua.table.header_association_present',
      status: headerAssociationDebt > 0 ? 'fail' : 'pass',
      category: 'table_markup',
      message: headerAssociationDebt > 0
        ? `${headerAssociationDebt} table header-association issue(s) were detected.`
        : 'No table header-association debt was detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: headerAssociationDebt,
    }),
    rule({
      ruleId: 'pdfua.table.header_cells_associated',
      status: orphanHeaderDebt > 0 ? 'fail' : 'pass',
      category: 'table_markup',
      message: orphanHeaderDebt > 0
        ? `${orphanHeaderDebt} orphan table header cell(s) were detected.`
        : 'No orphan table header cells were detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: orphanHeaderDebt,
    }),
  ];
}

function fontSyntaxRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const audit = snapshot.fontSyntaxAudit;
  if ((audit?.fontsChecked ?? snapshot.fonts.length) === 0) {
    return [
      noStructureRule('pdfua.font.to_unicode_cmap_present', 'text_extractability', 'No font evidence is present.'),
      noStructureRule('pdfua.font.to_unicode_cmap_valid', 'text_extractability', 'No font evidence is present.'),
      noStructureRule('pdfua.font.cid_to_gidmap_valid', 'text_extractability', 'No font evidence is present.'),
      noStructureRule('pdfua.font.truetype_encoding_consistent', 'text_extractability', 'No font evidence is present.'),
      noStructureRule('pdfua.font.wmode_consistent', 'text_extractability', 'No font evidence is present.'),
    ];
  }
  return [
    rule({
      ruleId: 'pdfua.font.to_unicode_cmap_present',
      status: (audit?.missingToUnicodeCMapCount ?? 0) > 0 ? 'fail' : 'pass',
      category: 'text_extractability',
      message: (audit?.missingToUnicodeCMapCount ?? 0) > 0
        ? `${audit!.missingToUnicodeCMapCount} font(s) are missing /ToUnicode CMap evidence.`
        : 'No missing /ToUnicode CMap debt was detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: audit?.missingToUnicodeCMapCount ?? 0,
    }),
    rule({
      ruleId: 'pdfua.font.to_unicode_cmap_valid',
      status: ((audit?.invalidToUnicodeCMapCount ?? 0) + (audit?.emptyToUnicodeCMapCount ?? 0)) > 0 ? 'fail' : 'pass',
      category: 'text_extractability',
      message: ((audit?.invalidToUnicodeCMapCount ?? 0) + (audit?.emptyToUnicodeCMapCount ?? 0)) > 0
        ? `${(audit?.invalidToUnicodeCMapCount ?? 0) + (audit?.emptyToUnicodeCMapCount ?? 0)} invalid or empty /ToUnicode CMap issue(s) were detected.`
        : 'No invalid /ToUnicode CMap syntax was detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: (audit?.invalidToUnicodeCMapCount ?? 0) + (audit?.emptyToUnicodeCMapCount ?? 0),
    }),
    rule({
      ruleId: 'pdfua.font.cid_to_gidmap_valid',
      status: ((audit?.cidToGidMapRiskCount ?? 0) + (audit?.type0DescendantFontRiskCount ?? 0)) > 0 ? 'warn' : 'pass',
      category: 'text_extractability',
      message: ((audit?.cidToGidMapRiskCount ?? 0) + (audit?.type0DescendantFontRiskCount ?? 0)) > 0
        ? `${(audit?.cidToGidMapRiskCount ?? 0) + (audit?.type0DescendantFontRiskCount ?? 0)} CID font mapping or descendant-font risk(s) need checker/manual review.`
        : 'No CIDToGIDMap risk was detected.',
      confidence: audit ? 'heuristic' : 'manual_review_required',
      count: (audit?.cidToGidMapRiskCount ?? 0) + (audit?.type0DescendantFontRiskCount ?? 0),
    }),
    rule({
      ruleId: 'pdfua.font.truetype_encoding_consistent',
      status: (audit?.trueTypeEncodingMismatchCount ?? 0) > 0 ? 'warn' : 'pass',
      category: 'text_extractability',
      message: (audit?.trueTypeEncodingMismatchCount ?? 0) > 0
        ? `${audit!.trueTypeEncodingMismatchCount} TrueType/encoding consistency risk(s) need review.`
        : 'No TrueType encoding consistency risk was detected.',
      confidence: audit ? 'heuristic' : 'manual_review_required',
      count: audit?.trueTypeEncodingMismatchCount ?? 0,
    }),
    rule({
      ruleId: 'pdfua.font.wmode_consistent',
      status: (audit?.wModeMismatchCount ?? 0) > 0 ? 'fail' : 'pass',
      category: 'text_extractability',
      message: (audit?.wModeMismatchCount ?? 0) > 0
        ? `${audit!.wModeMismatchCount} writing-mode mismatch(es) were detected.`
        : 'No writing-mode mismatch was detected.',
      confidence: audit ? 'verified' : 'manual_review_required',
      count: audit?.wModeMismatchCount ?? 0,
    }),
  ];
}

function expandedLanguageRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const audit = snapshot.languageAudit;
  const rows: Array<[string, CategoryKey, keyof NonNullable<DocumentSnapshot['languageAudit']>, string]> = [
    ['pdfua.language.alt_text_lang_valid', 'alt_text', 'altTextLanguageInvalidCount', 'alternate text'],
    ['pdfua.language.actual_text_lang_valid', 'pdf_ua_compliance', 'actualTextLanguageInvalidCount', 'ActualText'],
    ['pdfua.language.annotation_contents_lang_valid', 'link_quality', 'annotationContentsLanguageInvalidCount', 'annotation contents'],
    ['pdfua.language.form_tu_lang_valid', 'form_accessibility', 'formTuLanguageInvalidCount', 'form alternate names'],
    ['pdfua.language.outline_lang_valid', 'bookmarks', 'outlineLanguageInvalidCount', 'outline text'],
    ['pdfua.language.structure_lang_valid', 'title_language', 'structureLangInvalidCount', 'structure language overrides'],
  ];
  return rows.map(([ruleId, category, key, label]) => {
    const count = audit?.[key] ?? 0;
    return rule({
      ruleId,
      status: count > 0 ? 'fail' : 'pass',
      category,
      message: count > 0
        ? `${count} ${label} language value(s) appear malformed.`
        : `No malformed ${label} language values were detected.`,
      confidence: audit ? 'heuristic' : 'manual_review_required',
      count,
    });
  });
}

function optionalDiagnosticRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const contrast = snapshot.renderedContrastAudit;
  const toc = snapshot.tocNoteAudit;
  const optional = snapshot.optionalContentAudit;
  const link = snapshot.linkReachabilityAudit;
  const ai = snapshot.aiVisualTagAudit;
  const tocDebt = (toc?.tocItemMissingLinkCount ?? 0) + (toc?.tocDestinationMissingCount ?? 0);
  const noteDebt = (toc?.noteMissingIdCount ?? 0) + (toc?.duplicateNoteIdCount ?? 0) + (toc?.noteMissingLabelOrReferenceCount ?? 0);
  const ocDebt = (optional?.optionalContentConfigMissingNameCount ?? 0) + (optional?.optionalContentAsInvalidCount ?? 0);
  const uriDebt = (link?.unreachableUriCount ?? 0) + (link?.unsafeUriCount ?? 0);
  const aiDebt = (ai?.falsePositiveTagCount ?? 0) + (ai?.falseNegativeTagCount ?? 0) + (ai?.likelyMisclassifiedTagCount ?? 0);
  return [
    rule({
      ruleId: 'wcag.contrast.text_contrast_measured',
      status: !contrast?.measured ? 'warn' : contrast.lowContrastTextRunCount > 0 ? 'fail' : 'pass',
      category: 'color_contrast',
      message: !contrast?.measured
        ? 'Rendered contrast was not measured in this diagnostic run.'
        : contrast.lowContrastTextRunCount > 0
          ? `${contrast.lowContrastTextRunCount} low-contrast rendered text run(s) were detected.`
          : 'Rendered contrast evidence did not find low-contrast text runs.',
      confidence: contrast?.measured ? (contrast.uncertainTextRunCount > 0 ? 'manual_review_required' : 'verified') : 'manual_review_required',
      count: contrast?.lowContrastTextRunCount ?? 0,
    }),
    rule({
      ruleId: 'pdfua.toc.toci_links_valid',
      status: tocDebt > 0 ? 'fail' : 'pass',
      category: 'bookmarks',
      message: tocDebt > 0 ? `${tocDebt} TOC/TOCI link issue(s) were detected.` : 'No TOC/TOCI link issue was detected.',
      confidence: toc ? 'heuristic' : 'manual_review_required',
      count: tocDebt,
    }),
    rule({
      ruleId: 'pdfua.note.ids_unique',
      status: noteDebt > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: noteDebt > 0 ? `${noteDebt} Note ID/label/reference issue(s) were detected.` : 'No Note ID/label/reference issue was detected.',
      confidence: toc ? 'heuristic' : 'manual_review_required',
      count: noteDebt,
    }),
    rule({
      ruleId: 'pdfua.optional_content.config_valid',
      status: ocDebt > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: ocDebt > 0 ? `${ocDebt} optional-content configuration issue(s) were detected.` : 'No optional-content configuration issue was detected.',
      confidence: optional ? 'verified' : 'manual_review_required',
      count: ocDebt,
    }),
    rule({
      ruleId: 'pdfua.filespec.f_and_uf_present',
      status: (optional?.embeddedFileMissingFOrUfCount ?? 0) > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: (optional?.embeddedFileMissingFOrUfCount ?? 0) > 0
        ? `${optional!.embeddedFileMissingFOrUfCount} embedded file spec(s) are missing /F or /UF.`
        : 'No embedded file-spec /F or /UF debt was detected.',
      confidence: optional ? 'verified' : 'manual_review_required',
      count: optional?.embeddedFileMissingFOrUfCount ?? 0,
    }),
    rule({
      ruleId: 'pdfua.xfa.dynamic_absent',
      status: optional?.dynamicXfaPresent ? 'fail' : 'pass',
      category: 'form_accessibility',
      message: optional?.dynamicXfaPresent ? 'Dynamic XFA evidence is present.' : 'No dynamic XFA evidence was detected.',
      confidence: optional ? 'verified' : 'manual_review_required',
    }),
    rule({
      ruleId: 'pdfua.link.uri_reachability_checked',
      status: !link?.checked ? 'warn' : uriDebt > 0 ? 'fail' : 'pass',
      category: 'link_quality',
      message: !link?.checked
        ? 'URI reachability was not checked in this deterministic diagnostic run.'
        : uriDebt > 0
          ? `${uriDebt} unreachable or unsafe URI issue(s) were detected.`
          : 'Checked URI targets did not show reachability debt.',
      confidence: link?.checked ? 'verified' : 'manual_review_required',
      count: uriDebt,
    }),
    rule({
      ruleId: 'pdfua.ai.visual_tag_mismatch_absent',
      status: !ai?.evaluated ? 'warn' : aiDebt > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: !ai?.evaluated
        ? 'AI visual-tag mismatch diagnostics were not evaluated.'
        : aiDebt > 0
          ? `${aiDebt} visual-vs-structure mismatch issue(s) were detected.`
          : 'AI visual-tag diagnostics did not find mismatch evidence.',
      confidence: ai?.evaluated ? 'heuristic' : 'manual_review_required',
      count: aiDebt,
    }),
  ];
}

function qualityRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const allAltTexts = [
    ...snapshot.figures.filter(figure => figure.hasAlt && nonEmpty(figure.altText)).map(figure => figure.altText),
    ...(snapshot.checkerFigureTargets ?? []).filter(figure => figure.hasAlt && nonEmpty(figure.altText)).map(figure => figure.altText),
  ];
  const weakAltCount = allAltTexts.filter(text => isWeakFigureAlt(text, true)).length;
  const title = snapshot.metadata.title?.trim() || snapshot.structTitle?.trim() || '';
  return [
    rule({
      ruleId: 'pdfua.quality.alt_not_generated',
      status: allAltTexts.length === 0 ? 'not_applicable' : weakAltCount > 0 ? 'warn' : 'pass',
      category: 'alt_text',
      message: allAltTexts.length === 0
        ? 'No alternate text values are present for generated-alt quality checks.'
        : weakAltCount > 0
          ? `${weakAltCount} alternate text value(s) look generated or low-signal.`
          : 'Alternate text values do not match known generated/low-signal patterns.',
      confidence: 'heuristic',
      count: weakAltCount,
    }),
    rule({
      ruleId: 'pdfua.quality.title_not_filename_like',
      status: !title ? 'not_applicable' : isFilenameLikeTitle(title) ? 'warn' : 'pass',
      category: 'title_language',
      message: !title
        ? 'No title is present for generated-title quality checks.'
        : isFilenameLikeTitle(title)
          ? 'Document title looks filename-like or automatically generated.'
          : 'Document title does not look filename-like.',
      confidence: 'heuristic',
    }),
  ];
}

export function buildPacRuleEvidence(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  return [
    ...metadataRules(snapshot),
    ...languageRules(snapshot),
    ...structureRules(snapshot),
    ...annotationRules(snapshot),
    ...altRules(snapshot),
    ...tableRules(snapshot),
    ...contentRules(snapshot),
    ...parentTreeAuditRules(snapshot),
    ...tableHeaderAuditRules(snapshot),
    ...fontSyntaxRules(snapshot),
    ...expandedLanguageRules(snapshot),
    ...optionalDiagnosticRules(snapshot),
    ...qualityRules(snapshot),
  ];
}

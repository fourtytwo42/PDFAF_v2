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
      status: 'warn',
      category: 'pdf_ua_compliance',
      message: '/MarkInfo /Suspects is not exposed in the current snapshot; verify when analyzer support is added.',
      confidence: 'heuristic',
    }),
    rule({
      ruleId: 'pdfua.settings.display_doc_title_present_or_unknown',
      status: 'warn',
      category: 'title_language',
      message: '/ViewerPreferences /DisplayDocTitle is not exposed in the current snapshot; verify when analyzer support is added.',
      confidence: 'heuristic',
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
    ];
  }

  const signals = taggedContentSignals(snapshot);
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
      status: signals.suspectedPathPaintOutsideMc > 0 ? 'fail' : 'pass',
      category: 'pdf_ua_compliance',
      message: signals.suspectedPathPaintOutsideMc > 0
        ? `${signals.suspectedPathPaintOutsideMc} path-paint operator(s) appear outside marked-content blocks.`
        : 'No path-paint outside marked-content debt was detected.',
      confidence: 'heuristic',
      count: signals.suspectedPathPaintOutsideMc,
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
    ...qualityRules(snapshot),
  ];
}

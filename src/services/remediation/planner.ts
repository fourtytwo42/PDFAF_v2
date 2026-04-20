import type { CategoryKey, PdfClass, PlanningSkipReason, RemediationRoute } from '../../types.js';
import type { AnalysisResult, DocumentSnapshot, AppliedRemediationTool, RemediationPlan, RemediationStagePlan, PlannedRemediationTool } from '../../types.js';
import {
  BOOKMARKS_PAGE_OUTLINE_MAX_PAGES,
  BOOKMARKS_PAGE_THRESHOLD,
  OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS,
  OCR_NATIVE_SKIP_TEXT_CHARS,
  REMEDIATION_CATEGORY_THRESHOLD,
  REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN,
  REMEDIATION_MAX_NO_EFFECT_PER_TOOL,
  REMEDIATION_TARGET_SCORE,
  REMEDIATION_TOOL_STAGE_ORDER,
  TOOL_RELIABILITY_FILTER_MAX_SUCCESS_RATE,
  TOOL_RELIABILITY_FILTER_MIN_ATTEMPTS,
} from '../../config.js';
import type { ToolOutcomeStore } from '../learning/toolOutcomes.js';
import { buildPlanningSummary, deriveRoutingDecision } from './routingDecision.js';
import { hasExternalReadinessDebt } from './externalReadiness.js';

/** Tesseract language id for ocrmypdf (`PDFAF_OCR_LANGUAGES` overrides, e.g. `eng+deu`). */
function ocrmypdfLanguagesForSnapshot(snapshot: DocumentSnapshot): string {
  const env = process.env['PDFAF_OCR_LANGUAGES']?.trim();
  if (env) return env.slice(0, 64);
  const raw = (snapshot.metadata.language || snapshot.lang || 'en').trim();
  const primary = (raw.split(/[-_]/)[0] ?? 'en').toLowerCase();
  const map: Record<string, string> = {
    en: 'eng',
    fr: 'fra',
    de: 'deu',
    es: 'spa',
    it: 'ita',
    pt: 'por',
    nl: 'nld',
    pl: 'pol',
    sv: 'swe',
    da: 'dan',
    no: 'nor',
    fi: 'fin',
    cs: 'ces',
    sk: 'slk',
    hu: 'hun',
    ro: 'ron',
    bg: 'bul',
    el: 'ell',
    ru: 'rus',
    uk: 'ukr',
    ar: 'ara',
    he: 'heb',
    zh: 'chi_sim',
    ja: 'jpn',
    ko: 'kor',
    hi: 'hin',
  };
  return map[primary] ?? 'eng';
}

function failingCategories(analysis: AnalysisResult): CategoryKey[] {
  const out: CategoryKey[] = [];
  for (const c of analysis.categories) {
    if (!c.applicable) continue;
    if (c.score < REMEDIATION_CATEGORY_THRESHOLD) {
      out.push(c.key);
    }
  }
  return out;
}

const ROUTE_TOOL_MAP: Record<RemediationRoute, readonly string[]> = {
  metadata_first_commit: [
    'set_pdfua_identification',
    'set_document_title',
    'set_document_language',
  ],
  metadata_foundation: [
    'set_pdfua_identification',
    'set_document_title',
    'set_document_language',
  ],
  structure_bootstrap_and_conformance: [
    'synthesize_basic_structure_from_layout',
    'repair_structure_conformance',
    'artifact_repeating_page_furniture',
  ],
  post_bootstrap_heading_convergence: [
    'artifact_repeating_page_furniture',
    'create_heading_from_candidate',
    'normalize_heading_hierarchy',
    'repair_native_reading_order',
    'repair_structure_conformance',
  ],
  untagged_structure_recovery: [
    'synthesize_basic_structure_from_layout',
    'repair_structure_conformance',
    'artifact_repeating_page_furniture',
  ],
  structure_bootstrap: [
    'bootstrap_struct_tree',
    'repair_structure_conformance',
    'wrap_singleton_orphan_mcid',
    'remap_orphan_mcids_as_artifacts',
    'tag_native_text_blocks',
    'tag_ocr_text_blocks',
  ],
  annotation_link_normalization: [
    'repair_native_link_structure',
    'tag_unowned_annotations',
    'set_link_annotation_contents',
    'normalize_annotation_tab_order',
    'repair_annotation_alt_text',
  ],
  native_structure_repair: [
    'repair_native_reading_order',
    'normalize_heading_hierarchy',
    'repair_list_li_wrong_parent',
    'repair_native_table_headers',
    'set_table_header_cells',
  ],
  font_ocr_repair: [
    'ocr_scanned_pdf',
    'tag_ocr_text_blocks',
    'tag_native_text_blocks',
    'mark_untagged_content_as_artifact',
  ],
  font_unicode_tail_recovery: [
    'substitute_legacy_fonts_in_place',
    'finalize_substituted_font_conformance',
  ],
  figure_semantics: [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'set_figure_alt_text',
    'mark_figure_decorative',
    'repair_alt_text_structure',
    'repair_annotation_alt_text',
    'retag_as_figure',
  ],
  near_pass_figure_recovery: [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'repair_annotation_alt_text',
  ],
  document_navigation_forms: [
    'replace_bookmarks_from_headings',
    'add_page_outline_bookmarks',
    'fill_form_field_tooltips',
  ],
  safe_cleanup: [
    'mark_untagged_content_as_artifact',
    'repair_annotation_alt_text',
  ],
};

function noEffectCountForTool(applied: AppliedRemediationTool[], toolName: string): number {
  return applied.filter(a => a.toolName === toolName && a.outcome === 'no_effect').length;
}

function wasSuccessfullyApplied(applied: AppliedRemediationTool[], toolName: string): boolean {
  return applied.some(a => a.toolName === toolName && a.outcome === 'applied');
}

function successfulApplyCount(applied: AppliedRemediationTool[], toolName: string): number {
  return applied.filter(a => a.toolName === toolName && a.outcome === 'applied').length;
}

function tooltipNeedsRepair(tooltip: string | null | undefined): boolean {
  const t = (tooltip ?? '').trim().toLowerCase();
  if (!t) return true;
  return [
    'form field',
    'field',
    'text field',
    'checkbox',
    'check box',
    'radio button',
    'button',
    'choice field',
    'list field',
    'signature',
  ].includes(t);
}

export function deriveFallbackDocumentTitle(snapshot: DocumentSnapshot, filename: string): string {
  const looksFilenameLike = (value: string | null | undefined): boolean => {
    const v = (value ?? '').trim();
    if (!v) return true;
    const lower = v.toLowerCase();
    return (
      lower.endsWith('.pdf')
      || lower.endsWith('.docx')
      || /^[a-z0-9._-]+$/i.test(v)
    );
  };
  const metaTitle = snapshot.metadata.title?.trim();
  if (metaTitle && !looksFilenameLike(metaTitle)) return metaTitle;
  const headingTitle = snapshot.headings[0]?.text?.trim();
  if (headingTitle) return headingTitle.slice(0, 500);
  for (const pageText of snapshot.textByPage) {
    const line = (pageText ?? '')
      .split('\n')
      .map(part => part.trim())
      .find(part => part.length >= 4 && /[A-Za-z]/.test(part));
    if (line && !looksFilenameLike(line)) return line.slice(0, 500);
    const sentence = (pageText ?? '')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)[0]
      ?.trim();
    if (sentence && /[A-Za-z]/.test(sentence) && !looksFilenameLike(sentence)) {
      return sentence.split(/\s+/).slice(0, 12).join(' ').slice(0, 500);
    }
  }
  return filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 500);
}

/** One-shot tools: skip after first success. Figure alt/decorative + table headers: repeat until cap or no targets. */
function shouldSkipAfterSuccessfulApply(toolName: string, applied: AppliedRemediationTool[]): boolean {
  if (toolName === 'set_figure_alt_text' || toolName === 'mark_figure_decorative') {
    return successfulApplyCount(applied, toolName) >= REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN;
  }
  // set_table_header_cells targets one table per call — repeat to cover all tables.
  if (toolName === 'set_table_header_cells') {
    return successfulApplyCount(applied, toolName) >= REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN;
  }
  // Python fixes up to 64 orphans per pass; repeat until converged (matches pikepdf mutator rounds).
  if (toolName === 'remap_orphan_mcids_as_artifacts') {
    return successfulApplyCount(applied, toolName) >= 8;
  }
  return wasSuccessfullyApplied(applied, toolName);
}

function toolApplicableToPdfClass(
  toolName: string,
  pdfClass: AnalysisResult['pdfClass'],
  snapshot: DocumentSnapshot,
): boolean {
  if (toolName === 'bootstrap_struct_tree') {
    if (pdfClass === 'scanned') return false;
    return pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  if (toolName === 'synthesize_basic_structure_from_layout') {
    if (pdfClass === 'scanned') return false;
    return (pdfClass === 'native_untagged' || pdfClass === 'mixed') && snapshot.textCharCount > 0;
  }
  if (toolName === 'artifact_repeating_page_furniture') {
    if (pdfClass === 'scanned') return false;
    return snapshot.textCharCount > 0;
  }
  if (toolName === 'create_heading_from_candidate') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null && (snapshot.paragraphStructElems?.length ?? 0) > 0;
  }
  if (toolName === 'normalize_nested_figure_containers') {
    return pdfClass !== 'scanned' && snapshot.structureTree !== null && snapshot.figures.length > 0;
  }
  if (toolName === 'substitute_legacy_fonts_in_place' || toolName === 'finalize_substituted_font_conformance') {
    if (pdfClass === 'scanned') return false;
    return snapshot.textCharCount > 0 && snapshot.fonts.some(font =>
      (font.subtype ?? '').toLowerCase() === 'type1' && (!font.isEmbedded || !font.hasUnicode || font.encodingRisk),
    );
  }
  if (toolName === 'ocr_scanned_pdf') {
    if (pdfClass === 'scanned' || pdfClass === 'mixed') return true;
    if (
      (pdfClass === 'native_untagged' || pdfClass === 'native_tagged') &&
      snapshot.textCharCount <= OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS &&
      snapshot.textCharCount < OCR_NATIVE_SKIP_TEXT_CHARS
    ) {
      return true;
    }
    return false;
  }
  if (toolName === 'remap_orphan_mcids_as_artifacts') {
    if (pdfClass === 'scanned') return false;
    return (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0;
  }
  if (toolName === 'fill_form_field_tooltips') {
    if (pdfClass === 'scanned') return false;
    const byName = new Map<string, { tooltip?: string | null }>();
    for (const f of snapshot.formFields) {
      byName.set(f.name, { tooltip: f.tooltip });
    }
    for (const f of snapshot.formFieldsFromPdfjs) {
      if (!byName.has(f.name)) {
        byName.set(f.name, { tooltip: f.tooltip });
      }
    }
    for (const v of byName.values()) {
      if (tooltipNeedsRepair(v.tooltip)) return true;
    }
    return false;
  }
  if (toolName === 'mark_untagged_content_as_artifact') {
    if (pdfClass === 'scanned') return false;
    // Real tags: always eligible for residual untagged paint / text outside Span BDC.
    if (snapshot.isTagged || snapshot.structureTree !== null) return true;
    // Acrobat "Tagged PDF" can pass on /MarkInfo alone while /StructTreeRoot is missing
    // (Tags panel empty, Tagged content fails). Our taggedContentAudit still flags path/text
    // outside marked-content — run the wrap pass for that shell and for strong paint-outside signal.
    const paint = snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0;
    const markedShell =
      snapshot.markInfo?.Marked === true && !snapshot.isTagged && snapshot.structureTree == null;
    if (markedShell && paint > 0) return true;
    if (paint >= 5) return true;
    return false;
  }
  if (
    toolName === 'set_figure_alt_text'
    || toolName === 'mark_figure_decorative'
    || toolName === 'retag_as_figure'
    || toolName === 'canonicalize_figure_alt_ownership'
  ) {
    return pdfClass !== 'scanned';
  }
  if (toolName === 'tag_unowned_annotations' || toolName === 'repair_native_link_structure') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null;
  }
  if (toolName === 'set_link_annotation_contents') {
    return pdfClass !== 'scanned';
  }
  if (
    toolName === 'normalize_annotation_tab_order' ||
    toolName === 'repair_annotation_alt_text'
  ) {
    return pdfClass !== 'scanned';
  }
  if (toolName === 'repair_native_reading_order') {
    return pdfClass === 'native_tagged' || pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  if (toolName === 'normalize_heading_hierarchy') {
    // Only useful when there is actually a structure tree with headings
    return snapshot.structureTree !== null && snapshot.headings.length >= 2;
  }
  if (toolName === 'tag_ocr_text_blocks') {
    // Only for OCRmyPDF-produced PDFs that haven't been tagged yet
    const creator = (snapshot.metadata.creator ?? '').toLowerCase();
    return creator.includes('ocrmypdf');
  }
  if (toolName === 'tag_native_text_blocks') {
    if (pdfClass === 'scanned') return false;
    const creator = (snapshot.metadata.creator ?? '').toLowerCase();
    if (creator.includes('ocrmypdf')) return false;
    return pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  if (toolName === 'replace_bookmarks_from_headings') {
    if (pdfClass === 'scanned') return false;
    if (snapshot.pageCount < BOOKMARKS_PAGE_THRESHOLD) return false;
    if (!snapshot.structureTree && snapshot.headings.length === 0) return false;
    return snapshot.structureTree !== null && snapshot.headings.length > 0;
  }
  if (toolName === 'add_page_outline_bookmarks') {
    if (pdfClass === 'scanned') return false;
    if (snapshot.pageCount < BOOKMARKS_PAGE_THRESHOLD) return false;
    return snapshot.bookmarks.length === 0;
  }
  if (toolName === 'set_table_header_cells') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null && snapshot.tables.some(t => !t.hasHeaders && t.structRef);
  }
  if (toolName === 'repair_native_table_headers') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null && snapshot.tables.some(t => !t.hasHeaders);
  }
  if (toolName === 'wrap_singleton_orphan_mcid') {
    if (pdfClass === 'scanned') return false;
    const o = snapshot.orphanMcids ?? [];
    return snapshot.structureTree !== null && o.length === 1;
  }
  if (toolName === 'repair_list_li_wrong_parent') {
    if (pdfClass === 'scanned') return false;
    const l = snapshot.listStructureAudit;
    return snapshot.structureTree !== null && (
      (l?.listItemMisplacedCount ?? 0) > 0 ||
      (l?.listsWithoutItems ?? 0) > 0
    );
  }
  return true;
}

/** Drop tools that empirically fail too often for this PDF class (Phase 4). */
export function filterPlannedToolsByReliability(
  tools: PlannedRemediationTool[],
  pdfClass: PdfClass,
  toolOutcomeStore: ToolOutcomeStore | undefined,
): PlannedRemediationTool[] {
  if (!toolOutcomeStore) return tools;
  return tools.filter(tool => {
    const r = toolOutcomeStore.getReliability(tool.toolName, pdfClass);
    if (
      r.attempts >= TOOL_RELIABILITY_FILTER_MIN_ATTEMPTS &&
      r.successRate < TOOL_RELIABILITY_FILTER_MAX_SUCCESS_RATE
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Pure planner: failing categories + snapshot/pdfClass → staged tools.
 * No corpus ids, filenames, or customer-specific rules.
 */
export function planForRemediation(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[],
  toolOutcomeStore?: ToolOutcomeStore,
): RemediationPlan {
  if (analysis.score >= REMEDIATION_TARGET_SCORE && !hasExternalReadinessDebt(analysis, snapshot)) {
    return {
      stages: [],
      planningSummary: buildPlanningSummary({
        routing: deriveRoutingDecision(analysis, snapshot),
        scheduledTools: [],
        skippedTools: [],
      }),
    };
  }

  const failCats = failingCategories(analysis);
  const routing = deriveRoutingDecision(analysis, snapshot);
  const activeRoutes = [routing.primaryRoute, ...routing.secondaryRoutes].filter(
    (route): route is RemediationRoute => route !== null,
  );
  const toolSet = new Map<string, PlannedRemediationTool>();
  const skippedTools = new Map<string, PlanningSkipReason>();
  const addSkipped = (toolName: string, reason: PlanningSkipReason) => {
    if (!skippedTools.has(toolName)) skippedTools.set(toolName, reason);
  };
  const activeRouteSet = new Set(activeRoutes);
  const minExtractableCharsForNativeOcr = Math.max(120, snapshot.pageCount * 40);

  const categoryFailing = (key: CategoryKey) => failCats.includes(key);
  const hasAnnotationSignals =
    (snapshot.detectionProfile?.annotationSignals.pagesMissingTabsS ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.linkAnnotationsMissingStructure ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.nonLinkAnnotationsMissingStructure ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.linkAnnotationsMissingStructParent ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.nonLinkAnnotationsMissingStructParent ?? 0) > 0;
  const hasReadingOrderSignals =
    snapshot.detectionProfile?.readingOrderSignals.missingStructureTree === true ||
    (snapshot.detectionProfile?.readingOrderSignals.annotationOrderRiskCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.readingOrderSignals.annotationStructParentRiskCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.readingOrderSignals.sampledStructurePageOrderDriftCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.readingOrderSignals.multiColumnOrderRiskPages ?? 0) > 0 ||
    snapshot.detectionProfile?.readingOrderSignals.headerFooterPollutionRisk === true;
  const hasTableSignals =
    (snapshot.detectionProfile?.tableSignals.irregularTableCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.tableSignals.directCellUnderTableCount ?? 0) > 0;
  const hasListSignals =
    (snapshot.detectionProfile?.listSignals.listItemMisplacedCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.listSignals.lblBodyMisplacedCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.listSignals.listsWithoutItems ?? 0) > 0;
  const hasTaggedContentSignals =
    (snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0) > 0 ||
    (snapshot.detectionProfile?.pdfUaSignals.taggedAnnotationRiskCount ?? 0) > 0;
  const headingNeedsRepair =
    categoryFailing('heading_structure') ||
    analysis.failureProfile?.deterministicIssues.includes('heading_structure') === true ||
    analysis.failureProfile?.manualOnlyIssues.includes('heading_structure') === true;
  const structureConfidenceHigh = analysis.structuralClassification?.confidence === 'high';
  const structurePrimary =
    analysis.failureProfile?.primaryFailureFamily === 'structure_reading_order_heavy' ||
    analysis.failureProfile?.primaryFailureFamily === 'mixed_structural';
  const fontTailCandidate =
    categoryFailing('text_extractability')
    && snapshot.textCharCount > 0
    && analysis.pdfClass !== 'scanned'
    && snapshot.fonts.some(font =>
      (font.subtype ?? '').toLowerCase() === 'type1' && (!font.isEmbedded || !font.hasUnicode || font.encodingRisk),
    );

  const toolIsRouteRelevant = (toolName: string): { allowed: boolean; reason?: PlanningSkipReason } => {
    if (
      routing.deferredRoutes.includes('figure_semantics')
      && ROUTE_TOOL_MAP.figure_semantics.includes(toolName)
      && toolName !== 'canonicalize_figure_alt_ownership'
      && toolName !== 'normalize_nested_figure_containers'
      && toolName !== 'repair_annotation_alt_text'
    ) {
      return { allowed: false, reason: 'semantic_deferred' };
    }
    if (toolName === 'repair_annotation_alt_text' && !hasAnnotationSignals) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      (toolName === 'tag_unowned_annotations'
      || toolName === 'normalize_annotation_tab_order'
      || toolName === 'repair_native_link_structure')
      && !hasAnnotationSignals
      && !categoryFailing('link_quality')
    ) {
      // Allow annotation/link repair when link_quality is failing even without detection
      // profile annotation signals. Partially-tagged and untagged files can have link
      // quality failures that aren't surfaced in detectionProfile but are real and fixable.
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'set_link_annotation_contents'
      && !hasAnnotationSignals
      && !categoryFailing('link_quality')
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'repair_native_reading_order' && !(categoryFailing('reading_order') || hasReadingOrderSignals)) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'synthesize_basic_structure_from_layout'
      && !(
        snapshot.textCharCount > 0
        && (analysis.pdfClass === 'native_untagged' || analysis.pdfClass === 'mixed')
        && categoryFailing('pdf_ua_compliance')
        && (categoryFailing('heading_structure') || categoryFailing('reading_order'))
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'artifact_repeating_page_furniture'
      && !(categoryFailing('reading_order') || hasReadingOrderSignals || categoryFailing('pdf_ua_compliance') || categoryFailing('heading_structure'))
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'create_heading_from_candidate'
      && !(
        headingNeedsRepair
        && snapshot.structureTree !== null
        && (snapshot.paragraphStructElems?.length ?? 0) > 0
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'repair_list_li_wrong_parent' && !hasListSignals) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'wrap_singleton_orphan_mcid' || toolName === 'remap_orphan_mcids_as_artifacts') {
      // Only attempt orphan MCID repair when pdf_ua_compliance is actually failing.
      // Without this gate, the repair runs on near-passing files where orphan MCIDs
      // are present in snapshot data but aren't the real score bottleneck, causing
      // structural mutations that regress scores rather than improve them.
      if (!categoryFailing('pdf_ua_compliance')) {
        return { allowed: false, reason: 'category_not_failing' };
      }
      // Consolidate all three orphan-MCID data sources: detectionProfile (Stage 3),
      // taggedContentAudit (Python/QPDF), and raw snapshot orphanMcids array. These
      // can disagree when detectionProfile is absent or stale, causing the tool to be
      // incorrectly blocked even though the applicability checks would pass.
      const hasOrphanMcidEvidence =
        (snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? 0) > 0 ||
        (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0 ||
        (snapshot.orphanMcids?.length ?? 0) > 0;
      const hasOtherTaggedContentSignals =
        (snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0) > 0 ||
        (snapshot.detectionProfile?.pdfUaSignals.taggedAnnotationRiskCount ?? 0) > 0;
      if (!hasOrphanMcidEvidence && !hasOtherTaggedContentSignals) {
        return { allowed: false, reason: 'missing_precondition' };
      }
    }
    if (toolName === 'normalize_heading_hierarchy' && !headingNeedsRepair) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'normalize_nested_figure_containers'
      && !(
        categoryFailing('alt_text')
        && snapshot.structureTree !== null
        && snapshot.figures.length > 0
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      (toolName === 'repair_native_table_headers' || toolName === 'set_table_header_cells')
      && !(snapshot.tables.length > 0 && (categoryFailing('table_markup') || hasTableSignals) && (structureConfidenceHigh || categoryFailing('table_markup')))
    ) {
      // Allow table header repair when table_markup is failing regardless of structural
      // confidence. Medium-confidence partially-tagged files (e.g. native_tagged with
      // incomplete tag tree) have failing table_markup that can't get worse than 0.
      // structureConfidenceHigh is still required when only hasTableSignals triggers
      // the gate, preserving safety for files that aren't actually failing table_markup.
      return { allowed: false, reason: 'missing_precondition' };
    }
    if ((toolName === 'replace_bookmarks_from_headings' || toolName === 'add_page_outline_bookmarks') && !categoryFailing('bookmarks')) {
      return { allowed: false, reason: 'category_not_failing' };
    }
    if (toolName === 'fill_form_field_tooltips' && !categoryFailing('form_accessibility')) {
      return { allowed: false, reason: 'category_not_failing' };
    }
    if (ROUTE_TOOL_MAP.figure_semantics.includes(toolName) && structurePrimary) {
      if (toolName === 'repair_annotation_alt_text') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'semantic_deferred' };
    }
    if (
      toolName === 'canonicalize_figure_alt_ownership'
      && !(
        categoryFailing('alt_text')
        && snapshot.figures.length > 0
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      (toolName === 'substitute_legacy_fonts_in_place' || toolName === 'finalize_substituted_font_conformance')
      && !fontTailCandidate
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'ocr_scanned_pdf'
      && !(
        analysis.pdfClass === 'scanned'
        || analysis.pdfClass === 'mixed'
        || (
          categoryFailing('text_extractability')
          && snapshot.textCharCount < minExtractableCharsForNativeOcr
        )
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    return { allowed: true };
  };

  for (const route of activeRoutes) {
    const tools = ROUTE_TOOL_MAP[route] ?? [];
    for (const toolName of tools) {
      const routeOwning = Object.entries(ROUTE_TOOL_MAP)
        .filter(([, routeTools]) => routeTools.includes(toolName))
        .map(([routeName]) => routeName as RemediationRoute);
      if (!routeOwning.some(routeName => activeRouteSet.has(routeName))) {
        addSkipped(toolName, 'route_not_active');
        continue;
      }
      const routeGate = toolIsRouteRelevant(toolName);
      if (!routeGate.allowed) {
        addSkipped(toolName, routeGate.reason ?? 'missing_precondition');
        continue;
      }
      if (!toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)) {
        // 'not_applicable' = the tool genuinely cannot run on this PDF (no structure tree,
        // too few headings, no misplaced list items, etc.) — distinct from 'missing_precondition'
        // which signals a gate that *might* be too strict. 'not_applicable' does not trigger
        // unsafe_to_autofix in outcomeSummary.ts.
        addSkipped(toolName, 'not_applicable');
        continue;
      }
      if (shouldSkipAfterSuccessfulApply(toolName, alreadyApplied)) {
        addSkipped(toolName, 'already_succeeded');
        continue;
      }
      if (noEffectCountForTool(alreadyApplied, toolName) >= REMEDIATION_MAX_NO_EFFECT_PER_TOOL) {
        addSkipped(toolName, 'missing_precondition');
        continue;
      }
      if (toolSet.has(toolName)) continue;
      const params = buildDefaultParams(toolName, analysis, snapshot);
      toolSet.set(toolName, {
        toolName,
        params,
        rationale: `Run deterministic route "${route}" for ${routing.triggeringSignals.join(', ') || 'residual debt'}.`,
      });
    }
  }

  for (const route of routing.deferredRoutes) {
    for (const toolName of ROUTE_TOOL_MAP[route] ?? []) {
      if (!toolSet.has(toolName)) {
        addSkipped(toolName, route === 'figure_semantics' ? 'semantic_deferred' : 'route_not_active');
      }
    }
  }

  const plannedRaw = Array.from(toolSet.values()).sort((a, b) => {
    const sa = REMEDIATION_TOOL_STAGE_ORDER[a.toolName] ?? 99;
    const sb = REMEDIATION_TOOL_STAGE_ORDER[b.toolName] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.toolName.localeCompare(b.toolName);
  });

  const planned = filterPlannedToolsByReliability(plannedRaw, analysis.pdfClass, toolOutcomeStore);
  for (const tool of plannedRaw) {
    if (!planned.some(candidate => candidate.toolName === tool.toolName)) {
      addSkipped(tool.toolName, 'reliability_filtered');
    }
  }

  if (planned.length === 0) {
    return {
      stages: [],
      planningSummary: buildPlanningSummary({
        routing,
        scheduledTools: [],
        skippedTools: [...skippedTools.entries()].map(([toolName, reason]) => ({ toolName, reason })),
      }),
    };
  }

  // One stage per distinct stage number; reanalyze after each stage (authoritative score).
  const stageNumbers = [...new Set(planned.map(t => REMEDIATION_TOOL_STAGE_ORDER[t.toolName] ?? 99))].sort((a, b) => a - b);
  const stages: RemediationStagePlan[] = stageNumbers.map(sn => ({
    stageNumber: sn,
    tools: planned.filter(t => (REMEDIATION_TOOL_STAGE_ORDER[t.toolName] ?? 99) === sn),
    reanalyzeAfter: true,
  })).filter(s => s.tools.length > 0);

  return {
    stages,
    planningSummary: buildPlanningSummary({
      routing,
      scheduledTools: planned,
      skippedTools: [...skippedTools.entries()].map(([toolName, reason]) => ({ toolName, reason })),
    }),
  };
}

export function buildDefaultParams(
  toolName: string,
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Record<string, unknown> {
  const meta = snapshot.metadata;
  switch (toolName) {
    case 'set_document_title':
      return {
        title: deriveFallbackDocumentTitle(snapshot, analysis.filename),
      };
    case 'set_document_language':
      return { language: (meta.language?.trim() || snapshot.lang?.trim() || 'en-US').slice(0, 32) };
    case 'set_pdfua_identification':
      return {
        part: 1,
        language: (meta.language?.trim() || snapshot.lang?.trim() || 'en-US').slice(0, 32),
      };
    case 'ocr_scanned_pdf':
      return {
        languages: ocrmypdfLanguagesForSnapshot(snapshot),
        skipExistingText: analysis.pdfClass === 'mixed',
        deskew: true,
        rotatePages: true,
        /** Passed to ocrmypdf as `--force-ocr` so OCR still runs after an earlier tagging stage. */
        forceOcr: true,
      };
    case 'set_figure_alt_text': {
      const candidates = snapshot.figures
        .filter(f => !f.isArtifact && !f.hasAlt && f.structRef)
        .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''));
      const target = candidates[0];
      return target?.structRef ? { structRef: target.structRef, altText: 'Image' } : {};
    }
    case 'create_heading_from_candidate': {
      const candidate = (snapshot.paragraphStructElems ?? [])
        .filter(item => item.structRef && item.text.trim())
        .sort((a, b) => a.page - b.page || a.text.length - b.text.length)[0];
      if (!candidate) return {};
      return {
        targetRef: candidate.structRef,
        level: candidate.page === 0 ? 1 : 2,
        text: candidate.text.slice(0, 200),
      };
    }
    case 'substitute_legacy_fonts_in_place':
      return { maxWidthDrift: 0.12 };
    case 'finalize_substituted_font_conformance':
      return { maxWidthDrift: 0.35 };
    case 'mark_figure_decorative': {
      const candidates = snapshot.figures
        .filter(f => !f.isArtifact && !f.hasAlt && f.structRef)
        .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''));
      const target = candidates[0];
      return target?.structRef ? { structRef: target.structRef } : {};
    }
    case 'replace_bookmarks_from_headings':
      // force:true ensures we replace even when the PDF already has bookmarks (they may be inadequate).
      return { force: true };
    case 'add_page_outline_bookmarks':
      return { maxPages: BOOKMARKS_PAGE_OUTLINE_MAX_PAGES };
    case 'set_table_header_cells': {
      const t = snapshot.tables
        .filter(row => !row.hasHeaders && row.structRef)
        .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''))[0];
      return t?.structRef ? { structRef: t.structRef } : {};
    }
    case 'wrap_singleton_orphan_mcid': {
      const o = snapshot.orphanMcids ?? [];
      if (o.length !== 1) return {};
      return { page: o[0]!.page, mcid: o[0]!.mcid };
    }
    default:
      return {};
  }
}

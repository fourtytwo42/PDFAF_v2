import type { CategoryKey, PdfClass, PlanningSkipReason, RemediationRoute } from '../../types.js';
import type { AnalysisResult, DocumentSnapshot, AppliedRemediationTool, RemediationPlan, RemediationStagePlan, PlannedRemediationTool } from '../../types.js';
import {
  BOOKMARKS_PAGE_OUTLINE_MAX_PAGES,
  BOOKMARKS_PAGE_THRESHOLD,
  OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS,
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
  metadata_foundation: [
    'set_pdfua_identification',
    'set_document_title',
    'set_document_language',
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
  figure_semantics: [
    'set_figure_alt_text',
    'mark_figure_decorative',
    'repair_alt_text_structure',
    'repair_annotation_alt_text',
    'retag_as_figure',
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
  if (toolName === 'ocr_scanned_pdf') {
    if (pdfClass === 'scanned' || pdfClass === 'mixed') return true;
    if (
      (pdfClass === 'native_untagged' || pdfClass === 'native_tagged') &&
      snapshot.textCharCount <= OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS
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
      if (!v.tooltip?.trim()) return true;
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
  if (toolName === 'set_figure_alt_text' || toolName === 'mark_figure_decorative' || toolName === 'retag_as_figure') {
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
    return snapshot.structureTree !== null && (l?.listItemMisplacedCount ?? 0) > 0;
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
  if (analysis.score >= REMEDIATION_TARGET_SCORE) {
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

  const categoryFailing = (key: CategoryKey) => failCats.includes(key);
  const hasAnnotationSignals =
    (snapshot.detectionProfile?.annotationSignals.pagesMissingTabsS ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.linkAnnotationsMissingStructure ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.nonLinkAnnotationsMissingStructure ?? 0) > 0 ||
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
  const structurePrimary =
    analysis.failureProfile?.primaryFailureFamily === 'structure_reading_order_heavy' ||
    analysis.failureProfile?.primaryFailureFamily === 'mixed_structural';

  const toolIsRouteRelevant = (toolName: string): { allowed: boolean; reason?: PlanningSkipReason } => {
    if (routing.deferredRoutes.includes('figure_semantics') && ROUTE_TOOL_MAP.figure_semantics.includes(toolName)) {
      return { allowed: false, reason: 'semantic_deferred' };
    }
    if (toolName === 'repair_annotation_alt_text' && !hasAnnotationSignals) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'repair_native_reading_order' && !(categoryFailing('reading_order') || hasReadingOrderSignals)) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if ((toolName === 'repair_native_table_headers' || toolName === 'set_table_header_cells') && !(snapshot.tables.length > 0 && (categoryFailing('table_markup') || hasTableSignals))) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if ((toolName === 'replace_bookmarks_from_headings' || toolName === 'add_page_outline_bookmarks') && !categoryFailing('bookmarks')) {
      return { allowed: false, reason: 'category_not_failing' };
    }
    if (toolName === 'fill_form_field_tooltips' && !categoryFailing('form_accessibility')) {
      return { allowed: false, reason: 'category_not_failing' };
    }
    if (ROUTE_TOOL_MAP.figure_semantics.includes(toolName) && structurePrimary) {
      return { allowed: false, reason: 'semantic_deferred' };
    }
    if (toolName === 'ocr_scanned_pdf' && !(analysis.failureProfile?.primaryFailureFamily === 'font_extractability_heavy' || categoryFailing('text_extractability') || analysis.pdfClass === 'scanned' || analysis.pdfClass === 'mixed')) {
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
        addSkipped(toolName, 'missing_precondition');
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
        title: (meta.title?.trim() || analysis.filename.replace(/\.pdf$/i, '')).slice(0, 500),
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

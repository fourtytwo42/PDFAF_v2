import type { CategoryKey, PdfClass } from '../../types.js';
import type { AnalysisResult, DocumentSnapshot, AppliedRemediationTool, RemediationPlan, RemediationStagePlan, PlannedRemediationTool } from '../../types.js';
import {
  BOOKMARKS_PAGE_OUTLINE_MAX_PAGES,
  BOOKMARKS_PAGE_THRESHOLD,
  OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS,
  REMEDIATION_CATEGORY_THRESHOLD,
  REMEDIATION_CRITERION_TOOL_MAP,
  REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN,
  REMEDIATION_MAX_NO_EFFECT_PER_TOOL,
  REMEDIATION_TARGET_SCORE,
  REMEDIATION_TOOL_STAGE_ORDER,
  TOOL_RELIABILITY_FILTER_MAX_SUCCESS_RATE,
  TOOL_RELIABILITY_FILTER_MIN_ATTEMPTS,
} from '../../config.js';
import type { ToolOutcomeStore } from '../learning/toolOutcomes.js';

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
    return { stages: [] };
  }

  const failCats = failingCategories(analysis);
  const toolSet = new Map<string, PlannedRemediationTool>();

  for (const cat of failCats) {
    const tools = REMEDIATION_CRITERION_TOOL_MAP[cat];
    if (!tools?.length) continue;
    for (const toolName of tools) {
      if (!toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)) continue;
      if (shouldSkipAfterSuccessfulApply(toolName, alreadyApplied)) continue;
      if (noEffectCountForTool(alreadyApplied, toolName) >= REMEDIATION_MAX_NO_EFFECT_PER_TOOL) continue;
      if (toolSet.has(toolName)) continue;

      const params = buildDefaultParams(toolName, analysis, snapshot);
      toolSet.set(toolName, {
        toolName,
        params,
        rationale: `Address failing category "${cat}" (score below ${REMEDIATION_CATEGORY_THRESHOLD}).`,
      });
    }
  }

  const plannedRaw = Array.from(toolSet.values()).sort((a, b) => {
    const sa = REMEDIATION_TOOL_STAGE_ORDER[a.toolName] ?? 99;
    const sb = REMEDIATION_TOOL_STAGE_ORDER[b.toolName] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.toolName.localeCompare(b.toolName);
  });

  const planned = filterPlannedToolsByReliability(plannedRaw, analysis.pdfClass, toolOutcomeStore);

  if (planned.length === 0) {
    return { stages: [] };
  }

  // One stage per distinct stage number; reanalyze after each stage (authoritative score).
  const stageNumbers = [...new Set(planned.map(t => REMEDIATION_TOOL_STAGE_ORDER[t.toolName] ?? 99))].sort((a, b) => a - b);
  const stages: RemediationStagePlan[] = stageNumbers.map(sn => ({
    stageNumber: sn,
    tools: planned.filter(t => (REMEDIATION_TOOL_STAGE_ORDER[t.toolName] ?? 99) === sn),
    reanalyzeAfter: true,
  })).filter(s => s.tools.length > 0);

  return { stages };
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

import type { CategoryKey } from '../../types.js';
import type { AnalysisResult, DocumentSnapshot, AppliedRemediationTool, RemediationPlan, RemediationStagePlan, PlannedRemediationTool } from '../../types.js';
import {
  REMEDIATION_CATEGORY_THRESHOLD,
  REMEDIATION_CRITERION_TOOL_MAP,
  REMEDIATION_MAX_NO_EFFECT_PER_TOOL,
  REMEDIATION_TARGET_SCORE,
  REMEDIATION_TOOL_STAGE_ORDER,
} from '../../config.js';

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

function toolApplicableToPdfClass(toolName: string, pdfClass: AnalysisResult['pdfClass']): boolean {
  if (toolName === 'bootstrap_struct_tree') {
    if (pdfClass === 'scanned') return false;
    return pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  if (toolName === 'ocr_scanned_pdf') {
    return pdfClass === 'scanned' || pdfClass === 'mixed';
  }
  if (toolName === 'set_figure_alt_text' || toolName === 'mark_figure_decorative' || toolName === 'retag_as_figure') {
    return pdfClass !== 'scanned';
  }
  if (toolName === 'normalize_heading_hierarchy' || toolName === 'repair_native_reading_order') {
    return pdfClass === 'native_tagged' || pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  return true;
}

/**
 * Pure planner: failing categories + snapshot/pdfClass → staged tools.
 * No corpus ids, filenames, or customer-specific rules.
 */
export function planForRemediation(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[],
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
      if (!toolApplicableToPdfClass(toolName, analysis.pdfClass)) continue;
      if (wasSuccessfullyApplied(alreadyApplied, toolName)) continue;
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

  const planned = Array.from(toolSet.values()).sort((a, b) => {
    const sa = REMEDIATION_TOOL_STAGE_ORDER[a.toolName] ?? 99;
    const sb = REMEDIATION_TOOL_STAGE_ORDER[b.toolName] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.toolName.localeCompare(b.toolName);
  });

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

function buildDefaultParams(
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
    case 'set_figure_alt_text': {
      const target = snapshot.figures.find(f => !f.isArtifact && !f.hasAlt && f.structRef);
      return target?.structRef ? { structRef: target.structRef, altText: 'Image' } : {};
    }
    case 'mark_figure_decorative': {
      const target = snapshot.figures.find(f => !f.isArtifact && !f.hasAlt && f.structRef);
      return target?.structRef ? { structRef: target.structRef } : {};
    }
    default:
      return {};
  }
}

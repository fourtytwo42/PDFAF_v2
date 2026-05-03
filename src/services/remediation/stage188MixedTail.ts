import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  DocumentSnapshot,
} from '../../types.js';
import {
  classifyStage181HiddenAlt,
  stage181HiddenAltTargets,
  type Stage181HiddenAltTarget,
} from './stage181HiddenAlt.js';
import {
  collectStage186TargetRefs,
  stage186TableTargets,
  type Stage186TableTarget,
} from './stage186Hard2TableAlt.js';

export type Stage188MixedTailClass =
  | 'explicit_table_repair_candidate'
  | 'hidden_alt_ownership_candidate'
  | 'pdfua_cleanup_after_category_gain_candidate'
  | 'ordered_table_alt_pdfua_transaction_candidate'
  | 'heading_or_reading_order_not_this_stage'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_target';

export interface Stage188MixedTailDecision {
  classification: Stage188MixedTailClass;
  shouldAttemptTable: boolean;
  shouldAttemptAlt: boolean;
  shouldAttemptPdfUaCleanup: boolean;
  reason: string;
  tableTargets: Stage186TableTarget[];
  altTargets: Stage181HiddenAltTarget[];
  attemptedTableRefs: string[];
  attemptedAltRefs: string[];
  priorTableNoCategoryGainCount: number;
  priorAltNoCategoryGainCount: number;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureAltCount: number;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
}

const CORE_STABLE_MIN = 80;
const TABLE_TOOL_NAMES = new Set([
  'normalize_table_structure',
  'repair_native_table_headers',
  'set_table_header_cells',
]);
const ALT_TOOL_NAMES = new Set([
  'set_figure_alt_text',
  'retag_as_figure',
  'canonicalize_figure_alt_ownership',
  'repair_alt_text_structure',
]);

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return row?.applicable === false ? null : row?.score ?? null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function replayCategory(details: unknown, suffix: 'Before' | 'After', key: CategoryKey): number | null {
  const scores = nested(nested(nested(parseDetails(details), 'debug'), 'replayState'), `categoryScores${suffix}`);
  const value = scores?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function attemptedRefs(
  appliedTools: readonly AppliedRemediationTool[],
  toolNames: ReadonlySet<string>,
): string[] {
  const refs = new Set<string>();
  for (const tool of appliedTools) {
    if (!toolNames.has(tool.toolName)) continue;
    for (const ref of collectStage186TargetRefs(tool.details)) refs.add(ref);
  }
  return [...refs].sort();
}

function noCategoryGainCount(
  appliedTools: readonly AppliedRemediationTool[],
  toolNames: ReadonlySet<string>,
  category: CategoryKey,
): number {
  let count = 0;
  for (const tool of appliedTools) {
    if (!toolNames.has(tool.toolName)) continue;
    if (tool.outcome !== 'applied' && tool.outcome !== 'no_effect') continue;
    const before = replayCategory(tool.details, 'Before', category);
    const after = replayCategory(tool.details, 'After', category);
    if (before !== null && after !== null) {
      if (after <= before) count += 1;
      continue;
    }
    if ((tool.delta ?? 0) <= 0) count += 1;
  }
  return count;
}

function checkerAltCoverage(snapshot: DocumentSnapshot): { total: number; withAlt: number } {
  const targets = snapshot.checkerFigureTargets ?? [];
  return {
    total: targets.length,
    withAlt: targets.filter(target => target.hasAlt).length,
  };
}

function pdfUaCleanupEvidence(snapshot: DocumentSnapshot): { orphanMcidCount: number; suspectedPathPaintOutsideMc: number } {
  return {
    orphanMcidCount:
      snapshot.taggedContentAudit?.orphanMcidCount ??
      snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ??
      snapshot.orphanMcids?.length ??
      0,
    suspectedPathPaintOutsideMc:
      snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ??
      snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ??
      0,
  };
}

export function classifyStage188MixedTail(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  parked?: boolean;
  falsePositiveApplied?: number;
}): Stage188MixedTailDecision {
  const appliedTools = input.appliedTools ?? [];
  const tableTargets = stage186TableTargets(input.snapshot, appliedTools);
  const altTargets = stage181HiddenAltTargets(input.snapshot, appliedTools);
  const attemptedTableRefs = attemptedRefs(appliedTools, TABLE_TOOL_NAMES);
  const attemptedAltRefs = attemptedRefs(appliedTools, ALT_TOOL_NAMES);
  const priorTableNoCategoryGainCount = noCategoryGainCount(appliedTools, TABLE_TOOL_NAMES, 'table_markup');
  const priorAltNoCategoryGainCount = noCategoryGainCount(appliedTools, ALT_TOOL_NAMES, 'alt_text');
  const checker = checkerAltCoverage(input.snapshot);
  const cleanup = pdfUaCleanupEvidence(input.snapshot);

  const decision = (
    classification: Stage188MixedTailClass,
    shouldAttemptTable: boolean,
    shouldAttemptAlt: boolean,
    shouldAttemptPdfUaCleanup: boolean,
    reason: string,
  ): Stage188MixedTailDecision => ({
    classification,
    shouldAttemptTable,
    shouldAttemptAlt,
    shouldAttemptPdfUaCleanup,
    reason,
    tableTargets,
    altTargets,
    attemptedTableRefs,
    attemptedAltRefs,
    priorTableNoCategoryGainCount,
    priorAltNoCategoryGainCount,
    checkerVisibleFigureCount: checker.total,
    checkerVisibleFigureAltCount: checker.withAlt,
    orphanMcidCount: cleanup.orphanMcidCount,
    suspectedPathPaintOutsideMc: cleanup.suspectedPathPaintOutsideMc,
  });

  if (input.parked) {
    return decision('protected_or_analyzer_volatility', false, false, false, 'parked protected/analyzer-volatility control');
  }
  if ((input.falsePositiveApplied ?? 0) > 0) {
    return decision('no_safe_target', false, false, false, 'false-positive-applied evidence present');
  }
  if (input.analysis.pdfClass === 'scanned' || input.snapshot.pdfClass === 'scanned') {
    return decision('no_safe_target', false, false, false, 'OCR/scanned row is not a Stage 188 mixed native target');
  }
  if (!input.snapshot.isTagged && input.snapshot.structureTree === null) {
    return decision('no_safe_target', false, false, false, 'no tagged/native structure tree');
  }

  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const link = categoryScore(input.analysis, 'link_quality') ?? 100;
  const table = categoryScore(input.analysis, 'table_markup') ?? 100;
  const alt = categoryScore(input.analysis, 'alt_text') ?? 100;
  const pdfua = categoryScore(input.analysis, 'pdf_ua_compliance') ?? 100;
  if (heading < CORE_STABLE_MIN || reading < CORE_STABLE_MIN) {
    return decision(
      'heading_or_reading_order_not_this_stage',
      false,
      false,
      false,
      `heading/reading-order is still the primary blocker (${heading}/${reading})`,
    );
  }
  if (link < CORE_STABLE_MIN) {
    return decision('no_safe_target', false, false, false, `link quality is not stable enough (${link})`);
  }

  const hiddenAlt = classifyStage181HiddenAlt({
    analysis: input.analysis,
    snapshot: input.snapshot,
    appliedTools,
    falsePositiveApplied: input.falsePositiveApplied,
  });
  const hasIndependentAlt = hiddenAlt.shouldAttempt && hiddenAlt.targets.length > 0;
  const hasPdfUaCleanup = pdfua < 80 && (cleanup.orphanMcidCount > 0 || cleanup.suspectedPathPaintOutsideMc > 0);

  if (table < 80 && tableTargets.length > 0 && priorTableNoCategoryGainCount === 0) {
    return decision(
      'explicit_table_repair_candidate',
      true,
      false,
      false,
      'distinct unattempted content-backed table refs remain and prior table refs were not no-gain',
    );
  }

  if (table < 80 && alt < 80 && pdfua < 80 && (tableTargets.length > 0 || hasIndependentAlt) && hasPdfUaCleanup) {
    return decision(
      'ordered_table_alt_pdfua_transaction_candidate',
      tableTargets.length > 0 && priorTableNoCategoryGainCount === 0,
      hasIndependentAlt,
      true,
      'mixed table/alt/PDF-UA debt requires ordered evidence and final reanalysis',
    );
  }

  if (alt < 80 && hasIndependentAlt && table >= CORE_STABLE_MIN) {
    return decision(
      'hidden_alt_ownership_candidate',
      false,
      true,
      false,
      hiddenAlt.reason,
    );
  }

  if (hasPdfUaCleanup && table >= CORE_STABLE_MIN && alt >= CORE_STABLE_MIN) {
    return decision(
      'pdfua_cleanup_after_category_gain_candidate',
      false,
      false,
      true,
      'only bounded PDF/UA orphan/path cleanup evidence remains after stable table/alt state',
    );
  }

  if (table < 80 && priorTableNoCategoryGainCount > 0) {
    return decision('no_safe_target', false, false, false, 'prior explicit table attempts produced no table/category gain');
  }
  if (alt < 80 && priorAltNoCategoryGainCount > 0 && !hasIndependentAlt) {
    return decision('no_safe_target', false, false, false, 'prior alt attempts produced no alt/category gain and no new target remains');
  }

  return decision('no_safe_target', false, false, false, 'no independent table, alt, or PDF/UA path is available');
}

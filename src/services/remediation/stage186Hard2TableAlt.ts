import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  DocumentSnapshot,
} from '../../types.js';
import {
  stage181HiddenAltTargets,
  type Stage181HiddenAltTarget,
} from './stage181HiddenAlt.js';

export type Stage186Hard2TableAltClass =
  | 'safe_table_continuation_candidate'
  | 'table_ref_no_category_gain'
  | 'rolemap_alt_after_table_candidate'
  | 'alt_first_candidate'
  | 'ordered_table_alt_pdfua_transaction_candidate'
  | 'analyzer_table_score_debt'
  | 'no_safe_path';

export interface Stage186TableTarget {
  structRef: string;
  page: number;
  irregularRows: number;
  dominantColumnCount: number;
  totalCells: number;
  rowCount: number;
  headerCount: number;
  subtreeMcidCount: number;
}

export interface Stage186Decision {
  classification: Stage186Hard2TableAltClass;
  shouldAttemptTable: boolean;
  shouldAttemptAlt: boolean;
  reason: string;
  tableTargets: Stage186TableTarget[];
  altTargets: Stage181HiddenAltTarget[];
  priorTableNoCategoryGainCount: number;
  priorAltNoCategoryGainCount: number;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureAltCount: number;
  stronglyIrregularTableCount: number;
  annotationRiskCount: number;
  orphanMcidCount: number;
}

export const STAGE186_MAX_TABLE_TARGETS = 12;
export const STAGE186_MAX_ALT_TARGETS = 4;

const CORE_STABLE_MIN = 80;

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

function addRef(out: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.length > 0) out.add(value);
}

function addRefsFromObject(out: Set<string>, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  addRef(out, record.structRef);
  addRef(out, record.targetRef);
  addRef(out, record.ref);
  addRefsFromObject(out, record.target);
  addRefsFromObject(out, record.invariants);
  addRefsFromObject(out, record.debug);
  addRefsFromObject(out, record.replayState);
}

export function collectStage186TargetRefs(details: unknown): Set<string> {
  const refs = new Set<string>();
  const parsed = parseDetails(details);
  addRefsFromObject(refs, parsed);
  addRefsFromObject(refs, nested(parsed, 'mutation'));
  const targetRefs = parsed?.targetRefs;
  if (Array.isArray(targetRefs)) {
    for (const ref of targetRefs) addRef(refs, ref);
  }
  const targets = parsed?.targets;
  if (Array.isArray(targets)) {
    for (const target of targets) addRefsFromObject(refs, target);
  }
  const mutations = parsed?.mutations;
  if (Array.isArray(mutations)) {
    for (const mutation of mutations) addRefsFromObject(refs, mutation);
  }
  return refs;
}

function attemptedRefs(
  appliedTools: readonly AppliedRemediationTool[],
  toolNames: ReadonlySet<string>,
): Set<string> {
  const refs = new Set<string>();
  for (const tool of appliedTools) {
    if (!toolNames.has(tool.toolName)) continue;
    for (const ref of collectStage186TargetRefs(tool.details)) refs.add(ref);
  }
  return refs;
}

function checkerVisibleAltCount(snapshot: DocumentSnapshot): { total: number; withAlt: number } {
  const targets = snapshot.checkerFigureTargets ?? [];
  return {
    total: targets.length,
    withAlt: targets.filter(target => target.hasAlt).length,
  };
}

function annotationRiskCount(snapshot: DocumentSnapshot): number {
  const annotation = snapshot.annotationAccessibility;
  const detection = snapshot.detectionProfile?.annotationSignals;
  return (
    (annotation?.pagesAnnotationOrderDiffers ?? detection?.pagesAnnotationOrderDiffers ?? 0) +
    (annotation?.linkAnnotationsMissingStructure ?? detection?.linkAnnotationsMissingStructure ?? 0) +
    (annotation?.linkAnnotationsMissingStructParent ?? detection?.linkAnnotationsMissingStructParent ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructure ?? detection?.nonLinkAnnotationsMissingStructure ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructParent ?? detection?.nonLinkAnnotationsMissingStructParent ?? 0)
  );
}

export function stage186TableTargets(
  snapshot: DocumentSnapshot,
  appliedTools: readonly AppliedRemediationTool[] = [],
  limit = STAGE186_MAX_TABLE_TARGETS,
): Stage186TableTarget[] {
  const attempted = attemptedRefs(
    appliedTools,
    new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']),
  );
  return snapshot.tables
    .filter(table => {
      if (!table.structRef || attempted.has(table.structRef)) return false;
      if (table.reachable !== true) return false;
      if (!table.hasHeaders) return false;
      if ((table.cellsMisplacedCount ?? 0) !== 0) return false;
      if ((table.rowCount ?? 0) <= 1) return false;
      if ((table.irregularRows ?? 0) < 2) return false;
      if ((table.dominantColumnCount ?? 0) < 2) return false;
      if ((table.subtreeMcidCount ?? 0) <= 0) return false;
      return true;
    })
    .sort((a, b) =>
      (b.irregularRows ?? 0) - (a.irregularRows ?? 0) ||
      a.page - b.page ||
      (a.structRef ?? '').localeCompare(b.structRef ?? '')
    )
    .slice(0, Math.max(0, limit))
    .map(table => ({
      structRef: table.structRef!,
      page: table.page,
      irregularRows: table.irregularRows ?? 0,
      dominantColumnCount: table.dominantColumnCount ?? 0,
      totalCells: table.totalCells,
      rowCount: table.rowCount ?? 0,
      headerCount: table.headerCount ?? 0,
      subtreeMcidCount: table.subtreeMcidCount ?? 0,
    }));
}

export function stage186AltTargets(
  snapshot: DocumentSnapshot,
  appliedTools: readonly AppliedRemediationTool[] = [],
): Stage181HiddenAltTarget[] {
  return stage181HiddenAltTargets(snapshot, appliedTools)
    .filter(target => target.source === 'rolemap_retag_with_alt' || target.source === 'checker_visible_missing_alt')
    .slice(0, STAGE186_MAX_ALT_TARGETS);
}

function toolCategoryScore(details: unknown, suffix: 'Before' | 'After', key: CategoryKey): number | null {
  const parsed = parseDetails(details);
  const replay = nested(nested(parsed, 'debug'), 'replayState');
  const scores = nested(replay, `categoryScores${suffix}`);
  const value = scores?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function noCategoryGainCount(
  appliedTools: readonly AppliedRemediationTool[],
  toolNames: ReadonlySet<string>,
  category: CategoryKey,
): number {
  let count = 0;
  for (const row of appliedTools) {
    if (!toolNames.has(row.toolName)) continue;
    if (row.outcome !== 'applied' && row.outcome !== 'no_effect') continue;
    const before = toolCategoryScore(row.details, 'Before', category);
    const after = toolCategoryScore(row.details, 'After', category);
    if (before !== null && after !== null && after <= before) count += 1;
    else if ((row.delta ?? 0) <= 0) count += 1;
  }
  return count;
}

export function classifyStage186Hard2TableAlt(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  falsePositiveApplied?: number;
}): Stage186Decision {
  const appliedTools = input.appliedTools ?? [];
  const tableTargets = stage186TableTargets(input.snapshot, appliedTools);
  const altTargets = stage186AltTargets(input.snapshot, appliedTools);
  const priorTableNoCategoryGainCount = noCategoryGainCount(
    appliedTools,
    new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']),
    'table_markup',
  );
  const priorAltNoCategoryGainCount = noCategoryGainCount(
    appliedTools,
    new Set(['set_figure_alt_text', 'retag_as_figure']),
    'alt_text',
  );
  const figureCoverage = checkerVisibleAltCount(input.snapshot);
  const stronglyIrregularTableCount = input.snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0;
  const annotationRisk = annotationRiskCount(input.snapshot);
  const orphanMcidCount =
    input.snapshot.taggedContentAudit?.orphanMcidCount ??
    input.snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ??
    input.snapshot.orphanMcids?.length ??
    0;
  const base = {
    tableTargets,
    altTargets,
    priorTableNoCategoryGainCount,
    priorAltNoCategoryGainCount,
    checkerVisibleFigureCount: figureCoverage.total,
    checkerVisibleFigureAltCount: figureCoverage.withAlt,
    stronglyIrregularTableCount,
    annotationRiskCount: annotationRisk,
    orphanMcidCount,
  };
  const decision = (
    classification: Stage186Hard2TableAltClass,
    shouldAttemptTable: boolean,
    shouldAttemptAlt: boolean,
    reason: string,
  ): Stage186Decision => ({
    classification,
    shouldAttemptTable,
    shouldAttemptAlt,
    reason,
    ...base,
  });

  if ((input.falsePositiveApplied ?? 0) > 0) {
    return decision('no_safe_path', false, false, 'false-positive-applied evidence present');
  }
  if (input.analysis.pdfClass === 'scanned' || input.snapshot.pdfClass === 'scanned') {
    return decision('no_safe_path', false, false, 'OCR/scanned rows are not Stage 186 native table/alt targets');
  }
  if (!input.snapshot.isTagged && input.snapshot.structureTree === null) {
    return decision('no_safe_path', false, false, 'no tagged/native structure tree');
  }
  if (annotationRisk > 0) {
    return decision('no_safe_path', false, false, `annotation order/ownership risk remains (${annotationRisk})`);
  }

  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const link = categoryScore(input.analysis, 'link_quality') ?? 100;
  const table = categoryScore(input.analysis, 'table_markup') ?? 100;
  const alt = categoryScore(input.analysis, 'alt_text') ?? 100;
  const pdfua = categoryScore(input.analysis, 'pdf_ua_compliance') ?? 100;
  if (heading < CORE_STABLE_MIN || reading < CORE_STABLE_MIN || link < CORE_STABLE_MIN) {
    return decision('no_safe_path', false, false, `core categories are not stable (${heading}/${reading}/${link})`);
  }

  if (table < 80 && tableTargets.length >= 4 && priorTableNoCategoryGainCount > 0) {
    if (alt < 80 && altTargets.length > 0) {
      return decision(
        'rolemap_alt_after_table_candidate',
        false,
        true,
        'prior explicit table repairs did not move the category; skip table retry and test bounded role-map alt ownership',
      );
    }
    return decision(
      'table_ref_no_category_gain',
      false,
      false,
      'prior explicit table repairs did not move the category and no safe alt fallback remains',
    );
  }
  if (table < 80 && tableTargets.length > 0) {
    return decision('safe_table_continuation_candidate', true, false, 'distinct unattempted content-backed table refs remain');
  }
  if (table < 80 && priorTableNoCategoryGainCount > 0 && alt < 80 && altTargets.length > 0) {
    return decision('rolemap_alt_after_table_candidate', false, true, 'table refs did not move the category, but safe role-map alt targets remain');
  }
  if (table < 80 && priorTableNoCategoryGainCount > 0) {
    return decision('table_ref_no_category_gain', false, false, 'explicit table refs applied without table category gain');
  }
  if (table < 80 && stronglyIrregularTableCount > 0) {
    return decision('analyzer_table_score_debt', false, false, 'table score remains low but no safe unattempted table refs are available');
  }
  if (table >= 80 && alt < 80 && altTargets.length > 0) {
    return decision('alt_first_candidate', false, true, 'table category is stable and safe alt targets remain');
  }
  if (pdfua < 80 && orphanMcidCount > 0) {
    return decision('analyzer_table_score_debt', false, false, 'only PDF/UA/orphan debt remains after table/alt gates');
  }
  return decision('no_safe_path', false, false, 'no Stage 186 table/alt path is available');
}

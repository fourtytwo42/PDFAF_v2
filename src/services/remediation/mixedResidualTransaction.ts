import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  DocumentSnapshot,
} from '../../types.js';

export const STAGE174_MAX_ALT_TARGETS = 3;
export const STAGE174_MAX_TABLE_TARGETS = 2;
export const STAGE174_MAX_ORPHAN_DRAINS = 2;

export interface Stage174AltTarget {
  structRef: string;
  page: number;
  directContent: boolean;
  subtreeMcidCount: number;
}

export interface Stage174TableTarget {
  structRef: string;
  page: number;
  irregularRows: number;
  dominantColumnCount: number;
  totalCells: number;
  rowCount: number;
  subtreeMcidCount: number;
}

export interface Stage174Targets {
  altTargets: Stage174AltTarget[];
  tableTargets: Stage174TableTarget[];
  annotationRiskCount: number;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
}

export interface Stage174CandidateDecision {
  shouldAttempt: boolean;
  reason: string;
  targets: Stage174Targets;
}

export interface Stage174FinalDecision {
  accept: boolean;
  reason: string;
  details: {
    outcome: 'applied' | 'rejected';
    note: string;
    scoreBefore: number;
    scoreAfter: number;
    categoryDeltas: Partial<Record<CategoryKey, number>>;
    targetCategoryImproved: boolean;
    pdfUaAttempted: boolean;
    regressionReasons: string[];
    altTargetCount: number;
    tableTargetCount: number;
  };
}

const CORE_CATEGORIES = [
  'heading_structure',
  'reading_order',
  'alt_text',
  'table_markup',
  'pdf_ua_compliance',
  'link_quality',
] as const satisfies readonly CategoryKey[];

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function isFigureRole(role: string | null | undefined): boolean {
  return (role ?? '').replace(/^\//, '').toLowerCase() === 'figure';
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nestedRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mutationTargetRef(row: AppliedRemediationTool): string | null {
  const parsed = parseDetails(row.details);
  const invariants = nestedRecord(parsed, 'invariants');
  if (typeof invariants?.['targetRef'] === 'string') return invariants['targetRef'];
  const debug = nestedRecord(parsed, 'debug');
  if (typeof debug?.['targetRef'] === 'string') return debug['targetRef'];
  const replayState = nestedRecord(debug, 'replayState');
  if (typeof replayState?.['targetRef'] === 'string') return replayState['targetRef'];
  return null;
}

function attemptedRefs(rows: readonly AppliedRemediationTool[], toolName: string): Set<string> {
  return new Set(
    rows
      .filter(row => row.toolName === toolName)
      .map(mutationTargetRef)
      .filter((ref): ref is string => Boolean(ref)),
  );
}

function annotationRiskCount(snapshot: DocumentSnapshot): number {
  const annotation = snapshot.annotationAccessibility;
  const detection = snapshot.detectionProfile?.annotationSignals;
  return (
    (annotation?.pagesAnnotationOrderDiffers ?? 0) +
    (annotation?.linkAnnotationsMissingStructure ?? detection?.linkAnnotationsMissingStructure ?? 0) +
    (annotation?.linkAnnotationsMissingStructParent ?? detection?.linkAnnotationsMissingStructParent ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructure ?? detection?.nonLinkAnnotationsMissingStructure ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructParent ?? detection?.nonLinkAnnotationsMissingStructParent ?? 0)
  );
}

export function stage174BuildMixedTransactionTargets(
  snapshot: DocumentSnapshot,
  appliedTools: readonly AppliedRemediationTool[] = [],
): Stage174Targets {
  const attemptedAlt = attemptedRefs(appliedTools, 'set_figure_alt_text');
  const checkerFigureRefs = new Set(
    (snapshot.checkerFigureTargets ?? [])
      .filter(target =>
        target.reachable &&
        !target.isArtifact &&
        !target.hasAlt &&
        isFigureRole(target.resolvedRole ?? target.role) &&
        typeof target.structRef === 'string' &&
        target.structRef.length > 0
      )
      .map(target => target.structRef!),
  );
  const altTargets = snapshot.figures
    .filter(figure =>
      typeof figure.structRef === 'string' &&
      checkerFigureRefs.has(figure.structRef) &&
      !attemptedAlt.has(figure.structRef) &&
      figure.reachable === true &&
      !figure.hasAlt &&
      (figure.directContent === true || (figure.subtreeMcidCount ?? 0) > 0)
    )
    .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''))
    .slice(0, STAGE174_MAX_ALT_TARGETS)
    .map(figure => ({
      structRef: figure.structRef!,
      page: figure.page,
      directContent: figure.directContent === true,
      subtreeMcidCount: figure.subtreeMcidCount ?? 0,
    }));

  const attemptedTables = attemptedRefs(appliedTools, 'normalize_table_structure');
  const tableTargets = snapshot.tables
    .filter(table =>
      typeof table.structRef === 'string' &&
      table.structRef.length > 0 &&
      !attemptedTables.has(table.structRef) &&
      table.reachable === true &&
      table.hasHeaders &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1 &&
      (table.irregularRows ?? 0) >= 2 &&
      (table.dominantColumnCount ?? 0) >= 2 &&
      (table.subtreeMcidCount ?? 0) > 0
    )
    .sort((a, b) =>
      (b.irregularRows ?? 0) - (a.irregularRows ?? 0) ||
      a.page - b.page ||
      (a.structRef ?? '').localeCompare(b.structRef ?? '')
    )
    .slice(0, STAGE174_MAX_TABLE_TARGETS)
    .map(table => ({
      structRef: table.structRef!,
      page: table.page,
      irregularRows: table.irregularRows ?? 0,
      dominantColumnCount: table.dominantColumnCount ?? 0,
      totalCells: table.totalCells,
      rowCount: table.rowCount ?? 0,
      subtreeMcidCount: table.subtreeMcidCount ?? 0,
    }));

  return {
    altTargets,
    tableTargets,
    annotationRiskCount: annotationRiskCount(snapshot),
    orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount
      ?? snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount
      ?? snapshot.orphanMcids?.length
      ?? 0,
    suspectedPathPaintOutsideMc: snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc
      ?? snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc
      ?? 0,
  };
}

export function stage174MixedTransactionCandidate(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  isOcr: boolean;
  falsePositiveApplied?: number;
}): Stage174CandidateDecision {
  const targets = stage174BuildMixedTransactionTargets(input.snapshot, input.appliedTools ?? []);
  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const alt = categoryScore(input.analysis, 'alt_text') ?? 100;
  const table = categoryScore(input.analysis, 'table_markup') ?? 100;
  const pdfua = categoryScore(input.analysis, 'pdf_ua_compliance') ?? 100;
  if (input.falsePositiveApplied && input.falsePositiveApplied > 0) {
    return { shouldAttempt: false, reason: 'false_positive_applied_evidence_present', targets };
  }
  if (input.isOcr || input.snapshot.pdfClass === 'scanned') {
    return { shouldAttempt: false, reason: 'ocr_or_scanned_row_not_stage174_target', targets };
  }
  if (!input.snapshot.isTagged && input.snapshot.structureTree === null) {
    return { shouldAttempt: false, reason: 'not_tagged_or_structured', targets };
  }
  if (heading < 80 || reading < 80) {
    return { shouldAttempt: false, reason: `heading_or_reading_not_safe(${heading}/${reading})`, targets };
  }
  if (!(alt < 80 && table < 80 && pdfua < 80)) {
    return { shouldAttempt: false, reason: `not_mixed_alt_table_pdfua(${alt}/${table}/${pdfua})`, targets };
  }
  if (targets.annotationRiskCount > 0) {
    return { shouldAttempt: false, reason: `annotation_or_link_risk(${targets.annotationRiskCount})`, targets };
  }
  if (targets.altTargets.length === 0) {
    return { shouldAttempt: false, reason: 'no_safe_unattempted_alt_targets', targets };
  }
  if (targets.tableTargets.length === 0) {
    return { shouldAttempt: false, reason: 'no_safe_unattempted_table_targets', targets };
  }
  return { shouldAttempt: true, reason: 'stage174_mixed_transaction_candidate', targets };
}

export function stage174RegressionReasons(input: {
  before: AnalysisResult;
  final: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  finalSnapshot: DocumentSnapshot;
}): string[] {
  const reasons: string[] = [];
  for (const key of CORE_CATEGORIES) {
    const before = categoryScore(input.before, key);
    const after = categoryScore(input.final, key);
    if (before == null || after == null) continue;
    if (after < before) reasons.push(`${key}:${before}->${after}`);
  }
  if (input.finalSnapshot.pageCount !== input.beforeSnapshot.pageCount) {
    reasons.push(`page_count:${input.beforeSnapshot.pageCount}->${input.finalSnapshot.pageCount}`);
  }
  const beforeText = input.beforeSnapshot.textCharCount ?? 0;
  const afterText = input.finalSnapshot.textCharCount ?? 0;
  if (afterText < beforeText - Math.max(5, Math.round(beforeText * 0.001))) {
    reasons.push(`text_count:${beforeText}->${afterText}`);
  }
  if (input.beforeSnapshot.isTagged && !input.finalSnapshot.isTagged) reasons.push('tagged_state_lost');
  if (input.beforeSnapshot.structureTree !== null && input.finalSnapshot.structureTree === null) reasons.push('structure_tree_lost');
  if (input.finalSnapshot.links.length < input.beforeSnapshot.links.length) {
    reasons.push(`links:${input.beforeSnapshot.links.length}->${input.finalSnapshot.links.length}`);
  }
  if (input.finalSnapshot.fonts.length < input.beforeSnapshot.fonts.length) {
    reasons.push(`fonts:${input.beforeSnapshot.fonts.length}->${input.finalSnapshot.fonts.length}`);
  }
  return reasons;
}

function categoryDelta(input: { before: AnalysisResult; final: AnalysisResult }, key: CategoryKey): number | null {
  const before = categoryScore(input.before, key);
  const after = categoryScore(input.final, key);
  return before == null || after == null ? null : after - before;
}

export function stage174MixedTransactionFinalDecision(input: {
  before: AnalysisResult;
  final: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  finalSnapshot: DocumentSnapshot;
  pdfUaAttempted: boolean;
  altTargetCount: number;
  tableTargetCount: number;
}): Stage174FinalDecision {
  const categoryDeltas: Partial<Record<CategoryKey, number>> = {};
  for (const key of CORE_CATEGORIES) {
    const delta = categoryDelta(input, key);
    if (delta !== null) categoryDeltas[key] = delta;
  }
  const regressionReasons = stage174RegressionReasons(input);
  const targetCategoryImproved =
    (categoryDeltas.alt_text ?? 0) > 0 ||
    (categoryDeltas.table_markup ?? 0) > 0 ||
    (categoryDeltas.pdf_ua_compliance ?? 0) > 0;
  const scoreImproved = input.final.score > input.before.score;
  const pdfuaStable = !input.pdfUaAttempted || (categoryDeltas.pdf_ua_compliance ?? 0) >= 0;
  const targetAttempted = input.altTargetCount > 0 && input.tableTargetCount > 0;
  const accept = scoreImproved && targetCategoryImproved && regressionReasons.length === 0 && pdfuaStable && targetAttempted;
  const reason = accept
    ? 'stage174_ordered_mixed_transaction_committed'
    : `stage174_ordered_mixed_transaction_rollback(score:${input.before.score}->${input.final.score},targetImproved:${targetCategoryImproved},regressions:${regressionReasons.join(',') || 'none'},pdfuaStable:${pdfuaStable},targets:${input.altTargetCount}/${input.tableTargetCount})`;
  return {
    accept,
    reason,
    details: {
      outcome: accept ? 'applied' : 'rejected',
      note: reason,
      scoreBefore: input.before.score,
      scoreAfter: input.final.score,
      categoryDeltas,
      targetCategoryImproved,
      pdfUaAttempted: input.pdfUaAttempted,
      regressionReasons,
      altTargetCount: input.altTargetCount,
      tableTargetCount: input.tableTargetCount,
    },
  };
}

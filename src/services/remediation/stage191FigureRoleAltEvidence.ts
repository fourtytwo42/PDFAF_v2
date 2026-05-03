import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../types.js';
import { collectStage186TargetRefs } from './stage186Hard2TableAlt.js';

export type Stage191FigureRoleAltEvidenceClass =
  | 'duplicate_nonfigure_role_debt_covered_by_alt_figure'
  | 'raw_figure_alt_missing_true_debt'
  | 'hidden_rolemap_alt_cap_limited'
  | 'alt_scorer_cap_true_nonfigure_debt'
  | 'mixed_table_or_heading_blocker'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_alignment_rule';

export interface Stage191FigureEvidenceRow {
  structRef: string | null;
  page: number;
  rawRole: string | null;
  resolvedRole: string | null;
  hasAlt: boolean;
  reachable: boolean;
  directContent: boolean;
  subtreeMcidCount: number;
  subtreeMcids: number[];
  parentPath: string[];
}

export interface Stage191DuplicateOwnership {
  nonFigureRef: string;
  nonFigureRole: string | null;
  page: number;
  coveredByRefs: string[];
  sharedMcids: number[];
}

export interface Stage191FigureRoleAltEvidenceDecision {
  classification: Stage191FigureRoleAltEvidenceClass;
  behaviorCandidate: boolean;
  reason: string;
  categoryScores: Partial<Record<CategoryKey, number | null>>;
  scorerCaps: {
    nonFigureRoleCount: number;
    treeFigureMissingForExtractedFigures: boolean;
    effectiveNonFigureCap: number | null;
  };
  informativeFigureCount: number;
  informativeFigureAltCount: number;
  checkerFigureCount: number;
  checkerFigureAltCount: number;
  checkerMissingAltCount: number;
  roleMapMissingAltCount: number;
  duplicateOwnership: Stage191DuplicateOwnership[];
  figureRows: Stage191FigureEvidenceRow[];
  checkerRows: Stage191FigureEvidenceRow[];
  priorAltAttempts: string[];
}

const CORE_MIN = 80;
const ALT_TOOL_NAMES = new Set([
  'set_figure_alt_text',
  'retag_as_figure',
  'canonicalize_figure_alt_ownership',
  'repair_alt_text_structure',
  'normalize_nested_figure_containers',
]);

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function normRole(value: unknown): string {
  return String(value ?? '').replace(/^\//, '').trim().toLowerCase();
}

function isFigure(value: unknown): boolean {
  return normRole(value) === 'figure';
}

function hasRealAlt(row: { hasAlt: boolean; altText?: string }): boolean {
  return row.hasAlt && Boolean(row.altText?.trim());
}

function mcids(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item) && item >= 0)
    : [];
}

function figureRow(figure: DocumentSnapshot['figures'][number]): Stage191FigureEvidenceRow {
  return {
    structRef: figure.structRef ?? null,
    page: figure.page,
    rawRole: figure.rawRole ?? null,
    resolvedRole: figure.role ?? null,
    hasAlt: hasRealAlt(figure),
    reachable: figure.reachable === true,
    directContent: figure.directContent === true,
    subtreeMcidCount: figure.subtreeMcidCount ?? 0,
    subtreeMcids: mcids(figure.subtreeMcids),
    parentPath: figure.parentPath ?? [],
  };
}

function checkerRow(target: NonNullable<DocumentSnapshot['checkerFigureTargets']>[number]): Stage191FigureEvidenceRow {
  return {
    structRef: target.structRef ?? null,
    page: target.page,
    rawRole: target.role ?? null,
    resolvedRole: target.resolvedRole ?? target.role ?? null,
    hasAlt: hasRealAlt(target),
    reachable: target.reachable === true,
    directContent: target.directContent === true,
    subtreeMcidCount: mcids(target.subtreeMcids).length,
    subtreeMcids: mcids(target.subtreeMcids),
    parentPath: target.parentPath ?? [],
  };
}

function intersect(left: number[], right: number[]): number[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter(item => rightSet.has(item)))].sort((a, b) => a - b);
}

function duplicateOwnership(
  figures: Stage191FigureEvidenceRow[],
  checkerRows: Stage191FigureEvidenceRow[],
): Stage191DuplicateOwnership[] {
  const coveredRawFigures = checkerRows.filter(row =>
    row.reachable &&
    row.hasAlt &&
    isFigure(row.resolvedRole ?? row.rawRole) &&
    row.structRef &&
    row.subtreeMcids.length > 0
  );
  const out: Stage191DuplicateOwnership[] = [];
  for (const figure of figures) {
    if (!figure.structRef || !figure.reachable || isFigure(figure.rawRole) || isFigure(figure.resolvedRole)) continue;
    if (figure.subtreeMcids.length === 0) continue;
    const covered = coveredRawFigures
      .map(raw => ({ raw, shared: intersect(figure.subtreeMcids, raw.subtreeMcids) }))
      .filter(item => item.shared.length > 0);
    if (covered.length === 0) continue;
    out.push({
      nonFigureRef: figure.structRef,
      nonFigureRole: figure.rawRole ?? figure.resolvedRole,
      page: figure.page,
      coveredByRefs: covered.map(item => item.raw.structRef!).sort(),
      sharedMcids: [...new Set(covered.flatMap(item => item.shared))].sort((a, b) => a - b),
    });
  }
  return out.sort((a, b) => a.page - b.page || a.nonFigureRef.localeCompare(b.nonFigureRef));
}

function priorAltAttempts(tools: readonly AppliedRemediationTool[]): string[] {
  const refs = new Set<string>();
  for (const tool of tools) {
    if (!ALT_TOOL_NAMES.has(tool.toolName)) continue;
    for (const ref of collectStage186TargetRefs(tool.details)) refs.add(ref);
  }
  return [...refs].sort();
}

export function classifyStage191FigureRoleAltEvidence(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  parked?: boolean;
  falsePositiveApplied?: number;
}): Stage191FigureRoleAltEvidenceDecision {
  const categories: Partial<Record<CategoryKey, number | null>> = {
    heading_structure: categoryScore(input.analysis, 'heading_structure'),
    reading_order: categoryScore(input.analysis, 'reading_order'),
    alt_text: categoryScore(input.analysis, 'alt_text'),
    table_markup: categoryScore(input.analysis, 'table_markup'),
    pdf_ua_compliance: categoryScore(input.analysis, 'pdf_ua_compliance'),
    link_quality: categoryScore(input.analysis, 'link_quality'),
  };
  const figureRows = input.snapshot.figures.map(figureRow);
  const checkerRows = (input.snapshot.checkerFigureTargets ?? []).map(checkerRow);
  const informativeFigures = figureRows.filter(row => row.reachable && !input.snapshot.figures.find(f => f.structRef === row.structRef)?.isArtifact);
  const checkerVisible = checkerRows.filter(row => row.reachable && isFigure(row.resolvedRole ?? row.rawRole));
  const roleMapMissing = figureRows.filter(row =>
    row.reachable &&
    !row.hasAlt &&
    !isFigure(row.rawRole) &&
    isFigure(row.resolvedRole) &&
    row.subtreeMcidCount > 0
  );
  const duplicates = duplicateOwnership(figureRows, checkerRows);
  const figureSignals = input.snapshot.detectionProfile?.figureSignals;
  const nonFigureRoleCount = figureSignals?.nonFigureRoleCount ?? 0;
  const effectiveNonFigureCap = nonFigureRoleCount > 0 ? Math.max(0, 72 - nonFigureRoleCount * 10) : null;

  const base = (classification: Stage191FigureRoleAltEvidenceClass, reason: string, behaviorCandidate = false): Stage191FigureRoleAltEvidenceDecision => ({
    classification,
    behaviorCandidate,
    reason,
    categoryScores: categories,
    scorerCaps: {
      nonFigureRoleCount,
      treeFigureMissingForExtractedFigures: figureSignals?.treeFigureMissingForExtractedFigures === true,
      effectiveNonFigureCap,
    },
    informativeFigureCount: informativeFigures.length,
    informativeFigureAltCount: informativeFigures.filter(row => row.hasAlt).length,
    checkerFigureCount: checkerVisible.length,
    checkerFigureAltCount: checkerVisible.filter(row => row.hasAlt).length,
    checkerMissingAltCount: checkerVisible.filter(row => !row.hasAlt).length,
    roleMapMissingAltCount: roleMapMissing.length,
    duplicateOwnership: duplicates,
    figureRows,
    checkerRows,
    priorAltAttempts: priorAltAttempts(input.appliedTools ?? []),
  });

  if (input.parked) return base('protected_or_analyzer_volatility', 'parked protected/analyzer-volatility control');
  if ((input.falsePositiveApplied ?? 0) > 0) return base('no_safe_alignment_rule', 'false-positive-applied evidence present');

  const heading = categories.heading_structure ?? 0;
  const reading = categories.reading_order ?? 0;
  const table = categories.table_markup ?? 100;
  const alt = categories.alt_text ?? 100;
  if (heading < CORE_MIN || reading < CORE_MIN || table < CORE_MIN) {
    return base('mixed_table_or_heading_blocker', `core blockers remain (${heading}/${reading}/${table})`);
  }
  if (alt >= 90 || input.analysis.score >= 90) {
    return base('no_safe_alignment_rule', `row already high enough (${alt}/${input.analysis.score})`);
  }

  if (checkerVisible.some(row => !row.hasAlt)) {
    return base(
      'raw_figure_alt_missing_true_debt',
      `${checkerVisible.filter(row => !row.hasAlt).length} reachable raw /Figure target(s) still lack /Alt`,
    );
  }

  if (duplicates.length > 0 && duplicates.length >= nonFigureRoleCount && nonFigureRoleCount > 0) {
    return base(
      'duplicate_nonfigure_role_debt_covered_by_alt_figure',
      `all ${nonFigureRoleCount} non-Figure role debt item(s) overlap reachable alt-owned raw /Figure MCIDs`,
      true,
    );
  }

  if (nonFigureRoleCount > 0) {
    return base(
      'alt_scorer_cap_true_nonfigure_debt',
      `${nonFigureRoleCount} non-Figure role debt item(s), ${duplicates.length} covered by alt-owned raw /Figure MCIDs`,
    );
  }

  if (roleMapMissing.length > 0) {
    return base(
      'hidden_rolemap_alt_cap_limited',
      `${roleMapMissing.length} reachable role-map figure-like target(s) still lack /Alt`,
    );
  }

  return base('no_safe_alignment_rule', 'no scorer-cap or ownership alignment pattern found');
}

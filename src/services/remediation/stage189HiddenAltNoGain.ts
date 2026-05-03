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
import { collectStage186TargetRefs } from './stage186Hard2TableAlt.js';

export type Stage189HiddenAltNoGainClass =
  | 'alt_written_but_analyzer_not_counting'
  | 'alt_mutation_target_not_checker_scored'
  | 'wrong_ref_due_route_rewrite'
  | 'hidden_alt_target_beyond_existing_cap'
  | 'post_pass_reanalysis_loses_alt_evidence'
  | 'mixed_table_or_heading_blocker'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_alt_path';

export interface Stage189AltToolEvidence {
  toolName: string;
  outcome: string;
  targetRefs: string[];
  note: string | null;
  beforeScore: number | null;
  afterScore: number | null;
  beforeAlt: number | null;
  afterAlt: number | null;
  checkerVisibleBefore: number | null;
  checkerVisibleAfter: number | null;
  checkerVisibleWithAltBefore: number | null;
  checkerVisibleWithAltAfter: number | null;
  targetHasAltAfter: boolean | null;
  targetIsFigureAfter: boolean | null;
  targetReachable: boolean | null;
  figureAltAttachedToReachableFigure: boolean;
}

export interface Stage189HiddenAltNoGainDecision {
  classification: Stage189HiddenAltNoGainClass;
  safeAnalyzerAlignmentCandidate: boolean;
  shouldCorrectTargetSelection: boolean;
  reason: string;
  currentAltTargets: Stage181HiddenAltTarget[];
  attemptedAltRefs: string[];
  checkerVisibleFigureCount: number;
  checkerVisibleFigureAltCount: number;
  informativeFigureCount: number;
  informativeFigureAltCount: number;
  roleMapFigureTargetCount: number;
  nonFigureRoleCount: number;
  bestReplayAltAfter: number | null;
  maxReplayCheckerVisibleWithAlt: number | null;
  maxReplayCheckerVisibleCount: number | null;
  altToolEvidence: Stage189AltToolEvidence[];
}

const CORE_STABLE_MIN = 80;
const ALT_TOOL_NAMES = new Set([
  'set_figure_alt_text',
  'retag_as_figure',
  'canonicalize_figure_alt_ownership',
  'repair_alt_text_structure',
  'normalize_nested_figure_containers',
]);

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return row?.applicable === false ? null : row?.score ?? null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function noteFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  const note = parsed?.note ?? parsed?.raw;
  return typeof note === 'string' ? note : null;
}

function replayCategory(details: unknown, suffix: 'Before' | 'After', key: CategoryKey): number | null {
  const scores = nested(nested(nested(parseDetails(details), 'debug'), 'replayState'), `categoryScores${suffix}`);
  return numberOrNull(scores?.[key]);
}

function replaySignal(details: unknown, suffix: 'Before' | 'After', key: string): number | null {
  const signals = nested(nested(nested(parseDetails(details), 'debug'), 'replayState'), `detectionSignals${suffix}`);
  return numberOrNull(signals?.[key]);
}

function toolEvidence(tool: AppliedRemediationTool): Stage189AltToolEvidence {
  const parsed = parseDetails(tool.details);
  const invariants = nested(parsed, 'invariants');
  const benefits = nested(parsed, 'structuralBenefits');
  return {
    toolName: tool.toolName,
    outcome: tool.outcome ?? 'unknown',
    targetRefs: [...collectStage186TargetRefs(tool.details)].sort(),
    note: noteFromDetails(tool.details),
    beforeScore: numberOrNull(tool.scoreBefore),
    afterScore: numberOrNull(tool.scoreAfter),
    beforeAlt: replayCategory(tool.details, 'Before', 'alt_text'),
    afterAlt: replayCategory(tool.details, 'After', 'alt_text'),
    checkerVisibleBefore: replaySignal(tool.details, 'Before', 'checkerVisibleFigureCount'),
    checkerVisibleAfter: replaySignal(tool.details, 'After', 'checkerVisibleFigureCount'),
    checkerVisibleWithAltBefore: replaySignal(tool.details, 'Before', 'checkerVisibleFigureAltCount'),
    checkerVisibleWithAltAfter: replaySignal(tool.details, 'After', 'checkerVisibleFigureAltCount'),
    targetHasAltAfter: boolOrNull(invariants?.targetHasAltAfter),
    targetIsFigureAfter: boolOrNull(invariants?.targetIsFigureAfter),
    targetReachable: boolOrNull(invariants?.targetReachable),
    figureAltAttachedToReachableFigure: benefits?.figureAltAttachedToReachableFigure === true,
  };
}

function attemptedAltRefs(appliedTools: readonly AppliedRemediationTool[]): string[] {
  const refs = new Set<string>();
  for (const tool of appliedTools) {
    if (!ALT_TOOL_NAMES.has(tool.toolName)) continue;
    for (const ref of collectStage186TargetRefs(tool.details)) refs.add(ref);
  }
  return [...refs].sort();
}

function checkerVisibleAltCount(snapshot: DocumentSnapshot): { total: number; withAlt: number } {
  const targets = snapshot.checkerFigureTargets ?? [];
  return {
    total: targets.filter(target => target.reachable && !target.isArtifact).length,
    withAlt: targets.filter(target => target.reachable && !target.isArtifact && target.hasAlt && Boolean(target.altText?.trim())).length,
  };
}

function informativeAltCount(snapshot: DocumentSnapshot): { total: number; withAlt: number } {
  const figures = snapshot.figures.filter(figure => !figure.isArtifact);
  return {
    total: figures.length,
    withAlt: figures.filter(figure => figure.hasAlt && Boolean(figure.altText?.trim())).length,
  };
}

function roleMapFigureTargetCount(snapshot: DocumentSnapshot): number {
  return snapshot.figures.filter(figure => {
    const role = (figure.role ?? '').replace(/^\//, '').toLowerCase();
    const rawRole = (figure.rawRole ?? '').replace(/^\//, '').toLowerCase();
    return figure.reachable === true &&
      !figure.isArtifact &&
      !figure.hasAlt &&
      role === 'figure' &&
      rawRole !== 'figure' &&
      Boolean(figure.structRef);
  }).length;
}

function hasFullCheckerAltNoCategoryGain(evidence: Stage189AltToolEvidence[]): Stage189AltToolEvidence | null {
  return evidence.find(tool =>
    (tool.outcome === 'applied' || tool.outcome === 'rejected' || tool.outcome === 'no_effect') &&
    (tool.checkerVisibleAfter ?? -1) > 0 &&
    tool.checkerVisibleWithAltAfter === tool.checkerVisibleAfter &&
    tool.beforeAlt !== null &&
    tool.afterAlt !== null &&
    tool.afterAlt <= tool.beforeAlt
  ) ?? null;
}

function hasPartialCheckerAltNoCategoryGain(evidence: Stage189AltToolEvidence[]): Stage189AltToolEvidence | null {
  return evidence.find(tool =>
    (tool.outcome === 'applied' || tool.outcome === 'rejected' || tool.outcome === 'no_effect') &&
    (tool.checkerVisibleAfter ?? -1) > 0 &&
    (tool.checkerVisibleWithAltBefore ?? -1) >= 0 &&
    (tool.checkerVisibleWithAltAfter ?? -1) > (tool.checkerVisibleWithAltBefore ?? -1) &&
    (tool.checkerVisibleWithAltAfter ?? -1) < (tool.checkerVisibleAfter ?? -1) &&
    tool.beforeAlt !== null &&
    tool.afterAlt !== null &&
    tool.afterAlt <= tool.beforeAlt
  ) ?? null;
}

function hasCheckerTargetNoProgress(evidence: Stage189AltToolEvidence[]): boolean {
  return evidence.some(tool =>
    (tool.outcome === 'applied' || tool.outcome === 'no_effect') &&
    tool.figureAltAttachedToReachableFigure &&
    tool.targetHasAltAfter === true &&
    tool.targetIsFigureAfter === true &&
    tool.checkerVisibleWithAltBefore !== null &&
    tool.checkerVisibleWithAltAfter !== null &&
    tool.checkerVisibleWithAltAfter <= tool.checkerVisibleWithAltBefore
  );
}

function bestReplayAltAfter(evidence: Stage189AltToolEvidence[]): number | null {
  const values = evidence.map(tool => tool.afterAlt).filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function maxReplaySignal(evidence: Stage189AltToolEvidence[], key: keyof Pick<Stage189AltToolEvidence, 'checkerVisibleAfter' | 'checkerVisibleWithAltAfter'>): number | null {
  const values = evidence.map(tool => tool[key]).filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

export function classifyStage189HiddenAltNoGain(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  parked?: boolean;
  falsePositiveApplied?: number;
}): Stage189HiddenAltNoGainDecision {
  const appliedTools = input.appliedTools ?? [];
  const currentAltTargets = stage181HiddenAltTargets(input.snapshot, appliedTools);
  const attemptedRefs = attemptedAltRefs(appliedTools);
  const checker = checkerVisibleAltCount(input.snapshot);
  const informative = informativeAltCount(input.snapshot);
  const roleMapTargets = roleMapFigureTargetCount(input.snapshot);
  const nonFigureRoleCount = input.snapshot.detectionProfile?.figureSignals?.nonFigureRoleCount ?? 0;
  const altEvidence = appliedTools
    .filter(tool => ALT_TOOL_NAMES.has(tool.toolName))
    .map(toolEvidence);
  const bestAltAfter = bestReplayAltAfter(altEvidence);
  const maxCheckerWithAlt = maxReplaySignal(altEvidence, 'checkerVisibleWithAltAfter');
  const maxCheckerCount = maxReplaySignal(altEvidence, 'checkerVisibleAfter');

  const decision = (
    classification: Stage189HiddenAltNoGainClass,
    reason: string,
    safeAnalyzerAlignmentCandidate = false,
    shouldCorrectTargetSelection = false,
  ): Stage189HiddenAltNoGainDecision => ({
    classification,
    safeAnalyzerAlignmentCandidate,
    shouldCorrectTargetSelection,
    reason,
    currentAltTargets,
    attemptedAltRefs: attemptedRefs,
    checkerVisibleFigureCount: checker.total,
    checkerVisibleFigureAltCount: checker.withAlt,
    informativeFigureCount: informative.total,
    informativeFigureAltCount: informative.withAlt,
    roleMapFigureTargetCount: roleMapTargets,
    nonFigureRoleCount,
    bestReplayAltAfter: bestAltAfter,
    maxReplayCheckerVisibleWithAlt: maxCheckerWithAlt,
    maxReplayCheckerVisibleCount: maxCheckerCount,
    altToolEvidence: altEvidence,
  });

  if (input.parked) {
    return decision('protected_or_analyzer_volatility', 'parked protected/analyzer-volatility control');
  }
  if ((input.falsePositiveApplied ?? 0) > 0) {
    return decision('no_safe_alt_path', 'false-positive-applied evidence present');
  }
  if (input.analysis.pdfClass === 'scanned' || input.snapshot.pdfClass === 'scanned') {
    return decision('no_safe_alt_path', 'OCR/scanned row is not a Stage 189 hidden-alt target');
  }

  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const table = categoryScore(input.analysis, 'table_markup') ?? 100;
  const alt = categoryScore(input.analysis, 'alt_text') ?? 100;
  if (alt >= CORE_STABLE_MIN || input.analysis.score >= 90) {
    return decision(
      'no_safe_alt_path',
      `row already has stable alt/grade (${alt}/${input.analysis.score})`,
    );
  }
  if (heading < CORE_STABLE_MIN || reading < CORE_STABLE_MIN || table < CORE_STABLE_MIN) {
    return decision(
      'mixed_table_or_heading_blocker',
      `heading/reading/table blockers remain (${heading}/${reading}/${table})`,
    );
  }

  if (bestAltAfter !== null && bestAltAfter > alt && checker.withAlt < checker.total) {
    return decision(
      'post_pass_reanalysis_loses_alt_evidence',
      `tool replay reached alt_text ${bestAltAfter}, but final analysis is ${alt}`,
    );
  }

  const fullCheckerNoGain = hasFullCheckerAltNoCategoryGain(altEvidence);
  if (fullCheckerNoGain) {
    if (nonFigureRoleCount > 0 || roleMapTargets > 0) {
      return decision(
        'hidden_alt_target_beyond_existing_cap',
        `checker-visible figures can be fully covered, but ${nonFigureRoleCount} non-Figure role(s) / ${roleMapTargets} role-map target(s) still suppress alt scoring`,
      );
    }
    return decision(
      'alt_written_but_analyzer_not_counting',
      'checker-visible alt coverage reaches 100%, but alt_text does not improve',
      true,
      false,
    );
  }

  const partialCheckerNoGain = hasPartialCheckerAltNoCategoryGain(altEvidence);
  if (partialCheckerNoGain && currentAltTargets.length > 0) {
    return decision(
      'hidden_alt_target_beyond_existing_cap',
      `bounded hidden-alt batch improved checker coverage to ${partialCheckerNoGain.checkerVisibleWithAltAfter}/${partialCheckerNoGain.checkerVisibleAfter}, but not enough to move alt_text`,
    );
  }

  const currentRefs = new Set(currentAltTargets.map(target => target.structRef));
  const attemptedCurrentRefs = attemptedRefs.filter(ref => currentRefs.has(ref));
  if (currentAltTargets.length > 0 && attemptedRefs.length > 0 && attemptedCurrentRefs.length === 0) {
    if (checker.total > 0 && checker.withAlt >= checker.total) {
      return decision(
        'no_safe_alt_path',
        'direct checker-visible alt coverage is already full; remaining hidden target is not a safe target-selection fix',
      );
    }
    return decision(
      'wrong_ref_due_route_rewrite',
      'current checker-visible missing-alt refs differ from all prior attempted alt refs',
      false,
      true,
    );
  }

  if (hasCheckerTargetNoProgress(altEvidence)) {
    return decision(
      'alt_mutation_target_not_checker_scored',
      'alt mutation reports reachable Figure ownership, but checker-visible alt coverage does not improve',
    );
  }

  if (currentAltTargets.length > 0 && (checker.total === 0 || checker.withAlt < checker.total)) {
    return decision(
      'no_safe_alt_path',
      'content-backed hidden-alt targets remain, but no no-gain analyzer pattern is proven yet',
    );
  }

  if (alt < CORE_STABLE_MIN && checker.total > 0 && checker.withAlt >= checker.total) {
    return decision(
      'alt_written_but_analyzer_not_counting',
      'final snapshot shows full checker-visible alt coverage while alt_text remains low',
      nonFigureRoleCount === 0 && roleMapTargets === 0,
      false,
    );
  }

  return decision('no_safe_alt_path', 'no content-backed hidden-alt no-gain evidence available');
}

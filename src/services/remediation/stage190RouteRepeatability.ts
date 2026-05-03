import type { AppliedRemediationTool, CategoryKey } from '../../types.js';
import { acceptedToolHarmDecisionFromScores } from './acceptedToolHarm.js';
import { collectStage186TargetRefs } from './stage186Hard2TableAlt.js';

export type Stage190RouteRepeatabilityClass =
  | 'stable_good_route_available'
  | 'checkpoint_restore_candidate'
  | 'accepted_cleanup_harm'
  | 'same_buffer_analyzer_variance'
  | 'no_safe_state'
  | 'stable_control';

export interface Stage190ToolEvent {
  toolName: string;
  outcome: string;
  source: string | null;
  stage: number | null;
  round: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  targetRefs: string[];
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  categoryScoresBefore: Partial<Record<CategoryKey, number>>;
  categoryScoresAfter: Partial<Record<CategoryKey, number>>;
}

export interface Stage190RunEvidence {
  label: string;
  score: number | null;
  grade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  categories: Partial<Record<CategoryKey, number>>;
  reanalyzedCategories: Partial<Record<CategoryKey, number>>;
  falsePositiveApplied: number;
  finalPdfReanalyzed: boolean;
  checkpointSafeScore?: number | null;
  tools: Stage190ToolEvent[];
}

export interface Stage190RouteRepeatabilityDecision {
  classification: Stage190RouteRepeatabilityClass;
  behaviorCandidate: boolean;
  reason: string;
  bestRun: string | null;
  bestScore: number | null;
  worstRun: string | null;
  worstScore: number | null;
  externallyGoodRuns: string[];
  inRunGoodButExternalBadRuns: string[];
  firstDivergence: {
    goodRun: string;
    badRun: string;
    index: number;
    good: string | null;
    bad: string | null;
  } | null;
  repeatedHarmSignature: string | null;
}

const EXTERNAL_GOOD_SCORE = 80;

function scoreFor(run: Stage190RunEvidence): number | null {
  return run.reanalyzedScore ?? run.score;
}

function runGradeGood(run: Stage190RunEvidence): boolean {
  const score = scoreFor(run);
  return score !== null && score >= EXTERNAL_GOOD_SCORE;
}

function inRunGoodExternalBad(run: Stage190RunEvidence): boolean {
  return (run.score ?? 0) >= EXTERNAL_GOOD_SCORE &&
    run.reanalyzedScore !== null &&
    run.reanalyzedScore < EXTERNAL_GOOD_SCORE;
}

function toolKey(tool: Stage190ToolEvent): string {
  return [
    tool.toolName,
    tool.outcome,
    tool.source ?? '',
    tool.targetRefs.join(','),
    tool.stateSignatureBefore ?? '',
  ].join('|');
}

function toolLabel(tool: Stage190ToolEvent | null | undefined): string | null {
  return tool ? `${tool.toolName}:${tool.outcome}:${tool.targetRefs.join(',') || 'no-ref'}` : null;
}

function firstDivergence(good: Stage190RunEvidence, bad: Stage190RunEvidence): Stage190RouteRepeatabilityDecision['firstDivergence'] {
  const max = Math.max(good.tools.length, bad.tools.length);
  for (let index = 0; index < max; index += 1) {
    const goodTool = good.tools[index];
    const badTool = bad.tools[index];
    if (toolKey(goodTool as Stage190ToolEvent) !== toolKey(badTool as Stage190ToolEvent)) {
      return {
        goodRun: good.label,
        badRun: bad.label,
        index,
        good: toolLabel(goodTool),
        bad: toolLabel(badTool),
      };
    }
  }
  return null;
}

function harmfulCleanupSignature(tool: Stage190ToolEvent): string | null {
  if (tool.outcome !== 'applied') return null;
  const decision = acceptedToolHarmDecisionFromScores({
    toolName: tool.toolName,
    before: tool.categoryScoresBefore,
    after: tool.categoryScoresAfter,
  });
  if (!decision.reject) return null;
  return `${tool.toolName}|${tool.targetRefs.join(',') || 'no-ref'}|${tool.stateSignatureBefore ?? 'no-state'}|${decision.droppedCategory}:${decision.droppedDelta}`;
}

function repeatedBadOnlyHarm(runs: Stage190RunEvidence[]): string | null {
  const goodRuns = runs.filter(runGradeGood);
  const badRuns = runs.filter(run => !runGradeGood(run));
  const goodSignatures = new Set<string>();
  for (const run of goodRuns) {
    for (const tool of run.tools) {
      const signature = harmfulCleanupSignature(tool);
      if (signature) goodSignatures.add(signature);
    }
  }
  const badCounts = new Map<string, number>();
  for (const run of badRuns) {
    const rowSignatures = new Set<string>();
    for (const tool of run.tools) {
      const signature = harmfulCleanupSignature(tool);
      if (signature && !goodSignatures.has(signature)) rowSignatures.add(signature);
    }
    for (const signature of rowSignatures) badCounts.set(signature, (badCounts.get(signature) ?? 0) + 1);
  }
  return [...badCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export function stage190ToolEventFromAppliedTool(tool: AppliedRemediationTool): Stage190ToolEvent {
  const details = parseDetails(tool.details);
  const replay = nested(nested(details, 'debug'), 'replayState');
  return {
    toolName: tool.toolName,
    outcome: tool.outcome ?? 'unknown',
    source: typeof tool.source === 'string' ? tool.source : null,
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
    scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
    targetRefs: [...collectStage186TargetRefs(tool.details)].sort(),
    stateSignatureBefore: stringOrNull(replay?.stateSignatureBefore),
    stateSignatureAfter: stringOrNull(replay?.stateSignatureAfter),
    categoryScoresBefore: numberRecord(replay?.categoryScoresBefore),
    categoryScoresAfter: numberRecord(replay?.categoryScoresAfter),
  };
}

export function classifyStage190RouteRepeatability(input: {
  runs: Stage190RunEvidence[];
  role: 'primary' | 'control' | 'prior_win';
}): Stage190RouteRepeatabilityDecision {
  const scores = input.runs
    .map(scoreFor)
    .filter((score): score is number => score !== null);
  const sorted = [...input.runs]
    .filter(run => scoreFor(run) !== null)
    .sort((a, b) => (scoreFor(b) ?? -Infinity) - (scoreFor(a) ?? -Infinity));
  const best = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;
  const externallyGoodRuns = input.runs.filter(runGradeGood).map(run => run.label);
  const inRunGoodButExternalBadRuns = input.runs.filter(inRunGoodExternalBad).map(run => run.label);
  const goodRun = input.runs.find(runGradeGood) ?? null;
  const badRun = input.runs.find(run => !runGradeGood(run)) ?? null;
  const repeatedHarmSignature = repeatedBadOnlyHarm(input.runs);

  const decision = (
    classification: Stage190RouteRepeatabilityClass,
    reason: string,
    behaviorCandidate = false,
  ): Stage190RouteRepeatabilityDecision => ({
    classification,
    behaviorCandidate,
    reason,
    bestRun: best?.label ?? null,
    bestScore: best ? scoreFor(best) : null,
    worstRun: worst?.label ?? null,
    worstScore: worst ? scoreFor(worst) : null,
    externallyGoodRuns,
    inRunGoodButExternalBadRuns,
    firstDivergence: goodRun && badRun ? firstDivergence(goodRun, badRun) : null,
    repeatedHarmSignature,
  });

  if (input.role === 'prior_win') {
    const allGood = scores.length > 0 && scores.every(score => score >= EXTERNAL_GOOD_SCORE);
    return decision(
      allGood ? 'stable_control' : 'no_safe_state',
      allGood ? 'prior-win control stayed A/B across repeats' : 'prior-win control did not stay A/B',
      false,
    );
  }

  if (input.runs.some(run => (run.falsePositiveApplied ?? 0) > 0)) {
    return decision('no_safe_state', 'false-positive-applied evidence present');
  }

  const safeCheckpoint = input.runs
    .filter(run => typeof run.checkpointSafeScore === 'number' && run.checkpointSafeScore >= EXTERNAL_GOOD_SCORE)
    .sort((a, b) => (b.checkpointSafeScore ?? 0) - (a.checkpointSafeScore ?? 0))[0];
  if (safeCheckpoint && (scoreFor(safeCheckpoint) ?? 0) < (safeCheckpoint.checkpointSafeScore ?? 0)) {
    return decision(
      'checkpoint_restore_candidate',
      `externally safe checkpoint available in ${safeCheckpoint.label}`,
      true,
    );
  }

  if (inRunGoodButExternalBadRuns.length > 0 && externallyGoodRuns.length === 0) {
    return decision(
      'same_buffer_analyzer_variance',
      `in-run A/B route not preserved by final reanalysis: ${inRunGoodButExternalBadRuns.join(', ')}`,
    );
  }

  if (repeatedHarmSignature) {
    return decision(
      'accepted_cleanup_harm',
      `same harmful cleanup signature appears only in bad repeats: ${repeatedHarmSignature}`,
      true,
    );
  }

  if (externallyGoodRuns.length >= 2 && scores.every(score => score >= EXTERNAL_GOOD_SCORE)) {
    return decision(
      'stable_good_route_available',
      `externally reanalyzed A/B route repeated in ${externallyGoodRuns.length} run(s)`,
    );
  }

  if (externallyGoodRuns.length > 0) {
    return decision(
      'no_safe_state',
      `A/B route exists but is not stable enough for a route rule: ${externallyGoodRuns.join(', ')}`,
    );
  }

  return decision('no_safe_state', 'no externally safe A/B route or checkpoint evidence');
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

function numberRecord(value: unknown): Partial<Record<CategoryKey, number>> {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const [key, score] of Object.entries(record)) {
    if (typeof score === 'number' && Number.isFinite(score)) {
      out[key as CategoryKey] = score;
    }
  }
  return out;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

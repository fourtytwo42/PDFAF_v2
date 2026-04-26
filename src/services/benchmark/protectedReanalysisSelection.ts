import { createHash } from 'node:crypto';
import type { AnalysisResult } from '../../types.js';
import type { IcjiaParityResult } from '../compliance/icjiaParity.js';

export interface ProtectedReanalysisBaseline {
  score: number;
  scoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
  categories?: Record<string, number>;
}

export interface ProtectedReanalysisCandidate {
  index: number;
  bufferSha256: string;
  result: AnalysisResult;
  parity?: IcjiaParityResult | null;
  wallMs?: number | null;
}

export interface ProtectedReanalysisSelectionSummary {
  enabled: boolean;
  repeatCount: number;
  selectedIndex: number;
  selectedReason: 'not_enabled' | 'single_analysis' | 'first_floor_safe' | 'best_floor_safe' | 'best_score';
  bufferSha256: string | null;
  repeatScores: number[];
  repeatGrades: string[];
  floorScore: number | null;
  floorSafeIndexes: number[];
  sameBuffer: boolean;
}

export interface ProtectedReanalysisSelection {
  candidate: ProtectedReanalysisCandidate;
  summary: ProtectedReanalysisSelectionSummary;
}

const PROTECTED_BASELINE_FLOOR_TOLERANCE = 2;
const PROTECTED_RUN_ALT_CATEGORY_FLOOR = 80;

export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function protectedReanalysisRepeatCount(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['PDFAF_PROTECTED_REANALYSIS_REPEATS']?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 5;
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(5, parsed));
}

export function protectedReanalysisCacheKey(input: {
  bufferSha256: string;
  filename: string;
  protectedBaselineEnabled: boolean;
  repeatCount: number;
}): string {
  return [
    input.protectedBaselineEnabled ? 'protected' : 'unprotected',
    input.repeatCount,
    input.filename,
    input.bufferSha256,
  ].join(':');
}

export function cachedProtectedReanalysis<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = run();
  cache.set(key, promise);
  return promise;
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

function capIdentity(cap: NonNullable<AnalysisResult['scoreCapsApplied']>[number]): string {
  return `${cap.category}:${cap.cap}:${cap.reason}`;
}

function hasNewStricterCap(input: {
  baselineCaps?: AnalysisResult['scoreCapsApplied'];
  candidateCaps?: AnalysisResult['scoreCapsApplied'];
}): boolean {
  const baseline = new Set((input.baselineCaps ?? []).map(capIdentity));
  return (input.candidateCaps ?? []).some(cap => !baseline.has(capIdentity(cap)));
}

export function protectedReanalysisUnsafeReason(input: {
  baseline?: ProtectedReanalysisBaseline;
  analysis: AnalysisResult;
}): string | null {
  const baseline = input.baseline;
  if (!baseline || !Number.isFinite(baseline.score)) return 'protected_baseline_missing';
  const floor = baseline.score - PROTECTED_BASELINE_FLOOR_TOLERANCE;
  if (
    input.analysis.score < floor &&
    !hasNewStricterCap({
      baselineCaps: baseline.scoreCapsApplied,
      candidateCaps: input.analysis.scoreCapsApplied,
    })
  ) {
    return `protected_baseline_floor(${input.analysis.score}<${floor})`;
  }
  for (const [key, baselineScore] of Object.entries(baseline.categories ?? {})) {
    if (baselineScore == null) continue;
    const requiredBaseline = key === 'alt_text' ? PROTECTED_RUN_ALT_CATEGORY_FLOOR : 90;
    if (baselineScore < requiredBaseline) continue;
    const afterScore = categoryScore(input.analysis, key);
    if (afterScore == null) continue;
    if (afterScore < baselineScore - PROTECTED_BASELINE_FLOOR_TOLERANCE) {
      return `protected_run_category_regressed(${key}:${baselineScore}->${afterScore})`;
    }
  }
  return null;
}

export function selectProtectedReanalysis(input: {
  baseline?: ProtectedReanalysisBaseline;
  candidates: ProtectedReanalysisCandidate[];
  enabled: boolean;
  repeatCount: number;
}): ProtectedReanalysisSelection {
  if (input.candidates.length === 0) {
    throw new Error('selectProtectedReanalysis requires at least one candidate');
  }
  const first = input.candidates[0]!;
  const sameBuffer = input.candidates.every(candidate => candidate.bufferSha256 === first.bufferSha256);
  const repeatScores = input.candidates.map(candidate => candidate.result.score);
  const repeatGrades = input.candidates.map(candidate => candidate.result.grade);
  const floorScore = input.baseline?.score != null
    ? input.baseline.score - PROTECTED_BASELINE_FLOOR_TOLERANCE
    : null;

  const summaryBase = {
    enabled: input.enabled,
    repeatCount: input.repeatCount,
    bufferSha256: first.bufferSha256,
    repeatScores,
    repeatGrades,
    floorScore,
    floorSafeIndexes: [] as number[],
    sameBuffer,
  };

  if (!input.enabled || !input.baseline) {
    return {
      candidate: first,
      summary: {
        ...summaryBase,
        selectedIndex: first.index,
        selectedReason: input.enabled ? 'single_analysis' : 'not_enabled',
      },
    };
  }
  if (!sameBuffer) {
    return {
      candidate: first,
      summary: {
        ...summaryBase,
        selectedIndex: first.index,
        selectedReason: 'single_analysis',
      },
    };
  }

  const floorSafe = input.candidates.filter(candidate =>
    protectedReanalysisUnsafeReason({ baseline: input.baseline, analysis: candidate.result }) === null
  );
  const floorSafeIndexes = floorSafe.map(candidate => candidate.index);
  const selected = (floorSafe.length > 0 ? floorSafe : input.candidates)
    .slice()
    .sort((a, b) => b.result.score - a.result.score || a.index - b.index)[0]!;

  return {
    candidate: selected,
    summary: {
      ...summaryBase,
      floorSafeIndexes,
      selectedIndex: selected.index,
      selectedReason: floorSafe.length > 0
        ? selected.index === first.index ? 'first_floor_safe' : 'best_floor_safe'
        : 'best_score',
    },
  };
}

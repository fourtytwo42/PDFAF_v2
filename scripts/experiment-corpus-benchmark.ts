#!/usr/bin/env tsx
import 'dotenv/config';

import Database from 'better-sqlite3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  REMEDIATION_ANALYSIS_TIMEOUT_MS,
  REMEDIATION_PDF_TIMEOUT_MS,
  READABILITY_AUTO_REPAIR_MAX_ATTEMPTS,
  READABILITY_AUTO_REPAIR_TARGET_SCORE,
  READABILITY_AUTO_REPAIR_TIMEOUT_MS,
  READABILITY_REVIEW_TIMEOUT_MS,
  REQUEST_TIMEOUT_REMEDIATE_MS,
  REMEDIATION_SOFT_DEADLINE_BUFFER_MS,
  REMEDIATION_TARGET_SCORE,
  SEMANTIC_REMEDIATE_FIGURE_PASSES,
  SEMANTIC_REMEDIATE_PROMOTE_PASSES,
  getOpenAiCompatBaseUrl,
} from '../src/config.js';
import { initSchema } from '../src/db/schema.js';
import { startEmbeddedLlmIfEnabled, stopEmbeddedLlm } from '../src/llm/embedLocalLlama.js';
import { mergeSequentialSemanticSummaries } from '../src/routes/remediate.js';
import {
  applyPostRemediationAltRepair,
  remediatePdf,
  type ProtectedDebugStateCapture,
  type RemediationRuntimeTraceEvent,
} from '../src/services/remediation/orchestrator.js';
import { buildReadabilityRepairPlan } from '../src/services/semantic/readabilityRepairPlan.js';
import { buildRemediationOutcomeSummary } from '../src/services/remediation/outcomeSummary.js';
import { applySemanticHeadingRepairs } from '../src/services/semantic/headingSemantic.js';
import { buildSemanticGateSummary, buildSemanticSummary, enforceSemanticTrust } from '../src/services/semantic/semanticPolicy.js';
import { applySemanticPromoteHeadingRepairs } from '../src/services/semantic/promoteHeadingSemantic.js';
import { applySemanticRepairs } from '../src/services/semantic/semanticService.js';
import { applySemanticUntaggedHeadingRepairs } from '../src/services/semantic/untaggedHeadingSemantic.js';
import { compareVisualStabilityRun, writeVisualStabilityRunReport } from '../src/services/benchmark/visualStability.js';
import { buildIcjiaParity } from '../src/services/compliance/icjiaParity.js';
import {
  buildBenchmarkSummary,
  defaultExperimentCorpusPaths,
  loadExperimentCorpusManifest,
  makeManifestSnapshot,
  renderBenchmarkSummaryMarkdown,
  type AnalyzeBenchmarkRow,
  type BenchmarkArtifactBundle,
  type ExperimentCorpusEntry,
  type RemediateBenchmarkRow,
  validateBenchmarkArtifacts,
} from '../src/services/benchmark/experimentCorpus.js';
import {
  cachedProtectedReanalysis,
  protectedReanalysisCacheKey,
  protectedReanalysisRepeatCount,
  protectedReanalysisUnsafeReason,
  selectProtectedReanalysis,
  sha256Buffer,
  type ProtectedReanalysisCandidate,
  type ProtectedReanalysisSelectionSummary,
} from '../src/services/benchmark/protectedReanalysisSelection.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { reviewRemediatedReadability, shouldRunReadabilityAutoRepair } from '../src/services/semantic/readabilityReview.js';
import type {
  AnalysisResult,
  DocumentSnapshot,
  RemediationRuntimeSummary,
  RuntimeCountRow,
  ReadabilityAutoRepairSummary,
  ReadabilityReviewSummary,
  ReadabilityRepairPlanSummary,
  ReadabilityRepairSemanticLane,
  ReadabilityReviewArea,
  PlanningSkipReason,
  PlanningSummary,
  SemanticRemediationSummary,
} from '../src/types.js';

type BenchmarkMode = 'analyze' | 'remediate' | 'full';

interface ParsedArgs {
  mode: BenchmarkMode;
  outDir?: string;
  manifestPath?: string;
  cohorts: string[];
  sourceTypes: string[];
  fileIds: string[];
  semanticEnabled: boolean;
  readabilityReviewEnabled: boolean;
  readabilityAutoRepairEnabled: boolean;
  readabilityReviewTimeoutMs: number;
  readabilityAutoRepairMaxAttempts: number;
  readabilityAutoRepairTimeoutMs: number;
  writePdfs: boolean;
  writeProtectedDebugStates: boolean;
  validateManifestOnly: boolean;
  validateRunDir?: string;
  validateVisual: boolean;
  protectedBaselineRunDir?: string;
}

interface ProtectedBaselineRow {
  score: number;
  scoreCapsApplied: AnalysisResult['scoreCapsApplied'];
  categories: Record<string, number>;
}

interface ProtectedDebugStateArtifact {
  sequence: number;
  reason: string;
  path: string;
  metadataPath: string;
  bufferSha256: string;
  score: number;
  grade: string;
  floorScore: number | null;
  floorReached: boolean;
  protectedRunSafe: boolean;
  appliedToolCount: number;
}

interface ReanalysisAttempt extends ProtectedReanalysisCandidate {
  snapshot: DocumentSnapshot;
  parity: ReturnType<typeof buildIcjiaParity>;
}

interface SelectedReanalysis {
  result: AnalysisResult;
  snapshot: DocumentSnapshot;
  parity: ReturnType<typeof buildIcjiaParity>;
  wallMs: number;
  selection?: ProtectedReanalysisSelectionSummary;
}

interface BenchmarkRuntimeTimeoutTrace {
  rowId: string;
  file: string;
  generatedAt: string;
  error: string;
  elapsedMs: number;
  lastPhase: string;
  lastStageNumber: number | null;
  lastRound: number | null;
  lastToolName: string | null;
  lastToolOutcome: string | null;
  lastToolDurationMs: number | null;
  lastStateSignatureBefore: string | null;
  lastRejectedOrNoEffectReason: string | null;
  completedToolCount: number;
  completedStageCount: number;
  completedStageReanalysisCount: number;
  completedStageReanalysisMs: number;
  lastVerifiedCheckpointScore: number | null;
  lastVerifiedCheckpointGrade: string | null;
  lastVerifiedCheckpointReason: string | null;
  lastVerifiedCheckpointAppliedToolCount: number | null;
  lastVerifiedCheckpointEligible: boolean | null;
  lastVerifiedCheckpointEligibilityReason: string | null;
  lastVerifiedCheckpointReturned: boolean;
  lastVerifiedCheckpointAgeMs: number | null;
  verifiedCheckpointHistory: Array<{
    reason: string;
    score: number;
    grade: string | null;
    appliedToolCount: number;
    eligible: boolean;
    eligibilityReason: string;
    returned: boolean;
    elapsedMs: number;
  }>;
}

function parseTraceReason(details: string | undefined): string | null {
  if (!details) return null;
  if (!details.startsWith('{')) return details;
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const reason = parsed['reason'] ?? parsed['note'] ?? parsed['raw'];
    return typeof reason === 'string' && reason.length > 0 ? reason : null;
  } catch {
    return details;
  }
}

function createRuntimeTimeoutTrace(entry: ExperimentCorpusEntry, started: number) {
  const state: BenchmarkRuntimeTimeoutTrace = {
    rowId: entry.id,
    file: entry.file,
    generatedAt: new Date().toISOString(),
    error: '',
    elapsedMs: 0,
    lastPhase: 'starting',
    lastStageNumber: null,
    lastRound: null,
    lastToolName: null,
    lastToolOutcome: null,
    lastToolDurationMs: null,
    lastStateSignatureBefore: null,
    lastRejectedOrNoEffectReason: null,
    completedToolCount: 0,
    completedStageCount: 0,
    completedStageReanalysisCount: 0,
    completedStageReanalysisMs: 0,
    lastVerifiedCheckpointScore: null,
    lastVerifiedCheckpointGrade: null,
    lastVerifiedCheckpointReason: null,
    lastVerifiedCheckpointAppliedToolCount: null,
    lastVerifiedCheckpointEligible: null,
    lastVerifiedCheckpointEligibilityReason: null,
    lastVerifiedCheckpointReturned: false,
    lastVerifiedCheckpointAgeMs: null,
    verifiedCheckpointHistory: [],
  };
  const mark = (phase: string): void => {
    state.lastPhase = phase;
    state.elapsedMs = Math.round(performance.now() - started);
  };
  const event = (trace: RemediationRuntimeTraceEvent): void => {
    state.elapsedMs = Math.round(trace.elapsedMs);
    if ('stageNumber' in trace) state.lastStageNumber = trace.stageNumber;
    if ('round' in trace) state.lastRound = trace.round;
    switch (trace.kind) {
      case 'stage_start':
        state.lastPhase = 'stage_start';
        break;
      case 'tool_start':
        state.lastPhase = 'tool_start';
        state.lastToolName = trace.toolName;
        state.lastToolOutcome = null;
        state.lastToolDurationMs = null;
        state.lastStateSignatureBefore = trace.stateSignatureBefore;
        break;
      case 'tool_finish':
        state.lastPhase = 'tool_finish';
        state.lastToolName = trace.toolName;
        state.lastToolOutcome = trace.outcome;
        state.lastToolDurationMs = Math.round(trace.durationMs);
        state.lastStateSignatureBefore = trace.stateSignatureBefore;
        state.completedToolCount += 1;
        if (trace.outcome === 'rejected' || trace.outcome === 'no_effect') {
          state.lastRejectedOrNoEffectReason = parseTraceReason(trace.details);
        }
        break;
      case 'stage_reanalysis_start':
        state.lastPhase = 'stage_reanalysis_start';
        break;
      case 'stage_finish':
        state.lastPhase = 'stage_finish';
        state.completedStageCount += 1;
        if (trace.reanalyzeMs > 0) {
          state.completedStageReanalysisCount += 1;
          state.completedStageReanalysisMs += Math.round(trace.reanalyzeMs);
        }
        break;
      case 'verified_checkpoint':
        state.lastPhase = trace.returned ? 'verified_checkpoint_return' : 'verified_checkpoint';
        state.lastVerifiedCheckpointScore = trace.score;
        state.lastVerifiedCheckpointGrade = trace.grade ?? null;
        state.lastVerifiedCheckpointReason = trace.reason;
        state.lastVerifiedCheckpointAppliedToolCount = trace.appliedToolCount;
        state.lastVerifiedCheckpointEligible = trace.eligible;
        state.lastVerifiedCheckpointEligibilityReason = trace.eligibilityReason;
        state.lastVerifiedCheckpointReturned = trace.returned === true;
        state.lastVerifiedCheckpointAgeMs = 0;
        state.verifiedCheckpointHistory.push({
          reason: trace.reason,
          score: trace.score,
          grade: trace.grade ?? null,
          appliedToolCount: trace.appliedToolCount,
          eligible: trace.eligible,
          eligibilityReason: trace.eligibilityReason,
          returned: trace.returned === true,
          elapsedMs: Math.round(trace.elapsedMs),
        });
        break;
    }
  };
  const snapshot = (error: unknown): BenchmarkRuntimeTimeoutTrace => ({
    ...state,
    generatedAt: new Date().toISOString(),
    error: sanitizeError(error),
    elapsedMs: Math.round(performance.now() - started),
    lastVerifiedCheckpointAgeMs: state.lastVerifiedCheckpointReason
      ? Math.max(0, Math.round(performance.now() - started) - state.elapsedMs)
      : null,
  });
  return { mark, event, snapshot };
}

async function writeRuntimeTimeoutTraceArtifact(
  runDir: string,
  trace: BenchmarkRuntimeTimeoutTrace,
): Promise<void> {
  if (!/timeout|aborted|abort/i.test(trace.error)) return;
  const dir = join(runDir, 'runtime-timeouts');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${trace.rowId}.json`), JSON.stringify(trace, null, 2), 'utf8');
}

const API_SECOND_PASS_MIN_SCORE = parseInt(process.env['PDFAF_SECOND_PASS_MIN_SCORE'] ?? '93', 10);

function shouldRunSecondDeterministicPass(input: {
  verifiedCheckpointReturned: boolean;
  score: number;
  remediationTargetScore?: number;
  secondPassMinScore?: number;
  hasBudget: boolean;
}): boolean {
  if (input.verifiedCheckpointReturned) return false;
  if (!input.hasBudget) return false;
  const targetScore = input.remediationTargetScore ?? REMEDIATION_TARGET_SCORE;
  if (input.score >= targetScore) return false;
  const secondPassMinScore = input.secondPassMinScore ?? API_SECOND_PASS_MIN_SCORE;
  return input.score < secondPassMinScore;
}

function hasVerifiedCheckpointTimeoutReturn(result: { runtimeSummary?: RemediationRuntimeSummary }): boolean {
  const reasons = result.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons;
  return reasons?.some(
    row =>
      (row.key === 'verified_checkpoint_timeout_return' ||
        row.key === 'verified_low_score_checkpoint_timeout_return' ||
        row.key === 'verified_low_score_checkpoint_slow_no_gain_figure_alt_return') &&
      row.count > 0,
  ) ?? false;
}

function runtimeCounts(values: string[]): RuntimeCountRow[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function addDeterministicEarlyExit(
  runtimeSummary: RemediationRuntimeSummary | undefined,
  reason: string,
): void {
  if (!runtimeSummary) return;
  runtimeSummary.boundedWork.deterministicEarlyExitReasons = runtimeCounts([
    ...runtimeSummary.boundedWork.deterministicEarlyExitReasons.flatMap(row => Array(row.count).fill(row.key)),
    reason,
  ]);
  runtimeSummary.boundedWork.deterministicEarlyExitCount =
    runtimeSummary.boundedWork.deterministicEarlyExitReasons.reduce((sum, row) => sum + row.count, 0);
}

function mergeRuntimeSummary(
  deterministicSummaries: Array<RemediationRuntimeSummary | undefined>,
  afterRuntime: AnalysisResult['runtimeSummary'] | undefined,
  semanticSummaries: SemanticRemediationSummary[],
): RemediationRuntimeSummary | undefined {
  const validSummaries = deterministicSummaries.filter((summary): summary is RemediationRuntimeSummary => summary != null);
  if (validSummaries.length === 0 && semanticSummaries.length === 0 && !afterRuntime) return undefined;

  const deterministicTotalMs = validSummaries.reduce((sum, current) => sum + current.deterministicTotalMs, 0);
  const stageTimings = validSummaries.flatMap(summary => summary.stageTimings);
  const toolTimings = validSummaries.flatMap(summary => summary.toolTimings);

  const semanticCandidateCapsHit = validSummaries.reduce(
    (sum, summary) => sum + summary.boundedWork.semanticCandidateCapsHit,
    0,
  );
  let zeroHeadingLaneActivations = 0;
  let headingConvergenceAttemptCount = 0;
  let headingConvergenceSuccessCount = 0;
  let headingConvergenceFailureCount = 0;
  let headingConvergenceTimeoutCount = 0;
  let structureConformanceTimeoutCount = 0;

  for (const summary of validSummaries) {
    zeroHeadingLaneActivations += summary.boundedWork.zeroHeadingLaneActivations;
    headingConvergenceAttemptCount += summary.boundedWork.headingConvergenceAttemptCount;
    headingConvergenceSuccessCount += summary.boundedWork.headingConvergenceSuccessCount;
    headingConvergenceFailureCount += summary.boundedWork.headingConvergenceFailureCount;
    headingConvergenceTimeoutCount += summary.boundedWork.headingConvergenceTimeoutCount;
    structureConformanceTimeoutCount += summary.boundedWork.structureConformanceTimeoutCount;
  }
  const deterministicEarlyExitReasons = runtimeCounts(
    validSummaries.flatMap(summary => summary.boundedWork.deterministicEarlyExitReasons.flatMap(row => Array(row.count).fill(row.key))),
  );
  const semanticSkipReasons = runtimeCounts(
    [
      ...validSummaries.flatMap(summary =>
        summary.boundedWork.semanticSkipReasons.flatMap(row => Array(row.count).fill(`semanticSkip:${row.key}`)),
      ),
      ...semanticSummaries.flatMap(row => `${row.lane}:${row.skippedReason}`),
    ],
  );
  if (validSummaries.length === 0 && afterRuntime) {
    return {
      analysisBefore: null,
      analysisAfter: afterRuntime,
      deterministicTotalMs,
      stageTimings,
      toolTimings,
      semanticLaneTimings: semanticSummaries.flatMap(summary => summary.runtime ? [summary.runtime] : []),
      boundedWork: {
        semanticCandidateCapsHit,
        deterministicEarlyExitCount: deterministicEarlyExitReasons.reduce((sum, row) => sum + row.count, 0),
        deterministicEarlyExitReasons,
        semanticSkipReasons,
        zeroHeadingLaneActivations,
        headingConvergenceAttemptCount,
        headingConvergenceSuccessCount,
        headingConvergenceFailureCount,
        headingConvergenceTimeoutCount,
        structureConformanceTimeoutCount,
      },
    };
  }
  return {
    analysisBefore: validSummaries[0]?.analysisBefore ?? null,
    analysisAfter: afterRuntime ?? validSummaries[validSummaries.length - 1]?.analysisAfter ?? null,
    deterministicTotalMs,
    stageTimings,
    toolTimings,
    semanticLaneTimings: validSummaries.flatMap(summary => summary.semanticLaneTimings ?? []).concat(
      semanticSummaries.flatMap(summary => summary.runtime ? [summary.runtime] : []),
    ),
    boundedWork: {
      semanticCandidateCapsHit,
      deterministicEarlyExitCount: deterministicEarlyExitReasons.reduce((sum, row) => sum + row.count, 0),
      deterministicEarlyExitReasons,
      semanticSkipReasons,
      zeroHeadingLaneActivations,
      headingConvergenceAttemptCount,
      headingConvergenceSuccessCount,
      headingConvergenceFailureCount,
      headingConvergenceTimeoutCount,
      structureConformanceTimeoutCount,
    },
  };
}

function hasDeterministicEarlyExit(
  runtimeSummary: RemediationRuntimeSummary | undefined,
  reason: string,
): boolean {
  return runtimeSummary?.boundedWork.deterministicEarlyExitReasons?.some(row => row.key === reason && row.count > 0) ?? false;
}

function shouldKeepPostRemediationAltRepair(
  before: AnalysisResult,
  after: AnalysisResult,
): boolean {
  // Keep the post-pass repair if it does not regress the final accessibility score.
  // If the repair hurts score or introduces no change, revert to prior state.
  return after.score >= before.score;
}

function benchmarkFinalReanalysisDecision(args: {
  startedAtMs: number;
  score: number;
  verifiedCheckpointReturned: boolean;
}): { skip: boolean; reason?: string } {
  if (args.verifiedCheckpointReturned) {
    return { skip: true, reason: 'verified_checkpoint_timeout_return' };
  }

  if (
    REQUEST_TIMEOUT_REMEDIATE_MS > 0 &&
    Date.now() - args.startedAtMs >= REQUEST_TIMEOUT_REMEDIATE_MS - REMEDIATION_SOFT_DEADLINE_BUFFER_MS
  ) {
    return { skip: true, reason: 'final_reanalysis_soft_stop' };
  }

  return { skip: false };
}

function printUsage(): void {
  console.log(`Usage:
  pnpm exec tsx scripts/experiment-corpus-benchmark.ts [options]

Options:
  --mode analyze|remediate|full   Benchmark mode (default: full)
  --out <dir>                     Output directory root or explicit run directory
  --manifest <path>               Alternate experiment corpus manifest path
    --source-type <type>            Restrict to sourceType (fixture|original|remediated_checkpoint), repeatable
  --file <id>                     Restrict to one manifest id (repeatable)
  --semantic                      Enable semantic passes
    --readability-review            Enable readability review
  --no-readability-review         Disable readability review (default)
  --readability-auto-repair       Enable readability auto-repair using review findings
  --no-readability-auto-repair    Disable readability auto-repair
  --readability-review-timeout <ms> Set readability review timeout in ms
  --readability-auto-repair-max-attempts <n>  Max auto-repair attempts (0-10)
  --readability-auto-repair-timeout <ms>  Dedicated auto-repair timeout in ms (0-600000)
  --write-pdfs                    Write remediated PDFs into the run directory
  --write-protected-debug-states  Write protected checkpoint PDFs/metadata for diagnostics
  --protected-baseline-run <dir>   Internal benchmark-only protected row floor baseline
  --validate-manifest             Validate Input/experiment-corpus/manifest.json and exit
  --validate-run <dir>            Validate an existing benchmark run directory and exit
  --validate-visual               When used with --validate-run, also compare rendered PDFs
  --help                          Show this help`);
}

function parseArgs(argv: string[]): ParsedArgs {
  let mode: BenchmarkMode = 'full';
  let outDir: string | undefined;
  let manifestPath: string | undefined;
  const cohorts: string[] = [];
  const sourceTypes: string[] = [];
  const fileIds: string[] = [];
  let semanticEnabled = false;
  let readabilityReviewEnabled = false;
  let readabilityAutoRepairEnabled = false;
  let readabilityReviewTimeoutMs = READABILITY_REVIEW_TIMEOUT_MS;
  let readabilityAutoRepairMaxAttempts = READABILITY_AUTO_REPAIR_MAX_ATTEMPTS;
  let readabilityAutoRepairTimeoutMs = READABILITY_AUTO_REPAIR_TIMEOUT_MS;
  let writePdfs = false;
  let writeProtectedDebugStates = false;
  let validateManifestOnly = false;
  let validateRunDir: string | undefined;
  let validateVisual = false;
  let protectedBaselineRunDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    switch (arg) {
      case '--mode': {
        const value = argv[++i];
        if (value !== 'analyze' && value !== 'remediate' && value !== 'full') {
          throw new Error(`Invalid --mode "${value ?? ''}". Expected analyze, remediate, or full.`);
        }
        mode = value;
        break;
      }
      case '--out': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --out.');
        outDir = value;
        break;
      }
      case '--manifest': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --manifest.');
        manifestPath = resolve(value);
        break;
      }
      case '--cohort': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --cohort.');
        cohorts.push(value);
        break;
      }
  case '--file': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --file.');
        fileIds.push(value);
        break;
      }
      case '--source-type': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --source-type.');
        sourceTypes.push(value);
        break;
      }
      case '--semantic':
        semanticEnabled = true;
        break;
      case '--no-semantic':
        semanticEnabled = false;
        break;
      case '--readability-review':
        readabilityReviewEnabled = true;
        break;
      case '--no-readability-review':
        readabilityReviewEnabled = false;
        break;
      case '--readability-auto-repair':
        readabilityAutoRepairEnabled = true;
        break;
      case '--no-readability-auto-repair':
        readabilityAutoRepairEnabled = false;
        break;
      case '--readability-review-timeout': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --readability-review-timeout.');
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 0) throw new Error('Invalid value for --readability-review-timeout.');
        readabilityReviewTimeoutMs = parsed;
        break;
      }
      case '--readability-auto-repair-max-attempts': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --readability-auto-repair-max-attempts.');
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 10) {
          throw new Error('Invalid value for --readability-auto-repair-max-attempts. Expected integer 0-10.');
        }
        readabilityAutoRepairMaxAttempts = parsed;
        break;
      }
      case '--readability-auto-repair-timeout': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --readability-auto-repair-timeout.');
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 600_000) {
          throw new Error('Invalid value for --readability-auto-repair-timeout. Expected integer 0-600000.');
        }
        readabilityAutoRepairTimeoutMs = parsed;
        break;
      }
      case '--write-pdfs':
        writePdfs = true;
        break;
      case '--write-protected-debug-states':
        writeProtectedDebugStates = true;
        break;
      case '--protected-baseline-run': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --protected-baseline-run.');
        protectedBaselineRunDir = resolve(value);
        break;
      }
      case '--validate-manifest':
        validateManifestOnly = true;
        break;
      case '--validate-visual':
        validateVisual = true;
        break;
      case '--validate-run': {
        const value = argv[++i];
        if (!value) throw new Error('Missing value for --validate-run.');
        validateRunDir = value;
        break;
      }
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
    }
  }

  return {
    mode,
    outDir,
    manifestPath,
    cohorts,
    sourceTypes,
    fileIds,
    semanticEnabled,
    readabilityReviewEnabled,
    readabilityAutoRepairEnabled,
    readabilityReviewTimeoutMs,
    readabilityAutoRepairMaxAttempts,
    readabilityAutoRepairTimeoutMs,
    writePdfs,
    writeProtectedDebugStates,
    validateManifestOnly,
    validateRunDir,
    validateVisual,
    protectedBaselineRunDir,
  };
}

function makeRunId(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return `run-${iso}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'state';
}

function categoryScores(result: AnalysisResult): Record<string, number> {
  return Object.fromEntries(result.categories.map(category => [category.key, category.score]));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

async function loadProtectedBaselineRows(runDir: string | undefined): Promise<Map<string, ProtectedBaselineRow>> {
  if (!runDir) return new Map();
  const path = join(resolve(runDir), 'remediate.results.json');
  const rows = JSON.parse(await readFile(path, 'utf8')) as RemediateBenchmarkRow[];
  const out = new Map<string, ProtectedBaselineRow>();
  for (const row of rows) {
    const score = row.reanalyzedScore ?? row.afterScore;
    if (typeof score !== 'number' || !Number.isFinite(score)) continue;
    const scoreCapsApplied = row.reanalyzedScoreCapsApplied?.length
      ? row.reanalyzedScoreCapsApplied
      : row.afterScoreCapsApplied ?? [];
    const categories = row.reanalyzedCategories?.length ? row.reanalyzedCategories : row.afterCategories ?? [];
    out.set(row.id, {
      score,
      scoreCapsApplied,
      categories: Object.fromEntries(categories.map(category => [category.key, category.score])),
    });
  }
  return out;
}

async function reanalyzeBuffer(
  buffer: Buffer,
  filename: string,
  signal?: AbortSignal,
): Promise<{ result: AnalysisResult; snapshot: DocumentSnapshot; wallMs: number }> {
  const tempPath = join(tmpdir(), `pdfaf-experiment-corpus-${randomUUID()}.pdf`);
  await writeFile(tempPath, buffer);
  const wallStart = performance.now();
  try {
    const analyzed = await analyzePdf(tempPath, filename, {
      bypassCache: true,
      signal,
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
    });
    return {
      ...analyzed,
      wallMs: performance.now() - wallStart,
    };
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

async function selectProtectedFinalReanalysis(input: {
  buffer: Buffer;
  filename: string;
  protectedBaseline?: ProtectedBaselineRow;
  cache: Map<string, Promise<SelectedReanalysis>>;
  signal?: AbortSignal;
}): Promise<SelectedReanalysis> {
  const repeatCount = protectedReanalysisRepeatCount();
  const bufferSha256 = sha256Buffer(input.buffer);
  const key = protectedReanalysisCacheKey({
    bufferSha256,
    filename: input.filename,
    protectedBaselineEnabled: input.protectedBaseline != null,
    repeatCount,
  });

  return cachedProtectedReanalysis(input.cache, key, async () => {
    const attempts: ReanalysisAttempt[] = [];
    const maxRepeats = input.protectedBaseline ? repeatCount : 1;
    for (let index = 1; index <= maxRepeats; index += 1) {
      const analyzed = await reanalyzeBuffer(input.buffer, input.filename, input.signal);
      const attempt: ReanalysisAttempt = {
        index,
        bufferSha256,
        result: analyzed.result,
        snapshot: analyzed.snapshot,
        parity: buildIcjiaParity(analyzed.snapshot),
        wallMs: analyzed.wallMs,
      };
      attempts.push(attempt);

      if (
        input.protectedBaseline &&
        protectedReanalysisUnsafeReason({
          baseline: input.protectedBaseline,
          analysis: analyzed.result,
        }) === null
      ) {
        break;
      }
    }

    const selected = selectProtectedReanalysis({
      baseline: input.protectedBaseline,
      candidates: attempts,
      enabled: input.protectedBaseline != null,
      repeatCount,
    });
    const attempt = attempts.find(candidate => candidate.index === selected.candidate.index) ?? attempts[0]!;
    return {
      result: attempt.result,
      snapshot: attempt.snapshot,
      parity: attempt.parity,
      wallMs: attempt.wallMs ?? 0,
      ...(input.protectedBaseline ? { selection: selected.summary } : {}),
    };
  });
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeAnalyzeRow(
  entry: ExperimentCorpusEntry,
  result: AnalysisResult,
  wallAnalyzeMs: number,
  snapshot: DocumentSnapshot,
): AnalyzeBenchmarkRow {
  return {
    id: entry.id,
    file: entry.file,
    cohort: entry.cohort,
    sourceType: entry.sourceType,
    intent: entry.intent,
    ...(entry.notes ? { notes: entry.notes } : {}),
    score: result.score,
    grade: result.grade,
    pdfClass: result.pdfClass,
    pageCount: result.pageCount,
    categories: result.categories,
    findings: result.findings,
    analysisDurationMs: result.analysisDurationMs,
    wallAnalyzeMs,
    verificationLevel: result.verificationLevel,
    manualReviewRequired: result.manualReviewRequired,
    manualReviewReasons: result.manualReviewReasons,
    scoreCapsApplied: result.scoreCapsApplied,
    structuralClassification: result.structuralClassification,
    failureProfile: result.failureProfile,
    detectionProfile: result.detectionProfile,
    icjiaParity: buildIcjiaParity(snapshot),
  };
}

function makeAnalyzeErrorRow(entry: ExperimentCorpusEntry, error: unknown): AnalyzeBenchmarkRow {
  return {
    id: entry.id,
    file: entry.file,
    cohort: entry.cohort,
    sourceType: entry.sourceType,
    intent: entry.intent,
    ...(entry.notes ? { notes: entry.notes } : {}),
    score: null,
    grade: null,
    pdfClass: null,
    pageCount: null,
    categories: [],
    findings: [],
    analysisDurationMs: null,
    wallAnalyzeMs: null,
    verificationLevel: undefined,
    manualReviewRequired: undefined,
    manualReviewReasons: [],
    scoreCapsApplied: [],
    structuralClassification: undefined,
    failureProfile: undefined,
    detectionProfile: undefined,
    icjiaParity: null,
    error: sanitizeError(error),
  };
}

async function runSemanticSequence(input: {
  entry: ExperimentCorpusEntry;
  buffer: Buffer;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  signal?: AbortSignal;
}): Promise<{
  buffer: Buffer;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  semantic: SemanticRemediationSummary;
  semanticHeadings: SemanticRemediationSummary;
  semanticPromoteHeadings: SemanticRemediationSummary;
  semanticUntaggedHeadings: SemanticRemediationSummary;
}> {
  let currentBuffer = input.buffer;
  let currentAnalysis = input.analysis;
  let currentSnapshot = input.snapshot;
  const signal = input.signal;
  const semanticTimeoutMs = REMEDIATION_PDF_TIMEOUT_MS > 0 ? REMEDIATION_PDF_TIMEOUT_MS : undefined;

  const emptySummary = (
    lane: SemanticRemediationSummary['lane'],
    score: number,
    skippedReason: SemanticRemediationSummary['skippedReason'],
  ): SemanticRemediationSummary => buildSemanticSummary({
    lane,
    skippedReason,
    durationMs: 0,
    proposalsAccepted: 0,
    proposalsRejected: 0,
    scoreBefore: score,
    scoreAfter: score,
    batches: [],
    gate: buildSemanticGateSummary({
      passed: false,
      reason: skippedReason,
      details: ['semantic benchmark lane skipped before execution'],
    }),
    changeStatus: 'skipped',
  });

  if (!getOpenAiCompatBaseUrl()) {
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      semantic: emptySummary('figures', currentAnalysis.score, 'no_llm_config'),
      semanticHeadings: emptySummary('headings', currentAnalysis.score, 'no_llm_config'),
      semanticPromoteHeadings: emptySummary('promote_headings', currentAnalysis.score, 'no_llm_config'),
      semanticUntaggedHeadings: emptySummary('untagged_headings', currentAnalysis.score, 'no_llm_config'),
    };
  }

  const figureParts: SemanticRemediationSummary[] = [];
  const figureScoreBefore = currentAnalysis.score;
  for (let pass = 0; pass < SEMANTIC_REMEDIATE_FIGURE_PASSES; pass++) {
    const semantic = await applySemanticRepairs({
      buffer: currentBuffer,
      filename: input.entry.filename,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      options: { timeoutMs: semanticTimeoutMs, signal },
    });
    figureParts.push(semantic.summary);
    currentBuffer = semantic.buffer;
    currentAnalysis = semantic.analysis;
    currentSnapshot = semantic.snapshot;
    if (semantic.summary.skippedReason !== 'completed') break;
    if (semantic.summary.proposalsAccepted === 0) break;
  }
  const semanticSummary = mergeSequentialSemanticSummaries(figureScoreBefore, figureParts);

  const promoteParts: SemanticRemediationSummary[] = [];
  const promoteScoreBefore = currentAnalysis.score;
  for (let pass = 0; pass < SEMANTIC_REMEDIATE_PROMOTE_PASSES; pass++) {
    const promote = await applySemanticPromoteHeadingRepairs({
      buffer: currentBuffer,
      filename: input.entry.filename,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      options: { timeoutMs: semanticTimeoutMs, signal },
    });
    promoteParts.push(promote.summary);
    currentBuffer = promote.buffer;
    currentAnalysis = promote.analysis;
    currentSnapshot = promote.snapshot;
    if (promote.summary.skippedReason !== 'completed') break;
    if (promote.summary.proposalsAccepted === 0) break;
  }
  const promoteSummary = mergeSequentialSemanticSummaries(promoteScoreBefore, promoteParts);

  const heading = await applySemanticHeadingRepairs({
    buffer: currentBuffer,
    filename: input.entry.filename,
    analysis: currentAnalysis,
    snapshot: currentSnapshot,
    options: { timeoutMs: semanticTimeoutMs, signal },
  });
  currentBuffer = heading.buffer;
  currentAnalysis = heading.analysis;
  currentSnapshot = heading.snapshot;

  const untagged = await applySemanticUntaggedHeadingRepairs({
    buffer: currentBuffer,
    filename: input.entry.filename,
    analysis: currentAnalysis,
    snapshot: currentSnapshot,
    options: { timeoutMs: semanticTimeoutMs, signal },
  });
  currentBuffer = untagged.buffer;
  currentAnalysis = untagged.analysis;
  currentSnapshot = untagged.snapshot;

  if (currentSnapshot.isTagged && currentAnalysis.score < REMEDIATION_TARGET_SCORE) {
    const alt = await applyPostRemediationAltRepair(
      currentBuffer,
      input.entry.filename,
      currentAnalysis,
      currentSnapshot,
      { signal, timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS },
    );
    currentBuffer = alt.buffer;
    currentAnalysis = alt.analysis;
    currentSnapshot = alt.snapshot;
  }

  const trustAdjusted = enforceSemanticTrust({
    before: input.analysis,
    after: currentAnalysis,
    summaries: [semanticSummary, heading.summary, promoteSummary, untagged.summary],
  });
  currentAnalysis = trustAdjusted.analysis;
  if (trustAdjusted.trustDowngraded) {
    if (semanticSummary.changeStatus === 'applied') semanticSummary.trustDowngraded = true;
    if (heading.summary.changeStatus === 'applied') heading.summary.trustDowngraded = true;
    if (promoteSummary.changeStatus === 'applied') promoteSummary.trustDowngraded = true;
    if (untagged.summary.changeStatus === 'applied') untagged.summary.trustDowngraded = true;
  }

  return {
    buffer: currentBuffer,
    analysis: currentAnalysis,
    snapshot: currentSnapshot,
    semantic: semanticSummary,
    semanticHeadings: heading.summary,
    semanticPromoteHeadings: promoteSummary,
    semanticUntaggedHeadings: untagged.summary,
  };
}

async function runAnalyzeStep(entry: ExperimentCorpusEntry): Promise<{
  row: AnalyzeBenchmarkRow;
  result: AnalysisResult;
  snapshot: DocumentSnapshot;
}> {
  const wallStart = performance.now();
  const analyzed = await analyzePdf(entry.absolutePath, entry.filename, { bypassCache: true });
  const wallAnalyzeMs = performance.now() - wallStart;
  return {
    row: makeAnalyzeRow(entry, analyzed.result, wallAnalyzeMs, analyzed.snapshot),
    result: analyzed.result,
    snapshot: analyzed.snapshot,
  };
}

async function runRemediationStep(
  entry: ExperimentCorpusEntry,
  before: AnalysisResult,
  _snapshot: DocumentSnapshot,
  semanticEnabled: boolean,
  readabilityReviewEnabled: boolean,
  readabilityAutoRepairEnabled: boolean,
  readabilityReviewTimeoutMs: number,
  readabilityAutoRepairMaxAttempts: number,
  readabilityAutoRepairTimeoutMs: number,
  mode: BenchmarkMode,
  writePdfs: boolean,
  writeProtectedDebugStates: boolean,
  runDir: string,
  protectedReanalysisCache: Map<string, Promise<SelectedReanalysis>>,
  protectedBaseline?: ProtectedBaselineRow,
): Promise<RemediateBenchmarkRow> {
  const buffer = await readFile(entry.absolutePath);
  const totalStart = performance.now();
  const remediationStart = performance.now();
  const routeStarted = Date.now();
  const runtimeTrace = createRuntimeTimeoutTrace(entry, remediationStart);
  const db = new Database(':memory:');
  initSchema(db);

  try {
    const remediationSignal =
      REMEDIATION_PDF_TIMEOUT_MS > 0
        ? AbortSignal.timeout(REMEDIATION_PDF_TIMEOUT_MS)
        : undefined;
    const firstPassStores = {
      playbookStore: createPlaybookStore(db),
      toolOutcomeStore: createToolOutcomeStore(db),
    };
    const protectedDebugStateCaptures: ProtectedDebugStateArtifact[] = [];
    let protectedDebugStateSequence = 0;
    const writeProtectedDebugState = async (state: ProtectedDebugStateCapture): Promise<void> => {
      if (!writeProtectedDebugStates || !protectedBaseline) return;
      protectedDebugStateSequence += 1;
      const sequence = protectedDebugStateSequence;
      const dir = join(runDir, 'protected-states', entry.id);
      const base = `${String(sequence).padStart(3, '0')}-${slugify(state.reason)}`;
      const pdfPath = join(dir, `${base}.pdf`);
      const metadataPath = join(dir, `${base}.json`);
      await mkdir(dir, { recursive: true });
      await writeFile(pdfPath, state.buffer);
      const metadata = {
        rowId: entry.id,
        file: entry.file,
        reason: state.reason,
        sequence,
        bufferSha256: state.bufferSha256,
        score: state.analysis.score,
        grade: state.analysis.grade,
        floorScore: state.floorScore,
        floorReached: state.floorReached,
        protectedRunSafe: state.protectedRunSafe,
        appliedToolCount: state.appliedToolCount,
        categories: categoryScores(state.analysis),
        pdfClass: state.analysis.pdfClass,
        analysisDurationMs: state.analysis.analysisDurationMs,
      };
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      protectedDebugStateCaptures.push({
        sequence,
        reason: state.reason,
        path: pdfPath,
        metadataPath,
        bufferSha256: state.bufferSha256,
        score: state.analysis.score,
        grade: state.analysis.grade,
        floorScore: state.floorScore,
        floorReached: state.floorReached,
        protectedRunSafe: state.protectedRunSafe,
        appliedToolCount: state.appliedToolCount,
      });
    };

    const { remediation, buffer: detBuffer, snapshot: detSnapshot } = await remediatePdf(
      buffer,
      entry.filename,
      before,
      _snapshot,
      {
        maxRounds: 10,
        ...(remediationSignal ? { signal: remediationSignal } : {}),
        playbookStore: firstPassStores.playbookStore,
        toolOutcomeStore: firstPassStores.toolOutcomeStore,
        onRuntimeTrace: runtimeTrace.event,
        ...(writeProtectedDebugStates && protectedBaseline ? { onProtectedDebugState: writeProtectedDebugState } : {}),
        ...(protectedBaseline
          ? {
              protectedBaseline: {
                score: protectedBaseline.score,
                scoreCapsApplied: protectedBaseline.scoreCapsApplied,
                categories: protectedBaseline.categories,
              },
            }
          : {}),
      },
    );

    let outBuffer = detBuffer;
    let outAnalysis = remediation.after;
    let outSnapshot = detSnapshot;
    let appliedToolsOut = [...remediation.appliedTools];
    let roundsOut = [...remediation.rounds];
    const deterministicRuntimeSummaries: Array<RemediationRuntimeSummary | undefined> = [remediation.runtimeSummary];
    let deterministicDurationMs = remediation.remediationDurationMs;
    let verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(remediation);
    const remediationTargetScore = REMEDIATION_TARGET_SCORE;
    const runPostRemediationAltPhase = async (details: string): Promise<void> => {
      if (verifiedCheckpointReturned) return;
      if (!outSnapshot.isTagged) return;
      if (outAnalysis.score >= remediationTargetScore) return;
      const scoreBeforeAltFix = outAnalysis.score;
      const phaseStarted = Date.now();
      const ar = await applyPostRemediationAltRepair(
        outBuffer,
        entry.filename,
        outAnalysis,
        outSnapshot,
        { signal: remediationSignal },
      );
      deterministicDurationMs += Date.now() - phaseStarted;
      if (!ar.buffer.equals(outBuffer) && shouldKeepPostRemediationAltRepair(outAnalysis, ar.analysis)) {
        outBuffer = ar.buffer;
        outAnalysis = ar.analysis;
        outSnapshot = ar.snapshot;
        appliedToolsOut = [
          ...appliedToolsOut,
          {
            toolName: 'repair_alt_text_structure',
            stage: 9,
            round: roundsOut[roundsOut.length - 1]?.round ?? 1,
            scoreBefore: scoreBeforeAltFix,
            scoreAfter: outAnalysis.score,
            delta: outAnalysis.score - scoreBeforeAltFix,
            outcome: 'applied' as const,
            details,
            source: 'post_pass' as const,
          },
        ];
      }
    };
    const hasSecondPassBudget = (): boolean => {
      if (REQUEST_TIMEOUT_REMEDIATE_MS <= 0) return true;
      const remainingMs = REQUEST_TIMEOUT_REMEDIATE_MS - (Date.now() - routeStarted);
      return remainingMs >= (REMEDIATION_ANALYSIS_TIMEOUT_MS + REMEDIATION_SOFT_DEADLINE_BUFFER_MS);
    };

    await runPostRemediationAltPhase('nested_alt_cleanup_post_first_pass');

    if (shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned,
      score: outAnalysis.score,
      remediationTargetScore,
      hasBudget: hasSecondPassBudget(),
    })) {
      const secondPassStores = {
        playbookStore: createPlaybookStore(db),
        toolOutcomeStore: createToolOutcomeStore(db),
      };
      const r2 = await remediatePdf(
        outBuffer,
        entry.filename,
        outAnalysis,
        outSnapshot,
        {
          maxRounds: 10,
          ...(remediationSignal ? { signal: remediationSignal } : {}),
          playbookStore: secondPassStores.playbookStore,
          toolOutcomeStore: secondPassStores.toolOutcomeStore,
          onRuntimeTrace: runtimeTrace.event,
          ...(writeProtectedDebugStates && protectedBaseline ? { onProtectedDebugState: writeProtectedDebugState } : {}),
          ...(protectedBaseline
            ? {
                protectedBaseline: {
                  score: protectedBaseline.score,
                  scoreCapsApplied: protectedBaseline.scoreCapsApplied,
                  categories: protectedBaseline.categories,
                },
              }
            : {}),
        },
      );
      deterministicDurationMs += r2.remediation.remediationDurationMs;
      if (r2.remediation.runtimeSummary) {
        deterministicRuntimeSummaries.push(r2.remediation.runtimeSummary);
      }
      if (r2.remediation.after.score >= outAnalysis.score) {
        const roundOffset = roundsOut[roundsOut.length - 1]?.round ?? 0;
        outBuffer = r2.buffer;
        outAnalysis = r2.remediation.after;
        outSnapshot = r2.snapshot;
        roundsOut = [
          ...roundsOut,
          ...r2.remediation.rounds.map(round => ({ ...round, round: round.round + roundOffset })),
        ];
        appliedToolsOut = [
          ...appliedToolsOut,
          ...r2.remediation.appliedTools.map(tool => ({ ...tool, round: tool.round + roundOffset })),
        ];
        verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(r2.remediation);
        await runPostRemediationAltPhase('nested_alt_cleanup_post_second_pass');
      }
    }

    let semantic: SemanticRemediationSummary | undefined;
    let semanticHeadings: SemanticRemediationSummary | undefined;
    let semanticPromoteHeadings: SemanticRemediationSummary | undefined;
    let semanticUntaggedHeadings: SemanticRemediationSummary | undefined;

    if (semanticEnabled) {
      const semanticRun = await runSemanticSequence({
        entry,
        buffer: outBuffer,
        analysis: outAnalysis,
        snapshot: outSnapshot,
        ...(remediationSignal ? { signal: remediationSignal } : {}),
      });
      outBuffer = semanticRun.buffer;
      outAnalysis = semanticRun.analysis;
      outSnapshot = semanticRun.snapshot;
      semantic = semanticRun.semantic;
      semanticHeadings = semanticRun.semanticHeadings;
      semanticPromoteHeadings = semanticRun.semanticPromoteHeadings;
      semanticUntaggedHeadings = semanticRun.semanticUntaggedHeadings;
    }

    if ([
      semantic,
      semanticHeadings,
      semanticPromoteHeadings,
      semanticUntaggedHeadings,
    ].some(summary => summary?.changeStatus === 'applied')) {
      await runPostRemediationAltPhase('nested_alt_cleanup_post_semantic');
    }

    const trustAdjusted = enforceSemanticTrust({
      before: remediation.before,
      after: outAnalysis,
      summaries: [semantic, semanticHeadings, semanticPromoteHeadings, semanticUntaggedHeadings],
    });
    outAnalysis = trustAdjusted.analysis;
    if (trustAdjusted.trustDowngraded) {
      if (semantic?.changeStatus === 'applied') semantic.trustDowngraded = true;
      if (semanticHeadings?.changeStatus === 'applied') semanticHeadings.trustDowngraded = true;
      if (semanticPromoteHeadings?.changeStatus === 'applied') semanticPromoteHeadings.trustDowngraded = true;
      if (semanticUntaggedHeadings?.changeStatus === 'applied') semanticUntaggedHeadings.trustDowngraded = true;
    }

    let readabilityReview: ReadabilityReviewSummary | undefined;
    const readabilityReviewAttempts: ReadabilityReviewSummary[] = [];
    let readabilityAutoRepair: ReadabilityAutoRepairSummary | undefined;
    let readabilityRepairPlan: ReadabilityRepairPlanSummary | undefined;
    const readabilityAutoRepairAttemptLimit = Math.max(
      0,
      Math.trunc(readabilityAutoRepairMaxAttempts),
    );
    const readabilityAutoRepairTargetScore = Math.max(
      remediationTargetScore,
      READABILITY_AUTO_REPAIR_TARGET_SCORE,
    );
    const effectiveReadabilityAutoRepairTimeoutMs = Math.max(
      0,
      Math.min(Math.trunc(readabilityAutoRepairTimeoutMs), 600_000),
    );
    const repairScheduledToolNames = new Set<string>();
    const repairSkippedToolReasons: Array<{ toolName: string; reason: PlanningSkipReason }> = [];
    const semanticLanesAttempted = new Set<ReadabilityRepairSemanticLane>();
    const semanticLanesApplied = new Set<ReadabilityRepairSemanticLane>();

    const summarizeReadabilityAutoRepair = (
      reason: ReadabilityAutoRepairSummary['reason'],
      details: {
        attempted?: boolean;
        attempts?: number;
        durationMs?: number;
        roundsAdded?: number;
        toolsAdded?: number;
      } = {},
    ): ReadabilityAutoRepairSummary => ({
      attempted: details.attempted ?? false,
      attempts: details.attempts,
      applied: false,
      reason,
      durationMs: details.durationMs ?? 0,
      ...(readabilityReview
        ? {
            beforeStatus: readabilityReview.status,
            beforeReadabilityScore: readabilityReview.score,
          }
        : {}),
      beforeEngineScore: outAnalysis.score,
      targetScore: readabilityAutoRepairTargetScore,
      ...(readabilityRepairPlan ? { repairPlan: readabilityRepairPlan } : {}),
      ...(details.roundsAdded != null ? { roundsAdded: details.roundsAdded } : {}),
      ...(details.toolsAdded != null ? { toolsAdded: details.toolsAdded } : {}),
      ...(typeof repairScheduledToolNames !== 'undefined' && repairScheduledToolNames.size > 0 ? { scheduledToolNames: [...repairScheduledToolNames] } : {}),
      ...(typeof repairSkippedToolReasons !== 'undefined' && repairSkippedToolReasons.length > 0 ? { skippedToolReasons: repairSkippedToolReasons } : {}),
      ...(typeof semanticLanesAttempted !== 'undefined' && semanticLanesAttempted.size > 0 ? { semanticLanesAttempted: [...semanticLanesAttempted] } : {}),
      ...(typeof semanticLanesApplied !== 'undefined' && semanticLanesApplied.size > 0 ? { semanticLanesApplied: [...semanticLanesApplied] } : {}),
    });

    if (readabilityReviewEnabled) {
      readabilityReview = await reviewRemediatedReadability({
        filename: entry.filename,
        analysis: outAnalysis,
        snapshot: outSnapshot,
        options: {
          timeoutMs: readabilityReviewTimeoutMs,
          signal: remediationSignal,
        },
      });
      readabilityReviewAttempts.push(readabilityReview);

      if (readabilityAutoRepairEnabled) {
        if (readabilityAutoRepairAttemptLimit <= 0) {
          readabilityAutoRepair = summarizeReadabilityAutoRepair('not_requested', {
            attempted: false,
            attempts: 0,
          });
        } else {
          let repairAttempt = 0;
          let repairDurationMs = 0;
          let repairRoundsAdded = 0;
          const readabilityRepairStartedAt = Date.now();
          const hasReadabilityRepairBudget = (): boolean => {
            if (effectiveReadabilityAutoRepairTimeoutMs > 0 && Date.now() - readabilityRepairStartedAt >= effectiveReadabilityAutoRepairTimeoutMs) return false;
            if (REQUEST_TIMEOUT_REMEDIATE_MS <= 0) return true;
            const remainingMs = REQUEST_TIMEOUT_REMEDIATE_MS - (Date.now() - routeStarted);
            return remainingMs >= REMEDIATION_SOFT_DEADLINE_BUFFER_MS;
          };
          let repairToolsAdded = 0;
          const statusRank = (status: ReadabilityReviewSummary['status']): number =>
            status === 'passed' ? 3 : status === 'warn' ? 2 : status === 'failed' ? 1 : 0;
          const findingAreas = (review: ReadabilityReviewSummary): Set<ReadabilityReviewArea> =>
            new Set(review.findings.map(finding => finding.area));
          const resolvedFindingAreas = (beforeReview: ReadabilityReviewSummary, afterReview: ReadabilityReviewSummary): ReadabilityReviewArea[] => {
            const afterAreas = findingAreas(afterReview);
            return [...findingAreas(beforeReview)].filter(area => !afterAreas.has(area));
          };
          const buildRepairStatusDelta = (beforeReview: ReadabilityReviewSummary, afterReview: ReadabilityReviewSummary) => ({
            beforeStatus: beforeReview.status,
            afterStatus: afterReview.status,
            beforeReadabilityScore: beforeReview.score,
            afterReadabilityScore: afterReview.score,
            resolvedFindingAreas: resolvedFindingAreas(beforeReview, afterReview),
          });
          const readabilityStatusImproved = (beforeReview: ReadabilityReviewSummary, afterReview: ReadabilityReviewSummary): boolean =>
            statusRank(afterReview.status) > statusRank(beforeReview.status);
          const addRepairPlanningEvidence = (planningSummary: PlanningSummary | undefined): void => {
            for (const toolName of planningSummary?.scheduledTools ?? []) repairScheduledToolNames.add(toolName);
            repairSkippedToolReasons.push(...(planningSummary?.skippedTools ?? []));
          };
          const baselineReadabilityReview = readabilityReview;
          let bestReadabilityReview = readabilityReview;
          let bestReadabilityState = {
            buffer: outBuffer,
            analysis: outAnalysis,
            snapshot: outSnapshot,
            roundsOut: [...roundsOut],
            appliedToolsOut: [...appliedToolsOut],
            repairRoundsAdded: 0,
            repairToolsAdded: 0,
            repairDurationMs: 0,
          };
          for (; repairAttempt < readabilityAutoRepairAttemptLimit; repairAttempt += 1) {
            const repairDecision = shouldRunReadabilityAutoRepair({
              reviewRequested: true,
              autoRepairEnabled: true,
              hasBudget: hasReadabilityRepairBudget(),
              review: readabilityReview,
            });
            if (!repairDecision.shouldRun) {
              readabilityAutoRepair = summarizeReadabilityAutoRepair(repairDecision.reason, {
                attempted: repairAttempt > 0,
                attempts: repairAttempt,
                durationMs: repairDurationMs,
              });
              break;
            }

            readabilityRepairPlan = buildReadabilityRepairPlan({
              review: readabilityReview,
              analysis: outAnalysis,
              snapshot: outSnapshot,
            });
            for (const lane of readabilityRepairPlan.semanticLanes) {
              semanticLanesAttempted.add(lane);
              if (!getOpenAiCompatBaseUrl()) {
                repairSkippedToolReasons.push({ toolName: `semantic:${lane}`, reason: 'readability_semantic_unavailable' });
                continue;
              }
              const beforeLaneScore = outAnalysis.score;
              const semanticTimeoutMs = REMEDIATION_PDF_TIMEOUT_MS > 0 ? REMEDIATION_PDF_TIMEOUT_MS : undefined;
              if (lane === 'figures') {
                const sem = await applySemanticRepairs({
                  buffer: outBuffer,
                  filename: entry.filename,
                  analysis: outAnalysis,
                  snapshot: outSnapshot,
                  options: { timeoutMs: semanticTimeoutMs, signal: remediationSignal },
                });
                outBuffer = sem.buffer;
                outAnalysis = sem.analysis;
                outSnapshot = sem.snapshot;
                if (sem.summary.changeStatus === 'applied') semanticLanesApplied.add(lane);
                semantic = mergeSequentialSemanticSummaries(beforeLaneScore, [semantic, sem.summary].filter((summary): summary is SemanticRemediationSummary => summary != null));
              } else if (lane === 'promote_headings') {
                const sem = await applySemanticPromoteHeadingRepairs({
                  buffer: outBuffer,
                  filename: entry.filename,
                  analysis: outAnalysis,
                  snapshot: outSnapshot,
                  options: { timeoutMs: semanticTimeoutMs, signal: remediationSignal },
                });
                outBuffer = sem.buffer;
                outAnalysis = sem.analysis;
                outSnapshot = sem.snapshot;
                if (sem.summary.changeStatus === 'applied') semanticLanesApplied.add(lane);
                semanticPromoteHeadings = mergeSequentialSemanticSummaries(beforeLaneScore, [semanticPromoteHeadings, sem.summary].filter((summary): summary is SemanticRemediationSummary => summary != null));
              } else if (lane === 'headings') {
                const sem = await applySemanticHeadingRepairs({
                  buffer: outBuffer,
                  filename: entry.filename,
                  analysis: outAnalysis,
                  snapshot: outSnapshot,
                  options: { timeoutMs: semanticTimeoutMs, signal: remediationSignal },
                });
                outBuffer = sem.buffer;
                outAnalysis = sem.analysis;
                outSnapshot = sem.snapshot;
                if (sem.summary.changeStatus === 'applied') semanticLanesApplied.add(lane);
                semanticHeadings = sem.summary;
              } else if (lane === 'untagged_headings') {
                const sem = await applySemanticUntaggedHeadingRepairs({
                  buffer: outBuffer,
                  filename: entry.filename,
                  analysis: outAnalysis,
                  snapshot: outSnapshot,
                  options: { timeoutMs: semanticTimeoutMs, signal: remediationSignal },
                });
                outBuffer = sem.buffer;
                outAnalysis = sem.analysis;
                outSnapshot = sem.snapshot;
                if (sem.summary.changeStatus === 'applied') semanticLanesApplied.add(lane);
                semanticUntaggedHeadings = sem.summary;
              }
            }

            if (readabilityRepairPlan.deterministicToolNames.length === 0 && semanticLanesApplied.size === 0) {
              readabilityAutoRepair = summarizeReadabilityAutoRepair('no_repair_plan', {
                attempts: repairAttempt + 1,
                durationMs: repairDurationMs,
              });
              break;
            }

            const repairStarted = Date.now();
            const beforeRepairReview = readabilityReview;
            const beforeRepairEngineScore = outAnalysis.score;
            const repair = await remediatePdf(
              outBuffer,
              entry.filename,
              outAnalysis,
              outSnapshot,
              {
                targetScore: readabilityAutoRepairTargetScore,
                maxRounds: 2,
                includeOptionalRemediation: true,
                focusedPlan: {
                  focusedToolNames: readabilityRepairPlan.deterministicToolNames,
                  preferredRoutes: readabilityRepairPlan.preferredRoutes,
                  focusedOnly: true,
                  mode: 'readability',
                  focusedRationale: 'Readability auto-repair for readability review concerns.',
                },
                playbookStore: createPlaybookStore(db),
                toolOutcomeStore: createToolOutcomeStore(db),
                signal: remediationSignal,
                onRuntimeTrace: runtimeTrace.event,
              },
            );
            const attemptDurationMs = Date.now() - repairStarted;
            repairDurationMs += attemptDurationMs;
            deterministicDurationMs += repair.remediation.remediationDurationMs;
            if (repair.remediation.runtimeSummary) {
              deterministicRuntimeSummaries.push(repair.remediation.runtimeSummary);
            }
            addRepairPlanningEvidence(repair.remediation.planningSummary);

            const afterRepairEngineScore = repair.remediation.after.score;
            const hasRepairChange = !repair.buffer.equals(outBuffer)
              || repair.remediation.appliedTools.some(tool => tool.outcome === 'applied');
            if (afterRepairEngineScore < beforeRepairEngineScore) {
              readabilityAutoRepair = {
                ...summarizeReadabilityAutoRepair('score_regression', {
                  attempted: true,
                  attempts: repairAttempt + 1,
                  durationMs: repairDurationMs,
                }),
                reason: 'score_regression',
                durationMs: repairDurationMs,
                afterEngineScore: afterRepairEngineScore,
                afterReadabilityScore: beforeRepairReview.score,
                afterStatus: beforeRepairReview.status,
              };
              break;
            }

            if (!hasRepairChange) {
              const roundOffset = roundsOut[roundsOut.length - 1]?.round ?? 0;
              const roundsAdded = repair.remediation.rounds.length;
              const toolsAdded = repair.remediation.appliedTools.length;
              repairRoundsAdded += roundsAdded;
              repairToolsAdded += toolsAdded;
              if (roundsAdded > 0) {
                roundsOut = [
                  ...roundsOut,
                  ...repair.remediation.rounds.map(round => ({ ...round, round: round.round + roundOffset })),
                ];
              }
              if (toolsAdded > 0) {
                appliedToolsOut = [
                  ...appliedToolsOut,
                  ...repair.remediation.appliedTools.map(tool => ({ ...tool, round: tool.round + roundOffset })),
                ];
              }
              verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(repair.remediation);
              if (toolsAdded === 0 && roundsAdded === 0) {
                readabilityAutoRepair = {
                  ...summarizeReadabilityAutoRepair('no_engine_change', {
                    attempted: true,
                    attempts: repairAttempt + 1,
                    durationMs: repairDurationMs,
                  }),
                  reason: 'no_engine_change',
                  afterEngineScore: afterRepairEngineScore,
                  afterReadabilityScore: beforeRepairReview.score,
                  afterStatus: beforeRepairReview.status,
                };
                break;
              }
              continue;
            }

            const roundOffset = roundsOut[roundsOut.length - 1]?.round ?? 0;
            const roundsAdded = repair.remediation.rounds.length;
            const toolsAdded = repair.remediation.appliedTools.length;
            repairRoundsAdded += roundsAdded;
            repairToolsAdded += toolsAdded;
            outBuffer = repair.buffer;
            outAnalysis = repair.remediation.after;
            outSnapshot = repair.snapshot;
            roundsOut = [
              ...roundsOut,
              ...repair.remediation.rounds.map(round => ({ ...round, round: round.round + roundOffset })),
            ];
            appliedToolsOut = [
              ...appliedToolsOut,
              ...repair.remediation.appliedTools.map(tool => ({ ...tool, round: tool.round + roundOffset })),
            ];
            verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(repair.remediation);
            await runPostRemediationAltPhase('nested_alt_cleanup_post_readability_auto_repair');
            readabilityReview = await reviewRemediatedReadability({
              filename: entry.filename,
              analysis: outAnalysis,
              snapshot: outSnapshot,
              options: {
                timeoutMs: readabilityReviewTimeoutMs,
                signal: remediationSignal,
              },
            });
            readabilityReviewAttempts.push(readabilityReview);

            const repairStatusDelta = buildRepairStatusDelta(beforeRepairReview, readabilityReview);
            const repairImprovedReadabilityScore = (readabilityReview.score ?? -1) > (beforeRepairReview.score ?? -1);
            const repairHadUsefulEffect = afterRepairEngineScore > beforeRepairEngineScore
              || readabilityStatusImproved(beforeRepairReview, readabilityReview)
              || repairImprovedReadabilityScore
              || repairStatusDelta.resolvedFindingAreas.length > 0;
            if (!repairHadUsefulEffect) {
              readabilityAutoRepair = {
                ...summarizeReadabilityAutoRepair('readability_prior_no_effect_reused', {
                  attempted: true,
                  attempts: repairAttempt + 1,
                  durationMs: repairDurationMs,
                  roundsAdded: repairRoundsAdded,
                  toolsAdded: repairToolsAdded,
                }),
                reason: 'readability_prior_no_effect_reused',
                afterStatus: readabilityReview.status,
                afterReadabilityScore: readabilityReview.score,
                afterEngineScore: outAnalysis.score,
                manualReviewRecommended: readabilityReview.manualReviewRecommended,
                repairStatusDelta,
              };
              break;
            }
            if (
              readabilityRepairPlan.areas.length === 1
              && readabilityReview.status !== 'passed'
              && repairStatusDelta.resolvedFindingAreas.length === 0
            ) {
              readabilityAutoRepair = {
                ...summarizeReadabilityAutoRepair('readability_issue_detected', {
                  attempted: true,
                  attempts: repairAttempt + 1,
                  durationMs: repairDurationMs,
                  roundsAdded: repairRoundsAdded,
                  toolsAdded: repairToolsAdded,
                }),
                reason: 'readability_issue_detected',
                durationMs: repairDurationMs,
                afterStatus: readabilityReview.status,
                afterReadabilityScore: readabilityReview.score,
                afterEngineScore: outAnalysis.score,
                manualReviewRecommended: readabilityReview.manualReviewRecommended,
                repairStatusDelta: repairStatusDelta,
              };
              break;
            }

            const currentStatusRank = statusRank(readabilityReview.status);
            const bestStatusRank = statusRank(bestReadabilityReview.status);
            if (
              currentStatusRank > bestStatusRank ||
              (currentStatusRank === bestStatusRank && (readabilityReview.score ?? -1) > (bestReadabilityReview.score ?? -1))
            ) {
              bestReadabilityReview = readabilityReview;
              bestReadabilityState = {
                buffer: outBuffer,
                analysis: outAnalysis,
                snapshot: outSnapshot,
                roundsOut: [...roundsOut],
                appliedToolsOut: [...appliedToolsOut],
                repairRoundsAdded,
                repairToolsAdded,
                repairDurationMs,
              };
            }

            if (readabilityReview.status === 'passed' || readabilityStatusImproved(beforeRepairReview, readabilityReview)) {
              const attempted = repairAttempt + 1;
              readabilityAutoRepair = {
                ...summarizeReadabilityAutoRepair('applied', {
                  attempted: true,
                  attempts: attempted,
                  durationMs: repairDurationMs,
                  roundsAdded: repairRoundsAdded,
                  toolsAdded: repairToolsAdded,
                }),
                applied: true,
                reason: 'applied',
                afterStatus: readabilityReview.status,
                afterReadabilityScore: readabilityReview.score,
                afterEngineScore: outAnalysis.score,
                manualReviewRecommended: readabilityReview.manualReviewRecommended,
                repairStatusDelta: buildRepairStatusDelta(beforeRepairReview, readabilityReview),
              };
              break;
            }

            if (repairAttempt + 1 >= readabilityAutoRepairAttemptLimit) {
              const attempts = repairAttempt + 1;
              readabilityAutoRepair = {
                ...summarizeReadabilityAutoRepair('attempt_limit_reached', {
                  attempted: true,
                  attempts,
                  durationMs: repairDurationMs,
                  roundsAdded: repairRoundsAdded,
                  toolsAdded: repairToolsAdded,
                }),
                reason: 'attempt_limit_reached',
                afterStatus: readabilityReview.status,
                afterReadabilityScore: readabilityReview.score,
                afterEngineScore: outAnalysis.score,
                repairStatusDelta: buildRepairStatusDelta(beforeRepairReview, readabilityReview),
              };
              break;
            }
          }

          const currentBestStatusRank = statusRank(readabilityReview.status);
          const savedBestStatusRank = statusRank(bestReadabilityReview.status);
          if (
            currentBestStatusRank < savedBestStatusRank ||
            (currentBestStatusRank === savedBestStatusRank && (readabilityReview.score ?? -1) < (bestReadabilityReview.score ?? -1))
          ) {
            outBuffer = bestReadabilityState.buffer;
            outAnalysis = bestReadabilityState.analysis;
            outSnapshot = bestReadabilityState.snapshot;
            readabilityReview = bestReadabilityReview;
            roundsOut = bestReadabilityState.roundsOut;
            appliedToolsOut = bestReadabilityState.appliedToolsOut;
            repairRoundsAdded = bestReadabilityState.repairRoundsAdded;
            repairToolsAdded = bestReadabilityState.repairToolsAdded;
            repairDurationMs = bestReadabilityState.repairDurationMs;
            if (readabilityAutoRepair) {
              readabilityAutoRepair.afterStatus = readabilityReview.status;
              readabilityAutoRepair.afterReadabilityScore = readabilityReview.score;
              readabilityAutoRepair.afterEngineScore = outAnalysis.score;
              readabilityAutoRepair.manualReviewRecommended = readabilityReview.manualReviewRecommended;
              readabilityAutoRepair.repairStatusDelta = buildRepairStatusDelta(baselineReadabilityReview, readabilityReview);
            }
          }

          readabilityAutoRepair ??= summarizeReadabilityAutoRepair('readability_issue_detected', {
            attempted: false,
            attempts: repairAttempt,
          });
        }
      }
    } else if (readabilityAutoRepairEnabled) {
      readabilityAutoRepair = summarizeReadabilityAutoRepair('review_not_requested', {
        attempted: false,
        attempts: 0,
      });
    }

    let reanalyzed: AnalysisResult | null = null;
    let reanalyzedSnapshot: DocumentSnapshot | null = null;
    let reanalyzedParity: ReturnType<typeof buildIcjiaParity> | null = null;
    let protectedReanalysisSelection: ProtectedReanalysisSelectionSummary | undefined;
    let analysisAfterMs: number | null = null;
    if (mode === 'full') {
      const finalReanalysisDecision = benchmarkFinalReanalysisDecision({
        startedAtMs: remediationStart,
        score: outAnalysis.score,
        verifiedCheckpointReturned: hasDeterministicEarlyExit(
          deterministicRuntimeSummaries[deterministicRuntimeSummaries.length - 1],
          'verified_checkpoint_timeout_return',
        ),
      });
      if (finalReanalysisDecision.skip) {
        runtimeTrace.mark(finalReanalysisDecision.reason === 'verified_checkpoint_timeout_return'
          ? 'verified_checkpoint_return_completed'
          : 'final_reanalysis_soft_stop');
        if (
          finalReanalysisDecision.reason &&
          !hasDeterministicEarlyExit(
            deterministicRuntimeSummaries[deterministicRuntimeSummaries.length - 1],
            finalReanalysisDecision.reason,
          )
        ) {
          addDeterministicEarlyExit(
            deterministicRuntimeSummaries[deterministicRuntimeSummaries.length - 1],
            finalReanalysisDecision.reason,
          );
        }
        reanalyzed = outAnalysis;
        reanalyzedSnapshot = outSnapshot;
        reanalyzedParity = buildIcjiaParity(outSnapshot);
        analysisAfterMs = 0;
      } else {
        runtimeTrace.mark('final_reanalysis_start');
        const finalAnalyze = await selectProtectedFinalReanalysis({
          buffer: outBuffer,
          filename: entry.filename,
          protectedBaseline,
          cache: protectedReanalysisCache,
          signal: remediationSignal,
        });
        runtimeTrace.mark('final_reanalysis_finish');
        reanalyzed = finalAnalyze.result;
        reanalyzedSnapshot = finalAnalyze.snapshot;
        reanalyzedParity = finalAnalyze.parity;
        protectedReanalysisSelection = finalAnalyze.selection;
        analysisAfterMs = finalAnalyze.result.analysisDurationMs;
      }
    }

    if (writePdfs) {
      await mkdir(join(runDir, 'pdfs'), { recursive: true });
      await writeFile(join(runDir, 'pdfs', `${entry.id}.pdf`), outBuffer);
    }

    const effectiveAfter = outAnalysis;
    const wallRemediateMs = performance.now() - remediationStart;
    const totalPipelineMs = performance.now() - totalStart;
    const remediationOutcomeSummary = buildRemediationOutcomeSummary({
      before: remediation.before,
      after: effectiveAfter,
      appliedTools: appliedToolsOut,
      planningSummary: remediation.planningSummary,
    });
    const semanticSummaries = [
      semantic,
      semanticHeadings,
      semanticPromoteHeadings,
      semanticUntaggedHeadings,
    ].filter((summary): summary is SemanticRemediationSummary => summary != null);
    const runtimeSummary = mergeRuntimeSummary(
      deterministicRuntimeSummaries,
      reanalyzed?.runtimeSummary ?? effectiveAfter.runtimeSummary,
      semanticSummaries,
    );

    return {
      id: entry.id,
      file: entry.file,
      cohort: entry.cohort,
      sourceType: entry.sourceType,
      intent: entry.intent,
      ...(entry.notes ? { notes: entry.notes } : {}),
      beforeScore: remediation.before.score,
      beforeGrade: remediation.before.grade,
      beforePdfClass: remediation.before.pdfClass,
      beforeCategories: remediation.before.categories,
      beforeVerificationLevel: remediation.before.verificationLevel ?? null,
      beforeManualReviewRequired: remediation.before.manualReviewRequired ?? false,
      beforeManualReviewReasons: remediation.before.manualReviewReasons ?? [],
      beforeScoreCapsApplied: remediation.before.scoreCapsApplied ?? [],
      beforeStructuralClassification: remediation.before.structuralClassification ?? null,
      beforeFailureProfile: remediation.before.failureProfile ?? null,
      beforeDetectionProfile: remediation.before.detectionProfile ?? null,
      beforeIcjiaParity: buildIcjiaParity(_snapshot),
      afterScore: effectiveAfter.score,
      afterGrade: effectiveAfter.grade,
      afterPdfClass: effectiveAfter.pdfClass,
      afterCategories: effectiveAfter.categories,
      afterVerificationLevel: effectiveAfter.verificationLevel ?? null,
      afterManualReviewRequired: effectiveAfter.manualReviewRequired ?? false,
      afterManualReviewReasons: effectiveAfter.manualReviewReasons ?? [],
      afterScoreCapsApplied: effectiveAfter.scoreCapsApplied ?? [],
      afterStructuralClassification: effectiveAfter.structuralClassification ?? null,
      afterFailureProfile: effectiveAfter.failureProfile ?? null,
      afterDetectionProfile: effectiveAfter.detectionProfile ?? null,
      afterIcjiaParity: buildIcjiaParity(outSnapshot),
      reanalyzedScore: reanalyzed?.score ?? null,
      reanalyzedGrade: reanalyzed?.grade ?? null,
      reanalyzedPdfClass: reanalyzed?.pdfClass ?? null,
      reanalyzedCategories: reanalyzed?.categories ?? [],
      reanalyzedVerificationLevel: reanalyzed?.verificationLevel ?? null,
      reanalyzedManualReviewRequired: reanalyzed?.manualReviewRequired ?? false,
      reanalyzedManualReviewReasons: reanalyzed?.manualReviewReasons ?? [],
      reanalyzedScoreCapsApplied: reanalyzed?.scoreCapsApplied ?? [],
      reanalyzedStructuralClassification: reanalyzed?.structuralClassification ?? null,
      reanalyzedFailureProfile: reanalyzed?.failureProfile ?? null,
      reanalyzedDetectionProfile: reanalyzed?.detectionProfile ?? null,
      reanalyzedIcjiaParity: reanalyzedSnapshot ? reanalyzedParity : null,
      ...(protectedReanalysisSelection ? { protectedReanalysisSelection } : {}),
      ...(protectedDebugStateCaptures.length > 0 ? { protectedDebugStateCaptures } : {}),
      ...(readabilityReview && readabilityReviewEnabled ? { readabilityReview } : {}),
      ...(readabilityReviewEnabled && readabilityReviewAttempts.length > 0
        ? { readabilityReviewAttempts }
        : {}),
      ...(readabilityAutoRepairEnabled && readabilityAutoRepair ? { readabilityAutoRepair } : {}),
      planningSummary: remediation.planningSummary ?? null,
      delta: effectiveAfter.score - remediation.before.score,
      appliedTools: appliedToolsOut,
      rounds: roundsOut,
      ...(remediation.ocrPipeline ? { ocrPipeline: remediation.ocrPipeline } : {}),
      ...(remediation.structuralConfidenceGuard
        ? { structuralConfidenceGuard: remediation.structuralConfidenceGuard }
        : {}),
      ...(remediationOutcomeSummary ? { remediationOutcomeSummary } : {}),
      ...(runtimeSummary ? { runtimeSummary } : {}),
      ...(semantic ? { semantic } : {}),
      ...(semanticHeadings ? { semanticHeadings } : {}),
      ...(semanticPromoteHeadings ? { semanticPromoteHeadings } : {}),
      ...(semanticUntaggedHeadings ? { semanticUntaggedHeadings } : {}),
      analysisBeforeMs: remediation.before.analysisDurationMs,
      remediationDurationMs:
        deterministicDurationMs +
        (semantic?.durationMs ?? 0) +
        (semanticHeadings?.durationMs ?? 0) +
        (semanticPromoteHeadings?.durationMs ?? 0) +
        (semanticUntaggedHeadings?.durationMs ?? 0) +
        readabilityReviewAttempts.reduce((sum, review) => sum + review.durationMs, 0),
      wallRemediateMs,
      analysisAfterMs,
      totalPipelineMs,
    };
  } catch (error) {
    await writeRuntimeTimeoutTraceArtifact(runDir, runtimeTrace.snapshot(error));
    throw error;
  } finally {
    db.close();
  }
}

async function validateManifest(manifestPath: string): Promise<void> {
  const entries = await loadExperimentCorpusManifest(manifestPath, { checkFiles: true });
  console.log(`Manifest OK: ${entries.length} entries in ${manifestPath}`);
}

async function validateRun(runDir: string, validateVisual: boolean): Promise<void> {
  const base = resolve(runDir);
  const manifest = JSON.parse(await readFile(join(base, 'manifest.snapshot.json'), 'utf8')) as BenchmarkArtifactBundle['manifest'];
  const analyzeResults = JSON.parse(await readFile(join(base, 'analyze.results.json'), 'utf8')) as AnalyzeBenchmarkRow[];
  const remediateResults = JSON.parse(await readFile(join(base, 'remediate.results.json'), 'utf8')) as RemediateBenchmarkRow[];
  const summary = JSON.parse(await readFile(join(base, 'summary.json'), 'utf8')) as BenchmarkArtifactBundle['summary'];
  const validation = validateBenchmarkArtifacts({ manifest, analyzeResults, remediateResults, summary });
  if (!validation.ok) {
    throw new Error(`Run validation failed:\n- ${validation.errors.join('\n- ')}`);
  }
  if (validateVisual) {
    if (!manifest.writePdfs) {
      throw new Error('Visual validation requested, but the run snapshot does not include writePdfs=true.');
    }
    const report = await compareVisualStabilityRun({ runDir: base, strict: true });
    if (report.driftCount > 0 || report.missingCount > 0) {
      throw new Error(`Visual validation failed:\n- drift rows: ${report.driftCount}\n- missing rows: ${report.missingCount}`);
    }
    await writeVisualStabilityRunReport(report, join(base, 'visual-stability-validation'));
  }
  console.log(`Run OK: ${base}`);
}

function filterEntries(
  entries: ExperimentCorpusEntry[],
  cohorts: string[],
  sourceTypes: string[],
  fileIds: string[],
): ExperimentCorpusEntry[] {
  const cohortSet = new Set(cohorts);
  const sourceTypeSet = new Set(sourceTypes);
  const fileIdSet = new Set(fileIds);
  return entries.filter(entry => {
    if (cohortSet.size > 0 && !cohortSet.has(entry.cohort)) return false;
    if (sourceTypeSet.size > 0 && !sourceTypeSet.has(entry.sourceType)) return false;
    if (fileIdSet.size > 0 && !fileIdSet.has(entry.id)) return false;
    return true;
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const defaults = defaultExperimentCorpusPaths();
  const manifestPath = args.manifestPath ?? defaults.manifestPath;
  const corpusRoot = dirname(manifestPath);

  if (args.validateManifestOnly) {
    await validateManifest(manifestPath);
    return;
  }
  if (args.validateRunDir) {
    await validateRun(args.validateRunDir, args.validateVisual);
    return;
  }

  const entries = await loadExperimentCorpusManifest(manifestPath, { checkFiles: true });
  const selectedEntries = filterEntries(entries, args.cohorts, args.sourceTypes, args.fileIds);
  if (selectedEntries.length === 0) {
    throw new Error('No manifest entries matched the requested cohort/file filters.');
  }

  if (args.semanticEnabled) {
    await startEmbeddedLlmIfEnabled();
  }
  const protectedBaselineRows = await loadProtectedBaselineRows(args.protectedBaselineRunDir);

  const runId = makeRunId();
  const outRoot = args.outDir
    ? resolve(args.outDir)
    : join(process.cwd(), 'Output', 'experiment-corpus-baseline');
  const runDir = args.outDir && /run-/.test(args.outDir)
    ? resolve(args.outDir)
    : join(outRoot, runId);
  const generatedAt = new Date().toISOString();

  const analyzeRows: AnalyzeBenchmarkRow[] = [];
  const remediateRows: RemediateBenchmarkRow[] = [];
  const protectedReanalysisCache = new Map<string, Promise<SelectedReanalysis>>();

  try {
    for (const entry of selectedEntries) {
      process.stdout.write(`[${entry.id}] ${entry.filename} ... `);
      try {
        const analyze = await runAnalyzeStep(entry);
        analyzeRows.push(analyze.row);

        if (args.mode === 'analyze') {
          console.log(`analyzed ${analyze.result.score}/${analyze.result.grade}`);
          continue;
        }

        const remediateRow = await runRemediationStep(
          entry,
          analyze.result,
          analyze.snapshot,
          args.semanticEnabled,
          args.readabilityReviewEnabled,
          args.readabilityAutoRepairEnabled,
          args.readabilityReviewTimeoutMs,
          args.readabilityAutoRepairMaxAttempts,
          args.readabilityAutoRepairTimeoutMs,
          args.mode,
          args.writePdfs,
          args.writeProtectedDebugStates,
          runDir,
          protectedReanalysisCache,
          protectedBaselineRows.get(entry.id),
        );
        remediateRows.push(remediateRow);
        console.log(
          `remediated ${remediateRow.beforeScore}/${remediateRow.beforeGrade} -> ${remediateRow.afterScore}/${remediateRow.afterGrade}`,
        );
      } catch (error) {
        console.log(`error: ${sanitizeError(error)}`);
        analyzeRows.push(makeAnalyzeErrorRow(entry, error));
        if (args.mode !== 'analyze') {
          remediateRows.push({
            id: entry.id,
            file: entry.file,
            cohort: entry.cohort,
            sourceType: entry.sourceType,
            intent: entry.intent,
            ...(entry.notes ? { notes: entry.notes } : {}),
            beforeScore: null,
            beforeGrade: null,
            beforePdfClass: null,
            beforeCategories: [],
            beforeVerificationLevel: null,
            beforeManualReviewRequired: null,
            beforeManualReviewReasons: [],
            beforeScoreCapsApplied: [],
            beforeStructuralClassification: null,
            beforeFailureProfile: null,
            afterScore: null,
            afterGrade: null,
            afterPdfClass: null,
            afterCategories: [],
            afterVerificationLevel: null,
            afterManualReviewRequired: null,
            afterManualReviewReasons: [],
            afterScoreCapsApplied: [],
            afterStructuralClassification: null,
            afterFailureProfile: null,
            reanalyzedScore: null,
            reanalyzedGrade: null,
            reanalyzedPdfClass: null,
            reanalyzedCategories: [],
            reanalyzedVerificationLevel: null,
            reanalyzedManualReviewRequired: null,
            reanalyzedManualReviewReasons: [],
            reanalyzedScoreCapsApplied: [],
            reanalyzedStructuralClassification: null,
            reanalyzedFailureProfile: null,
            delta: null,
            appliedTools: [],
            rounds: [],
            analysisBeforeMs: null,
            remediationDurationMs: null,
            wallRemediateMs: null,
            analysisAfterMs: null,
            totalPipelineMs: null,
            error: sanitizeError(error),
          });
        }
      }
    }

    const manifest = makeManifestSnapshot({
      runId,
      generatedAt,
      manifestPath,
      corpusRoot,
      mode: args.mode,
      semanticEnabled: args.semanticEnabled,
      readabilityReviewEnabled: args.readabilityReviewEnabled,
      readabilityAutoRepairEnabled: args.readabilityAutoRepairEnabled,
      readabilityReviewTimeoutMs: args.readabilityReviewTimeoutMs,
      readabilityAutoRepairMaxAttempts: args.readabilityAutoRepairMaxAttempts,
      readabilityAutoRepairTimeoutMs: args.readabilityAutoRepairTimeoutMs,
      writePdfs: args.writePdfs,
      selectedEntries,
    });
    const summary = buildBenchmarkSummary({
      runId,
      generatedAt,
      mode: args.mode,
      semanticEnabled: args.semanticEnabled,
      writePdfs: args.writePdfs,
      selectedFileIds: selectedEntries.map(entry => entry.id),
      manifestEntries: entries.length,
      analyzeRows,
      remediateRows,
    });
    const summaryMarkdown = renderBenchmarkSummaryMarkdown(summary);
    const bundle: BenchmarkArtifactBundle = {
      manifest,
      analyzeResults: analyzeRows,
      remediateResults: remediateRows,
      summary,
    };
    const validation = validateBenchmarkArtifacts(bundle);
    if (!validation.ok) {
      throw new Error(`Benchmark artifact validation failed:\n- ${validation.errors.join('\n- ')}`);
    }

    await mkdir(runDir, { recursive: true });
    await writeJson(join(runDir, 'manifest.snapshot.json'), manifest);
    await writeJson(join(runDir, 'analyze.results.json'), analyzeRows);
    await writeJson(join(runDir, 'remediate.results.json'), remediateRows);
    await writeJson(join(runDir, 'summary.json'), summary);
    await writeFile(join(runDir, 'summary.md'), summaryMarkdown, 'utf8');

    console.log(`Wrote benchmark run to ${runDir}`);
  } finally {
    stopEmbeddedLlm();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

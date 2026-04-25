#!/usr/bin/env tsx
import 'dotenv/config';

import Database from 'better-sqlite3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
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
} from '../src/services/remediation/orchestrator.js';
import { buildRemediationOutcomeSummary } from '../src/services/remediation/outcomeSummary.js';
import { applySemanticHeadingRepairs } from '../src/services/semantic/headingSemantic.js';
import { buildSemanticGateSummary, buildSemanticSummary, enforceSemanticTrust } from '../src/services/semantic/semanticPolicy.js';
import { applySemanticPromoteHeadingRepairs } from '../src/services/semantic/promoteHeadingSemantic.js';
import { applySemanticRepairs } from '../src/services/semantic/semanticService.js';
import { applySemanticUntaggedHeadingRepairs } from '../src/services/semantic/untaggedHeadingSemantic.js';
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
import type {
  AnalysisResult,
  DocumentSnapshot,
  RemediationRuntimeSummary,
  RuntimeCountRow,
  SemanticRemediationSummary,
} from '../src/types.js';

type BenchmarkMode = 'analyze' | 'remediate' | 'full';

interface ParsedArgs {
  mode: BenchmarkMode;
  outDir?: string;
  manifestPath?: string;
  cohorts: string[];
  fileIds: string[];
  semanticEnabled: boolean;
  writePdfs: boolean;
  validateManifestOnly: boolean;
  validateRunDir?: string;
  protectedBaselineRunDir?: string;
}

interface ProtectedBaselineRow {
  score: number;
  scoreCapsApplied: AnalysisResult['scoreCapsApplied'];
  categories: Record<string, number>;
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

function runtimeCounts(values: string[]): RuntimeCountRow[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function mergeRuntimeSummary(
  deterministic: RemediationRuntimeSummary | undefined,
  afterRuntime: AnalysisResult['runtimeSummary'] | undefined,
  semanticSummaries: SemanticRemediationSummary[],
): RemediationRuntimeSummary | undefined {
  if (!deterministic && semanticSummaries.length === 0 && !afterRuntime) return undefined;
  return {
    analysisBefore: deterministic?.analysisBefore ?? null,
    analysisAfter: afterRuntime ?? null,
    deterministicTotalMs: deterministic?.deterministicTotalMs ?? 0,
    stageTimings: deterministic?.stageTimings ?? [],
    toolTimings: deterministic?.toolTimings ?? [],
    semanticLaneTimings: semanticSummaries.flatMap(summary => summary.runtime ? [summary.runtime] : []),
    boundedWork: {
      semanticCandidateCapsHit: semanticSummaries.filter(summary => summary.runtime?.candidateCapHit).length,
      deterministicEarlyExitCount: deterministic?.boundedWork.deterministicEarlyExitCount ?? 0,
      deterministicEarlyExitReasons: deterministic?.boundedWork.deterministicEarlyExitReasons ?? [],
      semanticSkipReasons: runtimeCounts(semanticSummaries.map(summary => `${summary.lane}:${summary.skippedReason}`)),
    },
  };
}

function printUsage(): void {
  console.log(`Usage:
  pnpm exec tsx scripts/experiment-corpus-benchmark.ts [options]

Options:
  --mode analyze|remediate|full   Benchmark mode (default: full)
  --out <dir>                     Output directory root or explicit run directory
  --manifest <path>               Alternate experiment corpus manifest path
  --cohort <name>                 Restrict to a cohort (repeatable)
  --file <id>                     Restrict to one manifest id (repeatable)
  --semantic                      Enable semantic passes
  --no-semantic                   Disable semantic passes (default)
  --write-pdfs                    Write remediated PDFs into the run directory
  --protected-baseline-run <dir>   Internal benchmark-only protected row floor baseline
  --validate-manifest             Validate Input/experiment-corpus/manifest.json and exit
  --validate-run <dir>            Validate an existing benchmark run directory and exit
  --help                          Show this help`);
}

function parseArgs(argv: string[]): ParsedArgs {
  let mode: BenchmarkMode = 'full';
  let outDir: string | undefined;
  let manifestPath: string | undefined;
  const cohorts: string[] = [];
  const fileIds: string[] = [];
  let semanticEnabled = false;
  let writePdfs = false;
  let validateManifestOnly = false;
  let validateRunDir: string | undefined;
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
      case '--semantic':
        semanticEnabled = true;
        break;
      case '--no-semantic':
        semanticEnabled = false;
        break;
      case '--write-pdfs':
        writePdfs = true;
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
    fileIds,
    semanticEnabled,
    writePdfs,
    validateManifestOnly,
    validateRunDir,
    protectedBaselineRunDir,
  };
}

function makeRunId(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return `run-${iso}`;
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
): Promise<{ result: AnalysisResult; snapshot: DocumentSnapshot; wallMs: number }> {
  const tempPath = join(tmpdir(), `pdfaf-experiment-corpus-${randomUUID()}.pdf`);
  await writeFile(tempPath, buffer);
  const wallStart = performance.now();
  try {
    const analyzed = await analyzePdf(tempPath, filename, { bypassCache: true });
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
      const analyzed = await reanalyzeBuffer(input.buffer, input.filename);
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
  const signal = AbortSignal.timeout(600_000);

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
      options: { timeoutMs: 600_000, signal },
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
      options: { timeoutMs: 600_000, signal },
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
    options: { timeoutMs: 600_000, signal },
  });
  currentBuffer = heading.buffer;
  currentAnalysis = heading.analysis;
  currentSnapshot = heading.snapshot;

  const untagged = await applySemanticUntaggedHeadingRepairs({
    buffer: currentBuffer,
    filename: input.entry.filename,
    analysis: currentAnalysis,
    snapshot: currentSnapshot,
    options: { timeoutMs: 600_000, signal },
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
      { signal },
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
  snapshot: DocumentSnapshot,
  semanticEnabled: boolean,
  mode: BenchmarkMode,
  writePdfs: boolean,
  runDir: string,
  protectedReanalysisCache: Map<string, Promise<SelectedReanalysis>>,
  protectedBaseline?: ProtectedBaselineRow,
): Promise<RemediateBenchmarkRow> {
  const buffer = await readFile(entry.absolutePath);
  const totalStart = performance.now();
  const remediationStart = performance.now();
  const db = new Database(':memory:');
  initSchema(db);

  try {
    const playbookStore = createPlaybookStore(db);
    const toolOutcomeStore = createToolOutcomeStore(db);

    const { remediation, buffer: detBuffer, snapshot: detSnapshot } = await remediatePdf(
      buffer,
      entry.filename,
      before,
      snapshot,
      {
        maxRounds: 10,
        playbookStore,
        toolOutcomeStore,
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

    let finalBuffer = detBuffer;
    let finalAnalysis = remediation.after;
    let finalSnapshot = detSnapshot;
    let semantic: SemanticRemediationSummary | undefined;
    let semanticHeadings: SemanticRemediationSummary | undefined;
    let semanticPromoteHeadings: SemanticRemediationSummary | undefined;
    let semanticUntaggedHeadings: SemanticRemediationSummary | undefined;

    if (semanticEnabled) {
      const semanticRun = await runSemanticSequence({
        entry,
        buffer: finalBuffer,
        analysis: finalAnalysis,
        snapshot: finalSnapshot,
      });
      finalBuffer = semanticRun.buffer;
      finalAnalysis = semanticRun.analysis;
      finalSnapshot = semanticRun.snapshot;
      semantic = semanticRun.semantic;
      semanticHeadings = semanticRun.semanticHeadings;
      semanticPromoteHeadings = semanticRun.semanticPromoteHeadings;
      semanticUntaggedHeadings = semanticRun.semanticUntaggedHeadings;
    }

    let reanalyzed: AnalysisResult | null = null;
    let reanalyzedSnapshot: DocumentSnapshot | null = null;
    let reanalyzedParity: ReturnType<typeof buildIcjiaParity> | null = null;
    let protectedReanalysisSelection: ProtectedReanalysisSelectionSummary | undefined;
    let analysisAfterMs: number | null = null;
    if (mode === 'full') {
      const finalAnalyze = await selectProtectedFinalReanalysis({
        buffer: finalBuffer,
        filename: entry.filename,
        protectedBaseline,
        cache: protectedReanalysisCache,
      });
      reanalyzed = finalAnalyze.result;
      reanalyzedSnapshot = finalAnalyze.snapshot;
      reanalyzedParity = finalAnalyze.parity;
      protectedReanalysisSelection = finalAnalyze.selection;
      analysisAfterMs = finalAnalyze.result.analysisDurationMs;
    }

    if (writePdfs) {
      await mkdir(join(runDir, 'pdfs'), { recursive: true });
      await writeFile(join(runDir, 'pdfs', `${entry.id}.pdf`), finalBuffer);
    }

    const effectiveAfter = finalAnalysis;
    const wallRemediateMs = performance.now() - remediationStart;
    const totalPipelineMs = performance.now() - totalStart;
    const remediationOutcomeSummary = buildRemediationOutcomeSummary({
      before: remediation.before,
      after: effectiveAfter,
      appliedTools: remediation.appliedTools,
      planningSummary: remediation.planningSummary,
    });
    const semanticSummaries = [
      semantic,
      semanticHeadings,
      semanticPromoteHeadings,
      semanticUntaggedHeadings,
    ].filter((summary): summary is SemanticRemediationSummary => summary != null);
    const runtimeSummary = mergeRuntimeSummary(
      remediation.runtimeSummary,
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
      beforeIcjiaParity: buildIcjiaParity(snapshot),
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
      afterIcjiaParity: buildIcjiaParity(finalSnapshot),
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
      planningSummary: remediation.planningSummary ?? null,
      delta: effectiveAfter.score - remediation.before.score,
      appliedTools: remediation.appliedTools,
      rounds: remediation.rounds,
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
        remediation.remediationDurationMs +
        (semantic?.durationMs ?? 0) +
        (semanticHeadings?.durationMs ?? 0) +
        (semanticPromoteHeadings?.durationMs ?? 0) +
        (semanticUntaggedHeadings?.durationMs ?? 0),
      wallRemediateMs,
      analysisAfterMs,
      totalPipelineMs,
    };
  } finally {
    db.close();
  }
}

async function validateManifest(manifestPath: string): Promise<void> {
  const entries = await loadExperimentCorpusManifest(manifestPath, { checkFiles: true });
  console.log(`Manifest OK: ${entries.length} entries in ${manifestPath}`);
}

async function validateRun(runDir: string): Promise<void> {
  const base = resolve(runDir);
  const manifest = JSON.parse(await readFile(join(base, 'manifest.snapshot.json'), 'utf8')) as BenchmarkArtifactBundle['manifest'];
  const analyzeResults = JSON.parse(await readFile(join(base, 'analyze.results.json'), 'utf8')) as AnalyzeBenchmarkRow[];
  const remediateResults = JSON.parse(await readFile(join(base, 'remediate.results.json'), 'utf8')) as RemediateBenchmarkRow[];
  const summary = JSON.parse(await readFile(join(base, 'summary.json'), 'utf8')) as BenchmarkArtifactBundle['summary'];
  const validation = validateBenchmarkArtifacts({ manifest, analyzeResults, remediateResults, summary });
  if (!validation.ok) {
    throw new Error(`Run validation failed:\n- ${validation.errors.join('\n- ')}`);
  }
  console.log(`Run OK: ${base}`);
}

function filterEntries(
  entries: ExperimentCorpusEntry[],
  cohorts: string[],
  fileIds: string[],
): ExperimentCorpusEntry[] {
  const cohortSet = new Set(cohorts);
  const fileIdSet = new Set(fileIds);
  return entries.filter(entry => {
    if (cohortSet.size > 0 && !cohortSet.has(entry.cohort)) return false;
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
    await validateRun(args.validateRunDir);
    return;
  }

  const entries = await loadExperimentCorpusManifest(manifestPath, { checkFiles: true });
  const selectedEntries = filterEntries(entries, args.cohorts, args.fileIds);
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
          args.mode,
          args.writePdfs,
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

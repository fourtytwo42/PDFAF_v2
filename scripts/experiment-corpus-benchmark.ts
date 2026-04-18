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
import { mergeSequentialSemanticSummaries } from '../src/routes/remediate.js';
import {
  applyPostRemediationAltRepair,
  remediatePdf,
} from '../src/services/remediation/orchestrator.js';
import { applySemanticHeadingRepairs } from '../src/services/semantic/headingSemantic.js';
import { applySemanticPromoteHeadingRepairs } from '../src/services/semantic/promoteHeadingSemantic.js';
import { applySemanticRepairs } from '../src/services/semantic/semanticService.js';
import { applySemanticUntaggedHeadingRepairs } from '../src/services/semantic/untaggedHeadingSemantic.js';
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
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type {
  AnalysisResult,
  DocumentSnapshot,
  SemanticRemediationSummary,
} from '../src/types.js';

type BenchmarkMode = 'analyze' | 'remediate' | 'full';

interface ParsedArgs {
  mode: BenchmarkMode;
  outDir?: string;
  cohorts: string[];
  fileIds: string[];
  semanticEnabled: boolean;
  writePdfs: boolean;
  validateManifestOnly: boolean;
  validateRunDir?: string;
}

function printUsage(): void {
  console.log(`Usage:
  pnpm exec tsx scripts/experiment-corpus-benchmark.ts [options]

Options:
  --mode analyze|remediate|full   Benchmark mode (default: full)
  --out <dir>                     Output directory root or explicit run directory
  --cohort <name>                 Restrict to a cohort (repeatable)
  --file <id>                     Restrict to one manifest id (repeatable)
  --semantic                      Enable semantic passes
  --no-semantic                   Disable semantic passes (default)
  --write-pdfs                    Write remediated PDFs into the run directory
  --validate-manifest             Validate Input/experiment-corpus/manifest.json and exit
  --validate-run <dir>            Validate an existing benchmark run directory and exit
  --help                          Show this help`);
}

function parseArgs(argv: string[]): ParsedArgs {
  let mode: BenchmarkMode = 'full';
  let outDir: string | undefined;
  const cohorts: string[] = [];
  const fileIds: string[] = [];
  let semanticEnabled = false;
  let writePdfs = false;
  let validateManifestOnly = false;
  let validateRunDir: string | undefined;

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
    cohorts,
    fileIds,
    semanticEnabled,
    writePdfs,
    validateManifestOnly,
    validateRunDir,
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

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeAnalyzeRow(
  entry: ExperimentCorpusEntry,
  result: AnalysisResult,
  wallAnalyzeMs: number,
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

  const emptySummary = (score: number, skippedReason: SemanticRemediationSummary['skippedReason']): SemanticRemediationSummary => ({
    skippedReason,
    durationMs: 0,
    proposalsAccepted: 0,
    proposalsRejected: 0,
    scoreBefore: score,
    scoreAfter: score,
    batches: [],
  });

  if (!getOpenAiCompatBaseUrl()) {
    const noLlm = emptySummary(currentAnalysis.score, 'no_llm_config');
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      semantic: noLlm,
      semanticHeadings: noLlm,
      semanticPromoteHeadings: noLlm,
      semanticUntaggedHeadings: noLlm,
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
    row: makeAnalyzeRow(entry, analyzed.result, wallAnalyzeMs),
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
    let analysisAfterMs: number | null = null;
    if (mode === 'full') {
      const finalAnalyze = await reanalyzeBuffer(finalBuffer, entry.filename);
      reanalyzed = finalAnalyze.result;
      analysisAfterMs = finalAnalyze.result.analysisDurationMs;
    }

    if (writePdfs) {
      await mkdir(join(runDir, 'pdfs'), { recursive: true });
      await writeFile(join(runDir, 'pdfs', `${entry.id}.pdf`), finalBuffer);
    }

    const effectiveAfter = finalAnalysis;
    const wallRemediateMs = performance.now() - remediationStart;
    const totalPipelineMs = performance.now() - totalStart;

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
      delta: effectiveAfter.score - remediation.before.score,
      appliedTools: remediation.appliedTools,
      rounds: remediation.rounds,
      ...(remediation.ocrPipeline ? { ocrPipeline: remediation.ocrPipeline } : {}),
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
  const { manifestPath, corpusRoot } = defaultExperimentCorpusPaths();

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

  for (const entry of selectedEntries) {
    process.stdout.write(`[${entry.id}] ${entry.filename} ... `);
    try {
      const analyze = await runAnalyzeStep(entry);
      analyzeRows.push(analyze.row);

      if (args.mode === 'analyze') {
        console.log(`analyzed ${analyze.result.score}/${analyze.result.grade}`);
        continue;
      }

      let remediateRow = await runRemediationStep(
        entry,
        analyze.result,
        analyze.snapshot,
        args.semanticEnabled,
        args.mode,
        args.writePdfs,
        runDir,
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
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  categoryScoreMap,
  classifyBatchEquivalence,
  extractSnapshotSignals,
  type BatchEquivalencePathResult,
  type BatchEquivalenceResult,
} from '../src/services/remediation/batchEquivalenceDiagnostics.js';
import {
  buildDefaultParams,
  planForRemediation,
} from '../src/services/remediation/planner.js';
import {
  runSingleTool,
  runStage39Batch,
  selectStage39Batch,
} from '../src/services/remediation/orchestrator.js';
import { analyzePdf, type AnalyzePdfOutcome } from '../src/services/pdfAnalyzer.js';
import {
  defaultExperimentCorpusPaths,
  loadExperimentCorpusManifest,
  type ExperimentCorpusEntry,
} from '../src/services/benchmark/experimentCorpus.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  DocumentSnapshot,
  PlannedRemediationTool,
  RemediationStagePlan,
} from '../src/types.js';

const DEFAULT_TARGET_IDS = [
  'fixture-teams-targeted-wave1',
  'figure-4755',
  'long-4606',
  'structure-4076',
  'structure-4438',
  'short-4101',
  'figure-4188',
  'figure-4754',
];

interface ParsedArgs {
  outDir: string;
  manifestPath: string;
  fileIds: string[];
  bundles: Set<string> | null;
}

interface Checkpoint {
  buffer: Buffer;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  stage: RemediationStagePlan;
  stageIndex: number;
  toolIndex: number;
  tools: PlannedRemediationTool[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const defaults = defaultExperimentCorpusPaths();
  let outDir = join('Output', 'experiment-corpus-baseline', `run-stage39.5-batch-equivalence-${new Date().toISOString().slice(0, 10)}-r1`);
  let manifestPath = defaults.manifestPath;
  const fileIds: string[] = [];
  const bundles = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      const value = argv[++i];
      if (!value) throw new Error('Missing --out value.');
      outDir = value;
    } else if (arg === '--manifest') {
      const value = argv[++i];
      if (!value) throw new Error('Missing --manifest value.');
      manifestPath = value;
    } else if (arg === '--file') {
      const value = argv[++i];
      if (!value) throw new Error('Missing --file value.');
      fileIds.push(value);
    } else if (arg === '--bundle') {
      const value = argv[++i];
      if (!value) throw new Error('Missing --bundle value.');
      bundles.add(value);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  pnpm exec tsx scripts/stage39-batch-equivalence.ts [options]

Options:
  --out <dir>          Output directory for JSON/Markdown diagnostics
  --manifest <path>    Alternate experiment corpus manifest
  --file <id>          Restrict to one file id; repeatable
  --bundle <role>      Restrict to a batch role; repeatable
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    outDir,
    manifestPath,
    fileIds: fileIds.length > 0 ? fileIds : DEFAULT_TARGET_IDS,
    bundles: bundles.size > 0 ? bundles : null,
  };
}

async function analyzeBuffer(buffer: Buffer, filename: string, prefix: string): Promise<AnalyzePdfOutcome> {
  const path = join(tmpdir(), `${prefix}-${randomUUID()}.pdf`);
  await writeFile(path, buffer);
  try {
    return await analyzePdf(path, filename, { bypassCache: true });
  } finally {
    await unlink(path).catch(() => {});
  }
}

function plannedWithLiveParams(
  tool: PlannedRemediationTool,
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[] = [],
): PlannedRemediationTool {
  return {
    ...tool,
    params: {
      ...buildDefaultParams(tool.toolName, analysis, snapshot, alreadyApplied),
      ...tool.params,
    },
  };
}

async function applySequentialTools(
  buffer: Buffer,
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  filename: string,
  tools: PlannedRemediationTool[],
): Promise<{ buffer: Buffer; rows: BatchEquivalencePathResult['opRows'] }> {
  let current = buffer;
  const rows: BatchEquivalencePathResult['opRows'] = [];
  for (const tool of tools) {
    const result = await runSingleTool(current, tool, snapshot);
    current = result.buffer;
    rows.push({
      toolName: tool.toolName,
      outcome: result.outcome,
      details: result.details,
    });
  }
  return { buffer: current, rows };
}

async function buildCheckpoint(
  originalBuffer: Buffer,
  initial: AnalyzePdfOutcome,
  filename: string,
  targetStageIndex: number,
  targetToolIndex: number,
): Promise<Checkpoint | null> {
  let buffer = originalBuffer;
  let analysis = initial.result;
  let snapshot = initial.snapshot;
  const applied: AppliedRemediationTool[] = [];

  const plan = planForRemediation(analysis, snapshot, []);
  for (let stageIndex = 0; stageIndex < plan.stages.length; stageIndex++) {
    const stage = plan.stages[stageIndex]!;
    if (stageIndex > targetStageIndex) break;
    const stageStartBuffer = buffer;
    const stageTools = stage.tools.map(tool => plannedWithLiveParams(tool, analysis, snapshot, applied));
    const limit = stageIndex === targetStageIndex ? targetToolIndex : stageTools.length;

    for (let toolIndex = 0; toolIndex < limit; toolIndex++) {
      const tool = stageTools[toolIndex]!;
      const result = await runSingleTool(buffer, tool, snapshot);
      buffer = result.buffer;
      applied.push({
        toolName: tool.toolName,
        stage: stage.stageNumber,
        round: 1,
        scoreBefore: analysis.score,
        scoreAfter: analysis.score,
        delta: 0,
        outcome: result.outcome,
        details: result.details,
      });
    }

    if (stageIndex === targetStageIndex) {
      return {
        buffer,
        analysis,
        snapshot,
        stage,
        stageIndex,
        toolIndex: targetToolIndex,
        tools: stageTools,
      };
    }

    if (!buffer.equals(stageStartBuffer)) {
      const analyzed = await analyzeBuffer(buffer, filename, 'pdfaf-stage39-checkpoint');
      analysis = analyzed.result;
      snapshot = analyzed.snapshot;
    }
  }
  return null;
}

function pathResult(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  opRows: BatchEquivalencePathResult['opRows'],
): BatchEquivalencePathResult {
  const nextPlan = planForRemediation(analysis, snapshot, []);
  return {
    score: analysis.score,
    categories: categoryScoreMap(analysis),
    manualReviewReasons: analysis.manualReviewReasons ?? [],
    scoreCaps: (analysis.scoreCapsApplied ?? []).map(cap => `${cap.category}:${cap.reason}`),
    structuralConfidence: analysis.structuralClassification?.confidence ?? null,
    opRows,
    snapshotSignals: extractSnapshotSignals(snapshot),
    nextScheduledTools: nextPlan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName)),
  };
}

async function evaluateCandidate(
  entry: ExperimentCorpusEntry,
  originalBuffer: Buffer,
  initial: AnalyzePdfOutcome,
  stageIndex: number,
  toolIndex: number,
): Promise<BatchEquivalenceResult | null> {
  const checkpoint = await buildCheckpoint(originalBuffer, initial, entry.filename, stageIndex, toolIndex);
  if (!checkpoint) return null;
  const batch = selectStage39Batch(checkpoint.tools, checkpoint.toolIndex, { enabled: true });
  if (!batch) return null;
  const batchTools = batch.tools.map(tool => plannedWithLiveParams(tool, checkpoint.analysis, checkpoint.snapshot));

  const sequential = await applySequentialTools(
    checkpoint.buffer,
    checkpoint.analysis,
    checkpoint.snapshot,
    entry.filename,
    batchTools,
  );
  const sequentialAnalyzed = await analyzeBuffer(sequential.buffer, entry.filename, 'pdfaf-stage39-seq');

  const batchResult = await runStage39Batch(checkpoint.buffer, { role: batch.role, tools: batchTools });
  const batchAnalyzed = await analyzeBuffer(batchResult.buffer, entry.filename, 'pdfaf-stage39-batch');

  return classifyBatchEquivalence({
    fileId: entry.id,
    file: entry.file,
    bundleRole: batch.role,
    tools: batchTools,
    sequential: pathResult(sequentialAnalyzed.result, sequentialAnalyzed.snapshot, sequential.rows),
    batch: pathResult(
      batchAnalyzed.result,
      batchAnalyzed.snapshot,
      batchResult.rows.map(row => ({
        toolName: row.tool.toolName,
        outcome: row.outcome,
        details: row.details,
      })),
    ),
  });
}

async function runEntry(entry: ExperimentCorpusEntry, bundles: Set<string> | null): Promise<BatchEquivalenceResult[]> {
  const originalBuffer = await readFile(entry.absolutePath);
  const initial = await analyzePdf(entry.absolutePath, entry.filename, { bypassCache: true });
  const plan = planForRemediation(initial.result, initial.snapshot, []);
  const results: BatchEquivalenceResult[] = [];

  for (let stageIndex = 0; stageIndex < plan.stages.length; stageIndex++) {
    const stage = plan.stages[stageIndex]!;
    for (let toolIndex = 0; toolIndex < stage.tools.length; toolIndex++) {
      const candidate = selectStage39Batch(stage.tools, toolIndex, { enabled: true });
      if (!candidate) continue;
      if (bundles && !bundles.has(candidate.role)) continue;
      const result = await evaluateCandidate(entry, originalBuffer, initial, stageIndex, toolIndex);
      if (result) results.push(result);
      toolIndex += candidate.tools.length - 1;
    }
  }
  return results;
}

function renderMarkdown(results: BatchEquivalenceResult[]): string {
  const lines = ['# Stage 39.5 Batch Equivalence Diagnostic', ''];
  const counts = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.classification] = (acc[result.classification] ?? 0) + 1;
    return acc;
  }, {});
  lines.push(`Total candidates: ${results.length}`);
  lines.push(`Safe: ${counts['safe'] ?? 0}`);
  lines.push(`Unsafe: ${counts['unsafe'] ?? 0}`);
  lines.push(`Inconclusive: ${counts['inconclusive'] ?? 0}`);
  lines.push('');
  lines.push('| File | Bundle | Classification | Seq Score | Batch Score | Reasons |');
  lines.push('|---|---|---:|---:|---:|---|');
  for (const result of results) {
    lines.push([
      result.fileId,
      result.bundleRole,
      result.classification,
      String(result.sequential.score),
      String(result.batch.score),
      result.reasons.join(', ') || '-',
    ].join(' | '));
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const entries = await loadExperimentCorpusManifest(args.manifestPath, { checkFiles: true });
  const selected = entries.filter(entry => args.fileIds.includes(entry.id));
  const missing = args.fileIds.filter(id => !selected.some(entry => entry.id === id));
  if (missing.length > 0) throw new Error(`Unknown file id(s): ${missing.join(', ')}`);

  await mkdir(args.outDir, { recursive: true });
  const results: BatchEquivalenceResult[] = [];
  for (const entry of selected) {
    console.log(`[${entry.id}] evaluating batch equivalence...`);
    const entryResults = await runEntry(entry, args.bundles);
    results.push(...entryResults);
    for (const result of entryResults) {
      console.log(`  ${result.bundleRole}: ${result.classification} seq=${result.sequential.score} batch=${result.batch.score} reasons=${result.reasons.join(',') || '-'}`);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    selectedFileIds: selected.map(entry => entry.id),
    results,
  };
  await writeFile(join(args.outDir, 'batch-equivalence.results.json'), JSON.stringify(payload, null, 2));
  await writeFile(join(args.outDir, 'batch-equivalence.summary.md'), renderMarkdown(results));
  console.log(`Wrote batch equivalence diagnostics to ${args.outDir}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

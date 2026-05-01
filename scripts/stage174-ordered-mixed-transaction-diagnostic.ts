#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../src/types.js';
import {
  stage174BuildMixedTransactionTargets,
  stage174MixedTransactionCandidate,
  stage174MixedTransactionFinalDecision,
  stage174RegressionReasons,
} from '../src/services/remediation/mixedResidualTransaction.js';
import { isOcrPageShell } from '../src/services/remediation/visibleHeadingAnchor.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_1/manifest.json';
const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_hard_1/run-stage174-target-mixed-2026-05-01-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_1/stage174-ordered-mixed-transaction-diagnostic-2026-05-01-r1';

const DEFAULT_IDS = new Set(['v1-4213', 'v1-4767', 'v1-3475', 'v1-3577']);
const RELEVANT_TOOLS = new Set([
  'set_figure_alt_text',
  'normalize_table_structure',
  'mark_untagged_content_as_artifact',
  'remap_orphan_mcids_as_artifacts',
]);

type Stage174DiagnosticClass =
  | 'mixed_ordered_transaction_candidate'
  | 'committed_transaction'
  | 'rolled_back_transaction'
  | 'alt_pdfua_only_not_stage174'
  | 'ocr_or_manual_control'
  | 'already_good_control'
  | 'no_safe_alt_target'
  | 'no_safe_table_target'
  | 'no_safe_candidate';

interface RunCategory {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface RunTool {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
}

interface RunRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: RunCategory[];
  reanalyzedCategories?: RunCategory[];
  appliedTools?: RunTool[];
  falsePositiveApplied?: number;
  falsePositiveAppliedCount?: number;
}

interface Stage174ToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  targetRef: string | null;
  note: string | null;
}

interface Stage174Row {
  id: string;
  publicationId: string;
  title: string;
  analyzedPdf: string | null;
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  analysisScore: number | null;
  analysisGrade: string | null;
  categories: Partial<Record<CategoryKey, number | null>>;
  classification: Stage174DiagnosticClass;
  reason: string;
  candidateTargets: ReturnType<typeof stage174BuildMixedTransactionTargets> | null;
  finalDecision: ReturnType<typeof stage174MixedTransactionFinalDecision> | null;
  regressionReasons: string[];
  relevantTools: Stage174ToolSummary[];
}

interface Stage174Report {
  generatedAt: string;
  manifest: string;
  run: string;
  rows: Stage174Row[];
  decision: {
    classDistribution: Record<Stage174DiagnosticClass, number>;
    selectedRows: string[];
    recommendedDirection: 'keep_transaction_behavior' | 'rollback_transaction_behavior' | 'diagnostic_only';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage174-ordered-mixed-transaction-diagnostic.ts [options]

Options:
  --manifest <path>   Hard holdout manifest (default: ${DEFAULT_MANIFEST})
  --run <dir>         Benchmark run with written PDFs (default: ${DEFAULT_RUN})
  --out <dir>         Diagnostic output directory (default: ${DEFAULT_OUT})
  --file <id>         Add/limit id/publication id; repeatable
  --help              Show this help`;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function repeatedArg(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryScore(categories: RunCategory[] | undefined, key: CategoryKey): number | null {
  const row = categories?.find(category => category.key === key);
  if (!row || row.applicable === false) return null;
  return numberOrNull(row.score);
}

function analysisCategoryScore(analysis: AnalysisResult | null, key: CategoryKey): number | null {
  const row = analysis?.categories.find(category => category.key === key);
  if (!row || row.applicable === false) return null;
  return numberOrNull(row.score);
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function targetRefFromDetails(details: unknown): string | null {
  const parsed = parseRecord(details);
  const invariants = nested(parsed, 'invariants');
  if (typeof invariants?.['targetRef'] === 'string') return invariants['targetRef'];
  const debug = nested(parsed, 'debug');
  if (typeof debug?.['targetRef'] === 'string') return debug['targetRef'];
  const replayState = nested(debug, 'replayState');
  if (typeof replayState?.['targetRef'] === 'string') return replayState['targetRef'];
  return null;
}

function noteFromDetails(details: unknown): string | null {
  const parsed = parseRecord(details);
  const note = parsed?.['note'];
  return typeof note === 'string' ? note : null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : Object.values(parsed as Record<string, RunRow>);
  const map = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.id) map.set(row.id, row);
    if (row.publicationId) map.set(row.publicationId, row);
  }
  return map;
}

async function findRemediatedPdf(runDir: string, id: string, publicationId: string): Promise<string | null> {
  const files = await readdir(runDir).catch(() => []);
  const found = files.find(name =>
    name.endsWith('.remediated.pdf') &&
    (name.startsWith(`${publicationId}-`) || name.startsWith(`${id}-`) || name.includes(id))
  );
  return found ? join(runDir, found) : null;
}

function relevantTools(row: RunRow | undefined): Stage174ToolSummary[] {
  return (row?.appliedTools ?? [])
    .filter(tool => tool.toolName && RELEVANT_TOOLS.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName!,
      outcome: typeof tool.outcome === 'string' ? tool.outcome : 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      delta: numberOrNull(tool.delta),
      targetRef: targetRefFromDetails(tool.details),
      note: noteFromDetails(tool.details),
    }));
}

function classifyRow(input: {
  runRow?: RunRow;
  analysis: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
  appliedTools: AppliedRemediationTool[];
}): { classification: Stage174DiagnosticClass; reason: string; targets: ReturnType<typeof stage174BuildMixedTransactionTargets> | null } {
  const rowTools = relevantTools(input.runRow);
  const stage174Rows = rowTools.filter(row => row.note?.startsWith('stage174_'));
  if (stage174Rows.some(row => row.outcome === 'applied')) {
    return { classification: 'committed_transaction', reason: 'Stage 174 transaction rows committed in this run', targets: input.snapshot ? stage174BuildMixedTransactionTargets(input.snapshot, input.appliedTools) : null };
  }
  if (stage174Rows.some(row => row.outcome === 'rejected')) {
    return { classification: 'rolled_back_transaction', reason: 'Stage 174 transaction rows were rolled back in this run', targets: input.snapshot ? stage174BuildMixedTransactionTargets(input.snapshot, input.appliedTools) : null };
  }
  if (!input.analysis || !input.snapshot) {
    return { classification: 'no_safe_candidate', reason: 'PDF artifact could not be analyzed', targets: null };
  }
  const decision = stage174MixedTransactionCandidate({
    analysis: input.analysis,
    snapshot: input.snapshot,
    appliedTools: input.appliedTools,
    isOcr: isOcrPageShell(input.snapshot, input.analysis),
    falsePositiveApplied: Number(input.runRow?.falsePositiveAppliedCount ?? input.runRow?.falsePositiveApplied ?? 0),
  });
  if (decision.shouldAttempt) {
    return { classification: 'mixed_ordered_transaction_candidate', reason: decision.reason, targets: decision.targets };
  }
  if (decision.reason === 'ocr_or_scanned_row_not_stage174_target') {
    return { classification: 'ocr_or_manual_control', reason: decision.reason, targets: decision.targets };
  }
  if (decision.reason.startsWith('not_mixed_alt_table_pdfua')) {
    return { classification: 'alt_pdfua_only_not_stage174', reason: decision.reason, targets: decision.targets };
  }
  if (input.analysis.score >= 90) {
    return { classification: 'already_good_control', reason: decision.reason, targets: decision.targets };
  }
  if (decision.reason === 'no_safe_unattempted_alt_targets') {
    return { classification: 'no_safe_alt_target', reason: decision.reason, targets: decision.targets };
  }
  if (decision.reason === 'no_safe_unattempted_table_targets') {
    return { classification: 'no_safe_table_target', reason: decision.reason, targets: decision.targets };
  }
  return { classification: 'no_safe_candidate', reason: decision.reason, targets: decision.targets };
}

async function analyzeRow(runDir: string, manifestRow: EdgeMixManifestRow, runRow: RunRow | undefined): Promise<Stage174Row> {
  const artifact = await findRemediatedPdf(runDir, manifestRow.id, manifestRow.publicationId);
  const analyzed = artifact && await exists(artifact)
    ? await analyzePdf(artifact, basename(artifact), { bypassCache: true })
    : null;
  const appliedTools = (runRow?.appliedTools ?? []) as unknown as AppliedRemediationTool[];
  const classification = classifyRow({
    runRow,
    analysis: analyzed?.result ?? null,
    snapshot: analyzed?.snapshot ?? null,
    appliedTools,
  });
  const categories: Partial<Record<CategoryKey, number | null>> = {};
  for (const key of ['heading_structure', 'reading_order', 'alt_text', 'table_markup', 'pdf_ua_compliance', 'link_quality'] as const) {
    categories[key] = categoryScore(runRow?.reanalyzedCategories ?? runRow?.afterCategories, key)
      ?? analysisCategoryScore(analyzed?.result ?? null, key);
  }
  const finalDecision = analyzed
    ? stage174MixedTransactionFinalDecision({
      before: analyzed.result,
      final: analyzed.result,
      beforeSnapshot: analyzed.snapshot,
      finalSnapshot: analyzed.snapshot,
      pdfUaAttempted: false,
      altTargetCount: classification.targets?.altTargets.length ?? 0,
      tableTargetCount: classification.targets?.tableTargets.length ?? 0,
    })
    : null;
  return {
    id: manifestRow.id,
    publicationId: manifestRow.publicationId,
    title: manifestRow.title,
    analyzedPdf: artifact,
    benchmarkScore: numberOrNull(runRow?.afterScore),
    benchmarkGrade: typeof runRow?.afterGrade === 'string' ? runRow.afterGrade : null,
    analysisScore: analyzed?.result.score ?? null,
    analysisGrade: analyzed?.result.grade ?? null,
    categories,
    classification: classification.classification,
    reason: classification.reason,
    candidateTargets: classification.targets,
    finalDecision,
    regressionReasons: analyzed
      ? stage174RegressionReasons({
        before: analyzed.result,
        final: analyzed.result,
        beforeSnapshot: analyzed.snapshot,
        finalSnapshot: analyzed.snapshot,
      })
      : [],
    relevantTools: relevantTools(runRow),
  };
}

function buildReport(manifest: string, run: string, rows: Stage174Row[]): Stage174Report {
  const classDistribution = rows.reduce<Record<Stage174DiagnosticClass, number>>((acc, row) => {
    acc[row.classification] += 1;
    return acc;
  }, {
    mixed_ordered_transaction_candidate: 0,
    committed_transaction: 0,
    rolled_back_transaction: 0,
    alt_pdfua_only_not_stage174: 0,
    ocr_or_manual_control: 0,
    already_good_control: 0,
    no_safe_alt_target: 0,
    no_safe_table_target: 0,
    no_safe_candidate: 0,
  });
  const selectedRows = rows
    .filter(row => row.classification === 'mixed_ordered_transaction_candidate' || row.classification === 'committed_transaction')
    .map(row => row.id);
  const committed = classDistribution.committed_transaction > 0;
  const rolledBack = classDistribution.rolled_back_transaction > 0 && !committed;
  return {
    generatedAt: new Date().toISOString(),
    manifest: resolve(manifest),
    run: resolve(run),
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: committed
        ? 'keep_transaction_behavior'
        : rolledBack
          ? 'rollback_transaction_behavior'
          : selectedRows.length > 0
            ? 'diagnostic_only'
            : 'diagnostic_only',
    },
  };
}

function renderMarkdown(report: Stage174Report): string {
  const lines = [
    '# Stage 174 Ordered Mixed Transaction Diagnostic',
    '',
    `Generated: ${report.generatedAt}`,
    `Run: \`${report.run}\``,
    `Decision: \`${report.decision.recommendedDirection}\``,
    '',
    '## Class Distribution',
    '',
    ...Object.entries(report.decision.classDistribution).map(([key, value]) => `- \`${key}\`: ${value}`),
    '',
    '## Rows',
    '',
  ];
  for (const row of report.rows) {
    const targetSummary = row.candidateTargets
      ? `alt=${row.candidateTargets.altTargets.map(target => target.structRef).join(',') || 'none'}; table=${row.candidateTargets.tableTargets.map(target => target.structRef).join(',') || 'none'}; orphan=${row.candidateTargets.orphanMcidCount}; pathPaint=${row.candidateTargets.suspectedPathPaintOutsideMc}`
      : 'none';
    lines.push(
      `### ${row.id} (${row.publicationId})`,
      '',
      `- Score: benchmark ${row.benchmarkScore ?? 'n/a'}/${row.benchmarkGrade ?? 'n/a'}, analysis ${row.analysisScore ?? 'n/a'}/${row.analysisGrade ?? 'n/a'}`,
      `- Categories: heading=${row.categories.heading_structure ?? 'n/a'}, reading=${row.categories.reading_order ?? 'n/a'}, alt=${row.categories.alt_text ?? 'n/a'}, table=${row.categories.table_markup ?? 'n/a'}, pdfua=${row.categories.pdf_ua_compliance ?? 'n/a'}, link=${row.categories.link_quality ?? 'n/a'}`,
      `- Classification: \`${row.classification}\` - ${row.reason}`,
      `- Candidate targets: ${targetSummary}`,
      `- Regression reasons: ${row.regressionReasons.join(', ') || 'none'}`,
      `- Relevant tools: ${row.relevantTools.map(tool => `${tool.toolName}:${tool.outcome}${tool.targetRef ? `@${tool.targetRef}` : ''}:${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`).join('; ') || 'none'}`,
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(usage());
    return;
  }
  const manifest = argValue('--manifest') ?? DEFAULT_MANIFEST;
  const run = argValue('--run') ?? DEFAULT_RUN;
  const out = argValue('--out') ?? DEFAULT_OUT;
  const requested = new Set(repeatedArg('--file'));
  const selected = requested.size > 0 ? requested : DEFAULT_IDS;
  const manifestRows = (await loadEdgeMixManifest(manifest))
    .filter(row => selected.has(row.id) || selected.has(row.publicationId));
  const runRows = await loadRunRows(run);
  const rows = await Promise.all(manifestRows.map(row => analyzeRow(run, row, runRows.get(row.id) ?? runRows.get(row.publicationId))));
  const report = buildReport(manifest, run, rows);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage174-ordered-mixed-transaction-diagnostic.json'), JSON.stringify(report, null, 2));
  await writeFile(join(out, 'stage174-ordered-mixed-transaction-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote Stage 174 diagnostic to ${out}`);
  console.log(`Decision: ${report.decision.recommendedDirection}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

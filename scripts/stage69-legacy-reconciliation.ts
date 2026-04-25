#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
type CategoryScores = Record<string, number>;

export type Stage69LegacyClass =
  | 'current_fixer_regression'
  | 'known_protected_parity_debt'
  | 'runtime_tail_debt'
  | 'real_structural_gain'
  | 'unchanged_or_noise'
  | 'inconclusive_missing_artifact';

export interface BenchmarkToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  source?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  details?: unknown;
}

export interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: string; score: number }>;
  appliedTools?: BenchmarkToolRow[];
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
}

interface RunData {
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

export interface Stage69Metrics {
  count: number;
  mean: number | null;
  median: number | null;
  p95WallMs: number | null;
  attempts: number;
  falsePositiveAppliedCount: number;
  gradeDistribution: Record<string, number>;
  fCount: number;
}

export interface Stage69RowReport {
  id: string;
  file: string | null;
  baselineScore: number | null;
  baselineGrade: string | null;
  candidateScore: number | null;
  candidateGrade: string | null;
  scoreDelta: number | null;
  baselineWallMs: number | null;
  candidateWallMs: number | null;
  wallDeltaMs: number | null;
  categoryDeltas: Array<{ key: string; baseline: number; candidate: number; delta: number }>;
  classification: Stage69LegacyClass;
  reasons: string[];
  stage68ToolInvolvement: string[];
  firstCandidateRegressionTool: string | null;
}

export interface Stage69Report {
  generatedAt: string;
  inputs: {
    stage45RunDir: string;
    stage69RunDir: string;
    protectedBaselineRunDir: string;
    gatePath: string | null;
  };
  gate: {
    passed: boolean | null;
    failedGateKeys: string[];
    protectedRegressionCount: number | null;
    falsePositiveAppliedRows: string[];
  };
  metrics: {
    stage45: Stage69Metrics;
    stage69: Stage69Metrics;
    deltas: {
      mean: number | null;
      median: number | null;
      p95WallMs: number | null;
      attempts: number;
      falsePositiveAppliedCount: number;
      fCount: number;
    };
  };
  rows: Stage69RowReport[];
  classificationDistribution: Record<Stage69LegacyClass, number>;
  topScoreRegressions: Stage69RowReport[];
  topRuntimeRegressions: Stage69RowReport[];
  decision: {
    status: 'ready_for_end_gate_planning' | 'stage70_regression_isolation_required' | 'inconclusive';
    reasons: string[];
  };
}

const DEFAULT_STAGE45_RUN = 'Output/experiment-corpus-baseline/run-stage45-full-2026-04-23-r2';
const DEFAULT_STAGE69_RUN = 'Output/experiment-corpus-baseline/run-stage69-full-2026-04-25-r1';
const DEFAULT_PROTECTED_BASELINE = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_GATE_DIR = 'Output/experiment-corpus-baseline/stage69-benchmark-gate-2026-04-25-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage69-legacy-reconciliation-2026-04-25-r1';

const KNOWN_PROTECTED_PARITY_IDS = new Set([
  'fixture-teams-original',
  'fixture-teams-remediated',
  'fixture-teams-targeted-wave1',
  'long-4680',
  'long-4683',
  'structure-4076',
  'structure-4438',
]);

const STAGE68_RELEVANT_TOOLS = new Set([
  'canonicalize_figure_alt_ownership',
  'normalize_nested_figure_containers',
  'normalize_table_structure',
  'repair_native_table_headers',
  'retag_as_figure',
  'set_figure_alt_text',
  'set_table_header_cells',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage69-legacy-reconciliation.ts [options]',
    `  --stage45-run <dir>       Default: ${DEFAULT_STAGE45_RUN}`,
    `  --stage69-run <dir>       Default: ${DEFAULT_STAGE69_RUN}`,
    `  --protected-baseline <dir> Default: ${DEFAULT_PROTECTED_BASELINE}`,
    `  --gate <path-or-dir>       Default: ${DEFAULT_GATE_DIR}`,
    `  --out <dir>                Default: ${DEFAULT_OUT}`,
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function rowKey(row: BenchmarkRow): string {
  return String(row.id ?? row.publicationId ?? '');
}

function score(row?: BenchmarkRow): number | null {
  return num(row?.afterScore);
}

function grade(row?: BenchmarkRow): string | null {
  return typeof row?.afterGrade === 'string' ? row.afterGrade : null;
}

function wallMs(row?: BenchmarkRow): number | null {
  return num(row?.wallRemediateMs);
}

function toolName(tool: BenchmarkToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function categories(row?: BenchmarkRow): CategoryScores {
  return Object.fromEntries((row?.afterCategories ?? []).map(category => [category.key, category.score]));
}

function categoryDeltas(baseline: CategoryScores, candidate: CategoryScores): Stage69RowReport['categoryDeltas'] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
  return [...keys]
    .map(key => ({
      key,
      baseline: baseline[key] ?? 0,
      candidate: candidate[key] ?? 0,
      delta: (candidate[key] ?? 0) - (baseline[key] ?? 0),
    }))
    .filter(delta => delta.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index]!;
}

function round(value: number | null, digits = 2): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function summarizeRunMetrics(rows: BenchmarkRow[]): Stage69Metrics {
  const scores = rows.map(row => score(row)).filter((value): value is number => value != null);
  const walls = rows.map(row => wallMs(row)).filter((value): value is number => value != null);
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const row of rows) {
    const g = grade(row);
    if (g) gradeDistribution[g] = (gradeDistribution[g] ?? 0) + 1;
  }
  return {
    count: rows.length,
    mean: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    median: round(median(scores)),
    p95WallMs: round(percentile(walls, 95)),
    attempts: rows.reduce((sum, row) => sum + (row.appliedTools?.length ?? 0), 0),
    falsePositiveAppliedCount: rows.reduce((sum, row) => sum + (row.falsePositiveAppliedCount ?? 0), 0),
    gradeDistribution,
    fCount: gradeDistribution.F ?? 0,
  };
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    return asRecord(JSON.parse(trimmed) as unknown);
  } catch {
    return { raw: details };
  }
}

function noteFromTool(tool: BenchmarkToolRow): string {
  const details = parseDetails(tool.details);
  return str(details.note) || str(details.raw);
}

export function summarizeStage68ToolInvolvement(row?: BenchmarkRow): string[] {
  const tools = row?.appliedTools ?? [];
  return [...new Set(tools
    .filter(tool => STAGE68_RELEVANT_TOOLS.has(toolName(tool)))
    .map(tool => {
      const note = noteFromTool(tool);
      return `${toolName(tool)}:${tool.outcome ?? 'unknown'}${note ? `:${note}` : ''}`;
    }))];
}

function firstCandidateRegressionTool(row?: BenchmarkRow): string | null {
  const tool = (row?.appliedTools ?? []).find(candidateTool =>
    typeof candidateTool.scoreBefore === 'number' &&
    typeof candidateTool.scoreAfter === 'number' &&
    candidateTool.scoreAfter < candidateTool.scoreBefore);
  return tool ? `${toolName(tool)}:${tool.outcome ?? 'unknown'}` : null;
}

export function classifyStage69Row(input: {
  id: string;
  baseline?: BenchmarkRow;
  candidate?: BenchmarkRow;
  scoreDelta: number | null;
  wallDeltaMs: number | null;
  stage68ToolInvolvement: string[];
}): { classification: Stage69LegacyClass; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.baseline || !input.candidate || input.scoreDelta == null) {
    return { classification: 'inconclusive_missing_artifact', reasons: ['baseline_or_candidate_row_missing'] };
  }
  if (input.scoreDelta < -2 && KNOWN_PROTECTED_PARITY_IDS.has(input.id)) {
    return { classification: 'known_protected_parity_debt', reasons: ['known_legacy_protected_or_runtime_debt_row'] };
  }
  if (input.scoreDelta < -2 && input.stage68ToolInvolvement.length > 0) {
    reasons.push('score_regression_with_stage68_table_or_figure_tool_involvement');
    return { classification: 'current_fixer_regression', reasons };
  }
  if (input.scoreDelta < -2) {
    reasons.push('score_regression_without_known_stage68_tool_attribution');
    return { classification: 'inconclusive_missing_artifact', reasons };
  }
  if ((input.wallDeltaMs ?? 0) > 10_000 && (input.scoreDelta ?? 0) >= -2) {
    return { classification: 'runtime_tail_debt', reasons: ['wall_time_regressed_more_than_10s_without_score_regression'] };
  }
  if (input.scoreDelta > 2) {
    return { classification: 'real_structural_gain', reasons: ['score_improved_more_than_two_points'] };
  }
  return { classification: 'unchanged_or_noise', reasons: ['score_within_two_points_and_no_runtime_tail'] };
}

export function summarizeStage69Row(id: string, baseline?: BenchmarkRow, candidate?: BenchmarkRow): Stage69RowReport {
  const baselineScore = score(baseline);
  const candidateScore = score(candidate);
  const scoreDelta = baselineScore != null && candidateScore != null ? candidateScore - baselineScore : null;
  const baselineWallMs = wallMs(baseline);
  const candidateWallMs = wallMs(candidate);
  const wallDeltaMs = baselineWallMs != null && candidateWallMs != null ? candidateWallMs - baselineWallMs : null;
  const stage68ToolInvolvement = summarizeStage68ToolInvolvement(candidate);
  const classified = classifyStage69Row({ id, baseline, candidate, scoreDelta, wallDeltaMs, stage68ToolInvolvement });
  return {
    id,
    file: baseline?.file ?? candidate?.file ?? candidate?.localFile ?? null,
    baselineScore,
    baselineGrade: grade(baseline),
    candidateScore,
    candidateGrade: grade(candidate),
    scoreDelta,
    baselineWallMs: round(baselineWallMs),
    candidateWallMs: round(candidateWallMs),
    wallDeltaMs: round(wallDeltaMs),
    categoryDeltas: categoryDeltas(categories(baseline), categories(candidate)),
    classification: classified.classification,
    reasons: classified.reasons,
    stage68ToolInvolvement,
    firstCandidateRegressionTool: firstCandidateRegressionTool(candidate),
  };
}

function classificationDistribution(rows: Stage69RowReport[]): Record<Stage69LegacyClass, number> {
  const keys: Stage69LegacyClass[] = [
    'current_fixer_regression',
    'known_protected_parity_debt',
    'runtime_tail_debt',
    'real_structural_gain',
    'unchanged_or_noise',
    'inconclusive_missing_artifact',
  ];
  return Object.fromEntries(keys.map(key => [key, rows.filter(row => row.classification === key).length])) as Record<Stage69LegacyClass, number>;
}

function gateFailedKeys(gate: JsonRecord | null): string[] {
  const gates = Array.isArray(gate?.gates) ? gate.gates as JsonRecord[] : [];
  return gates.filter(item => item.passed === false).map(item => str(item.key)).filter(Boolean);
}

function gateProtectedRegressionCount(gate: JsonRecord | null): number | null {
  const gates = Array.isArray(gate?.gates) ? gate.gates as JsonRecord[] : [];
  const protectedGate = gates.find(item => str(item.key) === 'protected_file_regressions');
  return num(protectedGate?.candidateValue);
}

function gateFalsePositiveRows(gate: JsonRecord | null): string[] {
  const rows = Array.isArray(gate?.falsePositiveAppliedRows) ? gate.falsePositiveAppliedRows as JsonRecord[] : [];
  return rows.map(row => str(row.id) || str(row.publicationId) || str(row.file)).filter(Boolean);
}

export function buildStage69Report(input: {
  stage45RunDir: string;
  stage69RunDir: string;
  protectedBaselineRunDir: string;
  gatePath: string | null;
  gate: JsonRecord | null;
  stage45Rows: Map<string, BenchmarkRow>;
  stage69Rows: Map<string, BenchmarkRow>;
  generatedAt?: string;
}): Stage69Report {
  const ids = [...new Set([...input.stage45Rows.keys(), ...input.stage69Rows.keys()])].sort();
  const rows = ids.map(id => summarizeStage69Row(id, input.stage45Rows.get(id), input.stage69Rows.get(id)));
  const metrics45 = summarizeRunMetrics([...input.stage45Rows.values()]);
  const metrics69 = summarizeRunMetrics([...input.stage69Rows.values()]);
  const distribution = classificationDistribution(rows);
  const currentFixerRegressions = rows.filter(row => row.classification === 'current_fixer_regression');
  const inconclusiveRows = rows.filter(row => row.classification === 'inconclusive_missing_artifact');
  const falsePositiveRows = gateFalsePositiveRows(input.gate);
  const fpDelta = metrics69.falsePositiveAppliedCount - metrics45.falsePositiveAppliedCount;
  const reasons = [
    `${currentFixerRegressions.length} current-fixer regression(s)`,
    `${distribution.known_protected_parity_debt} known protected/parity debt row(s)`,
    `${distribution.runtime_tail_debt} runtime-tail debt row(s)`,
    `${falsePositiveRows.length || metrics69.falsePositiveAppliedCount} false-positive applied row(s)`,
  ];
  const status = inconclusiveRows.length > 0
    ? 'inconclusive'
    : currentFixerRegressions.length > 0 || falsePositiveRows.length > 0 || metrics69.falsePositiveAppliedCount > 0
      ? 'stage70_regression_isolation_required'
      : 'ready_for_end_gate_planning';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      stage45RunDir: input.stage45RunDir,
      stage69RunDir: input.stage69RunDir,
      protectedBaselineRunDir: input.protectedBaselineRunDir,
      gatePath: input.gatePath,
    },
    gate: {
      passed: typeof input.gate?.passed === 'boolean' ? input.gate.passed : null,
      failedGateKeys: gateFailedKeys(input.gate),
      protectedRegressionCount: gateProtectedRegressionCount(input.gate),
      falsePositiveAppliedRows: falsePositiveRows,
    },
    metrics: {
      stage45: metrics45,
      stage69: metrics69,
      deltas: {
        mean: metrics45.mean != null && metrics69.mean != null ? round(metrics69.mean - metrics45.mean) : null,
        median: metrics45.median != null && metrics69.median != null ? round(metrics69.median - metrics45.median) : null,
        p95WallMs: metrics45.p95WallMs != null && metrics69.p95WallMs != null ? round(metrics69.p95WallMs - metrics45.p95WallMs) : null,
        attempts: metrics69.attempts - metrics45.attempts,
        falsePositiveAppliedCount: fpDelta,
        fCount: metrics69.fCount - metrics45.fCount,
      },
    },
    rows,
    classificationDistribution: distribution,
    topScoreRegressions: rows
      .filter(row => row.scoreDelta != null && row.scoreDelta < 0)
      .sort((a, b) => (a.scoreDelta ?? 0) - (b.scoreDelta ?? 0))
      .slice(0, 10),
    topRuntimeRegressions: rows
      .filter(row => row.wallDeltaMs != null && row.wallDeltaMs > 0)
      .sort((a, b) => (b.wallDeltaMs ?? 0) - (a.wallDeltaMs ?? 0))
      .slice(0, 10),
    decision: { status, reasons },
  };
}

function renderMetrics(metrics: Stage69Metrics): string {
  return `mean ${metrics.mean ?? 'n/a'}, median ${metrics.median ?? 'n/a'}, p95 ${metrics.p95WallMs ?? 'n/a'}ms, attempts ${metrics.attempts}, grades ${JSON.stringify(metrics.gradeDistribution)}, FP applied ${metrics.falsePositiveAppliedCount}`;
}

function renderRow(row: Stage69RowReport): string {
  const deltas = row.categoryDeltas.slice(0, 3).map(delta => `${delta.key}:${delta.baseline}->${delta.candidate}`).join(', ') || 'none';
  const tools = row.stage68ToolInvolvement.slice(0, 2).join(', ') || 'none';
  return `| ${row.id} | ${row.baselineScore ?? 'n/a'} -> ${row.candidateScore ?? 'n/a'} | ${row.scoreDelta ?? 'n/a'} | ${row.wallDeltaMs ?? 'n/a'} | ${row.classification} | ${deltas} | ${tools} |`;
}

export function renderStage69Markdown(report: Stage69Report): string {
  const lines = [
    '# Stage 69 Legacy 50-File Reconciliation',
    '',
    `- Stage 45 baseline: \`${report.inputs.stage45RunDir}\``,
    `- Stage 69 candidate: \`${report.inputs.stage69RunDir}\``,
    `- Protected baseline: \`${report.inputs.protectedBaselineRunDir}\``,
    `- Stage 41 gate: \`${report.inputs.gatePath ?? 'missing'}\``,
    `- Decision: **${report.decision.status}**`,
    `- Reasons: ${report.decision.reasons.join('; ')}`,
    '',
    '## Summary Metrics',
    '',
    `- Stage 45: ${renderMetrics(report.metrics.stage45)}`,
    `- Stage 69: ${renderMetrics(report.metrics.stage69)}`,
    `- Deltas: mean ${report.metrics.deltas.mean ?? 'n/a'}, median ${report.metrics.deltas.median ?? 'n/a'}, p95 ${report.metrics.deltas.p95WallMs ?? 'n/a'}ms, attempts ${report.metrics.deltas.attempts}, F ${report.metrics.deltas.fCount}, FP applied ${report.metrics.deltas.falsePositiveAppliedCount}`,
    `- Gate passed: ${report.gate.passed ?? 'n/a'}`,
    `- Failed gates: ${report.gate.failedGateKeys.join(', ') || 'none'}`,
    `- Protected regressions: ${report.gate.protectedRegressionCount ?? 'n/a'}`,
    '',
    '## Classification Distribution',
    '',
    '```json',
    JSON.stringify(report.classificationDistribution, null, 2),
    '```',
    '',
    '## Top Score Regressions',
    '',
    '| row | score | delta | wall delta ms | class | largest category deltas | Stage68 table/figure tools |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |',
    ...report.topScoreRegressions.map(renderRow),
    '',
    '## Top Runtime Regressions',
    '',
    '| row | score | delta | wall delta ms | class | largest category deltas | Stage68 table/figure tools |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |',
    ...report.topRuntimeRegressions.map(renderRow),
    '',
    '## All Row Classifications',
    '',
    '| row | score | delta | wall delta ms | class | largest category deltas | Stage68 table/figure tools |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |',
    ...report.rows.map(renderRow),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function loadRun(runDir: string): Promise<RunData> {
  const path = join(resolve(runDir), 'remediate.results.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as BenchmarkRow[] | { rows?: BenchmarkRow[]; results?: BenchmarkRow[] };
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : raw.results;
  if (!Array.isArray(rows)) throw new Error(`No remediation rows found in ${path}`);
  return {
    runDir: resolve(runDir),
    rows: new Map(rows.map(row => [rowKey(row), row]).filter(([key]) => key.length > 0)),
  };
}

async function readJson(path: string): Promise<JsonRecord | null> {
  try {
    return asRecord(JSON.parse(await readFile(path, 'utf8')) as unknown);
  } catch {
    return null;
  }
}

async function resolveGatePath(pathOrDir: string): Promise<string | null> {
  const resolved = resolve(pathOrDir);
  if (resolved.endsWith('.json')) return resolved;
  try {
    const files = await readdir(resolved);
    if (files.includes('stage41-benchmark-gate.json')) return join(resolved, 'stage41-benchmark-gate.json');
    const jsonFile = files.find(file => file.endsWith('.json'));
    return jsonFile ? join(resolved, jsonFile) : null;
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]): {
  stage45Run: string;
  stage69Run: string;
  protectedBaseline: string;
  gate: string;
  outDir: string;
} {
  let stage45Run = DEFAULT_STAGE45_RUN;
  let stage69Run = DEFAULT_STAGE69_RUN;
  let protectedBaseline = DEFAULT_PROTECTED_BASELINE;
  let gate = DEFAULT_GATE_DIR;
  let outDir = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--stage45-run') stage45Run = argv[++i] ?? stage45Run;
    else if (arg === '--stage69-run') stage69Run = argv[++i] ?? stage69Run;
    else if (arg === '--protected-baseline') protectedBaseline = argv[++i] ?? protectedBaseline;
    else if (arg === '--gate') gate = argv[++i] ?? gate;
    else if (arg === '--out') outDir = argv[++i] ?? outDir;
    else if (arg === '--help') throw new Error(usage());
  }
  return { stage45Run, stage69Run, protectedBaseline, gate, outDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const [stage45, stage69, gatePath] = await Promise.all([
    loadRun(args.stage45Run),
    loadRun(args.stage69Run),
    resolveGatePath(args.gate),
  ]);
  const gate = gatePath ? await readJson(gatePath) : null;
  const report = buildStage69Report({
    stage45RunDir: stage45.runDir,
    stage69RunDir: stage69.runDir,
    protectedBaselineRunDir: resolve(args.protectedBaseline),
    gatePath,
    gate,
    stage45Rows: stage45.rows,
    stage69Rows: stage69.rows,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage69-legacy-reconciliation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage69-legacy-reconciliation.md'), renderStage69Markdown(report), 'utf8');
  console.log(`Wrote Stage 69 reconciliation report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

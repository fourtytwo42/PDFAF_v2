#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

export type Stage71DebtBucket =
  | 'parked_analyzer_volatility'
  | 'manual_scanned_policy_debt'
  | 'protected_runtime_or_parity_debt'
  | 'runtime_tail_debt'
  | 'stable_structural_residual'
  | 'resolved_high';

export interface BenchmarkToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
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

export interface Stage71RunSummary {
  label: string;
  runDir: string;
  count: number;
  mean: number | null;
  median: number | null;
  p95WallMs: number | null;
  attempts: number;
  gradeDistribution: Record<string, number>;
  fCount: number;
  abCount: number;
  abPercent: number | null;
  falsePositiveAppliedCount: number;
}

export interface Stage71LowRow {
  id: string;
  corpus: 'legacy_50' | 'edge_mix_1' | 'edge_mix_2';
  file: string | null;
  score: number | null;
  grade: string | null;
  belowC: boolean;
  lowCategories: Array<{ key: string; score: number }>;
  bucket: Stage71DebtBucket;
  reasons: string[];
}

export interface Stage71Report {
  generatedAt: string;
  inputs: {
    legacyRunDir: string;
    edgeMix1RunDir: string;
    edgeMix2RunDir: string;
    stage69ReconciliationPath: string;
    stage70ReconciliationPath: string;
    stage69GatePath: string;
    stage70GatePath: string;
  };
  summaries: {
    legacy: Stage71RunSummary;
    edgeMix1: Stage71RunSummary;
    edgeMix2: Stage71RunSummary;
    edgeMixCombined: Stage71RunSummary;
  };
  gates: {
    stage69: Stage71GateSummary;
    stage70: Stage71GateSummary;
  };
  stage70RejectedGuard: {
    documented: boolean;
    reason: string;
  };
  lowRows: Stage71LowRow[];
  debtDistribution: Record<Stage71DebtBucket, number>;
  acceptanceChecks: Record<string, { passed: boolean; detail: string }>;
  decision: {
    status: 'accept_engine_v2_general_checkpoint' | 'defer_acceptance_for_p95_project';
    reasons: string[];
  };
  generatedArtifactPolicy: {
    generatedOutputCommitted: false;
    note: string;
  };
}

export interface Stage71GateSummary {
  path: string;
  passed: boolean | null;
  failedGateKeys: string[];
  protectedRegressionCount: number | null;
  falsePositiveAppliedRows: string[];
}

const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage69-full-2026-04-25-r1';
const DEFAULT_EDGE1_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage68-edge-mix-2026-04-25-r1';
const DEFAULT_EDGE2_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage68-edge-mix2-2026-04-25-r1';
const DEFAULT_STAGE69_RECONCILIATION = 'Output/experiment-corpus-baseline/stage69-legacy-reconciliation-2026-04-25-r1/stage69-legacy-reconciliation.json';
const DEFAULT_STAGE70_RECONCILIATION = 'Output/experiment-corpus-baseline/stage70-legacy-reconciliation-2026-04-25-r1/stage69-legacy-reconciliation.json';
const DEFAULT_STAGE69_GATE = 'Output/experiment-corpus-baseline/stage69-benchmark-gate-2026-04-25-r1/stage41-benchmark-gate.json';
const DEFAULT_STAGE70_GATE = 'Output/experiment-corpus-baseline/stage70-benchmark-gate-2026-04-25-r1/stage41-benchmark-gate.json';
const DEFAULT_OUT = 'Output/engine-v2-general-acceptance/stage71-end-gate-2026-04-25-r1';

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];
const LOW_CATEGORY_THRESHOLD = 70;
const EDGE_MIX_AB_TARGET = 80;

const EDGE_ANALYZER_VOLATILITY = new Set([
  'v1-4122',
  'v1-4139',
  'v1-4171',
  'v1-4215',
  'v1-4487',
  'v1-4567',
  'v1-4683',
]);

const EDGE_MANUAL_SCANNED = new Set(['v1-3479', 'v1-3507']);
const LEGACY_PROTECTED_RUNTIME = new Set([
  'fixture-teams-original',
  'fixture-teams-remediated',
  'fixture-teams-targeted-wave1',
  'long-4680',
  'long-4683',
]);
const LEGACY_RUNTIME_TAIL = new Set(['long-4516', 'long-4683', 'structure-4076', 'structure-4438']);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage71-end-gate-report.ts [options]',
    `  --legacy-run <dir>              Default: ${DEFAULT_LEGACY_RUN}`,
    `  --edge1-run <dir>               Default: ${DEFAULT_EDGE1_RUN}`,
    `  --edge2-run <dir>               Default: ${DEFAULT_EDGE2_RUN}`,
    `  --stage69-reconciliation <json> Default: ${DEFAULT_STAGE69_RECONCILIATION}`,
    `  --stage70-reconciliation <json> Default: ${DEFAULT_STAGE70_RECONCILIATION}`,
    `  --stage69-gate <json>           Default: ${DEFAULT_STAGE69_GATE}`,
    `  --stage70-gate <json>           Default: ${DEFAULT_STAGE70_GATE}`,
    `  --out <dir>                     Default: ${DEFAULT_OUT}`,
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

function canonicalId(row: BenchmarkRow): string {
  const id = str(row.id);
  if (id) return id.match(/^\d+$/) ? `v1-${id}` : id;
  const publicationId = str(row.publicationId);
  return publicationId ? `v1-${publicationId.replace(/^v1-/, '')}` : '';
}

function score(row: BenchmarkRow): number | null {
  return num(row.afterScore);
}

function grade(row: BenchmarkRow): string | null {
  return str(row.afterGrade) || null;
}

function categories(row: BenchmarkRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const category of row.afterCategories ?? []) {
    const value = num(category.score);
    if (category.key && value != null) out[category.key] = value;
  }
  return out;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p / 100) - 1)]!;
}

function round(value: number | null, digits = 2): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function gradeDistribution(rows: BenchmarkRow[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(GRADE_ORDER.map(key => [key, 0]));
  for (const row of rows) {
    const g = grade(row);
    if (g) out[g] = (out[g] ?? 0) + 1;
  }
  return out;
}

export function summarizeRows(label: string, runDir: string, rows: BenchmarkRow[]): Stage71RunSummary {
  const scores = rows.map(score).filter((value): value is number => value != null);
  const walls = rows.map(row => num(row.wallRemediateMs)).filter((value): value is number => value != null);
  const grades = gradeDistribution(rows);
  const abCount = (grades.A ?? 0) + (grades.B ?? 0);
  return {
    label,
    runDir,
    count: rows.length,
    mean: round(scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null),
    median: round(median(scores)),
    p95WallMs: round(percentile(walls, 95)),
    attempts: rows.reduce((sum, row) => sum + (row.appliedTools?.length ?? 0), 0),
    gradeDistribution: grades,
    fCount: grades.F ?? 0,
    abCount,
    abPercent: round(rows.length ? (abCount / rows.length) * 100 : null),
    falsePositiveAppliedCount: rows.reduce((sum, row) => sum + (row.falsePositiveAppliedCount ?? 0), 0),
  };
}

function lowCategories(row: BenchmarkRow): Array<{ key: string; score: number }> {
  return Object.entries(categories(row))
    .filter(([, value]) => value < LOW_CATEGORY_THRESHOLD)
    .map(([key, value]) => ({ key, score: value }))
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
}

export function bucketRow(input: {
  id: string;
  corpus: 'legacy_50' | 'edge_mix_1' | 'edge_mix_2';
  row: BenchmarkRow;
  stage69Class?: string;
}): { bucket: Stage71DebtBucket; reasons: string[] } {
  const reasons: string[] = [];
  const rowGrade = grade(input.row);
  if (rowGrade === 'A' || rowGrade === 'B') {
    return { bucket: 'resolved_high', reasons: ['grade_is_A_or_B'] };
  }

  if (input.corpus !== 'legacy_50') {
    if (EDGE_ANALYZER_VOLATILITY.has(input.id)) {
      return { bucket: 'parked_analyzer_volatility', reasons: ['stage66_noncanonicalizable_python_structural_variance'] };
    }
    if (EDGE_MANUAL_SCANNED.has(input.id)) {
      return { bucket: 'manual_scanned_policy_debt', reasons: ['manual_or_scanned_policy_debt'] };
    }
    return { bucket: 'stable_structural_residual', reasons: ['stable_edge_mix_structural_residual'] };
  }

  if (input.stage69Class === 'known_protected_parity_debt' || LEGACY_PROTECTED_RUNTIME.has(input.id)) {
    return { bucket: 'protected_runtime_or_parity_debt', reasons: ['legacy_protected_or_parity_debt_row'] };
  }
  if (input.stage69Class === 'runtime_tail_debt' || LEGACY_RUNTIME_TAIL.has(input.id)) {
    return { bucket: 'runtime_tail_debt', reasons: ['legacy_runtime_tail_debt_row'] };
  }
  reasons.push('legacy_stable_structural_residual');
  return { bucket: 'stable_structural_residual', reasons };
}

function lowRowReport(
  corpus: 'legacy_50' | 'edge_mix_1' | 'edge_mix_2',
  row: BenchmarkRow,
  stage69Class?: string,
): Stage71LowRow {
  const id = canonicalId(row);
  const rowGrade = grade(row);
  const bucketed = bucketRow({ id, corpus, row, stage69Class });
  return {
    id,
    corpus,
    file: row.file ?? row.localFile ?? null,
    score: score(row),
    grade: rowGrade,
    belowC: rowGrade === 'D' || rowGrade === 'F',
    lowCategories: lowCategories(row),
    bucket: bucketed.bucket,
    reasons: bucketed.reasons,
  };
}

function gateFailedKeys(gate: JsonRecord): string[] {
  const gates = Array.isArray(gate.gates) ? gate.gates as JsonRecord[] : [];
  return gates.filter(item => item.passed === false).map(item => str(item.key)).filter(Boolean);
}

function gateProtectedRegressionCount(gate: JsonRecord): number | null {
  const gates = Array.isArray(gate.gates) ? gate.gates as JsonRecord[] : [];
  const protectedGate = gates.find(item => str(item.key) === 'protected_file_regressions');
  return num(protectedGate?.candidateValue);
}

function gateFalsePositiveRows(gate: JsonRecord): string[] {
  const rows = Array.isArray(gate.falsePositiveAppliedRows) ? gate.falsePositiveAppliedRows as JsonRecord[] : [];
  return rows.map(row => str(row.id) || str(row.publicationId) || str(row.file)).filter(Boolean);
}

function summarizeGate(path: string, gate: JsonRecord): Stage71GateSummary {
  return {
    path,
    passed: typeof gate.passed === 'boolean' ? gate.passed : null,
    failedGateKeys: gateFailedKeys(gate),
    protectedRegressionCount: gateProtectedRegressionCount(gate),
    falsePositiveAppliedRows: gateFalsePositiveRows(gate),
  };
}

function stage69ClassMap(reconciliation: JsonRecord): Map<string, string> {
  const rows = Array.isArray(reconciliation.rows) ? reconciliation.rows as JsonRecord[] : [];
  return new Map(rows.map(row => [str(row.id), str(row.classification)]).filter(([id]) => Boolean(id)));
}

function debtDistribution(rows: Stage71LowRow[]): Record<Stage71DebtBucket, number> {
  const buckets: Stage71DebtBucket[] = [
    'parked_analyzer_volatility',
    'manual_scanned_policy_debt',
    'protected_runtime_or_parity_debt',
    'runtime_tail_debt',
    'stable_structural_residual',
    'resolved_high',
  ];
  return Object.fromEntries(buckets.map(bucket => [bucket, rows.filter(row => row.bucket === bucket).length])) as Record<Stage71DebtBucket, number>;
}

function acceptanceChecks(input: {
  legacy: Stage71RunSummary;
  edgeMixCombined: Stage71RunSummary;
  stage69Gate: Stage71GateSummary;
  stage70Documented: boolean;
  lowRows: Stage71LowRow[];
}): Record<string, { passed: boolean; detail: string }> {
  const fpTotal = input.legacy.falsePositiveAppliedCount + input.edgeMixCombined.falsePositiveAppliedCount;
  const allBelowCBucketed = input.lowRows.filter(row => row.belowC).every(row => row.bucket !== 'resolved_high');
  return {
    corpora_represented: {
      passed: input.legacy.count > 0 && input.edgeMixCombined.count > 0,
      detail: `legacy=${input.legacy.count}, edgeMixCombined=${input.edgeMixCombined.count}`,
    },
    false_positive_applied_zero: {
      passed: fpTotal === 0 && input.stage69Gate.falsePositiveAppliedRows.length === 0,
      detail: `reported=${fpTotal}, gateRows=${input.stage69Gate.falsePositiveAppliedRows.length}`,
    },
    legacy_quality_anchor: {
      passed: (input.legacy.mean ?? 0) >= 91 && (input.legacy.median ?? 0) >= 96 && input.legacy.fCount <= 2,
      detail: `mean=${input.legacy.mean}, median=${input.legacy.median}, F=${input.legacy.fCount}`,
    },
    edge_mix_ab_target: {
      passed: (input.edgeMixCombined.abPercent ?? 0) >= EDGE_MIX_AB_TARGET,
      detail: `A/B=${input.edgeMixCombined.abCount}/${input.edgeMixCombined.count} (${input.edgeMixCombined.abPercent ?? 'n/a'}%), target=${EDGE_MIX_AB_TARGET}%`,
    },
    below_c_rows_bucketed: {
      passed: allBelowCBucketed,
      detail: `${input.lowRows.filter(row => row.belowC).length} below-C row(s) bucketed`,
    },
    stage70_rejected_guard_documented: {
      passed: input.stage70Documented,
      detail: input.stage70Documented ? 'Stage 70 guard is documented as rejected/not kept.' : 'Stage 70 guard status missing.',
    },
  };
}

function decision(checks: Record<string, { passed: boolean; detail: string }>): Stage71Report['decision'] {
  const failed = Object.entries(checks).filter(([, check]) => !check.passed);
  if (failed.length === 0) {
    return {
      status: 'accept_engine_v2_general_checkpoint',
      reasons: ['All Stage 71 end-gate acceptance checks passed.'],
    };
  }
  return {
    status: 'defer_acceptance_for_p95_project',
    reasons: failed.map(([key, check]) => `${key}: ${check.detail}`),
  };
}

export function buildStage71Report(input: {
  legacyRunDir: string;
  edgeMix1RunDir: string;
  edgeMix2RunDir: string;
  stage69ReconciliationPath: string;
  stage70ReconciliationPath: string;
  stage69GatePath: string;
  stage70GatePath: string;
  legacyRows: BenchmarkRow[];
  edgeMix1Rows: BenchmarkRow[];
  edgeMix2Rows: BenchmarkRow[];
  stage69Reconciliation: JsonRecord;
  stage70Reconciliation: JsonRecord;
  stage69Gate: JsonRecord;
  stage70Gate: JsonRecord;
  generatedAt?: string;
}): Stage71Report {
  const legacy = summarizeRows('legacy_50_stage69', input.legacyRunDir, input.legacyRows);
  const edgeMix1 = summarizeRows('edge_mix_1_stage68', input.edgeMix1RunDir, input.edgeMix1Rows);
  const edgeMix2 = summarizeRows('edge_mix_2_stage68', input.edgeMix2RunDir, input.edgeMix2Rows);
  const edgeMixCombined = summarizeRows('edge_mix_combined_stage68', 'edge_mix_combined', [...input.edgeMix1Rows, ...input.edgeMix2Rows]);
  const stage69Classes = stage69ClassMap(input.stage69Reconciliation);
  const candidateLowRows = [
    ...input.legacyRows
      .filter(row => ['C', 'D', 'F'].includes(grade(row) ?? ''))
      .map(row => lowRowReport('legacy_50', row, stage69Classes.get(canonicalId(row)))),
    ...input.edgeMix1Rows
      .filter(row => ['C', 'D', 'F'].includes(grade(row) ?? ''))
      .map(row => lowRowReport('edge_mix_1', row)),
    ...input.edgeMix2Rows
      .filter(row => ['C', 'D', 'F'].includes(grade(row) ?? ''))
      .map(row => lowRowReport('edge_mix_2', row)),
  ].sort((a, b) => a.corpus.localeCompare(b.corpus) || (a.score ?? 999) - (b.score ?? 999) || a.id.localeCompare(b.id));

  const stage69Gate = summarizeGate(input.stage69GatePath, input.stage69Gate);
  const stage70Gate = summarizeGate(input.stage70GatePath, input.stage70Gate);
  const stage70Documented =
    stage70Gate.failedGateKeys.includes('runtime_p95_wall') &&
    stage70Gate.failedGateKeys.includes('protected_file_regressions') &&
    str(asRecord(input.stage70Reconciliation.decision).status) !== 'ready_for_end_gate_planning';
  const checks = acceptanceChecks({
    legacy,
    edgeMixCombined,
    stage69Gate,
    stage70Documented,
    lowRows: candidateLowRows,
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      legacyRunDir: input.legacyRunDir,
      edgeMix1RunDir: input.edgeMix1RunDir,
      edgeMix2RunDir: input.edgeMix2RunDir,
      stage69ReconciliationPath: input.stage69ReconciliationPath,
      stage70ReconciliationPath: input.stage70ReconciliationPath,
      stage69GatePath: input.stage69GatePath,
      stage70GatePath: input.stage70GatePath,
    },
    summaries: { legacy, edgeMix1, edgeMix2, edgeMixCombined },
    gates: { stage69: stage69Gate, stage70: stage70Gate },
    stage70RejectedGuard: {
      documented: stage70Documented,
      reason: 'Stage 70 high-alt repeated figure-alt runtime guard was tested and rejected/not kept; Stage 69 remains the legacy acceptance reference.',
    },
    lowRows: candidateLowRows,
    debtDistribution: debtDistribution(candidateLowRows),
    acceptanceChecks: checks,
    decision: decision(checks),
    generatedArtifactPolicy: {
      generatedOutputCommitted: false,
      note: 'Generated Output artifacts, PDFs, reports, caches, and Base64 payloads are report inputs/outputs only and must remain uncommitted.',
    },
  };
}

function renderSummary(summary: Stage71RunSummary): string {
  return `mean ${summary.mean ?? 'n/a'}, median ${summary.median ?? 'n/a'}, p95 ${summary.p95WallMs ?? 'n/a'}ms, attempts ${summary.attempts}, grades ${JSON.stringify(summary.gradeDistribution)}, A/B ${summary.abCount}/${summary.count} (${summary.abPercent ?? 'n/a'}%), F ${summary.fCount}, FP applied ${summary.falsePositiveAppliedCount}`;
}

function renderLowRow(row: Stage71LowRow): string {
  const cats = row.lowCategories.map(category => `${category.key}:${category.score}`).join(', ') || 'none';
  return `| ${row.id} | ${row.corpus} | ${row.score ?? 'n/a'}/${row.grade ?? 'n/a'} | ${row.belowC ? 'yes' : 'no'} | ${row.bucket} | ${cats} |`;
}

export function renderStage71Markdown(report: Stage71Report): string {
  const lines = [
    '# Stage 71 Engine v2 General Acceptance Report',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Decision: **${report.decision.status}**`,
    '',
    'Decision reasons:',
    ...report.decision.reasons.map(reason => `- ${reason}`),
    '',
    '## Validation Runs',
    '',
    `- Legacy Stage 69: \`${report.inputs.legacyRunDir}\``,
    `- Edge mix 1 Stage 68: \`${report.inputs.edgeMix1RunDir}\``,
    `- Edge mix 2 Stage 68: \`${report.inputs.edgeMix2RunDir}\``,
    '',
    '## Summary Metrics',
    '',
    `- Legacy: ${renderSummary(report.summaries.legacy)}`,
    `- Edge mix 1: ${renderSummary(report.summaries.edgeMix1)}`,
    `- Edge mix 2: ${renderSummary(report.summaries.edgeMix2)}`,
    `- Edge mix combined: ${renderSummary(report.summaries.edgeMixCombined)}`,
    '',
    '## Gate Context',
    '',
    `- Stage 69 gate passed: ${report.gates.stage69.passed ?? 'n/a'}; failed gates: ${report.gates.stage69.failedGateKeys.join(', ') || 'none'}; protected regressions: ${report.gates.stage69.protectedRegressionCount ?? 'n/a'}`,
    `- Stage 70 guard experiment: ${report.stage70RejectedGuard.documented ? 'rejected/not kept' : 'not documented'}; Stage 70 failed gates: ${report.gates.stage70.failedGateKeys.join(', ') || 'none'}`,
    '',
    '## Acceptance Checks',
    '',
    '| Check | Passed | Detail |',
    '| --- | --- | --- |',
    ...Object.entries(report.acceptanceChecks).map(([key, check]) => `| ${key} | ${check.passed ? 'yes' : 'no'} | ${check.detail} |`),
    '',
    '## Debt Buckets',
    '',
    '```json',
    JSON.stringify(report.debtDistribution, null, 2),
    '```',
    '',
    '## C/D/F Inventory',
    '',
    '| Row | Corpus | Score/Grade | Below C | Debt Bucket | Low Categories |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...report.lowRows.map(renderLowRow),
    '',
    '## Generated Artifact Policy',
    '',
    `- Generated artifacts committed: ${report.generatedArtifactPolicy.generatedOutputCommitted}`,
    `- ${report.generatedArtifactPolicy.note}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function loadRows(runDir: string): Promise<BenchmarkRow[]> {
  const path = join(resolve(runDir), 'remediate.results.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as BenchmarkRow[] | { rows?: BenchmarkRow[]; results?: BenchmarkRow[] };
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : raw.results;
  if (!Array.isArray(rows)) throw new Error(`No remediation rows found in ${path}`);
  return rows;
}

async function readJson(path: string): Promise<JsonRecord> {
  return asRecord(JSON.parse(await readFile(resolve(path), 'utf8')) as unknown);
}

function parseArgs(argv: string[]): {
  legacyRun: string;
  edge1Run: string;
  edge2Run: string;
  stage69Reconciliation: string;
  stage70Reconciliation: string;
  stage69Gate: string;
  stage70Gate: string;
  outDir: string;
} {
  const args = {
    legacyRun: DEFAULT_LEGACY_RUN,
    edge1Run: DEFAULT_EDGE1_RUN,
    edge2Run: DEFAULT_EDGE2_RUN,
    stage69Reconciliation: DEFAULT_STAGE69_RECONCILIATION,
    stage70Reconciliation: DEFAULT_STAGE70_RECONCILIATION,
    stage69Gate: DEFAULT_STAGE69_GATE,
    stage70Gate: DEFAULT_STAGE70_GATE,
    outDir: DEFAULT_OUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--legacy-run') args.legacyRun = argv[++index] ?? args.legacyRun;
    else if (arg === '--edge1-run') args.edge1Run = argv[++index] ?? args.edge1Run;
    else if (arg === '--edge2-run') args.edge2Run = argv[++index] ?? args.edge2Run;
    else if (arg === '--stage69-reconciliation') args.stage69Reconciliation = argv[++index] ?? args.stage69Reconciliation;
    else if (arg === '--stage70-reconciliation') args.stage70Reconciliation = argv[++index] ?? args.stage70Reconciliation;
    else if (arg === '--stage69-gate') args.stage69Gate = argv[++index] ?? args.stage69Gate;
    else if (arg === '--stage70-gate') args.stage70Gate = argv[++index] ?? args.stage70Gate;
    else if (arg === '--out') args.outDir = argv[++index] ?? args.outDir;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const [legacyRows, edgeMix1Rows, edgeMix2Rows, stage69Reconciliation, stage70Reconciliation, stage69Gate, stage70Gate] = await Promise.all([
    loadRows(args.legacyRun),
    loadRows(args.edge1Run),
    loadRows(args.edge2Run),
    readJson(args.stage69Reconciliation),
    readJson(args.stage70Reconciliation),
    readJson(args.stage69Gate),
    readJson(args.stage70Gate),
  ]);
  const report = buildStage71Report({
    legacyRunDir: resolve(args.legacyRun),
    edgeMix1RunDir: resolve(args.edge1Run),
    edgeMix2RunDir: resolve(args.edge2Run),
    stage69ReconciliationPath: resolve(args.stage69Reconciliation),
    stage70ReconciliationPath: resolve(args.stage70Reconciliation),
    stage69GatePath: resolve(args.stage69Gate),
    stage70GatePath: resolve(args.stage70Gate),
    legacyRows,
    edgeMix1Rows,
    edgeMix2Rows,
    stage69Reconciliation,
    stage70Reconciliation,
    stage69Gate,
    stage70Gate,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage71-end-gate-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage71-end-gate-report.md'), renderStage71Markdown(report), 'utf8');
  console.log(`Wrote Stage 71 end-gate report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

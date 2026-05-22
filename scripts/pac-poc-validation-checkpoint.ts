#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_OUT = 'Output/pac-poc-validation-checkpoint-2026-05-21-r1';

export type ArtifactKind = 'baseline_report' | 'all_input_diagnostic' | 'missing_or_unknown';
export type CheckpointScope = 'original_50' | 'all_unique' | 'outside_holdout';
export type CheckpointStatus = 'pass' | 'fail' | 'incomplete';
export type OverallDecision = 'validation_gate_ready' | 'validation_not_passing' | 'validation_incomplete';

interface BaselineReportRow {
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  falsePositiveApplied?: number | null;
  error?: string | null;
}

interface BaselineReport {
  generatedAt?: string;
  inputDir?: string;
  outputDir?: string;
  flags?: { semantic?: boolean; writePdfs?: boolean };
  rows?: BaselineReportRow[];
  summary?: { count?: number; meanAfter?: number };
}

interface AllInputDiagnostic {
  generatedAt?: string;
  sourceRoot?: string;
  summary?: {
    processed?: number;
    mean?: number;
    median?: number;
    gradeDistribution?: Record<string, number>;
    rowsBelowTarget?: number;
    pointsNeededForTargetMean?: number;
    runtimeP95Ms?: number;
    runtimeMaxMs?: number;
  };
}

export interface ValidationCheckpointInput {
  scope: CheckpointScope;
  label: string;
  path?: string;
  minimumRows: number;
  targetMean?: number;
  requireFreshAfter?: string;
  runtimeReferencePath?: string;
}

export interface TimeoutOrErrorRow {
  file: string;
  error: string;
}

export interface ValidationCheckpointScopeReport {
  scope: CheckpointScope;
  label: string;
  path: string | null;
  artifactKind: ArtifactKind;
  status: CheckpointStatus;
  generatedAt: string | null;
  rowCount: number;
  completedRows: number;
  minimumRows: number;
  meanAllRows: number | null;
  meanCompletedRows: number | null;
  medianAllRows: number | null;
  targetMean: number | null;
  gradeDistribution: Record<string, number>;
  falsePositiveApplied: number | null;
  runtimeP95Ms: number | null;
  runtimeP95ReferenceMs: number | null;
  runtimeP95AllowedMs: number | null;
  runtimeP95ReferencePath: string | null;
  runtimeMaxMs: number | null;
  timeoutOrErrorRows: TimeoutOrErrorRow[];
  notes: string[];
}

export interface ValidationCheckpointReport {
  generatedAt: string;
  decision: {
    status: OverallDecision;
    reasons: string[];
  };
  scopes: ValidationCheckpointScopeReport[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function runtimeBound(referenceP95Ms: number): number {
  return referenceP95Ms + Math.max(referenceP95Ms * 0.03, 5000);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function runtimeP95FromArtifact(inputPath: string): Promise<{
  path: string | null;
  p95Ms: number | null;
}> {
  const artifactPath = await resolveArtifactPath(inputPath);
  if (!artifactPath) return { path: resolve(inputPath), p95Ms: null };
  const raw = await readJson(artifactPath);
  const rows = baselineRowsFromJson(raw);
  if (rows) {
    return {
      path: artifactPath,
      p95Ms: summarizeBaselineRows(rows).runtimeP95Ms,
    };
  }
  if (isRecord(raw) && isRecord(raw['summary'])) {
    const value = (raw['summary'] as Record<string, unknown>)['runtimeP95Ms'];
    return {
      path: artifactPath,
      p95Ms: typeof value === 'number' && Number.isFinite(value) ? value : null,
    };
  }
  return { path: artifactPath, p95Ms: null };
}

async function runtimeReferenceFor(input: ValidationCheckpointInput, currentP95Ms: number | null): Promise<{
  path: string | null;
  referenceP95Ms: number | null;
  allowedP95Ms: number | null;
  notes: string[];
}> {
  if (!input.runtimeReferencePath) {
    return { path: null, referenceP95Ms: null, allowedP95Ms: null, notes: [] };
  }
  const reference = await runtimeP95FromArtifact(input.runtimeReferencePath);
  if (reference.p95Ms === null) {
    return {
      path: reference.path,
      referenceP95Ms: null,
      allowedP95Ms: null,
      notes: ['runtime_reference_p95_unknown'],
    };
  }
  const allowedP95Ms = runtimeBound(reference.p95Ms);
  const notes: string[] = [];
  if (currentP95Ms === null) {
    notes.push('runtime_p95_unknown');
  } else if (currentP95Ms > allowedP95Ms) {
    notes.push(`runtime_p95_above_bound:${currentP95Ms}>${Math.round(allowedP95Ms)}`);
  }
  return {
    path: reference.path,
    referenceP95Ms: reference.p95Ms,
    allowedP95Ms,
    notes,
  };
}

async function resolveArtifactPath(inputPath: string): Promise<string | null> {
  const absolute = resolve(inputPath);
  if (await fileExists(absolute)) return absolute;
  if (!await directoryExists(absolute)) return null;
  for (const name of ['baseline_report.json', 'all-input-mean-diagnostic.json']) {
    const candidate = join(absolute, name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function baselineRowsFromJson(raw: unknown): BaselineReportRow[] | null {
  if (!isRecord(raw) || !Array.isArray(raw['rows'])) return null;
  return raw['rows'] as BaselineReportRow[];
}

function summarizeBaselineRows(rows: BaselineReportRow[]) {
  const allScores = rows.map(row => typeof row.afterScore === 'number' && Number.isFinite(row.afterScore) ? row.afterScore : 0);
  const completedScores = rows
    .filter(row => !row.error)
    .map(row => row.afterScore)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const gradeDistribution: Record<string, number> = {};
  const timeoutOrErrorRows: TimeoutOrErrorRow[] = [];
  const durations: number[] = [];
  let falsePositiveApplied = 0;
  for (const row of rows) {
    const grade = row.afterGrade ?? (typeof row.afterScore === 'number' ? '?' : '?');
    gradeDistribution[grade] = (gradeDistribution[grade] ?? 0) + 1;
    if (typeof row.durationMs === 'number' && Number.isFinite(row.durationMs)) durations.push(row.durationMs);
    falsePositiveApplied += typeof row.falsePositiveApplied === 'number' && Number.isFinite(row.falsePositiveApplied)
      ? row.falsePositiveApplied
      : 0;
    if (row.error || typeof row.afterScore !== 'number') {
      timeoutOrErrorRows.push({
        file: row.file ?? 'unknown',
        error: row.error ?? 'missing_after_score',
      });
    }
  }
  return {
    rowCount: rows.length,
    completedRows: completedScores.length,
    meanAllRows: allScores.length ? round4(allScores.reduce((sum, value) => sum + value, 0) / allScores.length) : null,
    meanCompletedRows: completedScores.length
      ? round4(completedScores.reduce((sum, value) => sum + value, 0) / completedScores.length)
      : null,
    medianAllRows: median(allScores),
    gradeDistribution,
    falsePositiveApplied,
    runtimeP95Ms: percentile(durations, 95),
    runtimeMaxMs: durations.length ? Math.max(...durations) : null,
    timeoutOrErrorRows,
  };
}

async function summarizeBaselineReport(input: ValidationCheckpointInput, path: string): Promise<ValidationCheckpointScopeReport> {
  const raw = await readJson(path);
  const report = raw as BaselineReport;
  const rows = baselineRowsFromJson(raw) ?? [];
  const summary = summarizeBaselineRows(rows);
  const runtimeReference = await runtimeReferenceFor(input, summary.runtimeP95Ms);
  const notes: string[] = [];
  if (report.flags?.semantic === true) notes.push('semantic_enabled');
  if (report.flags?.writePdfs === true) notes.push('write_pdfs_enabled');
  if (summary.rowCount < input.minimumRows) notes.push(`minimum_rows_not_met:${summary.rowCount}<${input.minimumRows}`);
  if (summary.falsePositiveApplied !== 0) notes.push(`false_positive_applied=${summary.falsePositiveApplied}`);
  if (input.targetMean !== undefined && (summary.meanAllRows ?? -Infinity) < input.targetMean) {
    notes.push(`mean_below_target:${summary.meanAllRows ?? 'n/a'}<${input.targetMean}`);
  }
  notes.push(...runtimeReference.notes);
  const status = notes.some(note =>
    note.startsWith('minimum_rows_not_met') ||
    note.startsWith('false_positive_applied') ||
    note.startsWith('mean_below_target') ||
    note.startsWith('runtime_reference_p95_unknown') ||
    note.startsWith('runtime_p95_unknown') ||
    note.startsWith('runtime_p95_above_bound')
  ) ? 'fail' : 'pass';
  return {
    scope: input.scope,
    label: input.label,
    path,
    artifactKind: 'baseline_report',
    status,
    generatedAt: report.generatedAt ?? null,
    rowCount: summary.rowCount,
    completedRows: summary.completedRows,
    minimumRows: input.minimumRows,
    meanAllRows: summary.meanAllRows,
    meanCompletedRows: summary.meanCompletedRows,
    medianAllRows: summary.medianAllRows,
    targetMean: input.targetMean ?? null,
    gradeDistribution: summary.gradeDistribution,
    falsePositiveApplied: summary.falsePositiveApplied,
    runtimeP95Ms: summary.runtimeP95Ms,
    runtimeP95ReferenceMs: runtimeReference.referenceP95Ms,
    runtimeP95AllowedMs: runtimeReference.allowedP95Ms,
    runtimeP95ReferencePath: runtimeReference.path,
    runtimeMaxMs: summary.runtimeMaxMs,
    timeoutOrErrorRows: summary.timeoutOrErrorRows,
    notes,
  };
}

async function loadBaselineReportsUnder(root: string): Promise<BaselineReport[]> {
  const absolute = resolve(root);
  if (await fileExists(absolute)) {
    const raw = await readJson(absolute);
    return baselineRowsFromJson(raw) ? [raw as BaselineReport] : [];
  }
  if (!await directoryExists(absolute)) return [];
  const paths = await findFilesNamed(absolute, 'baseline_report.json');
  const reports: BaselineReport[] = [];
  for (const path of paths.sort((a, b) => a.localeCompare(b))) {
    const raw = await readJson(path);
    if (baselineRowsFromJson(raw)) reports.push(raw as BaselineReport);
  }
  return reports;
}

async function findFilesNamed(root: string, filename: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name === filename) {
        out.push(path);
      }
    }
  }
  await walk(root);
  return out;
}

async function summarizeFalsePositiveFromSourceRoot(sourceRoot: string | undefined): Promise<{
  falsePositiveApplied: number | null;
  timeoutOrErrorRows: TimeoutOrErrorRow[];
}> {
  if (!sourceRoot) return { falsePositiveApplied: null, timeoutOrErrorRows: [] };
  const reports = await loadBaselineReportsUnder(sourceRoot);
  if (reports.length === 0) return { falsePositiveApplied: null, timeoutOrErrorRows: [] };
  let falsePositiveApplied = 0;
  const timeoutOrErrorRows: TimeoutOrErrorRow[] = [];
  for (const report of reports) {
    const rows = report.rows ?? [];
    const summary = summarizeBaselineRows(rows);
    falsePositiveApplied += summary.falsePositiveApplied;
    timeoutOrErrorRows.push(...summary.timeoutOrErrorRows);
  }
  return { falsePositiveApplied, timeoutOrErrorRows };
}

async function summarizeAllInputDiagnostic(input: ValidationCheckpointInput, path: string): Promise<ValidationCheckpointScopeReport> {
  const raw = await readJson(path) as AllInputDiagnostic;
  const summary = raw.summary ?? {};
  const sourceEvidence = await summarizeFalsePositiveFromSourceRoot(raw.sourceRoot);
  const rowCount = summary.processed ?? 0;
  const falsePositiveApplied = sourceEvidence.falsePositiveApplied;
  const currentP95Ms = typeof summary.runtimeP95Ms === 'number' ? summary.runtimeP95Ms : null;
  const runtimeReference = await runtimeReferenceFor(input, currentP95Ms);
  const notes: string[] = [];
  if (rowCount < input.minimumRows) notes.push(`minimum_rows_not_met:${rowCount}<${input.minimumRows}`);
  if (falsePositiveApplied === null) notes.push('false_positive_applied_unknown');
  else if (falsePositiveApplied !== 0) notes.push(`false_positive_applied=${falsePositiveApplied}`);
  if (input.targetMean !== undefined && typeof summary.mean === 'number' && summary.mean < input.targetMean) {
    notes.push(`mean_below_target:${summary.mean}<${input.targetMean}`);
  }
  if (input.targetMean !== undefined && typeof summary.mean !== 'number') notes.push('mean_unknown');
  notes.push(...runtimeReference.notes);
  const status = notes.some(note =>
    note.startsWith('minimum_rows_not_met') ||
    note.startsWith('false_positive_applied') ||
    note.startsWith('mean_below_target') ||
    note === 'mean_unknown' ||
    note.startsWith('runtime_reference_p95_unknown') ||
    note.startsWith('runtime_p95_unknown') ||
    note.startsWith('runtime_p95_above_bound')
  ) ? 'fail' : 'pass';
  return {
    scope: input.scope,
    label: input.label,
    path,
    artifactKind: 'all_input_diagnostic',
    status,
    generatedAt: raw.generatedAt ?? null,
    rowCount,
    completedRows: rowCount,
    minimumRows: input.minimumRows,
    meanAllRows: typeof summary.mean === 'number' ? summary.mean : null,
    meanCompletedRows: null,
    medianAllRows: typeof summary.median === 'number' ? summary.median : null,
    targetMean: input.targetMean ?? null,
    gradeDistribution: summary.gradeDistribution ?? {},
    falsePositiveApplied,
    runtimeP95Ms: currentP95Ms,
    runtimeP95ReferenceMs: runtimeReference.referenceP95Ms,
    runtimeP95AllowedMs: runtimeReference.allowedP95Ms,
    runtimeP95ReferencePath: runtimeReference.path,
    runtimeMaxMs: typeof summary.runtimeMaxMs === 'number' ? summary.runtimeMaxMs : null,
    timeoutOrErrorRows: sourceEvidence.timeoutOrErrorRows,
    notes,
  };
}

async function summarizeInput(input: ValidationCheckpointInput): Promise<ValidationCheckpointScopeReport> {
  if (!input.path) {
    return {
      scope: input.scope,
      label: input.label,
      path: null,
      artifactKind: 'missing_or_unknown',
      status: 'incomplete',
      generatedAt: null,
      rowCount: 0,
      completedRows: 0,
      minimumRows: input.minimumRows,
      meanAllRows: null,
      meanCompletedRows: null,
      medianAllRows: null,
      targetMean: input.targetMean ?? null,
      gradeDistribution: {},
      falsePositiveApplied: null,
      runtimeP95Ms: null,
      runtimeP95ReferenceMs: null,
      runtimeP95AllowedMs: null,
      runtimeP95ReferencePath: null,
      runtimeMaxMs: null,
      timeoutOrErrorRows: [],
      notes: ['artifact_missing'],
    };
  }
  const artifactPath = await resolveArtifactPath(input.path);
  if (!artifactPath) {
    return {
      scope: input.scope,
      label: input.label,
      path: resolve(input.path),
      artifactKind: 'missing_or_unknown',
      status: 'incomplete',
      generatedAt: null,
      rowCount: 0,
      completedRows: 0,
      minimumRows: input.minimumRows,
      meanAllRows: null,
      meanCompletedRows: null,
      medianAllRows: null,
      targetMean: input.targetMean ?? null,
      gradeDistribution: {},
      falsePositiveApplied: null,
      runtimeP95Ms: null,
      runtimeP95ReferenceMs: null,
      runtimeP95AllowedMs: null,
      runtimeP95ReferencePath: null,
      runtimeMaxMs: null,
      timeoutOrErrorRows: [],
      notes: ['artifact_missing'],
    };
  }
  const raw = await readJson(artifactPath);
  if (baselineRowsFromJson(raw)) return summarizeBaselineReport(input, artifactPath);
  if (isRecord(raw) && isRecord(raw['summary']) && typeof (raw['summary'] as Record<string, unknown>)['processed'] === 'number') {
    return summarizeAllInputDiagnostic(input, artifactPath);
  }
  return {
    scope: input.scope,
    label: input.label,
    path: artifactPath,
    artifactKind: 'missing_or_unknown',
    status: 'incomplete',
    generatedAt: null,
    rowCount: 0,
    completedRows: 0,
    minimumRows: input.minimumRows,
    meanAllRows: null,
    meanCompletedRows: null,
    medianAllRows: null,
    targetMean: input.targetMean ?? null,
    gradeDistribution: {},
    falsePositiveApplied: null,
    runtimeP95Ms: null,
    runtimeP95ReferenceMs: null,
    runtimeP95AllowedMs: null,
    runtimeP95ReferencePath: null,
    runtimeMaxMs: null,
    timeoutOrErrorRows: [],
    notes: ['unsupported_artifact_shape'],
  };
}

export async function buildValidationCheckpointReport(
  inputs: ValidationCheckpointInput[],
): Promise<ValidationCheckpointReport> {
  const scopes = [];
  for (const input of inputs) scopes.push(await summarizeInput(input));
  const incomplete = scopes.filter(scope => scope.status === 'incomplete');
  const failed = scopes.filter(scope => scope.status === 'fail');
  const status: OverallDecision = incomplete.length > 0
    ? 'validation_incomplete'
    : failed.length > 0
      ? 'validation_not_passing'
      : 'validation_gate_ready';
  const reasons = [
    `scopes=${scopes.length}`,
    `pass=${scopes.filter(scope => scope.status === 'pass').length}`,
    `fail=${failed.length}`,
    `incomplete=${incomplete.length}`,
  ];
  if (failed.length > 0) reasons.push(`failed_scopes=${failed.map(scope => scope.scope).join(',')}`);
  if (incomplete.length > 0) reasons.push(`incomplete_scopes=${incomplete.map(scope => scope.scope).join(',')}`);
  return {
    generatedAt: new Date().toISOString(),
    decision: { status, reasons },
    scopes,
  };
}

function formatNumber(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}

function mdEscape(value: string | number | null | undefined): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function gradeSummary(value: Record<string, number>): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return 'n/a';
  return entries.sort(([a], [b]) => a.localeCompare(b)).map(([grade, count]) => `${grade}:${count}`).join(' ');
}

export function renderValidationCheckpointMarkdown(report: ValidationCheckpointReport): string {
  const lines = [
    '# PAC/POC Validation Checkpoint',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'This report summarizes validation artifacts for the active PAC/POC alignment goal. It is an audit/reporting layer only: it does not run analysis, remediation, PAC/POC, ODL, Java, semantic AI, network checks, or PDF mutation.',
    '',
    '## Scope Summary',
    '',
    '| Scope | Label | Status | Rows | Completed | Mean All Rows | Completed Mean | Median | Target | False Positives | p95 ms | p95 Ref | p95 Allowed | Notes |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const scope of report.scopes) {
    lines.push([
      scope.scope,
      scope.label,
      scope.status,
      scope.rowCount,
      scope.completedRows,
      formatNumber(scope.meanAllRows),
      formatNumber(scope.meanCompletedRows),
      formatNumber(scope.medianAllRows),
      formatNumber(scope.targetMean),
      formatNumber(scope.falsePositiveApplied),
      formatNumber(scope.runtimeP95Ms),
      formatNumber(scope.runtimeP95ReferenceMs),
      formatNumber(scope.runtimeP95AllowedMs === null ? null : Math.round(scope.runtimeP95AllowedMs)),
      scope.notes.length ? scope.notes.join(', ') : 'none',
    ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Artifacts', '');
  for (const scope of report.scopes) {
    lines.push(
      `### ${scope.scope}`,
      '',
      `- Label: ${scope.label}`,
      `- Path: ${scope.path ? `\`${scope.path}\`` : '`missing`'}`,
      `- Artifact kind: \`${scope.artifactKind}\``,
      `- Generated: ${scope.generatedAt ?? 'n/a'}`,
      `- Grade distribution: ${gradeSummary(scope.gradeDistribution)}`,
      `- Runtime max ms: ${formatNumber(scope.runtimeMaxMs)}`,
      `- Runtime p95 reference: ${scope.runtimeP95ReferencePath ? `\`${scope.runtimeP95ReferencePath}\`` : '`none`'}`,
      `- Timeout/error rows: ${scope.timeoutOrErrorRows.length}`,
      '',
    );
    for (const row of scope.timeoutOrErrorRows.slice(0, 20)) {
      lines.push(`  - \`${row.file}\`: ${row.error}`);
    }
    if (scope.timeoutOrErrorRows.length > 20) {
      lines.push(`  - +${scope.timeoutOrErrorRows.length - 20} more`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeValidationCheckpointReport(
  inputs: ValidationCheckpointInput[],
  outDir: string,
): Promise<ValidationCheckpointReport> {
  const report = await buildValidationCheckpointReport(inputs);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-poc-validation-checkpoint.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-poc-validation-checkpoint.md'), renderValidationCheckpointMarkdown(report), 'utf8');
  return report;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/pac-poc-validation-checkpoint.ts [options]

Options:
  --original <path>       baseline_report.json or directory for original-50 validation
  --all-unique <path>     all-input-mean-diagnostic.json or directory for all-unique validation
  --outside <path>        baseline_report.json or directory for outside holdout validation
  --original-runtime-reference <path>   Runtime p95 reference for original-50
  --all-unique-runtime-reference <path> Runtime p95 reference for all-unique
  --outside-runtime-reference <path>    Runtime p95 reference for outside holdout
  --out <dir>             Output directory (default: ${DEFAULT_OUT})
  --help                  Show this help`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const inputs: ValidationCheckpointInput[] = [
    {
      scope: 'original_50',
      label: 'original-50 deterministic validation artifact',
      path: argValue('--original'),
      minimumRows: 50,
      runtimeReferencePath: argValue('--original-runtime-reference'),
    },
    {
      scope: 'all_unique',
      label: 'all-unique validation artifact',
      path: argValue('--all-unique'),
      minimumRows: 351,
      targetMean: 93,
      runtimeReferencePath: argValue('--all-unique-runtime-reference'),
    },
    {
      scope: 'outside_holdout',
      label: 'outside public-source holdout artifact',
      path: argValue('--outside'),
      minimumRows: 20,
      targetMean: 93,
      runtimeReferencePath: argValue('--outside-runtime-reference'),
    },
  ];
  const report = await writeValidationCheckpointReport(inputs, outDir);
  console.log(`[pac-poc-validation] wrote ${join(outDir, 'pac-poc-validation-checkpoint.md')}`);
  console.log(`[pac-poc-validation] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

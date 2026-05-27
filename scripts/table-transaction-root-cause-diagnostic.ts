#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);
const TABLE_PAC_RULES = new Set(['pdfua.table.header_association_present', 'pdfua.table.header_cells_associated']);
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';

type JsonRecord = Record<string, unknown>;

export type TableTransactionClassification =
  | 'strict_transaction_candidate'
  | 'non_table_target_blocked'
  | 'pac_table_regression_only'
  | 'non_target_pac_regression'
  | 'control_triggered'
  | 'runtime_or_analyzer_debt'
  | 'no_safe_transaction';

export interface TableTransactionAttempt {
  toolName: string;
  outcome: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  targetRefs: string[];
  requestedTargetRefs: string[];
  targetResolved: boolean | null;
  resolvedRole: string | null;
  tableTreeValidAfter: boolean | null;
  headerAssociationMissingBefore: number | null;
  headerAssociationMissingAfter: number | null;
  dataCellsWithoutHeaderBefore: number | null;
  dataCellsWithoutHeaderAfter: number | null;
  directCellsUnderTableBefore: number | null;
  directCellsUnderTableAfter: number | null;
  irregularRowsBefore: number | null;
  irregularRowsAfter: number | null;
  tablePacRegressions: string[];
  nonTablePacRegressions: string[];
  note: string | null;
}

export interface TableTransactionRowInput {
  id: string;
  role: 'focus' | 'control';
  score: number | null;
  grade: string | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  error: string | null;
  timedOut: boolean;
  attempts: TableTransactionAttempt[];
  analysisError?: string | null;
}

export interface TableTransactionRowDiagnostic extends TableTransactionRowInput {
  file: string;
  pdfPath: string | null;
  classification: TableTransactionClassification;
  promotionSupported: boolean;
  reasons: string[];
  native?: NativeTableSnapshot | null;
}

export interface NativeTableSnapshot {
  score: number;
  grade: string;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  tableCount: number;
  tablePacFailures: string[];
}

export interface TableTransactionReport {
  generatedAt: string;
  run: string;
  outDir: string;
  analyzePdfs: boolean;
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    byClassification: Record<TableTransactionClassification, number>;
    strictTransactionCandidates: string[];
    nonTableTargetBlocked: string[];
    controlTriggered: string[];
    nonTargetPacRegression: string[];
  };
  decision: {
    status: 'plan_strict_transaction_behavior' | 'diagnostic_only';
    reasons: string[];
  };
  rows: TableTransactionRowDiagnostic[];
}

interface ParsedArgs {
  run: string;
  outDir: string;
  pdfs: Map<string, string>;
  controls: Set<string>;
  analyzePdfs: boolean;
}

interface BoundedRow {
  file?: unknown;
  afterScore?: unknown;
  afterGrade?: unknown;
  durationMs?: unknown;
  categoryGap?: unknown;
  appliedTools?: unknown;
  error?: unknown;
  boundedRunner?: unknown;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-transaction-root-cause-diagnostic.ts --run <baseline_report.json> [options]

Options:
  --out <dir>        Output directory (default: ${DEFAULT_OUT_ROOT}/table-transaction-root-cause-<timestamp>)
  --pdf <id=path>    Focus row PDF path; repeatable. If no role is supplied, report rows are focus rows.
  --control <id=path>
                    Control row PDF path; repeatable.
  --no-analyze       Do not run native analyzePdf on supplied PDF paths.
  --help             Show this help.`;
}

function parseInlinePdf(value: string): { id: string; path: string } {
  const eq = value.indexOf('=');
  if (eq <= 0) throw new Error(`Expected id=path, got ${value}`);
  const id = value.slice(0, eq).trim();
  const path = value.slice(eq + 1).trim();
  if (!id || !path) throw new Error(`Expected id=path, got ${value}`);
  return { id, path: resolve(path) };
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()): ParsedArgs {
  let run = '';
  let outDir = join(DEFAULT_OUT_ROOT, `table-transaction-root-cause-${timestampSlug(now)}`);
  const pdfs = new Map<string, string>();
  const controls = new Set<string>();
  let analyzePdfs = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--run') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --run value\n${usage()}`);
      run = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --pdf value\n${usage()}`);
      const parsed = parseInlinePdf(value);
      pdfs.set(parsed.id, parsed.path);
    } else if (arg === '--control') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --control value\n${usage()}`);
      const parsed = parseInlinePdf(value);
      pdfs.set(parsed.id, parsed.path);
      controls.add(parsed.id);
    } else if (arg === '--no-analyze') {
      analyzePdfs = false;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  if (!run) throw new Error(`Missing --run\n${usage()}`);
  return { run, outDir: resolve(outDir), pdfs, controls, analyzePdfs };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function objectValue(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseJsonObject(value: unknown): JsonRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return objectValue(parsed);
  } catch {
    return null;
  }
}

function normalizeRole(value: string | null): string | null {
  return value?.replace(/^\//, '').trim() || null;
}

function asStringArray(value: unknown): string[] {
  const out: string[] = [];
  for (const item of arrayValue(value)) {
    const text = stringValue(item);
    if (text && !out.includes(text)) out.push(text);
  }
  const single = stringValue(value);
  if (single && !out.includes(single)) out.push(single);
  return out;
}

function mergeRefs(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const ref of asStringArray(value)) {
      if (ref && !out.includes(ref)) out.push(ref);
    }
  }
  return out;
}

function nestedObject(root: JsonRecord | null, path: string[]): JsonRecord | null {
  let current: unknown = root;
  for (const key of path) {
    const obj = objectValue(current);
    if (!obj) return null;
    current = obj[key];
  }
  return objectValue(current);
}

function nestedNumber(root: JsonRecord | null, path: string[]): number | null {
  let current: unknown = root;
  for (const key of path) {
    const obj = objectValue(current);
    if (!obj) return null;
    current = obj[key];
  }
  return numberValue(current);
}

function categoryScoreFromGap(row: BoundedRow, key: string): number | null {
  const gap = objectValue(row.categoryGap);
  const after = arrayValue(gap?.['after']);
  for (const item of after) {
    const obj = objectValue(item);
    if (obj?.['key'] === key) return numberValue(obj['score']);
  }
  return null;
}

function ruleIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const ids: string[] = [];
  for (const item of values) {
    const obj = objectValue(item);
    const id = stringValue(obj?.['ruleId']);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function extractPacRegressions(details: JsonRecord | null): string[] {
  return [
    ...ruleIds(details?.['pacRuleRegression']),
    ...ruleIds(details?.['pacRuleRegressions']),
  ].filter((id, index, arr) => arr.indexOf(id) === index);
}

function extractAttempt(tool: JsonRecord): TableTransactionAttempt | null {
  const toolName = stringValue(tool['toolName']);
  if (!toolName || !TABLE_TOOLS.has(toolName)) return null;

  const details = parseJsonObject(tool['details']);
  const invariants = objectValue(details?.['invariants']);
  const mutation = objectValue(details?.['mutation']);
  const mutationInvariants = objectValue(mutation?.['invariants']);
  const debug = objectValue(details?.['debug']);
  const replay = objectValue(debug?.['replayState']);
  const pacRegressions = extractPacRegressions(details);
  const targetRefs = mergeRefs(
    details?.['targetRef'],
    details?.['targetRefs'],
    invariants?.['targetRef'],
    invariants?.['targetRefs'],
    mutation?.['targetRef'],
    mutation?.['targetRefs'],
    mutationInvariants?.['targetRef'],
    mutationInvariants?.['targetRefs'],
  );
  const requestedTargetRefs = mergeRefs(
    details?.['requestedTargetRefs'],
    invariants?.['requestedTargetRefs'],
    mutation?.['requestedTargetRefs'],
    mutationInvariants?.['requestedTargetRefs'],
    targetRefs,
  );
  const resolvedRole = normalizeRole(
    stringValue(invariants?.['resolvedRole']) ??
    stringValue(mutationInvariants?.['resolvedRole']) ??
    stringValue(mutation?.['resolvedRole']),
  );
  const targetResolved = boolValue(invariants?.['targetResolved']) ??
    boolValue(mutationInvariants?.['targetResolved']) ??
    boolValue(mutation?.['targetResolved']);

  return {
    toolName,
    outcome: stringValue(tool['outcome']) ?? stringValue(details?.['outcome']),
    scoreBefore: numberValue(tool['scoreBefore']) ?? nestedNumber(replay, ['scoreBefore']),
    scoreAfter: numberValue(tool['scoreAfter']) ?? nestedNumber(replay, ['scoreAfter']),
    targetRefs,
    requestedTargetRefs,
    targetResolved,
    resolvedRole,
    tableTreeValidAfter: boolValue(invariants?.['tableTreeValidAfter']) ?? boolValue(mutationInvariants?.['tableTreeValidAfter']),
    headerAssociationMissingBefore: numberValue(invariants?.['headerAssociationMissingCountBefore']) ?? numberValue(mutationInvariants?.['headerAssociationMissingCountBefore']),
    headerAssociationMissingAfter: numberValue(invariants?.['headerAssociationMissingCountAfter']) ?? numberValue(mutationInvariants?.['headerAssociationMissingCountAfter']),
    dataCellsWithoutHeaderBefore: numberValue(invariants?.['dataCellsWithoutHeaderCountBefore']) ?? numberValue(mutationInvariants?.['dataCellsWithoutHeaderCountBefore']),
    dataCellsWithoutHeaderAfter: numberValue(invariants?.['dataCellsWithoutHeaderCountAfter']) ?? numberValue(mutationInvariants?.['dataCellsWithoutHeaderCountAfter']),
    directCellsUnderTableBefore: numberValue(invariants?.['directCellsUnderTableBefore']) ?? numberValue(mutationInvariants?.['directCellsUnderTableBefore']),
    directCellsUnderTableAfter: numberValue(invariants?.['directCellsUnderTableAfter']) ?? numberValue(mutationInvariants?.['directCellsUnderTableAfter']),
    irregularRowsBefore: numberValue(invariants?.['irregularRowsBefore']) ?? numberValue(mutationInvariants?.['irregularRowsBefore']),
    irregularRowsAfter: numberValue(invariants?.['irregularRowsAfter']) ?? numberValue(mutationInvariants?.['irregularRowsAfter']),
    tablePacRegressions: pacRegressions.filter(id => TABLE_PAC_RULES.has(id)),
    nonTablePacRegressions: pacRegressions.filter(id => !TABLE_PAC_RULES.has(id)),
    note: stringValue(details?.['note']) ?? stringValue(mutation?.['note']),
  };
}

function attemptImprovesTableEvidence(attempt: TableTransactionAttempt): boolean {
  const assocImproves = (
    attempt.headerAssociationMissingBefore !== null &&
    attempt.headerAssociationMissingAfter !== null &&
    attempt.headerAssociationMissingAfter < attempt.headerAssociationMissingBefore
  ) || (
    attempt.dataCellsWithoutHeaderBefore !== null &&
    attempt.dataCellsWithoutHeaderAfter !== null &&
    attempt.dataCellsWithoutHeaderAfter < attempt.dataCellsWithoutHeaderBefore
  );
  const shapeImproves = (
    attempt.directCellsUnderTableBefore !== null &&
    attempt.directCellsUnderTableAfter !== null &&
    attempt.directCellsUnderTableAfter < attempt.directCellsUnderTableBefore
  ) || (
    attempt.irregularRowsBefore !== null &&
    attempt.irregularRowsAfter !== null &&
    attempt.irregularRowsAfter < attempt.irregularRowsBefore
  );
  return assocImproves || shapeImproves || attempt.tableTreeValidAfter === true;
}

function hasNonTableTarget(attempt: TableTransactionAttempt): boolean {
  const role = attempt.resolvedRole?.toUpperCase() ?? null;
  return attempt.targetResolved === true && role !== null && role !== 'TABLE';
}

export function classifyTableTransactionRow(input: TableTransactionRowInput): {
  classification: TableTransactionClassification;
  promotionSupported: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.timedOut || input.error || input.analysisError) {
    if (input.timedOut) reasons.push('row_timeout');
    if (input.error) reasons.push(`row_error:${input.error}`);
    if (input.analysisError) reasons.push(`analysis_error:${input.analysisError}`);
    return { classification: 'runtime_or_analyzer_debt', promotionSupported: false, reasons };
  }

  if (input.attempts.length === 0) {
    reasons.push('no_table_tools_attempted');
    return { classification: 'no_safe_transaction', promotionSupported: false, reasons };
  }

  const nonTableAttempts = input.attempts.filter(hasNonTableTarget);
  if (nonTableAttempts.length > 0) {
    reasons.push(...nonTableAttempts.map(attempt =>
      `${attempt.toolName}:${attempt.requestedTargetRefs.join(',') || attempt.targetRefs.join(',') || 'unknown'}:${attempt.resolvedRole ?? 'unknown'}`,
    ));
    return { classification: 'non_table_target_blocked', promotionSupported: false, reasons };
  }

  const nonTablePac = input.attempts.flatMap(attempt => attempt.nonTablePacRegressions);
  if (nonTablePac.length > 0) {
    reasons.push(...[...new Set(nonTablePac)].map(rule => `non_table_pac_regression:${rule}`));
    return { classification: 'non_target_pac_regression', promotionSupported: false, reasons };
  }

  const tablePac = input.attempts.flatMap(attempt => attempt.tablePacRegressions);
  const tableEvidenceImproved = input.attempts.some(attemptImprovesTableEvidence);
  if (input.role === 'control') {
    reasons.push(tableEvidenceImproved ? 'control_table_mutation_or_table_movement' : 'control_table_attempted');
    return { classification: 'control_triggered', promotionSupported: false, reasons };
  }

  if (tablePac.length > 0) {
    reasons.push(...[...new Set(tablePac)].map(rule => `table_pac_regression:${rule}`));
    if (tableEvidenceImproved) reasons.push('table_evidence_improved_before_rejection');
    return {
      classification: tableEvidenceImproved ? 'strict_transaction_candidate' : 'pac_table_regression_only',
      promotionSupported: tableEvidenceImproved,
      reasons,
    };
  }

  const lowTable = input.tableMarkup !== null && input.tableMarkup < 90;
  if (tableEvidenceImproved && lowTable) {
    reasons.push('table_evidence_improved_but_final_table_score_still_low');
    return { classification: 'strict_transaction_candidate', promotionSupported: true, reasons };
  }

  reasons.push('table_attempts_do_not_support_strict_transaction');
  return { classification: 'no_safe_transaction', promotionSupported: false, reasons };
}

function idFromFile(file: string): string {
  return basename(file).replace(/\.pdf$/i, '');
}

function boundedTimedOut(row: BoundedRow): boolean {
  const runner = objectValue(row.boundedRunner);
  return boolValue(runner?.['timedOut']) === true;
}

function boundedError(row: BoundedRow): string | null {
  return stringValue(row.error) ?? stringValue(objectValue(row.boundedRunner)?.['error']);
}

function nativeTableSnapshot(result: AnalysisResult, snapshot: DocumentSnapshot): NativeTableSnapshot {
  const tablePacFailures = buildPacRuleEvidence(snapshot)
    .filter(rule => rule.status === 'fail' && TABLE_PAC_RULES.has(rule.ruleId))
    .map(rule => rule.ruleId)
    .filter((id, index, arr) => arr.indexOf(id) === index);
  return {
    score: result.score,
    grade: result.grade,
    tableMarkup: result.categories.find(category => category.key === 'table_markup')?.score ?? null,
    pdfUaCompliance: result.categories.find(category => category.key === 'pdf_ua_compliance')?.score ?? null,
    tableCount: snapshot.tables.length,
    tablePacFailures,
  };
}

async function analyzeNative(pdfPath: string): Promise<{ native: NativeTableSnapshot | null; error: string | null }> {
  try {
    await access(pdfPath);
    const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), {
      bypassCache: true,
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
    });
    return { native: nativeTableSnapshot(result, snapshot), error: null };
  } catch (error) {
    return { native: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function buildReport(args: ParsedArgs): Promise<TableTransactionReport> {
  const parsed = JSON.parse(await readFile(args.run, 'utf8')) as { rows?: unknown };
  const rows = arrayValue(parsed.rows) as BoundedRow[];
  const diagnostics: TableTransactionRowDiagnostic[] = [];

  for (const row of rows) {
    const file = stringValue(row.file) ?? 'unknown.pdf';
    const id = idFromFile(file);
    const pdfPath = args.pdfs.get(id) ?? null;
    const role = args.controls.has(id) ? 'control' : 'focus';
    const attempts = arrayValue(row.appliedTools).map(objectValue).filter((item): item is JsonRecord => Boolean(item)).map(extractAttempt).filter((item): item is TableTransactionAttempt => Boolean(item));
    let native: NativeTableSnapshot | null = null;
    let analysisError: string | null = null;
    if (args.analyzePdfs && pdfPath) {
      const analyzed = await analyzeNative(pdfPath);
      native = analyzed.native;
      analysisError = analyzed.error;
    }

    const input: TableTransactionRowInput = {
      id,
      role,
      score: numberValue(row.afterScore),
      grade: stringValue(row.afterGrade),
      tableMarkup: categoryScoreFromGap(row, 'table_markup'),
      pdfUaCompliance: categoryScoreFromGap(row, 'pdf_ua_compliance'),
      error: boundedError(row),
      timedOut: boundedTimedOut(row),
      attempts,
      analysisError,
    };
    const classified = classifyTableTransactionRow(input);
    diagnostics.push({
      ...input,
      file,
      pdfPath,
      ...classified,
      native,
    });
  }

  const byClassification = Object.fromEntries(
    ([
      'strict_transaction_candidate',
      'non_table_target_blocked',
      'pac_table_regression_only',
      'non_target_pac_regression',
      'control_triggered',
      'runtime_or_analyzer_debt',
      'no_safe_transaction',
    ] as TableTransactionClassification[]).map(key => [key, diagnostics.filter(row => row.classification === key).length]),
  ) as Record<TableTransactionClassification, number>;

  const strictTransactionCandidates = diagnostics.filter(row => row.classification === 'strict_transaction_candidate').map(row => row.id);
  const controlTriggered = diagnostics.filter(row => row.classification === 'control_triggered').map(row => row.id);
  const nonTableTargetBlocked = diagnostics.filter(row => row.classification === 'non_table_target_blocked').map(row => row.id);
  const nonTargetPacRegression = diagnostics.filter(row => row.classification === 'non_target_pac_regression').map(row => row.id);
  const decisionReasons: string[] = [];
  if (strictTransactionCandidates.length < 2) decisionReasons.push('fewer_than_two_strict_transaction_candidates');
  if (controlTriggered.length > 0) decisionReasons.push('controls_trigger_table_transaction');
  if (nonTableTargetBlocked.length > 0) decisionReasons.push('non_table_target_resolution_present');
  if (nonTargetPacRegression.length > 0) decisionReasons.push('non_target_pac_regression_present');
  const status = decisionReasons.length === 0 ? 'plan_strict_transaction_behavior' : 'diagnostic_only';

  return {
    generatedAt: new Date().toISOString(),
    run: args.run,
    outDir: args.outDir,
    analyzePdfs: args.analyzePdfs,
    summary: {
      rowCount: diagnostics.length,
      focusCount: diagnostics.filter(row => row.role === 'focus').length,
      controlCount: diagnostics.filter(row => row.role === 'control').length,
      byClassification,
      strictTransactionCandidates,
      nonTableTargetBlocked,
      controlTriggered,
      nonTargetPacRegression,
    },
    decision: {
      status,
      reasons: status === 'plan_strict_transaction_behavior' ? ['strict_transaction_candidates_clean_against_controls'] : decisionReasons,
    },
    rows: diagnostics,
  };
}

function md(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace(/\|/g, '\\|');
}

function writeMarkdown(report: TableTransactionReport): string {
  const lines: string[] = [];
  lines.push('# Table Transaction Root-Cause Diagnostic');
  lines.push('');
  lines.push(`- Generated: \`${report.generatedAt}\``);
  lines.push(`- Run: \`${report.run}\``);
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Classification | Rows |');
  lines.push('| --- | ---: |');
  for (const [key, count] of Object.entries(report.summary.byClassification)) {
    lines.push(`| \`${key}\` | ${count} |`);
  }
  lines.push('');
  lines.push(`- Strict transaction candidates: ${report.summary.strictTransactionCandidates.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Non-table target blocked: ${report.summary.nonTableTargetBlocked.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Controls triggered: ${report.summary.controlTriggered.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Non-target PAC regressions: ${report.summary.nonTargetPacRegression.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| ID | Role | Score | Table | PDF/UA | Attempts | Classification | Reasons |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| \`${md(row.id)}\` | ${row.role} | ${md(row.score)} | ${md(row.tableMarkup)} | ${md(row.pdfUaCompliance)} | ${row.attempts.length} | \`${row.classification}\` | ${row.reasons.map(reason => `\`${md(reason)}\``).join(', ')} |`);
  }
  lines.push('');
  lines.push('## Table Attempts');
  for (const row of report.rows.filter(row => row.attempts.length > 0)) {
    lines.push('');
    lines.push(`### ${row.id}`);
    lines.push('');
    lines.push('| Tool | Outcome | Score | Requested Refs | Resolved Role | Table PAC Regressions | Non-Table PAC Regressions | Invariant Movement |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const attempt of row.attempts) {
      const movement = [
        `assoc:${attempt.headerAssociationMissingBefore ?? ''}->${attempt.headerAssociationMissingAfter ?? ''}`,
        `tdNoHeader:${attempt.dataCellsWithoutHeaderBefore ?? ''}->${attempt.dataCellsWithoutHeaderAfter ?? ''}`,
        `direct:${attempt.directCellsUnderTableBefore ?? ''}->${attempt.directCellsUnderTableAfter ?? ''}`,
        `irregular:${attempt.irregularRowsBefore ?? ''}->${attempt.irregularRowsAfter ?? ''}`,
      ].join('; ');
      lines.push(`| \`${attempt.toolName}\` | ${md(attempt.outcome)} | ${md(attempt.scoreBefore)}->${md(attempt.scoreAfter)} | ${md(attempt.requestedTargetRefs.join(', ') || attempt.targetRefs.join(', '))} | ${md(attempt.resolvedRole)} | ${md(attempt.tablePacRegressions.join(', '))} | ${md(attempt.nonTablePacRegressions.join(', '))} | ${md(movement)} |`);
    }
  }
  lines.push('');
  lines.push('This diagnostic is reporting-only. It does not remediate PDFs, write remediated PDFs, change scoring, call ODL/PAC/POC, or call semantic AI.');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await buildReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'table-transaction-root-cause.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.outDir, 'table-transaction-root-cause.md'), writeMarkdown(report));
  console.log(`Wrote ${join(args.outDir, 'table-transaction-root-cause.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

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
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';

type JsonRecord = Record<string, unknown>;

export type TableTransactionClassification =
  | 'valid_table_no_final_cleanup'
  | 'planner_wrong_ref'
  | 'mixed_batch_refs'
  | 'control_table_side_effect'
  | 'non_table_pac_side_effect'
  | 'table_header_pac_only'
  | 'runtime_or_analyzer_debt'
  | 'no_safe_transaction';

const TABLE_TRANSACTION_CLASSIFICATIONS: TableTransactionClassification[] = [
  'valid_table_no_final_cleanup',
  'planner_wrong_ref',
  'mixed_batch_refs',
  'control_table_side_effect',
  'non_table_pac_side_effect',
  'table_header_pac_only',
  'runtime_or_analyzer_debt',
  'no_safe_transaction',
];

export type PacRegressionFamily =
  | 'table_header'
  | 'figure_alt'
  | 'orphan_mcid'
  | 'link_annotation'
  | 'reading_order'
  | 'unknown';

export interface TableTargetRefDetail {
  ref: string;
  targetResolved: boolean | null;
  rawRole: string | null;
  resolvedRole: string | null;
  targetReachable: boolean | null;
  isTable: boolean | null;
  resolvedIsTable: boolean | null;
  skipReason: string | null;
}

export interface TableTransactionAttempt {
  toolName: string;
  outcome: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  targetRefs: string[];
  requestedTargetRefs: string[];
  changedTargetRefs: string[];
  skippedTargetRefs: string[];
  targetRefDetails: TableTargetRefDetail[];
  targetRefDetailsBefore: TableTargetRefDetail[];
  targetRefDetailsAfter: TableTargetRefDetail[];
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
  pacRegressionFamilies: Record<PacRegressionFamily, string[]>;
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
  laterStrictTransactionSafe: boolean;
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
    laterStrictTransactionCandidates: string[];
    plannerWrongRef: string[];
    mixedBatchRefs: string[];
    controlsWithTableSideEffects: string[];
    nonTablePacSideEffects: string[];
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

function parseTargetRefDetail(value: unknown): TableTargetRefDetail | null {
  const obj = objectValue(value);
  if (!obj) return null;
  const ref = stringValue(obj['ref']) ?? stringValue(obj['targetRef']);
  if (!ref) return null;
  return {
    ref,
    targetResolved: boolValue(obj['targetResolved']),
    rawRole: normalizeRole(stringValue(obj['rawRole'])),
    resolvedRole: normalizeRole(stringValue(obj['resolvedRole'])),
    targetReachable: boolValue(obj['targetReachable']),
    isTable: boolValue(obj['isTable']),
    resolvedIsTable: boolValue(obj['resolvedIsTable']),
    skipReason: stringValue(obj['skipReason']),
  };
}

function targetRefDetailsFrom(...values: unknown[]): TableTargetRefDetail[] {
  const out: TableTargetRefDetail[] = [];
  for (const value of values) {
    for (const item of arrayValue(value)) {
      const parsed = parseTargetRefDetail(item);
      if (!parsed) continue;
      const existing = out.findIndex(row => row.ref === parsed.ref);
      if (existing >= 0) out[existing] = { ...out[existing], ...parsed };
      else out.push(parsed);
    }
  }
  return out;
}

function fallbackTargetRefDetails(attempt: Pick<TableTransactionAttempt, 'requestedTargetRefs' | 'targetRefs' | 'targetResolved' | 'resolvedRole'>): TableTargetRefDetail[] {
  const refs = attempt.requestedTargetRefs.length > 0 ? attempt.requestedTargetRefs : attempt.targetRefs;
  const role = normalizeRole(attempt.resolvedRole);
  if (refs.length === 0 || role === null) return [];
  return refs.map(ref => ({
    ref,
    targetResolved: attempt.targetResolved,
    rawRole: null,
    resolvedRole: role,
    targetReachable: null,
    isTable: role.toUpperCase() === 'TABLE',
    resolvedIsTable: role.toUpperCase() === 'TABLE',
    skipReason: role.toUpperCase() === 'TABLE' ? null : 'not_table',
  }));
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

export function pacRegressionFamily(ruleId: string): PacRegressionFamily {
  const id = ruleId.toLowerCase();
  if (id.includes('table') || id.includes('header_association') || id.includes('header_cells')) {
    return 'table_header';
  }
  if (id.includes('figure') || id.includes('alt')) {
    return 'figure_alt';
  }
  if (id.includes('orphan') || id.includes('mcid')) {
    return 'orphan_mcid';
  }
  if (id.includes('link') || id.includes('annotation') || id.includes('annot')) {
    return 'link_annotation';
  }
  if (id.includes('reading') || id.includes('order')) {
    return 'reading_order';
  }
  return 'unknown';
}

function groupPacRegressions(ruleIdsIn: string[]): Record<PacRegressionFamily, string[]> {
  const out: Record<PacRegressionFamily, string[]> = {
    table_header: [],
    figure_alt: [],
    orphan_mcid: [],
    link_annotation: [],
    reading_order: [],
    unknown: [],
  };
  for (const ruleId of ruleIdsIn) {
    const family = pacRegressionFamily(ruleId);
    if (!out[family].includes(ruleId)) out[family].push(ruleId);
  }
  return out;
}

function extractAttempt(tool: JsonRecord): TableTransactionAttempt | null {
  const toolName = stringValue(tool['toolName']);
  if (!toolName || !TABLE_TOOLS.has(toolName)) return null;

  const details = parseJsonObject(tool['details']);
  const invariants = objectValue(details?.['invariants']);
  const mutation = objectValue(details?.['mutation']);
  const mutationInvariants = objectValue(mutation?.['invariants']);
  const mutationDebug = objectValue(mutation?.['debug']);
  const debug = objectValue(details?.['debug']);
  const replay = objectValue(debug?.['replayState']);
  const pacRegressions = extractPacRegressions(details);
  const pacRegressionFamilies = groupPacRegressions(pacRegressions);
  const targetRefs = mergeRefs(
    details?.['targetRef'],
    details?.['targetRefs'],
    invariants?.['targetRef'],
    invariants?.['targetRefs'],
    mutation?.['targetRef'],
    mutation?.['targetRefs'],
    mutationInvariants?.['targetRef'],
    mutationInvariants?.['targetRefs'],
    mutationDebug?.['targetRef'],
    mutationDebug?.['targetRefs'],
  );
  const requestedTargetRefs = mergeRefs(
    details?.['requestedTargetRefs'],
    invariants?.['requestedTargetRefs'],
    mutation?.['requestedTargetRefs'],
    mutationInvariants?.['requestedTargetRefs'],
    targetRefs,
  );
  const changedTargetRefs = mergeRefs(
    details?.['changedTargetRefs'],
    debug?.['changedTargetRefs'],
    mutation?.['changedTargetRefs'],
    mutationDebug?.['changedTargetRefs'],
  );
  const skippedTargetRefs = mergeRefs(
    details?.['skippedTargetRefs'],
    debug?.['skippedTargetRefs'],
    mutation?.['skippedTargetRefs'],
    mutationDebug?.['skippedTargetRefs'],
  );
  const resolvedRole = normalizeRole(
    stringValue(invariants?.['resolvedRole']) ??
    stringValue(mutationInvariants?.['resolvedRole']) ??
    stringValue(mutation?.['resolvedRole']),
  );
  const targetResolved = boolValue(invariants?.['targetResolved']) ??
    boolValue(mutationInvariants?.['targetResolved']) ??
    boolValue(mutation?.['targetResolved']);
  const targetRefDetailsBefore = targetRefDetailsFrom(
    invariants?.['targetRefDetailsBefore'],
    mutationInvariants?.['targetRefDetailsBefore'],
  );
  const targetRefDetailsAfter = targetRefDetailsFrom(
    invariants?.['targetRefDetailsAfter'],
    invariants?.['targetRefDetails'],
    mutationInvariants?.['targetRefDetailsAfter'],
    mutationInvariants?.['targetRefDetails'],
    debug?.['targetRefDetailsAfter'],
    debug?.['targetRefDetails'],
    debug?.['skippedTargetRefDetails'],
    mutationDebug?.['targetRefDetailsAfter'],
    mutationDebug?.['targetRefDetails'],
    mutationDebug?.['skippedTargetRefDetails'],
  );
  let targetRefDetails = targetRefDetailsAfter.length > 0 ? targetRefDetailsAfter : targetRefDetailsBefore;

  const attempt: TableTransactionAttempt = {
    toolName,
    outcome: stringValue(tool['outcome']) ?? stringValue(details?.['outcome']),
    scoreBefore: numberValue(tool['scoreBefore']) ?? nestedNumber(replay, ['scoreBefore']),
    scoreAfter: numberValue(tool['scoreAfter']) ?? nestedNumber(replay, ['scoreAfter']),
    targetRefs,
    requestedTargetRefs,
    changedTargetRefs,
    skippedTargetRefs,
    targetRefDetails,
    targetRefDetailsBefore,
    targetRefDetailsAfter,
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
    tablePacRegressions: pacRegressions.filter(id => pacRegressionFamily(id) === 'table_header'),
    nonTablePacRegressions: pacRegressions.filter(id => pacRegressionFamily(id) !== 'table_header'),
    pacRegressionFamilies,
    note: stringValue(details?.['note']) ?? stringValue(mutation?.['note']),
  };
  if (attempt.targetRefDetails.length === 0) {
    targetRefDetails = fallbackTargetRefDetails(attempt);
    attempt.targetRefDetails = targetRefDetails;
    attempt.targetRefDetailsAfter = targetRefDetails;
  }
  return attempt;
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

function detailIsTable(detail: TableTargetRefDetail): boolean {
  const rawRole = detail.rawRole?.toUpperCase() ?? '';
  const resolvedRole = detail.resolvedRole?.toUpperCase() ?? '';
  return detail.isTable === true || rawRole === 'TABLE' || detail.resolvedIsTable === true || resolvedRole === 'TABLE';
}

function detailIsReachableTable(detail: TableTargetRefDetail): boolean {
  return detailIsTable(detail) && detail.targetResolved === true && detail.targetReachable === true;
}

function requestedDetails(attempt: TableTransactionAttempt): TableTargetRefDetail[] {
  const requested = attempt.requestedTargetRefs.length > 0 ? attempt.requestedTargetRefs : attempt.targetRefs;
  if (requested.length === 0) return attempt.targetRefDetails;
  const byRef = new Map(attempt.targetRefDetails.map(detail => [detail.ref, detail]));
  return requested.map(ref => byRef.get(ref)).filter((detail): detail is TableTargetRefDetail => Boolean(detail));
}

function hasWrongRef(attempt: TableTransactionAttempt): boolean {
  const details = requestedDetails(attempt);
  if (details.some(detail => detail.targetResolved === false || !detailIsTable(detail))) return true;
  const role = attempt.resolvedRole?.toUpperCase() ?? null;
  return details.length === 0 && attempt.targetResolved === true && role !== null && role !== 'TABLE';
}

function hasMixedBatchRefs(attempt: TableTransactionAttempt): boolean {
  const details = requestedDetails(attempt);
  if (details.length < 2) return false;
  return details.some(detail => detailIsTable(detail)) && details.some(detail => !detailIsTable(detail) || detail.targetResolved === false);
}

function allRequestedRefsReachableTables(attempt: TableTransactionAttempt): boolean {
  const requested = attempt.requestedTargetRefs.length > 0 ? attempt.requestedTargetRefs : attempt.targetRefs;
  const details = requestedDetails(attempt);
  return requested.length > 0 && details.length === requested.length && details.every(detailIsReachableTable);
}

function refsReason(attempt: TableTransactionAttempt): string {
  const details = requestedDetails(attempt);
  if (details.length === 0) {
    return `${attempt.toolName}:${attempt.requestedTargetRefs.join(',') || attempt.targetRefs.join(',') || 'unknown'}:${attempt.resolvedRole ?? 'unknown'}`;
  }
  return `${attempt.toolName}:${details.map(detail => `${detail.ref}:${detail.rawRole ?? detail.resolvedRole ?? 'unresolved'}:${detail.skipReason ?? 'ok'}`).join(',')}`;
}

export function classifyTableTransactionRow(input: TableTransactionRowInput): {
  classification: TableTransactionClassification;
  promotionSupported: boolean;
  laterStrictTransactionSafe: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.timedOut || input.error || input.analysisError) {
    if (input.timedOut) reasons.push('row_timeout');
    if (input.error) reasons.push(`row_error:${input.error}`);
    if (input.analysisError) reasons.push(`analysis_error:${input.analysisError}`);
    return { classification: 'runtime_or_analyzer_debt', promotionSupported: false, laterStrictTransactionSafe: false, reasons };
  }

  if (input.attempts.length === 0) {
    reasons.push('no_table_tools_attempted');
    return { classification: 'no_safe_transaction', promotionSupported: false, laterStrictTransactionSafe: false, reasons };
  }

  const nonTablePac = input.attempts.flatMap(attempt => attempt.nonTablePacRegressions);
  if (nonTablePac.length > 0) {
    reasons.push(...[...new Set(nonTablePac)].map(rule => `non_table_pac_regression:${pacRegressionFamily(rule)}:${rule}`));
    return { classification: 'non_table_pac_side_effect', promotionSupported: false, laterStrictTransactionSafe: false, reasons };
  }

  const mixedBatchAttempts = input.attempts.filter(hasMixedBatchRefs);
  if (mixedBatchAttempts.length > 0) {
    reasons.push(...mixedBatchAttempts.map(refsReason));
    return { classification: 'mixed_batch_refs', promotionSupported: false, laterStrictTransactionSafe: false, reasons };
  }

  const wrongRefAttempts = input.attempts.filter(hasWrongRef);
  if (wrongRefAttempts.length > 0) {
    reasons.push(...wrongRefAttempts.map(refsReason));
    return { classification: 'planner_wrong_ref', promotionSupported: false, laterStrictTransactionSafe: false, reasons };
  }

  const tablePac = input.attempts.flatMap(attempt => attempt.tablePacRegressions);
  const tableEvidenceImproved = input.attempts.some(attemptImprovesTableEvidence);
  const strictSafe = input.role === 'focus' &&
    tableEvidenceImproved &&
    input.attempts.some(allRequestedRefsReachableTables) &&
    nonTablePac.length === 0;
  if (input.role === 'control') {
    reasons.push(tableEvidenceImproved ? 'control_table_mutation_or_table_movement' : 'control_table_attempted');
    return { classification: 'control_table_side_effect', promotionSupported: false, laterStrictTransactionSafe: false, reasons };
  }

  if (tablePac.length > 0) {
    reasons.push(...[...new Set(tablePac)].map(rule => `table_pac_regression:${pacRegressionFamily(rule)}:${rule}`));
    if (tableEvidenceImproved) reasons.push('table_evidence_improved_before_rejection');
    return {
      classification: tableEvidenceImproved ? 'valid_table_no_final_cleanup' : 'table_header_pac_only',
      promotionSupported: strictSafe,
      laterStrictTransactionSafe: strictSafe,
      reasons,
    };
  }

  const lowTable = input.tableMarkup !== null && input.tableMarkup < 90;
  if (tableEvidenceImproved && lowTable) {
    reasons.push('table_evidence_improved_but_final_table_score_still_low');
    return { classification: 'valid_table_no_final_cleanup', promotionSupported: strictSafe, laterStrictTransactionSafe: strictSafe, reasons };
  }

  reasons.push('table_attempts_do_not_support_strict_transaction');
  return { classification: 'no_safe_transaction', promotionSupported: false, laterStrictTransactionSafe: false, reasons };
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
    .filter(rule => rule.status === 'fail' && pacRegressionFamily(rule.ruleId) === 'table_header')
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
    TABLE_TRANSACTION_CLASSIFICATIONS.map(key => [key, diagnostics.filter(row => row.classification === key).length]),
  ) as Record<TableTransactionClassification, number>;

  const laterStrictTransactionCandidates = diagnostics.filter(row => row.laterStrictTransactionSafe).map(row => row.id);
  const controlsWithTableSideEffects = diagnostics.filter(row => row.classification === 'control_table_side_effect').map(row => row.id);
  const plannerWrongRef = diagnostics.filter(row => row.classification === 'planner_wrong_ref').map(row => row.id);
  const mixedBatchRefs = diagnostics.filter(row => row.classification === 'mixed_batch_refs').map(row => row.id);
  const nonTablePacSideEffects = diagnostics.filter(row => row.classification === 'non_table_pac_side_effect').map(row => row.id);
  const decisionReasons: string[] = [];
  if (laterStrictTransactionCandidates.length < 2) decisionReasons.push('fewer_than_two_later_strict_transaction_candidates');
  if (controlsWithTableSideEffects.length > 0) decisionReasons.push('controls_trigger_table_side_effects');
  if (plannerWrongRef.length > 0) decisionReasons.push('planner_wrong_ref_present');
  if (mixedBatchRefs.length > 0) decisionReasons.push('mixed_batch_refs_present');
  if (nonTablePacSideEffects.length > 0) decisionReasons.push('non_table_pac_side_effect_present');
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
      laterStrictTransactionCandidates,
      plannerWrongRef,
      mixedBatchRefs,
      controlsWithTableSideEffects,
      nonTablePacSideEffects,
    },
    decision: {
      status,
      reasons: status === 'plan_strict_transaction_behavior' ? ['later_strict_transaction_candidates_clean_against_controls'] : decisionReasons,
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
  lines.push(`- Later strict transaction safe candidates: ${report.summary.laterStrictTransactionCandidates.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Planner wrong-ref rows: ${report.summary.plannerWrongRef.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Mixed batch-ref rows: ${report.summary.mixedBatchRefs.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Controls with table side effects: ${report.summary.controlsWithTableSideEffects.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Non-table PAC side effects: ${report.summary.nonTablePacSideEffects.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| ID | Role | Score | Table | PDF/UA | Attempts | Later Strict Safe | Classification | Reasons |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| \`${md(row.id)}\` | ${row.role} | ${md(row.score)} | ${md(row.tableMarkup)} | ${md(row.pdfUaCompliance)} | ${row.attempts.length} | ${row.laterStrictTransactionSafe ? 'yes' : 'no'} | \`${row.classification}\` | ${row.reasons.map(reason => `\`${md(reason)}\``).join(', ')} |`);
  }
  lines.push('');
  lines.push('## Table Attempts');
  for (const row of report.rows.filter(row => row.attempts.length > 0)) {
    lines.push('');
    lines.push(`### ${row.id}`);
    lines.push('');
    lines.push('| Tool | Outcome | Score | Requested Refs | Ref Details | Changed | Skipped | PAC Families | Invariant Movement |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const attempt of row.attempts) {
      const movement = [
        `assoc:${attempt.headerAssociationMissingBefore ?? ''}->${attempt.headerAssociationMissingAfter ?? ''}`,
        `tdNoHeader:${attempt.dataCellsWithoutHeaderBefore ?? ''}->${attempt.dataCellsWithoutHeaderAfter ?? ''}`,
        `direct:${attempt.directCellsUnderTableBefore ?? ''}->${attempt.directCellsUnderTableAfter ?? ''}`,
        `irregular:${attempt.irregularRowsBefore ?? ''}->${attempt.irregularRowsAfter ?? ''}`,
      ].join('; ');
      const refDetails = attempt.targetRefDetails.map(detail => `${detail.ref}:${detail.rawRole ?? detail.resolvedRole ?? 'unresolved'}:${detail.targetReachable === true ? 'reachable' : detail.targetReachable === false ? 'unreachable' : 'reach?' }:${detail.skipReason ?? 'ok'}`).join('; ');
      const pacFamilies = Object.entries(attempt.pacRegressionFamilies)
        .filter(([, rules]) => rules.length > 0)
        .map(([family, rules]) => `${family}:${rules.join(',')}`)
        .join('; ');
      lines.push(`| \`${attempt.toolName}\` | ${md(attempt.outcome)} | ${md(attempt.scoreBefore)}->${md(attempt.scoreAfter)} | ${md(attempt.requestedTargetRefs.join(', ') || attempt.targetRefs.join(', '))} | ${md(refDetails || attempt.resolvedRole)} | ${md(attempt.changedTargetRefs.join(', '))} | ${md(attempt.skippedTargetRefs.join(', '))} | ${md(pacFamilies)} | ${md(movement)} |`);
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

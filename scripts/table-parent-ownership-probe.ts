#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { runPythonMutationBatch, type BatchMutationResult, type PythonMutation } from '../src/python/bridge.js';
import { runSingleTool } from '../src/services/remediation/orchestrator.js';
import { buildDefaultParams } from '../src/services/remediation/planner.js';
import { isRealRootReachableTableTarget } from '../src/services/remediation/tableTargetGuards.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot, PlannedRemediationTool } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';
const TABLE_TOOLS = ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'] as const;

type TableToolName = typeof TABLE_TOOLS[number];

export type TableParentOwnershipStepClassification =
  | 'skipped_no_params'
  | 'wrong_ref_precondition'
  | 'table_progress_clean'
  | 'orphan_mcid_side_effect'
  | 'parent_tree_side_effect'
  | 'non_table_pac_side_effect'
  | 'table_regression'
  | 'no_effect_or_no_table_progress';

interface ParsedArgs {
  pdfs: string[];
  outDir: string;
  controls: Set<string>;
  strictTableRefs: boolean;
  sameRefTransaction: boolean;
  batchTransaction: boolean;
  missingHeaderBatch: boolean;
}

interface ScoreMetrics {
  score: number;
  grade: string;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  orphanMcidCount: number;
  orphanMcids: OrphanMcidSample[];
  parentTreeDebt: number;
  tableHeaderDebt: number;
  tableRegularityDebt: number;
  textCharCount: number;
}

export interface OrphanMcidSample {
  page: number;
  mcid: number;
}

export interface TableParentOwnershipStep {
  toolName: TableToolName;
  outcome: string;
  params: Record<string, unknown>;
  classification: TableParentOwnershipStepClassification;
  reasons: string[];
  before: ScoreMetrics;
  after: ScoreMetrics;
  requestedRefs: string[];
  wrongRefs: string[];
  changedRefs: string[];
  pacRegressions: string[];
  orphanMcidSampleAdded: string[];
  orphanMcidSampleRemoved: string[];
  orphanAddedReferencedByTargetTable: string[];
  tableMcidOwnershipDeltas: string[];
  durationMs: number;
}

interface TableParentOwnershipRow {
  id: string;
  file: string;
  role: 'focus' | 'control';
  start: ScoreMetrics;
  final: ScoreMetrics;
  classification: 'ownership_regression_candidate' | 'wrong_ref_blocker' | 'clean_table_progress' | 'control_unsafe' | 'no_table_movement' | 'analysis_error';
  reasons: string[];
  steps: TableParentOwnershipStep[];
  error: string | null;
}

interface TableParentOwnershipReport {
  generatedAt: string;
  outDir: string;
  strictTableRefs: boolean;
  sameRefTransaction: boolean;
  batchTransaction: boolean;
  missingHeaderBatch: boolean;
  rows: TableParentOwnershipRow[];
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    ownershipRegressionCandidates: string[];
    wrongRefRows: string[];
    controlUnsafeRows: string[];
    cleanTableProgressRows: string[];
  };
  decision: {
    status: 'plan_parent_ownership_preservation' | 'diagnostic_only';
    reasons: string[];
  };
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-parent-ownership-probe.ts --pdf <path> [options]

Options:
  --pdf <path>      PDF to probe; repeatable
  --out <dir>       Output directory (default: ${DEFAULT_OUT_ROOT}/table-parent-ownership-probe-<timestamp>)
  --control <id>    Mark row id as a control; repeatable
  --strict-table-refs
                    Probe table tools only with explicit object-backed refs and strict all-/Table ref validation
  --same-ref-transaction
                    Probe normalize_table_structure -> set_table_header_cells on the same strict /Table refs
  --batch-transaction
                    Probe the same strict transaction inside one Python mutation batch
  --missing-header-batch
                    Probe a strict multi-ref missing-header normalize/header batch
  --help            Show this help.`;
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()): ParsedArgs {
  const pdfs: string[] = [];
  const controls = new Set<string>();
  let outDir = join(DEFAULT_OUT_ROOT, `table-parent-ownership-probe-${timestampSlug(now)}`);
  let strictTableRefs = false;
  let sameRefTransaction = false;
  let batchTransaction = false;
  let missingHeaderBatch = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --pdf value\n${usage()}`);
      pdfs.push(resolve(value));
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--control') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --control value\n${usage()}`);
      controls.add(rowId(value));
    } else if (arg === '--strict-table-refs') {
      strictTableRefs = true;
    } else if (arg === '--same-ref-transaction') {
      sameRefTransaction = true;
    } else if (arg === '--batch-transaction') {
      batchTransaction = true;
    } else if (arg === '--missing-header-batch') {
      missingHeaderBatch = true;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  if (pdfs.length === 0) throw new Error(`Missing --pdf\n${usage()}`);
  return {
    pdfs,
    outDir,
    controls,
    strictTableRefs: strictTableRefs || sameRefTransaction || batchTransaction || missingHeaderBatch,
    sameRefTransaction,
    batchTransaction,
    missingHeaderBatch,
  };
}

function rowId(file: string): string {
  return basename(file).replace(/\.pdf$/i, '');
}

function categoryScore(result: AnalysisResult, key: string): number | null {
  return result.categories.find(category => category.key === key)?.score ?? null;
}

function tableHeaderDebt(snapshot: DocumentSnapshot): number {
  const audit = snapshot.tableHeaderAudit;
  if (!audit || (audit.tablesChecked ?? 0) === 0) return 0;
  return Math.max(0, audit.dataCellsWithoutHeaderCount ?? audit.headerAssociationMissingCount ?? 0) +
    Math.max(0, audit.orphanHeaderCellCount ?? 0);
}

function tableRegularityDebt(snapshot: DocumentSnapshot): number {
  const signals = snapshot.detectionProfile?.tableSignals;
  return Math.max(0, signals?.directCellUnderTableCount ?? 0) +
    Math.max(0, signals?.misplacedCellCount ?? 0) +
    Math.max(0, signals?.irregularTableCount ?? 0) +
    Math.max(0, signals?.stronglyIrregularTableCount ?? 0);
}

function parentTreeDebt(snapshot: DocumentSnapshot): number {
  const audit = snapshot.parentTreeAudit;
  if (!audit) return 0;
  return Math.max(0, audit.pagesMissingStructParents ?? 0) +
    Math.max(0, audit.missingMcidParentTreeEntries ?? 0) +
    Math.max(0, audit.invalidParentTreeEntries ?? 0) +
    Math.max(0, audit.annotationReferenceMismatchCount ?? 0) +
    Math.max(0, audit.objectReferenceMismatchCount ?? 0);
}

function orphanMcidCount(snapshot: DocumentSnapshot): number {
  return snapshot.taggedContentAudit?.orphanMcidCount ??
    snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ??
    snapshot.orphanMcids?.length ??
    0;
}

function orphanMcidSamples(snapshot: DocumentSnapshot): OrphanMcidSample[] {
  return (snapshot.orphanMcids ?? [])
    .filter(item => Number.isFinite(item.page) && Number.isFinite(item.mcid))
    .map(item => ({ page: Math.trunc(item.page), mcid: Math.trunc(item.mcid) }))
    .sort((a, b) => a.page - b.page || a.mcid - b.mcid);
}

function orphanMcidKey(item: OrphanMcidSample): string {
  return `${item.page}:${item.mcid}`;
}

export function orphanMcidSampleDiff(input: {
  before: readonly OrphanMcidSample[];
  after: readonly OrphanMcidSample[];
}): { added: string[]; removed: string[] } {
  const before = new Set(input.before.map(orphanMcidKey));
  const after = new Set(input.after.map(orphanMcidKey));
  const added = [...after].filter(key => !before.has(key)).sort();
  const removed = [...before].filter(key => !after.has(key)).sort();
  return { added, removed };
}

function metrics(result: AnalysisResult, snapshot: DocumentSnapshot): ScoreMetrics {
  return {
    score: result.score,
    grade: result.grade,
    tableMarkup: categoryScore(result, 'table_markup'),
    pdfUaCompliance: categoryScore(result, 'pdf_ua_compliance'),
    orphanMcidCount: orphanMcidCount(snapshot),
    orphanMcids: orphanMcidSamples(snapshot),
    parentTreeDebt: parentTreeDebt(snapshot),
    tableHeaderDebt: tableHeaderDebt(snapshot),
    tableRegularityDebt: tableRegularityDebt(snapshot),
    textCharCount: snapshot.textCharCount,
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return objectValue(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  const out: string[] = [];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of values) {
    const text = stringValue(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function collectRefs(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const ref of stringArray(value)) {
      if (!out.includes(ref)) out.push(ref);
    }
  }
  return out;
}

function hasTableRefParam(params: Record<string, unknown>): boolean {
  return Boolean(
    stringValue(params['structRef']) ||
    stringValue(params['targetRef']) ||
    stringValue(params['targetStructRef']) ||
    stringArray(params['structRefs']).length > 0
  );
}

export function strictTableProbeParams(
  toolName: TableToolName,
  params: Record<string, unknown>,
  strictTableRefs: boolean,
): Record<string, unknown> {
  if (!strictTableRefs) return params;
  if (!TABLE_TOOLS.includes(toolName)) return params;
  if (!hasTableRefParam(params)) return {};
  return { ...params, strictTableTargetRef: true };
}

export function strictSameRefHeaderParams(refs: string[]): Record<string, unknown> {
  const uniqueRefs = stringArray(refs).filter((ref, index, all) => all.indexOf(ref) === index);
  if (uniqueRefs.length === 0) return {};
  const base = {
    tableHeaderAssociation: true,
    strictTableTargetRef: true,
    stage: 'diagnostic_same_ref_table_transaction',
  };
  return uniqueRefs.length === 1
    ? { ...base, structRef: uniqueRefs[0] }
    : {
      ...base,
      structRefs: uniqueRefs,
      maxTableHeaderAssociationTargets: uniqueRefs.length,
    };
}

function missingHeaderTargetRefs(snapshot: DocumentSnapshot, limit = 8): string[] {
  return snapshot.tables
    .filter(isRealRootReachableTableTarget)
    .filter(table =>
      table.structRef &&
      !table.hasHeaders &&
      (table.totalCells ?? 0) >= 4 &&
      (table.rowCount ?? 0) > 1 &&
      (table.cellsMisplacedCount ?? 0) === 0
    )
    .sort((a, b) =>
      (b.totalCells ?? 0) - (a.totalCells ?? 0) ||
      (b.irregularRows ?? 0) - (a.irregularRows ?? 0) ||
      a.page - b.page ||
      (a.structRef ?? '').localeCompare(b.structRef ?? '')
    )
    .map(table => table.structRef!)
    .slice(0, limit);
}

export function strictMissingHeaderBatchParams(refs: string[]): { normalizeParams: Record<string, unknown>; headerParams: Record<string, unknown> } {
  const uniqueRefs = stringArray(refs).filter((ref, index, all) => all.indexOf(ref) === index);
  if (uniqueRefs.length === 0) return { normalizeParams: {}, headerParams: {} };
  return {
    normalizeParams: {
      structRefs: uniqueRefs,
      strictTableTargetRef: true,
      tableFailureClass: 'missing_headers_only',
      dominantColumnCount: 0,
      maxTablesPerRun: uniqueRefs.length,
      maxSyntheticCells: Math.max(80, uniqueRefs.length * 40),
      diagnosticTableMcidOwnership: true,
      diagnosticTableMcidSampleLimit: 128,
      stage: 'diagnostic_missing_header_batch',
    },
    headerParams: {
      structRefs: uniqueRefs,
      strictTableTargetRef: true,
      tableHeaderAssociation: true,
      maxTableHeaderAssociationTargets: uniqueRefs.length,
      diagnosticTableMcidOwnership: true,
      diagnosticTableMcidSampleLimit: 128,
      stage: 'diagnostic_missing_header_batch',
    },
  };
}

function targetDetails(details: Record<string, unknown> | null): Record<string, unknown>[] {
  const invariants = objectValue(details?.['invariants']);
  const mutation = objectValue(details?.['mutation']);
  const mutationInvariants = objectValue(mutation?.['invariants']);
  const debug = objectValue(details?.['debug']);
  const mutationDebug = objectValue(mutation?.['debug']);
  return [
    ...arrayValue(invariants?.['targetRefDetails']),
    ...arrayValue(invariants?.['targetRefDetailsAfter']),
    ...arrayValue(mutationInvariants?.['targetRefDetails']),
    ...arrayValue(mutationInvariants?.['targetRefDetailsAfter']),
    ...arrayValue(debug?.['targetRefDetails']),
    ...arrayValue(debug?.['skippedTargetRefDetails']),
    ...arrayValue(mutationDebug?.['targetRefDetails']),
    ...arrayValue(mutationDebug?.['skippedTargetRefDetails']),
  ].map(objectValue).filter((item): item is Record<string, unknown> => Boolean(item));
}

function role(value: unknown): string | null {
  const text = stringValue(value);
  return text ? text.replace(/^\//, '').toUpperCase() : null;
}

function wrongRefs(details: Record<string, unknown> | null): string[] {
  const out: string[] = [];
  for (const detail of targetDetails(details)) {
    const ref = stringValue(detail['ref']) ?? stringValue(detail['targetRef']);
    if (!ref) continue;
    const targetResolved = boolValue(detail['targetResolved']);
    const targetReachable = boolValue(detail['targetReachable']);
    const isTable = boolValue(detail['isTable']);
    const resolvedIsTable = boolValue(detail['resolvedIsTable']);
    const rawRole = role(detail['rawRole']);
    const resolvedRole = role(detail['resolvedRole']);
    const skipReason = stringValue(detail['skipReason']);
    const roleIsTable = rawRole === 'TABLE' || resolvedRole === 'TABLE';
    const valid = targetResolved !== false && targetReachable !== false && (isTable === true || resolvedIsTable === true || roleIsTable);
    if (!valid || skipReason === 'not_table') out.push(ref);
  }
  return [...new Set(out)];
}

function batchTargetDetails(result: BatchMutationResult): Record<string, unknown>[] {
  return (result.opResults ?? []).flatMap(row => {
    const debug = objectValue(row.debug);
    return [
      ...arrayValue(debug?.['targetRefDetails']),
      ...arrayValue(debug?.['targetRefDetailsAfter']),
      ...arrayValue(debug?.['skippedTargetRefDetails']),
    ].map(objectValue).filter((item): item is Record<string, unknown> => Boolean(item));
  });
}

function batchWrongRefs(result: BatchMutationResult): string[] {
  return wrongRefs({ debug: { targetRefDetails: batchTargetDetails(result) } });
}

function formatTableMcidDelta(value: unknown): string | null {
  const obj = objectValue(value);
  if (!obj) return null;
  const ref = stringValue(obj['ref']);
  if (!ref) return null;
  const before = typeof obj['referencedMcidCountBefore'] === 'number' ? obj['referencedMcidCountBefore'] : 'n/a';
  const after = typeof obj['referencedMcidCountAfter'] === 'number' ? obj['referencedMcidCountAfter'] : 'n/a';
  const added = stringArray(obj['referencedMcidSampleAdded']).slice(0, 6);
  const removed = stringArray(obj['referencedMcidSampleRemoved']).slice(0, 6);
  const flags = [
    added.length > 0 ? `added=${added.join(',')}` : null,
    removed.length > 0 ? `removed=${removed.join(',')}` : null,
    obj['sampleTruncatedBefore'] === true || obj['sampleTruncatedAfter'] === true ? 'sample_truncated' : null,
  ].filter((item): item is string => Boolean(item));
  return `${ref}:${before}->${after}${flags.length > 0 ? `:${flags.join(';')}` : ''}`;
}

function tableMcidOwnershipDeltasFrom(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const item of arrayValue(value)) {
      const formatted = formatTableMcidDelta(item);
      if (formatted && !out.includes(formatted)) out.push(formatted);
    }
  }
  return out;
}

function targetReferencedMcidKeysFrom(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const detail of arrayValue(value)) {
      const obj = objectValue(detail);
      if (!obj) continue;
      for (const key of stringArray(obj['referencedMcidSampleKeys'])) {
        if (key && !out.includes(key)) out.push(key);
      }
    }
  }
  return out;
}

function pacRuleIds(details: Record<string, unknown> | null): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    const obj = objectValue(value);
    if (!obj) return;
    for (const key of ['pacRuleRegression', 'pacRuleRegressions']) {
      for (const row of arrayValue(obj[key]).length ? arrayValue(obj[key]) : obj[key] ? [obj[key]] : []) {
        const id = stringValue(objectValue(row)?.['ruleId']);
        if (id && !out.includes(id)) out.push(id);
      }
    }
    visit(obj['originalDetails']);
    visit(obj['mutation']);
  };
  visit(details);
  return out;
}

export function classifyTableParentOwnershipStep(input: {
  outcome: string;
  params: Record<string, unknown>;
  before: ScoreMetrics;
  after: ScoreMetrics;
  wrongRefs: string[];
  pacRegressions: string[];
}): { classification: TableParentOwnershipStepClassification; reasons: string[] } {
  const reasons: string[] = [];
  if (Object.keys(input.params).length === 0) {
    return { classification: 'skipped_no_params', reasons: ['empty_planner_params'] };
  }
  if (input.wrongRefs.length > 0) {
    return { classification: 'wrong_ref_precondition', reasons: [`wrong_ref:${input.wrongRefs.join(',')}`] };
  }
  const tableDelta = (input.after.tableMarkup ?? 0) - (input.before.tableMarkup ?? 0);
  if (tableDelta < 0) {
    return { classification: 'table_regression', reasons: [`table_delta:${tableDelta}`] };
  }
  const orphanDelta = input.after.orphanMcidCount - input.before.orphanMcidCount;
  const parentTreeDelta = input.after.parentTreeDebt - input.before.parentTreeDebt;
  const nonTablePac = input.pacRegressions.filter(id =>
    !id.includes('pdfua.table.') &&
    id !== 'pdfua.content.orphan_mcids_absent' &&
    !id.includes('parent_tree'),
  );
  if (nonTablePac.length > 0) {
    return { classification: 'non_table_pac_side_effect', reasons: [`pac:${nonTablePac.join(',')}`] };
  }
  if (tableDelta > 0 && orphanDelta > 0) {
    reasons.push(`table_delta:${tableDelta}`);
    reasons.push(`orphan_mcid_delta:${orphanDelta}`);
    return { classification: 'orphan_mcid_side_effect', reasons };
  }
  if (tableDelta > 0 && parentTreeDelta > 0) {
    reasons.push(`table_delta:${tableDelta}`);
    reasons.push(`parent_tree_delta:${parentTreeDelta}`);
    return { classification: 'parent_tree_side_effect', reasons };
  }
  if (tableDelta > 0) {
    reasons.push(`table_delta:${tableDelta}`);
    return { classification: 'table_progress_clean', reasons };
  }
  return { classification: 'no_effect_or_no_table_progress', reasons: [`outcome:${input.outcome}`, `table_delta:${tableDelta}`] };
}

async function analyzeBuffer(buffer: Buffer, filename: string): Promise<{ result: AnalysisResult; snapshot: DocumentSnapshot }> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-table-parent-probe-'));
  const pdfPath = join(dir, filename);
  try {
    await writeFile(pdfPath, buffer);
    return await analyzePdf(pdfPath, filename, { bypassCache: true, timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function probePdf(
  pdfPath: string,
  roleForRow: 'focus' | 'control',
  strictTableRefs: boolean,
  sameRefTransaction: boolean,
  batchTransaction: boolean,
  missingHeaderBatch: boolean,
): Promise<TableParentOwnershipRow> {
  const file = basename(pdfPath);
  const id = rowId(file);
  try {
    let buffer = await readFile(pdfPath);
    let current = await analyzePdf(pdfPath, file, { bypassCache: true, timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS });
    const start = metrics(current.result, current.snapshot);
    const applied: AppliedRemediationTool[] = [];
    const steps: TableParentOwnershipStep[] = [];

    const runProbeTool = async (toolName: TableToolName, params: Record<string, unknown>): Promise<TableParentOwnershipStep> => {
      const before = metrics(current.result, current.snapshot);
      if (Object.keys(params).length === 0) {
        const classified = classifyTableParentOwnershipStep({
          outcome: 'skipped',
          params,
          before,
          after: before,
          wrongRefs: [],
          pacRegressions: [],
        });
        const step = {
          toolName,
          outcome: 'skipped',
          params,
          ...classified,
          before,
          after: before,
          requestedRefs: [],
          wrongRefs: [],
          changedRefs: [],
          pacRegressions: [],
          orphanMcidSampleAdded: [],
          orphanMcidSampleRemoved: [],
          orphanAddedReferencedByTargetTable: [],
          tableMcidOwnershipDeltas: [],
          durationMs: 0,
        };
        steps.push(step);
        return step;
      }
      const planned: PlannedRemediationTool = {
        toolName,
        params,
        rationale: 'diagnostic_table_parent_ownership_probe',
      };
      const result = await runSingleTool(buffer, planned, current.snapshot, { timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS });
      let next = current;
      let nextBuffer = buffer;
      if (result.outcome === 'applied' && !result.buffer.equals(buffer)) {
        nextBuffer = result.buffer;
        next = await analyzeBuffer(nextBuffer, file);
      }
      const after = metrics(next.result, next.snapshot);
      const parsedDetails = parseJsonObject(result.details);
      const mutation = objectValue(parsedDetails?.['mutation']);
      const mutationDebug = objectValue(mutation?.['debug']);
      const invariants = objectValue(parsedDetails?.['invariants']);
      const mutationInvariants = objectValue(mutation?.['invariants']);
      const requestedRefs = collectRefs(
        params['structRef'],
        params['targetRef'],
        params['structRefs'],
        invariants?.['requestedTargetRefs'],
        mutationInvariants?.['requestedTargetRefs'],
      );
      const changedRefs = collectRefs(
        parsedDetails?.['changedTargetRefs'],
        mutation?.['changedTargetRefs'],
        mutationDebug?.['changedTargetRefs'],
      );
      const pacRegressions = pacRuleIds(parsedDetails);
      const refsWrong = wrongRefs(parsedDetails);
      const orphanDiff = orphanMcidSampleDiff({ before: before.orphanMcids, after: after.orphanMcids });
      const targetReferencedMcidKeys = targetReferencedMcidKeysFrom(
        invariants?.['targetRefDetailsAfter'],
        invariants?.['targetRefDetails'],
        mutationInvariants?.['targetRefDetailsAfter'],
        mutationInvariants?.['targetRefDetails'],
      );
      const tableMcidOwnershipDeltas = tableMcidOwnershipDeltasFrom(
        invariants?.['targetRefMcidDeltas'],
        mutationInvariants?.['targetRefMcidDeltas'],
      );
      const classified = classifyTableParentOwnershipStep({
        outcome: result.outcome,
        params,
        before,
        after,
        wrongRefs: refsWrong,
        pacRegressions,
      });
      const step = {
        toolName,
        outcome: result.outcome,
        params,
        ...classified,
        before,
        after,
        requestedRefs,
        wrongRefs: refsWrong,
        changedRefs,
        pacRegressions,
        orphanMcidSampleAdded: orphanDiff.added,
        orphanMcidSampleRemoved: orphanDiff.removed,
        orphanAddedReferencedByTargetTable: orphanDiff.added.filter(key => targetReferencedMcidKeys.includes(key)),
        tableMcidOwnershipDeltas,
        durationMs: Math.round(result.durationMs),
      };
      steps.push(step);
      applied.push({
        toolName,
        stage: 0,
        round: 0,
        scoreBefore: before.score,
        scoreAfter: after.score,
        delta: after.score - before.score,
        outcome: result.outcome,
        details: result.details,
        durationMs: result.durationMs,
      });
      buffer = nextBuffer;
      current = next;
      return step;
    };

    const runBatchTransaction = async (
      normalizeParams: Record<string, unknown>,
      headerParams: Record<string, unknown>,
      transactionName: string,
    ): Promise<void> => {
      const refs = collectRefs(
        normalizeParams['structRef'],
        normalizeParams['targetRef'],
        normalizeParams['targetStructRef'],
        normalizeParams['structRefs'],
        headerParams['structRef'],
        headerParams['targetRef'],
        headerParams['targetStructRef'],
        headerParams['structRefs'],
      );
      const before = metrics(current.result, current.snapshot);
      if (Object.keys(normalizeParams).length === 0 || Object.keys(headerParams).length === 0) {
        const params = { normalizeParams, headerParams, transaction: transactionName };
        const classified = classifyTableParentOwnershipStep({
          outcome: 'skipped',
          params,
          before,
          after: before,
          wrongRefs: [],
          pacRegressions: [],
        });
        steps.push({
          toolName: 'normalize_table_structure',
          outcome: 'skipped',
          params,
          ...classified,
          before,
          after: before,
          requestedRefs: refs,
          wrongRefs: [],
          changedRefs: [],
          pacRegressions: [],
          orphanMcidSampleAdded: [],
          orphanMcidSampleRemoved: [],
          orphanAddedReferencedByTargetTable: [],
          tableMcidOwnershipDeltas: [],
          durationMs: 0,
        });
        return;
      }
      const mutations: PythonMutation[] = [
        { op: 'normalize_table_structure', params: normalizeParams },
        { op: 'set_table_header_cells', params: headerParams },
      ];
      const started = performance.now();
      const result = await runPythonMutationBatch(buffer, mutations, {
        timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
        abortOnFailedOp: false,
        reopenBetweenOps: false,
      });
      let next = current;
      let nextBuffer = buffer;
      if (result.result.success && !result.buffer.equals(buffer)) {
        nextBuffer = result.buffer;
        next = await analyzeBuffer(nextBuffer, file);
      }
      const after = metrics(next.result, next.snapshot);
      const refsWrong = batchWrongRefs(result.result);
      const orphanDiff = orphanMcidSampleDiff({ before: before.orphanMcids, after: after.orphanMcids });
      const targetReferencedMcidKeys = targetReferencedMcidKeysFrom(
        ...(result.result.opResults ?? []).flatMap(row => [
          row.invariants?.targetRefDetailsAfter,
          row.invariants?.targetRefDetails,
        ]),
      );
      const tableMcidOwnershipDeltas = tableMcidOwnershipDeltasFrom(
        ...(result.result.opResults ?? []).map(row => row.invariants?.targetRefMcidDeltas),
      );
      const outcome = result.result.success && result.result.applied.length > 0 && !result.buffer.equals(buffer)
        ? 'applied'
        : result.result.success
          ? 'no_effect'
          : 'failed';
      const params = {
        transaction: transactionName,
        normalizeParams,
        headerParams,
        opResults: result.result.opResults ?? [],
        failed: result.result.failed,
      };
      const classified = classifyTableParentOwnershipStep({
        outcome,
        params,
        before,
        after,
        wrongRefs: refsWrong,
        pacRegressions: [],
      });
      steps.push({
        toolName: 'normalize_table_structure',
        outcome,
        params,
        ...classified,
        before,
        after,
        requestedRefs: refs,
        wrongRefs: refsWrong,
        changedRefs: collectRefs(
          ...(result.result.opResults ?? []).map(row => objectValue(row.debug)?.['changedTargetRefs']),
        ),
        pacRegressions: [],
        orphanMcidSampleAdded: orphanDiff.added,
        orphanMcidSampleRemoved: orphanDiff.removed,
        orphanAddedReferencedByTargetTable: orphanDiff.added.filter(key => targetReferencedMcidKeys.includes(key)),
        tableMcidOwnershipDeltas,
        durationMs: Math.round(performance.now() - started),
      });
      buffer = nextBuffer;
      current = next;
    };

    if (batchTransaction) {
      const normalizeParams = strictTableProbeParams(
        'normalize_table_structure',
        buildDefaultParams('normalize_table_structure', current.result, current.snapshot, applied),
        true,
      );
      const refs = collectRefs(
        normalizeParams['structRef'],
        normalizeParams['targetRef'],
        normalizeParams['targetStructRef'],
        normalizeParams['structRefs'],
      );
      await runBatchTransaction(normalizeParams, strictSameRefHeaderParams(refs), 'python_batch_same_ref');
    } else if (missingHeaderBatch) {
      const refs = missingHeaderTargetRefs(current.snapshot);
      const params = strictMissingHeaderBatchParams(refs);
      await runBatchTransaction(params.normalizeParams, params.headerParams, 'python_batch_missing_header_refs');
    } else if (sameRefTransaction) {
      const normalizeParams = strictTableProbeParams(
        'normalize_table_structure',
        buildDefaultParams('normalize_table_structure', current.result, current.snapshot, applied),
        true,
      );
      const normalizeStep = await runProbeTool('normalize_table_structure', normalizeParams);
      const refs = collectRefs(
        normalizeParams['structRef'],
        normalizeParams['targetRef'],
        normalizeParams['targetStructRef'],
        normalizeParams['structRefs'],
        normalizeStep.requestedRefs,
      );
      await runProbeTool('set_table_header_cells', strictSameRefHeaderParams(refs));
    } else {
      for (const toolName of TABLE_TOOLS) {
        const params = strictTableProbeParams(
          toolName,
          buildDefaultParams(toolName, current.result, current.snapshot, applied),
          strictTableRefs,
        );
        await runProbeTool(toolName, params);
      }
    }

    const final = metrics(current.result, current.snapshot);
    const row = classifyRow({ id, file, role: roleForRow, start, final, steps, error: null });
    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      file,
      role: roleForRow,
      start: emptyMetrics(),
      final: emptyMetrics(),
      classification: 'analysis_error',
      reasons: [message],
      steps: [],
      error: message,
    };
  }
}

function emptyMetrics(): ScoreMetrics {
  return {
    score: 0,
    grade: '?',
    tableMarkup: null,
    pdfUaCompliance: null,
    orphanMcidCount: 0,
    orphanMcids: [],
    parentTreeDebt: 0,
    tableHeaderDebt: 0,
    tableRegularityDebt: 0,
    textCharCount: 0,
  };
}

function classifyRow(input: Omit<TableParentOwnershipRow, 'classification' | 'reasons'>): TableParentOwnershipRow {
  const sideEffectSteps = input.steps.filter(step =>
    step.classification === 'orphan_mcid_side_effect' ||
    step.classification === 'parent_tree_side_effect' ||
    step.classification === 'non_table_pac_side_effect'
  );
  const wrongRefSteps = input.steps.filter(step => step.classification === 'wrong_ref_precondition');
  const cleanProgress = input.steps.some(step => step.classification === 'table_progress_clean');
  const reasons: string[] = [];
  if (wrongRefSteps.length > 0) {
    reasons.push(`wrong_ref_steps:${wrongRefSteps.map(step => step.toolName).join(',')}`);
    return { ...input, classification: 'wrong_ref_blocker', reasons };
  }
  if (sideEffectSteps.length > 0) {
    reasons.push(`side_effect_steps:${sideEffectSteps.map(step => `${step.toolName}:${step.classification}`).join(',')}`);
    return {
      ...input,
      classification: input.role === 'control' ? 'control_unsafe' : 'ownership_regression_candidate',
      reasons,
    };
  }
  if (cleanProgress) {
    reasons.push('table_progress_without_parent_ownership_regression');
    return { ...input, classification: 'clean_table_progress', reasons };
  }
  reasons.push('no_table_progress_detected');
  return { ...input, classification: 'no_table_movement', reasons };
}

async function buildReport(args: ParsedArgs): Promise<TableParentOwnershipReport> {
  const rows: TableParentOwnershipRow[] = [];
  for (const pdf of args.pdfs) {
    const id = rowId(pdf);
    rows.push(await probePdf(
      pdf,
      args.controls.has(id) ? 'control' : 'focus',
      args.strictTableRefs,
      args.sameRefTransaction,
      args.batchTransaction,
      args.missingHeaderBatch,
    ));
  }
  const ownershipRegressionCandidates = rows
    .filter(row => row.classification === 'ownership_regression_candidate')
    .map(row => row.id);
  const wrongRefRows = rows.filter(row => row.classification === 'wrong_ref_blocker').map(row => row.id);
  const controlUnsafeRows = rows.filter(row => row.classification === 'control_unsafe').map(row => row.id);
  const cleanTableProgressRows = rows.filter(row => row.classification === 'clean_table_progress').map(row => row.id);
  const reasons: string[] = [];
  if (ownershipRegressionCandidates.length < 2) reasons.push('fewer_than_two_focus_ownership_regressions');
  if (controlUnsafeRows.length > 0) reasons.push('controls_show_parent_ownership_side_effects');
  if (wrongRefRows.length > 0) reasons.push('wrong_ref_preconditions_present');
  const status = reasons.length === 0 ? 'plan_parent_ownership_preservation' : 'diagnostic_only';
  return {
    generatedAt: new Date().toISOString(),
    outDir: args.outDir,
    strictTableRefs: args.strictTableRefs,
    sameRefTransaction: args.sameRefTransaction,
    batchTransaction: args.batchTransaction,
    missingHeaderBatch: args.missingHeaderBatch,
    rows,
    summary: {
      rowCount: rows.length,
      focusCount: rows.filter(row => row.role === 'focus').length,
      controlCount: rows.filter(row => row.role === 'control').length,
      ownershipRegressionCandidates,
      wrongRefRows,
      controlUnsafeRows,
      cleanTableProgressRows,
    },
    decision: {
      status,
      reasons: reasons.length > 0 ? reasons : ['focus_parent_ownership_regression_without_control_or_wrong_ref_blocker'],
    },
  };
}

function renderMarkdown(report: TableParentOwnershipReport): string {
  const lines = [
    '# Table Parent Ownership Probe',
    '',
    `Generated: ${report.generatedAt}`,
    `Decision: \`${report.decision.status}\``,
    `Strict table refs: \`${report.strictTableRefs}\``,
    `Same-ref transaction: \`${report.sameRefTransaction}\``,
    `Batch transaction: \`${report.batchTransaction}\``,
    `Missing-header batch: \`${report.missingHeaderBatch}\``,
    `Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ')}`,
    '',
    '## Summary',
    '',
    `- Rows: ${report.summary.rowCount} (${report.summary.focusCount} focus / ${report.summary.controlCount} control)`,
    `- Ownership regression candidates: ${report.summary.ownershipRegressionCandidates.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Wrong-ref rows: ${report.summary.wrongRefRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Control unsafe rows: ${report.summary.controlUnsafeRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Clean table progress rows: ${report.summary.cleanTableProgressRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '## Rows',
    '',
    '| Row | Role | Start | Final | Classification | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| \`${row.id}\` | ${row.role} | ${row.start.score}/${row.start.grade} | ${row.final.score}/${row.final.grade} | \`${row.classification}\` | ${row.reasons.map(reason => `\`${reason}\``).join(', ')} |`);
  }
  lines.push('', '## Steps', '');
  for (const row of report.rows) {
    lines.push(`### ${row.id}`, '');
    if (row.error) {
      lines.push(`Error: \`${row.error}\``, '');
      continue;
    }
    lines.push('| Tool | Outcome | Before table/orphan/parent | After table/orphan/parent | Classification | Reasons |');
    lines.push('| --- | --- | ---: | ---: | --- | --- |');
    for (const step of row.steps) {
      const sampleReasons = [
        ...step.reasons,
        step.orphanMcidSampleAdded.length > 0 ? `orphan_sample_added:${step.orphanMcidSampleAdded.slice(0, 8).join(',')}` : null,
        step.orphanMcidSampleRemoved.length > 0 ? `orphan_sample_removed:${step.orphanMcidSampleRemoved.slice(0, 8).join(',')}` : null,
        step.orphanAddedReferencedByTargetTable.length > 0 ? `orphan_added_still_referenced_by_target:${step.orphanAddedReferencedByTargetTable.slice(0, 8).join(',')}` : null,
        step.tableMcidOwnershipDeltas.length > 0 ? `table_mcid_delta:${step.tableMcidOwnershipDeltas.slice(0, 4).join(';')}` : null,
      ].filter((reason): reason is string => Boolean(reason));
      lines.push(`| \`${step.toolName}\` | \`${step.outcome}\` | ${step.before.tableMarkup ?? 'n/a'} / ${step.before.orphanMcidCount} / ${step.before.parentTreeDebt} | ${step.after.tableMarkup ?? 'n/a'} / ${step.after.orphanMcidCount} / ${step.after.parentTreeDebt} | \`${step.classification}\` | ${sampleReasons.map(reason => `\`${reason}\``).join(', ')} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await buildReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'table-parent-ownership-probe.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'table-parent-ownership-probe.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'table-parent-ownership-probe.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

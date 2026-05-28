#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS, PYTHON_MUTATION_TIMEOUT_MS } from '../src/config.js';
import { initSchema } from '../src/db/schema.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';
import { remediatePdf } from '../src/services/remediation/orchestrator.js';
import { applyPostRemediationAltRepair, shouldKeepPostRemediationAltRepair } from '../src/services/remediation/altStructureRepair.js';
import { runPythonMutationBatch, type PythonMutation } from '../src/python/bridge.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';

export type TableTemplateTransactionClassification =
  | 'table_family_cleared'
  | 'table_family_cleared_mixed_non_table_debt_remaining'
  | 'table_family_improved_not_cleared'
  | 'control_changed'
  | 'control_stable'
  | 'unsafe_non_table_side_effect'
  | 'no_table_finalization_effect'
  | 'analysis_or_mutation_error';

export interface TableTemplateTransactionInputRow {
  id: string;
  pdfPath: string;
  role: 'focus' | 'control';
}

export interface TableTemplateTransactionMetrics {
  score: number | null;
  grade: string | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  headingStructure: number | null;
  altText: number | null;
  linkQuality: number | null;
  readingOrder: number | null;
  tableHeaderAudit: NonNullable<DocumentSnapshot['tableHeaderAudit']> | null;
  tableSignals: NonNullable<DocumentSnapshot['detectionProfile']>['tableSignals'] | null;
  pdfUaSignals: NonNullable<DocumentSnapshot['detectionProfile']>['pdfUaSignals'] | null;
}

export interface TableTemplateTransactionDelta {
  score: number | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  headingStructure: number | null;
  altText: number | null;
  linkQuality: number | null;
  readingOrder: number | null;
  headerAssociationMissingCount: number | null;
  orphanHeaderCellCount: number | null;
  dataCellsWithoutHeaderCount: number | null;
  dataCellsWithHeadersCount: number | null;
  irregularTableCount: number | null;
  stronglyIrregularTableCount: number | null;
  orphanMcidCount: number | null;
}

export interface TableTemplateTransactionRow {
  id: string;
  pdfPath: string;
  role: 'focus' | 'control';
  classification: TableTemplateTransactionClassification;
  promotionSupported: boolean;
  reasons: string[];
  before: TableTemplateTransactionMetrics | null;
  after: TableTemplateTransactionMetrics | null;
  delta: TableTemplateTransactionDelta | null;
  mutation: {
    success: boolean;
    appliedCount: number;
    failed: Array<{ op: string; error: string }>;
    appliedRows: Array<{
      index: number;
      op: string;
      note?: string;
      changedTargetCount?: number;
      skippedTargetCount?: number;
    }>;
  };
  deterministicStart?: {
    enabled: boolean;
    rawScore: number | null;
    rawGrade: string | null;
    deterministicScore: number | null;
    deterministicGrade: string | null;
    appliedToolCount: number;
  };
  durationMs: number;
  error?: string;
}

export interface TableTemplateTransactionReport {
  generatedAt: string;
  outDir: string;
  rows: TableTemplateTransactionRow[];
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    byClassification: Record<TableTemplateTransactionClassification, number>;
    promotedFocusRows: string[];
    unsafeRows: string[];
    changedControls: string[];
  };
  decision: {
    status: 'plan_routed_behavior_proof' | 'keep_transaction_diagnostic_only';
    reasons: string[];
  };
}

interface ParsedArgs {
  inputDir: string | null;
  outDir: string;
  rows: TableTemplateTransactionInputRow[];
  limit: number | null;
  analysisTimeoutMs: number;
  mutationTimeoutMs: number;
  startFromDeterministic: boolean;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-template-finalization-transaction-diagnostic.ts [options]

Options:
  --input-dir <dir>       Add PDFs from a directory as focus rows.
  --pdf <id=path>         Focus PDF; repeatable. A plain path uses the basename as id.
  --control <id=path>     Control PDF; repeatable.
  --limit <n>             Limit directory PDFs.
  --out <dir>             Output directory (default: ${DEFAULT_OUT_ROOT}/table-template-finalization-<timestamp>)
  --analysis-timeout-ms <ms>
  --mutation-timeout-ms <ms>
  --start-from-deterministic
                          Run normal deterministic remediation in memory first,
                          then apply the diagnostic table transaction.
  --help                  Show this help.

The script is diagnostic-only. It runs native analysis, applies the explicit
table-template finalization transaction to a temporary PDF, reanalyzes that
temporary result, and deletes the temporary PDF. With --start-from-deterministic
it first runs the normal deterministic in-memory remediation path to reproduce
the plateau state before the explicit transaction. It does not call ODL/PAC/POC,
semantic AI, or write remediated PDFs as artifacts.`;
}

function normalizeId(value: string): string {
  return basename(value).replace(/\.pdf$/i, '');
}

function parseInlinePdf(value: string, role: 'focus' | 'control'): TableTemplateTransactionInputRow {
  const eq = value.indexOf('=');
  if (eq > 0) {
    const id = value.slice(0, eq).trim();
    const pdfPath = value.slice(eq + 1).trim();
    if (!id || !pdfPath) throw new Error(`Invalid --${role === 'focus' ? 'pdf' : 'control'} value: ${value}`);
    return { id, pdfPath: resolve(pdfPath), role };
  }
  return { id: normalizeId(value), pdfPath: resolve(value), role };
}

function parsePositiveInt(value: string | undefined, name: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`Invalid ${name} value: ${value ?? ''}`);
  return parsed;
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()): ParsedArgs {
  let inputDir: string | null = null;
  let outDir = join(DEFAULT_OUT_ROOT, `table-template-finalization-${timestampSlug(now)}`);
  let limit: number | null = null;
  let analysisTimeoutMs = REMEDIATION_ANALYSIS_TIMEOUT_MS;
  let mutationTimeoutMs = Math.max(PYTHON_MUTATION_TIMEOUT_MS, 300_000);
  let startFromDeterministic = false;
  const rows: TableTemplateTransactionInputRow[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--input-dir') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --input-dir value\n${usage()}`);
      inputDir = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--limit') {
      limit = parsePositiveInt(argv[++index], '--limit');
    } else if (arg === '--analysis-timeout-ms') {
      analysisTimeoutMs = parsePositiveInt(argv[++index], '--analysis-timeout-ms');
    } else if (arg === '--mutation-timeout-ms') {
      mutationTimeoutMs = parsePositiveInt(argv[++index], '--mutation-timeout-ms');
    } else if (arg === '--start-from-deterministic') {
      startFromDeterministic = true;
    } else if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --pdf value\n${usage()}`);
      rows.push(parseInlinePdf(value, 'focus'));
    } else if (arg === '--control') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --control value\n${usage()}`);
      rows.push(parseInlinePdf(value, 'control'));
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return { inputDir, outDir: resolve(outDir), rows, limit, analysisTimeoutMs, mutationTimeoutMs, startFromDeterministic };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadRows(args: ParsedArgs): Promise<TableTemplateTransactionInputRow[]> {
  const rows = [...args.rows];
  if (args.inputDir) {
    const entries = await readdir(args.inputDir, { withFileTypes: true });
    const pdfs = entries
      .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith('.pdf'))
      .map(entry => join(args.inputDir!, entry.name))
      .sort((a, b) => basename(a).localeCompare(basename(b)))
      .slice(0, args.limit ?? undefined);
    rows.push(...pdfs.map(pdfPath => ({ id: normalizeId(pdfPath), pdfPath: resolve(pdfPath), role: 'focus' as const })));
  }
  if (args.limit && !args.inputDir) return rows.slice(0, args.limit);
  return rows;
}

export function buildTableTemplateFinalizationMutations(): PythonMutation[] {
  const mutations: PythonMutation[] = [];
  for (let index = 0; index < 8; index += 1) {
    mutations.push({
      op: 'normalize_table_structure',
      params: {
        tableFailureClass: 'short_header_row_template',
        largeObjectBackedTableBatch: true,
        maxTablesPerRun: 24,
        maxSyntheticCells: 8,
      },
    });
  }
  for (let index = 0; index < 6; index += 1) {
    mutations.push({
      op: 'normalize_table_structure',
      params: {
        tableFailureClass: 'strongly_irregular_rows',
        largeObjectBackedTableBatch: true,
        maxTablesPerRun: 24,
        maxSyntheticCells: 480,
      },
    });
  }
  for (let index = 0; index < 2; index += 1) {
    mutations.push({
      op: 'normalize_table_structure',
      params: {
        tableFailureClass: 'single_column_variance_template',
        largeObjectBackedTableBatch: true,
        maxTablesPerRun: 8,
        maxSyntheticCells: 64,
      },
    });
  }
  for (let index = 0; index < 2; index += 1) {
    mutations.push({
      op: 'normalize_table_structure',
      params: {
        tableFailureClass: 'empty_table_shell',
        largeObjectBackedTableBatch: true,
        maxTablesPerRun: 8,
      },
    });
  }
  mutations.push({
    op: 'set_table_header_cells',
    params: {
      tableHeaderAssociation: true,
      associateAllTableHeaders: true,
      includeHeaderOnlyTables: true,
      maxTableHeaderAssociationTargets: 512,
    },
  });
  for (let index = 0; index < 2; index += 1) {
    mutations.push({
      op: 'normalize_table_structure',
      params: {
        tableFailureClass: 'empty_corner_header_cell',
        largeObjectBackedTableBatch: true,
        maxTablesPerRun: 8,
      },
    });
  }
  mutations.push({
    op: 'set_table_header_cells',
    params: {
      tableHeaderAssociation: true,
      associateAllTableHeaders: true,
      includeHeaderOnlyTables: true,
      maxTableHeaderAssociationTargets: 512,
    },
  });
  return mutations;
}

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return typeof row?.score === 'number' ? row.score : null;
}

function metrics(analysis: AnalysisResult, snapshot: DocumentSnapshot): TableTemplateTransactionMetrics {
  return {
    score: analysis.score,
    grade: analysis.grade,
    tableMarkup: categoryScore(analysis, 'table_markup'),
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    headingStructure: categoryScore(analysis, 'heading_structure'),
    altText: categoryScore(analysis, 'alt_text'),
    linkQuality: categoryScore(analysis, 'link_quality'),
    readingOrder: categoryScore(analysis, 'reading_order'),
    tableHeaderAudit: snapshot.tableHeaderAudit ?? null,
    tableSignals: snapshot.detectionProfile?.tableSignals ?? null,
    pdfUaSignals: snapshot.detectionProfile?.pdfUaSignals ?? null,
  };
}

function diffNumber(after: number | null | undefined, before: number | null | undefined): number | null {
  if (typeof after !== 'number' || typeof before !== 'number') return null;
  return after - before;
}

function auditValue(metricsRow: TableTemplateTransactionMetrics | null, key: keyof NonNullable<DocumentSnapshot['tableHeaderAudit']>): number | null {
  const value = metricsRow?.tableHeaderAudit?.[key];
  return typeof value === 'number' ? value : null;
}

function signalValue(metricsRow: TableTemplateTransactionMetrics | null, key: keyof NonNullable<DocumentSnapshot['detectionProfile']>['tableSignals']): number | null {
  const value = metricsRow?.tableSignals?.[key];
  return typeof value === 'number' ? value : null;
}

function orphanMcid(metricsRow: TableTemplateTransactionMetrics | null): number | null {
  const value = metricsRow?.pdfUaSignals?.orphanMcidCount;
  return typeof value === 'number' ? value : null;
}

export function buildDelta(
  before: TableTemplateTransactionMetrics | null,
  after: TableTemplateTransactionMetrics | null,
): TableTemplateTransactionDelta | null {
  if (!before || !after) return null;
  return {
    score: diffNumber(after.score, before.score),
    tableMarkup: diffNumber(after.tableMarkup, before.tableMarkup),
    pdfUaCompliance: diffNumber(after.pdfUaCompliance, before.pdfUaCompliance),
    headingStructure: diffNumber(after.headingStructure, before.headingStructure),
    altText: diffNumber(after.altText, before.altText),
    linkQuality: diffNumber(after.linkQuality, before.linkQuality),
    readingOrder: diffNumber(after.readingOrder, before.readingOrder),
    headerAssociationMissingCount: diffNumber(auditValue(after, 'headerAssociationMissingCount'), auditValue(before, 'headerAssociationMissingCount')),
    orphanHeaderCellCount: diffNumber(auditValue(after, 'orphanHeaderCellCount'), auditValue(before, 'orphanHeaderCellCount')),
    dataCellsWithoutHeaderCount: diffNumber(auditValue(after, 'dataCellsWithoutHeaderCount'), auditValue(before, 'dataCellsWithoutHeaderCount')),
    dataCellsWithHeadersCount: diffNumber(auditValue(after, 'dataCellsWithHeadersCount'), auditValue(before, 'dataCellsWithHeadersCount')),
    irregularTableCount: diffNumber(signalValue(after, 'irregularTableCount'), signalValue(before, 'irregularTableCount')),
    stronglyIrregularTableCount: diffNumber(signalValue(after, 'stronglyIrregularTableCount'), signalValue(before, 'stronglyIrregularTableCount')),
    orphanMcidCount: diffNumber(orphanMcid(after), orphanMcid(before)),
  };
}

function isZero(value: number | null): boolean {
  return value === 0;
}

function lessThanZero(value: number | null): boolean {
  return typeof value === 'number' && value < 0;
}

function greaterThanZero(value: number | null): boolean {
  return typeof value === 'number' && value > 0;
}

function nonTableSideEffects(delta: TableTemplateTransactionDelta): string[] {
  const out: string[] = [];
  if (greaterThanZero(delta.orphanMcidCount)) out.push('orphan_mcid_increased');
  if (lessThanZero(delta.altText)) out.push('alt_text_score_decreased');
  if (lessThanZero(delta.linkQuality)) out.push('link_quality_score_decreased');
  if (lessThanZero(delta.readingOrder)) out.push('reading_order_score_decreased');
  if (lessThanZero(delta.headingStructure)) out.push('heading_structure_score_decreased');
  return out;
}

export function classifyTransactionRow(input: {
  role: 'focus' | 'control';
  before: TableTemplateTransactionMetrics | null;
  after: TableTemplateTransactionMetrics | null;
  delta: TableTemplateTransactionDelta | null;
  mutationSuccess: boolean;
  appliedCount: number;
  failedCount: number;
}): { classification: TableTemplateTransactionClassification; promotionSupported: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.before || !input.after || !input.delta || !input.mutationSuccess || input.failedCount > 0) {
    if (!input.before || !input.after) reasons.push('analysis_missing');
    if (!input.mutationSuccess) reasons.push('mutation_failed');
    if (input.failedCount > 0) reasons.push('mutation_op_failed');
    return { classification: 'analysis_or_mutation_error', promotionSupported: false, reasons };
  }

  const sideEffects = nonTableSideEffects(input.delta);
  if (sideEffects.length > 0) {
    return { classification: 'unsafe_non_table_side_effect', promotionSupported: false, reasons: sideEffects };
  }

  const tableImproved =
    greaterThanZero(input.delta.tableMarkup) ||
    lessThanZero(input.delta.headerAssociationMissingCount) ||
    lessThanZero(input.delta.orphanHeaderCellCount) ||
    lessThanZero(input.delta.dataCellsWithoutHeaderCount) ||
    greaterThanZero(input.delta.dataCellsWithHeadersCount) ||
    lessThanZero(input.delta.irregularTableCount) ||
    lessThanZero(input.delta.stronglyIrregularTableCount);
  const tableCleared =
    (input.after.tableMarkup ?? 0) >= 93 &&
    isZero(auditValue(input.after, 'headerAssociationMissingCount')) &&
    isZero(auditValue(input.after, 'orphanHeaderCellCount')) &&
    isZero(auditValue(input.after, 'dataCellsWithoutHeaderCount')) &&
    isZero(signalValue(input.after, 'irregularTableCount')) &&
    isZero(signalValue(input.after, 'stronglyIrregularTableCount'));

  if (input.role === 'control') {
    if (input.appliedCount > 0 || tableImproved || greaterThanZero(input.delta.score)) {
      reasons.push('control_changed_under_transaction');
      return { classification: 'control_changed', promotionSupported: false, reasons };
    }
    reasons.push('control_stable');
    return { classification: 'control_stable', promotionSupported: false, reasons };
  }

  if (!tableImproved) {
    reasons.push('no_table_family_improvement');
    return { classification: 'no_table_finalization_effect', promotionSupported: false, reasons };
  }

  if (tableCleared && (input.after.score ?? 0) >= 93) {
    reasons.push('table_family_cleared_and_row_reached_target');
    return { classification: 'table_family_cleared', promotionSupported: true, reasons };
  }
  if (tableCleared) {
    reasons.push('table_family_cleared_but_non_table_debt_remains');
    return { classification: 'table_family_cleared_mixed_non_table_debt_remaining', promotionSupported: true, reasons };
  }
  reasons.push('table_family_improved_but_residual_table_debt_remains');
  return { classification: 'table_family_improved_not_cleared', promotionSupported: false, reasons };
}

async function analyzeBuffer(buffer: Buffer, filename: string, timeoutMs: number): Promise<{ result: AnalysisResult; snapshot: DocumentSnapshot }> {
  const path = join(tmpdir(), `pdfaf-template-finalization-${randomUUID()}.pdf`);
  try {
    await writeFile(path, buffer);
    const outcome = await analyzePdf(path, filename, { bypassCache: true, timeoutMs });
    return { result: outcome.result, snapshot: outcome.snapshot };
  } finally {
    await unlink(path).catch(() => {});
  }
}

async function deterministicStartBuffer(input: {
  buffer: Buffer;
  filename: string;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
}): Promise<{
  buffer: Buffer;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedToolCount: number;
}> {
  const memDb = new Database(':memory:');
  try {
    initSchema(memDb);
    const first = await remediatePdf(input.buffer, input.filename, input.analysis, input.snapshot, {
      maxRounds: 10,
      playbookStore: createPlaybookStore(memDb),
      toolOutcomeStore: createToolOutcomeStore(memDb),
    });
    let outBuffer = first.buffer;
    let outAnalysis = first.remediation.after;
    let outSnapshot = first.snapshot;
    let appliedToolCount = first.remediation.appliedTools.length;
    if (outSnapshot.isTagged && outAnalysis.score < 95) {
      const postAlt = await applyPostRemediationAltRepair(outBuffer, input.filename, outAnalysis, outSnapshot);
      if (shouldKeepPostRemediationAltRepair(outAnalysis, postAlt.analysis)) {
        outBuffer = postAlt.buffer;
        outAnalysis = postAlt.analysis;
        outSnapshot = postAlt.snapshot;
      }
    }
    if (outAnalysis.score < 93) {
      const memDb2 = new Database(':memory:');
      try {
        initSchema(memDb2);
        const second = await remediatePdf(outBuffer, input.filename, outAnalysis, outSnapshot, {
          maxRounds: 10,
          playbookStore: createPlaybookStore(memDb2),
          toolOutcomeStore: createToolOutcomeStore(memDb2),
        });
        if (second.remediation.after.score >= outAnalysis.score) {
          outBuffer = second.buffer;
          outAnalysis = second.remediation.after;
          outSnapshot = second.snapshot;
          appliedToolCount += second.remediation.appliedTools.length;
        }
      } finally {
        memDb2.close();
      }
      if (outSnapshot.isTagged && outAnalysis.score < 95) {
        const postAlt = await applyPostRemediationAltRepair(outBuffer, input.filename, outAnalysis, outSnapshot);
        if (shouldKeepPostRemediationAltRepair(outAnalysis, postAlt.analysis)) {
          outBuffer = postAlt.buffer;
          outAnalysis = postAlt.analysis;
          outSnapshot = postAlt.snapshot;
        }
      }
    }
    return { buffer: outBuffer, analysis: outAnalysis, snapshot: outSnapshot, appliedToolCount };
  } finally {
    memDb.close();
  }
}

export async function runTransactionRow(
  row: TableTemplateTransactionInputRow,
  options: { analysisTimeoutMs: number; mutationTimeoutMs: number; startFromDeterministic: boolean },
): Promise<TableTemplateTransactionRow> {
  const started = Date.now();
  try {
    if (!(await pathExists(row.pdfPath))) throw new Error(`PDF not found: ${row.pdfPath}`);
    const inputBuffer = await readFile(row.pdfPath);
    const beforeOutcome = await analyzePdf(row.pdfPath, basename(row.pdfPath), {
      bypassCache: true,
      timeoutMs: options.analysisTimeoutMs,
    });
    let transactionInputBuffer = inputBuffer;
    let transactionInputAnalysis = beforeOutcome.result;
    let transactionInputSnapshot = beforeOutcome.snapshot;
    let deterministicStart: TableTemplateTransactionRow['deterministicStart'] = {
      enabled: options.startFromDeterministic,
      rawScore: beforeOutcome.result.score,
      rawGrade: beforeOutcome.result.grade,
      deterministicScore: beforeOutcome.result.score,
      deterministicGrade: beforeOutcome.result.grade,
      appliedToolCount: 0,
    };
    if (options.startFromDeterministic) {
      const deterministic = await deterministicStartBuffer({
        buffer: inputBuffer,
        filename: basename(row.pdfPath),
        analysis: beforeOutcome.result,
        snapshot: beforeOutcome.snapshot,
      });
      transactionInputBuffer = deterministic.buffer;
      transactionInputAnalysis = deterministic.analysis;
      transactionInputSnapshot = deterministic.snapshot;
      deterministicStart = {
        enabled: true,
        rawScore: beforeOutcome.result.score,
        rawGrade: beforeOutcome.result.grade,
        deterministicScore: deterministic.analysis.score,
        deterministicGrade: deterministic.analysis.grade,
        appliedToolCount: deterministic.appliedToolCount,
      };
    }
    const before = metrics(transactionInputAnalysis, transactionInputSnapshot);
    const mutationResult = await runPythonMutationBatch(
      transactionInputBuffer,
      buildTableTemplateFinalizationMutations(),
      { timeoutMs: options.mutationTimeoutMs, reopenBetweenOps: false },
    );
    const afterOutcome = await analyzeBuffer(mutationResult.buffer, `${row.id}-table-template-finalized.pdf`, options.analysisTimeoutMs);
    const after = metrics(afterOutcome.result, afterOutcome.snapshot);
    const delta = buildDelta(before, after);
    const appliedRows = (mutationResult.result.opResults ?? [])
      .map((opRow, index) => ({ opRow, index }))
      .filter(({ opRow }) => opRow.outcome === 'applied')
      .map(({ opRow, index }) => ({
        index,
        op: opRow.op,
        note: opRow.note,
        changedTargetCount: Array.isArray(opRow.debug?.changedTargetRefs) ? opRow.debug.changedTargetRefs.length : undefined,
        skippedTargetCount: Array.isArray(opRow.debug?.skippedTargetRefs) ? opRow.debug.skippedTargetRefs.length : undefined,
      }));
    const classified = classifyTransactionRow({
      role: row.role,
      before,
      after,
      delta,
      mutationSuccess: mutationResult.result.success,
      appliedCount: mutationResult.result.applied.length,
      failedCount: mutationResult.result.failed.length,
    });
    return {
      id: row.id,
      pdfPath: row.pdfPath,
      role: row.role,
      ...classified,
      before,
      after,
      delta,
      mutation: {
        success: mutationResult.result.success,
        appliedCount: mutationResult.result.applied.length,
        failed: mutationResult.result.failed,
        appliedRows,
      },
      deterministicStart,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      id: row.id,
      pdfPath: row.pdfPath,
      role: row.role,
      classification: 'analysis_or_mutation_error',
      promotionSupported: false,
      reasons: ['exception'],
      before: null,
      after: null,
      delta: null,
      mutation: { success: false, appliedCount: 0, failed: [{ op: '_diagnostic', error: error instanceof Error ? error.message : String(error) }], appliedRows: [] },
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function emptyClassificationCounts(): Record<TableTemplateTransactionClassification, number> {
  return {
    table_family_cleared: 0,
    table_family_cleared_mixed_non_table_debt_remaining: 0,
    table_family_improved_not_cleared: 0,
    control_changed: 0,
    control_stable: 0,
    unsafe_non_table_side_effect: 0,
    no_table_finalization_effect: 0,
    analysis_or_mutation_error: 0,
  };
}

export function buildReport(outDir: string, rows: TableTemplateTransactionRow[], generatedAt = new Date().toISOString()): TableTemplateTransactionReport {
  const byClassification = emptyClassificationCounts();
  for (const row of rows) byClassification[row.classification] += 1;
  const promotedFocusRows = rows.filter(row => row.role === 'focus' && row.promotionSupported).map(row => row.id);
  const unsafeRows = rows.filter(row => row.classification === 'unsafe_non_table_side_effect' || row.classification === 'analysis_or_mutation_error').map(row => row.id);
  const changedControls = rows.filter(row => row.classification === 'control_changed').map(row => row.id);
  const reasons: string[] = [];
  let status: TableTemplateTransactionReport['decision']['status'] = 'keep_transaction_diagnostic_only';
  if (promotedFocusRows.length >= 2 && changedControls.length === 0 && unsafeRows.length === 0) {
    status = 'plan_routed_behavior_proof';
    reasons.push('at_least_two_focus_rows_clear_table_family_without_unsafe_controls');
  } else {
    if (promotedFocusRows.length < 2) reasons.push('fewer_than_two_focus_rows_supported');
    if (changedControls.length > 0) reasons.push('controls_changed');
    if (unsafeRows.length > 0) reasons.push('unsafe_or_error_rows_present');
  }
  return {
    generatedAt,
    outDir,
    rows,
    summary: {
      rowCount: rows.length,
      focusCount: rows.filter(row => row.role === 'focus').length,
      controlCount: rows.filter(row => row.role === 'control').length,
      byClassification,
      promotedFocusRows,
      unsafeRows,
      changedControls,
    },
    decision: { status, reasons },
  };
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export function renderMarkdown(report: TableTemplateTransactionReport): string {
  const lines = [
    '# Table Template Finalization Transaction Diagnostic',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Decision: \`${report.decision.status}\``,
    `- Rows: ${report.summary.rowCount}`,
    `- Focus rows: ${report.summary.focusCount}`,
    `- Controls: ${report.summary.controlCount}`,
    `- Supported focus rows: ${report.summary.promotedFocusRows.length ? report.summary.promotedFocusRows.map(id => `\`${id}\``).join(', ') : 'none'}`,
    `- Changed controls: ${report.summary.changedControls.length ? report.summary.changedControls.map(id => `\`${id}\``).join(', ') : 'none'}`,
    `- Unsafe/error rows: ${report.summary.unsafeRows.length ? report.summary.unsafeRows.map(id => `\`${id}\``).join(', ') : 'none'}`,
    '',
    '## Rows',
    '',
    '| Row | Role | Classification | Score | Table | PDF/UA | Header Missing | Orphan TH | Data Without Headers | Irregular | Strong Irregular | Applied | Reasons |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      `\`${row.id}\``,
      row.role,
      `\`${row.classification}\``,
      `${fmt(row.before?.score)} -> ${fmt(row.after?.score)}`,
      `${fmt(row.before?.tableMarkup)} -> ${fmt(row.after?.tableMarkup)}`,
      `${fmt(row.before?.pdfUaCompliance)} -> ${fmt(row.after?.pdfUaCompliance)}`,
      `${fmt(row.before?.tableHeaderAudit?.headerAssociationMissingCount)} -> ${fmt(row.after?.tableHeaderAudit?.headerAssociationMissingCount)}`,
      `${fmt(row.before?.tableHeaderAudit?.orphanHeaderCellCount)} -> ${fmt(row.after?.tableHeaderAudit?.orphanHeaderCellCount)}`,
      `${fmt(row.before?.tableHeaderAudit?.dataCellsWithoutHeaderCount)} -> ${fmt(row.after?.tableHeaderAudit?.dataCellsWithoutHeaderCount)}`,
      `${fmt(row.before?.tableSignals?.irregularTableCount)} -> ${fmt(row.after?.tableSignals?.irregularTableCount)}`,
      `${fmt(row.before?.tableSignals?.stronglyIrregularTableCount)} -> ${fmt(row.after?.tableSignals?.stronglyIrregularTableCount)}`,
      fmt(row.mutation.appliedCount),
      row.reasons.join(', '),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Classification Counts', '');
  for (const [key, count] of Object.entries(report.summary.byClassification)) {
    lines.push(`- \`${key}\`: ${count}`);
  }
  lines.push('', '## Notes', '');
  lines.push('- Diagnostic-only: no planner, scorer, API, Docker, ODL/PAC/POC runtime, semantic, or production remediation route behavior changes.');
  lines.push('- The temporary mutated PDFs used for reanalysis are deleted by the script; only JSON/Markdown metrics are written.');
  lines.push('- A routed behavior stage still requires independent-source positives, stable controls, `false_positive_applied=0`, original-50 validation, and bounded runtime.');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const rows = await loadRows(args);
  if (rows.length === 0) throw new Error(`No rows provided.\n${usage()}`);
  await mkdir(args.outDir, { recursive: true });
  const results: TableTemplateTransactionRow[] = [];
  for (const [index, row] of rows.entries()) {
    process.stderr.write(`[${index + 1}/${rows.length}] ${row.id} ... `);
    const result = await runTransactionRow(row, args);
    results.push(result);
    process.stderr.write(`${result.before?.score ?? 'n/a'} -> ${result.after?.score ?? 'n/a'} ${result.classification}\n`);
  }
  const report = buildReport(args.outDir, results);
  await writeFile(join(args.outDir, 'table-template-finalization-transaction.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'table-template-finalization-transaction.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote table template finalization diagnostic to ${args.outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

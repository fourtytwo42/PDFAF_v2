#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { isRealRootReachableTableTarget } from '../src/services/remediation/tableTargetGuards.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';
const TABLE_RULE_IDS = new Set([
  'pdfua.table.header_association_present',
  'pdfua.table.header_cells_associated',
  'pdfua.table.headers_present',
  'pdfua.table.regular_rows',
  'pdfua.table.structure_regular',
]);
const PAC_CAP_REASON_PREFIX = 'PAC rule failure: ';

type SnapshotTable = DocumentSnapshot['tables'][number];

export type RepeatedTableTemplateClassification =
  | 'repeated_template_finalization_candidate'
  | 'repeated_template_control_triggered'
  | 'control_or_high_grade_template_noise'
  | 'real_table_debt_without_repeated_template'
  | 'layout_or_non_table_only'
  | 'no_table_template_support'
  | 'analysis_error';

export interface RepeatedTableTemplateInputRow {
  id: string;
  pdfPath: string;
  role: 'focus' | 'control';
}

export interface TableTemplateGroup {
  signature: string;
  tableCount: number;
  realReachableTableCount: number;
  pageCount: number;
  pages: number[];
  sampleRefs: string[];
  rowCount: number | null;
  dominantColumnCount: number | null;
  headerCount: number | null;
  hasHeaders: boolean | null;
  maxRowSpan: number | null;
  maxColSpan: number | null;
  rowCellCounts: number[];
  totalCells: number;
  totalHeaderCells: number;
  estimatedDataCellDebt: number;
  irregularRowTotal: number;
  misplacedCellTotal: number;
  removableEmptyRowTotal: number;
  subtreeMcidTotal: number;
}

export interface RepeatedTableTemplateFeatures {
  score: number | null;
  grade: string | null;
  pageCount: number | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  headingStructure: number | null;
  readingOrder: number | null;
  realReachableTableCount: number;
  nonRealTableCount: number;
  repeatedGroupCount: number;
  largestRepeatedGroupCount: number;
  largestRepeatedGroupDebt: number;
  repeatedTemplateDebt: number;
  repeatedTemplateTableCount: number;
  tableHeaderAudit: NonNullable<DocumentSnapshot['tableHeaderAudit']> | null;
  tableSignals: {
    directCellUnderTableCount: number;
    misplacedCellCount: number;
    irregularTableCount: number;
    stronglyIrregularTableCount: number;
    layoutTableCandidateCount: number;
    denseRowBandTableCandidateCount: number;
  };
  strictTablePacRules: string[];
}

export interface RepeatedTableTemplateRow {
  id: string;
  pdfPath: string;
  role: 'focus' | 'control';
  classification: RepeatedTableTemplateClassification;
  promotionSupported: boolean;
  wouldPromoteIfFocus: boolean;
  reasons: string[];
  features: RepeatedTableTemplateFeatures;
  topTemplateGroups: TableTemplateGroup[];
  error?: string;
}

export interface RepeatedTableTemplateReport {
  generatedAt: string;
  outDir: string;
  rows: RepeatedTableTemplateRow[];
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    byClassification: Record<RepeatedTableTemplateClassification, number>;
    focusCandidates: string[];
    unsafeControlCandidates: string[];
    highVolumeRepeatedRows: string[];
  };
  decision: {
    status: 'plan_repeated_template_behavior_proof' | 'keep_repeated_template_diagnostic_only';
    reasons: string[];
  };
}

interface ParsedArgs {
  outDir: string;
  rows: RepeatedTableTemplateInputRow[];
  manifest: string | null;
  limit: number | null;
}

interface ManifestRow {
  id?: unknown;
  file?: unknown;
  localFile?: unknown;
  pdfPath?: unknown;
  role?: unknown;
  control?: unknown;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/repeated-table-template-diagnostic.ts [options]

Options:
  --pdf <id=path>       Focus PDF; repeatable. A plain path uses the basename as id.
  --control <id=path>   Control PDF; repeatable.
  --manifest <path>     Optional manifest with rows containing id and file/localFile/pdfPath.
  --limit <n>           Limit loaded rows.
  --out <dir>           Output directory (default: ${DEFAULT_OUT_ROOT}/repeated-table-template-<timestamp>)
  --help                Show this help.

The script runs native PDFAF analysis only. It does not remediate PDFs, write remediated PDFs, call ODL/PAC/POC, or use semantic AI.`;
}

function normalizeId(value: string): string {
  return basename(value).replace(/\.pdf$/i, '');
}

function parseInlinePdf(value: string, role: 'focus' | 'control'): RepeatedTableTemplateInputRow {
  const eq = value.indexOf('=');
  if (eq > 0) {
    const id = value.slice(0, eq).trim();
    const pdfPath = value.slice(eq + 1).trim();
    if (!id || !pdfPath) throw new Error(`Invalid --${role === 'focus' ? 'pdf' : 'control'} value: ${value}`);
    return { id, pdfPath: resolve(pdfPath), role };
  }
  return { id: normalizeId(value), pdfPath: resolve(value), role };
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()): ParsedArgs {
  let outDir = join(DEFAULT_OUT_ROOT, `repeated-table-template-${timestampSlug(now)}`);
  let manifest: string | null = null;
  let limit: number | null = null;
  const rows: RepeatedTableTemplateInputRow[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--manifest') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --manifest value\n${usage()}`);
      manifest = resolve(value);
    } else if (arg === '--limit') {
      const value = argv[++index];
      const parsed = Number.parseInt(value ?? '', 10);
      if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`Invalid --limit value: ${value}`);
      limit = parsed;
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

  return { outDir, manifest, limit, rows };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function manifestRows(value: unknown): ManifestRow[] {
  if (Array.isArray(value)) return value as ManifestRow[];
  const rows = (value as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as ManifestRow[] : [];
}

export async function loadManifestRows(manifest: string): Promise<RepeatedTableTemplateInputRow[]> {
  const parsed = JSON.parse(await readFile(manifest, 'utf8')) as unknown;
  const baseDir = resolve(manifest, '..');
  return manifestRows(parsed)
    .map(row => {
      const file = stringValue(row.pdfPath) ?? stringValue(row.localFile) ?? stringValue(row.file);
      if (!file) return null;
      const pdfPath = resolve(baseDir, file);
      const id = stringValue(row.id) ?? normalizeId(pdfPath);
      const role = row.role === 'control' || boolValue(row.control) === true ? 'control' : 'focus';
      return { id, pdfPath, role } satisfies RepeatedTableTemplateInputRow;
    })
    .filter((row): row is RepeatedTableTemplateInputRow => Boolean(row));
}

function categoryScore(result: AnalysisResult, key: CategoryKey): number | null {
  return result.categories.find(category => category.key === key)?.score ?? null;
}

function pacRuleId(cap: ScoreCapApplied): string | null {
  return cap.reason.startsWith(PAC_CAP_REASON_PREFIX)
    ? cap.reason.slice(PAC_CAP_REASON_PREFIX.length).trim()
    : null;
}

function strictTablePacRules(result: AnalysisResult): string[] {
  return [...new Set((result.scoreCapsApplied ?? [])
    .map(pacRuleId)
    .filter((rule): rule is string => Boolean(rule && TABLE_RULE_IDS.has(rule))))].sort();
}

function normalizeRole(role: unknown): string | null {
  return typeof role === 'string' && role.trim() ? role.trim().replace(/^\//, '').toUpperCase() : null;
}

function boundedRowCounts(table: SnapshotTable): number[] {
  if (Array.isArray(table.rowCellCounts) && table.rowCellCounts.length > 0) {
    return table.rowCellCounts
      .map(value => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0)
      .slice(0, 32);
  }
  if (typeof table.rowCount === 'number' && table.rowCount > 0) {
    const dominant = Math.max(0, Math.trunc(table.dominantColumnCount ?? 0));
    if (dominant > 0) return Array.from({ length: Math.min(32, Math.trunc(table.rowCount)) }, () => dominant);
  }
  return [];
}

function rowCountsSignature(rowCounts: readonly number[]): string {
  if (rowCounts.length === 0) return 'unknown';
  const body = rowCounts.slice(0, 16).join('-');
  return rowCounts.length > 16 ? `${body}-plus${rowCounts.length - 16}` : body;
}

export function tableTemplateSignature(table: SnapshotTable): string {
  const rowCounts = boundedRowCounts(table);
  const rowCount = typeof table.rowCount === 'number' ? Math.max(0, Math.trunc(table.rowCount)) : rowCounts.length;
  const dominant = typeof table.dominantColumnCount === 'number'
    ? Math.max(0, Math.trunc(table.dominantColumnCount))
    : 0;
  const headerCount = typeof table.headerCount === 'number' ? Math.max(0, Math.trunc(table.headerCount)) : 0;
  const span = `${Math.max(1, Math.trunc(table.maxRowSpan ?? 1))}x${Math.max(1, Math.trunc(table.maxColSpan ?? 1))}`;
  const role = normalizeRole(table.rawRole) ?? normalizeRole(table.resolvedRole) ?? 'UNKNOWN';
  return [
    `role=${role}`,
    `headers=${table.hasHeaders === true ? 'yes' : table.hasHeaders === false ? 'no' : 'unknown'}:${headerCount}`,
    `rows=${rowCount}`,
    `dom=${dominant}`,
    `span=${span}`,
    `cells=${rowCountsSignature(rowCounts)}`,
  ].join('|');
}

function firstNumber(values: Array<number | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function buildGroup(signature: string, tables: SnapshotTable[]): TableTemplateGroup {
  const rowCellCounts = boundedRowCounts(tables[0]!);
  const pages = [...new Set(tables.map(table => table.page).filter(page => Number.isFinite(page)))].sort((a, b) => a - b);
  const realReachable = tables.filter(isRealRootReachableTableTarget);
  const totalCells = tables.reduce((sum, table) => sum + Math.max(0, table.totalCells ?? 0), 0);
  const totalHeaderCells = tables.reduce((sum, table) => sum + Math.max(0, table.headerCount ?? 0), 0);
  return {
    signature,
    tableCount: tables.length,
    realReachableTableCount: realReachable.length,
    pageCount: pages.length,
    pages: pages.slice(0, 12),
    sampleRefs: tables.map(table => table.structRef).filter((ref): ref is string => Boolean(ref)).slice(0, 12),
    rowCount: firstNumber(tables.map(table => table.rowCount)),
    dominantColumnCount: firstNumber(tables.map(table => table.dominantColumnCount)),
    headerCount: firstNumber(tables.map(table => table.headerCount)),
    hasHeaders: typeof tables[0]?.hasHeaders === 'boolean' ? tables[0]!.hasHeaders : null,
    maxRowSpan: firstNumber(tables.map(table => table.maxRowSpan)),
    maxColSpan: firstNumber(tables.map(table => table.maxColSpan)),
    rowCellCounts,
    totalCells,
    totalHeaderCells,
    estimatedDataCellDebt: Math.max(0, totalCells - totalHeaderCells),
    irregularRowTotal: tables.reduce((sum, table) => sum + Math.max(0, table.irregularRows ?? 0), 0),
    misplacedCellTotal: tables.reduce((sum, table) => sum + Math.max(0, table.cellsMisplacedCount ?? 0), 0),
    removableEmptyRowTotal: tables.reduce((sum, table) => sum + Math.max(0, table.removableEmptyRowCount ?? 0), 0),
    subtreeMcidTotal: tables.reduce((sum, table) => sum + Math.max(0, table.subtreeMcidCount ?? 0), 0),
  };
}

export function buildTemplateGroups(tables: readonly SnapshotTable[]): TableTemplateGroup[] {
  const bySignature = new Map<string, SnapshotTable[]>();
  for (const table of tables) {
    if (!isRealRootReachableTableTarget(table)) continue;
    const signature = tableTemplateSignature(table);
    const existing = bySignature.get(signature) ?? [];
    existing.push(table);
    bySignature.set(signature, existing);
  }
  return [...bySignature.entries()]
    .map(([signature, grouped]) => buildGroup(signature, grouped))
    .sort((a, b) =>
      b.tableCount - a.tableCount ||
      b.estimatedDataCellDebt - a.estimatedDataCellDebt ||
      b.totalCells - a.totalCells ||
      a.signature.localeCompare(b.signature),
    );
}

function emptyAudit(): NonNullable<DocumentSnapshot['tableHeaderAudit']> | null {
  return null;
}

function tableAuditDebt(audit: NonNullable<DocumentSnapshot['tableHeaderAudit']> | null): number {
  if (!audit || audit.tablesChecked <= 0) return 0;
  return Math.max(0, audit.dataCellsWithoutHeaderCount ?? 0) +
    Math.max(0, audit.headerAssociationMissingCount ?? 0) +
    Math.max(0, audit.orphanHeaderCellCount ?? 0);
}

function repeatedTemplateCandidate(features: RepeatedTableTemplateFeatures): boolean {
  const lowTableScore = (features.tableMarkup ?? 100) < 80;
  const pacDebt = tableAuditDebt(features.tableHeaderAudit) >= 100 || features.strictTablePacRules.length > 0;
  const structuralDebt = features.tableSignals.stronglyIrregularTableCount >= 8 ||
    features.tableSignals.irregularTableCount >= 12 ||
    features.tableSignals.misplacedCellCount >= 20 ||
    features.tableSignals.directCellUnderTableCount >= 20;
  const repeatedEnough = features.largestRepeatedGroupCount >= 8 &&
    features.largestRepeatedGroupDebt >= 80 &&
    features.repeatedTemplateTableCount >= 8;
  return lowTableScore && repeatedEnough && (pacDebt || structuralDebt);
}

export function classifyRepeatedTableTemplateRow(input: {
  row: Pick<RepeatedTableTemplateInputRow, 'id' | 'role'>;
  features: RepeatedTableTemplateFeatures;
  groups: readonly TableTemplateGroup[];
  error?: string | null;
}): Pick<RepeatedTableTemplateRow, 'classification' | 'promotionSupported' | 'wouldPromoteIfFocus' | 'reasons'> {
  const reasons: string[] = [];
  if (input.error) {
    return {
      classification: 'analysis_error',
      promotionSupported: false,
      wouldPromoteIfFocus: false,
      reasons: [input.error],
    };
  }

  const wouldPromoteIfFocus = repeatedTemplateCandidate(input.features);
  const hasLayoutOnlyEvidence = input.features.realReachableTableCount === 0 &&
    (input.features.tableSignals.layoutTableCandidateCount > 0 || input.features.tableSignals.denseRowBandTableCandidateCount > 0);
  const highGrade = (input.features.score ?? 0) >= 93 && (input.features.tableMarkup ?? 0) >= 80;

  if (wouldPromoteIfFocus) {
    reasons.push('low_table_score_with_high_volume_repeated_real_table_template');
    reasons.push(`largest_repeated_group:${input.features.largestRepeatedGroupCount}`);
    reasons.push(`largest_repeated_debt:${input.features.largestRepeatedGroupDebt}`);
    if (input.features.strictTablePacRules.length > 0) reasons.push(`strict_table_pac:${input.features.strictTablePacRules.join(',')}`);
    if (input.row.role === 'control') {
      return {
        classification: 'repeated_template_control_triggered',
        promotionSupported: false,
        wouldPromoteIfFocus,
        reasons,
      };
    }
    return {
      classification: 'repeated_template_finalization_candidate',
      promotionSupported: true,
      wouldPromoteIfFocus,
      reasons,
    };
  }

  if (input.row.role === 'control' || highGrade) {
    reasons.push(highGrade ? 'high_grade_or_table_score_control' : 'control_without_candidate_predicate');
    return {
      classification: 'control_or_high_grade_template_noise',
      promotionSupported: false,
      wouldPromoteIfFocus,
      reasons,
    };
  }

  if (input.features.realReachableTableCount > 0 && ((input.features.tableMarkup ?? 100) < 80 || tableAuditDebt(input.features.tableHeaderAudit) > 0)) {
    reasons.push('real_table_debt_present_but_no_high_volume_repeated_template');
    if (input.features.largestRepeatedGroupCount > 0) reasons.push(`largest_repeated_group:${input.features.largestRepeatedGroupCount}`);
    return {
      classification: 'real_table_debt_without_repeated_template',
      promotionSupported: false,
      wouldPromoteIfFocus,
      reasons,
    };
  }

  if (hasLayoutOnlyEvidence) {
    reasons.push('layout_table_signal_without_real_root_reachable_table_refs');
    return {
      classification: 'layout_or_non_table_only',
      promotionSupported: false,
      wouldPromoteIfFocus,
      reasons,
    };
  }

  reasons.push('no_repeated_table_template_support');
  return {
    classification: 'no_table_template_support',
    promotionSupported: false,
    wouldPromoteIfFocus,
    reasons,
  };
}

function buildFeatures(result: AnalysisResult, snapshot: DocumentSnapshot, groups: readonly TableTemplateGroup[]): RepeatedTableTemplateFeatures {
  const tableSignals = snapshot.detectionProfile?.tableSignals;
  const repeatedGroups = groups.filter(group => group.tableCount >= 2);
  const highVolumeGroups = groups.filter(group => group.tableCount >= 8 && group.estimatedDataCellDebt >= 80);
  const top = groups[0];
  return {
    score: result.score,
    grade: result.grade,
    pageCount: snapshot.pageCount ?? result.pageCount,
    tableMarkup: categoryScore(result, 'table_markup'),
    pdfUaCompliance: categoryScore(result, 'pdf_ua_compliance'),
    headingStructure: categoryScore(result, 'heading_structure'),
    readingOrder: categoryScore(result, 'reading_order'),
    realReachableTableCount: snapshot.tables.filter(isRealRootReachableTableTarget).length,
    nonRealTableCount: snapshot.tables.filter(table => !isRealRootReachableTableTarget(table)).length,
    repeatedGroupCount: repeatedGroups.length,
    largestRepeatedGroupCount: top?.tableCount ?? 0,
    largestRepeatedGroupDebt: top?.estimatedDataCellDebt ?? 0,
    repeatedTemplateDebt: highVolumeGroups.reduce((sum, group) => sum + group.estimatedDataCellDebt, 0),
    repeatedTemplateTableCount: highVolumeGroups.reduce((sum, group) => sum + group.tableCount, 0),
    tableHeaderAudit: snapshot.tableHeaderAudit ?? emptyAudit(),
    tableSignals: {
      directCellUnderTableCount: tableSignals?.directCellUnderTableCount ?? 0,
      misplacedCellCount: tableSignals?.misplacedCellCount ?? 0,
      irregularTableCount: tableSignals?.irregularTableCount ?? 0,
      stronglyIrregularTableCount: tableSignals?.stronglyIrregularTableCount ?? 0,
      layoutTableCandidateCount: tableSignals?.layoutTableCandidateCount ?? 0,
      denseRowBandTableCandidateCount: tableSignals?.denseRowBandTableCandidateCount ?? 0,
    },
    strictTablePacRules: strictTablePacRules(result),
  };
}

async function analyzeRow(row: RepeatedTableTemplateInputRow): Promise<RepeatedTableTemplateRow> {
  try {
    if (!await pathExists(row.pdfPath)) throw new Error(`PDF not found: ${row.pdfPath}`);
    const { result, snapshot } = await analyzePdf(row.pdfPath, basename(row.pdfPath), {
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
      bypassCache: true,
    });
    const groups = buildTemplateGroups(snapshot.tables);
    const features = buildFeatures(result, snapshot, groups);
    const classified = classifyRepeatedTableTemplateRow({ row, features, groups });
    return {
      ...row,
      ...classified,
      features,
      topTemplateGroups: groups.slice(0, 12),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const features: RepeatedTableTemplateFeatures = {
      score: null,
      grade: null,
      pageCount: null,
      tableMarkup: null,
      pdfUaCompliance: null,
      headingStructure: null,
      readingOrder: null,
      realReachableTableCount: 0,
      nonRealTableCount: 0,
      repeatedGroupCount: 0,
      largestRepeatedGroupCount: 0,
      largestRepeatedGroupDebt: 0,
      repeatedTemplateDebt: 0,
      repeatedTemplateTableCount: 0,
      tableHeaderAudit: null,
      tableSignals: {
        directCellUnderTableCount: 0,
        misplacedCellCount: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
        layoutTableCandidateCount: 0,
        denseRowBandTableCandidateCount: 0,
      },
      strictTablePacRules: [],
    };
    const classified = classifyRepeatedTableTemplateRow({ row, features, groups: [], error: message });
    return {
      ...row,
      ...classified,
      features,
      topTemplateGroups: [],
      error: message,
    };
  }
}

export function buildRepeatedTableTemplateReport(input: {
  outDir: string;
  rows: RepeatedTableTemplateRow[];
  generatedAt?: string;
}): RepeatedTableTemplateReport {
  const byClassification = Object.fromEntries([
    'repeated_template_finalization_candidate',
    'repeated_template_control_triggered',
    'control_or_high_grade_template_noise',
    'real_table_debt_without_repeated_template',
    'layout_or_non_table_only',
    'no_table_template_support',
    'analysis_error',
  ].map(key => [key, 0])) as Record<RepeatedTableTemplateClassification, number>;
  for (const row of input.rows) byClassification[row.classification] += 1;

  const focusCandidates = input.rows
    .filter(row => row.role === 'focus' && row.promotionSupported)
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));
  const unsafeControlCandidates = input.rows
    .filter(row => row.role === 'control' && row.wouldPromoteIfFocus)
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));
  const highVolumeRepeatedRows = input.rows
    .filter(row => row.features.repeatedTemplateTableCount >= 8)
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));

  const reasons: string[] = [];
  if (focusCandidates.length < 2) reasons.push('fewer_than_two_focus_repeated_template_candidates');
  if (unsafeControlCandidates.length > 0) reasons.push(`controls_match_predicate:${unsafeControlCandidates.join(',')}`);
  const hasAnalysisErrors = input.rows.some(row => row.classification === 'analysis_error');
  if (hasAnalysisErrors) reasons.push('one_or_more_analysis_errors');
  const status = focusCandidates.length >= 2 && unsafeControlCandidates.length === 0 && !hasAnalysisErrors
    ? 'plan_repeated_template_behavior_proof'
    : 'keep_repeated_template_diagnostic_only';
  if (status === 'plan_repeated_template_behavior_proof') {
    reasons.push('at_least_two_focus_rows_share_high_volume_repeated_template_predicate');
    reasons.push('no_controls_match_repeated_template_predicate');
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    rows: input.rows,
    summary: {
      rowCount: input.rows.length,
      focusCount: input.rows.filter(row => row.role === 'focus').length,
      controlCount: input.rows.filter(row => row.role === 'control').length,
      byClassification,
      focusCandidates,
      unsafeControlCandidates,
      highVolumeRepeatedRows,
    },
    decision: { status, reasons },
  };
}

function md(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace(/\|/g, '\\|');
}

function tableRow(values: unknown[]): string {
  return `| ${values.map(md).join(' | ')} |`;
}

export function renderRepeatedTableTemplateMarkdown(report: RepeatedTableTemplateReport): string {
  const lines: string[] = [];
  lines.push('# Repeated Table Template Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Decision: \`${report.decision.status}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Rows: ${report.summary.rowCount} (${report.summary.focusCount} focus, ${report.summary.controlCount} control)`);
  lines.push(`- Focus candidates: ${report.summary.focusCandidates.join(', ') || 'none'}`);
  lines.push(`- Unsafe controls: ${report.summary.unsafeControlCandidates.join(', ') || 'none'}`);
  lines.push(`- High-volume repeated rows: ${report.summary.highVolumeRepeatedRows.join(', ') || 'none'}`);
  lines.push(`- Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push(tableRow(['classification', 'count']));
  lines.push(tableRow(['---', '---:']));
  for (const [classification, count] of Object.entries(report.summary.byClassification)) {
    lines.push(tableRow([classification, count]));
  }
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push(tableRow([
    'id',
    'role',
    'score',
    'grade',
    'table',
    'tables',
    'top group',
    'top debt',
    'audit data no header',
    'strong irregular',
    'classification',
  ]));
  lines.push(tableRow(['---', '---', '---:', '---', '---:', '---:', '---:', '---:', '---:', '---:', '---']));
  for (const row of report.rows) {
    const audit = row.features.tableHeaderAudit;
    lines.push(tableRow([
      row.id,
      row.role,
      row.features.score,
      row.features.grade,
      row.features.tableMarkup,
      row.features.realReachableTableCount,
      row.features.largestRepeatedGroupCount,
      row.features.largestRepeatedGroupDebt,
      audit?.dataCellsWithoutHeaderCount ?? 0,
      row.features.tableSignals.stronglyIrregularTableCount,
      row.classification,
    ]));
  }
  lines.push('');
  lines.push('## Top Template Groups');
  for (const row of report.rows) {
    lines.push('');
    lines.push(`### ${row.id}`);
    lines.push('');
    lines.push(`Reasons: ${row.reasons.map(reason => `\`${reason}\``).join(', ') || 'none'}`);
    lines.push('');
    lines.push(tableRow(['count', 'pages', 'rows', 'dominant', 'headers', 'cells', 'debt', 'irregular', 'empty TR', 'refs', 'signature']));
    lines.push(tableRow(['---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---:', '---', '---']));
    for (const group of row.topTemplateGroups.slice(0, 8)) {
      lines.push(tableRow([
        group.tableCount,
        group.pageCount,
        group.rowCount,
        group.dominantColumnCount,
        group.headerCount,
        group.totalCells,
        group.estimatedDataCellDebt,
        group.irregularRowTotal,
        group.removableEmptyRowTotal,
        group.sampleRefs.slice(0, 4).join(', '),
        group.signature,
      ]));
    }
    if (row.topTemplateGroups.length === 0) lines.push(tableRow(['none', '', '', '', '', '', '', '', '', '', '']));
  }
  lines.push('');
  lines.push('This diagnostic is reporting-only. It uses native PDFAF analysis, does not remediate or write PDFs, does not call ODL/PAC/POC, and does not change scoring or planning.');
  return `${lines.join('\n')}\n`;
}

async function buildReport(args: ParsedArgs): Promise<RepeatedTableTemplateReport> {
  const manifestRows = args.manifest ? await loadManifestRows(args.manifest) : [];
  const rows = [...manifestRows, ...args.rows].slice(0, args.limit ?? undefined);
  if (rows.length === 0) throw new Error(`No rows supplied\n${usage()}`);
  const diagnostics: RepeatedTableTemplateRow[] = [];
  for (const row of rows) {
    diagnostics.push(await analyzeRow(row));
  }
  return buildRepeatedTableTemplateReport({ outDir: args.outDir, rows: diagnostics });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await buildReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'repeated-table-template-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'repeated-table-template-diagnostic.md'), renderRepeatedTableTemplateMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'repeated-table-template-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

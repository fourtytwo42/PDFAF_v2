#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';
import {
  rankAssociationTables,
  selectBatchStructRefs,
  type RankedTableHeaderBatchTarget,
} from './pac-table-header-batch-diagnostic.js';
import type { TableEvidenceRow } from './pac-table-header-target-diagnostic.js';

const DEFAULT_MANIFEST = '/mnt/pdf-review/pdfaf-validation/table-header-transaction-2026-05-21-r1/manifest.json';
const DEFAULT_RUN = '/mnt/pdf-review/pdfaf-validation/table-header-transaction-2026-05-21-r1/run-r1/remediate.results.json';
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';
const TABLE_TOOL_NAMES = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);
const TABLE_RULE_IDS = new Set(['pdfua.table.header_association_present', 'pdfua.table.header_cells_associated']);

export type TableTargetResolutionClassification =
  | 'stable_header_assoc_target'
  | 'stable_normalize_target'
  | 'layout_only_no_table_target'
  | 'non_table_target_attempt'
  | 'control_or_high_grade_noise'
  | 'no_table_target_resolution_support'
  | 'analysis_error';

export interface TableTargetResolutionInputRow {
  id: string;
  pdfPath: string;
  role: 'focus' | 'control';
  intent?: string;
}

export interface PriorTableAttempt {
  toolName: string;
  outcome: string;
  targetRef: string | null;
  targetResolved: boolean | null;
  resolvedRole: string | null;
  note: string | null;
}

export interface TableTargetResolutionFeatures {
  score: number | null;
  grade: string | null;
  pageCount: number | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  tableCount: number;
  stableTableCount: number;
  stableNormalizeTargetCount: number;
  stableHeaderAssociationTargetCount: number;
  selectedAssociationRefs: string[];
  estimatedAssociationTdDebt: number;
  tableHeaderDebt: boolean;
  tableShapeDebt: boolean;
  tableScoreDebt: boolean;
  strictTablePacRules: string[];
  pacTableFailures: string[];
  layoutTableCandidateCount: number;
  denseRowBandTableCandidateCount: number;
  undersegmentedTableCandidateCount: number;
  priorTableAttemptCount: number;
  priorNonTableAttemptCount: number;
  priorAppliedTableCount: number;
  priorResolvedTableAttemptCount: number;
}

export interface TableTargetResolutionDiagnosticRow {
  id: string;
  pdfPath: string;
  role: 'focus' | 'control';
  classification: TableTargetResolutionClassification;
  promotionSupported: boolean;
  reasons: string[];
  features: TableTargetResolutionFeatures;
  topNormalizeTargets: TableEvidenceRow[];
  topAssociationTargets: RankedTableHeaderBatchTarget[];
  priorAttempts: PriorTableAttempt[];
  error?: string;
}

export interface TableTargetResolutionDiagnosticReport {
  generatedAt: string;
  manifest: string;
  run: string | null;
  outDir: string;
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    byClassification: Record<string, number>;
    stableFocusCandidates: string[];
    unsafeControlCandidates: string[];
    nonTableAttemptRows: string[];
  };
  decision: {
    status: 'plan_table_target_behavior_proof' | 'keep_table_target_resolution_diagnostic_only';
    reason: string;
  };
  rows: TableTargetResolutionDiagnosticRow[];
}

interface ParsedArgs {
  manifest: string;
  run: string | null;
  outDir: string;
  rows: TableTargetResolutionInputRow[];
  limit: number | null;
}

interface ManifestRow {
  id?: unknown;
  publicationId?: unknown;
  file?: unknown;
  localFile?: unknown;
  intent?: unknown;
  problemMix?: unknown;
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/table-target-resolution-diagnostic.ts [--manifest <manifest.json>] [--run <remediate.results.json>] [--out <dir>] [--limit <n>] [--pdf <id=path>]... [--control <id=path>]...',
    '',
    `Defaults: --manifest ${DEFAULT_MANIFEST} --run ${DEFAULT_RUN} --out ${DEFAULT_OUT_ROOT}/table-target-resolution-<timestamp>`,
  ].join('\n');
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function normalizeId(value: string): string {
  return basename(value)
    .replace(/\.pdf$/i, '')
    .replace(/^v1-/, '')
    .replace(/^v1_/, '')
    .trim();
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseInlinePdf(value: string, role: 'focus' | 'control'): TableTargetResolutionInputRow {
  const eq = value.indexOf('=');
  if (eq > 0) {
    const id = value.slice(0, eq).trim();
    const pdfPath = value.slice(eq + 1).trim();
    if (!id || !pdfPath) throw new Error(`Invalid --${role === 'focus' ? 'pdf' : 'control'} value: ${value}`);
    return { id, pdfPath, role };
  }
  return { id: normalizeId(value), pdfPath: value, role };
}

export function parseArgs(argv: string[], now = new Date()): ParsedArgs {
  let manifest = DEFAULT_MANIFEST;
  let run: string | null = DEFAULT_RUN;
  let outDir = join(DEFAULT_OUT_ROOT, `table-target-resolution-${timestampSlug(now)}`);
  let limit: number | null = null;
  const rows: TableTargetResolutionInputRow[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--manifest' && next) {
      manifest = next;
      index += 1;
    } else if (arg === '--run' && next) {
      run = next === 'none' ? null : next;
      index += 1;
    } else if (arg === '--out' && next) {
      outDir = next;
      index += 1;
    } else if (arg === '--limit' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`Invalid --limit value: ${next}`);
      limit = parsed;
      index += 1;
    } else if (arg === '--pdf' && next) {
      rows.push(parseInlinePdf(next, 'focus'));
      index += 1;
    } else if (arg === '--control' && next) {
      rows.push(parseInlinePdf(next, 'control'));
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return { manifest, run, outDir, rows, limit };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function manifestRows(value: unknown): ManifestRow[] {
  if (Array.isArray(value)) return value as ManifestRow[];
  const rows = (value as { rows?: unknown }).rows;
  return Array.isArray(rows) ? rows as ManifestRow[] : [];
}

export async function loadManifestRows(path: string): Promise<TableTargetResolutionInputRow[]> {
  const json = JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  return manifestRows(json)
    .map(row => {
      const id = stringValue(row.id) ?? stringValue(row.publicationId);
      const pdfPath = stringValue(row.file) ?? stringValue(row.localFile);
      if (!id || !pdfPath) return null;
      const problemMix = Array.isArray(row.problemMix) ? row.problemMix.filter((item): item is string => typeof item === 'string') : [];
      const intent = stringValue(row.intent) ?? problemMix.join(',');
      const role = intent.includes('control') ? 'control' : 'focus';
      return { id, pdfPath, role, intent };
    })
    .filter((row): row is TableTargetResolutionInputRow => row !== null);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseDetails(details: unknown): Record<string, unknown> {
  if (typeof details === 'string') {
    try {
      return asRecord(JSON.parse(details));
    } catch {
      return {};
    }
  }
  return asRecord(details);
}

function priorAttemptsFromTools(tools: unknown): PriorTableAttempt[] {
  if (!Array.isArray(tools)) return [];
  return tools
    .filter(tool => TABLE_TOOL_NAMES.has(stringValue(asRecord(tool).toolName) ?? ''))
    .map(tool => {
      const record = asRecord(tool);
      const parsed = parseDetails(record.details);
      const invariants = asRecord(parsed.invariants);
      return {
        toolName: stringValue(record.toolName) ?? 'unknown',
        outcome: stringValue(record.outcome) ?? 'unknown',
        targetRef: stringValue(invariants.targetRef),
        targetResolved: typeof invariants.targetResolved === 'boolean' ? invariants.targetResolved : null,
        resolvedRole: stringValue(invariants.resolvedRole),
        note: stringValue(parsed.note),
      };
    });
}

export async function loadPriorTableAttempts(path: string | null): Promise<Map<string, PriorTableAttempt[]>> {
  const out = new Map<string, PriorTableAttempt[]>();
  if (!path || !await pathExists(path)) return out;
  const json = JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  const rows = Array.isArray(json) ? json : Array.isArray((json as { rows?: unknown }).rows) ? (json as { rows: unknown[] }).rows : [];
  for (const row of rows) {
    const record = asRecord(row);
    const ids = [
      stringValue(record.id),
      stringValue(record.publicationId),
      stringValue(record.file),
      stringValue(record.localFile),
    ].filter((value): value is string => value !== null);
    const attempts = priorAttemptsFromTools(record.appliedTools);
    if (attempts.length === 0) continue;
    for (const id of ids) {
      out.set(normalizeId(id), attempts);
    }
  }
  return out;
}

function categoryScore(result: AnalysisResult, key: string): number | null {
  return result.categories.find(category => category.key === key)?.score ?? null;
}

function tableEvidence(snapshot: DocumentSnapshot): TableEvidenceRow[] {
  return snapshot.tables
    .map(table => ({
      structRef: table.structRef ?? null,
      page: typeof table.page === 'number' ? table.page : null,
      rowCount: typeof table.rowCount === 'number' ? table.rowCount : null,
      totalCells: typeof table.totalCells === 'number' ? table.totalCells : null,
      headerCount: typeof table.headerCount === 'number' ? table.headerCount : null,
      hasHeaders: typeof table.hasHeaders === 'boolean' ? table.hasHeaders : null,
      cellsMisplacedCount: typeof table.cellsMisplacedCount === 'number' ? table.cellsMisplacedCount : null,
      irregularRows: typeof table.irregularRows === 'number' ? table.irregularRows : null,
    }))
    .sort((a, b) =>
      (a.page ?? 0) - (b.page ?? 0) ||
      String(a.structRef ?? '').localeCompare(String(b.structRef ?? '')),
    );
}

function strictTableCapRules(result: AnalysisResult): string[] {
  const caps: ScoreCapApplied[] = [
    ...(result.scoreCapsApplied ?? []),
    ...result.categories.flatMap(category => category.scoreCapsApplied ?? []),
  ];
  const rules = new Set<string>();
  for (const cap of caps) {
    const match = /^PAC rule failure: (.+)$/.exec(cap.reason);
    const ruleId = match?.[1]?.trim();
    if (ruleId && TABLE_RULE_IDS.has(ruleId)) rules.add(ruleId);
  }
  return [...rules].sort((a, b) => a.localeCompare(b));
}

function pacTableFailures(snapshot: DocumentSnapshot): string[] {
  return [...new Set(
    buildPacRuleEvidence(snapshot)
      .filter(row => row.status === 'fail' && TABLE_RULE_IDS.has(row.ruleId))
      .map(row => row.ruleId),
  )].sort((a, b) => a.localeCompare(b));
}

function tableHeaderDebt(snapshot: DocumentSnapshot): boolean {
  const audit = snapshot.tableHeaderAudit;
  return Boolean(audit && audit.tablesChecked > 0 && (
    audit.headerAssociationMissingCount > 0 ||
    audit.orphanHeaderCellCount > 0 ||
    audit.dataCellsWithoutHeaderCount > 0
  ));
}

function tableShapeDebt(snapshot: DocumentSnapshot, tables: TableEvidenceRow[]): boolean {
  const signals = snapshot.detectionProfile?.tableSignals;
  return Boolean(
    (signals?.directCellUnderTableCount ?? 0) > 0 ||
    (signals?.misplacedCellCount ?? 0) > 0 ||
    (signals?.irregularTableCount ?? 0) > 0 ||
    (signals?.stronglyIrregularTableCount ?? 0) > 0 ||
    tables.some(table =>
      (table.cellsMisplacedCount ?? 0) > 0 ||
      (table.irregularRows ?? 0) > 0 ||
      ((table.rowCount ?? 0) <= 1 && (table.totalCells ?? 0) >= 4) ||
      (table.hasHeaders === false && (table.totalCells ?? 0) >= 4),
    ),
  );
}

function normalizeTargets(tables: TableEvidenceRow[]): TableEvidenceRow[] {
  return tables
    .filter((table): table is TableEvidenceRow & { structRef: string } =>
      Boolean(table.structRef) &&
      (
        (table.cellsMisplacedCount ?? 0) > 0 ||
        (table.irregularRows ?? 0) >= 2 ||
        ((table.rowCount ?? 0) <= 1 && (table.totalCells ?? 0) >= 4) ||
        (table.hasHeaders === false && (table.totalCells ?? 0) >= 4)
      ),
    )
    .sort((a, b) =>
      (b.cellsMisplacedCount ?? 0) - (a.cellsMisplacedCount ?? 0) ||
      (b.irregularRows ?? 0) - (a.irregularRows ?? 0) ||
      (b.totalCells ?? 0) - (a.totalCells ?? 0) ||
      (a.page ?? 0) - (b.page ?? 0) ||
      a.structRef.localeCompare(b.structRef),
    );
}

function layoutEvidence(snapshot: DocumentSnapshot): {
  layoutTableCandidateCount: number;
  denseRowBandTableCandidateCount: number;
  undersegmentedTableCandidateCount: number;
} {
  const audit = snapshot.layoutAudit;
  const signals = snapshot.detectionProfile?.tableSignals;
  return {
    layoutTableCandidateCount: audit?.layoutTableCandidateCount ?? signals?.layoutTableCandidateCount ?? 0,
    denseRowBandTableCandidateCount: audit?.denseRowBandTableCandidateCount ?? signals?.denseRowBandTableCandidateCount ?? 0,
    undersegmentedTableCandidateCount: audit?.undersegmentedTableCandidateCount ?? 0,
  };
}

function nonTableAttempt(attempt: PriorTableAttempt): boolean {
  return attempt.targetResolved === true &&
    attempt.resolvedRole !== null &&
    attempt.resolvedRole.toUpperCase() !== 'TABLE';
}

export function classifyTableTargetResolution(input: {
  row: TableTargetResolutionInputRow;
  features: TableTargetResolutionFeatures;
  normalizeTargets: TableEvidenceRow[];
  associationTargets: RankedTableHeaderBatchTarget[];
  priorAttempts: PriorTableAttempt[];
  error?: string;
}): Pick<TableTargetResolutionDiagnosticRow, 'classification' | 'promotionSupported' | 'reasons'> {
  const { row, features, normalizeTargets: shapeTargets, associationTargets, priorAttempts, error } = input;
  const reasons: string[] = [];
  if (error) {
    return {
      classification: 'analysis_error',
      promotionSupported: false,
      reasons: [`analysis_error:${error}`],
    };
  }

  const hasLayoutOnlyEvidence = (
    features.layoutTableCandidateCount > 0 ||
    features.denseRowBandTableCandidateCount > 0 ||
    features.undersegmentedTableCandidateCount > 0
  ) && features.stableTableCount === 0;
  const hasAnyTableDebt = features.tableHeaderDebt ||
    features.tableShapeDebt ||
    features.tableScoreDebt ||
    features.strictTablePacRules.length > 0 ||
    features.pacTableFailures.length > 0;
  const nonTableAttempts = priorAttempts.filter(nonTableAttempt);

  if (row.role === 'control' && ((features.score ?? 0) >= 90 || !hasAnyTableDebt)) {
    reasons.push('control_row_high_grade_or_no_table_debt');
    return { classification: 'control_or_high_grade_noise', promotionSupported: false, reasons };
  }
  if (nonTableAttempts.length > 0) {
    reasons.push('prior_table_tool_target_resolved_as_non_table');
    reasons.push(...nonTableAttempts.map(attempt => `${attempt.toolName}:${attempt.targetRef ?? 'no-ref'}:${attempt.resolvedRole ?? 'unknown'}`));
    return { classification: 'non_table_target_attempt', promotionSupported: false, reasons };
  }
  if (hasLayoutOnlyEvidence) {
    reasons.push('native_layout_table_evidence_without_stable_table_struct_ref');
    return { classification: 'layout_only_no_table_target', promotionSupported: false, reasons };
  }
  if (features.tableHeaderDebt && associationTargets.length > 0 && !features.tableShapeDebt) {
    reasons.push('stable_table_header_association_target');
    if (features.strictTablePacRules.length > 0 || features.pacTableFailures.length > 0) reasons.push('pac_table_header_debt_present');
    return { classification: 'stable_header_assoc_target', promotionSupported: row.role === 'focus', reasons };
  }
  if (features.tableShapeDebt && shapeTargets.length > 0) {
    reasons.push('stable_table_shape_target');
    return { classification: 'stable_normalize_target', promotionSupported: row.role === 'focus', reasons };
  }
  if (!hasAnyTableDebt) reasons.push('no_table_debt');
  else if (features.stableTableCount === 0) reasons.push('no_stable_table_struct_ref');
  else reasons.push('table_debt_without_safe_target_resolution');
  return { classification: 'no_table_target_resolution_support', promotionSupported: false, reasons };
}

async function analyzeRow(row: TableTargetResolutionInputRow, priorAttempts: PriorTableAttempt[]): Promise<TableTargetResolutionDiagnosticRow> {
  try {
    const { result, snapshot } = await analyzePdf(row.pdfPath, basename(row.pdfPath), {
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
      bypassCache: true,
    });
    const tables = tableEvidence(snapshot);
    const stableTables = tables.filter(table => Boolean(table.structRef));
    const topNormalizeTargets = normalizeTargets(tables).slice(0, 12);
    const associationTargets = rankAssociationTables(tables);
    const selectedAssociation = selectBatchStructRefs(associationTargets);
    const layout = layoutEvidence(snapshot);
    const features: TableTargetResolutionFeatures = {
      score: result.score,
      grade: result.grade,
      pageCount: snapshot.pageCount,
      tableMarkup: categoryScore(result, 'table_markup'),
      pdfUaCompliance: categoryScore(result, 'pdf_ua_compliance'),
      tableCount: tables.length,
      stableTableCount: stableTables.length,
      stableNormalizeTargetCount: topNormalizeTargets.length,
      stableHeaderAssociationTargetCount: associationTargets.length,
      selectedAssociationRefs: selectedAssociation.refs,
      estimatedAssociationTdDebt: selectedAssociation.estimatedTdDebt,
      tableHeaderDebt: tableHeaderDebt(snapshot),
      tableShapeDebt: tableShapeDebt(snapshot, tables),
      tableScoreDebt: (categoryScore(result, 'table_markup') ?? 100) < 80,
      strictTablePacRules: strictTableCapRules(result),
      pacTableFailures: pacTableFailures(snapshot),
      ...layout,
      priorTableAttemptCount: priorAttempts.length,
      priorNonTableAttemptCount: priorAttempts.filter(nonTableAttempt).length,
      priorAppliedTableCount: priorAttempts.filter(attempt => attempt.outcome === 'applied').length,
      priorResolvedTableAttemptCount: priorAttempts.filter(attempt => attempt.targetResolved === true && (attempt.resolvedRole ?? '').toUpperCase() === 'TABLE').length,
    };
    const classification = classifyTableTargetResolution({
      row,
      features,
      normalizeTargets: topNormalizeTargets,
      associationTargets,
      priorAttempts,
    });
    return {
      id: row.id,
      pdfPath: row.pdfPath,
      role: row.role,
      ...classification,
      features,
      topNormalizeTargets,
      topAssociationTargets: associationTargets.slice(0, 12),
      priorAttempts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const features: TableTargetResolutionFeatures = {
      score: null,
      grade: null,
      pageCount: null,
      tableMarkup: null,
      pdfUaCompliance: null,
      tableCount: 0,
      stableTableCount: 0,
      stableNormalizeTargetCount: 0,
      stableHeaderAssociationTargetCount: 0,
      selectedAssociationRefs: [],
      estimatedAssociationTdDebt: 0,
      tableHeaderDebt: false,
      tableShapeDebt: false,
      tableScoreDebt: false,
      strictTablePacRules: [],
      pacTableFailures: [],
      layoutTableCandidateCount: 0,
      denseRowBandTableCandidateCount: 0,
      undersegmentedTableCandidateCount: 0,
      priorTableAttemptCount: priorAttempts.length,
      priorNonTableAttemptCount: priorAttempts.filter(nonTableAttempt).length,
      priorAppliedTableCount: priorAttempts.filter(attempt => attempt.outcome === 'applied').length,
      priorResolvedTableAttemptCount: priorAttempts.filter(attempt => attempt.targetResolved === true && (attempt.resolvedRole ?? '').toUpperCase() === 'TABLE').length,
    };
    return {
      id: row.id,
      pdfPath: row.pdfPath,
      role: row.role,
      ...classifyTableTargetResolution({
        row,
        features,
        normalizeTargets: [],
        associationTargets: [],
        priorAttempts,
        error: message,
      }),
      features,
      topNormalizeTargets: [],
      topAssociationTargets: [],
      priorAttempts,
      error: message,
    };
  }
}

function countByClassification(rows: TableTargetResolutionDiagnosticRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}

export function buildTableTargetResolutionReport(input: {
  manifest: string;
  run: string | null;
  outDir: string;
  rows: TableTargetResolutionDiagnosticRow[];
  generatedAt?: string;
}): TableTargetResolutionDiagnosticReport {
  const rows = [...input.rows].sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
  const stableFocusCandidates = rows
    .filter(row => row.role === 'focus' && row.promotionSupported)
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));
  const unsafeControlCandidates = rows
    .filter(row => row.role === 'control' && (
      row.classification === 'stable_header_assoc_target' ||
      row.classification === 'stable_normalize_target'
    ))
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));
  const nonTableAttemptRows = rows
    .filter(row => row.classification === 'non_table_target_attempt')
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));
  const decision = stableFocusCandidates.length >= 2 && unsafeControlCandidates.length === 0
    ? {
        status: 'plan_table_target_behavior_proof' as const,
        reason: 'At least two focus rows have stable object-backed table targets and no controls match the target predicate.',
      }
    : {
        status: 'keep_table_target_resolution_diagnostic_only' as const,
        reason: 'Stable object-backed table targets are insufficient, controls trigger, or prior non-table target attempts explain the old behavior proof failure.',
      };

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifest: input.manifest,
    run: input.run,
    outDir: input.outDir,
    summary: {
      rowCount: rows.length,
      focusCount: rows.filter(row => row.role === 'focus').length,
      controlCount: rows.filter(row => row.role === 'control').length,
      byClassification: countByClassification(rows),
      stableFocusCandidates,
      unsafeControlCandidates,
      nonTableAttemptRows,
    },
    decision,
    rows,
  };
}

function mdRow(values: Array<string | number | boolean | null | undefined>): string {
  return `| ${values.map(value => String(value ?? '')).join(' | ')} |`;
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

export function renderTableTargetResolutionMarkdown(report: TableTargetResolutionDiagnosticReport): string {
  const lines: string[] = [];
  lines.push('# Table Target Resolution Diagnostic');
  lines.push('');
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Manifest: \`${report.manifest}\``);
  lines.push(`Prior run: \`${report.run ?? 'none'}\``);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(`- Status: \`${report.decision.status}\``);
  lines.push(`- Reason: ${report.decision.reason}`);
  lines.push(`- Stable focus candidates: ${list(report.summary.stableFocusCandidates)}`);
  lines.push(`- Unsafe control candidates: ${list(report.summary.unsafeControlCandidates)}`);
  lines.push(`- Prior non-table target rows: ${list(report.summary.nonTableAttemptRows)}`);
  lines.push('');
  lines.push('## Classification Counts');
  lines.push('');
  lines.push(mdRow(['classification', 'count']));
  lines.push(mdRow(['---', '---:']));
  for (const [classification, count] of Object.entries(report.summary.byClassification)) {
    lines.push(mdRow([classification, count]));
  }
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push(mdRow(['id', 'role', 'score', 'grade', 'table', 'stable tables', 'normalize targets', 'assoc targets', 'prior non-table', 'classification']));
  lines.push(mdRow(['---', '---', '---:', '---', '---:', '---:', '---:', '---:', '---:', '---']));
  for (const row of report.rows) {
    lines.push(mdRow([
      row.id,
      row.role,
      row.features.score,
      row.features.grade,
      row.features.tableMarkup,
      row.features.stableTableCount,
      row.features.stableNormalizeTargetCount,
      row.features.stableHeaderAssociationTargetCount,
      row.features.priorNonTableAttemptCount,
      row.classification,
    ]));
  }
  lines.push('');
  lines.push('## Row Details');
  for (const row of report.rows) {
    lines.push('');
    lines.push(`### ${row.id}`);
    lines.push('');
    lines.push(`- File: \`${row.pdfPath}\``);
    lines.push(`- Reasons: ${row.reasons.join('; ') || 'none'}`);
    if (row.error) lines.push(`- Error: \`${row.error}\``);
    lines.push(`- Table/PAC debt: header=${row.features.tableHeaderDebt}, shape=${row.features.tableShapeDebt}, score=${row.features.tableScoreDebt}, caps=${list(row.features.strictTablePacRules)}, failures=${list(row.features.pacTableFailures)}`);
    lines.push(`- Layout table evidence: layout=${row.features.layoutTableCandidateCount}, dense=${row.features.denseRowBandTableCandidateCount}, undersegmented=${row.features.undersegmentedTableCandidateCount}`);
    lines.push(`- Selected association refs: ${list(row.features.selectedAssociationRefs)} (estimated TD debt ${row.features.estimatedAssociationTdDebt})`);
    lines.push('');
    lines.push(mdRow(['normalize ref', 'page', 'rows', 'cells', 'headers', 'misplaced', 'irregular']));
    lines.push(mdRow(['---', '---:', '---:', '---:', '---:', '---:', '---:']));
    for (const target of row.topNormalizeTargets.slice(0, 8)) {
      lines.push(mdRow([target.structRef, target.page, target.rowCount, target.totalCells, target.headerCount, target.cellsMisplacedCount, target.irregularRows]));
    }
    if (row.topNormalizeTargets.length === 0) lines.push(mdRow(['none', '', '', '', '', '', '']));
    lines.push('');
    lines.push(mdRow(['assoc ref', 'page', 'rows', 'cells', 'headers', 'estimated TD debt']));
    lines.push(mdRow(['---', '---:', '---:', '---:', '---:', '---:']));
    for (const target of row.topAssociationTargets.slice(0, 8)) {
      lines.push(mdRow([target.structRef, target.page, target.rowCount, target.totalCells, target.headerCount, target.estimatedTdDebt]));
    }
    if (row.topAssociationTargets.length === 0) lines.push(mdRow(['none', '', '', '', '', '']));
    lines.push('');
    lines.push(mdRow(['prior tool', 'outcome', 'target', 'resolved', 'role', 'note']));
    lines.push(mdRow(['---', '---', '---', '---', '---', '---']));
    for (const attempt of row.priorAttempts) {
      lines.push(mdRow([attempt.toolName, attempt.outcome, attempt.targetRef, attempt.targetResolved, attempt.resolvedRole, attempt.note]));
    }
    if (row.priorAttempts.length === 0) lines.push(mdRow(['none', '', '', '', '', '']));
  }
  lines.push('');
  return lines.join('\n');
}

export async function runTableTargetResolutionDiagnostic(args: ParsedArgs): Promise<TableTargetResolutionDiagnosticReport> {
  const manifestRowsFromFile = args.rows.length > 0 ? [] : await loadManifestRows(args.manifest);
  const rows = (args.rows.length > 0 ? args.rows : manifestRowsFromFile).slice(0, args.limit ?? undefined);
  const prior = await loadPriorTableAttempts(args.run);
  const analyzed: TableTargetResolutionDiagnosticRow[] = [];
  for (const row of rows) {
    const attempts = [
      ...(prior.get(normalizeId(row.id)) ?? []),
      ...(prior.get(normalizeId(row.pdfPath)) ?? []),
    ];
    const uniqueAttempts = attempts.filter((attempt, index, array) =>
      index === array.findIndex(other =>
        other.toolName === attempt.toolName &&
        other.outcome === attempt.outcome &&
        other.targetRef === attempt.targetRef &&
        other.resolvedRole === attempt.resolvedRole &&
        other.note === attempt.note,
      ),
    );
    analyzed.push(await analyzeRow(row, uniqueAttempts));
  }
  return buildTableTargetResolutionReport({
    manifest: args.manifest,
    run: args.run,
    outDir: args.outDir,
    rows: analyzed,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runTableTargetResolutionDiagnostic(args);
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'table-target-resolution-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'table-target-resolution-diagnostic.md'), renderTableTargetResolutionMarkdown(report), 'utf8');
  console.log(`Wrote table target-resolution diagnostic to ${outDir}`);
  console.log(`Decision: ${report.decision.status}`);
  console.log(`Stable focus candidates: ${list(report.summary.stableFocusCandidates)}`);
  console.log(`Prior non-table target rows: ${list(report.summary.nonTableAttemptRows)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

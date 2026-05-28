#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS, REMEDIATION_TARGET_SCORE } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  buildDefaultParams,
  classifyStage43TableFailure,
  type Stage43TableFailureClass,
} from '../src/services/remediation/planner.js';
import {
  isRealRootReachableTableTarget,
  tableTargetRefsFromParams,
} from '../src/services/remediation/tableTargetGuards.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';

type ParamShape = 'none' | 'strict_ref' | 'broad_selector';

export type TargetSelectionClassification =
  | 'strict_ref_transaction_candidate'
  | 'missing_header_creation_candidate'
  | 'normalize_ref_final_header_gap'
  | 'broad_selector_final_cleanup_gap'
  | 'header_only_candidate'
  | 'control_target_risk'
  | 'layout_or_no_object_target'
  | 'target_selection_gap'
  | 'pac_cap_not_table_header'
  | 'non_table_primary_debt'
  | 'no_material_table_debt'
  | 'no_safe_table_lane';

interface Args {
  pdfs: string[];
  outDir: string;
  controls: Set<string>;
}

interface CandidateTable {
  structRef: string | null;
  page: number;
  rawRole: string | null;
  resolvedRole: string | null;
  reachable: boolean | null;
  totalCells: number;
  rowCount: number;
  hasHeaders: boolean;
  headerCount: number;
  cellsMisplacedCount: number;
  irregularRows: number;
  dominantColumnCount: number;
  removableEmptyRowCount: number;
  realRootReachable: boolean;
  normalizeEligible: boolean;
  headerAssociationEligible: boolean;
  rejectionReasons: string[];
}

interface DiagnosticRow {
  id: string;
  file: string;
  role: 'focus' | 'control';
  score: number;
  grade: string;
  categories: {
    table_markup: number | null;
    pdf_ua_compliance: number | null;
    heading_structure: number | null;
    reading_order: number | null;
    alt_text: number | null;
    link_quality: number | null;
  };
  tableFailureClass: Stage43TableFailureClass;
  normalizeParamShape: ParamShape;
  headerParamShape: ParamShape;
  normalizeParams: Record<string, unknown>;
  headerParams: Record<string, unknown>;
  normalizeRefs: string[];
  headerRefs: string[];
  tableHeaderDebt: number;
  hasStrictTablePacCap: boolean;
  hasUnsafeTableShape: boolean;
  tableSignalSummary: Record<string, number>;
  auditSummary: Record<string, number>;
  realTableCount: number;
  normalizeCandidateCount: number;
  headerAssociationCandidateCount: number;
  candidates: CandidateTable[];
  classification: TargetSelectionClassification;
  reasons: string[];
  error: string | null;
}

interface Report {
  generatedAt: string;
  outDir: string;
  rows: DiagnosticRow[];
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    classificationCounts: Record<string, number>;
    transactionCandidates: string[];
    broadSelectorFinalCleanupGaps: string[];
    targetSelectionGaps: string[];
    controlTargetRisks: string[];
  };
  decision: {
    status: 'plan_target_selection_or_cleanup_lane' | 'diagnostic_only';
    reasons: string[];
  };
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-target-selection-final-cleanup-diagnostic.ts --pdf <path> [options]

Options:
  --pdf <path>      PDF to analyze; repeatable
  --out <dir>       Output directory (default: ${DEFAULT_OUT_ROOT}/table-target-selection-final-cleanup-<timestamp>)
  --control <id>    Mark row id as a control; repeatable
  --help            Show this help.`;
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const pdfs: string[] = [];
  const controls = new Set<string>();
  let outDir = join(DEFAULT_OUT_ROOT, `table-target-selection-final-cleanup-${timestampSlug(now)}`);
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
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  if (pdfs.length === 0) throw new Error(`Missing --pdf\n${usage()}`);
  return { pdfs, outDir, controls };
}

function rowId(file: string): string {
  return basename(file).replace(/\.pdf$/i, '');
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function paramShape(params: Record<string, unknown>): ParamShape {
  if (Object.keys(params).length === 0) return 'none';
  return tableTargetRefsFromParams(params).length > 0 ? 'strict_ref' : 'broad_selector';
}

function tableHeaderDebt(snapshot: DocumentSnapshot): number {
  const audit = snapshot.tableHeaderAudit;
  if (!audit || (audit.tablesChecked ?? 0) <= 0) return 0;
  return Math.max(0, audit.headerAssociationMissingCount ?? 0) +
    Math.max(0, audit.dataCellsWithoutHeaderCount ?? 0) +
    Math.max(0, audit.orphanHeaderCellCount ?? 0);
}

function hasStrictTablePacCap(analysis: AnalysisResult): boolean {
  return analysis.categories.some(category =>
    category.key === 'table_markup' &&
    category.score < 90 &&
    (category.scoreCapsApplied ?? []).some(cap =>
      cap.cap <= 79 &&
      (
        cap.reason === 'PAC rule failure: pdfua.table.header_association_present' ||
        cap.reason === 'PAC rule failure: pdfua.table.header_cells_associated'
      ),
    ),
  );
}

function hasUnsafeTableShape(snapshot: DocumentSnapshot): boolean {
  const signals = snapshot.detectionProfile?.tableSignals;
  return Boolean(signals && (
    (signals.directCellUnderTableCount ?? 0) > 0 ||
    (signals.misplacedCellCount ?? 0) > 0 ||
    (signals.irregularTableCount ?? 0) > 0 ||
    (signals.stronglyIrregularTableCount ?? 0) > 0
  ));
}

function normalizeRole(role: unknown): string | null {
  return typeof role === 'string' && role.trim() ? role.trim().replace(/^\//, '') : null;
}

function normalizeEligibleForClass(table: DocumentSnapshot['tables'][number], tableFailureClass: Stage43TableFailureClass): boolean {
  if (!isRealRootReachableTableTarget(table)) return false;
  if (tableFailureClass === 'direct_cells_under_table') {
    return (table.cellsMisplacedCount ?? 0) > 0 || table.hasHeaders || table.totalCells >= 4;
  }
  if (tableFailureClass === 'rowless_dense_table') return (table.rowCount ?? 0) <= 1 && table.totalCells >= 4;
  if (tableFailureClass === 'strongly_irregular_rows') {
    return table.hasHeaders &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1 &&
      (table.irregularRows ?? 0) >= 2 &&
      (table.dominantColumnCount ?? 0) >= 2;
  }
  if (tableFailureClass === 'missing_headers_only') return !table.hasHeaders && table.totalCells >= 4;
  if (tableFailureClass === 'layout_table_candidate') return table.totalCells <= 2 && !table.hasHeaders;
  return false;
}

function headerAssociationEligible(table: DocumentSnapshot['tables'][number]): boolean {
  return Boolean(
    isRealRootReachableTableTarget(table) &&
    table.structRef &&
    table.hasHeaders &&
    (table.headerCount ?? 0) > 0 &&
    (table.cellsMisplacedCount ?? 0) === 0 &&
    (table.irregularRows ?? 0) === 0 &&
    (table.rowCount ?? 0) > 1 &&
    (table.totalCells ?? 0) > (table.headerCount ?? 0),
  );
}

function candidateRejectionReasons(
  table: DocumentSnapshot['tables'][number],
  tableFailureClass: Stage43TableFailureClass,
  normalizeEligible: boolean,
  headerEligible: boolean,
): string[] {
  const reasons: string[] = [];
  if (!table.structRef) reasons.push('missing_struct_ref');
  if (table.reachable === false) reasons.push('unreachable');
  if (Object.prototype.hasOwnProperty.call(table, 'rawRole') && normalizeRole(table.rawRole)?.toUpperCase() !== 'TABLE') {
    reasons.push(`raw_role:${normalizeRole(table.rawRole) ?? 'null'}`);
  }
  if (Object.prototype.hasOwnProperty.call(table, 'resolvedRole') && normalizeRole(table.resolvedRole)?.toUpperCase() !== 'TABLE') {
    reasons.push(`resolved_role:${normalizeRole(table.resolvedRole) ?? 'null'}`);
  }
  if (!normalizeEligible) reasons.push(`not_normalize_eligible_for:${tableFailureClass}`);
  if (!headerEligible) {
    if (!table.hasHeaders) reasons.push('header_assoc:no_headers');
    if ((table.cellsMisplacedCount ?? 0) > 0) reasons.push('header_assoc:misplaced_cells');
    if ((table.irregularRows ?? 0) > 0) reasons.push('header_assoc:irregular_rows');
    if ((table.rowCount ?? 0) <= 1) reasons.push('header_assoc:not_enough_rows');
    if ((table.totalCells ?? 0) <= (table.headerCount ?? 0)) reasons.push('header_assoc:no_data_cells');
  }
  return reasons;
}

function candidateTables(snapshot: DocumentSnapshot, tableFailureClass: Stage43TableFailureClass): CandidateTable[] {
  return snapshot.tables.map(table => {
    const normalizeEligible = normalizeEligibleForClass(table, tableFailureClass);
    const headerEligible = headerAssociationEligible(table);
    return {
      structRef: table.structRef ?? null,
      page: table.page,
      rawRole: normalizeRole(table.rawRole),
      resolvedRole: normalizeRole(table.resolvedRole),
      reachable: typeof table.reachable === 'boolean' ? table.reachable : null,
      totalCells: table.totalCells ?? 0,
      rowCount: table.rowCount ?? 0,
      hasHeaders: Boolean(table.hasHeaders),
      headerCount: table.headerCount ?? 0,
      cellsMisplacedCount: table.cellsMisplacedCount ?? 0,
      irregularRows: table.irregularRows ?? 0,
      dominantColumnCount: table.dominantColumnCount ?? 0,
      removableEmptyRowCount: table.removableEmptyRowCount ?? 0,
      realRootReachable: isRealRootReachableTableTarget(table),
      normalizeEligible,
      headerAssociationEligible: headerEligible,
      rejectionReasons: candidateRejectionReasons(table, tableFailureClass, normalizeEligible, headerEligible),
    };
  }).sort((a, b) =>
    Number(b.normalizeEligible) - Number(a.normalizeEligible) ||
    Number(b.headerAssociationEligible) - Number(a.headerAssociationEligible) ||
    b.totalCells - a.totalCells ||
    a.page - b.page ||
    (a.structRef ?? '').localeCompare(b.structRef ?? ''),
  ).slice(0, 24);
}

export function classifyTargetSelectionRow(input: {
  role: 'focus' | 'control';
  score: number;
  tableMarkup: number | null;
  tableFailureClass: Stage43TableFailureClass;
  normalizeParamShape: ParamShape;
  headerParamShape: ParamShape;
  tableHeaderDebt: number;
  hasStrictTablePacCap: boolean;
  hasUnsafeTableShape: boolean;
  realTableCount: number;
  normalizeCandidateCount: number;
  headerAssociationCandidateCount: number;
}): { classification: TargetSelectionClassification; reasons: string[] } {
  const reasons: string[] = [];
  const hasNormalize = input.normalizeParamShape !== 'none';
  const hasHeader = input.headerParamShape !== 'none';
  const tableLow = (input.tableMarkup ?? 100) < 80;
  if (input.role === 'control' && (hasNormalize || hasHeader)) {
    reasons.push(`normalize_params:${input.normalizeParamShape}`);
    reasons.push(`header_params:${input.headerParamShape}`);
    return { classification: 'control_target_risk', reasons };
  }
  if (!tableLow && input.tableHeaderDebt === 0) {
    reasons.push('table_score_and_header_debt_stable');
    return { classification: 'no_material_table_debt', reasons };
  }
  if (input.normalizeParamShape === 'strict_ref' && input.headerParamShape === 'strict_ref') {
    if (input.headerAssociationCandidateCount > 0) {
      reasons.push('strict_normalize_and_header_association_refs_available');
      return { classification: 'strict_ref_transaction_candidate', reasons };
    }
    reasons.push('strict_normalize_and_missing_header_refs_available');
    reasons.push('no_header_association_candidates_before_normalize');
    return { classification: 'missing_header_creation_candidate', reasons };
  }
  if (input.normalizeParamShape === 'strict_ref') {
    reasons.push(`header_params:${input.headerParamShape}`);
    if (input.hasUnsafeTableShape) reasons.push('header_blocked_by_unsafe_shape');
    return { classification: 'normalize_ref_final_header_gap', reasons };
  }
  if (input.normalizeParamShape === 'broad_selector') {
    reasons.push(`header_params:${input.headerParamShape}`);
    reasons.push('normalize_uses_broad_selector_without_explicit_refs');
    return { classification: 'broad_selector_final_cleanup_gap', reasons };
  }
  if (input.headerParamShape === 'strict_ref') {
    reasons.push('header_ref_available_without_normalize_ref');
    return { classification: 'header_only_candidate', reasons };
  }
  if (input.realTableCount === 0) {
    reasons.push('no_real_root_reachable_table_targets');
    return { classification: 'layout_or_no_object_target', reasons };
  }
  if (input.tableHeaderDebt > 0 && !input.hasStrictTablePacCap) {
    reasons.push('header_debt_without_strict_table_pac_cap');
    return { classification: 'pac_cap_not_table_header', reasons };
  }
  if (!tableLow && input.score < REMEDIATION_TARGET_SCORE) {
    reasons.push('overall_low_but_table_not_primary');
    return { classification: 'non_table_primary_debt', reasons };
  }
  if (input.normalizeCandidateCount === 0 && input.headerAssociationCandidateCount === 0) {
    reasons.push(`table_failure_class:${input.tableFailureClass}`);
    return { classification: 'target_selection_gap', reasons };
  }
  reasons.push('table_debt_present_without_safe_planner_params');
  return { classification: 'no_safe_table_lane', reasons };
}

async function analyzeRow(pdfPath: string, role: 'focus' | 'control'): Promise<DiagnosticRow> {
  const file = basename(pdfPath);
  const id = rowId(file);
  try {
    const { result: analysis, snapshot } = await analyzePdf(pdfPath, file, {
      bypassCache: true,
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
    });
    const tableFailureClass = classifyStage43TableFailure(snapshot, analysis);
    const normalizeParams = buildDefaultParams('normalize_table_structure', analysis, snapshot);
    const headerParams = buildDefaultParams('set_table_header_cells', analysis, snapshot);
    const candidates = candidateTables(snapshot, tableFailureClass);
    const tableDebt = tableHeaderDebt(snapshot);
    const tableMarkup = categoryScore(analysis, 'table_markup');
    const normalized = paramShape(normalizeParams);
    const header = paramShape(headerParams);
    const realTableCount = snapshot.tables.filter(isRealRootReachableTableTarget).length;
    const normalizeCandidateCount = candidates.filter(row => row.normalizeEligible).length;
    const headerAssociationCandidateCount = candidates.filter(row => row.headerAssociationEligible).length;
    const classified = classifyTargetSelectionRow({
      role,
      score: analysis.score,
      tableMarkup,
      tableFailureClass,
      normalizeParamShape: normalized,
      headerParamShape: header,
      tableHeaderDebt: tableDebt,
      hasStrictTablePacCap: hasStrictTablePacCap(analysis),
      hasUnsafeTableShape: hasUnsafeTableShape(snapshot),
      realTableCount,
      normalizeCandidateCount,
      headerAssociationCandidateCount,
    });
    const signals = snapshot.detectionProfile?.tableSignals;
    const audit = snapshot.tableHeaderAudit;
    return {
      id,
      file,
      role,
      score: analysis.score,
      grade: analysis.grade,
      categories: {
        table_markup: tableMarkup,
        pdf_ua_compliance: categoryScore(analysis, 'pdf_ua_compliance'),
        heading_structure: categoryScore(analysis, 'heading_structure'),
        reading_order: categoryScore(analysis, 'reading_order'),
        alt_text: categoryScore(analysis, 'alt_text'),
        link_quality: categoryScore(analysis, 'link_quality'),
      },
      tableFailureClass,
      normalizeParamShape: normalized,
      headerParamShape: header,
      normalizeParams,
      headerParams,
      normalizeRefs: tableTargetRefsFromParams(normalizeParams),
      headerRefs: tableTargetRefsFromParams(headerParams),
      tableHeaderDebt: tableDebt,
      hasStrictTablePacCap: hasStrictTablePacCap(analysis),
      hasUnsafeTableShape: hasUnsafeTableShape(snapshot),
      tableSignalSummary: {
        directCellUnderTableCount: signals?.directCellUnderTableCount ?? 0,
        misplacedCellCount: signals?.misplacedCellCount ?? 0,
        irregularTableCount: signals?.irregularTableCount ?? 0,
        stronglyIrregularTableCount: signals?.stronglyIrregularTableCount ?? 0,
        layoutTableCandidateCount: signals?.layoutTableCandidateCount ?? 0,
        denseRowBandTableCandidateCount: signals?.denseRowBandTableCandidateCount ?? 0,
      },
      auditSummary: {
        tablesChecked: audit?.tablesChecked ?? 0,
        headerAssociationMissingCount: audit?.headerAssociationMissingCount ?? 0,
        orphanHeaderCellCount: audit?.orphanHeaderCellCount ?? 0,
        dataCellsWithoutHeaderCount: audit?.dataCellsWithoutHeaderCount ?? 0,
        headerCellsWithScopeCount: audit?.headerCellsWithScopeCount ?? 0,
        headerCellsWithIdCount: audit?.headerCellsWithIdCount ?? 0,
        dataCellsWithHeadersCount: audit?.dataCellsWithHeadersCount ?? 0,
      },
      realTableCount,
      normalizeCandidateCount,
      headerAssociationCandidateCount,
      candidates,
      ...classified,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      file,
      role,
      score: 0,
      grade: '?',
      categories: {
        table_markup: null,
        pdf_ua_compliance: null,
        heading_structure: null,
        reading_order: null,
        alt_text: null,
        link_quality: null,
      },
      tableFailureClass: 'not_stage43_table_target',
      normalizeParamShape: 'none',
      headerParamShape: 'none',
      normalizeParams: {},
      headerParams: {},
      normalizeRefs: [],
      headerRefs: [],
      tableHeaderDebt: 0,
      hasStrictTablePacCap: false,
      hasUnsafeTableShape: false,
      tableSignalSummary: {},
      auditSummary: {},
      realTableCount: 0,
      normalizeCandidateCount: 0,
      headerAssociationCandidateCount: 0,
      candidates: [],
      classification: 'no_safe_table_lane',
      reasons: [message],
      error: message,
    };
  }
}

async function buildReport(args: Args): Promise<Report> {
  const rows: DiagnosticRow[] = [];
  for (const pdf of args.pdfs) {
    const id = rowId(pdf);
    rows.push(await analyzeRow(pdf, args.controls.has(id) ? 'control' : 'focus'));
  }
  const classificationCounts: Record<string, number> = {};
  for (const row of rows) {
    classificationCounts[row.classification] = (classificationCounts[row.classification] ?? 0) + 1;
  }
  const transactionCandidates = rows
    .filter(row => row.classification === 'strict_ref_transaction_candidate')
    .map(row => row.id);
  const broadSelectorFinalCleanupGaps = rows
    .filter(row => row.classification === 'broad_selector_final_cleanup_gap')
    .map(row => row.id);
  const targetSelectionGaps = rows
    .filter(row => row.classification === 'target_selection_gap' || row.classification === 'layout_or_no_object_target')
    .map(row => row.id);
  const controlTargetRisks = rows
    .filter(row => row.classification === 'control_target_risk')
    .map(row => row.id);
  const reasons: string[] = [];
  if (controlTargetRisks.length > 0) reasons.push('controls_have_planner_table_targets');
  if (transactionCandidates.filter(id => rows.find(row => row.id === id)?.role === 'focus').length < 2) {
    reasons.push('fewer_than_two_focus_transaction_candidates');
  }
  if (broadSelectorFinalCleanupGaps.length > 0) reasons.push('broad_selector_rows_need_final_cleanup_diagnostic');
  if (targetSelectionGaps.length > 0) reasons.push('target_selection_gaps_present');
  const status =
    broadSelectorFinalCleanupGaps.length > 0 ||
    targetSelectionGaps.length > 0 ||
    transactionCandidates.length > 0
      ? 'plan_target_selection_or_cleanup_lane'
      : 'diagnostic_only';
  return {
    generatedAt: new Date().toISOString(),
    outDir: args.outDir,
    rows,
    summary: {
      rowCount: rows.length,
      focusCount: rows.filter(row => row.role === 'focus').length,
      controlCount: rows.filter(row => row.role === 'control').length,
      classificationCounts,
      transactionCandidates,
      broadSelectorFinalCleanupGaps,
      targetSelectionGaps,
      controlTargetRisks,
    },
    decision: {
      status,
      reasons: reasons.length > 0 ? reasons : ['no_target_selection_lane_identified'],
    },
  };
}

function renderMarkdown(report: Report): string {
  const lines = [
    '# Table Target Selection Final Cleanup Diagnostic',
    '',
    `Generated: ${report.generatedAt}`,
    `Decision: \`${report.decision.status}\``,
    `Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ')}`,
    '',
    '## Summary',
    '',
    `- Rows: ${report.summary.rowCount} (${report.summary.focusCount} focus / ${report.summary.controlCount} control)`,
    `- Transaction candidates: ${report.summary.transactionCandidates.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Broad selector/final cleanup gaps: ${report.summary.broadSelectorFinalCleanupGaps.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Target selection gaps: ${report.summary.targetSelectionGaps.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Control target risks: ${report.summary.controlTargetRisks.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Table | Class | Normalize | Header | Real Tables | Candidates | Classification | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      `| \`${row.id}\``,
      row.role,
      `${row.score}/${row.grade}`,
      String(row.categories.table_markup ?? 'n/a'),
      `\`${row.tableFailureClass}\``,
      `\`${row.normalizeParamShape}\``,
      `\`${row.headerParamShape}\``,
      String(row.realTableCount),
      `${row.normalizeCandidateCount}/${row.headerAssociationCandidateCount}`,
      `\`${row.classification}\``,
      `${row.reasons.map(reason => `\`${reason}\``).join(', ')} |`,
    ].join(' | '));
  }
  lines.push('', '## Top Candidate Details', '');
  for (const row of report.rows) {
    lines.push(`### ${row.id}`, '');
    if (row.error) {
      lines.push(`Error: \`${row.error}\``, '');
      continue;
    }
    lines.push(`Normalize params: \`${JSON.stringify(row.normalizeParams)}\``);
    lines.push(`Header params: \`${JSON.stringify(row.headerParams)}\``);
    lines.push('');
    lines.push('| Ref | Page | Role | Cells | Rows | Headers | Misplaced | Irregular | EmptyRows | Normalize | HeaderAssoc | Reasons |');
    lines.push('| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');
    for (const table of row.candidates.slice(0, 8)) {
      lines.push([
        `| \`${table.structRef ?? 'none'}\``,
        String(table.page),
        `${table.rawRole ?? 'n/a'}/${table.resolvedRole ?? 'n/a'}`,
        String(table.totalCells),
        String(table.rowCount),
        `${table.hasHeaders ? 'yes' : 'no'}:${table.headerCount}`,
        String(table.cellsMisplacedCount),
        String(table.irregularRows),
        String(table.removableEmptyRowCount),
        table.normalizeEligible ? 'yes' : 'no',
        table.headerAssociationEligible ? 'yes' : 'no',
        `${table.rejectionReasons.map(reason => `\`${reason}\``).join(', ') || 'none'} |`,
      ].join(' | '));
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await buildReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'table-target-selection-final-cleanup.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'table-target-selection-final-cleanup.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'table-target-selection-final-cleanup.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

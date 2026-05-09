#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import {
  rankAssociationTables,
  selectBatchStructRefs,
} from './pac-table-header-batch-diagnostic.js';
import type { PacTableHeaderDiagnosticRow, TableEvidenceRow } from './pac-table-header-target-diagnostic.js';

const DEFAULT_PDF_DIR = 'Output/goal-all-input-mean-2026-05-09-r1/run-focused-table-header-targets-2026-05-09-r1';
const DEFAULT_POC = 'Output/goal-all-input-mean-2026-05-09-r1/poc-strong-focused-table-header-r1/poc-strong-rule-matrix.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/table-header-object-diagnostic-r1';

export type AllInputTableHeaderObjectClassification =
  | 'association_candidate_current_bound'
  | 'association_candidate_exceeds_current_batch'
  | 'irregular_or_direct_table_shape'
  | 'missing_header_creation_first'
  | 'needs_stable_table_identity'
  | 'not_table_first';

export interface AllInputTableHeaderObjectRow {
  fileId: string;
  file: string;
  score: number;
  grade: string;
  tableMarkupScore: number | null;
  pocTableFailures: Array<{ ruleId: string; count: number | null; message: string | null }>;
  tableSignals: Record<string, number | null>;
  tableHeaderAudit: DocumentSnapshot['tableHeaderAudit'] | null;
  tableCount: number;
  stableAssociationTableCount: number;
  selectedStructRefs: string[];
  estimatedBatchTdDebt: number;
  topTables: Array<{
    structRef: string;
    page: number | null;
    rowCount: number | null;
    totalCells: number;
    headerCount: number;
    estimatedTdDebt: number;
  }>;
  classification: AllInputTableHeaderObjectClassification;
  classificationReason: string;
}

export interface AllInputTableHeaderObjectDiagnostic {
  generatedAt: string;
  pdfDir: string;
  pocSource: string;
  summary: {
    rowCount: number;
    byClassification: Record<string, number>;
    candidateFiles: string[];
    parkedFiles: string[];
  };
  rows: AllInputTableHeaderObjectRow[];
}

interface PocRule {
  ruleId: string;
  status: string;
  count?: number;
  message?: string;
}

interface PocFile {
  id?: string;
  file: string;
  rules?: PocRule[];
}

function parseArgs(argv: string[]): { pdfDir: string; poc: string; out: string } {
  let pdfDir = DEFAULT_PDF_DIR;
  let poc = DEFAULT_POC;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--pdf-dir' && next) {
      pdfDir = next;
      i++;
    } else if (arg === '--poc' && next) {
      poc = next;
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-table-header-object-diagnostic.ts [--pdf-dir <dir>] [--poc <poc-rule-matrix.json>] [--out <dir>]',
        '',
        `Defaults: --pdf-dir ${DEFAULT_PDF_DIR} --poc ${DEFAULT_POC} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { pdfDir, poc, out };
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function categoryScore(result: AnalysisResult, key: string): number | null {
  return result.categories.find(category => category.key === key)?.score ?? null;
}

function tableEvidence(snapshot: DocumentSnapshot): TableEvidenceRow[] {
  return snapshot.tables.map(table => ({
    structRef: table.structRef ?? null,
    page: typeof table.page === 'number' ? table.page : null,
    rowCount: table.rowCount ?? null,
    totalCells: table.totalCells ?? null,
    headerCount: table.headerCount ?? null,
    hasHeaders: table.hasHeaders,
    cellsMisplacedCount: table.cellsMisplacedCount ?? null,
    irregularRows: table.irregularRows ?? null,
  }));
}

function tableSignals(snapshot: DocumentSnapshot): Record<string, number | null> {
  const signals = snapshot.detectionProfile.tableSignals;
  return {
    directCellUnderTableCount: signals.directCellUnderTableCount ?? 0,
    misplacedCellCount: signals.misplacedCellCount ?? 0,
    irregularTableCount: signals.irregularTableCount ?? 0,
    stronglyIrregularTableCount: signals.stronglyIrregularTableCount ?? 0,
    tablesWithMisplacedCells: signals.tablesWithMisplacedCells ?? 0,
  };
}

function hasUnsafeTableShape(signals: Record<string, number | null>, tables: TableEvidenceRow[]): boolean {
  return (signals.directCellUnderTableCount ?? 0) > 0 ||
    (signals.misplacedCellCount ?? 0) > 0 ||
    (signals.irregularTableCount ?? 0) > 0 ||
    (signals.stronglyIrregularTableCount ?? 0) > 0 ||
    tables.some(table => (table.cellsMisplacedCount ?? 0) > 0 || (table.irregularRows ?? 0) > 0);
}

function tableFailRules(rules: PocRule[]): AllInputTableHeaderObjectRow['pocTableFailures'] {
  return rules
    .filter(rule => rule.status === 'fail' && (
      rule.ruleId === 'pdfua.table.header_association_present' ||
      rule.ruleId === 'pdfua.table.header_cells_associated'
    ))
    .map(rule => ({
      ruleId: rule.ruleId,
      count: typeof rule.count === 'number' ? rule.count : null,
      message: rule.message ?? null,
    }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function asPacTableRow(input: {
  fileId: string;
  file: string;
  result: AnalysisResult;
  snapshot: DocumentSnapshot;
  pocTableFailures: AllInputTableHeaderObjectRow['pocTableFailures'];
  tables: TableEvidenceRow[];
  signals: Record<string, number | null>;
}): PacTableHeaderDiagnosticRow {
  return {
    fileId: input.fileId,
    file: input.file,
    role: 'target',
    score: input.result.score,
    grade: input.result.grade,
    tableMarkupScore: categoryScore(input.result, 'table_markup'),
    tableMarkupApplicable: input.result.categories.find(category => category.key === 'table_markup')?.applicable ?? null,
    strictTableCaps: input.pocTableFailures.map(rule => ({
      ruleId: rule.ruleId,
      cap: 79,
      rawScore: 100,
      finalScore: Math.min(79, categoryScore(input.result, 'table_markup') ?? 79),
    })),
    tableSignals: input.signals,
    tableHeaderAudit: input.snapshot.tableHeaderAudit ?? null,
    tables: input.tables,
    tableTools: [],
    fiveReviewBuckets: [],
    fiveReviewLeafFamilies: [],
    classification: 'safe_existing_table_repair_candidate',
    classificationReason: 'temporary row for all-input table/header classification',
  };
}

export function classifyAllInputTableHeaderRow(input: {
  fileId: string;
  file: string;
  result: AnalysisResult;
  snapshot: DocumentSnapshot;
  pocTableFailures: AllInputTableHeaderObjectRow['pocTableFailures'];
}): AllInputTableHeaderObjectRow {
  const tables = tableEvidence(input.snapshot);
  const signals = tableSignals(input.snapshot);
  const ranked = rankAssociationTables(tables);
  const selected = selectBatchStructRefs(ranked);
  const audit = input.snapshot.tableHeaderAudit ?? null;
  const hasTablePacDebt = input.pocTableFailures.length > 0 || Boolean(audit && (
    audit.headerAssociationMissingCount > 0 ||
    audit.orphanHeaderCellCount > 0 ||
    audit.dataCellsWithoutHeaderCount > 0
  ));
  let classification: AllInputTableHeaderObjectClassification = 'association_candidate_current_bound';
  let classificationReason = 'Stable table refs with direct association debt fit within current batch bounds.';

  if (!hasTablePacDebt) {
    classification = 'not_table_first';
    classificationReason = 'No direct PAC/internal table header-association debt is present.';
  } else if (hasUnsafeTableShape(signals, tables)) {
    classification = 'irregular_or_direct_table_shape';
    classificationReason = 'Direct, misplaced, or irregular table structure should be fixed before header association metadata.';
  } else if (tables.some(table => table.structRef && table.hasHeaders === false)) {
    classification = 'missing_header_creation_first';
    classificationReason = 'At least one stable table lacks TH cells, so header creation must precede association metadata.';
  } else if (ranked.length === 0) {
    classification = 'needs_stable_table_identity';
    classificationReason = 'Header association debt exists but no stable Table structRef with derivable TH/TD evidence was found.';
  } else if (ranked.length > selected.refs.length || (audit?.dataCellsWithoutHeaderCount ?? 0) > selected.estimatedTdDebt) {
    classification = 'association_candidate_exceeds_current_batch';
    classificationReason = 'Stable association targets exist, but current batch bounds cover only part of the observed TD/header debt.';
  }

  return {
    fileId: input.fileId,
    file: input.file,
    score: input.result.score,
    grade: input.result.grade,
    tableMarkupScore: categoryScore(input.result, 'table_markup'),
    pocTableFailures: input.pocTableFailures,
    tableSignals: signals,
    tableHeaderAudit: audit,
    tableCount: input.snapshot.tables.length,
    stableAssociationTableCount: ranked.length,
    selectedStructRefs: classification === 'association_candidate_current_bound' || classification === 'association_candidate_exceeds_current_batch'
      ? selected.refs
      : [],
    estimatedBatchTdDebt: classification === 'association_candidate_current_bound' || classification === 'association_candidate_exceeds_current_batch'
      ? selected.estimatedTdDebt
      : 0,
    topTables: ranked.slice(0, 12),
    classification,
    classificationReason,
  };
}

export function buildAllInputTableHeaderObjectDiagnostic(input: {
  generatedAt?: string;
  pdfDir: string;
  pocSource: string;
  rows: AllInputTableHeaderObjectRow[];
}): AllInputTableHeaderObjectDiagnostic {
  const rows = [...input.rows].sort((a, b) => a.fileId.localeCompare(b.fileId));
  const byClassification: Record<string, number> = {};
  for (const row of rows) byClassification[row.classification] = (byClassification[row.classification] ?? 0) + 1;
  const candidateFiles = sortedUnique(rows
    .filter(row => row.classification === 'association_candidate_current_bound' || row.classification === 'association_candidate_exceeds_current_batch')
    .map(row => row.fileId));
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    pdfDir: input.pdfDir,
    pocSource: input.pocSource,
    summary: {
      rowCount: rows.length,
      byClassification: Object.fromEntries(Object.entries(byClassification).sort((a, b) => a[0].localeCompare(b[0]))),
      candidateFiles,
      parkedFiles: sortedUnique(rows.filter(row => !candidateFiles.includes(row.fileId)).map(row => row.fileId)),
    },
    rows,
  };
}

function mdRow(values: Array<string | number | null | undefined>): string {
  return `| ${values.map(value => String(value ?? '')).join(' | ')} |`;
}

export function renderAllInputTableHeaderObjectMarkdown(report: AllInputTableHeaderObjectDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Table/Header Object Diagnostic');
  lines.push('');
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`PDF dir: \`${report.pdfDir}\``);
  lines.push(`POC source: \`${report.pocSource}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Candidate files: ${report.summary.candidateFiles.join(', ') || 'none'}`);
  lines.push(`- Parked/non-table-first files: ${report.summary.parkedFiles.join(', ') || 'none'}`);
  lines.push('');
  lines.push(mdRow(['classification', 'count']));
  lines.push(mdRow(['---', '---:']));
  for (const [classification, count] of Object.entries(report.summary.byClassification)) {
    lines.push(mdRow([classification, count]));
  }
  lines.push('');
  lines.push(mdRow(['file', 'score', 'grade', 'table', 'PAC table fails', 'tables', 'stable refs', 'batch TD', 'classification']));
  lines.push(mdRow(['---', '---:', '---', '---:', '---:', '---:', '---:', '---:', '---']));
  for (const row of report.rows) {
    lines.push(mdRow([
      row.fileId,
      row.score,
      row.grade,
      row.tableMarkupScore,
      row.pocTableFailures.length,
      row.tableCount,
      row.stableAssociationTableCount,
      row.estimatedBatchTdDebt,
      row.classification,
    ]));
  }
  lines.push('');
  lines.push('## Row Details');
  for (const row of report.rows) {
    lines.push('');
    lines.push(`### ${row.fileId}`);
    lines.push('');
    lines.push(`- Reason: ${row.classificationReason}`);
    lines.push(`- Table audit: \`${JSON.stringify(row.tableHeaderAudit ?? {})}\``);
    lines.push(`- Table signals: \`${JSON.stringify(row.tableSignals)}\``);
    lines.push(`- Selected refs: ${row.selectedStructRefs.join(', ') || 'none'}`);
    lines.push('');
    lines.push(mdRow(['structRef', 'page', 'rows', 'cells', 'headers', 'estimated TD debt']));
    lines.push(mdRow(['---', '---:', '---:', '---:', '---:', '---:']));
    for (const table of row.topTables) {
      lines.push(mdRow([table.structRef, table.page, table.rowCount, table.totalCells, table.headerCount, table.estimatedTdDebt]));
    }
    if (row.topTables.length === 0) lines.push(mdRow(['none', '', '', '', '', '']));
  }
  lines.push('');
  return lines.join('\n');
}

function pocByBasename(pocMatrix: unknown): Map<string, PocRule[]> {
  const map = new Map<string, PocRule[]>();
  for (const file of ((pocMatrix as { files?: PocFile[] }).files ?? [])) {
    map.set(basename(file.file), file.rules ?? []);
    if (file.id) map.set(file.id, file.rules ?? []);
  }
  return map;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pdfDir = resolve(args.pdfDir);
  const outDir = resolve(args.out);
  const pocMatrix = JSON.parse(await readFile(resolve(args.poc), 'utf8')) as unknown;
  const poc = pocByBasename(pocMatrix);
  const names = (await readdir(pdfDir)).filter(name => name.toLowerCase().endsWith('.pdf')).sort((a, b) => a.localeCompare(b));
  const rows: AllInputTableHeaderObjectRow[] = [];

  for (const name of names) {
    const file = join(pdfDir, name);
    const { result, snapshot } = await analyzePdf(file, name);
    const tableFailures = tableFailRules(poc.get(name) ?? []);
    rows.push(classifyAllInputTableHeaderRow({
      fileId: name.replace(/\.pdf$/i, ''),
      file,
      result,
      snapshot,
      pocTableFailures: tableFailures,
    }));
  }

  const report = buildAllInputTableHeaderObjectDiagnostic({
    pdfDir: args.pdfDir,
    pocSource: args.poc,
    rows,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'all-input-table-header-object-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'all-input-table-header-object-diagnostic.md'), renderAllInputTableHeaderObjectMarkdown(report), 'utf8');
  console.log(`Wrote all-input table/header object diagnostic to ${outDir}`);
  console.log(`Candidate files: ${report.summary.candidateFiles.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

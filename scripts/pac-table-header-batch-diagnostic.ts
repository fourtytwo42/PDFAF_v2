#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PacTableHeaderDiagnosticRow, PacTableHeaderTargetDiagnostic, TableEvidenceRow } from './pac-table-header-target-diagnostic.js';

const DEFAULT_INPUT = 'Output/experiment-corpus-baseline/pac-table-header-target-diagnostic-2026-05-08-r1/pac-table-header-target-diagnostic.json';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-table-header-batch-diagnostic-2026-05-08-r1';
const DEFAULT_TARGETS = ['figure-4754', 'long-4700'];
const MAX_BATCH_REFS = 4;
const MAX_BATCH_TD_DEBT = 120;

export type TableHeaderBatchClassification =
  | 'batch_association_candidate'
  | 'needs_more_table_identity'
  | 'unsafe_table_shape'
  | 'not_table_first';

export interface RankedTableHeaderBatchTarget {
  structRef: string;
  page: number | null;
  rowCount: number | null;
  totalCells: number;
  headerCount: number;
  estimatedTdDebt: number;
}

export interface TableHeaderBatchDiagnosticRow {
  fileId: string;
  score: number | null;
  grade: string | null;
  tableMarkupScore: number | null;
  classification: TableHeaderBatchClassification;
  classificationReason: string;
  selectedStructRefs: string[];
  estimatedBatchTdDebt: number;
  rankedTables: RankedTableHeaderBatchTarget[];
  tableHeaderAudit: PacTableHeaderDiagnosticRow['tableHeaderAudit'];
}

export interface TableHeaderBatchDiagnostic {
  generatedAt: string;
  source: string;
  targets: string[];
  summary: {
    candidateFiles: string[];
    noCandidateFiles: string[];
  };
  rows: TableHeaderBatchDiagnosticRow[];
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/pac-table-header-batch-diagnostic.ts [--input <target-diagnostic.json>] [--target <id>]... [--out <dir>]';
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function tableDebt(table: TableEvidenceRow): number {
  return Math.max(0, (table.totalCells ?? 0) - (table.headerCount ?? 0));
}

function hasUnsafeShape(row: PacTableHeaderDiagnosticRow): boolean {
  return (row.tableSignals.directCellUnderTableCount ?? 0) > 0 ||
    (row.tableSignals.misplacedCellCount ?? 0) > 0 ||
    (row.tableSignals.irregularTableCount ?? 0) > 0 ||
    (row.tableSignals.stronglyIrregularTableCount ?? 0) > 0 ||
    row.tables.some(table => (table.cellsMisplacedCount ?? 0) > 0 || (table.irregularRows ?? 0) > 0);
}

export function rankAssociationTables(tables: TableEvidenceRow[]): RankedTableHeaderBatchTarget[] {
  return tables
    .filter((table): table is TableEvidenceRow & { structRef: string } =>
      Boolean(table.structRef) &&
      table.hasHeaders === true &&
      (table.headerCount ?? 0) > 0 &&
      (table.totalCells ?? 0) > (table.headerCount ?? 0) &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.irregularRows ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1,
    )
    .map(table => ({
      structRef: table.structRef,
      page: table.page,
      rowCount: table.rowCount,
      totalCells: table.totalCells ?? 0,
      headerCount: table.headerCount ?? 0,
      estimatedTdDebt: tableDebt(table),
    }))
    .sort((a, b) =>
      b.estimatedTdDebt - a.estimatedTdDebt ||
      b.totalCells - a.totalCells ||
      b.headerCount - a.headerCount ||
      (a.page ?? 0) - (b.page ?? 0) ||
      a.structRef.localeCompare(b.structRef),
    );
}

export function selectBatchStructRefs(ranked: RankedTableHeaderBatchTarget[]): { refs: string[]; estimatedTdDebt: number } {
  const refs: string[] = [];
  let estimatedTdDebt = 0;
  for (const table of ranked) {
    if (refs.length > 0 && estimatedTdDebt + table.estimatedTdDebt > MAX_BATCH_TD_DEBT) continue;
    refs.push(table.structRef);
    estimatedTdDebt += table.estimatedTdDebt;
    if (refs.length >= MAX_BATCH_REFS) break;
  }
  return { refs, estimatedTdDebt };
}

export function classifyBatchAssociationRow(row: PacTableHeaderDiagnosticRow): TableHeaderBatchDiagnosticRow {
  const rankedTables = rankAssociationTables(row.tables);
  const selected = selectBatchStructRefs(rankedTables);
  let classification: TableHeaderBatchClassification = 'batch_association_candidate';
  let classificationReason = 'Stable association-only table refs can be batched within the configured bounds.';

  if (
    row.strictTableCaps.length === 0 ||
    !row.tableHeaderAudit ||
    row.tableHeaderAudit.headerAssociationMissingCount < 4 ||
    row.tableHeaderAudit.dataCellsWithoutHeaderCount < 100
  ) {
    classification = 'not_table_first';
    classificationReason = 'Row does not have high-volume many-table association debt requiring this batch probe.';
  } else if (hasUnsafeShape(row)) {
    classification = 'unsafe_table_shape';
    classificationReason = 'Direct, misplaced, or irregular table structure signals must be repaired before header association batching.';
  } else if (rankedTables.length === 0 || selected.refs.length <= 1) {
    classification = 'needs_more_table_identity';
    classificationReason = 'Many-table debt is present but stable batchable table refs are insufficient.';
  }

  return {
    fileId: row.fileId,
    score: row.score,
    grade: row.grade,
    tableMarkupScore: row.tableMarkupScore,
    classification,
    classificationReason,
    selectedStructRefs: classification === 'batch_association_candidate' ? selected.refs : [],
    estimatedBatchTdDebt: classification === 'batch_association_candidate' ? selected.estimatedTdDebt : 0,
    rankedTables,
    tableHeaderAudit: row.tableHeaderAudit,
  };
}

export function buildTableHeaderBatchDiagnostic(input: {
  source: string;
  report: PacTableHeaderTargetDiagnostic;
  targets: string[];
  generatedAt?: string;
}): TableHeaderBatchDiagnostic {
  const targetSet = new Set(input.targets);
  const rows = input.report.rows
    .filter(row => targetSet.has(row.fileId))
    .map(classifyBatchAssociationRow)
    .sort((a, b) => a.fileId.localeCompare(b.fileId));
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: input.source,
    targets: input.targets,
    summary: {
      candidateFiles: sortedUnique(rows.filter(row => row.classification === 'batch_association_candidate').map(row => row.fileId)),
      noCandidateFiles: sortedUnique(rows.filter(row => row.classification !== 'batch_association_candidate').map(row => row.fileId)),
    },
    rows,
  };
}

function tableRow(values: Array<string | number | null | undefined>): string {
  return `| ${values.map(value => String(value ?? '')).join(' | ')} |`;
}

export function renderTableHeaderBatchMarkdown(report: TableHeaderBatchDiagnostic): string {
  const lines: string[] = [];
  lines.push('# PAC Table Header Batch Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Source: ${report.source}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Candidate files: ${report.summary.candidateFiles.join(', ') || 'none'}`);
  lines.push(`- Non-candidates: ${report.summary.noCandidateFiles.join(', ') || 'none'}`);
  lines.push('');
  lines.push(tableRow(['file', 'score', 'grade', 'table', 'classification', 'batch refs', 'estimated TD debt']));
  lines.push(tableRow(['---', '---:', '---', '---:', '---', '---', '---:']));
  for (const row of report.rows) {
    lines.push(tableRow([
      row.fileId,
      row.score,
      row.grade,
      row.tableMarkupScore,
      row.classification,
      row.selectedStructRefs.join(', ') || 'none',
      row.estimatedBatchTdDebt,
    ]));
  }
  lines.push('');
  lines.push('## Ranked Tables');
  for (const row of report.rows) {
    lines.push('');
    lines.push(`### ${row.fileId}`);
    lines.push('');
    lines.push(`Reason: ${row.classificationReason}`);
    lines.push('');
    lines.push(tableRow(['structRef', 'page', 'rows', 'cells', 'headers', 'estimated TD debt']));
    lines.push(tableRow(['---', '---:', '---:', '---:', '---:', '---:']));
    for (const table of row.rankedTables.slice(0, 12)) {
      lines.push(tableRow([table.structRef, table.page, table.rowCount, table.totalCells, table.headerCount, table.estimatedTdDebt]));
    }
    if (row.rankedTables.length === 0) lines.push(tableRow(['none', '', '', '', '', '']));
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let out = DEFAULT_OUT;
  const targets: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--input') input = args[++index] ?? DEFAULT_INPUT;
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else if (arg === '--target') targets.push(args[++index] ?? '');
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const selectedTargets = targets.filter(Boolean).length ? sortedUnique(targets.filter(Boolean)) : DEFAULT_TARGETS;
  const inputPath = resolve(input);
  const source = JSON.parse(await readFile(inputPath, 'utf8')) as PacTableHeaderTargetDiagnostic;
  const report = buildTableHeaderBatchDiagnostic({ source: input, report: source, targets: selectedTargets });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-table-header-batch-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-table-header-batch-diagnostic.md'), renderTableHeaderBatchMarkdown(report), 'utf8');
  console.log(`Wrote PAC table/header batch diagnostic to ${outDir}`);
  console.log(`Candidate files: ${report.summary.candidateFiles.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

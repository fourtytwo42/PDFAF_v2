#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';

const DEFAULT_BASELINE = 'Output/experiment-corpus-baseline/run-pac-strict-grader-fixed50-2026-05-08-r1';
const DEFAULT_CANDIDATE = 'Output/experiment-corpus-baseline/run-route-repeatability-table-batch-target-2026-05-08-r3';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/table-batch-acceptance-diagnostic-2026-05-08-r1';
const PARKED_ROWS = new Set(['fixture-inaccessible', 'figure-4754', 'structure-3775', 'structure-4076', 'structure-4438']);
const TABLE_TARGET_ROWS = new Set(['long-4700', 'font-4699']);

export interface TableBatchAcceptanceRow {
  id: string;
  file: string;
  parked: boolean;
  tableTarget: boolean;
  baselineScore: number | null;
  candidateScore: number | null;
  baselineGrade: string | null;
  candidateGrade: string | null;
  scoreDelta: number | null;
  tableAssociationImproved: boolean;
  tableHeaderAssociationBefore: number | null;
  tableHeaderAssociationAfter: number | null;
  dataCellsWithoutHeaderBefore: number | null;
  dataCellsWithoutHeaderAfter: number | null;
  tableCapCount: number;
  falsePositiveApplied: boolean;
  hardTimeout: boolean;
  classification: 'table_observation' | 'parked_debt' | 'non_parked_regression' | 'non_parked_clean';
}

export interface TableBatchAcceptanceDiagnostic {
  generatedAt: string;
  baselineRun: string;
  candidateRun: string;
  summary: {
    rowCount: number;
    parkedDebtCount: number;
    nonParkedRegressionCount: number;
    tableObservationCount: number;
    tableImprovementCount: number;
    falsePositiveAppliedCount: number;
    hardTimeoutCount: number;
    decision: 'accept_table_batch_with_parked_debt' | 'blocked_by_non_parked_regression' | 'blocked_by_false_positive' | 'needs_more_evidence';
  };
  rows: TableBatchAcceptanceRow[];
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/table-batch-acceptance-diagnostic.ts [--baseline <run-dir>] [--candidate <run-dir>] [--out <dir>]';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function finalScore(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function finalGrade(row: RemediateBenchmarkRow | null | undefined): string | null {
  return row?.reanalyzedGrade ?? row?.afterGrade ?? null;
}

function tableAssociationSummary(row: RemediateBenchmarkRow | null | undefined): {
  improved: boolean;
  headerAssociationBefore: number | null;
  headerAssociationAfter: number | null;
  dataCellsWithoutHeaderBefore: number | null;
  dataCellsWithoutHeaderAfter: number | null;
} {
  let improved = false;
  let headerAssociationBefore: number | null = null;
  let headerAssociationAfter: number | null = null;
  let dataCellsWithoutHeaderBefore: number | null = null;
  let dataCellsWithoutHeaderAfter: number | null = null;
  for (const tool of row?.appliedTools ?? []) {
    if (tool.toolName !== 'set_table_header_cells') continue;
    const invariants = asRecord(parseDetails(tool.details)?.['invariants']);
    const before = numberOrNull(invariants?.['headerAssociationMissingCountBefore']);
    const after = numberOrNull(invariants?.['headerAssociationMissingCountAfter']);
    const tdBefore = numberOrNull(invariants?.['dataCellsWithoutHeaderCountBefore']);
    const tdAfter = numberOrNull(invariants?.['dataCellsWithoutHeaderCountAfter']);
    if (before != null) headerAssociationBefore = headerAssociationBefore == null ? before : Math.max(headerAssociationBefore, before);
    if (after != null) headerAssociationAfter = headerAssociationAfter == null ? after : Math.min(headerAssociationAfter, after);
    if (tdBefore != null) dataCellsWithoutHeaderBefore = dataCellsWithoutHeaderBefore == null ? tdBefore : Math.max(dataCellsWithoutHeaderBefore, tdBefore);
    if (tdAfter != null) dataCellsWithoutHeaderAfter = dataCellsWithoutHeaderAfter == null ? tdAfter : Math.min(dataCellsWithoutHeaderAfter, tdAfter);
    if ((before != null && after != null && after < before) || (tdBefore != null && tdAfter != null && tdAfter < tdBefore)) {
      improved = true;
    }
  }
  return { improved, headerAssociationBefore, headerAssociationAfter, dataCellsWithoutHeaderBefore, dataCellsWithoutHeaderAfter };
}

function tableCapCount(row: RemediateBenchmarkRow | null | undefined): number {
  return (row?.reanalyzedScoreCapsApplied ?? row?.afterScoreCapsApplied ?? [])
    .filter(cap => cap.reason.includes('pdfua.table.'))
    .length;
}

function falsePositiveApplied(row: RemediateBenchmarkRow | null | undefined): boolean {
  return (row?.appliedTools ?? []).some(tool => {
    if (tool.outcome !== 'applied') return false;
    const parsed = parseDetails(tool.details);
    const invariants = asRecord(parsed?.['invariants']);
    if (!invariants) return false;
    return invariants['targetReachable'] === false ||
      invariants['targetIsFigureAfter'] === false ||
      invariants['tableTreeValidAfter'] === false ||
      invariants['ownershipPreserved'] === false;
  });
}

function isHardTimeout(row: RemediateBenchmarkRow | null | undefined): boolean {
  return /timeout|aborted|abort/i.test(String(asRecord(row)?.['error'] ?? ''));
}

function classify(input: {
  parked: boolean;
  tableTarget: boolean;
  candidateScore: number | null;
  baselineScore: number | null;
  tableAssociationImproved: boolean;
}): TableBatchAcceptanceRow['classification'] {
  if (input.parked) return 'parked_debt';
  if (input.tableTarget) return 'table_observation';
  if (input.candidateScore != null && input.baselineScore != null && input.candidateScore < input.baselineScore - 5) {
    return 'non_parked_regression';
  }
  return 'non_parked_clean';
}

export function buildTableBatchAcceptanceDiagnostic(input: {
  baselineRun: string;
  candidateRun: string;
  baselineRows: RemediateBenchmarkRow[];
  candidateRows: RemediateBenchmarkRow[];
  generatedAt?: string;
}): TableBatchAcceptanceDiagnostic {
  const baseline = new Map(input.baselineRows.map(row => [row.id, row]));
  const ids = [...new Set([...input.candidateRows.map(row => row.id), ...input.baselineRows.map(row => row.id)])].sort((a, b) => a.localeCompare(b));
  const rows = ids.map((id): TableBatchAcceptanceRow => {
    const candidate = input.candidateRows.find(row => row.id === id) ?? null;
    const base = baseline.get(id) ?? null;
    const table = tableAssociationSummary(candidate);
    const parked = PARKED_ROWS.has(id);
    const tableTarget = TABLE_TARGET_ROWS.has(id);
    const baselineScore = finalScore(base);
    const candidateScore = finalScore(candidate);
    const classification = classify({
      parked,
      tableTarget,
      baselineScore,
      candidateScore,
      tableAssociationImproved: table.improved,
    });
    return {
      id,
      file: candidate?.file ?? base?.file ?? '',
      parked,
      tableTarget,
      baselineScore,
      candidateScore,
      baselineGrade: finalGrade(base),
      candidateGrade: finalGrade(candidate),
      scoreDelta: baselineScore != null && candidateScore != null ? candidateScore - baselineScore : null,
      tableAssociationImproved: table.improved,
      tableHeaderAssociationBefore: table.headerAssociationBefore,
      tableHeaderAssociationAfter: table.headerAssociationAfter,
      dataCellsWithoutHeaderBefore: table.dataCellsWithoutHeaderBefore,
      dataCellsWithoutHeaderAfter: table.dataCellsWithoutHeaderAfter,
      tableCapCount: tableCapCount(candidate),
      falsePositiveApplied: falsePositiveApplied(candidate),
      hardTimeout: isHardTimeout(candidate),
      classification,
    };
  });
  const falsePositiveAppliedCount = rows.filter(row => row.falsePositiveApplied).length;
  const nonParkedRegressionCount = rows.filter(row => row.classification === 'non_parked_regression').length;
  const tableObservationRows = rows.filter(row => row.classification === 'table_observation');
  const tableImprovementCount = tableObservationRows.filter(row => row.tableAssociationImproved).length;
  const decision = falsePositiveAppliedCount > 0
    ? 'blocked_by_false_positive'
    : nonParkedRegressionCount > 0
      ? 'blocked_by_non_parked_regression'
      : tableObservationRows.length > 0 && tableImprovementCount > 0
        ? 'accept_table_batch_with_parked_debt'
        : 'needs_more_evidence';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRun: input.baselineRun,
    candidateRun: input.candidateRun,
    summary: {
      rowCount: rows.length,
      parkedDebtCount: rows.filter(row => row.classification === 'parked_debt').length,
      nonParkedRegressionCount,
      tableObservationCount: tableObservationRows.length,
      tableImprovementCount,
      falsePositiveAppliedCount,
      hardTimeoutCount: rows.filter(row => row.hardTimeout).length,
      decision,
    },
    rows: rows.sort((a, b) => {
      const order = a.classification.localeCompare(b.classification);
      return order || a.id.localeCompare(b.id);
    }),
  };
}

export function renderTableBatchAcceptanceMarkdown(report: TableBatchAcceptanceDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Table Batch Acceptance Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Baseline: \`${report.baselineRun}\``);
  lines.push(`Candidate: \`${report.candidateRun}\``, '');
  lines.push('## Summary', '');
  lines.push(`- Decision: \`${report.summary.decision}\``);
  lines.push(`- Rows: \`${report.summary.rowCount}\`; parked debt: \`${report.summary.parkedDebtCount}\`; non-parked regressions: \`${report.summary.nonParkedRegressionCount}\``);
  lines.push(`- Table observations: \`${report.summary.tableObservationCount}\`; table improvements: \`${report.summary.tableImprovementCount}\``);
  lines.push(`- False-positive applied: \`${report.summary.falsePositiveAppliedCount}\`; hard timeouts: \`${report.summary.hardTimeoutCount}\``, '');
  lines.push('| Row | Class | Score | Table debt | Table caps | Notes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const tableDebt = row.tableHeaderAssociationBefore != null || row.tableHeaderAssociationAfter != null
      ? `${row.tableHeaderAssociationBefore ?? 'n/a'} -> ${row.tableHeaderAssociationAfter ?? 'n/a'}; TD ${row.dataCellsWithoutHeaderBefore ?? 'n/a'} -> ${row.dataCellsWithoutHeaderAfter ?? 'n/a'}`
      : 'none';
    const notes = [
      row.parked ? 'parked' : '',
      row.falsePositiveApplied ? 'false_positive_applied' : '',
      row.hardTimeout ? 'hard_timeout' : '',
    ].filter(Boolean).join(', ') || 'none';
    lines.push(`| \`${row.id}\` | \`${row.classification}\` | \`${row.baselineScore ?? 'n/a'}/${row.baselineGrade ?? 'n/a'} -> ${row.candidateScore ?? 'n/a'}/${row.candidateGrade ?? 'n/a'}\` | \`${tableDebt}\` | \`${row.tableCapCount}\` | ${notes} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let baselineRun = DEFAULT_BASELINE;
  let candidateRun = DEFAULT_CANDIDATE;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--baseline') baselineRun = args[++index] ?? DEFAULT_BASELINE;
    else if (arg === '--candidate') candidateRun = args[++index] ?? DEFAULT_CANDIDATE;
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const [baseline, candidate] = await Promise.all([
    loadBenchmarkRowsFromRunDir(baselineRun),
    loadBenchmarkRowsFromRunDir(candidateRun),
  ]);
  const report = buildTableBatchAcceptanceDiagnostic({
    baselineRun,
    candidateRun,
    baselineRows: baseline.remediateResults,
    candidateRows: candidate.remediateResults,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'table-batch-acceptance-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'table-batch-acceptance-diagnostic.md'), renderTableBatchAcceptanceMarkdown(report), 'utf8');
  console.log(`Wrote table batch acceptance diagnostic to ${outDir}`);
  console.log(`Decision: ${report.summary.decision}`);
  console.log(`Non-parked regressions: ${report.summary.nonParkedRegressionCount}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

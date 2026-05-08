#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
} from './pac-target-route-diagnostic.js';
import { buildFixtureLinkRecoveryDiagnostic, type LinkRepairStatus } from './fixture-link-recovery-diagnostic.js';

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/route-repeatability-table-batch-diagnostic-2026-05-08-r1';
const DEFAULT_ROWS = [
  'fixture-inaccessible',
  'figure-4754',
  'long-4700',
  'font-4699',
  'fixture-accessible',
  'figure-4753',
  'long-4608',
  'structure-3775',
  'font-4035',
];
const TABLE_OBSERVATION_ROWS = new Set(['long-4700', 'font-4699']);
const BLOCKER_ROWS = new Set(['fixture-inaccessible', 'figure-4754']);

export type RouteRepeatabilityClassification =
  | 'same_state_guard_candidate'
  | 'upstream_route_volatility'
  | 'planner_or_scheduling_gap'
  | 'table_batch_stable_observation'
  | 'parked_no_safe_guard';

export interface RouteRepeatabilityObservation {
  runDir: string;
  rowId: string;
  score: number | null;
  grade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  error: string | null;
  linkRepairStatus: LinkRepairStatus;
  tableAssociationImproved: boolean;
  tableHeaderAssociationBefore: number | null;
  tableHeaderAssociationAfter: number | null;
  dataCellsWithoutHeaderBefore: number | null;
  dataCellsWithoutHeaderAfter: number | null;
  tableCapCount: number;
  falsePositiveApplied: boolean;
}

export interface RouteRepeatabilityComparison {
  leftRun: string;
  rightRun: string;
  leftScore: number | null;
  rightScore: number | null;
  firstDivergence: TimelineDivergence | null;
}

export interface RouteRepeatabilityRow {
  rowId: string;
  classification: RouteRepeatabilityClassification;
  scoreRange: { min: number | null; max: number | null };
  reanalyzedScoreRange: { min: number | null; max: number | null };
  observations: RouteRepeatabilityObservation[];
  comparisons: RouteRepeatabilityComparison[];
  stableSameStateBadRouteCount: number;
  upstreamDivergenceCount: number;
  linkRepairAppliedCount: number;
  linkRepairMissingCount: number;
  tableAssociationImprovedCount: number;
  falsePositiveAppliedCount: number;
  recommendation: string;
}

export interface RouteRepeatabilityDiagnostic {
  generatedAt: string;
  runDirs: string[];
  rows: RouteRepeatabilityRow[];
  summary: {
    sameStateGuardCandidates: string[];
    upstreamRouteVolatilityRows: string[];
    plannerOrSchedulingGapRows: string[];
    tableBatchStableObservationRows: string[];
    parkedRows: string[];
    falsePositiveAppliedRows: string[];
  };
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/route-repeatability-table-batch-diagnostic.ts --run <dir> [--run <dir>...] [--row <id>...] [--out <dir>]';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function valuesRange(values: Array<number | null>): { min: number | null; max: number | null } {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numbers.length === 0) return { min: null, max: null };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function scoreSpread(range: { min: number | null; max: number | null }): number {
  return range.min == null || range.max == null ? 0 : range.max - range.min;
}

function finalScore(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function finalGrade(row: RemediateBenchmarkRow | null | undefined): string | null {
  return row?.reanalyzedGrade ?? row?.afterGrade ?? null;
}

function linkRepairStatus(row: RemediateBenchmarkRow | null | undefined): LinkRepairStatus {
  if (!row) return 'missing';
  return buildFixtureLinkRecoveryDiagnostic({
    goodRun: 'single',
    badRun: 'single',
    rowId: row.id,
    goodRow: row,
    badRow: row,
    generatedAt: '1970-01-01T00:00:00.000Z',
  }).goodLinkRepairStatus;
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
    const parsed = parseDetails(tool.details);
    const invariants = asRecord(parsed?.['invariants']);
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
  return {
    improved,
    headerAssociationBefore,
    headerAssociationAfter,
    dataCellsWithoutHeaderBefore,
    dataCellsWithoutHeaderAfter,
  };
}

function scoreCapCount(row: RemediateBenchmarkRow | null | undefined, rulePrefix: string): number {
  return (row?.reanalyzedScoreCapsApplied ?? row?.afterScoreCapsApplied ?? [])
    .filter(cap => cap.reason.includes(rulePrefix))
    .length;
}

function falsePositiveApplied(row: RemediateBenchmarkRow | null | undefined): boolean {
  const summary = row?.remediationOutcomeSummary;
  const raw = asRecord(summary);
  if (raw && raw['falsePositiveApplied'] === true) return true;
  return (row?.appliedTools ?? []).some(tool => {
    const parsed = parseDetails(tool.details);
    return parsed?.['falsePositiveApplied'] === true;
  });
}

function observation(runDir: string, rowId: string, row: RemediateBenchmarkRow | null | undefined): RouteRepeatabilityObservation {
  const table = tableAssociationSummary(row);
  return {
    runDir,
    rowId,
    score: row?.afterScore ?? null,
    grade: row?.afterGrade ?? null,
    reanalyzedScore: row?.reanalyzedScore ?? null,
    reanalyzedGrade: row?.reanalyzedGrade ?? null,
    error: stringOrNull(asRecord(row)?.['error']),
    linkRepairStatus: linkRepairStatus(row),
    tableAssociationImproved: table.improved,
    tableHeaderAssociationBefore: table.headerAssociationBefore,
    tableHeaderAssociationAfter: table.headerAssociationAfter,
    dataCellsWithoutHeaderBefore: table.dataCellsWithoutHeaderBefore,
    dataCellsWithoutHeaderAfter: table.dataCellsWithoutHeaderAfter,
    tableCapCount: scoreCapCount(row, 'pdfua.table.'),
    falsePositiveApplied: falsePositiveApplied(row),
  };
}

function rowComparisons(runRows: Array<{ runDir: string; row: RemediateBenchmarkRow | null }>): RouteRepeatabilityComparison[] {
  const out: RouteRepeatabilityComparison[] = [];
  for (let left = 0; left < runRows.length; left += 1) {
    for (let right = left + 1; right < runRows.length; right += 1) {
      const a = runRows[left];
      const b = runRows[right];
      out.push({
        leftRun: a.runDir,
        rightRun: b.runDir,
        leftScore: finalScore(a.row),
        rightScore: finalScore(b.row),
        firstDivergence: a.row && b.row ? firstTimelineDivergence(toolTimeline(a.row), toolTimeline(b.row)) : null,
      });
    }
  }
  return out;
}

function classifyRow(input: {
  rowId: string;
  observations: RouteRepeatabilityObservation[];
  comparisons: RouteRepeatabilityComparison[];
}): Pick<RouteRepeatabilityRow, 'classification' | 'recommendation'> {
  const range = valuesRange(input.observations.map(row => finalScore({
    reanalyzedScore: row.reanalyzedScore,
    afterScore: row.score,
  } as RemediateBenchmarkRow)));
  const spread = scoreSpread(range);
  const sameStateScoreDropCount = input.comparisons.filter(row => (
    row.firstDivergence?.classification === 'same_state_outcome_drift' &&
    row.leftScore != null &&
    row.rightScore != null &&
    Math.abs(row.leftScore - row.rightScore) >= 10
  )).length;
  const upstreamCount = input.comparisons.filter(row => row.firstDivergence?.classification === 'upstream_state_drift').length;
  const linkAppliedCount = input.observations.filter(row => row.linkRepairStatus === 'applied' || row.linkRepairStatus === 'applied_with_pac_recovery').length;
  const linkMissingCount = input.observations.filter(row => row.linkRepairStatus === 'missing').length;
  const tableImprovedCount = input.observations.filter(row => row.tableAssociationImproved).length;
  if (sameStateScoreDropCount > 0 && spread >= 10 && BLOCKER_ROWS.has(input.rowId)) {
    return {
      classification: 'same_state_guard_candidate',
      recommendation: 'Repeat artifacts show same-state route drift; consider one replay-state-specific guard after control review.',
    };
  }
  if (TABLE_OBSERVATION_ROWS.has(input.rowId) && tableImprovedCount > 0) {
    return {
      classification: 'table_batch_stable_observation',
      recommendation: 'Table association repair remains mechanically useful; keep under observation until route blockers are parked or stabilized.',
    };
  }
  if (upstreamCount > 0 && spread >= 10 && BLOCKER_ROWS.has(input.rowId)) {
    return {
      classification: 'upstream_route_volatility',
      recommendation: 'Route varies before a same-state decision point; do not add behavior from this evidence.',
    };
  }
  if (input.rowId === 'fixture-inaccessible' && linkAppliedCount > 0 && linkMissingCount > 0) {
    return {
      classification: 'planner_or_scheduling_gap',
      recommendation: 'Native link repair appears in some routes but is missing in others; inspect scheduling only if repeat states stabilize.',
    };
  }
  return {
    classification: 'parked_no_safe_guard',
    recommendation: 'No repeat-proven safe behavior change is available.',
  };
}

export function buildRouteRepeatabilityDiagnostic(input: {
  runDirs: string[];
  runs: Array<{ runDir: string; rows: RemediateBenchmarkRow[] }>;
  rowIds: string[];
  generatedAt?: string;
}): RouteRepeatabilityDiagnostic {
  const rows = input.rowIds.map((rowId) => {
    const runRows = input.runs.map(run => ({
      runDir: run.runDir,
      row: run.rows.find(row => row.id === rowId) ?? null,
    }));
    const observations = runRows.map(row => observation(row.runDir, rowId, row.row));
    const comparisons = rowComparisons(runRows);
    const scoreRange = valuesRange(observations.map(row => row.score));
    const reanalyzedScoreRange = valuesRange(observations.map(row => row.reanalyzedScore));
    const classified = classifyRow({ rowId, observations, comparisons });
    return {
      rowId,
      classification: classified.classification,
      scoreRange,
      reanalyzedScoreRange,
      observations,
      comparisons,
      stableSameStateBadRouteCount: comparisons.filter(row => (
        row.firstDivergence?.classification === 'same_state_outcome_drift' &&
        row.leftScore != null &&
        row.rightScore != null &&
        Math.abs(row.leftScore - row.rightScore) >= 10
      )).length,
      upstreamDivergenceCount: comparisons.filter(row => row.firstDivergence?.classification === 'upstream_state_drift').length,
      linkRepairAppliedCount: observations.filter(row => row.linkRepairStatus === 'applied' || row.linkRepairStatus === 'applied_with_pac_recovery').length,
      linkRepairMissingCount: observations.filter(row => row.linkRepairStatus === 'missing').length,
      tableAssociationImprovedCount: observations.filter(row => row.tableAssociationImproved).length,
      falsePositiveAppliedCount: observations.filter(row => row.falsePositiveApplied).length,
      recommendation: classified.recommendation,
    };
  }).sort((a, b) => {
    const order = DEFAULT_ROWS.indexOf(a.rowId) - DEFAULT_ROWS.indexOf(b.rowId);
    return order || a.rowId.localeCompare(b.rowId);
  });
  const byClass = (classification: RouteRepeatabilityClassification): string[] => rows
    .filter(row => row.classification === classification)
    .map(row => row.rowId)
    .sort((a, b) => a.localeCompare(b));
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDirs: input.runDirs,
    rows,
    summary: {
      sameStateGuardCandidates: byClass('same_state_guard_candidate'),
      upstreamRouteVolatilityRows: byClass('upstream_route_volatility'),
      plannerOrSchedulingGapRows: byClass('planner_or_scheduling_gap'),
      tableBatchStableObservationRows: byClass('table_batch_stable_observation'),
      parkedRows: byClass('parked_no_safe_guard'),
      falsePositiveAppliedRows: rows
        .filter(row => row.falsePositiveAppliedCount > 0)
        .map(row => row.rowId)
        .sort((a, b) => a.localeCompare(b)),
    },
  };
}

function renderDivergence(divergence: TimelineDivergence | null): string {
  if (!divergence) return 'none';
  const left = divergence.left ? `${divergence.left.toolName}:${divergence.left.outcome}:${divergence.left.stateSignatureBefore ?? 'no-state'}` : 'none';
  const right = divergence.right ? `${divergence.right.toolName}:${divergence.right.outcome}:${divergence.right.stateSignatureBefore ?? 'no-state'}` : 'none';
  return `${divergence.reason}/${divergence.classification} [${left} vs ${right}]`;
}

export function renderRouteRepeatabilityMarkdown(report: RouteRepeatabilityDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Route Repeatability Table Batch Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Runs:');
  for (const run of report.runDirs) lines.push(`- \`${run}\``);
  lines.push('', '## Summary', '');
  lines.push(`- Same-state guard candidates: ${report.summary.sameStateGuardCandidates.join(', ') || 'none'}`);
  lines.push(`- Upstream route volatility: ${report.summary.upstreamRouteVolatilityRows.join(', ') || 'none'}`);
  lines.push(`- Planner/scheduling gaps: ${report.summary.plannerOrSchedulingGapRows.join(', ') || 'none'}`);
  lines.push(`- Table batch stable observations: ${report.summary.tableBatchStableObservationRows.join(', ') || 'none'}`);
  lines.push(`- Parked rows: ${report.summary.parkedRows.join(', ') || 'none'}`);
  lines.push(`- False-positive-applied rows: ${report.summary.falsePositiveAppliedRows.join(', ') || 'none'}`, '');
  for (const row of report.rows) {
    lines.push(`## ${row.rowId}`, '');
    lines.push(`- Classification: \`${row.classification}\``);
    lines.push(`- Score range: \`${row.scoreRange.min ?? 'n/a'}-${row.scoreRange.max ?? 'n/a'}\`; reanalyzed: \`${row.reanalyzedScoreRange.min ?? 'n/a'}-${row.reanalyzedScoreRange.max ?? 'n/a'}\``);
    lines.push(`- Same-state divergences: \`${row.stableSameStateBadRouteCount}\`; upstream divergences: \`${row.upstreamDivergenceCount}\``);
    lines.push(`- Link repair applied/missing: \`${row.linkRepairAppliedCount}/${row.linkRepairMissingCount}\``);
    lines.push(`- Table association improved count: \`${row.tableAssociationImprovedCount}\``);
    lines.push(`- False-positive-applied count: \`${row.falsePositiveAppliedCount}\``);
    lines.push(`- Recommendation: ${row.recommendation}`, '');
    lines.push('| Run | Score | Reanalyzed | Link repair | Table debt | Table caps | Error |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const obs of row.observations) {
      const tableDebt = obs.tableHeaderAssociationBefore != null || obs.tableHeaderAssociationAfter != null
        ? `${obs.tableHeaderAssociationBefore ?? 'n/a'} -> ${obs.tableHeaderAssociationAfter ?? 'n/a'}; TD ${obs.dataCellsWithoutHeaderBefore ?? 'n/a'} -> ${obs.dataCellsWithoutHeaderAfter ?? 'n/a'}`
        : 'none';
      lines.push(`| \`${obs.runDir}\` | \`${obs.score ?? 'n/a'}/${obs.grade ?? 'n/a'}\` | \`${obs.reanalyzedScore ?? 'n/a'}/${obs.reanalyzedGrade ?? 'n/a'}\` | \`${obs.linkRepairStatus}\` | \`${tableDebt}\` | \`${obs.tableCapCount}\` | ${obs.error ? `\`${obs.error}\`` : 'none'} |`);
    }
    lines.push('', 'First divergences:');
    for (const comparison of row.comparisons) {
      lines.push(`- \`${comparison.leftRun}\` vs \`${comparison.rightRun}\`: ${renderDivergence(comparison.firstDivergence)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runDirs: string[] = [];
  const rowIds: string[] = [];
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run') runDirs.push(args[++index] ?? '');
    else if (arg === '--row') rowIds.push(args[++index] ?? '');
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const selectedRuns = runDirs.filter(Boolean);
  if (selectedRuns.length < 2) throw new Error(`At least two --run directories are required.\n${usage()}`);
  const selectedRows = (rowIds.length ? rowIds : DEFAULT_ROWS).filter(Boolean);
  const runs = await Promise.all(selectedRuns.map(async runDir => ({
    runDir,
    rows: (await loadBenchmarkRowsFromRunDir(runDir)).remediateResults,
  })));
  const report = buildRouteRepeatabilityDiagnostic({
    runDirs: selectedRuns,
    runs,
    rowIds: selectedRows,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'route-repeatability-table-batch-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'route-repeatability-table-batch-diagnostic.md'), renderRouteRepeatabilityMarkdown(report), 'utf8');
  console.log(`Wrote route repeatability diagnostic to ${outDir}`);
  console.log(`Same-state guard candidates: ${report.summary.sameStateGuardCandidates.join(', ') || 'none'}`);
  console.log(`Upstream route volatility: ${report.summary.upstreamRouteVolatilityRows.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

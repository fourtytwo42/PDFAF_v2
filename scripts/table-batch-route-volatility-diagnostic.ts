#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
  type ToolTimelineEvent,
} from './pac-target-route-diagnostic.js';

const DEFAULT_GOOD = 'Output/experiment-corpus-baseline/run-table-header-association-target-2026-05-08-r2';
const DEFAULT_BAD = 'Output/experiment-corpus-baseline/run-table-header-batch-target-2026-05-08-r2';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/table-batch-route-volatility-diagnostic-2026-05-08-r1';
const DEFAULT_ROWS = ['fixture-inaccessible', 'figure-4754'];

export type TableBatchRouteBlockerClassification =
  | 'same_state_guard_candidate'
  | 'upstream_route_volatility'
  | 'PAC_blocked_useful_repair'
  | 'parked_no_safe_guard';

export interface TableBatchRouteBlockerRow {
  rowId: string;
  classification: TableBatchRouteBlockerClassification;
  goodScore: number | null;
  badScore: number | null;
  goodReanalyzedScore: number | null;
  badReanalyzedScore: number | null;
  firstDivergence: TimelineDivergence | null;
  pacRejectionCount: number;
  laterLinkRecoveryBlocked: boolean;
  goodLinkRepairOutcome: string | null;
  badLinkRepairOutcome: string | null;
  recommendation: string;
}

export interface TableBatchRouteVolatilityDiagnostic {
  generatedAt: string;
  goodRun: string;
  badRun: string;
  rows: TableBatchRouteBlockerRow[];
  summary: {
    sameStateGuardCandidates: string[];
    upstreamVolatilityRows: string[];
    pacBlockedUsefulRepairRows: string[];
    parkedRows: string[];
  };
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/table-batch-route-volatility-diagnostic.ts [--good <run-dir>] [--bad <run-dir>] [--row <id>]... [--out <dir>]';
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function linkRepairOutcome(events: ToolTimelineEvent[]): string | null {
  return events.find(event => event.toolName === 'repair_native_link_structure')?.outcome ?? null;
}

function pacRejectionCount(events: ToolTimelineEvent[]): number {
  return events.filter(event => event.pacReason).length;
}

function score(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.afterScore ?? null;
}

function reanalyzedScore(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.reanalyzedScore ?? null;
}

export function classifyTableBatchRouteBlocker(input: {
  rowId: string;
  goodRow?: RemediateBenchmarkRow | null;
  badRow?: RemediateBenchmarkRow | null;
}): TableBatchRouteBlockerRow {
  const goodEvents = input.goodRow ? toolTimeline(input.goodRow) : [];
  const badEvents = input.badRow ? toolTimeline(input.badRow) : [];
  const firstDivergence = input.goodRow && input.badRow ? firstTimelineDivergence(goodEvents, badEvents) : null;
  const goodScore = score(input.goodRow);
  const badScore = score(input.badRow);
  const goodLinkRepairOutcome = linkRepairOutcome(goodEvents);
  const badLinkRepairOutcome = linkRepairOutcome(badEvents);
  const laterLinkRecoveryBlocked = goodLinkRepairOutcome === 'applied' && badLinkRepairOutcome !== 'applied';
  const pacCount = pacRejectionCount(badEvents);
  const scoreDropped = goodScore !== null && badScore !== null && goodScore > badScore;

  let classification: TableBatchRouteBlockerClassification = 'parked_no_safe_guard';
  let recommendation = 'No safe behavior guard is proven; keep this row parked for now.';

  if (firstDivergence?.classification === 'same_state_outcome_drift' && scoreDropped) {
    classification = 'same_state_guard_candidate';
    recommendation = 'A same-state decision changed the route; a narrow guard may be considered after control coverage.';
  } else if (laterLinkRecoveryBlocked && pacCount > 0) {
    classification = 'PAC_blocked_useful_repair';
    recommendation = 'Useful later link recovery is blocked with PAC rejections present; inspect for a narrow recovery path, not a broad PAC exception.';
  } else if (firstDivergence && scoreDropped) {
    classification = 'upstream_route_volatility';
    recommendation = 'Route changed before a same-state decision point; do not add a behavior guard from this evidence.';
  }

  return {
    rowId: input.rowId,
    classification,
    goodScore,
    badScore,
    goodReanalyzedScore: reanalyzedScore(input.goodRow),
    badReanalyzedScore: reanalyzedScore(input.badRow),
    firstDivergence,
    pacRejectionCount: pacCount,
    laterLinkRecoveryBlocked,
    goodLinkRepairOutcome,
    badLinkRepairOutcome,
    recommendation,
  };
}

export function buildTableBatchRouteVolatilityDiagnostic(input: {
  goodRun: string;
  badRun: string;
  goodRows: RemediateBenchmarkRow[];
  badRows: RemediateBenchmarkRow[];
  rowIds: string[];
  generatedAt?: string;
}): TableBatchRouteVolatilityDiagnostic {
  const rows = input.rowIds.map(rowId => classifyTableBatchRouteBlocker({
    rowId,
    goodRow: input.goodRows.find(row => row.id === rowId) ?? null,
    badRow: input.badRows.find(row => row.id === rowId) ?? null,
  })).sort((a, b) => a.rowId.localeCompare(b.rowId));
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    goodRun: input.goodRun,
    badRun: input.badRun,
    rows,
    summary: {
      sameStateGuardCandidates: sorted(rows.filter(row => row.classification === 'same_state_guard_candidate').map(row => row.rowId)),
      upstreamVolatilityRows: sorted(rows.filter(row => row.classification === 'upstream_route_volatility').map(row => row.rowId)),
      pacBlockedUsefulRepairRows: sorted(rows.filter(row => row.classification === 'PAC_blocked_useful_repair').map(row => row.rowId)),
      parkedRows: sorted(rows.filter(row => row.classification === 'parked_no_safe_guard').map(row => row.rowId)),
    },
  };
}

function renderEvent(event: ToolTimelineEvent | null): string {
  if (!event) return 'none';
  return `${event.toolName}:${event.outcome}:score=${event.scoreAfter ?? 'n/a'}:state=${event.stateSignatureBefore ?? 'no-state'}:note=${event.note ?? 'none'}`;
}

export function renderTableBatchRouteVolatilityMarkdown(report: TableBatchRouteVolatilityDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Table Batch Route Volatility Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Good run: \`${report.goodRun}\``);
  lines.push(`Bad run: \`${report.badRun}\``, '');
  lines.push('## Summary', '');
  lines.push(`- Same-state guard candidates: ${report.summary.sameStateGuardCandidates.join(', ') || 'none'}`);
  lines.push(`- Upstream route volatility: ${report.summary.upstreamVolatilityRows.join(', ') || 'none'}`);
  lines.push(`- PAC-blocked useful repair rows: ${report.summary.pacBlockedUsefulRepairRows.join(', ') || 'none'}`);
  lines.push(`- Parked rows: ${report.summary.parkedRows.join(', ') || 'none'}`, '');
  for (const row of report.rows) {
    lines.push(`## ${row.rowId}`, '');
    lines.push(`- Classification: \`${row.classification}\``);
    lines.push(`- Scores: good \`${row.goodScore ?? 'n/a'}\` / reanalyzed \`${row.goodReanalyzedScore ?? 'n/a'}\`, bad \`${row.badScore ?? 'n/a'}\` / reanalyzed \`${row.badReanalyzedScore ?? 'n/a'}\``);
    lines.push(`- Link repair outcomes: good \`${row.goodLinkRepairOutcome ?? 'missing'}\`, bad \`${row.badLinkRepairOutcome ?? 'missing'}\``);
    lines.push(`- PAC rejection count in bad route: \`${row.pacRejectionCount}\``);
    lines.push(`- Later link recovery blocked: \`${row.laterLinkRecoveryBlocked ? 'yes' : 'no'}\``);
    if (row.firstDivergence) {
      lines.push(`- First divergence: \`${row.firstDivergence.reason}\` / \`${row.firstDivergence.classification}\` at index \`${row.firstDivergence.index}\``);
      lines.push(`- Good event: \`${renderEvent(row.firstDivergence.left)}\``);
      lines.push(`- Bad event: \`${renderEvent(row.firstDivergence.right)}\``);
    } else {
      lines.push('- First divergence: `none`');
    }
    lines.push(`- Recommendation: ${row.recommendation}`, '');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let goodRun = DEFAULT_GOOD;
  let badRun = DEFAULT_BAD;
  let out = DEFAULT_OUT;
  const rowIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--good') goodRun = args[++index] ?? DEFAULT_GOOD;
    else if (arg === '--bad') badRun = args[++index] ?? DEFAULT_BAD;
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else if (arg === '--row') rowIds.push(args[++index] ?? '');
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const selectedRows = rowIds.filter(Boolean).length ? sorted(rowIds.filter(Boolean)) : DEFAULT_ROWS;
  const [good, bad] = await Promise.all([
    loadBenchmarkRowsFromRunDir(goodRun),
    loadBenchmarkRowsFromRunDir(badRun),
  ]);
  const report = buildTableBatchRouteVolatilityDiagnostic({
    goodRun,
    badRun,
    goodRows: good.remediateResults,
    badRows: bad.remediateResults,
    rowIds: selectedRows,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'table-batch-route-volatility-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'table-batch-route-volatility-diagnostic.md'), renderTableBatchRouteVolatilityMarkdown(report), 'utf8');
  console.log(`Wrote table batch route volatility diagnostic to ${outDir}`);
  console.log(`Same-state guard candidates: ${report.summary.sameStateGuardCandidates.join(', ') || 'none'}`);
  console.log(`Upstream volatility rows: ${report.summary.upstreamVolatilityRows.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

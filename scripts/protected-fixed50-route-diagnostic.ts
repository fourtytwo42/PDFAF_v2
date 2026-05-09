#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
} from './pac-target-route-diagnostic.js';

const DEFAULT_REFERENCE = 'Output/experiment-corpus-baseline/run-long4516-metadata-confirm-fixed50-2026-05-09-r1';
const DEFAULT_PROTECTED = 'Output/experiment-corpus-baseline/run-goal-protected-fixed50-2026-05-09-r1';
const DEFAULT_STAGE42 = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/protected-fixed50-route-diagnostic-2026-05-09-r1';
const DEFAULT_ROWS = ['figure-4702', 'long-4470', 'long-4683', 'long-4700'];

export type ProtectedFixed50RouteClassification =
  | 'protected_route_volatility'
  | 'protected_final_reanalysis_drop'
  | 'protected_residual_low_score'
  | 'stage42_already_low'
  | 'stable_or_not_blocking'
  | 'missing_evidence';

export interface ProtectedFixed50RouteRow {
  rowId: string;
  classification: ProtectedFixed50RouteClassification;
  stage42Score: number | null;
  stage42ReanalyzedScore: number | null;
  referenceScore: number | null;
  referenceReanalyzedScore: number | null;
  protectedScore: number | null;
  protectedReanalyzedScore: number | null;
  protectedFinalDrop: number | null;
  referenceAttempts: number;
  protectedAttempts: number;
  referenceWallMs: number | null;
  protectedWallMs: number | null;
  firstReferenceToProtectedDivergence: TimelineDivergence | null;
  pacRejectedTools: string[];
  recommendation: string;
}

export interface ProtectedFixed50RouteDiagnostic {
  generatedAt: string;
  referenceRun: string;
  protectedRun: string;
  stage42Run: string;
  rows: ProtectedFixed50RouteRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/protected-fixed50-route-diagnostic.ts [options]',
    '  --reference <run-dir>',
    '  --protected <run-dir>',
    '  --stage42 <run-dir>',
    '  --rows <csv>',
    '  --out <dir>',
  ].join('\n');
}

function finalScore(row: RemediateBenchmarkRow | null): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function score(row: RemediateBenchmarkRow | null): number | null {
  return row?.afterScore ?? null;
}

function wall(row: RemediateBenchmarkRow | null): number | null {
  return typeof row?.wallRemediateMs === 'number' ? row.wallRemediateMs : null;
}

function pacRejectedTools(row: RemediateBenchmarkRow | null): string[] {
  if (!row) return [];
  const tools = new Set<string>();
  for (const event of toolTimeline(row)) {
    if (event.pacReason) tools.add(event.toolName);
  }
  return [...tools].sort((a, b) => a.localeCompare(b));
}

function rowById(rows: RemediateBenchmarkRow[], id: string): RemediateBenchmarkRow | null {
  return rows.find(row => row.id === id) ?? null;
}

function classifyRow(input: {
  rowId: string;
  stage42: RemediateBenchmarkRow | null;
  reference: RemediateBenchmarkRow | null;
  protected: RemediateBenchmarkRow | null;
}): ProtectedFixed50RouteRow {
  const stage42Score = score(input.stage42);
  const stage42Final = finalScore(input.stage42);
  const referenceScore = score(input.reference);
  const referenceFinal = finalScore(input.reference);
  const protectedScore = score(input.protected);
  const protectedFinal = finalScore(input.protected);
  const protectedFinalDrop = (
    typeof input.protected?.afterScore === 'number' &&
    typeof input.protected.reanalyzedScore === 'number'
  ) ? input.protected.afterScore - input.protected.reanalyzedScore : null;
  const divergence = input.reference && input.protected
    ? firstTimelineDivergence(toolTimeline(input.reference), toolTimeline(input.protected))
    : null;

  let classification: ProtectedFixed50RouteClassification = 'missing_evidence';
  let recommendation = 'Collect reference and protected rows before changing behavior.';
  if (input.reference && input.protected) {
    if ((protectedFinal ?? 0) >= 80) {
      classification = 'stable_or_not_blocking';
      recommendation = 'No score behavior is needed for this row in the protected run.';
    } else if (protectedFinalDrop != null && protectedFinalDrop >= 20 && (protectedScore ?? 0) >= 80) {
      classification = 'protected_final_reanalysis_drop';
      recommendation = 'Do not preserve the in-run state unless protected reanalysis evidence proves drift rather than real PDF debt.';
    } else if ((referenceFinal ?? 0) >= 80 && (protectedFinal ?? 0) < 80 && divergence) {
      classification = 'protected_route_volatility';
      recommendation = 'Compare repeat protected routes and only consider a narrow same-state guard if the divergence repeats from the same replay state.';
    } else if ((stage42Final ?? stage42Score ?? 0) < 80 && (protectedFinal ?? 0) < 80) {
      classification = 'stage42_already_low';
      recommendation = 'This row was already below B in Stage42; treat as residual debt unless it blocks the strict-grader mean.';
    } else {
      classification = 'protected_residual_low_score';
      recommendation = 'Diagnose object-level residual debt before adding behavior.';
    }
  }

  return {
    rowId: input.rowId,
    classification,
    stage42Score,
    stage42ReanalyzedScore: stage42Final,
    referenceScore,
    referenceReanalyzedScore: referenceFinal,
    protectedScore,
    protectedReanalyzedScore: protectedFinal,
    protectedFinalDrop,
    referenceAttempts: input.reference?.appliedTools?.length ?? 0,
    protectedAttempts: input.protected?.appliedTools?.length ?? 0,
    referenceWallMs: wall(input.reference),
    protectedWallMs: wall(input.protected),
    firstReferenceToProtectedDivergence: divergence,
    pacRejectedTools: pacRejectedTools(input.protected),
    recommendation,
  };
}

export function buildProtectedFixed50RouteDiagnostic(input: {
  referenceRun: string;
  protectedRun: string;
  stage42Run: string;
  referenceRows: RemediateBenchmarkRow[];
  protectedRows: RemediateBenchmarkRow[];
  stage42Rows: RemediateBenchmarkRow[];
  rowIds: string[];
  generatedAt?: string;
}): ProtectedFixed50RouteDiagnostic {
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    referenceRun: input.referenceRun,
    protectedRun: input.protectedRun,
    stage42Run: input.stage42Run,
    rows: input.rowIds.map(rowId => classifyRow({
      rowId,
      stage42: rowById(input.stage42Rows, rowId),
      reference: rowById(input.referenceRows, rowId),
      protected: rowById(input.protectedRows, rowId),
    })),
  };
}

function renderEvent(divergence: TimelineDivergence | null, side: 'left' | 'right'): string {
  const event = divergence?.[side] ?? null;
  if (!event) return 'none';
  return `${event.toolName}/${event.outcome}/${event.scoreAfter ?? 'n/a'}/${event.stateSignatureBefore ?? 'no-state'}`;
}

export function renderProtectedFixed50RouteMarkdown(report: ProtectedFixed50RouteDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Protected Fixed-50 Route Diagnostic', '');
  lines.push(`- Reference run: \`${report.referenceRun}\``);
  lines.push(`- Protected run: \`${report.protectedRun}\``);
  lines.push(`- Stage42 run: \`${report.stage42Run}\``, '');
  lines.push('| Row | Class | Stage42 | Reference | Protected | Drop | Attempts | First divergence | PAC rejected tools |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows) {
    const divergence = row.firstReferenceToProtectedDivergence;
    const divergenceText = divergence
      ? `${divergence.classification}/${divergence.reason}: ${renderEvent(divergence, 'left')} -> ${renderEvent(divergence, 'right')}`
      : 'none';
    lines.push(`| \`${row.rowId}\` | \`${row.classification}\` | ${row.stage42ReanalyzedScore ?? row.stage42Score ?? 'n/a'} | ${row.referenceReanalyzedScore ?? row.referenceScore ?? 'n/a'} | ${row.protectedReanalyzedScore ?? row.protectedScore ?? 'n/a'} | ${row.protectedFinalDrop ?? 'n/a'} | ${row.referenceAttempts}->${row.protectedAttempts} | ${divergenceText} | ${row.pacRejectedTools.map(tool => `\`${tool}\``).join(', ') || 'none'} |`);
  }
  lines.push('', '## Recommendations', '');
  for (const row of report.rows) {
    lines.push(`- \`${row.rowId}\`: ${row.recommendation}`);
  }
  return `${lines.join('\n')}\n`;
}

async function loadRows(runDir: string): Promise<RemediateBenchmarkRow[]> {
  return (await loadBenchmarkRowsFromRunDir(runDir)).remediateResults;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let referenceRun = DEFAULT_REFERENCE;
  let protectedRun = DEFAULT_PROTECTED;
  let stage42Run = DEFAULT_STAGE42;
  let outDir = DEFAULT_OUT;
  let rowIds = DEFAULT_ROWS;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--reference' && value) {
      referenceRun = value;
      index += 1;
    } else if (arg === '--protected' && value) {
      protectedRun = value;
      index += 1;
    } else if (arg === '--stage42' && value) {
      stage42Run = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else if (arg === '--rows' && value) {
      rowIds = value.split(',').map(row => row.trim()).filter(Boolean);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const [referenceRows, protectedRows, stage42Rows] = await Promise.all([
    loadRows(referenceRun),
    loadRows(protectedRun),
    loadRows(stage42Run),
  ]);
  const report = buildProtectedFixed50RouteDiagnostic({
    referenceRun,
    protectedRun,
    stage42Run,
    referenceRows,
    protectedRows,
    stage42Rows,
    rowIds,
  });
  const resolvedOut = resolve(outDir);
  await mkdir(resolvedOut, { recursive: true });
  await writeFile(join(resolvedOut, 'protected-fixed50-route-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(resolvedOut, 'protected-fixed50-route-diagnostic.md'), renderProtectedFixed50RouteMarkdown(report));
  console.log(`Wrote protected fixed-50 route diagnostic to ${resolvedOut}`);
  console.log(report.rows.map(row => `${row.rowId}:${row.classification}`).join(', '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

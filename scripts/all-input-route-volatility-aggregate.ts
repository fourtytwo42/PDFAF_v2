#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/route-volatility-aggregate-2026-05-11-r1';

export type AggregateRouteClassification =
  | 'same_state_guard_probe_needed'
  | 'upstream_route_volatility'
  | 'missing_score_moving_tool'
  | 'no_safe_route_proof'
  | 'insufficient_or_old_diagnostic';

export interface RouteDiagnosticInput {
  generatedAt?: string;
  focus: string;
  comparison?: {
    classification?: string;
    firstDivergenceIndex?: number | null;
    firstDivergenceReason?: string;
    goodOnlyScoreMovingTools?: string[];
    badOnlyScoreMovingTools?: string[];
    sharedRejectedScoreMovingStates?: string[];
    recommendation?: string;
  };
  runs?: Array<{
    label: string;
    score: number | null;
    grade: string | null;
    durationMs: number | null;
    tools?: unknown[];
  }>;
}

export interface RouteVolatilityAggregateRow {
  focus: string;
  sourcePath: string;
  bestScore: number | null;
  worstScore: number | null;
  scoreSpread: number | null;
  bestRunLabel: string | null;
  worstRunLabel: string | null;
  originalClassification: string;
  aggregateClassification: AggregateRouteClassification;
  firstDivergenceIndex: number | null;
  firstDivergenceReason: string;
  sharedRejectedScoreMovingStates: string[];
  goodOnlyScoreMovingTools: string[];
  recommendation: string;
}

export interface RouteVolatilityAggregateReport {
  generatedAt: string;
  sourceRoot: string;
  summary: {
    diagnosticCount: number;
    sameStateGuardProbeNeededCount: number;
    upstreamRouteVolatilityCount: number;
    missingScoreMovingToolCount: number;
    noSafeRouteProofCount: number;
    totalScoreSpread: number;
    topFocusRows: string[];
  };
  rows: RouteVolatilityAggregateRow[];
}

function parseArgs(argv: string[]): { root: string; out: string; diagnosticPaths: string[] } {
  let root = DEFAULT_ROOT;
  let out = DEFAULT_OUT;
  const diagnosticPaths: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--root' && next) {
      root = next;
      i += 1;
    } else if (arg === '--out' && next) {
      out = next;
      i += 1;
    } else if (arg === '--diagnostic' && next) {
      diagnosticPaths.push(next);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-route-volatility-aggregate.ts [--root <goal-output-root>] [--diagnostic <json>]... [--out <dir>]',
        '',
        `Defaults: --root ${DEFAULT_ROOT} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { root, out, diagnosticPaths };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

async function defaultDiagnosticPaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('route-recovery-')) continue;
    paths.push(join(root, entry.name, 'all-input-route-recovery-diagnostic.json'));
  }
  return paths.sort((a, b) => a.localeCompare(b));
}

async function readJson(path: string): Promise<RouteDiagnosticInput | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as RouteDiagnosticInput;
  } catch {
    return null;
  }
}

function classify(input: RouteDiagnosticInput): AggregateRouteClassification {
  const comparison = input.comparison;
  if (!comparison?.classification) return 'insufficient_or_old_diagnostic';
  if (comparison.classification === 'same_state_route_guard_candidate') {
    return 'same_state_guard_probe_needed';
  }
  if (comparison.classification === 'upstream_route_volatility') {
    return 'upstream_route_volatility';
  }
  if (comparison.classification === 'missing_score_moving_tool') {
    return 'missing_score_moving_tool';
  }
  if (comparison.classification === 'no_safe_route_proof') {
    return 'no_safe_route_proof';
  }
  return 'insufficient_or_old_diagnostic';
}

function recommendation(row: {
  aggregateClassification: AggregateRouteClassification;
  firstDivergenceIndex: number | null;
  sharedRejectedScoreMovingStates: string[];
  goodOnlyScoreMovingTools: string[];
}): string {
  if (row.aggregateClassification === 'same_state_guard_probe_needed') {
    return row.sharedRejectedScoreMovingStates.length > 0
      ? 'Run a focused probe from the shared rejected state; accept behavior only after final PAC-safe reanalysis and repeat validation.'
      : 'Inspect same-state evidence manually before behavior; current aggregate lacks a concrete rejected state.';
  }
  if (row.aggregateClassification === 'upstream_route_volatility') {
    return row.firstDivergenceIndex === 0
      ? 'Do not add a route guard; divergence starts at initial analyzer/replay state. Needs analyzer determinism or transaction design.'
      : 'Do not patch narrowly yet; route diverges before the score-moving sequence.';
  }
  if (row.aggregateClassification === 'missing_score_moving_tool') {
    return row.goodOnlyScoreMovingTools.length > 0
      ? 'Inspect planner/admission scheduling for the missing score-moving tool sequence.'
      : 'Collect richer tool traces before behavior.';
  }
  if (row.aggregateClassification === 'no_safe_route_proof') {
    return 'Park for now or collect object-level evidence; no safe behavior candidate is visible.';
  }
  return 'Regenerate route diagnostic with replay-state tool details.';
}

export function summarizeRouteVolatilityDiagnostic(input: RouteDiagnosticInput, sourcePath = ''): RouteVolatilityAggregateRow {
  const runs = input.runs ?? [];
  const sorted = [...runs].sort((a, b) => (numberOrNull(b.score) ?? -1) - (numberOrNull(a.score) ?? -1));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const bestScore = numberOrNull(best?.score);
  const worstScore = numberOrNull(worst?.score);
  const aggregateClassification = classify(input);
  const row = {
    focus: stringOrFallback(input.focus, '(unknown)'),
    sourcePath,
    bestScore,
    worstScore,
    scoreSpread: bestScore != null && worstScore != null ? bestScore - worstScore : null,
    bestRunLabel: typeof best?.label === 'string' ? best.label : null,
    worstRunLabel: typeof worst?.label === 'string' ? worst.label : null,
    originalClassification: stringOrFallback(input.comparison?.classification, 'missing'),
    aggregateClassification,
    firstDivergenceIndex: numberOrNull(input.comparison?.firstDivergenceIndex),
    firstDivergenceReason: stringOrFallback(input.comparison?.firstDivergenceReason, 'n/a'),
    sharedRejectedScoreMovingStates: input.comparison?.sharedRejectedScoreMovingStates ?? [],
    goodOnlyScoreMovingTools: input.comparison?.goodOnlyScoreMovingTools ?? [],
    recommendation: '',
  };
  return {
    ...row,
    recommendation: recommendation(row),
  };
}

export async function buildRouteVolatilityAggregateReport(input: {
  sourceRoot: string;
  diagnosticPaths: string[];
  generatedAt?: string;
}): Promise<RouteVolatilityAggregateReport> {
  const rows: RouteVolatilityAggregateRow[] = [];
  for (const path of input.diagnosticPaths) {
    const diagnostic = await readJson(path);
    if (!diagnostic) continue;
    rows.push(summarizeRouteVolatilityDiagnostic(diagnostic, path));
  }
  rows.sort((a, b) => {
    const classOrder = [
      'same_state_guard_probe_needed',
      'missing_score_moving_tool',
      'upstream_route_volatility',
      'no_safe_route_proof',
      'insufficient_or_old_diagnostic',
    ];
    const byClass = classOrder.indexOf(a.aggregateClassification) - classOrder.indexOf(b.aggregateClassification);
    if (byClass !== 0) return byClass;
    return (b.scoreSpread ?? -1) - (a.scoreSpread ?? -1) || a.focus.localeCompare(b.focus);
  });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceRoot: input.sourceRoot,
    summary: {
      diagnosticCount: rows.length,
      sameStateGuardProbeNeededCount: rows.filter(row => row.aggregateClassification === 'same_state_guard_probe_needed').length,
      upstreamRouteVolatilityCount: rows.filter(row => row.aggregateClassification === 'upstream_route_volatility').length,
      missingScoreMovingToolCount: rows.filter(row => row.aggregateClassification === 'missing_score_moving_tool').length,
      noSafeRouteProofCount: rows.filter(row => row.aggregateClassification === 'no_safe_route_proof').length,
      totalScoreSpread: rows.reduce((sum, row) => sum + (row.scoreSpread ?? 0), 0),
      topFocusRows: rows.slice(0, 8).map(row => row.focus),
    },
    rows,
  };
}

function renderMarkdown(report: RouteVolatilityAggregateReport): string {
  const lines: string[] = [];
  lines.push('# All-Input Route Volatility Aggregate');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Source root: \`${report.sourceRoot}\``);
  lines.push(`- Diagnostics: ${report.summary.diagnosticCount}`);
  lines.push(`- Same-state guard probes needed: ${report.summary.sameStateGuardProbeNeededCount}`);
  lines.push(`- Upstream route volatility: ${report.summary.upstreamRouteVolatilityCount}`);
  lines.push(`- Missing score-moving tool: ${report.summary.missingScoreMovingToolCount}`);
  lines.push(`- No safe route proof: ${report.summary.noSafeRouteProofCount}`);
  lines.push(`- Total observed score spread: ${report.summary.totalScoreSpread}`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Focus | Best | Worst | Spread | Class | First divergence | Shared rejected states | Recommendation |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push([
      `\`${row.focus}\``,
      row.bestScore ?? 'n/a',
      row.worstScore ?? 'n/a',
      row.scoreSpread ?? 'n/a',
      `\`${row.aggregateClassification}\``,
      row.firstDivergenceReason.replaceAll('|', '\\|'),
      row.sharedRejectedScoreMovingStates.length ? row.sharedRejectedScoreMovingStates.map(item => `\`${item}\``).join('<br>') : 'none',
      row.recommendation,
    ].join(' | '));
  }
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  if (report.summary.sameStateGuardProbeNeededCount > 0) {
    lines.push('Probe only the same-state rows listed above. A behavior change is justified only if a focused run can replay the shared rejected state into a final PAC-safe score/category improvement.');
  } else {
    lines.push('No same-state behavior candidate is visible. Continue with analyzer/route determinism or object-level fixer diagnostics rather than route guards.');
  }
  lines.push('');
  lines.push('Do not use this report to weaken PAC gates, lower score strictness, or count volatile one-off routes as mean-goal completion evidence.');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const diagnosticPaths = args.diagnosticPaths.length ? args.diagnosticPaths : await defaultDiagnosticPaths(args.root);
  const report = await buildRouteVolatilityAggregateReport({
    sourceRoot: args.root,
    diagnosticPaths,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'route-volatility-aggregate.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'route-volatility-aggregate.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'route-volatility-aggregate.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

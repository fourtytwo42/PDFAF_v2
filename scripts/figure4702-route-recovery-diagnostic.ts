#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { CategoryKey } from '../src/types.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
  type ToolTimelineEvent,
} from './pac-target-route-diagnostic.js';

const DEFAULT_GOOD = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STRICT = 'Output/experiment-corpus-baseline/run-pac-strict-grader-fixed50-2026-05-08-r1';
const DEFAULT_CURRENT = 'Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/figure4702-route-recovery-diagnostic-2026-05-08-r1';
const DEFAULT_ROW = 'figure-4702';
const PAC_REASON_RE = /pac_rule_regressed\(([^)]+)\)/;
const STRUCTURE_RECOVERY_TOOLS = new Set([
  'synthesize_basic_structure_from_layout',
  'repair_structure_conformance',
  'remap_orphan_mcids_as_artifacts',
]);

export type Figure4702RouteClassification =
  | 'pac_blocked_structure_recovery_candidate'
  | 'scheduling_or_admission_drift'
  | 'same_state_route_drift'
  | 'upstream_route_volatility'
  | 'same_low_route'
  | 'missing_evidence';

export interface Figure4702ToolSummary {
  index: number;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  note: string | null;
  pacRuleIds: string[];
  categoryScoresBefore: Partial<Record<CategoryKey, number>>;
  categoryScoresAfter: Partial<Record<CategoryKey, number>>;
}

export interface Figure4702RouteDiagnostic {
  generatedAt: string;
  rowId: string;
  goodRun: string;
  strictRun: string;
  currentRun: string;
  classification: Figure4702RouteClassification;
  recommendation: string;
  goodScore: number | null;
  strictScore: number | null;
  currentScore: number | null;
  goodReanalyzedScore: number | null;
  strictReanalyzedScore: number | null;
  currentReanalyzedScore: number | null;
  firstGoodToCurrentDivergence: TimelineDivergence | null;
  firstStrictToCurrentDivergence: TimelineDivergence | null;
  missingGoodToolsInCurrent: string[];
  pacBlockedToolNames: string[];
  pacBlockedRuleIds: string[];
  bestBlockedScoreAfter: number | null;
  bestBlockedHeadingAfter: number | null;
  currentStructureRecoveryTimeline: Figure4702ToolSummary[];
  goodTimeline: Figure4702ToolSummary[];
  currentTimeline: Figure4702ToolSummary[];
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/figure4702-route-recovery-diagnostic.ts [--good <run-dir>] [--strict <run-dir>] [--current <run-dir>] [--row <id>] [--out <dir>]';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pacRuleIdsFromTool(row: RemediateBenchmarkRow, event: ToolTimelineEvent): string[] {
  const ids = new Set<string>();
  if (event.pacReason) {
    const match = event.pacReason.match(PAC_REASON_RE);
    if (match?.[1]) ids.add(match[1]);
  }
  const details = parseDetails(row.appliedTools[event.index]?.details);
  const regression = asRecord(details?.['pacRuleRegression']);
  const single = stringOrNull(regression?.['ruleId']);
  if (single) ids.add(single);
  const regressions = Array.isArray(details?.['pacRuleRegressions']) ? details?.['pacRuleRegressions'] : [];
  for (const item of regressions) {
    const id = stringOrNull(asRecord(item)?.['ruleId']);
    if (id) ids.add(id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function replayStateFromTool(row: RemediateBenchmarkRow, index: number): Record<string, unknown> | null {
  const details = parseDetails(row.appliedTools[index]?.details);
  const debug = asRecord(details?.['debug']);
  return asRecord(debug?.['replayState']);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryMap(value: unknown): Partial<Record<CategoryKey, number>> {
  const record = asRecord(value);
  const out: Partial<Record<CategoryKey, number>> = {};
  if (!record) return out;
  for (const [key, score] of Object.entries(record)) {
    if (typeof score === 'number') out[key as CategoryKey] = score;
  }
  return out;
}

function preferCategoryMap(
  replayValue: unknown,
  fallback: Partial<Record<CategoryKey, number>>,
): Partial<Record<CategoryKey, number>> {
  const mapped = categoryMap(replayValue);
  return Object.keys(mapped).length > 0 ? mapped : fallback;
}

function summarizeTimeline(row: RemediateBenchmarkRow | null | undefined): Figure4702ToolSummary[] {
  if (!row) return [];
  return toolTimeline(row).map(event => {
    const replayState = replayStateFromTool(row, event.index);
    return {
      index: event.index,
      toolName: event.toolName,
      outcome: event.outcome,
      scoreBefore: numberOrNull(replayState?.['scoreBefore']) ?? event.scoreBefore,
      scoreAfter: numberOrNull(replayState?.['scoreAfter']) ?? event.scoreAfter,
      stateSignatureBefore: event.stateSignatureBefore,
      stateSignatureAfter: event.stateSignatureAfter,
      note: event.note,
      pacRuleIds: pacRuleIdsFromTool(row, event),
      categoryScoresBefore: preferCategoryMap(replayState?.['categoryScoresBefore'], event.categoryScoresBefore),
      categoryScoresAfter: preferCategoryMap(replayState?.['categoryScoresAfter'], event.categoryScoresAfter),
    };
  });
}

function score(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.afterScore ?? null;
}

function reanalyzedScore(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.reanalyzedScore ?? null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function missingGoodTools(good: Figure4702ToolSummary[], current: Figure4702ToolSummary[]): string[] {
  const currentTools = new Set(current.map(row => row.toolName));
  return uniqueSorted(good.filter(row => row.outcome === 'applied' && !currentTools.has(row.toolName)).map(row => row.toolName));
}

function bestBlocked(events: Figure4702ToolSummary[]): Figure4702ToolSummary | null {
  const candidates = events.filter(row => (
    STRUCTURE_RECOVERY_TOOLS.has(row.toolName) &&
    row.outcome === 'rejected' &&
    row.pacRuleIds.length > 0 &&
    row.scoreAfter != null &&
    row.scoreBefore != null &&
    row.scoreAfter > row.scoreBefore
  ));
  return candidates.sort((a, b) => (b.scoreAfter ?? 0) - (a.scoreAfter ?? 0))[0] ?? null;
}

export function buildFigure4702RouteDiagnostic(input: {
  rowId: string;
  goodRun: string;
  strictRun: string;
  currentRun: string;
  goodRow?: RemediateBenchmarkRow | null;
  strictRow?: RemediateBenchmarkRow | null;
  currentRow?: RemediateBenchmarkRow | null;
  generatedAt?: string;
}): Figure4702RouteDiagnostic {
  const goodRow = input.goodRow ?? null;
  const strictRow = input.strictRow ?? null;
  const currentRow = input.currentRow ?? null;
  const goodTimeline = summarizeTimeline(goodRow);
  const strictTimeline = summarizeTimeline(strictRow);
  const currentTimeline = summarizeTimeline(currentRow);
  const currentStructureRecoveryTimeline = currentTimeline.filter(row => (
    STRUCTURE_RECOVERY_TOOLS.has(row.toolName) || row.pacRuleIds.length > 0
  ));
  const firstGoodToCurrentDivergence = goodRow && currentRow
    ? firstTimelineDivergence(toolTimeline(goodRow), toolTimeline(currentRow))
    : null;
  const firstStrictToCurrentDivergence = strictRow && currentRow
    ? firstTimelineDivergence(toolTimeline(strictRow), toolTimeline(currentRow))
    : null;
  const blocked = bestBlocked(currentTimeline);
  const pacBlockedRuleIds = uniqueSorted(currentTimeline.flatMap(row => row.pacRuleIds));
  const pacBlockedToolNames = uniqueSorted(currentTimeline
    .filter(row => row.outcome === 'rejected' && row.pacRuleIds.length > 0)
    .map(row => row.toolName));
  const missingGoodToolsInCurrent = missingGoodTools(goodTimeline, currentTimeline);

  let classification: Figure4702RouteClassification = 'same_low_route';
  let recommendation = 'No route recovery behavior is proven by these artifacts.';
  if (!goodRow || !strictRow || !currentRow) {
    classification = 'missing_evidence';
    recommendation = 'Collect Stage 42, strict baseline, and current rows before changing behavior.';
  } else if (blocked) {
    classification = 'pac_blocked_structure_recovery_candidate';
    recommendation = 'Current route has a score-moving structure recovery rejected by PAC annotation/orphan debt. Do not change behavior yet; a later stage would need a narrow repair-sequencing proof that the annotation debt is fixed without page/text/tag or harmful PAC regressions.';
  } else if (missingGoodToolsInCurrent.length > 0) {
    classification = 'scheduling_or_admission_drift';
    recommendation = 'The good route contains applied tools missing from the current route; inspect planner admission before changing acceptance behavior.';
  } else if (firstGoodToCurrentDivergence?.classification === 'same_state_outcome_drift') {
    classification = 'same_state_route_drift';
    recommendation = 'A same-state route decision changed; a narrow guard may be considered only with control coverage.';
  } else if (firstGoodToCurrentDivergence) {
    classification = 'upstream_route_volatility';
    recommendation = 'The route diverges before a same-state proof; park the row unless repeat diagnostics produce a stable decision point.';
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    rowId: input.rowId,
    goodRun: input.goodRun,
    strictRun: input.strictRun,
    currentRun: input.currentRun,
    classification,
    recommendation,
    goodScore: score(goodRow),
    strictScore: score(strictRow),
    currentScore: score(currentRow),
    goodReanalyzedScore: reanalyzedScore(goodRow),
    strictReanalyzedScore: reanalyzedScore(strictRow),
    currentReanalyzedScore: reanalyzedScore(currentRow),
    firstGoodToCurrentDivergence,
    firstStrictToCurrentDivergence,
    missingGoodToolsInCurrent,
    pacBlockedToolNames,
    pacBlockedRuleIds,
    bestBlockedScoreAfter: blocked?.scoreAfter ?? null,
    bestBlockedHeadingAfter: blocked?.categoryScoresAfter.heading_structure ?? null,
    currentStructureRecoveryTimeline,
    goodTimeline,
    currentTimeline,
  };
}

function renderEvent(event: TimelineDivergence['left']): string {
  if (!event) return 'none';
  return `${event.toolName}/${event.outcome}: ${event.scoreBefore ?? 'n/a'} -> ${event.scoreAfter ?? 'n/a'}; state=${event.stateSignatureBefore ?? 'no-state'}; note=${event.note ?? 'none'}`;
}

function renderTimeline(rows: Figure4702ToolSummary[]): string[] {
  if (rows.length === 0) return ['- none'];
  return rows.map(row => (
    `- ${row.index}. \`${row.toolName}/${row.outcome}\` score \`${row.scoreBefore ?? 'n/a'} -> ${row.scoreAfter ?? 'n/a'}\`; state \`${row.stateSignatureBefore ?? 'no-state'}\`; PAC \`${row.pacRuleIds.join(', ') || 'none'}\`; note \`${row.note ?? 'none'}\``
  ));
}

export function renderFigure4702RouteDiagnosticMarkdown(report: Figure4702RouteDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Figure-4702 Route Recovery Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Row: \`${report.rowId}\``);
  lines.push(`Good run: \`${report.goodRun}\``);
  lines.push(`Strict run: \`${report.strictRun}\``);
  lines.push(`Current run: \`${report.currentRun}\``, '');
  lines.push('## Summary', '');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Scores: good \`${report.goodScore ?? 'n/a'}\` / reanalyzed \`${report.goodReanalyzedScore ?? 'n/a'}\`; strict \`${report.strictScore ?? 'n/a'}\` / reanalyzed \`${report.strictReanalyzedScore ?? 'n/a'}\`; current \`${report.currentScore ?? 'n/a'}\` / reanalyzed \`${report.currentReanalyzedScore ?? 'n/a'}\``);
  lines.push(`- Missing applied good-route tools in current: ${report.missingGoodToolsInCurrent.map(item => `\`${item}\``).join(', ') || 'none'}`);
  lines.push(`- PAC-blocked tools in current: ${report.pacBlockedToolNames.map(item => `\`${item}\``).join(', ') || 'none'}`);
  lines.push(`- PAC-blocked rules in current: ${report.pacBlockedRuleIds.map(item => `\`${item}\``).join(', ') || 'none'}`);
  lines.push(`- Best blocked score after: \`${report.bestBlockedScoreAfter ?? 'n/a'}\`; heading after: \`${report.bestBlockedHeadingAfter ?? 'n/a'}\``);
  lines.push(`- Recommendation: ${report.recommendation}`, '');
  lines.push('## First Divergence: Stage42 Good vs Current', '');
  if (report.firstGoodToCurrentDivergence) {
    lines.push(`- Reason: \`${report.firstGoodToCurrentDivergence.reason}\`; classification: \`${report.firstGoodToCurrentDivergence.classification}\`; index: \`${report.firstGoodToCurrentDivergence.index}\``);
    lines.push(`- Good event: \`${renderEvent(report.firstGoodToCurrentDivergence.left)}\``);
    lines.push(`- Current event: \`${renderEvent(report.firstGoodToCurrentDivergence.right)}\``);
  } else {
    lines.push('- none');
  }
  lines.push('', '## Current PAC/Structure Recovery Timeline', '');
  lines.push(...renderTimeline(report.currentStructureRecoveryTimeline));
  lines.push('', '## Stage42 Good Timeline', '');
  lines.push(...renderTimeline(report.goodTimeline));
  lines.push('', '## Current Timeline', '');
  lines.push(...renderTimeline(report.currentTimeline));
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let goodRun = DEFAULT_GOOD;
  let strictRun = DEFAULT_STRICT;
  let currentRun = DEFAULT_CURRENT;
  let out = DEFAULT_OUT;
  let rowId = DEFAULT_ROW;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--good') goodRun = args[++index] ?? DEFAULT_GOOD;
    else if (arg === '--strict') strictRun = args[++index] ?? DEFAULT_STRICT;
    else if (arg === '--current') currentRun = args[++index] ?? DEFAULT_CURRENT;
    else if (arg === '--row') rowId = args[++index] ?? DEFAULT_ROW;
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const [good, strict, current] = await Promise.all([
    loadBenchmarkRowsFromRunDir(goodRun),
    loadBenchmarkRowsFromRunDir(strictRun),
    loadBenchmarkRowsFromRunDir(currentRun),
  ]);
  const report = buildFigure4702RouteDiagnostic({
    rowId,
    goodRun,
    strictRun,
    currentRun,
    goodRow: good.remediateResults.find(row => row.id === rowId) ?? null,
    strictRow: strict.remediateResults.find(row => row.id === rowId) ?? null,
    currentRow: current.remediateResults.find(row => row.id === rowId) ?? null,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'figure4702-route-recovery-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'figure4702-route-recovery-diagnostic.md'), renderFigure4702RouteDiagnosticMarkdown(report), 'utf8');
  console.log(`Wrote figure-4702 route recovery diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
  console.log(`PAC-blocked tools: ${report.pacBlockedToolNames.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

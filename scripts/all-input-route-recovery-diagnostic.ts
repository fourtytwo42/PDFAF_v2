#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/all-input-route-recovery-diagnostic-2026-05-10-r1';

export interface RouteRunInput {
  label: string;
  reportPath: string;
}

export interface RouteToolEvent {
  index: number;
  stage: number | null;
  round: number | null;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number;
  replayStateBefore: string | null;
  replayStateAfter: string | null;
  rawReason: string | null;
}

export interface RouteRunSummary {
  label: string;
  reportPath: string;
  file: string;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  categoryAfter: Array<{ key: string; score: number; applicable: boolean }>;
  tools: RouteToolEvent[];
}

export type RouteRecoveryClassification =
  | 'same_state_route_guard_candidate'
  | 'upstream_route_volatility'
  | 'missing_score_moving_tool'
  | 'no_safe_route_proof';

export interface RouteRecoveryDiagnostic {
  generatedAt: string;
  focus: string;
  runs: RouteRunSummary[];
  comparison: {
    classification: RouteRecoveryClassification;
    firstDivergenceIndex: number | null;
    firstDivergenceReason: string;
    goodOnlyScoreMovingTools: string[];
    badOnlyScoreMovingTools: string[];
    sharedRejectedScoreMovingStates: string[];
    recommendation: string;
  };
}

interface BaselineReportRow {
  file: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  categoryGap?: {
    after?: Array<{ key: string; score: number; applicable: boolean }>;
  };
  appliedTools?: Array<{
    stage?: number;
    round?: number;
    toolName?: string;
    outcome?: string;
    scoreBefore?: number;
    scoreAfter?: number;
    delta?: number;
    details?: string;
  }>;
}

function parseArgs(argv: string[]): { focus: string; runs: RouteRunInput[]; out: string } {
  let focus = '';
  let out = DEFAULT_OUT;
  const runs: RouteRunInput[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--focus' && next) {
      focus = next;
      i++;
    } else if (arg === '--run' && next) {
      const split = next.indexOf('=');
      if (split <= 0) throw new Error(`Invalid --run ${next}; expected label=baseline_report.json`);
      runs.push({ label: next.slice(0, split), reportPath: next.slice(split + 1) });
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-route-recovery-diagnostic.ts --focus <substring> --run good=<baseline_report.json> --run bad=<baseline_report.json> [--out <dir>]',
      ].join('\n'));
      process.exit(0);
    }
  }
  if (!focus) throw new Error('--focus is required');
  if (runs.length < 2) throw new Error('at least two --run entries are required');
  return { focus, runs, out };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string') return null;
  try {
    return asRecord(JSON.parse(details));
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function replay(details: unknown): { before: string | null; after: string | null; rawReason: string | null } {
  const parsed = parseDetails(details);
  const debug = asRecord(parsed?.debug);
  const replayState = asRecord(debug?.replayState);
  return {
    before: stringOrNull(replayState?.stateSignatureBefore),
    after: stringOrNull(replayState?.stateSignatureAfter),
    rawReason: stringOrNull(parsed?.raw) ?? stringOrNull(parsed?.note) ?? stringOrNull(parsed?.outcome),
  };
}

function toToolEvents(row: BaselineReportRow): RouteToolEvent[] {
  return (row.appliedTools ?? []).map((tool, index) => {
    const replayInfo = replay(tool.details);
    const scoreBefore = numberOrNull(tool.scoreBefore);
    const scoreAfter = numberOrNull(tool.scoreAfter);
    return {
      index,
      stage: numberOrNull(tool.stage),
      round: numberOrNull(tool.round),
      toolName: String(tool.toolName ?? ''),
      outcome: String(tool.outcome ?? ''),
      scoreBefore,
      scoreAfter,
      delta: typeof tool.delta === 'number' ? tool.delta : (scoreAfter ?? 0) - (scoreBefore ?? 0),
      replayStateBefore: replayInfo.before,
      replayStateAfter: replayInfo.after,
      rawReason: replayInfo.rawReason,
    };
  });
}

async function loadRun(run: RouteRunInput, focus: string): Promise<RouteRunSummary> {
  const parsed = JSON.parse(await readFile(run.reportPath, 'utf8')) as { rows?: BaselineReportRow[] };
  const row = (parsed.rows ?? []).find(item => item.file.includes(focus) || basename(item.file).includes(focus));
  if (!row) throw new Error(`Could not find focus ${focus} in ${run.reportPath}`);
  return {
    label: run.label,
    reportPath: run.reportPath,
    file: row.file,
    score: numberOrNull(row.afterScore),
    grade: stringOrNull(row.afterGrade),
    durationMs: numberOrNull(row.durationMs),
    categoryAfter: row.categoryGap?.after ?? [],
    tools: toToolEvents(row),
  };
}

function scoreMoving(events: RouteToolEvent[]): RouteToolEvent[] {
  return events.filter(event => (event.scoreAfter ?? 0) > (event.scoreBefore ?? 0) && event.outcome === 'applied');
}

function toolKey(event: RouteToolEvent): string {
  return `${event.toolName}@${event.replayStateBefore ?? 'no-state'}:${event.scoreBefore}->${event.scoreAfter}`;
}

function compareRuns(good: RouteRunSummary, bad: RouteRunSummary): RouteRecoveryDiagnostic['comparison'] {
  let firstDivergenceIndex: number | null = null;
  let firstDivergenceReason = 'No divergent tool event found.';
  const limit = Math.max(good.tools.length, bad.tools.length);
  for (let i = 0; i < limit; i++) {
    const a = good.tools[i];
    const b = bad.tools[i];
    if (!a || !b) {
      firstDivergenceIndex = i;
      firstDivergenceReason = `${!a ? good.label : bad.label} route ended before the other run.`;
      break;
    }
    if (a.toolName !== b.toolName || a.outcome !== b.outcome || a.replayStateBefore !== b.replayStateBefore || a.scoreAfter !== b.scoreAfter) {
      firstDivergenceIndex = i;
      firstDivergenceReason = `${good.label} ${a.toolName}/${a.outcome}/${a.scoreBefore}->${a.scoreAfter} state ${a.replayStateBefore ?? 'none'} vs ${bad.label} ${b.toolName}/${b.outcome}/${b.scoreBefore}->${b.scoreAfter} state ${b.replayStateBefore ?? 'none'}.`;
      break;
    }
  }

  const goodMoving = scoreMoving(good.tools);
  const badMoving = scoreMoving(bad.tools);
  const badKeys = new Set(badMoving.map(toolKey));
  const goodKeys = new Set(goodMoving.map(toolKey));
  const goodOnly = goodMoving.filter(event => !badKeys.has(toolKey(event))).map(toolKey);
  const badOnly = badMoving.filter(event => !goodKeys.has(toolKey(event))).map(toolKey);
  const badRejectedByStateAndTool = new Set<string>();
  for (const event of bad.tools) {
    if (event.outcome === 'rejected' && event.replayStateBefore) {
      badRejectedByStateAndTool.add(`${event.toolName}@${event.replayStateBefore}`);
    }
  }
  const sharedRejectedScoreMovingStates = goodMoving
    .filter(event => event.replayStateBefore && badRejectedByStateAndTool.has(`${event.toolName}@${event.replayStateBefore}`))
    .map(event => `${event.toolName}@${event.replayStateBefore}`);

  let classification: RouteRecoveryClassification = 'no_safe_route_proof';
  let recommendation = 'Do not add behavior; collect more route evidence.';
  if (sharedRejectedScoreMovingStates.length > 0) {
    classification = 'same_state_route_guard_candidate';
    recommendation = 'Inspect the shared rejected state for a row/tool-specific recovery guard with final PAC-safe reanalysis.';
  } else if (goodOnly.length > 0 && firstDivergenceReason.includes('state')) {
    classification = 'upstream_route_volatility';
    recommendation = 'Do not patch yet; route diverges before the score-moving tool from a different state.';
  } else if (goodOnly.length > 0) {
    classification = 'missing_score_moving_tool';
    recommendation = 'Investigate planner/admission scheduling for the missing score-moving tool sequence.';
  }

  return {
    classification,
    firstDivergenceIndex,
    firstDivergenceReason,
    goodOnlyScoreMovingTools: goodOnly,
    badOnlyScoreMovingTools: badOnly,
    sharedRejectedScoreMovingStates,
    recommendation,
  };
}

export async function buildAllInputRouteRecoveryDiagnostic(input: {
  focus: string;
  runs: RouteRunInput[];
  generatedAt?: string;
}): Promise<RouteRecoveryDiagnostic> {
  const runs = await Promise.all(input.runs.map(run => loadRun(run, input.focus)));
  const sorted = [...runs].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    focus: input.focus,
    runs,
    comparison: compareRuns(sorted[0]!, sorted[sorted.length - 1]!),
  };
}

function renderMarkdown(report: RouteRecoveryDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Route Recovery Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Focus: \`${report.focus}\``);
  lines.push(`- Classification: \`${report.comparison.classification}\``);
  lines.push(`- Recommendation: ${report.comparison.recommendation}`);
  lines.push('');
  lines.push('## Runs');
  lines.push('');
  lines.push('| Run | Score | Grade | Duration | Tools | Report |');
  lines.push('| --- | ---: | --- | ---: | ---: | --- |');
  for (const run of report.runs) {
    lines.push(`| ${run.label} | ${run.score ?? ''} | ${run.grade ?? ''} | ${run.durationMs ?? ''} | ${run.tools.length} | \`${run.reportPath}\` |`);
  }
  lines.push('');
  lines.push('## Divergence');
  lines.push('');
  lines.push(`- First divergence index: ${report.comparison.firstDivergenceIndex ?? 'none'}`);
  lines.push(`- First divergence: ${report.comparison.firstDivergenceReason}`);
  lines.push(`- Good-only score-moving tools: ${report.comparison.goodOnlyScoreMovingTools.map(item => `\`${item}\``).join(', ') || 'none'}`);
  lines.push(`- Bad-only score-moving tools: ${report.comparison.badOnlyScoreMovingTools.map(item => `\`${item}\``).join(', ') || 'none'}`);
  lines.push(`- Shared rejected score-moving states: ${report.comparison.sharedRejectedScoreMovingStates.map(item => `\`${item}\``).join(', ') || 'none'}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildAllInputRouteRecoveryDiagnostic({
    focus: args.focus,
    runs: args.runs,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'all-input-route-recovery-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'all-input-route-recovery-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'all-input-route-recovery-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

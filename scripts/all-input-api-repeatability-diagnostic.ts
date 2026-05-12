#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/api-repeatability-diagnostic-2026-05-12-r1';

export interface ApiRepeatRunInput {
  label: string;
  dir: string;
}

export interface ApiRepeatToolEvent {
  index: number;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  stage: number | null;
  replayStateBefore: string | null;
  replayStateAfter: string | null;
  reason: string | null;
}

export interface ApiRepeatRowRun {
  label: string;
  jsonPath: string | null;
  sourceSummaryPath: string | null;
  apiScore: number | null;
  apiGrade: string | null;
  sourceScore: number | null;
  sourceGrade: string | null;
  gain: number;
  tools: ApiRepeatToolEvent[];
}

export type ApiRepeatClassification =
  | 'repeat_supported_recovery'
  | 'same_state_guard_candidate'
  | 'upstream_route_volatility'
  | 'headline_only_not_source_counted'
  | 'no_recovery_observed'
  | 'missing_run_data';

export interface ApiRepeatRowDiagnostic {
  id: string;
  currentScore: number | null;
  currentGrade: string | null;
  classification: ApiRepeatClassification;
  bestSourceGain: number;
  repeatSupportedGain: number;
  highRunLabels: string[];
  lowRunLabels: string[];
  firstDivergence: string;
  sharedRejectedScoreMovingStates: string[];
  recommendation: string;
  runs: ApiRepeatRowRun[];
}

export interface ApiRepeatabilityDiagnostic {
  generatedAt: string;
  ids: string[];
  runs: ApiRepeatRunInput[];
  rows: ApiRepeatRowDiagnostic[];
  summary: {
    repeatSupportedGain: number;
    bestObservedGain: number;
    classifications: Record<string, number>;
  };
}

interface CliArgs {
  ids: string[];
  baselineRoot: string;
  runs: ApiRepeatRunInput[];
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  let ids: string[] = [];
  let baselineRoot = '';
  let out = DEFAULT_OUT;
  const runs: ApiRepeatRunInput[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--ids' && next) {
      ids = next.split(',').map(item => item.trim()).filter(Boolean);
      i++;
    } else if (arg === '--baseline-root' && next) {
      baselineRoot = next;
      i++;
    } else if (arg === '--run' && next) {
      const split = next.indexOf('=');
      if (split <= 0) throw new Error(`Invalid --run ${next}; expected label=dir`);
      runs.push({ label: next.slice(0, split), dir: next.slice(split + 1) });
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-api-repeatability-diagnostic.ts --ids 0075,0208 --baseline-root <r18-merged-root> --run first=<dir> --run repeat=<dir> [--out <dir>]',
      ].join('\n'));
      process.exit(0);
    }
  }
  if (ids.length === 0) throw new Error('--ids is required');
  if (!baselineRoot) throw new Error('--baseline-root is required');
  if (runs.length === 0) throw new Error('at least one --run is required');
  return { ids, baselineRoot, runs, out };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string') return null;
  try {
    return asRecord(JSON.parse(details));
  } catch {
    return null;
  }
}

function toolEvents(payload: Record<string, unknown>): ApiRepeatToolEvent[] {
  const appliedTools = Array.isArray(payload.appliedTools) ? payload.appliedTools : [];
  return appliedTools.map((raw, index) => {
    const tool = asRecord(raw) ?? {};
    const parsed = parseDetails(tool.details);
    const replay = asRecord(asRecord(parsed?.debug)?.replayState);
    const scoreBefore = numberOrNull(tool.scoreBefore);
    const scoreAfter = numberOrNull(tool.scoreAfter);
    return {
      index,
      toolName: String(tool.toolName ?? ''),
      outcome: String(tool.outcome ?? ''),
      scoreBefore,
      scoreAfter,
      stage: numberOrNull(tool.stage),
      replayStateBefore: stringOrNull(replay?.stateSignatureBefore),
      replayStateAfter: stringOrNull(replay?.stateSignatureAfter),
      reason: stringOrNull(parsed?.raw) ?? stringOrNull(parsed?.note) ?? stringOrNull(parsed?.outcome),
    };
  });
}

function firstScoreMovingTool(run: ApiRepeatRowRun): ApiRepeatToolEvent | null {
  return run.tools.find(tool => tool.outcome === 'applied' && (tool.scoreAfter ?? 0) > (tool.scoreBefore ?? 0)) ?? null;
}

function scoreMovingTools(run: ApiRepeatRowRun): ApiRepeatToolEvent[] {
  return run.tools.filter(tool => tool.outcome === 'applied' && (tool.scoreAfter ?? 0) > (tool.scoreBefore ?? 0));
}

function toolStateKey(tool: ApiRepeatToolEvent): string {
  return `${tool.toolName}@${tool.replayStateBefore ?? 'no-state'}`;
}

async function readJsonIfExists(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadBaselineRows(root: string): Promise<Map<string, { score: number | null; grade: string | null; file: string }>> {
  const { readdir } = await import('node:fs/promises');
  const rows = new Map<string, { score: number | null; grade: string | null; file: string }>();
  for (const shard of (await readdir(root)).filter(name => name.startsWith('shard-')).sort()) {
    const report = JSON.parse(await readFile(join(root, shard, 'baseline_report.json'), 'utf8')) as { rows?: Array<Record<string, unknown>> };
    for (const row of report.rows ?? []) {
      const file = String(row.file ?? '');
      const id = basename(file).slice(0, 4);
      rows.set(id, {
        score: numberOrNull(row.afterScore),
        grade: stringOrNull(row.afterGrade),
        file,
      });
    }
  }
  return rows;
}

async function loadSourceSummary(dir: string): Promise<Map<string, Record<string, unknown>>> {
  const names = ['repeat-source-reanalysis-summary.json', 'source-reanalysis-summary.json'];
  for (const name of names) {
    const parsed = await readJsonIfExists(join(dir, name));
    if (!parsed) continue;
    const rows = Array.isArray(parsed.results) ? parsed.results : [];
    return new Map(rows.map(row => {
      const record = asRecord(row) ?? {};
      return [String(record.id ?? ''), record] as const;
    }).filter(([id]) => id.length > 0));
  }
  return new Map();
}

async function loadRunForId(input: {
  id: string;
  run: ApiRepeatRunInput;
  currentScore: number | null;
}): Promise<ApiRepeatRowRun> {
  const jsonPath = join(input.run.dir, `${input.id}.json`);
  const payload = await readJsonIfExists(jsonPath);
  const source = (await loadSourceSummary(input.run.dir)).get(input.id) ?? null;
  if (!payload) {
    return {
      label: input.run.label,
      jsonPath: null,
      sourceSummaryPath: null,
      apiScore: null,
      apiGrade: null,
      sourceScore: null,
      sourceGrade: null,
      gain: 0,
      tools: [],
    };
  }
  const after = asRecord(payload.after);
  const scoreProfile = asRecord(after?.scoreProfile);
  const apiScore = numberOrNull(scoreProfile?.overallScore);
  const sourceScore = numberOrNull(source?.sourceReanalysisScore);
  return {
    label: input.run.label,
    jsonPath,
    sourceSummaryPath: source ? input.run.dir : null,
    apiScore,
    apiGrade: stringOrNull(scoreProfile?.grade),
    sourceScore,
    sourceGrade: stringOrNull(source?.sourceReanalysisGrade),
    gain: Math.max(0, (sourceScore ?? input.currentScore ?? 0) - (input.currentScore ?? 0)),
    tools: toolEvents(payload),
  };
}

export function classifyApiRepeatRow(input: {
  id: string;
  currentScore: number | null;
  currentGrade: string | null;
  runs: ApiRepeatRowRun[];
}): Omit<ApiRepeatRowDiagnostic, 'id' | 'currentScore' | 'currentGrade' | 'runs'> {
  const presentRuns = input.runs.filter(run => run.jsonPath);
  if (presentRuns.length === 0) {
    return {
      classification: 'missing_run_data',
      bestSourceGain: 0,
      repeatSupportedGain: 0,
      highRunLabels: [],
      lowRunLabels: [],
      firstDivergence: 'No run data found.',
      sharedRejectedScoreMovingStates: [],
      recommendation: 'Collect at least two runs before selecting behavior.',
    };
  }

  const bestSourceGain = Math.max(0, ...presentRuns.map(run => run.gain));
  const highRuns = presentRuns.filter(run => run.gain > 0);
  const lowRuns = presentRuns.filter(run => run.gain <= 0);
  const repeatSupportedGain = highRuns.length >= 2
    ? Math.min(...highRuns.map(run => run.gain))
    : 0;

  const highMoving = highRuns.flatMap(run => scoreMovingTools(run).map(tool => ({ run, tool })));
  const lowRejected = new Set<string>();
  for (const run of lowRuns) {
    for (const tool of run.tools) {
      if (tool.outcome === 'rejected') lowRejected.add(toolStateKey(tool));
    }
  }
  const sharedRejectedScoreMovingStates = [...new Set(
    highMoving
      .filter(({ tool }) => lowRejected.has(toolStateKey(tool)))
      .map(({ tool }) => toolStateKey(tool)),
  )];

  const referenceHigh = highRuns[0] ?? presentRuns[0]!;
  const referenceLow = lowRuns[0] ?? presentRuns.find(run => run.label !== referenceHigh.label) ?? null;
  const highFirst = firstScoreMovingTool(referenceHigh);
  const lowFirst = referenceLow ? firstScoreMovingTool(referenceLow) : null;
  const firstDivergence = referenceLow
    ? `${referenceHigh.label}: ${highFirst ? `${highFirst.toolName}/${highFirst.outcome}/${highFirst.scoreBefore}->${highFirst.scoreAfter}@${highFirst.replayStateBefore ?? 'none'}` : 'no score-moving tool'} vs ${referenceLow.label}: ${lowFirst ? `${lowFirst.toolName}/${lowFirst.outcome}/${lowFirst.scoreBefore}->${lowFirst.scoreAfter}@${lowFirst.replayStateBefore ?? 'none'}` : 'no score-moving tool'}`
    : 'Only one run shape observed.';

  if (repeatSupportedGain > 0 && lowRuns.length === 0) {
    return {
      classification: 'repeat_supported_recovery',
      bestSourceGain,
      repeatSupportedGain,
      highRunLabels: highRuns.map(run => run.label),
      lowRunLabels: lowRuns.map(run => run.label),
      firstDivergence,
      sharedRejectedScoreMovingStates,
      recommendation: 'Candidate can be counted in repeat-supported overlay, pending full validation.',
    };
  }
  if (sharedRejectedScoreMovingStates.length > 0) {
    return {
      classification: 'same_state_guard_candidate',
      bestSourceGain,
      repeatSupportedGain,
      highRunLabels: highRuns.map(run => run.label),
      lowRunLabels: lowRuns.map(run => run.label),
      firstDivergence,
      sharedRejectedScoreMovingStates,
      recommendation: 'Inspect the shared rejected state for a row/tool-specific recovery with final source/PAC-safe reanalysis.',
    };
  }
  if (highRuns.length > 0 && lowRuns.length > 0) {
    return {
      classification: 'upstream_route_volatility',
      bestSourceGain,
      repeatSupportedGain,
      highRunLabels: highRuns.map(run => run.label),
      lowRunLabels: lowRuns.map(run => run.label),
      firstDivergence,
      sharedRejectedScoreMovingStates,
      recommendation: 'Do not count as completion; stabilize analyzer/route selection before behavior.',
    };
  }
  if (presentRuns.some(run => (run.apiScore ?? 0) > (input.currentScore ?? 0)) && bestSourceGain === 0) {
    return {
      classification: 'headline_only_not_source_counted',
      bestSourceGain,
      repeatSupportedGain,
      highRunLabels: [],
      lowRunLabels: presentRuns.map(run => run.label),
      firstDivergence,
      sharedRejectedScoreMovingStates,
      recommendation: 'Do not count API headline-only gains; source reanalysis must improve.',
    };
  }
  return {
    classification: 'no_recovery_observed',
    bestSourceGain,
    repeatSupportedGain,
    highRunLabels: [],
    lowRunLabels: presentRuns.map(run => run.label),
    firstDivergence,
    sharedRejectedScoreMovingStates,
    recommendation: 'Skip this row for mean recovery unless new evidence appears.',
  };
}

export async function buildApiRepeatabilityDiagnostic(input: {
  ids: string[];
  baselineRoot: string;
  runs: ApiRepeatRunInput[];
  generatedAt?: string;
}): Promise<ApiRepeatabilityDiagnostic> {
  const baselineRows = await loadBaselineRows(input.baselineRoot);
  const rows: ApiRepeatRowDiagnostic[] = [];
  for (const id of input.ids) {
    const baseline = baselineRows.get(id);
    const runs = await Promise.all(input.runs.map(run => loadRunForId({
      id,
      run,
      currentScore: baseline?.score ?? null,
    })));
    const classification = classifyApiRepeatRow({
      id,
      currentScore: baseline?.score ?? null,
      currentGrade: baseline?.grade ?? null,
      runs,
    });
    rows.push({
      id,
      currentScore: baseline?.score ?? null,
      currentGrade: baseline?.grade ?? null,
      runs,
      ...classification,
    });
  }
  const classifications: Record<string, number> = {};
  for (const row of rows) classifications[row.classification] = (classifications[row.classification] ?? 0) + 1;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    ids: input.ids,
    runs: input.runs,
    rows,
    summary: {
      repeatSupportedGain: rows.reduce((sum, row) => sum + row.repeatSupportedGain, 0),
      bestObservedGain: rows.reduce((sum, row) => sum + row.bestSourceGain, 0),
      classifications,
    },
  };
}

function markdown(report: ApiRepeatabilityDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input API Repeatability Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Repeat-supported gain: ${report.summary.repeatSupportedGain}`);
  lines.push(`- Best observed gain: ${report.summary.bestObservedGain}`);
  lines.push(`- Classifications: ${Object.entries(report.summary.classifications).map(([key, value]) => `${key}=${value}`).join(', ')}`);
  lines.push('');
  lines.push('| Row | Current | Classification | Best gain | Repeat gain | High runs | Low runs | First divergence | Recommendation |');
  lines.push('| --- | ---: | --- | ---: | ---: | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push([
      `| \`${row.id}\``,
      `${row.currentScore ?? 'n/a'}/${row.currentGrade ?? 'n/a'}`,
      row.classification,
      String(row.bestSourceGain),
      String(row.repeatSupportedGain),
      row.highRunLabels.join(', ') || 'none',
      row.lowRunLabels.join(', ') || 'none',
      row.firstDivergence.replaceAll('|', '/'),
      row.recommendation.replaceAll('|', '/'),
    ].join(' | ') + ' |');
  }
  lines.push('');
  lines.push('## Shared Rejected Score-Moving States');
  lines.push('');
  for (const row of report.rows) {
    if (row.sharedRejectedScoreMovingStates.length === 0) continue;
    lines.push(`- \`${row.id}\`: ${row.sharedRejectedScoreMovingStates.map(item => `\`${item}\``).join(', ')}`);
  }
  if (!report.rows.some(row => row.sharedRejectedScoreMovingStates.length > 0)) {
    lines.push('- none');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildApiRepeatabilityDiagnostic(args);
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'api-repeatability-diagnostic.json'), JSON.stringify(report, null, 2));
  await writeFile(join(args.out, 'api-repeatability-diagnostic.md'), markdown(report));
  console.log(`Wrote ${join(args.out, 'api-repeatability-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  acceptedToolHarmDecisionFromScores,
  acceptedToolHarmTargetsForTool,
} from '../src/services/remediation/acceptedToolHarm.js';
import type { CategoryKey } from '../src/types.js';

type JsonRecord = Record<string, unknown>;

const DEFAULT_STAGE158_REPORT =
  'Output/stage145-low-grade-tail/stage158-active-tail-repeatability-triage-2026-04-30-r2/stage158-active-tail-repeatability-triage.json';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage159-accepted-tool-harm-diagnostic-2026-04-30-r1';

const DEFAULT_IDS = new Set([
  'v1-v1-4519',
  'v1-v1-4635',
  'v1-v1-4761',
  'v1-v1-4147',
  'v1-v1-4453',
  'v1-v1-4735',
  'orig-figure-4754',
  'orig-font-4057',
  'v1-v1-4694',
  'orig-long-4680',
  'orig-structure-4076',
]);

export type Stage159RowClass =
  | 'repeatable_accepted_tool_harm'
  | 'single_accepted_tool_harm'
  | 'same_buffer_analyzer_control'
  | 'stable_control'
  | 'no_harm_observed';

export interface Stage159HarmObservation {
  runLabel: string;
  toolName: string;
  targetRef: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
  targetCategories: CategoryKey[];
  targetDeltas: Partial<Record<CategoryKey, number>>;
  droppedCategory: CategoryKey | null;
  droppedDelta: number | null;
  reason: string | null;
}

export interface Stage159RowReport {
  id: string;
  class: Stage159RowClass;
  scoreRangeDelta: number | null;
  finalReanalysisDelta: number | null;
  observations: Stage159HarmObservation[];
  reasons: string[];
}

export interface Stage159Report {
  generatedAt: string;
  stage158Report: string;
  rows: Stage159RowReport[];
  classDistribution: Record<Stage159RowClass, number>;
  decision: 'implement_targetless_core_drop_guard' | 'diagnostic_only';
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage159-accepted-tool-harm-diagnostic.ts [options]',
    `  --stage158-report <path>  Default: ${DEFAULT_STAGE158_REPORT}`,
    `  --out <dir>               Default: ${DEFAULT_OUT}`,
    '  --file <id-or-suffix>     Limit row ids; repeatable',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function parseDetails(details: unknown): JsonRecord | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    return record(JSON.parse(details) as unknown);
  } catch {
    return null;
  }
}

function nestedRecord(root: JsonRecord | null, keys: string[]): JsonRecord | null {
  let current: unknown = root;
  for (const key of keys) {
    current = record(current)?.[key];
  }
  return record(current);
}

function categoryScores(raw: unknown): Partial<Record<CategoryKey, number>> {
  const rec = record(raw);
  const out: Partial<Record<CategoryKey, number>> = {};
  if (!rec) return out;
  for (const [key, value] of Object.entries(rec)) {
    const score = num(value);
    if (score != null) out[key as CategoryKey] = score;
  }
  return out;
}

function targetRef(details: JsonRecord | null, replay: JsonRecord | null): string | null {
  const invRef = record(details?.['invariants'])?.['targetRef'];
  if (typeof invRef === 'string' && invRef.length > 0) return invRef;
  const debugRef = record(details?.['debug'])?.['targetRef'];
  if (typeof debugRef === 'string' && debugRef.length > 0) return debugRef;
  const replayRef = replay?.['targetRef'];
  return typeof replayRef === 'string' && replayRef.length > 0 ? replayRef : null;
}

function scoreDelta(before: number | null, after: number | null): number | null {
  return before == null || after == null ? null : after - before;
}

function observationFromTool(runLabel: string, tool: JsonRecord): Stage159HarmObservation | null {
  if (str(tool['outcome']) !== 'applied') return null;
  const toolName = str(tool['toolName']);
  if (acceptedToolHarmTargetsForTool(toolName).length === 0) return null;
  const details = parseDetails(tool['details']);
  const replay = nestedRecord(details, ['debug', 'replayState']);
  const before = categoryScores(replay?.['categoryScoresBefore']);
  const after = categoryScores(replay?.['categoryScoresAfter']);
  if (!Object.keys(before).length || !Object.keys(after).length) return null;
  const decision = acceptedToolHarmDecisionFromScores({ toolName, before, after });
  return {
    runLabel,
    toolName,
    targetRef: targetRef(details, replay),
    stateSignatureBefore: str(replay?.['stateSignatureBefore']) || null,
    stateSignatureAfter: str(replay?.['stateSignatureAfter']) || null,
    scoreBefore: num(replay?.['scoreBefore']),
    scoreAfter: num(replay?.['scoreAfter']),
    scoreDelta: scoreDelta(num(replay?.['scoreBefore']), num(replay?.['scoreAfter'])),
    targetCategories: decision.targetCategories,
    targetDeltas: decision.targetDeltas,
    droppedCategory: decision.droppedCategory,
    droppedDelta: decision.droppedDelta,
    reason: decision.reason,
  };
}

function rowToolsFromRuns(row: JsonRecord): Stage159HarmObservation[] {
  const observations: Stage159HarmObservation[] = [];
  const scores = Array.isArray(row['scores']) ? row['scores'] as JsonRecord[] : [];
  for (const scoreRow of scores) {
    const sourceRow = record(scoreRow['row']);
    const tools = Array.isArray(sourceRow?.['appliedTools']) ? sourceRow!['appliedTools'] as JsonRecord[] : [];
    for (const tool of tools) {
      const observation = observationFromTool(str(scoreRow['label']), tool);
      if (observation) observations.push(observation);
    }
  }
  return observations;
}

function canonicalId(row: JsonRecord): string {
  return str(row['publicationId']) || str(row['id']);
}

async function loadRunRows(runDir: string): Promise<Map<string, JsonRecord>> {
  try {
    const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
    const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
    const out = new Map<string, JsonRecord>();
    for (const row of rows) {
      const id = canonicalId(row);
      if (id) out.set(id, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

function observationsForRunRow(runLabel: string, row: JsonRecord | undefined): Stage159HarmObservation[] {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  return tools.map(tool => observationFromTool(runLabel, tool)).filter((value): value is Stage159HarmObservation => value !== null);
}

function firstStage158Harm(row: JsonRecord): Stage159HarmObservation | null {
  const harm = record(row['firstAcceptedToolHarm']);
  if (!harm) return null;
  const toolName = str(harm['toolName']);
  return {
    runLabel: str(harm['runLabel']),
    toolName,
    targetRef: typeof harm['targetRef'] === 'string' ? harm['targetRef'] : null,
    stateSignatureBefore: typeof harm['stateSignatureBefore'] === 'string' ? harm['stateSignatureBefore'] : null,
    stateSignatureAfter: typeof harm['stateSignatureAfter'] === 'string' ? harm['stateSignatureAfter'] : null,
    scoreBefore: null,
    scoreAfter: null,
    scoreDelta: null,
    targetCategories: acceptedToolHarmTargetsForTool(toolName),
    targetDeltas: typeof harm['targetCategory'] === 'string' && typeof harm['targetDelta'] === 'number'
      ? { [harm['targetCategory'] as CategoryKey]: harm['targetDelta'] as number }
      : {},
    droppedCategory: typeof harm['droppedCategory'] === 'string' ? harm['droppedCategory'] as CategoryKey : null,
    droppedDelta: num(harm['droppedDelta']),
    reason: `stage158_${toolName}_dropped_${str(harm['droppedCategory'])}`,
  };
}

export function classifyStage159Row(input: {
  stage158Class: string;
  observations: Stage159HarmObservation[];
  scoreRangeDelta: number | null;
  finalReanalysisDelta: number | null;
}): { class: Stage159RowClass; reasons: string[] } {
  if (input.stage158Class === 'same_buffer_analyzer_variance' || Math.abs(input.finalReanalysisDelta ?? 0) >= 10) {
    return { class: 'same_buffer_analyzer_control', reasons: ['same_buffer_analyzer_control'] };
  }
  const harmful = input.observations.filter(row => row.reason);
  if (harmful.length >= 2) {
    return { class: 'repeatable_accepted_tool_harm', reasons: [`harm_observations=${harmful.length}`] };
  }
  if (harmful.length === 1) {
    return { class: 'single_accepted_tool_harm', reasons: [`harm=${harmful[0]!.toolName}`] };
  }
  if ((input.scoreRangeDelta ?? 0) <= 5) {
    return { class: 'stable_control', reasons: ['stable_no_guard_harm'] };
  }
  return { class: 'no_harm_observed', reasons: ['no_guard_harm_observed'] };
}

async function buildReport(stage158ReportPath: string, ids: Set<string>): Promise<Stage159Report> {
  const parsed = JSON.parse(await readFile(stage158ReportPath, 'utf8')) as JsonRecord;
  const rows = Array.isArray(parsed['rows']) ? parsed['rows'] as JsonRecord[] : [];
  const runs = Array.isArray(parsed['runs']) ? parsed['runs'] as JsonRecord[] : [];
  const runRows = await Promise.all(runs.map(async run => ({
    label: str(run['label']),
    rows: await loadRunRows(str(run['runDir'])),
  })));
  const selected = rows.filter(row => {
    const id = str(row['id']) || str(row['publicationId']);
    return [...ids].some(wanted => id === wanted || id.endsWith(wanted));
  });
  const reportRows: Stage159RowReport[] = selected.map(row => {
    const id = str(row['id']) || str(row['publicationId']);
    const observations = [
      ...runRows.flatMap(run => observationsForRunRow(run.label, run.rows.get(id))),
      ...rowToolsFromRuns(row),
    ];
    const fallback = firstStage158Harm(row);
    if (fallback && !observations.some(obs =>
      obs.runLabel === fallback.runLabel &&
      obs.toolName === fallback.toolName &&
      obs.droppedCategory === fallback.droppedCategory
    )) {
      observations.push(fallback);
    }
    const finalPdfDeltas = (Array.isArray(row['scores']) ? row['scores'] as JsonRecord[] : [])
      .map(score => num(record(score['finalPdf'])?.['scoreDeltaFromRun']))
      .filter((value): value is number => value != null);
    const scoreRangeDelta = num(record(row['scoreRange'])?.['delta']);
    const finalReanalysisDelta = finalPdfDeltas.length
      ? finalPdfDeltas.reduce((largest, value) => Math.abs(value) > Math.abs(largest) ? value : largest, 0)
      : null;
    const classified = classifyStage159Row({
      stage158Class: str(row['class']),
      observations,
      scoreRangeDelta,
      finalReanalysisDelta,
    });
    return {
      id,
      scoreRangeDelta,
      finalReanalysisDelta,
      observations,
      ...classified,
    };
  });
  const classDistribution = reportRows.reduce<Record<Stage159RowClass, number>>((acc, row) => {
    acc[row.class] += 1;
    return acc;
  }, {
    repeatable_accepted_tool_harm: 0,
    single_accepted_tool_harm: 0,
    same_buffer_analyzer_control: 0,
    stable_control: 0,
    no_harm_observed: 0,
  });
  const decision = classDistribution.repeatable_accepted_tool_harm + classDistribution.single_accepted_tool_harm > 0
    ? 'implement_targetless_core_drop_guard'
    : 'diagnostic_only';
  return {
    generatedAt: new Date().toISOString(),
    stage158Report: stage158ReportPath,
    rows: reportRows,
    classDistribution,
    decision,
  };
}

function renderMarkdown(report: Stage159Report): string {
  const lines = [
    '# Stage 159 Accepted Tool Harm Diagnostic',
    '',
    `Decision: \`${report.decision}\``,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Class | Range | Reanalysis delta | Harm observations | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const harms = row.observations
      .filter(obs => obs.reason)
      .map(obs => `${obs.runLabel}:${obs.toolName}:${obs.droppedCategory}${obs.droppedDelta}`)
      .join('<br>');
    lines.push(`| ${row.id} | ${row.class} | ${row.scoreRangeDelta ?? 'n/a'} | ${row.finalReanalysisDelta ?? 'n/a'} | ${harms || 'none'} | ${row.reasons.join('; ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let stage158Report = DEFAULT_STAGE158_REPORT;
  let outDir = DEFAULT_OUT;
  const ids = new Set(DEFAULT_IDS);
  let sawFile = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--stage158-report') stage158Report = args[++i] ?? stage158Report;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--file') {
      if (!sawFile) ids.clear();
      sawFile = true;
      ids.add(args[++i] ?? '');
    } else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  const report = await buildReport(stage158Report, ids);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage159-accepted-tool-harm-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage159-accepted-tool-harm-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

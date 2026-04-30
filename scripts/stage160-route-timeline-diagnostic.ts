#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  acceptedToolHarmDecisionFromScores,
  acceptedToolHarmTargetsForTool,
} from '../src/services/remediation/acceptedToolHarm.js';
import {
  STAGE160_RECOVERY_TOOLS_BY_CATEGORY,
  STAGE160_TRANSACTION_CLEANUP_TOOLS,
} from '../src/services/remediation/routeOrderStabilization.js';
import type { CategoryKey } from '../src/types.js';

type JsonRecord = Record<string, unknown>;

export type Stage160RunPhase = 'baseline' | 'candidate' | 'repeat' | 'target';

export type Stage160RowClass =
  | 'route_order_fix_candidate'
  | 'cleanup_transaction_candidate'
  | 'post_pass_order_debt'
  | 'same_buffer_analyzer_variance'
  | 'stable_control'
  | 'no_safe_rule';

export interface Stage160RunInput {
  label: string;
  phase: Stage160RunPhase;
  runDir: string;
}

export interface Stage160TimelineEntry {
  index: number;
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string;
  targetRef: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
  categoryScoresBefore: Partial<Record<CategoryKey, number>>;
  categoryScoresAfter: Partial<Record<CategoryKey, number>>;
  categoryDeltas: Partial<Record<CategoryKey, number>>;
  targetCategories: CategoryKey[];
  targetDeltas: Partial<Record<CategoryKey, number>>;
  droppedCategory: CategoryKey | null;
  droppedDelta: number | null;
  harmReason: string | null;
}

export interface Stage160RunRow {
  label: string;
  phase: Stage160RunPhase;
  score: number | null;
  grade: string | null;
  categories: Partial<Record<CategoryKey, number>>;
  toolCount: number;
  timeline: Stage160TimelineEntry[];
}

export interface Stage160Divergence {
  goodRunLabel: string;
  badRunLabel: string;
  index: number;
  good: string | null;
  bad: string | null;
}

export interface Stage160HarmSummary {
  runLabel: string;
  toolName: string;
  source: string;
  stage: number | null;
  targetRef: string | null;
  droppedCategory: CategoryKey;
  droppedDelta: number;
  targetCategories: CategoryKey[];
  targetDeltas: Partial<Record<CategoryKey, number>>;
  recoveryTool: string | null;
  recoveryRunLabel: string | null;
}

export interface Stage160RowReport {
  id: string;
  class: Stage160RowClass;
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  bestRun: { label: string; score: number; grade: string | null } | null;
  worstRun: { label: string; score: number; grade: string | null } | null;
  firstDivergence: Stage160Divergence | null;
  harmObservations: Stage160HarmSummary[];
  reasons: string[];
  runs: Stage160RunRow[];
}

export interface Stage160Report {
  generatedAt: string;
  runs: Stage160RunInput[];
  rows: Stage160RowReport[];
  classDistribution: Record<Stage160RowClass, number>;
  decision: 'diagnostic_only' | 'investigate_cleanup_transaction';
}

const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage160-route-timeline-diagnostic-2026-04-30-r1';
const DEFAULT_STAGE158_REPORT =
  'Output/stage145-low-grade-tail/stage158-active-tail-repeatability-triage-2026-04-30-r2/stage158-active-tail-repeatability-triage.json';

const DEFAULT_RUNS: Stage160RunInput[] = [
  {
    label: 'stage156-baseline',
    phase: 'baseline',
    runDir: 'Output/stage145-low-grade-tail/run-stage156-active-tail-baseline-2026-04-29-r1',
  },
  {
    label: 'stage156-rejected-figure-cap',
    phase: 'candidate',
    runDir: 'Output/stage145-low-grade-tail/run-stage156-active-tail-figure-continuation-2026-04-29-r1',
  },
  {
    label: 'stage157-rejected-table-cap',
    phase: 'candidate',
    runDir: 'Output/stage145-low-grade-tail/run-stage157-active-tail-table-continuation-2026-04-29-r1',
  },
  {
    label: 'stage158-r1',
    phase: 'repeat',
    runDir: 'Output/stage145-low-grade-tail/run-stage158-active-tail-repeat-r1',
  },
  {
    label: 'stage158-r2',
    phase: 'repeat',
    runDir: 'Output/stage145-low-grade-tail/run-stage158-active-tail-repeat-r2',
  },
  {
    label: 'stage158-write',
    phase: 'target',
    runDir: 'Output/stage145-low-grade-tail/run-stage158-target-write-repeat-r1',
  },
  {
    label: 'stage159-target-r1',
    phase: 'target',
    runDir: 'Output/stage145-low-grade-tail/run-stage159-target-accepted-tool-harm-2026-04-30-r1',
  },
  {
    label: 'stage159-target-r2',
    phase: 'target',
    runDir: 'Output/stage145-low-grade-tail/run-stage159-target-accepted-tool-harm-2026-04-30-r2',
  },
  {
    label: 'stage159-target-r3',
    phase: 'target',
    runDir: 'Output/stage145-low-grade-tail/run-stage159-target-accepted-tool-harm-2026-04-30-r3',
  },
  {
    label: 'stage159-target-r4',
    phase: 'target',
    runDir: 'Output/stage145-low-grade-tail/run-stage159-target-accepted-tool-harm-2026-04-30-r4',
  },
  {
    label: 'stage159-active-r1',
    phase: 'candidate',
    runDir: 'Output/stage145-low-grade-tail/run-stage159-active-tail-2026-04-30-r1',
  },
  {
    label: 'stage159-active-r2',
    phase: 'candidate',
    runDir: 'Output/stage145-low-grade-tail/run-stage159-active-tail-2026-04-30-r2',
  },
];

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

const PARKED_ANALYZER_IDS = new Set(['v1-v1-4694', 'orig-long-4680', 'orig-structure-4076']);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage160-route-timeline-diagnostic.ts [options]',
    `  --out <dir>                    Default: ${DEFAULT_OUT}`,
    `  --stage158-report <path>       Default: ${DEFAULT_STAGE158_REPORT}`,
    '  --run <label,phase,dir>        Add run; phase=baseline|candidate|repeat|target',
    '  --file <id-or-suffix>          Limit row ids; repeatable',
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

function scoreDelta(before: number | null, after: number | null): number | null {
  return before == null || after == null ? null : after - before;
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

function categoryDeltas(
  before: Partial<Record<CategoryKey, number>>,
  after: Partial<Record<CategoryKey, number>>,
): Partial<Record<CategoryKey, number>> {
  const keys = new Set<CategoryKey>([
    ...Object.keys(before) as CategoryKey[],
    ...Object.keys(after) as CategoryKey[],
  ]);
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const key of keys) {
    const beforeScore = before[key];
    const afterScore = after[key];
    if (beforeScore != null && afterScore != null) {
      out[key] = afterScore - beforeScore;
    }
  }
  return out;
}

function rowCategories(row: JsonRecord | undefined): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  const categories = Array.isArray(row?.['afterCategories']) ? row!['afterCategories'] as JsonRecord[] : [];
  for (const category of categories) {
    const key = str(category['key']);
    const score = num(category['score']);
    if (key && score != null) out[key as CategoryKey] = score;
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

function canonicalId(row: JsonRecord): string {
  return str(row['publicationId']) || str(row['id']);
}

function range(values: Array<number | null | undefined>): { min: number | null; max: number | null; delta: number | null } {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) return { min: null, max: null, delta: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, delta: max - min };
}

function timelineKey(entry: Stage160TimelineEntry | null): string | null {
  if (!entry) return null;
  return [
    entry.toolName,
    entry.outcome,
    entry.source || 'unknown',
    entry.stage ?? 'na',
    entry.targetRef ?? 'no-ref',
    entry.stateSignatureBefore ?? 'no-state',
  ].join('|');
}

function compactEntry(entry: Stage160TimelineEntry | null): string | null {
  if (!entry) return null;
  const score = entry.scoreBefore == null || entry.scoreAfter == null ? '' : ` ${entry.scoreBefore}->${entry.scoreAfter}`;
  return `${entry.index}:${entry.toolName}/${entry.outcome}/${entry.source}/s${entry.stage ?? 'na'}${score}`;
}

function timelineFromRow(row: JsonRecord | undefined): Stage160TimelineEntry[] {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  return tools.map((tool, index): Stage160TimelineEntry => {
    const toolName = str(tool['toolName']);
    const details = parseDetails(tool['details']);
    const replay = nestedRecord(details, ['debug', 'replayState']);
    const before = categoryScores(replay?.['categoryScoresBefore']);
    const after = categoryScores(replay?.['categoryScoresAfter']);
    const decision = acceptedToolHarmDecisionFromScores({ toolName, before, after });
    return {
      index,
      toolName,
      outcome: str(tool['outcome']),
      stage: num(tool['stage']),
      round: num(tool['round']),
      source: str(tool['source']) || 'unknown',
      targetRef: targetRef(details, replay),
      stateSignatureBefore: str(replay?.['stateSignatureBefore']) || null,
      stateSignatureAfter: str(replay?.['stateSignatureAfter']) || null,
      scoreBefore: num(replay?.['scoreBefore']) ?? num(tool['scoreBefore']),
      scoreAfter: num(replay?.['scoreAfter']) ?? num(tool['scoreAfter']),
      scoreDelta: scoreDelta(num(replay?.['scoreBefore']) ?? num(tool['scoreBefore']), num(replay?.['scoreAfter']) ?? num(tool['scoreAfter'])),
      categoryScoresBefore: before,
      categoryScoresAfter: after,
      categoryDeltas: categoryDeltas(before, after),
      targetCategories: decision.targetCategories,
      targetDeltas: decision.targetDeltas,
      droppedCategory: decision.droppedCategory,
      droppedDelta: decision.droppedDelta,
      harmReason: decision.reason,
    };
  });
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function loadRunRows(runDir: string): Promise<Map<string, JsonRecord>> {
  const parsed = await readJson(join(runDir, 'remediate.results.json'));
  const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
  const out = new Map<string, JsonRecord>();
  for (const row of rows) {
    const id = canonicalId(row);
    if (id) out.set(id, row);
  }
  return out;
}

async function loadStage158Classes(path: string): Promise<Map<string, string>> {
  const parsed = record(await readJson(path));
  const rows = Array.isArray(parsed?.['rows']) ? parsed!['rows'] as JsonRecord[] : [];
  const out = new Map<string, string>();
  for (const row of rows) {
    const id = str(row['publicationId']) || str(row['id']);
    const klass = str(row['class']);
    if (id && klass) out.set(id, klass);
  }
  return out;
}

function runRowFrom(row: JsonRecord | undefined, input: Stage160RunInput): Stage160RunRow {
  return {
    label: input.label,
    phase: input.phase,
    score: num(row?.['afterScore']),
    grade: str(row?.['afterGrade']) || null,
    categories: rowCategories(row),
    toolCount: Array.isArray(row?.['appliedTools']) ? (row!['appliedTools'] as unknown[]).length : 0,
    timeline: timelineFromRow(row),
  };
}

function bestAndWorst(runs: Stage160RunRow[]): {
  best: Stage160RunRow | null;
  worst: Stage160RunRow | null;
} {
  const scored = runs.filter((run): run is Stage160RunRow & { score: number } => run.score != null);
  if (!scored.length) return { best: null, worst: null };
  return {
    best: [...scored].sort((a, b) => b.score - a.score)[0] ?? null,
    worst: [...scored].sort((a, b) => a.score - b.score)[0] ?? null,
  };
}

export function firstTimelineDivergence(good: Stage160RunRow | null, bad: Stage160RunRow | null): Stage160Divergence | null {
  if (!good || !bad) return null;
  const max = Math.max(good.timeline.length, bad.timeline.length);
  for (let index = 0; index < max; index += 1) {
    const goodEntry = good.timeline[index] ?? null;
    const badEntry = bad.timeline[index] ?? null;
    if (timelineKey(goodEntry) !== timelineKey(badEntry)) {
      return {
        goodRunLabel: good.label,
        badRunLabel: bad.label,
        index,
        good: compactEntry(goodEntry),
        bad: compactEntry(badEntry),
      };
    }
  }
  return null;
}

function findRecoveryAfterHarm(run: Stage160RunRow, harm: Stage160TimelineEntry): Stage160TimelineEntry | null {
  if (!harm.droppedCategory) return null;
  const beforeScore = harm.categoryScoresBefore[harm.droppedCategory];
  if (beforeScore == null) return null;
  const recoveryTools = new Set(STAGE160_RECOVERY_TOOLS_BY_CATEGORY[harm.droppedCategory] ?? []);
  for (const entry of run.timeline.slice(harm.index + 1)) {
    if (!recoveryTools.has(entry.toolName)) continue;
    const afterScore = entry.categoryScoresAfter[harm.droppedCategory];
    const delta = entry.categoryDeltas[harm.droppedCategory];
    if (afterScore != null && afterScore >= beforeScore && delta != null && delta > 0) {
      return entry;
    }
  }
  return null;
}

function harmonicSummaries(runs: Stage160RunRow[]): Stage160HarmSummary[] {
  const summaries: Stage160HarmSummary[] = [];
  for (const run of runs) {
    for (const entry of run.timeline) {
      if (entry.outcome !== 'applied') continue;
      if (!entry.harmReason || !entry.droppedCategory || entry.droppedDelta == null) continue;
      if (!acceptedToolHarmTargetsForTool(entry.toolName).length) continue;
      const recovery = findRecoveryAfterHarm(run, entry);
      summaries.push({
        runLabel: run.label,
        toolName: entry.toolName,
        source: entry.source,
        stage: entry.stage,
        targetRef: entry.targetRef,
        droppedCategory: entry.droppedCategory,
        droppedDelta: entry.droppedDelta,
        targetCategories: entry.targetCategories,
        targetDeltas: entry.targetDeltas,
        recoveryTool: recovery?.toolName ?? null,
        recoveryRunLabel: recovery ? run.label : null,
      });
    }
  }
  return summaries;
}

function hasCleanerGoodRun(runs: Stage160RunRow[], harm: Stage160HarmSummary): boolean {
  const harmfulRun = runs.find(run => run.label === harm.runLabel);
  if (!harmfulRun?.score) return false;
  return runs.some(run => {
    if (run.score == null || run.score < harmfulRun.score + 10) return false;
    return !run.timeline.some(entry =>
      entry.outcome === 'applied' &&
      entry.toolName === harm.toolName &&
      entry.droppedCategory === harm.droppedCategory &&
      entry.droppedDelta != null &&
      entry.droppedDelta <= harm.droppedDelta
    );
  });
}

export function classifyStage160Row(input: {
  id: string;
  stage158Class?: string;
  runs: Stage160RunRow[];
  harms: Stage160HarmSummary[];
  firstDivergence: Stage160Divergence | null;
  scoreRangeDelta: number | null;
}): { class: Stage160RowClass; reasons: string[] } {
  const reasons: string[] = [];
  if (PARKED_ANALYZER_IDS.has(input.id) || input.stage158Class === 'same_buffer_analyzer_variance') {
    return { class: 'same_buffer_analyzer_variance', reasons: ['parked_same_buffer_analyzer_row'] };
  }

  const transactionHarms = input.harms.filter(harm =>
    STAGE160_TRANSACTION_CLEANUP_TOOLS.has(harm.toolName) &&
    harm.recoveryTool != null
  );
  if (transactionHarms.length > 0) {
    return {
      class: 'cleanup_transaction_candidate',
      reasons: transactionHarms.map(harm => `${harm.toolName}_drops_${harm.droppedCategory}_then_${harm.recoveryTool}_recovers`),
    };
  }

  const postPassHarms = input.harms.filter(harm =>
    STAGE160_TRANSACTION_CLEANUP_TOOLS.has(harm.toolName) &&
    harm.source === 'post_pass'
  );
  if (postPassHarms.length > 0) {
    return {
      class: 'post_pass_order_debt',
      reasons: postPassHarms.map(harm => `${harm.toolName}_post_pass_drops_${harm.droppedCategory}_without_recovery`),
    };
  }

  const routeHarms = input.harms.filter(harm =>
    STAGE160_TRANSACTION_CLEANUP_TOOLS.has(harm.toolName) &&
    hasCleanerGoodRun(input.runs, harm)
  );
  if ((input.scoreRangeDelta ?? 0) >= 10 && input.firstDivergence && routeHarms.length > 0) {
    return {
      class: 'route_order_fix_candidate',
      reasons: [`score_range=${input.scoreRangeDelta}`, `first_divergence=${input.firstDivergence.index}`],
    };
  }

  if (input.harms.length === 0 && (input.scoreRangeDelta ?? 0) <= 5) {
    return { class: 'stable_control', reasons: ['stable_no_harm'] };
  }

  if (input.harms.length > 0) {
    reasons.push(`harm_without_safe_transaction=${input.harms.map(harm => `${harm.toolName}:${harm.droppedCategory}`).join(',')}`);
  } else if ((input.scoreRangeDelta ?? 0) > 5) {
    reasons.push(`score_range_without_guard_harm=${input.scoreRangeDelta}`);
  } else {
    reasons.push('no_safe_route_rule');
  }
  return { class: 'no_safe_rule', reasons };
}

async function buildReport(input: {
  runs: Stage160RunInput[];
  ids: Set<string>;
  stage158ReportPath: string;
}): Promise<Stage160Report> {
  const stage158Classes = await loadStage158Classes(input.stage158ReportPath);
  const runRows = await Promise.all(input.runs.map(async run => ({ run, rows: await loadRunRows(run.runDir) })));
  const allIds = new Set<string>();
  for (const { rows } of runRows) {
    for (const id of rows.keys()) {
      if ([...input.ids].some(wanted => id === wanted || id.endsWith(wanted))) allIds.add(id);
    }
  }
  const rows: Stage160RowReport[] = [];
  for (const id of [...allIds].sort()) {
    const runs = runRows
      .map(({ run, rows: rowsForRun }) => runRowFrom(rowsForRun.get(id), run))
      .filter(run => run.score != null || run.toolCount > 0);
    const { best, worst } = bestAndWorst(runs);
    const scoreRange = range(runs.map(run => run.score));
    const harms = harmonicSummaries(runs);
    const firstDivergence = firstTimelineDivergence(best, worst);
    const classified = classifyStage160Row({
      id,
      stage158Class: stage158Classes.get(id),
      runs,
      harms,
      firstDivergence,
      scoreRangeDelta: scoreRange.delta,
    });
    rows.push({
      id,
      scoreRange,
      bestRun: best?.score != null ? { label: best.label, score: best.score, grade: best.grade } : null,
      worstRun: worst?.score != null ? { label: worst.label, score: worst.score, grade: worst.grade } : null,
      firstDivergence,
      harmObservations: harms,
      runs,
      ...classified,
    });
  }

  const classDistribution = rows.reduce<Record<Stage160RowClass, number>>((acc, row) => {
    acc[row.class] += 1;
    return acc;
  }, {
    route_order_fix_candidate: 0,
    cleanup_transaction_candidate: 0,
    post_pass_order_debt: 0,
    same_buffer_analyzer_variance: 0,
    stable_control: 0,
    no_safe_rule: 0,
  });
  return {
    generatedAt: new Date().toISOString(),
    runs: input.runs,
    rows,
    classDistribution,
    decision: classDistribution.cleanup_transaction_candidate > 0 || classDistribution.route_order_fix_candidate > 0
      ? 'investigate_cleanup_transaction'
      : 'diagnostic_only',
  };
}

function renderMarkdown(report: Stage160Report): string {
  const lines = [
    '# Stage 160 Route Timeline Diagnostic',
    '',
    `Decision: \`${report.decision}\``,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Class | Range | Best | Worst | First divergence | Harm observations | Reasons |',
    '| --- | --- | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const divergence = row.firstDivergence
      ? `${row.firstDivergence.index}: ${row.firstDivergence.goodRunLabel}=${row.firstDivergence.good ?? 'none'} / ${row.firstDivergence.badRunLabel}=${row.firstDivergence.bad ?? 'none'}`
      : 'none';
    const harms = row.harmObservations
      .map(harm => `${harm.runLabel}:${harm.toolName}:${harm.droppedCategory}${harm.droppedDelta}${harm.recoveryTool ? `->${harm.recoveryTool}` : ''}`)
      .join('<br>');
    lines.push(`| ${row.id} | ${row.class} | ${row.scoreRange.delta ?? 'n/a'} | ${row.bestRun ? `${row.bestRun.score} ${row.bestRun.grade ?? ''} (${row.bestRun.label})` : 'n/a'} | ${row.worstRun ? `${row.worstRun.score} ${row.worstRun.grade ?? ''} (${row.worstRun.label})` : 'n/a'} | ${divergence} | ${harms || 'none'} | ${row.reasons.join('; ')} |`);
  }

  lines.push('', '## Primary Timelines');
  for (const row of report.rows.filter(item => ['v1-v1-4519', 'v1-v1-4635', 'v1-v1-4761'].includes(item.id))) {
    lines.push('', `### ${row.id}`, '');
    for (const run of row.runs.filter(item => item.score != null)) {
      const compact = run.timeline
        .filter(entry => STAGE160_TRANSACTION_CLEANUP_TOOLS.has(entry.toolName) || entry.harmReason)
        .map(entry => {
          const harm = entry.harmReason ? ` harm=${entry.droppedCategory}${entry.droppedDelta}` : '';
          return `${entry.index}:${entry.toolName}/${entry.outcome}/${entry.source}/s${entry.stage ?? 'na'}${harm}`;
        })
        .join(' -> ');
      lines.push(`- ${run.label}: ${run.score} ${run.grade ?? ''}; ${compact || 'no transaction-candidate tools'}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function parseRun(value: string): Stage160RunInput {
  const [label, phase, ...rest] = value.split(',');
  const runDir = rest.join(',');
  if (!label || !phase || !runDir) throw new Error(`Invalid --run value: ${value}`);
  if (!['baseline', 'candidate', 'repeat', 'target'].includes(phase)) throw new Error(`Invalid run phase: ${phase}`);
  return { label, phase: phase as Stage160RunPhase, runDir };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let outDir = DEFAULT_OUT;
  let stage158ReportPath = DEFAULT_STAGE158_REPORT;
  const runs = [...DEFAULT_RUNS];
  const ids = new Set(DEFAULT_IDS);
  let sawFile = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--stage158-report') stage158ReportPath = args[++i] ?? stage158ReportPath;
    else if (arg === '--run') runs.push(parseRun(args[++i] ?? ''));
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
  const report = await buildReport({ runs, ids, stage158ReportPath });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage160-route-timeline-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage160-route-timeline-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

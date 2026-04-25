#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

export type Stage70RuntimeClass =
  | 'quality_gain_runtime_tradeoff'
  | 'known_protected_runtime_tail'
  | 'no_gain_repeated_tool_tail'
  | 'single_expensive_required_tool'
  | 'inconclusive_missing_duration_detail';

export interface BenchmarkToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  source?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  durationMs?: number;
  details?: unknown;
}

export interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: string; score: number }>;
  appliedTools?: BenchmarkToolRow[];
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
}

export interface Stage70ToolStep {
  index: number;
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  durationMs: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  targetRef: string | null;
  stateSignatureBefore: string | null;
  note: string | null;
  noGain: boolean;
}

export interface Stage70RepeatedPattern {
  key: string;
  count: number;
  totalDurationMs: number;
  tools: string[];
  outcomes: string[];
  targetRef: string | null;
  stateSignatureBefore: string | null;
}

export interface Stage70RowReport {
  id: string;
  file: string | null;
  role: 'primary' | 'secondary' | 'other';
  baselineScore: number | null;
  candidateScore: number | null;
  scoreDelta: number | null;
  baselineWallMs: number | null;
  candidateWallMs: number | null;
  wallDeltaMs: number | null;
  baselineAttempts: number;
  candidateAttempts: number;
  attemptsDelta: number;
  categoryDeltas: Array<{ key: string; baseline: number; candidate: number; delta: number }>;
  toolTimeline: Stage70ToolStep[];
  repeatedNoGainPatterns: Stage70RepeatedPattern[];
  class: Stage70RuntimeClass;
  reasons: string[];
}

export interface Stage70Report {
  generatedAt: string;
  inputs: {
    stage45RunDir: string;
    stage69RunDir: string;
  };
  rows: Stage70RowReport[];
  classificationDistribution: Record<Stage70RuntimeClass, number>;
  decision: {
    status: 'implement_narrow_runtime_guard' | 'diagnostic_only_runtime_tradeoff' | 'inconclusive';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_STAGE45_RUN = 'Output/experiment-corpus-baseline/run-stage45-full-2026-04-23-r2';
const DEFAULT_STAGE69_RUN = 'Output/experiment-corpus-baseline/run-stage69-full-2026-04-25-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage70-runtime-tail-isolation-2026-04-25-r1';
const PRIMARY_IDS = new Set(['fixture-teams-targeted-wave1', 'long-4516', 'long-4683']);
const SECONDARY_IDS = new Set(['figure-4702', 'figure-4754', 'figure-4466', 'font-4057', 'structure-4438']);
const KNOWN_PROTECTED_IDS = new Set(['fixture-teams-targeted-wave1', 'fixture-teams-original', 'fixture-teams-remediated']);
const RELEVANT_TOOL_FAMILIES = new Set([
  'canonicalize_figure_alt_ownership',
  'normalize_nested_figure_containers',
  'normalize_table_structure',
  'repair_native_table_headers',
  'repair_alt_text_structure',
  'remap_orphan_mcids_as_artifacts',
  'retag_as_figure',
  'set_figure_alt_text',
  'set_table_header_cells',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage70-runtime-tail-isolation.ts [options]',
    `  --stage45-run <dir> Default: ${DEFAULT_STAGE45_RUN}`,
    `  --stage69-run <dir> Default: ${DEFAULT_STAGE69_RUN}`,
    `  --out <dir>         Default: ${DEFAULT_OUT}`,
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function rowKey(row: BenchmarkRow): string {
  return String(row.id ?? row.publicationId ?? '');
}

function toolName(tool: BenchmarkToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    return asRecord(JSON.parse(trimmed) as unknown);
  } catch {
    return { raw: details };
  }
}

function categoryScores(row?: BenchmarkRow): Record<string, number> {
  return Object.fromEntries((row?.afterCategories ?? []).map(category => [category.key, category.score]));
}

function categoryDeltas(baseline?: BenchmarkRow, candidate?: BenchmarkRow): Stage70RowReport['categoryDeltas'] {
  const before = categoryScores(baseline);
  const after = categoryScores(candidate);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .map(key => ({ key, baseline: before[key] ?? 0, candidate: after[key] ?? 0, delta: (after[key] ?? 0) - (before[key] ?? 0) }))
    .filter(delta => delta.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key));
}

function replayState(details: JsonRecord): JsonRecord {
  return asRecord(asRecord(details.debug).replayState);
}

function detailTargetRef(details: JsonRecord): string | null {
  const invariants = asRecord(details.invariants);
  const debug = asRecord(details.debug);
  const replay = replayState(details);
  return str(invariants.targetRef) || str(debug.targetRef) || str(replay.targetRef) || null;
}

function toolStep(tool: BenchmarkToolRow, index: number): Stage70ToolStep {
  const details = parseDetails(tool.details);
  const replay = replayState(details);
  const scoreBefore = num(tool.scoreBefore);
  const scoreAfter = num(tool.scoreAfter);
  const outcome = tool.outcome ?? 'unknown';
  return {
    index,
    toolName: toolName(tool),
    outcome,
    stage: num(tool.stage),
    round: num(tool.round),
    source: str(tool.source) || null,
    durationMs: num(tool.durationMs),
    scoreBefore,
    scoreAfter,
    targetRef: detailTargetRef(details),
    stateSignatureBefore: str(replay.stateSignatureBefore) || null,
    note: str(details.note) || str(details.raw) || null,
    noGain: outcome === 'no_effect' || outcome === 'rejected' || outcome === 'failed' || (scoreBefore != null && scoreAfter != null && scoreAfter <= scoreBefore),
  };
}

function relevantTimeline(row?: BenchmarkRow): Stage70ToolStep[] {
  return (row?.appliedTools ?? [])
    .map((tool, index) => toolStep(tool, index))
    .filter(step => RELEVANT_TOOL_FAMILIES.has(step.toolName));
}

function repeatedKey(step: Stage70ToolStep): string {
  return [
    step.stateSignatureBefore ?? 'missing_state',
    step.toolName,
    step.outcome,
    step.note ?? 'missing_note',
    step.targetRef ?? 'missing_target',
  ].join('|');
}

export function repeatedNoGainPatterns(steps: Stage70ToolStep[]): Stage70RepeatedPattern[] {
  const groups = new Map<string, Stage70ToolStep[]>();
  for (const step of steps) {
    if (!step.noGain) continue;
    const key = repeatedKey(step);
    groups.set(key, [...(groups.get(key) ?? []), step]);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      totalDurationMs: Math.round(group.reduce((sum, step) => sum + (step.durationMs ?? 0), 0) * 100) / 100,
      tools: [...new Set(group.map(step => step.toolName))],
      outcomes: [...new Set(group.map(step => step.outcome))],
      targetRef: group[0]?.targetRef ?? null,
      stateSignatureBefore: group[0]?.stateSignatureBefore ?? null,
    }))
    .sort((a, b) => b.totalDurationMs - a.totalDurationMs || b.count - a.count || a.key.localeCompare(b.key));
}

function classifyRow(input: {
  id: string;
  baseline?: BenchmarkRow;
  candidate?: BenchmarkRow;
  scoreDelta: number | null;
  wallDeltaMs: number | null;
  timeline: Stage70ToolStep[];
  patterns: Stage70RepeatedPattern[];
}): { class: Stage70RuntimeClass; reasons: string[] } {
  if (!input.baseline || !input.candidate || input.wallDeltaMs == null || input.timeline.some(step => step.durationMs == null)) {
    return { class: 'inconclusive_missing_duration_detail', reasons: ['missing_row_wall_or_tool_duration_detail'] };
  }
  if (KNOWN_PROTECTED_IDS.has(input.id) && (input.wallDeltaMs ?? 0) > 10_000) {
    return { class: 'known_protected_runtime_tail', reasons: ['known_protected_or_teams_row_with_runtime_tail'] };
  }
  if ((input.scoreDelta ?? 0) > 2 && (input.wallDeltaMs ?? 0) > 10_000) {
    return { class: 'quality_gain_runtime_tradeoff', reasons: ['runtime_increase_pairs_with_material_score_gain'] };
  }
  if (input.patterns.some(pattern => pattern.totalDurationMs > 5_000)) {
    return { class: 'no_gain_repeated_tool_tail', reasons: ['repeated_no_gain_tool_pattern_over_5s'] };
  }
  const expensiveNoGain = input.timeline.filter(step => step.noGain && (step.durationMs ?? 0) > 5_000);
  if (expensiveNoGain.length === 1) {
    return { class: 'single_expensive_required_tool', reasons: ['single_expensive_no_gain_tool_without_repeat'] };
  }
  if ((input.wallDeltaMs ?? 0) > 10_000) {
    return { class: 'single_expensive_required_tool', reasons: ['runtime_tail_without_repeated_no_gain_signature'] };
  }
  return { class: 'single_expensive_required_tool', reasons: ['focus_row_without_material_repeated_tail'] };
}

export function buildRowReport(id: string, baseline?: BenchmarkRow, candidate?: BenchmarkRow): Stage70RowReport {
  const baselineScore = num(baseline?.afterScore);
  const candidateScore = num(candidate?.afterScore);
  const baselineWallMs = num(baseline?.wallRemediateMs);
  const candidateWallMs = num(candidate?.wallRemediateMs);
  const timeline = relevantTimeline(candidate);
  const patterns = repeatedNoGainPatterns(timeline);
  const scoreDelta = baselineScore != null && candidateScore != null ? candidateScore - baselineScore : null;
  const wallDeltaMs = baselineWallMs != null && candidateWallMs != null ? Math.round((candidateWallMs - baselineWallMs) * 100) / 100 : null;
  const classified = classifyRow({ id, baseline, candidate, scoreDelta, wallDeltaMs, timeline, patterns });
  return {
    id,
    file: baseline?.file ?? candidate?.file ?? candidate?.localFile ?? null,
    role: PRIMARY_IDS.has(id) ? 'primary' : SECONDARY_IDS.has(id) ? 'secondary' : 'other',
    baselineScore,
    candidateScore,
    scoreDelta,
    baselineWallMs: baselineWallMs != null ? Math.round(baselineWallMs * 100) / 100 : null,
    candidateWallMs: candidateWallMs != null ? Math.round(candidateWallMs * 100) / 100 : null,
    wallDeltaMs,
    baselineAttempts: baseline?.appliedTools?.length ?? 0,
    candidateAttempts: candidate?.appliedTools?.length ?? 0,
    attemptsDelta: (candidate?.appliedTools?.length ?? 0) - (baseline?.appliedTools?.length ?? 0),
    categoryDeltas: categoryDeltas(baseline, candidate),
    toolTimeline: timeline,
    repeatedNoGainPatterns: patterns,
    class: classified.class,
    reasons: classified.reasons,
  };
}

function classificationDistribution(rows: Stage70RowReport[]): Record<Stage70RuntimeClass, number> {
  const keys: Stage70RuntimeClass[] = [
    'quality_gain_runtime_tradeoff',
    'known_protected_runtime_tail',
    'no_gain_repeated_tool_tail',
    'single_expensive_required_tool',
    'inconclusive_missing_duration_detail',
  ];
  return Object.fromEntries(keys.map(key => [key, rows.filter(row => row.class === key).length])) as Record<Stage70RuntimeClass, number>;
}

export function buildStage70Report(input: {
  stage45RunDir: string;
  stage69RunDir: string;
  stage45Rows: Map<string, BenchmarkRow>;
  stage69Rows: Map<string, BenchmarkRow>;
  ids?: string[];
  generatedAt?: string;
}): Stage70Report {
  const ids = input.ids ?? [...PRIMARY_IDS, ...SECONDARY_IDS];
  const rows = ids.map(id => buildRowReport(id, input.stage45Rows.get(id), input.stage69Rows.get(id)));
  const distribution = classificationDistribution(rows);
  const noGainRows = rows.filter(row => row.class === 'no_gain_repeated_tool_tail');
  const inconclusiveRows = rows.filter(row => row.class === 'inconclusive_missing_duration_detail');
  const status = inconclusiveRows.length > 0
    ? 'inconclusive'
    : noGainRows.length > 0
      ? 'implement_narrow_runtime_guard'
      : 'diagnostic_only_runtime_tradeoff';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      stage45RunDir: input.stage45RunDir,
      stage69RunDir: input.stage69RunDir,
    },
    rows,
    classificationDistribution: distribution,
    decision: {
      status,
      recommendedNext: status === 'implement_narrow_runtime_guard'
        ? 'Suppress only proven repeated no-gain same-state tool attempts, then target-run p95 offenders.'
        : status === 'diagnostic_only_runtime_tradeoff'
          ? 'Do not add a guard; proceed to repeat or p95 waiver decision.'
          : 'Collect missing duration/replay details before adding a runtime guard.',
      reasons: [
        `${noGainRows.length} no-gain repeated-tool tail row(s)`,
        `${distribution.quality_gain_runtime_tradeoff} quality-gain runtime tradeoff row(s)`,
        `${distribution.known_protected_runtime_tail} known protected runtime tail row(s)`,
        `${inconclusiveRows.length} inconclusive row(s)`,
      ],
    },
  };
}

function renderStep(step: Stage70ToolStep): string {
  return `${step.index}:${step.toolName}:${step.outcome}:${step.durationMs ?? 'n/a'}ms:${step.targetRef ?? 'no_ref'}:${step.note ?? 'no_note'}`;
}

function renderMarkdown(report: Stage70Report): string {
  const lines = [
    '# Stage 70 Runtime Tail Isolation',
    '',
    `- Stage 45 baseline: \`${report.inputs.stage45RunDir}\``,
    `- Stage 69 candidate: \`${report.inputs.stage69RunDir}\``,
    `- Decision: **${report.decision.status}**`,
    `- Recommended next: ${report.decision.recommendedNext}`,
    `- Reasons: ${report.decision.reasons.join('; ')}`,
    '',
    '## Classification Distribution',
    '',
    '```json',
    JSON.stringify(report.classificationDistribution, null, 2),
    '```',
    '',
    '## Rows',
    '',
    '| row | role | score | wall delta ms | attempts | class | repeated no-gain patterns | top tool steps |',
    '| --- | --- | ---: | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const patterns = row.repeatedNoGainPatterns
      .slice(0, 2)
      .map(pattern => `${pattern.count}x ${pattern.tools.join('+')} ${pattern.totalDurationMs}ms`)
      .join('; ') || 'none';
    const topSteps = row.toolTimeline
      .filter(step => (step.durationMs ?? 0) > 1000 || step.noGain)
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 4)
      .map(renderStep)
      .join('<br>') || 'none';
    lines.push(`| ${row.id} | ${row.role} | ${row.baselineScore ?? 'n/a'} -> ${row.candidateScore ?? 'n/a'} | ${row.wallDeltaMs ?? 'n/a'} | ${row.baselineAttempts} -> ${row.candidateAttempts} | ${row.class} | ${patterns} | ${topSteps} |`);
  }
  lines.push('');
  lines.push('Rows classified as `quality_gain_runtime_tradeoff` should not be optimized by suppressing the successful tool path. Rows classified as `no_gain_repeated_tool_tail` are eligible for a narrow Stage 70B guard only if the repeated signature is state-local and invariant-backed.');
  return `${lines.join('\n')}\n`;
}

async function loadRun(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const path = join(resolve(runDir), 'remediate.results.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as BenchmarkRow[] | { rows?: BenchmarkRow[]; results?: BenchmarkRow[] };
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : raw.results;
  if (!Array.isArray(rows)) throw new Error(`No remediation rows found in ${path}`);
  return new Map(rows.map(row => [rowKey(row), row]).filter(([key]) => key.length > 0));
}

function parseArgs(argv: string[]): { stage45Run: string; stage69Run: string; outDir: string } {
  let stage45Run = DEFAULT_STAGE45_RUN;
  let stage69Run = DEFAULT_STAGE69_RUN;
  let outDir = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--stage45-run') stage45Run = argv[++i] ?? stage45Run;
    else if (arg === '--stage69-run') stage69Run = argv[++i] ?? stage69Run;
    else if (arg === '--out') outDir = argv[++i] ?? outDir;
    else if (arg === '--help') throw new Error(usage());
  }
  return { stage45Run, stage69Run, outDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const [stage45Rows, stage69Rows] = await Promise.all([loadRun(args.stage45Run), loadRun(args.stage69Run)]);
  const report = buildStage70Report({
    stage45RunDir: resolve(args.stage45Run),
    stage69RunDir: resolve(args.stage69Run),
    stage45Rows,
    stage69Rows,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage70-runtime-tail-isolation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage70-runtime-tail-isolation.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 70 runtime-tail isolation report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

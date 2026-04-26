#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
type Classification =
  | 'safe_checkpoint_available'
  | 'deterministic_reanalysis_drop'
  | 'same_buffer_analyzer_variance'
  | 'route_guard_candidate'
  | 'stable_below_floor_no_safe_state';

interface CategoryRow {
  key: string;
  score: number;
}

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  source?: string;
  stage?: number;
  round?: number;
  scoreBefore?: number;
  scoreAfter?: number;
  durationMs?: number;
  details?: unknown;
}

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: CategoryRow[];
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  reanalyzedCategories?: CategoryRow[];
  protectedReanalysisSelection?: unknown;
  appliedTools?: ToolRow[];
  wallRemediateMs?: number;
}

interface ReplayState {
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryScoresBefore: Record<string, number>;
  categoryScoresAfter: Record<string, number>;
  detectionSignalsBefore: JsonRecord;
  detectionSignalsAfter: JsonRecord;
}

interface ToolSummary {
  index: number;
  toolName: string;
  outcome: string;
  source: string | null;
  stage: number | null;
  round: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  durationMs: number | null;
  note: string | null;
  raw: string | null;
  protectedFloorReason: string | null;
  replayState: ReplayState;
  reachesProtectedFloor: boolean;
  safeToUnsafeTransition: boolean;
  strongCategoryRegression: string | null;
}

interface RowReport {
  id: string;
  file: string | null;
  classification: Classification;
  reasons: string[];
  baseline: {
    score: number | null;
    floor: number | null;
    grade: string | null;
    categories: Record<string, number>;
  };
  candidate: {
    afterScore: number | null;
    afterGrade: string | null;
    reanalyzedScore: number | null;
    reanalyzedGrade: string | null;
    effectiveScore: number | null;
    effectiveGrade: string | null;
    afterCategories: Record<string, number>;
    reanalyzedCategories: Record<string, number>;
    categoryDeltas: Array<{ key: string; baseline: number; candidate: number; delta: number }>;
    afterVsReanalyzedDeltas: Array<{ key: string; after: number; reanalyzed: number; delta: number }>;
    protectedReanalysisSelection: unknown;
    wallRemediateMs: number | null;
  };
  safeCheckpoints: ToolSummary[];
  restoreRows: ToolSummary[];
  firstProtectedDrop: ToolSummary | null;
  riskTimeline: ToolSummary[];
  acceptedTimeline: ToolSummary[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_CANDIDATE_RUN = 'Output/experiment-corpus-baseline/run-stage121-current-node22-2026-04-26-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage122-protected-regression-closeout-2026-04-26-r1';
const DEFAULT_IDS = ['long-4516', 'structure-3775', 'long-4683'];
const RESTORE_TOOLS = new Set(['protected_best_state_restore', 'protected_reanalysis_restore']);
const ROUTE_RISK_TOOLS = new Set([
  'artifact_repeating_page_furniture',
  'mark_untagged_content_as_artifact',
  'normalize_annotation_tab_order',
  'normalize_heading_hierarchy',
  'remap_orphan_mcids_as_artifacts',
  'repair_alt_text_structure',
  'repair_native_link_structure',
  'synthesize_basic_structure_from_layout',
  'tag_unowned_annotations',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage122-protected-regression-closeout.ts [options]',
    `  --baseline-run <dir>   Default: ${DEFAULT_BASELINE_RUN}`,
    `  --candidate-run <dir>  Default: ${DEFAULT_CANDIDATE_RUN}`,
    `  --out <dir>            Default: ${DEFAULT_OUT}`,
    '  --ids <csv>            Default: long-4516,structure-3775,long-4683',
  ].join('\n');
}

function parseArgs(argv: string[]): {
  baselineRun: string;
  candidateRun: string;
  out: string;
  ids: string[];
} {
  const args = {
    baselineRun: DEFAULT_BASELINE_RUN,
    candidateRun: DEFAULT_CANDIDATE_RUN,
    out: DEFAULT_OUT,
    ids: DEFAULT_IDS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--baseline-run') args.baselineRun = next;
    else if (arg === '--candidate-run') args.candidateRun = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
}

async function readRun(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const raw = await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8');
  const rows = JSON.parse(raw) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (details && typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return { raw: details };
  }
}

function categoryMap(categories: CategoryRow[] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? []).map(category => [category.key, category.score]));
}

function effectiveScore(row?: BenchmarkRow): number | null {
  return num(row?.reanalyzedScore) ?? num(row?.afterScore);
}

function effectiveGrade(row?: BenchmarkRow): string | null {
  return str(row?.reanalyzedGrade) ?? str(row?.afterGrade);
}

function effectiveCategories(row?: BenchmarkRow): Record<string, number> {
  return row?.reanalyzedCategories?.length ? categoryMap(row.reanalyzedCategories) : categoryMap(row?.afterCategories);
}

function protectedFloor(row?: BenchmarkRow): number | null {
  const score = effectiveScore(row);
  return score == null ? null : score - 2;
}

function protectedSelectionScores(selection: unknown): number[] {
  const scores = asRecord(selection).repeatScores;
  if (!Array.isArray(scores)) return [];
  return scores.filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
}

function protectedSelectionSafeIndexes(selection: unknown): number[] {
  const indexes = asRecord(selection).floorSafeIndexes;
  if (!Array.isArray(indexes)) return [];
  return indexes.filter((index): index is number => typeof index === 'number' && Number.isInteger(index));
}

function toolName(tool: ToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function recordNumberMap(value: unknown): Record<string, number> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
  );
}

function summarizeTool(tool: ToolRow, index: number, floor: number | null, baselineCategories: Record<string, number>): ToolSummary {
  const details = parseDetails(tool.details);
  const replay = asRecord(asRecord(details.debug).replayState);
  const categoryScoresBefore = recordNumberMap(replay.categoryScoresBefore);
  const categoryScoresAfter = recordNumberMap(replay.categoryScoresAfter);
  const strongCategoryRegression = Object.entries(baselineCategories)
    .filter(([, baselineScore]) => baselineScore >= 90)
    .flatMap(([key, baselineScore]) => {
      const before = categoryScoresBefore[key];
      const after = categoryScoresAfter[key];
      if (before == null || after == null) return [];
      if (before >= baselineScore - 2 && after < baselineScore - 2) return [`${key}:${baselineScore}:${before}->${after}`];
      return [];
    })[0] ?? null;
  const replayScoreBefore = num(replay.scoreBefore);
  const replayScoreAfter = num(replay.scoreAfter);
  const scoreBefore = num(tool.scoreBefore) ?? replayScoreBefore;
  const scoreAfter = num(tool.scoreAfter) ?? replayScoreAfter;
  const reachesProtectedFloor = floor != null && scoreAfter != null && scoreAfter >= floor;
  return {
    index,
    toolName: toolName(tool),
    outcome: tool.outcome ?? 'unknown',
    source: str(tool.source),
    stage: num(tool.stage),
    round: num(tool.round),
    scoreBefore,
    scoreAfter,
    durationMs: num(tool.durationMs),
    note: str(details.note),
    raw: str(details.raw),
    protectedFloorReason: str(details.protectedFloorReason),
    replayState: {
      stateSignatureBefore: str(replay.stateSignatureBefore),
      stateSignatureAfter: str(replay.stateSignatureAfter),
      scoreBefore: replayScoreBefore,
      scoreAfter: replayScoreAfter,
      categoryScoresBefore,
      categoryScoresAfter,
      detectionSignalsBefore: asRecord(replay.detectionSignalsBefore),
      detectionSignalsAfter: asRecord(replay.detectionSignalsAfter),
    },
    reachesProtectedFloor,
    safeToUnsafeTransition: floor != null && replayScoreBefore != null && replayScoreAfter != null && replayScoreBefore >= floor && replayScoreAfter < floor,
    strongCategoryRegression,
  };
}

function categoryDeltas(
  baseline: Record<string, number>,
  candidate: Record<string, number>,
): Array<{ key: string; baseline: number; candidate: number; delta: number }> {
  return [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])]
    .flatMap(key => {
      const before = baseline[key];
      const after = candidate[key];
      if (before == null || after == null || before === after) return [];
      return [{ key, baseline: before, candidate: after, delta: after - before }];
    })
    .sort((a, b) => a.delta - b.delta || a.key.localeCompare(b.key));
}

function afterVsReanalyzedDeltas(row?: BenchmarkRow): Array<{ key: string; after: number; reanalyzed: number; delta: number }> {
  const after = categoryMap(row?.afterCategories);
  const reanalyzed = categoryMap(row?.reanalyzedCategories);
  return [...new Set([...Object.keys(after), ...Object.keys(reanalyzed)])]
    .flatMap(key => {
      const before = after[key];
      const final = reanalyzed[key];
      if (before == null || final == null || before === final) return [];
      return [{ key, after: before, reanalyzed: final, delta: final - before }];
    })
    .sort((a, b) => a.delta - b.delta || a.key.localeCompare(b.key));
}

function classify(input: {
  baseline: BenchmarkRow | undefined;
  candidate: BenchmarkRow | undefined;
  tools: ToolSummary[];
  safeCheckpoints: ToolSummary[];
  restoreRows: ToolSummary[];
}): { classification: Classification; reasons: string[] } {
  const floor = protectedFloor(input.baseline);
  const afterScore = num(input.candidate?.afterScore);
  const effective = effectiveScore(input.candidate);
  const repeatScores = protectedSelectionScores(input.candidate?.protectedReanalysisSelection);
  const safeIndexes = protectedSelectionSafeIndexes(input.candidate?.protectedReanalysisSelection);
  const reasons: string[] = [];
  if (input.restoreRows.some(tool => tool.outcome === 'applied') || safeIndexes.length > 0) {
    if (safeIndexes.length > 0) reasons.push(`floor_safe_reanalysis_indexes=${safeIndexes.join(',')}`);
    if (input.restoreRows.length > 0) reasons.push(`restore_row_count=${input.restoreRows.length}`);
    return { classification: 'safe_checkpoint_available', reasons };
  }
  if (
    floor != null &&
    afterScore != null &&
    afterScore >= floor &&
    repeatScores.length > 0 &&
    repeatScores.every(score => score < floor) &&
    Math.max(...repeatScores) - Math.min(...repeatScores) <= 2
  ) {
    reasons.push(`in_run_floor_safe_after=${afterScore}`);
    reasons.push(`stable_reanalysis_scores=${repeatScores.join(',')}`);
    return { classification: 'deterministic_reanalysis_drop', reasons };
  }
  if (repeatScores.length >= 2 && Math.max(...repeatScores) - Math.min(...repeatScores) > 10) {
    reasons.push(`same_buffer_repeat_range=${Math.min(...repeatScores)}..${Math.max(...repeatScores)}`);
    if (safeIndexes.length === 0) reasons.push('no_floor_safe_repeat');
    return { classification: 'same_buffer_analyzer_variance', reasons };
  }
  const routeDrop = input.tools.find(tool =>
    tool.outcome === 'applied' &&
    ROUTE_RISK_TOOLS.has(tool.toolName) &&
    (tool.safeToUnsafeTransition || tool.strongCategoryRegression != null)
  );
  if (routeDrop) {
    reasons.push(`first_route_drop=${routeDrop.index}:${routeDrop.toolName}`);
    if (routeDrop.strongCategoryRegression) reasons.push(`strong_category_drop=${routeDrop.strongCategoryRegression}`);
    return { classification: 'route_guard_candidate', reasons };
  }
  if (floor != null && effective != null && effective < floor) {
    reasons.push(`final_below_floor=${effective}<${floor}`);
    if (repeatScores.length > 0) reasons.push(`repeat_scores=${repeatScores.join(',')}`);
    if (input.safeCheckpoints.length > 0) reasons.push(`in_run_floor_state_count=${input.safeCheckpoints.length}`);
    return { classification: 'stable_below_floor_no_safe_state', reasons };
  }
  return { classification: 'stable_below_floor_no_safe_state', reasons: ['no_safe_route_or_checkpoint_evidence'] };
}

function buildRow(id: string, baseline: BenchmarkRow | undefined, candidate: BenchmarkRow | undefined): RowReport {
  const floor = protectedFloor(baseline);
  const baselineCategories = effectiveCategories(baseline);
  const candidateCategories = effectiveCategories(candidate);
  const tools = (candidate?.appliedTools ?? []).map((tool, index) => summarizeTool(tool, index, floor, baselineCategories));
  const safeCheckpoints = tools.filter(tool => tool.reachesProtectedFloor && tool.outcome === 'applied');
  const restoreRows = tools.filter(tool => RESTORE_TOOLS.has(tool.toolName));
  const firstProtectedDrop = tools.find(tool => tool.safeToUnsafeTransition || tool.strongCategoryRegression != null) ?? null;
  const riskTimeline = tools.filter(tool =>
    ROUTE_RISK_TOOLS.has(tool.toolName) ||
    RESTORE_TOOLS.has(tool.toolName) ||
    tool.safeToUnsafeTransition ||
    tool.strongCategoryRegression != null ||
    tool.protectedFloorReason != null
  );
  const classification = classify({ baseline, candidate, tools, safeCheckpoints, restoreRows });
  return {
    id,
    file: candidate?.file ?? baseline?.file ?? null,
    classification: classification.classification,
    reasons: classification.reasons,
    baseline: {
      score: effectiveScore(baseline),
      floor,
      grade: effectiveGrade(baseline),
      categories: baselineCategories,
    },
    candidate: {
      afterScore: num(candidate?.afterScore),
      afterGrade: str(candidate?.afterGrade),
      reanalyzedScore: num(candidate?.reanalyzedScore),
      reanalyzedGrade: str(candidate?.reanalyzedGrade),
      effectiveScore: effectiveScore(candidate),
      effectiveGrade: effectiveGrade(candidate),
      afterCategories: categoryMap(candidate?.afterCategories),
      reanalyzedCategories: categoryMap(candidate?.reanalyzedCategories),
      categoryDeltas: categoryDeltas(baselineCategories, candidateCategories),
      afterVsReanalyzedDeltas: afterVsReanalyzedDeltas(candidate),
      protectedReanalysisSelection: candidate?.protectedReanalysisSelection ?? null,
      wallRemediateMs: num(candidate?.wallRemediateMs),
    },
    safeCheckpoints,
    restoreRows,
    firstProtectedDrop,
    riskTimeline,
    acceptedTimeline: tools.filter(tool => tool.outcome === 'applied'),
  };
}

function compactTool(tool: ToolSummary): string {
  const score = `${tool.scoreBefore ?? tool.replayState.scoreBefore ?? '?'}->${tool.scoreAfter ?? tool.replayState.scoreAfter ?? '?'}`;
  const note = tool.note ?? tool.raw ?? tool.protectedFloorReason;
  return `#${tool.index} ${tool.toolName}/${tool.outcome} ${score}${note ? ` (${note})` : ''}`;
}

function renderMarkdown(input: {
  baselineRun: string;
  candidateRun: string;
  rows: RowReport[];
}): string {
  const distribution = input.rows.reduce<Record<string, number>>((out, row) => {
    out[row.classification] = (out[row.classification] ?? 0) + 1;
    return out;
  }, {});
  const lines = [
    '# Stage 122 Protected Regression Closeout Diagnostic',
    '',
    '## Inputs',
    '',
    `- Baseline: \`${input.baselineRun}\``,
    `- Candidate: \`${input.candidateRun}\``,
    `- Classification distribution: ${Object.entries(distribution).map(([key, count]) => `${key}: ${count}`).join(', ') || 'none'}`,
    '',
    '## Rows',
    '',
  ];
  for (const row of input.rows) {
    lines.push(`### ${row.id}`);
    lines.push(`- Classification: \`${row.classification}\``);
    lines.push(`- Reasons: ${row.reasons.join('; ') || 'none'}`);
    lines.push(`- Scores: Stage42 ${row.baseline.score ?? 'n/a'} floor ${row.baseline.floor ?? 'n/a'} -> after ${row.candidate.afterScore ?? 'n/a'} / reanalyzed ${row.candidate.reanalyzedScore ?? 'n/a'}`);
    lines.push(`- Protected selection: \`${JSON.stringify(row.candidate.protectedReanalysisSelection ?? null)}\``);
    if (row.candidate.categoryDeltas.length > 0) {
      lines.push(`- Stage42 category drops: ${row.candidate.categoryDeltas.filter(delta => delta.delta < 0).slice(0, 6).map(delta => `${delta.key}:${delta.baseline}->${delta.candidate}`).join(', ') || 'none'}`);
    }
    if (row.candidate.afterVsReanalyzedDeltas.length > 0) {
      lines.push(`- After vs reanalyzed drops: ${row.candidate.afterVsReanalyzedDeltas.filter(delta => delta.delta < 0).slice(0, 6).map(delta => `${delta.key}:${delta.after}->${delta.reanalyzed}`).join(', ') || 'none'}`);
    }
    lines.push(`- Safe checkpoint count: ${row.safeCheckpoints.length}`);
    if (row.firstProtectedDrop) lines.push(`- First protected drop: ${compactTool(row.firstProtectedDrop)}`);
    if (row.restoreRows.length > 0) lines.push(`- Restore rows: ${row.restoreRows.map(compactTool).join(' | ')}`);
    lines.push(`- Recent risk timeline: ${row.riskTimeline.slice(-10).map(compactTool).join(' | ') || 'none'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [baselineRows, candidateRows] = await Promise.all([
    readRun(args.baselineRun),
    readRun(args.candidateRun),
  ]);
  const rows = args.ids.map(id => buildRow(id, baselineRows.get(id), candidateRows.get(id)));
  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    baselineRun: resolve(args.baselineRun),
    candidateRun: resolve(args.candidateRun),
    ids: args.ids,
    rows,
  };
  await writeFile(join(out, 'stage122-protected-regression-closeout.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage122-protected-regression-closeout.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
  for (const row of rows) {
    console.log(`${row.id}: ${row.classification} (${row.reasons.join('; ') || 'no reasons'})`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

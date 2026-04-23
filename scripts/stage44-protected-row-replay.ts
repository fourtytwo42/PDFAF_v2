#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

type CategoryMap = Record<string, number>;

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  stage?: number;
  round?: number;
  source?: string;
  details?: unknown;
}

interface BenchmarkRow {
  id: string;
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterCategories?: Array<{ key: string; score: number }>;
  afterScoreCapsApplied?: unknown[];
  appliedTools?: ToolRow[];
}

interface RunRows {
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

const DEFAULT_IDS = ['long-4683', 'long-4680', 'structure-4076'];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage44-protected-row-replay.ts [--id row-id ...] <baseline-run-dir> <candidate-run-dir> [compare-run-dir ...] [out-dir]',
    'If the final argument does not contain remediate.results.json, it is treated as the output directory.',
  ].join('\n');
}

function parseArgs(argv: string[]): { ids: string[]; paths: string[] } {
  const ids: string[] = [];
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--id') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value after --id');
      ids.push(value);
      i += 1;
      continue;
    }
    paths.push(arg);
  }
  return { ids, paths };
}

async function loadRows(runDir: string): Promise<RunRows> {
  const path = join(runDir, 'remediate.results.json');
  const raw = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(path, 'utf8')));
  const rows: BenchmarkRow[] = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) throw new Error(`No remediate rows found in ${path}`);
  return {
    runDir,
    rows: new Map(rows.map(row => [row.id, row])),
  };
}

function categories(row?: BenchmarkRow): CategoryMap {
  const out: CategoryMap = {};
  for (const category of row?.afterCategories ?? []) out[category.key] = category.score;
  return out;
}

function score(row?: BenchmarkRow): number {
  return typeof row?.afterScore === 'number' ? row.afterScore : 0;
}

function floor(row?: BenchmarkRow): number {
  return score(row) - 2;
}

function parseDetails(details: unknown): Record<string, unknown> {
  if (!details) return {};
  if (typeof details === 'object') return details as Record<string, unknown>;
  if (typeof details !== 'string') return {};
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return { raw: details };
  }
}

function strongCategoryRegressions(baseline: BenchmarkRow | undefined, candidateCats: CategoryMap): string[] {
  const baseCats = categories(baseline);
  const out: string[] = [];
  for (const [key, baseScore] of Object.entries(baseCats)) {
    if (baseScore < 90) continue;
    const after = candidateCats[key];
    if (typeof after === 'number' && after < baseScore - 2) {
      out.push(`${key}:${baseScore}->${after}`);
    }
  }
  return out;
}

function categoryDeltas(baseline: BenchmarkRow | undefined, candidate: BenchmarkRow | undefined): Record<string, { baseline: number; candidate: number; delta: number }> {
  const baseCats = categories(baseline);
  const candCats = categories(candidate);
  const out: Record<string, { baseline: number; candidate: number; delta: number }> = {};
  for (const [key, baseScore] of Object.entries(baseCats)) {
    const cand = candCats[key];
    if (typeof cand === 'number' && cand !== baseScore) {
      out[key] = { baseline: baseScore, candidate: cand, delta: cand - baseScore };
    }
  }
  return out;
}

function toolTimeline(row: BenchmarkRow | undefined, baseline: BenchmarkRow | undefined): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const baseFloor = floor(baseline);
  for (const [index, tool] of (row?.appliedTools ?? []).entries()) {
    const details = parseDetails(tool.details);
    const scoreAfter = typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null;
    out.push({
      index,
      toolName: tool.toolName ?? tool.name ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
      stage: tool.stage ?? null,
      round: tool.round ?? null,
      source: tool.source ?? null,
      scoreBefore: tool.scoreBefore ?? null,
      scoreAfter,
      reachesFloor: scoreAfter != null ? scoreAfter >= baseFloor : false,
      note: details['note'] ?? details['raw'] ?? null,
      protectedFloorReason: details['protectedFloorReason'] ?? null,
      protectedCandidateScore: details['protectedCandidateScore'] ?? null,
      protectedRestoredScore: details['protectedRestoredScore'] ?? null,
    });
  }
  return out;
}

function summarizeRow(id: string, baseline: BenchmarkRow | undefined, runs: RunRows[]): Record<string, unknown> {
  const baseFloor = floor(baseline);
  return {
    id,
    baseline: {
      score: score(baseline),
      floor: baseFloor,
      grade: baseline?.afterGrade ?? null,
      categories: categories(baseline),
    },
    runs: runs.map(run => {
      const row = run.rows.get(id);
      const cats = categories(row);
      const timeline = toolTimeline(row, baseline);
      const firstBelowFloor = timeline.find(tool => typeof tool['scoreAfter'] === 'number' && (tool['scoreAfter'] as number) < baseFloor) ?? null;
      const firstAcceptedCategoryChange = timeline.find(tool => {
        if (tool['outcome'] !== 'applied') return false;
        const scoreAfter = typeof tool['scoreAfter'] === 'number' ? tool['scoreAfter'] as number : null;
        return scoreAfter !== null;
      }) ?? null;
      const floorStates = timeline.filter(tool => tool['reachesFloor']);
      return {
        runDir: run.runDir,
        score: score(row),
        grade: row?.afterGrade ?? null,
        protectedRegression: score(row) < baseFloor,
        categoryDeltas: categoryDeltas(baseline, row),
        strongCategoryRegressions: strongCategoryRegressions(baseline, cats),
        firstBelowFloor,
        firstAcceptedCategoryChange,
        floorStateCount: floorStates.length,
        lastFloorState: floorStates.at(-1) ?? null,
        toolTimeline: timeline,
      };
    }),
  };
}

function markdown(report: Record<string, unknown>[]): string {
  const lines = ['# Stage 44 Protected Row Replay', ''];
  for (const item of report) {
    const id = String(item['id']);
    const baseline = item['baseline'] as Record<string, unknown>;
    lines.push(`## ${id}`, '');
    lines.push(`Baseline: ${baseline['score']} floor ${baseline['floor']} (${baseline['grade']})`, '');
    for (const run of item['runs'] as Array<Record<string, unknown>>) {
      lines.push(`### ${run['runDir']}`);
      lines.push(`Score: ${run['score']} (${run['grade']}); protected regression: ${run['protectedRegression']}`);
      const regressions = run['strongCategoryRegressions'] as string[];
      if (regressions.length) lines.push(`Strong category regressions: ${regressions.join(', ')}`);
      const first = run['firstBelowFloor'] as Record<string, unknown> | null;
      if (first) lines.push(`First below floor: #${first['index']} ${first['toolName']} ${first['outcome']} scoreAfter=${first['scoreAfter']} note=${first['note'] ?? first['protectedFloorReason'] ?? ''}`);
      const firstAccepted = run['firstAcceptedCategoryChange'] as Record<string, unknown> | null;
      if (firstAccepted) lines.push(`First accepted tool: #${firstAccepted['index']} ${firstAccepted['toolName']} ${firstAccepted['outcome']} scoreAfter=${firstAccepted['scoreAfter']}`);
      const last = run['lastFloorState'] as Record<string, unknown> | null;
      if (last) lines.push(`Last floor-reaching tool: #${last['index']} ${last['toolName']} ${last['outcome']} scoreAfter=${last['scoreAfter']}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const args = parsed.paths.map(arg => resolve(arg));
  if (args.length < 2) throw new Error(usage());
  let outDir = '';
  const candidateArgs = [...args];
  const possibleOut = candidateArgs.at(-1)!;
  try {
    await loadRows(possibleOut);
  } catch {
    outDir = candidateArgs.pop()!;
  }
  if (candidateArgs.length < 2) throw new Error(usage());
  const [baselineDir, ...runDirs] = candidateArgs;
  const baseline = await loadRows(baselineDir!);
  const runs = await Promise.all(runDirs.map(loadRows));
  const ids = parsed.ids.length > 0 ? parsed.ids : DEFAULT_IDS;
  const report = ids.map(id => summarizeRow(id, baseline.rows.get(id), runs));
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'stage44-protected-row-replay.json'), JSON.stringify(report, null, 2));
    await writeFile(join(outDir, 'stage44-protected-row-replay.md'), markdown(report));
    console.log(`Wrote protected-row replay report to ${outDir}`);
  }
  for (const item of report) {
    console.log(`\n${item['id']}`);
    const baselineInfo = item['baseline'] as Record<string, unknown>;
    console.log(`  baseline ${baselineInfo['score']} floor ${baselineInfo['floor']}`);
    for (const run of item['runs'] as Array<Record<string, unknown>>) {
      console.log(`  ${run['runDir']}: ${run['score']} ${run['grade']} regression=${run['protectedRegression']} floorStates=${run['floorStateCount']}`);
      const regressions = run['strongCategoryRegressions'] as string[];
      if (regressions.length) console.log(`    strong regressions: ${regressions.join(', ')}`);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

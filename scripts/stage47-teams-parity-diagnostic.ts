#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type CategoryScores = Record<string, number>;

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  source?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
  durationMs?: number;
}

interface BenchmarkRow {
  id: string;
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterCategories?: Array<{ key: string; score: number }>;
  afterDetectionProfile?: DetectionProfile | null;
  afterIcjiaParity?: IcjiaParity | null;
  appliedTools?: ToolRow[];
  wallRemediateMs?: number;
}

interface DetectionProfile {
  readingOrderSignals?: Record<string, unknown>;
  headingSignals?: Record<string, unknown>;
  figureSignals?: Record<string, unknown>;
  pdfUaSignals?: Record<string, unknown>;
  annotationSignals?: Record<string, unknown>;
}

interface IcjiaParity {
  overallScore?: number;
  grade?: string;
  categories?: Record<string, { score?: number; findings?: string[] }>;
  signals?: Record<string, unknown>;
}

interface RunData {
  label: string;
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

const DEFAULT_IDS = ['fixture-teams-original', 'fixture-teams-remediated', 'fixture-teams-targeted-wave1'];
const KEY_CATEGORIES = ['heading_structure', 'alt_text', 'reading_order', 'pdf_ua_compliance'] as const;

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage47-teams-parity-diagnostic.ts [--id row-id ...] <stage42-baseline-dir> <stage45-run-dir> <stage47-r1-run-dir> [out-dir]',
    'The final path is treated as an output directory when it does not contain remediate.results.json.',
  ].join('\n');
}

function parseArgs(argv: string[]): { ids: string[]; paths: string[] } {
  const ids: string[] = [];
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--id') {
      const id = argv[i + 1];
      if (!id) throw new Error('Missing value after --id');
      ids.push(id);
      i += 1;
    } else {
      paths.push(arg);
    }
  }
  return { ids, paths };
}

async function loadRows(runDir: string, label: string): Promise<RunData> {
  const raw = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8'));
  const rows: BenchmarkRow[] = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) throw new Error(`No remediate rows found in ${runDir}`);
  return {
    label,
    runDir,
    rows: new Map(rows.map(row => [row.id, row])),
  };
}

async function pathContainsRun(path: string): Promise<boolean> {
  try {
    await readFile(join(path, 'remediate.results.json'), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function score(row?: BenchmarkRow): number {
  return typeof row?.afterScore === 'number' ? row.afterScore : 0;
}

function categories(row?: BenchmarkRow): CategoryScores {
  const out: CategoryScores = {};
  for (const category of row?.afterCategories ?? []) out[category.key] = category.score;
  return out;
}

function parityCategories(row?: BenchmarkRow): CategoryScores {
  const out: CategoryScores = {};
  for (const [key, category] of Object.entries(row?.afterIcjiaParity?.categories ?? {})) {
    if (typeof category.score === 'number') out[key] = category.score;
  }
  return out;
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

function toolName(tool: ToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function keyCategoryDeltas(baseline: BenchmarkRow | undefined, row: BenchmarkRow | undefined): Record<string, { baseline: number | null; candidate: number | null; delta: number | null }> {
  const base = categories(baseline);
  const cand = categories(row);
  const out: Record<string, { baseline: number | null; candidate: number | null; delta: number | null }> = {};
  for (const key of KEY_CATEGORIES) {
    const b = base[key];
    const c = cand[key];
    out[key] = {
      baseline: typeof b === 'number' ? b : null,
      candidate: typeof c === 'number' ? c : null,
      delta: typeof b === 'number' && typeof c === 'number' ? c - b : null,
    };
  }
  return out;
}

function finalSignals(row?: BenchmarkRow): Record<string, unknown> {
  return {
    detection: {
      readingOrder: row?.afterDetectionProfile?.readingOrderSignals ?? null,
      heading: row?.afterDetectionProfile?.headingSignals ?? null,
      figure: row?.afterDetectionProfile?.figureSignals ?? null,
      pdfUa: row?.afterDetectionProfile?.pdfUaSignals ?? null,
      annotation: row?.afterDetectionProfile?.annotationSignals ?? null,
    },
    icjiaParity: {
      overallScore: row?.afterIcjiaParity?.overallScore ?? null,
      grade: row?.afterIcjiaParity?.grade ?? null,
      categories: parityCategories(row),
      signals: row?.afterIcjiaParity?.signals ?? null,
    },
  };
}

function summarizeTool(tool: ToolRow, index: number, floor: number): Record<string, unknown> {
  const details = parseDetails(tool.details);
  const invariants = details['invariants'] && typeof details['invariants'] === 'object'
    ? details['invariants'] as Record<string, unknown>
    : {};
  const structuralBenefits = details['structuralBenefits'] && typeof details['structuralBenefits'] === 'object'
    ? details['structuralBenefits'] as Record<string, unknown>
    : {};
  const scoreAfter = typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null;
  return {
    index,
    toolName: toolName(tool),
    outcome: tool.outcome ?? 'unknown',
    stage: tool.stage ?? null,
    round: tool.round ?? null,
    source: tool.source ?? null,
    scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
    scoreAfter,
    delta: typeof tool.delta === 'number' ? tool.delta : null,
    reachesProtectedFloor: scoreAfter != null ? scoreAfter >= floor : false,
    note: details['note'] ?? details['raw'] ?? null,
    protectedFloorReason: details['protectedFloorReason'] ?? null,
    invariantHighlights: {
      rootReachableHeadingCountAfter: invariants['rootReachableHeadingCountAfter'] ?? null,
      rootReachableDepthAfter: invariants['rootReachableDepthAfter'] ?? null,
      targetReachable: invariants['targetReachable'] ?? null,
      targetIsFigureAfter: invariants['targetIsFigureAfter'] ?? null,
      targetHasAltAfter: invariants['targetHasAltAfter'] ?? null,
      ownershipPreserved: invariants['ownershipPreserved'] ?? null,
      visibleAnnotationsMissingStructParentAfter: invariants['visibleAnnotationsMissingStructParentAfter'] ?? null,
      visibleAnnotationsMissingStructureAfter: invariants['visibleAnnotationsMissingStructureAfter'] ?? null,
    },
    structuralBenefits,
  };
}

function strongCategoryRegressions(baseline: BenchmarkRow | undefined, row: BenchmarkRow | undefined): string[] {
  const base = categories(baseline);
  const cand = categories(row);
  const out: string[] = [];
  for (const [key, baselineScore] of Object.entries(base)) {
    if (baselineScore < 90) continue;
    const after = cand[key];
    if (typeof after === 'number' && after < baselineScore - 2) {
      out.push(`${key}:${baselineScore}->${after}`);
    }
  }
  return out;
}

function sameRunSafeStateEvidence(baseline: BenchmarkRow | undefined, row: BenchmarkRow | undefined, timeline: Array<Record<string, unknown>>): { status: 'yes' | 'no' | 'inconclusive'; reason: string } {
  if (!baseline || !row) return { status: 'inconclusive', reason: 'missing_row' };
  const floor = score(baseline) - 2;
  const floorStates = timeline.filter(tool => tool['reachesProtectedFloor'] === true);
  if (floorStates.length === 0) return { status: 'no', reason: 'no_tool_score_after_reached_protected_floor' };
  const regressions = strongCategoryRegressions(baseline, row);
  if (score(row) >= floor && regressions.length === 0) return { status: 'yes', reason: 'final_state_reaches_floor_with_no_strong_category_regression' };
  return { status: 'inconclusive', reason: 'intermediate_tool_reached_floor_but_benchmark_rows_do_not_store_per_step_categories' };
}

function answerQuestions(rowId: string, baseline: BenchmarkRow | undefined, stage45: BenchmarkRow | undefined, failed47: BenchmarkRow | undefined): Record<string, unknown> {
  const stage45Cats = categories(stage45);
  const failedCats = categories(failed47);
  const baseCats = categories(baseline);
  const answers: Record<string, unknown> = {};
  if (rowId === 'fixture-teams-original') {
    answers['whyHeadingLost'] = {
      stage45: `final heading_structure ${baseCats.heading_structure ?? 'n/a'} -> ${stage45Cats.heading_structure ?? 'n/a'}`,
      failed47: `final heading_structure ${baseCats.heading_structure ?? 'n/a'} -> ${failedCats.heading_structure ?? 'n/a'}`,
      likelyCause: 'benchmark artifacts show the row never reaches the Stage 42 floor after initial structural recovery; per-step category snapshots are required to distinguish scorer parity from a specific heading mutator',
    };
  }
  if (rowId === 'fixture-teams-remediated') {
    answers['whyAltAndReadingOrderConflict'] = {
      stage45: `final alt_text ${stage45Cats.alt_text ?? 'n/a'}, reading_order ${stage45Cats.reading_order ?? 'n/a'}`,
      failed47: `final alt_text ${failedCats.alt_text ?? 'n/a'}, reading_order ${failedCats.reading_order ?? 'n/a'}`,
      interpretation: 'Stage 47 r1 confirmed blocking alt cleanup can keep reading order high while losing alt recovery; Stage 45 confirms accepting alt cleanup restores alt but leaves reading_order below protected floor',
    };
  }
  return answers;
}

function summarizeRun(label: string, row: BenchmarkRow | undefined, baseline: BenchmarkRow | undefined): Record<string, unknown> {
  const floor = score(baseline) - 2;
  const timeline = (row?.appliedTools ?? []).map((tool, index) => summarizeTool(tool, index, floor));
  return {
    label,
    score: score(row),
    grade: row?.afterGrade ?? null,
    wallRemediateMs: row?.wallRemediateMs ?? null,
    protectedRegression: score(row) < floor,
    keyCategoryDeltas: keyCategoryDeltas(baseline, row),
    strongCategoryRegressions: strongCategoryRegressions(baseline, row),
    sameRunSafeStateEvidence: sameRunSafeStateEvidence(baseline, row, timeline),
    firstFloorState: timeline.find(tool => tool['reachesProtectedFloor'] === true) ?? null,
    finalSignals: finalSignals(row),
    toolTimeline: timeline,
  };
}

function summarizeRow(id: string, baselineRun: RunData, compareRuns: RunData[]): Record<string, unknown> {
  const baseline = baselineRun.rows.get(id);
  const runs = compareRuns.map(run => summarizeRun(run.label, run.rows.get(id), baseline));
  return {
    id,
    file: baseline?.file ?? compareRuns.map(run => run.rows.get(id)?.file).find(Boolean) ?? null,
    baseline: {
      label: baselineRun.label,
      score: score(baseline),
      grade: baseline?.afterGrade ?? null,
      protectedFloor: score(baseline) - 2,
      keyCategories: Object.fromEntries(KEY_CATEGORIES.map(key => [key, categories(baseline)[key] ?? null])),
      finalSignals: finalSignals(baseline),
    },
    runs,
    diagnosticAnswers: answerQuestions(
      id,
      baseline,
      compareRuns.find(run => run.label === 'stage45')?.rows.get(id),
      compareRuns.find(run => run.label === 'stage47_r1')?.rows.get(id),
    ),
  };
}

function markdown(report: Record<string, unknown>[]): string {
  const lines = ['# Stage 47A Teams Protected Parity Diagnostic', ''];
  lines.push('This diagnostic is read-only. It compares final category/signal state and per-tool score timelines; benchmark rows do not contain per-tool category snapshots, so intermediate safe-state category checks are reported as inconclusive when needed.', '');
  for (const item of report) {
    const baseline = item['baseline'] as Record<string, unknown>;
    lines.push(`## ${item['id']}`, '');
    lines.push(`Baseline: ${baseline['score']} ${baseline['grade']} floor ${baseline['protectedFloor']}`);
    lines.push(`Baseline key categories: \`${JSON.stringify(baseline['keyCategories'])}\``, '');
    for (const run of item['runs'] as Array<Record<string, unknown>>) {
      lines.push(`### ${run['label']}`);
      lines.push(`Score: ${run['score']} ${run['grade']}; protected regression: ${run['protectedRegression']}; wall ms: ${run['wallRemediateMs'] ?? 'n/a'}`);
      lines.push(`Key category deltas: \`${JSON.stringify(run['keyCategoryDeltas'])}\``);
      const regressions = run['strongCategoryRegressions'] as string[];
      if (regressions.length) lines.push(`Strong category regressions: ${regressions.join(', ')}`);
      const safe = run['sameRunSafeStateEvidence'] as Record<string, unknown>;
      lines.push(`Same-run safe-state evidence: ${safe['status']} (${safe['reason']})`);
      const first = run['firstFloorState'] as Record<string, unknown> | null;
      if (first) lines.push(`First floor-reaching tool: #${first['index']} ${first['toolName']} ${first['outcome']} scoreAfter=${first['scoreAfter']} note=${first['note'] ?? first['protectedFloorReason'] ?? ''}`);
      const tools = run['toolTimeline'] as Array<Record<string, unknown>>;
      const notable = tools.filter(tool =>
        ['repair_alt_text_structure', 'remap_orphan_mcids_as_artifacts', 'normalize_heading_hierarchy', 'synthesize_basic_structure_from_layout', 'repair_structure_conformance'].includes(String(tool['toolName']))
      );
      if (notable.length) {
        lines.push('Notable tool timeline:');
        for (const tool of notable) {
          lines.push(`- #${tool['index']} ${tool['toolName']} ${tool['outcome']} ${tool['scoreBefore']} -> ${tool['scoreAfter']} note=${tool['note'] ?? tool['protectedFloorReason'] ?? ''}`);
        }
      }
      lines.push('');
    }
    const answers = item['diagnosticAnswers'] as Record<string, unknown>;
    if (Object.keys(answers).length) {
      lines.push('Diagnostic answers:');
      lines.push(`\`${JSON.stringify(answers)}\``, '');
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const paths = parsed.paths.map(path => resolve(path));
  if (paths.length < 3) throw new Error(usage());
  let outDir = '';
  const runPaths = [...paths];
  if (runPaths.length > 3 && !(await pathContainsRun(runPaths.at(-1)!))) {
    outDir = runPaths.pop()!;
  }
  if (runPaths.length !== 3) throw new Error(usage());

  const [baselineDir, stage45Dir, stage47Dir] = runPaths;
  const [baseline, stage45, stage47] = await Promise.all([
    loadRows(baselineDir!, 'stage42_baseline'),
    loadRows(stage45Dir!, 'stage45'),
    loadRows(stage47Dir!, 'stage47_r1'),
  ]);
  const ids = parsed.ids.length > 0 ? parsed.ids : DEFAULT_IDS;
  const report = ids.map(id => summarizeRow(id, baseline, [stage45, stage47]));
  const outputDir = outDir || 'Output/experiment-corpus-baseline/stage47a-teams-parity-diagnostic';
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'stage47a-teams-parity-diagnostic.json'), JSON.stringify(report, null, 2));
  await writeFile(join(outputDir, 'stage47a-teams-parity-diagnostic.md'), markdown(report));
  console.log(`Wrote Stage 47A Teams parity diagnostic to ${outputDir}`);
  for (const item of report) {
    console.log(`\n${item['id']}`);
    for (const run of item['runs'] as Array<Record<string, unknown>>) {
      const safe = run['sameRunSafeStateEvidence'] as Record<string, unknown>;
      const regressions = run['strongCategoryRegressions'] as string[];
      console.log(`  ${run['label']}: ${run['score']} ${run['grade']} regression=${run['protectedRegression']} safeState=${safe['status']} strongRegressions=${regressions.join(',') || 'none'}`);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

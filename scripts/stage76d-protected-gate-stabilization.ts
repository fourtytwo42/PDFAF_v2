#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

interface BenchmarkCategory {
  key: string;
  score: number;
}

interface BenchmarkToolRow {
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

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: BenchmarkCategory[];
  reanalyzedCategories?: BenchmarkCategory[];
  appliedTools?: BenchmarkToolRow[];
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
}

interface RowSummary {
  run: string;
  score: number | null;
  grade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  effectiveScore: number | null;
  effectiveGrade: string | null;
  wallMs: number | null;
  attempts: number;
  categories: Record<string, number>;
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
  stateSignatureBefore: string | null;
}

type Stage76DClassification =
  | 'safe_checkpoint_exists'
  | 'no_safe_checkpoint'
  | 'final_reanalysis_harm'
  | 'protected_route_harm'
  | 'analyzer_volatility_only';

interface Stage76DRowReport {
  id: string;
  file: string | null;
  baseline: RowSummary | null;
  stage76: RowSummary | null;
  stage76b: RowSummary | null;
  repeats: RowSummary[];
  classification: Stage76DClassification;
  reasons: string[];
  protectedRestores: ToolSummary[];
  protectedRiskTools: ToolSummary[];
}

const DEFAULT_STAGE42_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STAGE76_RUN = 'Output/experiment-corpus-baseline/run-stage76-full-2026-04-25-r1';
const DEFAULT_STAGE76B_RUN = 'Output/experiment-corpus-baseline/run-stage76b-full-2026-04-25-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage76d-protected-gate-stabilization-2026-04-25-r1';
const DEFAULT_IDS = [
  'structure-4076',
  'long-4680',
  'fixture-teams-remediated',
  'short-4660',
  'long-4516',
  'fixture-teams-targeted-wave1',
];
const PROTECTED_RISK_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'mark_untagged_content_as_artifact',
  'artifact_repeating_page_furniture',
  'normalize_heading_hierarchy',
  'normalize_annotation_tab_order',
  'repair_structure_conformance',
  'repair_alt_text_structure',
  'retag_as_figure',
  'canonicalize_figure_alt_ownership',
  'normalize_nested_figure_containers',
  'set_figure_alt_text',
  'normalize_table_structure',
  'set_table_header_cells',
]);
const PROTECTED_RESTORE_TOOLS = new Set(['protected_best_state_restore', 'protected_reanalysis_restore']);
const SCORE_TOLERANCE = 2;

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage76d-protected-gate-stabilization.ts [options]',
    `  --baseline-run <dir> Default: ${DEFAULT_STAGE42_RUN}`,
    `  --stage76-run <dir>  Default: ${DEFAULT_STAGE76_RUN}`,
    `  --stage76b-run <dir> Default: ${DEFAULT_STAGE76B_RUN}`,
    '  --repeat-run <dir>   Optional, can be provided multiple times',
    `  --out <dir>          Default: ${DEFAULT_OUT}`,
    '  --ids <csv>          Default: Stage 76B protected regression ids',
  ].join('\n');
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseArgs(argv: string[]): {
  baselineRun: string;
  stage76Run: string;
  stage76bRun: string;
  repeatRuns: string[];
  out: string;
  ids: string[];
} {
  const args = {
    baselineRun: DEFAULT_STAGE42_RUN,
    stage76Run: DEFAULT_STAGE76_RUN,
    stage76bRun: DEFAULT_STAGE76B_RUN,
    repeatRuns: [] as string[],
    out: DEFAULT_OUT,
    ids: DEFAULT_IDS,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--baseline-run') args.baselineRun = next;
    else if (arg === '--stage76-run') args.stage76Run = next;
    else if (arg === '--stage76b-run') args.stage76bRun = next;
    else if (arg === '--repeat-run') args.repeatRuns.push(next);
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
    i++;
  }
  return args;
}

async function readRun(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const raw = await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8');
  const rows = JSON.parse(raw) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
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

function toolName(tool: BenchmarkToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function toolSummary(tool: BenchmarkToolRow, index: number): ToolSummary {
  const details = parseDetails(tool.details);
  const replayState = asRecord(asRecord(details.debug).replayState);
  return {
    index,
    toolName: toolName(tool),
    outcome: tool.outcome ?? 'unknown',
    source: str(tool.source) || null,
    stage: num(tool.stage),
    round: num(tool.round),
    scoreBefore: num(tool.scoreBefore),
    scoreAfter: num(tool.scoreAfter),
    durationMs: num(tool.durationMs),
    note: str(details.note) || str(details.raw) || null,
    stateSignatureBefore: str(replayState.stateSignatureBefore) || null,
  };
}

function categories(row?: BenchmarkRow): Record<string, number> {
  const source = row?.reanalyzedCategories?.length ? row.reanalyzedCategories : row?.afterCategories ?? [];
  return Object.fromEntries(source.map(category => [category.key, category.score]));
}

function summarize(run: string, row?: BenchmarkRow): RowSummary | null {
  if (!row) return null;
  return {
    run,
    score: num(row.afterScore),
    grade: str(row.afterGrade) || null,
    reanalyzedScore: num(row.reanalyzedScore),
    reanalyzedGrade: str(row.reanalyzedGrade) || null,
    effectiveScore: num(row.reanalyzedScore) ?? num(row.afterScore),
    effectiveGrade: str(row.reanalyzedGrade) || str(row.afterGrade) || null,
    wallMs: num(row.wallRemediateMs),
    attempts: row.appliedTools?.length ?? 0,
    categories: categories(row),
  };
}

function effectiveScore(row?: BenchmarkRow): number | null {
  return num(row?.reanalyzedScore) ?? num(row?.afterScore);
}

function belowBaseline(baseline?: BenchmarkRow, candidate?: BenchmarkRow): boolean {
  const before = effectiveScore(baseline);
  const after = effectiveScore(candidate);
  return before != null && after != null && after < before - SCORE_TOLERANCE;
}

function runEffectiveScores(rows: Array<BenchmarkRow | undefined>): number[] {
  return rows.flatMap(row => {
    const score = effectiveScore(row);
    return score == null ? [] : [score];
  });
}

function classify(input: {
  baseline?: BenchmarkRow;
  stage76?: BenchmarkRow;
  stage76b?: BenchmarkRow;
  repeats: Array<BenchmarkRow | undefined>;
  protectedRestores: ToolSummary[];
  protectedRiskTools: ToolSummary[];
}): { classification: Stage76DClassification; reasons: string[] } {
  const reasons: string[] = [];
  const scores = runEffectiveScores([input.stage76, input.stage76b, ...input.repeats]);
  if (scores.length >= 3 && Math.max(...scores) - Math.min(...scores) > 10) {
    reasons.push(`repeat_effective_score_range=${Math.min(...scores)}..${Math.max(...scores)}`);
    return { classification: 'analyzer_volatility_only', reasons };
  }

  const stage76Score = effectiveScore(input.stage76);
  const stage76bScore = effectiveScore(input.stage76b);
  if (stage76Score != null && stage76bScore != null && stage76bScore < stage76Score - SCORE_TOLERANCE) {
    reasons.push(`stage76b_below_stage76(${stage76Score}->${stage76bScore})`);
    if (input.protectedRestores.length === 0) {
      reasons.push('final_reanalysis_has_no_safe_restore_row');
      return { classification: 'final_reanalysis_harm', reasons };
    }
  }

  const below = belowBaseline(input.baseline, input.stage76b);
  if (below) reasons.push('stage76b_below_protected_baseline');
  if (input.protectedRestores.length > 0) {
    reasons.push(`protected_restore_count=${input.protectedRestores.length}`);
    return { classification: 'safe_checkpoint_exists', reasons };
  }
  if (below && input.protectedRiskTools.length > 0) {
    reasons.push(`protected_risk_tool_count=${input.protectedRiskTools.length}`);
    return { classification: 'protected_route_harm', reasons };
  }
  if (below) {
    reasons.push('no_protected_restore_checkpoint_recorded');
    return { classification: 'no_safe_checkpoint', reasons };
  }
  return { classification: 'no_safe_checkpoint', reasons: ['no_repeatable_safe_checkpoint_evidence'] };
}

function md(report: {
  rows: Stage76DRowReport[];
  inputs: Record<string, string | string[]>;
}): string {
  const lines = [
    '# Stage 76D Protected Gate Stabilization Diagnostic',
    '',
    '## Inputs',
    '',
    `- Baseline: \`${report.inputs.baselineRun}\``,
    `- Stage 76: \`${report.inputs.stage76Run}\``,
    `- Stage 76B: \`${report.inputs.stage76bRun}\``,
    `- Repeats: ${Array.isArray(report.inputs.repeatRuns) && report.inputs.repeatRuns.length > 0 ? report.inputs.repeatRuns.map(run => `\`${run}\``).join(', ') : 'none'}`,
    '',
    '## Rows',
    '',
    '| Row | Class | Baseline | Stage76 | Stage76B | Repeats | Reasons |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      row.id,
      row.classification,
      row.baseline?.effectiveScore ?? '',
      row.stage76?.effectiveScore ?? '',
      row.stage76b?.effectiveScore ?? '',
      row.repeats.map(repeat => `${repeat.run}:${repeat.effectiveScore ?? ''}`).join(', '),
      row.reasons.join('; '),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Protected Risk Tools', '');
  for (const row of report.rows) {
    if (row.protectedRiskTools.length === 0 && row.protectedRestores.length === 0) continue;
    lines.push(`### ${row.id}`, '');
    for (const tool of [...row.protectedRestores, ...row.protectedRiskTools]) {
      lines.push(`- ${tool.toolName} ${tool.outcome} source=${tool.source ?? 'n/a'} stage=${tool.stage ?? 'n/a'} score=${tool.scoreBefore ?? ''}->${tool.scoreAfter ?? ''} state=${tool.stateSignatureBefore ?? 'missing'} note=${tool.note ?? 'n/a'}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [baseline, stage76, stage76b, ...repeats] = await Promise.all([
    readRun(args.baselineRun),
    readRun(args.stage76Run),
    readRun(args.stage76bRun),
    ...args.repeatRuns.map(readRun),
  ]);

  const rows: Stage76DRowReport[] = args.ids.map(id => {
    const baselineRow = baseline.get(id);
    const stage76Row = stage76.get(id);
    const stage76bRow = stage76b.get(id);
    const repeatRows = repeats.map(run => run.get(id));
    const tools = (stage76bRow?.appliedTools ?? []).map(toolSummary);
    const protectedRestores = tools.filter(tool => PROTECTED_RESTORE_TOOLS.has(tool.toolName));
    const protectedRiskTools = tools.filter(tool => PROTECTED_RISK_TOOLS.has(tool.toolName));
    const classified = classify({
      baseline: baselineRow,
      stage76: stage76Row,
      stage76b: stage76bRow,
      repeats: repeatRows,
      protectedRestores,
      protectedRiskTools,
    });
    return {
      id,
      file: stage76bRow?.file ?? stage76Row?.file ?? baselineRow?.file ?? null,
      baseline: summarize('baseline', baselineRow),
      stage76: summarize('stage76', stage76Row),
      stage76b: summarize('stage76b', stage76bRow),
      repeats: repeatRows.flatMap((row, index) => {
        const summary = summarize(`repeat${index + 1}`, row);
        return summary ? [summary] : [];
      }),
      ...classified,
      protectedRestores,
      protectedRiskTools,
    };
  });

  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      baselineRun: args.baselineRun,
      stage76Run: args.stage76Run,
      stage76bRun: args.stage76bRun,
      repeatRuns: args.repeatRuns,
    },
    rows,
  };
  await writeFile(join(outDir, 'stage76d-protected-gate-stabilization.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'stage76d-protected-gate-stabilization.md'), md(report));
  console.log(`Wrote ${outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

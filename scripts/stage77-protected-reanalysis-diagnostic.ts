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
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: BenchmarkCategory[];
  reanalyzedCategories?: BenchmarkCategory[];
  appliedTools?: BenchmarkToolRow[];
  wallRemediateMs?: number;
}

type Classification =
  | 'repeatable_route_harm'
  | 'reanalyze_volatility'
  | 'safe_checkpoint_available'
  | 'legacy_protected_parity_debt';

interface ToolSummary {
  index: number;
  toolName: string;
  outcome: string;
  source: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  note: string | null;
  stateSignatureBefore: string | null;
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STAGE76D_RUN = 'Output/experiment-corpus-baseline/run-stage76d-full-2026-04-25-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage77-protected-reanalysis-diagnostic-2026-04-25-r1';
const DEFAULT_IDS = [
  'long-4683',
  'long-4516',
  'structure-4076',
  'fixture-teams-remediated',
  'figure-4082',
  'figure-4609',
  'short-4074',
];
const ROUTE_RISK_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'mark_untagged_content_as_artifact',
  'artifact_repeating_page_furniture',
  'repair_alt_text_structure',
  'normalize_annotation_tab_order',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage77-protected-reanalysis-diagnostic.ts [options]',
    `  --baseline-run <dir> Default: ${DEFAULT_BASELINE_RUN}`,
    `  --stage76d-run <dir> Default: ${DEFAULT_STAGE76D_RUN}`,
    '  --repeat-run <dir>   Optional, repeatable',
    `  --out <dir>          Default: ${DEFAULT_OUT}`,
    '  --ids <csv>          Default: Stage 76D protected regression ids',
  ].join('\n');
}

function parseArgs(argv: string[]): {
  baselineRun: string;
  stage76dRun: string;
  repeatRuns: string[];
  out: string;
  ids: string[];
} {
  const args = {
    baselineRun: DEFAULT_BASELINE_RUN,
    stage76dRun: DEFAULT_STAGE76D_RUN,
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
    else if (arg === '--stage76d-run') args.stage76dRun = next;
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

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return { raw: details };
  }
}

function effectiveScore(row?: BenchmarkRow): number | null {
  return num(row?.reanalyzedScore) ?? num(row?.afterScore);
}

function categories(row?: BenchmarkRow): Record<string, number> {
  const source = row?.reanalyzedCategories?.length ? row.reanalyzedCategories : row?.afterCategories ?? [];
  return Object.fromEntries(source.map(category => [category.key, category.score]));
}

function toolName(tool: BenchmarkToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function summarizeTool(tool: BenchmarkToolRow, index: number): ToolSummary {
  const details = parseDetails(tool.details);
  const replayState = asRecord(asRecord(details.debug).replayState);
  return {
    index,
    toolName: toolName(tool),
    outcome: tool.outcome ?? 'unknown',
    source: str(tool.source) || null,
    scoreBefore: num(tool.scoreBefore),
    scoreAfter: num(tool.scoreAfter),
    note: str(details.note) || str(details.raw) || null,
    stateSignatureBefore: str(replayState.stateSignatureBefore) || null,
  };
}

function routeSignature(row?: BenchmarkRow): string {
  return (row?.appliedTools ?? [])
    .filter(tool => ROUTE_RISK_TOOLS.has(toolName(tool)) && tool.outcome === 'applied')
    .map(tool => toolName(tool))
    .join('>');
}

function safeCheckpointRows(row?: BenchmarkRow): ToolSummary[] {
  return (row?.appliedTools ?? [])
    .map(summarizeTool)
    .filter(tool => tool.toolName === 'protected_best_state_restore' || tool.toolName === 'protected_reanalysis_restore');
}

function classify(input: {
  baseline?: BenchmarkRow;
  candidate?: BenchmarkRow;
  repeats: Array<BenchmarkRow | undefined>;
}): { classification: Classification; reasons: string[] } {
  const baselineScore = effectiveScore(input.baseline);
  const scores = [input.candidate, ...input.repeats]
    .map(effectiveScore)
    .filter((score): score is number => score != null);
  const reasons: string[] = [];
  if (scores.length >= 2 && Math.max(...scores) - Math.min(...scores) > 10) {
    reasons.push(`effective_score_range=${Math.min(...scores)}..${Math.max(...scores)}`);
    return { classification: 'reanalyze_volatility', reasons };
  }
  const restoreCount = [input.candidate, ...input.repeats].reduce((sum, row) => sum + safeCheckpointRows(row).length, 0);
  if (restoreCount > 0) {
    reasons.push(`safe_checkpoint_restore_count=${restoreCount}`);
    return { classification: 'safe_checkpoint_available', reasons };
  }
  const signatures = [input.candidate, ...input.repeats].map(routeSignature).filter(Boolean);
  const repeatedSignature = signatures.length >= 2 && signatures.every(signature => signature === signatures[0]);
  const belowBaseline = baselineScore != null && scores.length > 0 && scores.every(score => score < baselineScore - 2);
  if (belowBaseline && repeatedSignature) {
    reasons.push(`repeatable_route=${signatures[0]}`);
    return { classification: 'repeatable_route_harm', reasons };
  }
  if (belowBaseline) reasons.push('consistently_below_protected_baseline');
  return { classification: 'legacy_protected_parity_debt', reasons };
}

function md(report: {
  rows: Array<{
    id: string;
    classification: Classification;
    reasons: string[];
    baselineScore: number | null;
    stage76dScore: number | null;
    repeatScores: Array<number | null>;
    routeSignature: string;
  }>;
  inputs: Record<string, string | string[]>;
}): string {
  const lines = [
    '# Stage 77 Protected Reanalysis Diagnostic',
    '',
    '## Inputs',
    '',
    `- Baseline: \`${report.inputs.baselineRun}\``,
    `- Stage 76D: \`${report.inputs.stage76dRun}\``,
    `- Repeats: ${Array.isArray(report.inputs.repeatRuns) && report.inputs.repeatRuns.length > 0 ? report.inputs.repeatRuns.map(run => `\`${run}\``).join(', ') : 'none'}`,
    '',
    '## Rows',
    '',
    '| Row | Class | Baseline | Stage76D | Repeats | Route | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      row.id,
      row.classification,
      row.baselineScore ?? '',
      row.stage76dScore ?? '',
      row.repeatScores.map(score => score ?? '').join(', '),
      row.routeSignature || 'none',
      row.reasons.join('; '),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [baseline, stage76d, ...repeats] = await Promise.all([
    readRun(args.baselineRun),
    readRun(args.stage76dRun),
    ...args.repeatRuns.map(readRun),
  ]);
  const rows = args.ids.map(id => {
    const baselineRow = baseline.get(id);
    const candidateRow = stage76d.get(id);
    const repeatRows = repeats.map(run => run.get(id));
    const classification = classify({ baseline: baselineRow, candidate: candidateRow, repeats: repeatRows });
    return {
      id,
      file: candidateRow?.file ?? baselineRow?.file ?? null,
      baselineScore: effectiveScore(baselineRow),
      stage76dScore: effectiveScore(candidateRow),
      repeatScores: repeatRows.map(effectiveScore),
      categories: {
        baseline: categories(baselineRow),
        stage76d: categories(candidateRow),
      },
      routeSignature: routeSignature(candidateRow),
      protectedRestores: safeCheckpointRows(candidateRow),
      riskTools: (candidateRow?.appliedTools ?? []).map(summarizeTool).filter(tool => ROUTE_RISK_TOOLS.has(tool.toolName)),
      ...classification,
    };
  });

  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      baselineRun: args.baselineRun,
      stage76dRun: args.stage76dRun,
      repeatRuns: args.repeatRuns,
    },
    rows,
  };
  await writeFile(join(outDir, 'stage77-protected-reanalysis-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'stage77-protected-reanalysis-diagnostic.md'), md(report));
  console.log(`Wrote ${outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

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
  afterCategories?: Array<{ key: string; score: number }>;
  reanalyzedCategories?: Array<{ key: string; score: number }>;
  appliedTools?: BenchmarkToolRow[];
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
}

interface Stage76RowReport {
  id: string;
  file: string | null;
  stage42: RowSummary | null;
  stage69: RowSummary | null;
  stage75: RowSummary | null;
  stage69Vs42: DeltaSummary | null;
  stage75Vs42: DeltaSummary | null;
  stage75Vs69: DeltaSummary | null;
  expensiveNoGainTools: ToolSummary[];
  protectedRiskTools: ToolSummary[];
  classification: 'protected_structural_volatility' | 'runtime_tail_debt' | 'reanalyze_volatility' | 'stable_or_improved' | 'missing_row';
  reasons: string[];
}

interface RowSummary {
  score: number | null;
  grade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  wallMs: number | null;
  attempts: number;
  falsePositiveAppliedCount: number;
  categories: Record<string, number>;
}

interface DeltaSummary {
  scoreDelta: number | null;
  reanalyzedDelta: number | null;
  wallDeltaMs: number | null;
  categoryDeltas: Array<{ key: string; before: number; after: number; delta: number }>;
}

interface ToolSummary {
  index: number;
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  durationMs: number | null;
  stateSignatureBefore: string | null;
  note: string | null;
}

const DEFAULT_STAGE42_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STAGE69_RUN = 'Output/experiment-corpus-baseline/run-stage69-full-2026-04-25-r1';
const DEFAULT_STAGE75_RUN = 'Output/experiment-corpus-baseline/run-stage75-cleanup-full-2026-04-25-r3';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage76-protected-runtime-diagnostic-2026-04-25-r1';
const DEFAULT_IDS = [
  'long-4683',
  'long-4516',
  'structure-4076',
  'structure-4207',
  'short-4660',
  'fixture-teams-remediated',
];
const EXPENSIVE_NO_GAIN_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'mark_untagged_content_as_artifact',
  'artifact_repeating_page_furniture',
  'normalize_heading_hierarchy',
  'normalize_annotation_tab_order',
  'repair_structure_conformance',
]);
const PROTECTED_RISK_TOOLS = new Set([
  ...EXPENSIVE_NO_GAIN_TOOLS,
  'repair_alt_text_structure',
  'retag_as_figure',
  'canonicalize_figure_alt_ownership',
  'normalize_nested_figure_containers',
  'normalize_table_structure',
  'set_table_header_cells',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage76-protected-runtime-diagnostic.ts [options]',
    `  --stage42-run <dir> Default: ${DEFAULT_STAGE42_RUN}`,
    `  --stage69-run <dir> Default: ${DEFAULT_STAGE69_RUN}`,
    `  --stage75-run <dir> Default: ${DEFAULT_STAGE75_RUN}`,
    `  --out <dir>         Default: ${DEFAULT_OUT}`,
    '  --ids <csv>         Default: protected/runtime failing row ids',
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

function parseArgs(argv: string[]): { stage42Run: string; stage69Run: string; stage75Run: string; out: string; ids: string[] } {
  const args = {
    stage42Run: DEFAULT_STAGE42_RUN,
    stage69Run: DEFAULT_STAGE69_RUN,
    stage75Run: DEFAULT_STAGE75_RUN,
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
    if (arg === '--stage42-run') args.stage42Run = next;
    else if (arg === '--stage69-run') args.stage69Run = next;
    else if (arg === '--stage75-run') args.stage75Run = next;
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

function categories(row?: BenchmarkRow, key: 'afterCategories' | 'reanalyzedCategories' = 'afterCategories'): Record<string, number> {
  return Object.fromEntries((row?.[key] ?? []).map(category => [category.key, category.score]));
}

function rowSummary(row?: BenchmarkRow): RowSummary | null {
  if (!row) return null;
  return {
    score: num(row.afterScore),
    grade: str(row.afterGrade) || null,
    reanalyzedScore: num(row.reanalyzedScore),
    reanalyzedGrade: str(row.reanalyzedGrade) || null,
    wallMs: num(row.wallRemediateMs),
    attempts: row.appliedTools?.length ?? 0,
    falsePositiveAppliedCount: num(row.falsePositiveAppliedCount) ?? 0,
    categories: categories(row, row.reanalyzedCategories ? 'reanalyzedCategories' : 'afterCategories'),
  };
}

function delta(before?: BenchmarkRow, after?: BenchmarkRow): DeltaSummary | null {
  if (!before || !after) return null;
  const beforeCategories = categories(before, before.reanalyzedCategories ? 'reanalyzedCategories' : 'afterCategories');
  const afterCategories = categories(after, after.reanalyzedCategories ? 'reanalyzedCategories' : 'afterCategories');
  const keys = new Set([...Object.keys(beforeCategories), ...Object.keys(afterCategories)]);
  return {
    scoreDelta: num(after.afterScore) != null && num(before.afterScore) != null ? num(after.afterScore)! - num(before.afterScore)! : null,
    reanalyzedDelta: num(after.reanalyzedScore) != null && num(before.reanalyzedScore) != null
      ? num(after.reanalyzedScore)! - num(before.reanalyzedScore)!
      : null,
    wallDeltaMs: num(after.wallRemediateMs) != null && num(before.wallRemediateMs) != null
      ? num(after.wallRemediateMs)! - num(before.wallRemediateMs)!
      : null,
    categoryDeltas: [...keys]
      .map(key => ({ key, before: beforeCategories[key] ?? 0, after: afterCategories[key] ?? 0, delta: (afterCategories[key] ?? 0) - (beforeCategories[key] ?? 0) }))
      .filter(row => row.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key)),
  };
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
    stage: num(tool.stage),
    round: num(tool.round),
    source: str(tool.source) || null,
    scoreBefore: num(tool.scoreBefore),
    scoreAfter: num(tool.scoreAfter),
    durationMs: num(tool.durationMs),
    stateSignatureBefore: str(replayState.stateSignatureBefore) || null,
    note: str(details.note) || str(details.raw) || null,
  };
}

function noGain(tool: ToolSummary): boolean {
  return tool.outcome === 'no_effect' ||
    tool.outcome === 'rejected' ||
    (tool.scoreBefore != null && tool.scoreAfter != null && tool.scoreAfter <= tool.scoreBefore);
}

function relevantTools(row: BenchmarkRow | undefined, toolSet: Set<string>, requireNoGain = false): ToolSummary[] {
  return (row?.appliedTools ?? [])
    .map(toolSummary)
    .filter(tool => toolSet.has(tool.toolName) && (!requireNoGain || noGain(tool)));
}

function classify(input: {
  stage42?: BenchmarkRow;
  stage69?: BenchmarkRow;
  stage75?: BenchmarkRow;
  expensiveNoGainTools: ToolSummary[];
  stage75Vs42: DeltaSummary | null;
  stage75Vs69: DeltaSummary | null;
}): Pick<Stage76RowReport, 'classification' | 'reasons'> {
  const reasons: string[] = [];
  if (!input.stage42 || !input.stage75) return { classification: 'missing_row', reasons: ['row_missing_in_required_run'] };
  const reanalyzedDrop = (input.stage75.reanalyzedScore ?? input.stage75.afterScore ?? 0) < (input.stage75.afterScore ?? 0) - 5;
  if (reanalyzedDrop) reasons.push('stage75_after_reanalyze_score_drops_materially');
  const protectedDrop = (input.stage75Vs42?.reanalyzedDelta ?? input.stage75Vs42?.scoreDelta ?? 0) < 0;
  if (protectedDrop) reasons.push('stage75_below_stage42_protected_floor');
  if ((input.stage75Vs69?.reanalyzedDelta ?? input.stage75Vs69?.scoreDelta ?? 0) < 0) {
    reasons.push('stage75_below_stage69');
  }
  if (input.expensiveNoGainTools.length > 0) {
    reasons.push(`expensive_no_gain_tool_count=${input.expensiveNoGainTools.length}`);
  }
  if (reanalyzedDrop) return { classification: 'reanalyze_volatility', reasons };
  if (protectedDrop) return { classification: 'protected_structural_volatility', reasons };
  if (input.expensiveNoGainTools.length > 0) return { classification: 'runtime_tail_debt', reasons };
  return { classification: 'stable_or_improved', reasons };
}

function md(report: { rows: Stage76RowReport[]; inputs: Record<string, string> }): string {
  const lines = [
    '# Stage 76 Protected/Runtime Diagnostic',
    '',
    '## Inputs',
    '',
    `- Stage 42: \`${report.inputs.stage42Run}\``,
    `- Stage 69: \`${report.inputs.stage69Run}\``,
    `- Stage 75 cleanup r3: \`${report.inputs.stage75Run}\``,
    '',
    '## Rows',
    '',
    '| Row | Class | Stage42 | Stage69 | Stage75 | Reanalyzed | Wall ms | Reasons |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      row.id,
      row.classification,
      row.stage42?.score ?? '',
      row.stage69?.score ?? '',
      row.stage75?.score ?? '',
      row.stage75?.reanalyzedScore ?? '',
      row.stage75?.wallMs == null ? '' : Math.round(row.stage75.wallMs),
      row.reasons.join('; '),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Expensive No-Gain Tools', '');
  for (const row of report.rows) {
    if (row.expensiveNoGainTools.length === 0) continue;
    lines.push(`### ${row.id}`, '');
    for (const tool of row.expensiveNoGainTools) {
      lines.push(`- ${tool.toolName} ${tool.outcome} stage=${tool.stage ?? 'n/a'} round=${tool.round ?? 'n/a'} durationMs=${Math.round(tool.durationMs ?? 0)} state=${tool.stateSignatureBefore ?? 'missing'} note=${tool.note ?? 'n/a'}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [stage42, stage69, stage75] = await Promise.all([
    readRun(args.stage42Run),
    readRun(args.stage69Run),
    readRun(args.stage75Run),
  ]);
  const rows: Stage76RowReport[] = args.ids.map(id => {
    const row42 = stage42.get(id);
    const row69 = stage69.get(id);
    const row75 = stage75.get(id);
    const expensiveNoGainTools = relevantTools(row75, EXPENSIVE_NO_GAIN_TOOLS, true);
    const stage75Vs42 = delta(row42, row75);
    const stage75Vs69 = delta(row69, row75);
    const classified = classify({
      stage42: row42,
      stage69: row69,
      stage75: row75,
      expensiveNoGainTools,
      stage75Vs42,
      stage75Vs69,
    });
    return {
      id,
      file: row75?.file ?? row69?.file ?? row42?.file ?? null,
      stage42: rowSummary(row42),
      stage69: rowSummary(row69),
      stage75: rowSummary(row75),
      stage69Vs42: delta(row42, row69),
      stage75Vs42,
      stage75Vs69,
      expensiveNoGainTools,
      protectedRiskTools: relevantTools(row75, PROTECTED_RISK_TOOLS),
      ...classified,
    };
  });

  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      stage42Run: args.stage42Run,
      stage69Run: args.stage69Run,
      stage75Run: args.stage75Run,
    },
    rows,
  };
  await writeFile(join(outDir, 'stage76-protected-runtime-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'stage76-protected-runtime-diagnostic.md'), md(report));
  console.log(`Wrote ${outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

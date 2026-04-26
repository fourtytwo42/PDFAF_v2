#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface CategoryRow {
  key: string;
  score: number;
}

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  source?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  details?: unknown;
}

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: CategoryRow[];
  reanalyzedCategories?: CategoryRow[];
  appliedTools?: ToolRow[];
  protectedReanalysisSelection?: unknown;
}

type Classification =
  | 'safe_checkpoint_available'
  | 'route_guard_candidate'
  | 'no_safe_checkpoint_route_debt'
  | 'baseline_only_parity_debt';

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage78b-protected-parity-diagnostic-2026-04-25-r1';
const DEFAULT_IDS = ['structure-4076', 'fixture-teams-remediated'];
const DEFAULT_RUNS: Record<string, string> = {
  stage42: 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7',
  stage69: 'Output/experiment-corpus-baseline/run-stage69-full-2026-04-25-r1',
  stage77: 'Output/experiment-corpus-baseline/run-stage77-full-2026-04-25-r2',
  stage78: 'Output/experiment-corpus-baseline/run-stage78-full-2026-04-25-r1',
};
const RISK_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'mark_untagged_content_as_artifact',
  'normalize_heading_hierarchy',
  'normalize_annotation_tab_order',
  'create_heading_from_candidate',
]);
const RESTORE_TOOLS = new Set(['protected_reanalysis_restore', 'protected_best_state_restore']);

function parseArgs(argv: string[]): { runs: Record<string, string>; out: string; ids: string[] } {
  const runs = { ...DEFAULT_RUNS };
  let out = DEFAULT_OUT;
  let ids = DEFAULT_IDS;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm exec tsx scripts/stage78b-protected-parity-diagnostic.ts [--stage42 <dir>] [--stage69 <dir>] [--stage77 <dir>] [--stage78 <dir>] [--ids <csv>] [--out <dir>]');
      process.exit(0);
    }
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--out') out = next;
    else if (arg === '--ids') ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg.startsWith('--stage')) runs[arg.slice(2)] = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return { runs, out, ids };
}

async function readRows(dir: string): Promise<Map<string, BenchmarkRow>> {
  const rows = JSON.parse(await readFile(join(resolve(dir), 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
}

function score(row?: BenchmarkRow): number | null {
  const value = row?.reanalyzedScore ?? row?.afterScore;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categories(row?: BenchmarkRow): Record<string, number> {
  const source = row?.reanalyzedCategories?.length ? row.reanalyzedCategories : row?.afterCategories ?? [];
  return Object.fromEntries(source.map(category => [category.key, category.score]));
}

function toolName(row: ToolRow): string {
  return row.toolName ?? row.name ?? 'unknown';
}

function classify(input: {
  baseline?: BenchmarkRow;
  stage78?: BenchmarkRow;
}): { classification: Classification; reasons: string[] } {
  const tools = input.stage78?.appliedTools ?? [];
  const reasons: string[] = [];
  if (tools.some(tool => RESTORE_TOOLS.has(toolName(tool)) && tool.outcome === 'applied')) {
    return { classification: 'safe_checkpoint_available', reasons: ['protected_restore_row_present'] };
  }
  const baselineScore = score(input.baseline);
  const stage78Score = score(input.stage78);
  const baselineCats = categories(input.baseline);
  const stage78Cats = categories(input.stage78);
  const strongRegression = Object.entries(baselineCats)
    .filter(([, value]) => value >= 90)
    .find(([key, value]) => (stage78Cats[key] ?? value) < value - 2);
  if (
    baselineScore != null &&
    stage78Score != null &&
    stage78Score < baselineScore - 2 &&
    tools.some(tool => RISK_TOOLS.has(toolName(tool)) && tool.outcome === 'applied')
  ) {
    if (strongRegression) reasons.push(`strong_category_regression=${strongRegression[0]}:${strongRegression[1]}->${stage78Cats[strongRegression[0]]}`);
    reasons.push('stage78_contains_applied_risk_tool');
    return { classification: 'route_guard_candidate', reasons };
  }
  if (baselineScore != null && stage78Score != null && stage78Score < baselineScore - 2) {
    return { classification: 'no_safe_checkpoint_route_debt', reasons: [`score_regression=${baselineScore}->${stage78Score}`] };
  }
  return { classification: 'baseline_only_parity_debt', reasons: ['no_stage78_score_regression'] };
}

function renderMarkdown(report: unknown, rows: Array<Record<string, unknown>>): string {
  const lines = ['# Stage 78B Protected Parity Diagnostic', '', '## Rows', ''];
  for (const row of rows) {
    lines.push(`### ${row.id}`);
    lines.push(`- Classification: ${row.classification}`);
    lines.push(`- Reasons: ${(row.reasons as string[]).join('; ') || 'none'}`);
    lines.push(`- Scores: ${JSON.stringify(row.scores)}`);
    lines.push(`- Strong category deltas: ${JSON.stringify(row.strongCategoryDeltas)}`);
    lines.push(`- Stage 78 protected reanalysis: ${JSON.stringify(row.protectedReanalysisSelection ?? null)}`);
    lines.push(`- Stage 78 applied tools: ${(row.stage78AppliedTools as string[]).join(' | ') || 'none'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runRows = new Map<string, Map<string, BenchmarkRow>>();
  for (const [label, dir] of Object.entries(args.runs)) {
    runRows.set(label, await readRows(dir));
  }

  const rows = args.ids.map(id => {
    const baseline = runRows.get('stage42')?.get(id);
    const stage78 = runRows.get('stage78')?.get(id);
    const baselineCats = categories(baseline);
    const stage78Cats = categories(stage78);
    const strongCategoryDeltas = Object.entries(baselineCats)
      .filter(([, value]) => value >= 90)
      .map(([key, value]) => ({ key, baseline: value, stage78: stage78Cats[key] ?? null }))
      .filter(delta => delta.stage78 != null && delta.stage78 < delta.baseline - 2);
    const classification = classify({ baseline, stage78 });
    return {
      id,
      classification: classification.classification,
      reasons: classification.reasons,
      scores: Object.fromEntries([...runRows.entries()].map(([label, rowsForRun]) => {
        const row = rowsForRun.get(id);
        return [label, {
          after: row?.afterScore ?? null,
          reanalyzed: row?.reanalyzedScore ?? null,
          effective: score(row),
        }];
      })),
      categories: Object.fromEntries([...runRows.entries()].map(([label, rowsForRun]) => [label, categories(rowsForRun.get(id))])),
      strongCategoryDeltas,
      protectedReanalysisSelection: stage78?.protectedReanalysisSelection,
      protectedRestoreRows: (stage78?.appliedTools ?? []).filter(tool => RESTORE_TOOLS.has(toolName(tool))),
      stage78AppliedTools: (stage78?.appliedTools ?? [])
        .filter(tool => tool.outcome === 'applied')
        .map(tool => `${toolName(tool)}:${tool.source ?? 'unknown'}:${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`),
    };
  });

  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    runs: args.runs,
    ids: args.ids,
    rows,
  };
  await writeFile(join(out, 'stage78b-protected-parity-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(out, 'stage78b-protected-parity-diagnostic.md'), renderMarkdown(report, rows), 'utf8');
  console.log(`Wrote ${out}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AppliedRemediationTool } from '../src/types.js';

const DEFAULT_STAGE42 = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STAGE147 = 'Output/experiment-corpus-baseline/run-stage147-full-2026-04-28-r1';
const DEFAULT_STAGE149 = 'Output/experiment-corpus-baseline/run-stage149-full-2026-04-28-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage150-stage149-gate-cleanup-diagnostic-2026-04-29-r1';
const DEFAULT_IDS = [
  'structure-3775',
  'structure-4076',
  'structure-4207',
  'font-4172',
  'figure-4082',
  'figure-4609',
  'long-4470',
  'long-4683',
];

interface Args {
  stage42: string;
  stage147: string;
  stage149: string;
  outDir: string;
  ids: string[];
}

interface Row {
  id: string;
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  afterCategories?: Array<{ key: string; score: number; applicable?: boolean }>;
  reanalyzedCategories?: Array<{ key: string; score: number; applicable?: boolean }>;
  protectedReanalysisSelection?: unknown;
  appliedTools?: AppliedRemediationTool[];
}

interface ToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  note: string;
  state: string | null;
  targetRef: string | null;
}

interface DiagnosticRow {
  id: string;
  classification: string;
  reasons: string[];
  stage42: string;
  stage147: string;
  stage149: string;
  stage149Reanalyzed: string;
  categoryDeltasVs147: Record<string, number>;
  headingRows: ToolSummary[];
  stage149ToolRows: ToolSummary[];
  protectedReanalysisSelection: unknown;
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage150-stage149-gate-cleanup-diagnostic.ts [options]',
    `  --stage42 <dir>   Default: ${DEFAULT_STAGE42}`,
    `  --stage147 <dir>  Default: ${DEFAULT_STAGE147}`,
    `  --stage149 <dir>  Default: ${DEFAULT_STAGE149}`,
    `  --out <dir>       Default: ${DEFAULT_OUT}`,
    '  --file <id>       Limit to row id; repeatable',
  ].join('\n');
}

function parseArgs(argv = process.argv.slice(2)): Args {
  let stage42 = DEFAULT_STAGE42;
  let stage147 = DEFAULT_STAGE147;
  let stage149 = DEFAULT_STAGE149;
  let outDir = DEFAULT_OUT;
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const next = argv[i + 1];
    if (arg === '--stage42') stage42 = next ?? stage42;
    else if (arg === '--stage147') stage147 = next ?? stage147;
    else if (arg === '--stage149') stage149 = next ?? stage149;
    else if (arg === '--out') outDir = next ?? outDir;
    else if (arg === '--file') ids.push(next ?? '');
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    i += 1;
  }
  return {
    stage42: resolve(stage42),
    stage147: resolve(stage147),
    stage149: resolve(stage149),
    outDir: resolve(outDir),
    ids: ids.filter(Boolean),
  };
}

async function readRun(dir: string): Promise<Map<string, Row>> {
  const rows = JSON.parse(await readFile(join(dir, 'remediate.results.json'), 'utf8')) as Row[];
  const map = new Map<string, Row>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function score(row: Row | undefined, reanalyzed = false): number | null {
  const raw = reanalyzed ? row?.reanalyzedScore : row?.afterScore;
  return typeof raw === 'number' ? raw : null;
}

function grade(row: Row | undefined, reanalyzed = false): string {
  return String((reanalyzed ? row?.reanalyzedGrade : row?.afterGrade) ?? 'n/a');
}

function label(row: Row | undefined, reanalyzed = false): string {
  const s = score(row, reanalyzed);
  return `${s ?? 'n/a'}/${grade(row, reanalyzed)}`;
}

function categoryMap(row: Row | undefined, reanalyzed = false): Map<string, number> {
  const cats = reanalyzed ? row?.reanalyzedCategories : row?.afterCategories;
  const out = new Map<string, number>();
  for (const cat of cats ?? []) {
    if (cat.applicable === false) continue;
    if (typeof cat.score === 'number') out.set(cat.key, cat.score);
  }
  return out;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string' || !details.startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nestedString(value: unknown, path: string[]): string | null {
  let cur = value;
  for (const part of path) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' && cur.length > 0 ? cur : null;
}

function toolSummary(tool: AppliedRemediationTool): ToolSummary {
  const parsed = parseDetails(tool.details);
  return {
    toolName: tool.toolName,
    outcome: tool.outcome,
    scoreBefore: tool.scoreBefore,
    scoreAfter: tool.scoreAfter,
    note:
      nestedString(parsed, ['note']) ??
      nestedString(parsed, ['raw']) ??
      (typeof tool.details === 'string' && !tool.details.startsWith('{') ? tool.details : 'no_note'),
    state: nestedString(parsed, ['debug', 'replayState', 'stateSignatureBefore']),
    targetRef:
      nestedString(parsed, ['invariants', 'targetRef']) ??
      nestedString(parsed, ['debug', 'targetRef']),
  };
}

function headingRows(row: Row | undefined): ToolSummary[] {
  return (row?.appliedTools ?? [])
    .filter(tool => (
      tool.toolName === 'create_heading_from_candidate' ||
      tool.toolName === 'create_heading_from_tagged_visible_anchor' ||
      tool.toolName === 'normalize_heading_hierarchy'
    ))
    .map(toolSummary);
}

function stage149ToolRows(row: Row | undefined): ToolSummary[] {
  return (row?.appliedTools ?? [])
    .filter(tool => tool.toolName === 'create_heading_from_tagged_visible_anchor')
    .map(toolSummary);
}

function categoryDeltas(before: Row | undefined, after: Row | undefined): Record<string, number> {
  const b = categoryMap(before, true);
  const a = categoryMap(after, true);
  const keys = new Set([...b.keys(), ...a.keys()]);
  const out: Record<string, number> = {};
  for (const key of keys) {
    const delta = (a.get(key) ?? 0) - (b.get(key) ?? 0);
    if (delta !== 0) out[key] = delta;
  }
  return out;
}

function classify(id: string, stage147: Row | undefined, stage149: Row | undefined): { classification: string; reasons: string[] } {
  const reasons: string[] = [];
  const afterDelta = (score(stage149) ?? 0) - (score(stage147) ?? 0);
  const reDelta = (score(stage149, true) ?? 0) - (score(stage147, true) ?? 0);
  const heading = headingRows(stage149);
  const stage149Rows = stage149ToolRows(stage149);
  const hardCandidateNoEffects = heading.filter(row =>
    row.toolName === 'create_heading_from_candidate' &&
    row.outcome === 'no_effect' &&
    (row.note === 'role_invalid_after_mutation' || row.note === 'heading_not_root_reachable' || row.note === 'target_unreachable')
  );
  const taggedRejected = stage149Rows.some(row => row.outcome === 'rejected');
  const taggedApplied = stage149Rows.some(row => row.outcome === 'applied');
  const noEffectCount = heading.filter(row => row.outcome === 'no_effect').length;

  if (afterDelta >= 10 && reDelta < -5) {
    reasons.push(`in_run_gain_reanalysis_drop:${afterDelta}/${reDelta}`);
    return { classification: 'protected_reanalysis_volatility', reasons };
  }
  if (id === 'structure-4076' && (hardCandidateNoEffects.length >= 2 || taggedRejected)) {
    reasons.push(`hard_heading_no_effects:${hardCandidateNoEffects.length}`, taggedRejected ? 'tagged_visible_rejected' : 'tagged_visible_not_rejected');
    return { classification: 'heading_scheduler_noise', reasons };
  }
  if (taggedApplied && reDelta < -2) {
    reasons.push(`tagged_visible_applied_reanalysis_delta:${reDelta}`);
    return { classification: 'stage149_caused', reasons };
  }
  if (afterDelta < -2 || reDelta < -2) {
    reasons.push(`score_delta:${afterDelta}`, `reanalyzed_delta:${reDelta}`);
    return { classification: 'preexisting_route_drift', reasons };
  }
  if (noEffectCount > 0) {
    reasons.push(`heading_no_effect_count:${noEffectCount}`);
    return { classification: 'safe_guard_candidate', reasons };
  }
  reasons.push('no_stage149_specific_signal');
  return { classification: 'not_stage149_related', reasons };
}

function renderMarkdown(rows: DiagnosticRow[]): string {
  const dist = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# Stage 150 Stage 149 Gate Cleanup Diagnostic',
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(dist).sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Class | Stage42 | Stage147 | Stage149 | Stage149 reanalyzed | Category deltas vs147 | Heading rows | Reasons |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of rows) {
    const deltas = Object.entries(row.categoryDeltasVs147).map(([key, delta]) => `${key}:${delta > 0 ? '+' : ''}${delta}`).join(', ') || 'none';
    const heading = row.headingRows.map(tool => `${tool.toolName}:${tool.outcome}:${tool.note}${tool.targetRef ? `@${tool.targetRef}` : ''}`).join('<br>') || 'none';
    lines.push(`| ${row.id} | ${row.classification} | ${row.stage42} | ${row.stage147} | ${row.stage149} | ${row.stage149Reanalyzed} | ${deltas} | ${heading} | ${row.reasons.join(', ')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const [stage42, stage147, stage149] = await Promise.all([
    readRun(args.stage42),
    readRun(args.stage147),
    readRun(args.stage149),
  ]);
  const ids = args.ids.length > 0 ? args.ids : DEFAULT_IDS;
  const rows: DiagnosticRow[] = ids.map(id => {
    const row42 = stage42.get(id);
    const row147 = stage147.get(id);
    const row149 = stage149.get(id);
    const cls = classify(id, row147, row149);
    return {
      id,
      classification: cls.classification,
      reasons: cls.reasons,
      stage42: label(row42),
      stage147: label(row147),
      stage149: label(row149),
      stage149Reanalyzed: label(row149, true),
      categoryDeltasVs147: categoryDeltas(row147, row149),
      headingRows: headingRows(row149),
      stage149ToolRows: stage149ToolRows(row149),
      protectedReanalysisSelection: row149?.protectedReanalysisSelection ?? null,
    };
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage150-stage149-gate-cleanup-diagnostic.json'), JSON.stringify({ rows }, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage150-stage149-gate-cleanup-diagnostic.md'), renderMarkdown(rows), 'utf8');
  console.log(`Wrote Stage 150 diagnostic for ${rows.length} rows: ${args.outDir}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

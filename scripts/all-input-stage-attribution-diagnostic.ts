#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_REPORT = 'Output/goal-all-input-mean-2026-05-09-r1/r5-complete-baseline-report-2026-05-11-r1/baseline_report.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/stage-attribution-diagnostic-2026-05-11-r1';

export type AttributionClass =
  | 'no_effect_score_movement'
  | 'rejected_score_movement'
  | 'applied_no_score_movement'
  | 'normal_tool_row';

export interface AttributionToolRow {
  file: string;
  finalScore: number | null;
  finalGrade: string | null;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number;
  stage: number | null;
  round: number | null;
  replayStateBefore: string | null;
  replayStateAfter: string | null;
  reason: string | null;
  classification: AttributionClass;
}

export interface StageAttributionReport {
  generatedAt: string;
  reportPaths: string[];
  summary: {
    files: number;
    toolRows: number;
    noEffectScoreMovement: number;
    rejectedScoreMovement: number;
    appliedNoScoreMovement: number;
    lowFinalRowsWithNoEffectMovement: number;
    topLowRows: Array<{ file: string; finalScore: number | null; count: number; tools: string[] }>;
  };
  rows: AttributionToolRow[];
}

interface BaselineReport {
  rows?: BaselineRow[];
}

interface BaselineRow {
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  appliedTools?: ToolRow[];
}

interface ToolRow {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  stage?: number;
  round?: number;
  details?: string;
}

function parseArgs(argv: string[]): { reports: string[]; out: string } {
  const reports: string[] = [];
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--report' && next) {
      reports.push(next);
      i += 1;
    } else if (arg === '--out' && next) {
      out = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-stage-attribution-diagnostic.ts [--report <baseline_report.json>]... [--out <dir>]',
        '',
        `Defaults: --report ${DEFAULT_REPORT} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { reports: reports.length ? reports : [DEFAULT_REPORT], out };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function detailsRecord(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string') return null;
  try {
    return asRecord(JSON.parse(details));
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function replayAndReason(details: unknown): {
  before: string | null;
  after: string | null;
  reason: string | null;
} {
  const parsed = detailsRecord(details);
  const debug = asRecord(parsed?.debug);
  const replayState = asRecord(debug?.replayState);
  return {
    before: stringOrNull(replayState?.stateSignatureBefore),
    after: stringOrNull(replayState?.stateSignatureAfter),
    reason: stringOrNull(parsed?.note) ?? stringOrNull(parsed?.raw) ?? stringOrNull(parsed?.outcome),
  };
}

function classifyTool(outcome: string, scoreBefore: number | null, scoreAfter: number | null, delta: number): AttributionClass {
  const moved = scoreBefore != null && scoreAfter != null && scoreAfter > scoreBefore;
  if (outcome === 'no_effect' && moved) return 'no_effect_score_movement';
  if (outcome === 'rejected' && moved) return 'rejected_score_movement';
  if (outcome === 'applied' && delta === 0 && scoreBefore === scoreAfter) return 'applied_no_score_movement';
  return 'normal_tool_row';
}

function toolToRow(file: string, finalScore: number | null, finalGrade: string | null, tool: ToolRow): AttributionToolRow {
  const scoreBefore = numberOrNull(tool.scoreBefore);
  const scoreAfter = numberOrNull(tool.scoreAfter);
  const delta = numberOrNull(tool.delta) ?? ((scoreAfter ?? 0) - (scoreBefore ?? 0));
  const outcome = String(tool.outcome ?? '');
  const replay = replayAndReason(tool.details);
  return {
    file,
    finalScore,
    finalGrade,
    toolName: String(tool.toolName ?? ''),
    outcome,
    scoreBefore,
    scoreAfter,
    delta,
    stage: numberOrNull(tool.stage),
    round: numberOrNull(tool.round),
    replayStateBefore: replay.before,
    replayStateAfter: replay.after,
    reason: replay.reason,
    classification: classifyTool(outcome, scoreBefore, scoreAfter, delta),
  };
}

async function rowsFromReport(path: string): Promise<AttributionToolRow[]> {
  const report = JSON.parse(await readFile(path, 'utf8')) as BaselineReport;
  const out: AttributionToolRow[] = [];
  for (const row of report.rows ?? []) {
    const file = String(row.file ?? '');
    const finalScore = numberOrNull(row.afterScore);
    const finalGrade = stringOrNull(row.afterGrade);
    for (const tool of row.appliedTools ?? []) out.push(toolToRow(file, finalScore, finalGrade, tool));
  }
  return out;
}

function summarize(rows: AttributionToolRow[]): StageAttributionReport['summary'] {
  const files = new Set(rows.map(row => row.file)).size;
  const noEffectRows = rows.filter(row => row.classification === 'no_effect_score_movement');
  const lowNoEffectByFile = new Map<string, AttributionToolRow[]>();
  for (const row of noEffectRows) {
    if ((row.finalScore ?? 100) >= 93) continue;
    lowNoEffectByFile.set(row.file, [...(lowNoEffectByFile.get(row.file) ?? []), row]);
  }
  const topLowRows = [...lowNoEffectByFile.entries()]
    .map(([file, items]) => ({
      file,
      finalScore: items[0]?.finalScore ?? null,
      count: items.length,
      tools: [...new Set(items.map(item => item.toolName))].sort(),
    }))
    .sort((a, b) => b.count - a.count || (a.finalScore ?? 999) - (b.finalScore ?? 999) || a.file.localeCompare(b.file))
    .slice(0, 20);
  return {
    files,
    toolRows: rows.length,
    noEffectScoreMovement: noEffectRows.length,
    rejectedScoreMovement: rows.filter(row => row.classification === 'rejected_score_movement').length,
    appliedNoScoreMovement: rows.filter(row => row.classification === 'applied_no_score_movement').length,
    lowFinalRowsWithNoEffectMovement: lowNoEffectByFile.size,
    topLowRows,
  };
}

export async function buildStageAttributionReport(input: {
  reportPaths: string[];
  generatedAt?: string;
}): Promise<StageAttributionReport> {
  const rows = (await Promise.all(input.reportPaths.map(rowsFromReport))).flat();
  const selected = rows
    .filter(row => row.classification !== 'normal_tool_row')
    .sort((a, b) => {
      const classOrder = ['no_effect_score_movement', 'rejected_score_movement', 'applied_no_score_movement'];
      const byClass = classOrder.indexOf(a.classification) - classOrder.indexOf(b.classification);
      if (byClass !== 0) return byClass;
      return (a.finalScore ?? 999) - (b.finalScore ?? 999) ||
        a.file.localeCompare(b.file) ||
        (a.stage ?? 0) - (b.stage ?? 0) ||
        a.toolName.localeCompare(b.toolName);
    });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    reportPaths: input.reportPaths,
    summary: summarize(rows),
    rows: selected,
  };
}

function renderMarkdown(report: StageAttributionReport): string {
  const lines: string[] = [];
  lines.push('# All-Input Stage Attribution Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Reports: ${report.reportPaths.map(path => `\`${path}\``).join(', ')}`);
  lines.push(`- Files: ${report.summary.files}`);
  lines.push(`- Tool rows: ${report.summary.toolRows}`);
  lines.push(`- no_effect rows with score movement: ${report.summary.noEffectScoreMovement}`);
  lines.push(`- rejected rows with score movement: ${report.summary.rejectedScoreMovement}`);
  lines.push(`- applied rows with no score movement: ${report.summary.appliedNoScoreMovement}`);
  lines.push(`- Low final-score files with no_effect score movement: ${report.summary.lowFinalRowsWithNoEffectMovement}`);
  lines.push('');
  lines.push('## Low-Score Files');
  lines.push('');
  lines.push('| File | Final | Count | Tools |');
  lines.push('|---|---:|---:|---|');
  for (const row of report.summary.topLowRows) {
    lines.push(`| \`${basename(row.file)}\` | ${row.finalScore ?? 'n/a'} | ${row.count} | ${row.tools.map(tool => `\`${tool}\``).join(', ')} |`);
  }
  lines.push('');
  lines.push('## Attribution Rows');
  lines.push('');
  lines.push('| Class | File | Final | Tool | Stage | Score | State | Reason |');
  lines.push('|---|---|---:|---|---:|---:|---|---|');
  for (const row of report.rows.slice(0, 120)) {
    lines.push([
      `\`${row.classification}\``,
      `\`${basename(row.file)}\``,
      row.finalScore ?? 'n/a',
      `\`${row.toolName}\``,
      row.stage ?? 'n/a',
      `${row.scoreBefore ?? 'n/a'} -> ${row.scoreAfter ?? 'n/a'}`,
      row.replayStateBefore ? `\`${row.replayStateBefore}\`` : 'n/a',
      String(row.reason ?? '').replaceAll('|', '\\|'),
    ].join(' | '));
  }
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push('Use this as diagnostic context only. A `no_effect_score_movement` row usually means the row-level tool timeline is carrying stage-level reanalysis movement, so route-recovery diagnostics must not treat that tool as an independently proven fixer. Behavior still requires final PAC-safe replay proof.');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStageAttributionReport({ reportPaths: args.reports });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'stage-attribution-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.out, 'stage-attribution-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.out, 'stage-attribution-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

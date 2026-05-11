#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_GOOD = 'Output/goal-all-input-mean-2026-05-09-r1/run-remaining-high-deficit-rerun-2026-05-11-r1/baseline_report.json';
const DEFAULT_BAD = 'Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r4-merged/shard-04/baseline_report.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/0108-transaction-diagnostic-2026-05-11-r1';
const DEFAULT_FOCUS = '0108-d08027579d0b-4614';

interface ToolRow {
  toolName: string;
  outcome: string;
  stage?: number;
  round?: number;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
}

interface ReportRow {
  file: string;
  afterScore?: number;
  afterGrade?: string;
  durationMs?: number;
  appliedTools?: ToolRow[];
}

export interface TransactionToolSummary {
  index: number;
  stage: number | null;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  replayBefore: string | null;
  replayAfter: string | null;
  rawReason: string | null;
  categoriesBefore: Record<string, number>;
  categoriesAfter: Record<string, number>;
}

export interface TransactionRunSummary {
  label: string;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  stageTools: TransactionToolSummary[];
}

export interface TransactionDiagnostic {
  generatedAt: string;
  focus: string;
  good: TransactionRunSummary;
  bad: TransactionRunSummary;
  classification:
    | 'combined_stage_probe_candidate'
    | 'intermediate_regression_requires_buffer'
    | 'no_shared_transaction_shape'
    | 'missing_stage_rows';
  reasons: string[];
  requiredAcceptance: string[];
}

function parseArgs(argv: string[]): { good: string; bad: string; out: string; focus: string } {
  const args = { good: DEFAULT_GOOD, bad: DEFAULT_BAD, out: DEFAULT_OUT, focus: DEFAULT_FOCUS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--good' && next) {
      args.good = next;
      i += 1;
    } else if (arg === '--bad' && next) {
      args.bad = next;
      i += 1;
    } else if (arg === '--out' && next) {
      args.out = next;
      i += 1;
    } else if (arg === '--focus' && next) {
      args.focus = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm exec tsx scripts/all-input-0108-transaction-diagnostic.ts [--good <report>] [--bad <report>] [--focus <substring>] [--out <dir>]');
      process.exit(0);
    }
  }
  return args;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDetails(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function categoryMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const source = record(value);
  if (!source) return out;
  for (const [key, score] of Object.entries(source)) {
    if (typeof score === 'number') out[key] = score;
  }
  return out;
}

function replay(details: unknown): Record<string, unknown> | null {
  return record(record(parseDetails(details)?.debug)?.replayState);
}

function summarizeTool(tool: ToolRow, index: number): TransactionToolSummary {
  const state = replay(tool.details);
  const parsed = parseDetails(tool.details);
  return {
    index,
    stage: num(tool.stage),
    toolName: tool.toolName,
    outcome: tool.outcome,
    scoreBefore: num(state?.scoreBefore) ?? num(tool.scoreBefore),
    scoreAfter: num(state?.scoreAfter) ?? num(tool.scoreAfter),
    replayBefore: str(state?.stateSignatureBefore),
    replayAfter: str(state?.stateSignatureAfter),
    rawReason: str(parsed?.raw) ?? str(parsed?.note),
    categoriesBefore: categoryMap(state?.categoryScoresBefore),
    categoriesAfter: categoryMap(state?.categoryScoresAfter),
  };
}

function stageRows(row: ReportRow): TransactionToolSummary[] {
  return (row.appliedTools ?? [])
    .map(summarizeTool)
    .filter(tool => tool.stage === 4 || tool.toolName === 'repair_native_link_structure' || tool.toolName === 'set_link_annotation_contents' || tool.toolName === 'repair_top_level_parent_links');
}

async function loadRun(label: string, path: string, focus: string): Promise<TransactionRunSummary> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { rows?: ReportRow[] };
  const row = (parsed.rows ?? []).find(item => item.file.includes(focus));
  if (!row) throw new Error(`Could not find ${focus} in ${path}`);
  return {
    label,
    score: num(row.afterScore),
    grade: str(row.afterGrade),
    durationMs: num(row.durationMs),
    stageTools: stageRows(row),
  };
}

export function classify0108Transaction(input: {
  good: TransactionRunSummary;
  bad: TransactionRunSummary;
}): Pick<TransactionDiagnostic, 'classification' | 'reasons' | 'requiredAcceptance'> {
  const goodHeading = input.good.stageTools.find(tool => tool.toolName === 'create_heading_from_candidate' && tool.outcome === 'applied');
  const goodTab = input.good.stageTools.find(tool => tool.toolName === 'normalize_annotation_tab_order' && tool.outcome === 'applied');
  const badHeading = input.bad.stageTools.find(tool => tool.toolName === 'create_heading_from_candidate');
  const badTab = input.bad.stageTools.find(tool => tool.toolName === 'normalize_annotation_tab_order');
  const reasons: string[] = [];
  if (!goodHeading || !goodTab || !badHeading || !badTab) {
    return {
      classification: 'missing_stage_rows',
      reasons: ['good_or_bad_stage4_rows_missing'],
      requiredAcceptance: [],
    };
  }
  const badAltDrop = (badTab.categoriesAfter.alt_text ?? 100) < (badTab.categoriesBefore.alt_text ?? 0);
  const badTableDrop = (badTab.categoriesAfter.table_markup ?? 100) < (badTab.categoriesBefore.table_markup ?? 0);
  const goodScoreMoves = (input.good.score ?? 0) >= 90 && (goodHeading.categoriesAfter.heading_structure ?? 0) > (goodHeading.categoriesBefore.heading_structure ?? 0);
  const sharedTabState = goodTab.replayBefore != null && goodTab.replayBefore === badTab.replayBefore;
  if (sharedTabState) reasons.push(`shared_tab_state:${goodTab.replayBefore}`);
  if (badAltDrop) reasons.push(`bad_intermediate_alt_drop:${badTab.categoriesBefore.alt_text}->${badTab.categoriesAfter.alt_text}`);
  if (badTableDrop) reasons.push(`bad_intermediate_table_drop:${badTab.categoriesBefore.table_markup}->${badTab.categoriesAfter.table_markup}`);
  if (goodScoreMoves) reasons.push(`good_final_score:${input.good.score}`);
  if (sharedTabState && goodScoreMoves && (badAltDrop || badTableDrop)) {
    return {
      classification: 'combined_stage_probe_candidate',
      reasons,
      requiredAcceptance: [
        'materialize heading plus annotation cleanup as a combined transaction, never accept the alt/table-regressed intermediate state',
        'final score must improve and reach at least 90/A for 0108',
        'final heading_structure and reading_order must improve or stay above the good-route floor',
        'final alt_text and table_markup must not regress from the pre-transaction state',
        'page/text/tag evidence and harmful PAC rules must remain safe',
        'false_positive_applied must remain 0',
      ],
    };
  }
  if (badAltDrop || badTableDrop) {
    return {
      classification: 'intermediate_regression_requires_buffer',
      reasons,
      requiredAcceptance: ['collect a buffer-level replay before adding behavior'],
    };
  }
  return {
    classification: 'no_shared_transaction_shape',
    reasons,
    requiredAcceptance: [],
  };
}

export async function build0108TransactionDiagnostic(input: {
  goodPath: string;
  badPath: string;
  focus: string;
  generatedAt?: string;
}): Promise<TransactionDiagnostic> {
  const good = await loadRun('good', input.goodPath, input.focus);
  const bad = await loadRun('bad', input.badPath, input.focus);
  const classified = classify0108Transaction({ good, bad });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    focus: input.focus,
    good,
    bad,
    ...classified,
  };
}

function render(report: TransactionDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input 0108 Transaction Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Focus: \`${report.focus}\``);
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Good score: \`${report.good.score}/${report.good.grade}\``);
  lines.push(`- Bad score: \`${report.bad.score}/${report.bad.grade}\``);
  lines.push('');
  lines.push('## Reasons');
  lines.push('');
  for (const reason of report.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Stage Rows');
  lines.push('');
  lines.push('| Run | Index | Stage | Tool | Outcome | Score | State | Categories after | Reason |');
  lines.push('| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |');
  for (const run of [report.good, report.bad]) {
    for (const tool of run.stageTools) {
      lines.push([
        run.label,
        tool.index,
        tool.stage ?? 'n/a',
        `\`${tool.toolName}\``,
        `\`${tool.outcome}\``,
        `${tool.scoreBefore ?? 'n/a'} -> ${tool.scoreAfter ?? 'n/a'}`,
        `${tool.replayBefore ?? 'n/a'} -> ${tool.replayAfter ?? 'n/a'}`,
        Object.entries(tool.categoriesAfter).map(([key, score]) => `${key}:${score}`).join('<br>') || 'n/a',
        tool.rawReason ?? '',
      ].join(' | '));
    }
  }
  lines.push('');
  lines.push('## Required Acceptance For Any Behavior');
  lines.push('');
  if (report.requiredAcceptance.length === 0) {
    lines.push('- No behavior is selected from this diagnostic.');
  } else {
    for (const item of report.requiredAcceptance) lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('Do not use this diagnostic to weaken PAC gates or accept the intermediate regressed state.');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await build0108TransactionDiagnostic({
    goodPath: args.good,
    badPath: args.bad,
    focus: args.focus,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, '0108-transaction-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, '0108-transaction-diagnostic.md'), render(report));
  console.log(`Wrote ${join(args.out, '0108-transaction-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

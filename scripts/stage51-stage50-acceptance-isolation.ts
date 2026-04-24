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
  details?: unknown;
}

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  title?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: string; score: number }>;
  appliedTools?: ToolRow[];
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
}

interface RunData {
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

interface ToolFingerprint {
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  note: string | null;
}

interface DivergentTool {
  index: number;
  baseline: ToolFingerprint | null;
  candidate: ToolFingerprint | null;
}

interface CategoryDelta {
  key: string;
  baseline: number;
  candidate: number;
  delta: number;
}

export interface RetagInvolvement {
  scheduled: boolean;
  applied: number;
  rejected: number;
  noEffect: number;
  failed: number;
  firstIndex: number | null;
  notes: string[];
}

export type Stage51Classification =
  | 'stable_or_improved'
  | 'stage50_specific_regression'
  | 'legacy_protected_volatility'
  | 'non_retag_candidate_regression'
  | 'missing_baseline_or_candidate';

export interface Stage51SensitiveRowReport {
  rowId: string;
  file: string | null;
  baselineScore: number | null;
  baselineGrade: string | null;
  candidateScore: number | null;
  candidateGrade: string | null;
  scoreDelta: number | null;
  categoryDeltas: CategoryDelta[];
  firstDivergentAcceptedTool: DivergentTool | null;
  firstDivergentRejectedTool: DivergentTool | null;
  retagAsFigure: RetagInvolvement;
  classification: Stage51Classification;
  decisionReason: string;
}

export interface Stage51Report {
  baselineRunDir: string;
  sensitiveRunDir: string;
  edgeMixRunDir: string;
  generatedAt: string;
  sensitiveRows: Stage51SensitiveRowReport[];
  edgeMixSummary: {
    meanAfter: number | null;
    medianAfter: number | null;
    gradeDistributionAfter: Record<string, number>;
    totalToolAttempts: number | null;
    falsePositiveAppliedCount: number | null;
  } | null;
  decision: {
    status: 'edge_mix_accepted_full_corpus_provisional' | 'stage50_specific_fix_required' | 'inconclusive';
    reasons: string[];
  };
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage45-full-2026-04-23-r2';
const DEFAULT_EDGE_MIX_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage50-target-edge-mix-2026-04-24-r3';
const DEFAULT_SENSITIVE_RUN = 'Output/experiment-corpus-baseline/run-stage50-sensitive-protected-2026-04-24-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage51-stage50-acceptance-isolation-2026-04-24-r1';
const DEFAULT_SENSITIVE_IDS = [
  'structure-4076',
  'long-4683',
  'fixture-teams-targeted-wave1',
  'fixture-teams-original',
  'fixture-teams-remediated',
  'long-4680',
  'structure-4438',
];
const KNOWN_PROTECTED_VOLATILITY_IDS = new Set([
  'structure-4076',
  'long-4683',
  'fixture-teams-targeted-wave1',
  'fixture-teams-original',
  'fixture-teams-remediated',
  'long-4680',
  'structure-4438',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage51-stage50-acceptance-isolation.ts [options]',
    `  --baseline-run <dir>  Default: ${DEFAULT_BASELINE_RUN}`,
    `  --sensitive-run <dir> Default: ${DEFAULT_SENSITIVE_RUN}`,
    `  --edge-run <dir>      Default: ${DEFAULT_EDGE_MIX_RUN}`,
    `  --out <dir>           Default: ${DEFAULT_OUT}`,
    '  --id <row-id>         Repeat to override sensitive row ids',
  ].join('\n');
}

function rowKey(row: BenchmarkRow): string {
  return String(row.id ?? row.publicationId ?? '');
}

async function loadRun(runDir: string): Promise<RunData> {
  const path = join(resolve(runDir), 'remediate.results.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as BenchmarkRow[] | { rows?: BenchmarkRow[] };
  const rows = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) throw new Error(`No remediation rows found in ${path}`);
  return {
    runDir: resolve(runDir),
    rows: new Map(rows.map(row => [rowKey(row), row]).filter(([key]) => key.length > 0)),
  };
}

export async function loadEdgeMixSummaryForStage51(runDir: string): Promise<Stage51Report['edgeMixSummary']> {
  try {
    const rawRoot = JSON.parse(await readFile(join(resolve(runDir), 'summary.json'), 'utf8')) as Record<string, unknown>;
    const raw = typeof rawRoot['summary'] === 'object' && rawRoot['summary'] !== null
      ? rawRoot['summary'] as Record<string, unknown>
      : rawRoot;
    return {
      meanAfter: typeof raw['meanAfter'] === 'number' ? raw['meanAfter'] : null,
      medianAfter: typeof raw['medianAfter'] === 'number' ? raw['medianAfter'] : null,
      gradeDistributionAfter: typeof raw['gradeDistributionAfter'] === 'object' && raw['gradeDistributionAfter'] !== null
        ? raw['gradeDistributionAfter'] as Record<string, number>
        : {},
      totalToolAttempts: typeof raw['totalToolAttempts'] === 'number' ? raw['totalToolAttempts'] : null,
      falsePositiveAppliedCount: typeof raw['falsePositiveAppliedCount'] === 'number' ? raw['falsePositiveAppliedCount'] : null,
    };
  } catch {
    return null;
  }
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

function noteFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  const note = parsed['note'];
  if (typeof note === 'string') return note;
  const raw = parsed['raw'];
  return typeof raw === 'string' ? raw : null;
}

function categories(row?: BenchmarkRow): CategoryScores {
  return Object.fromEntries((row?.afterCategories ?? []).map(category => [category.key, category.score]));
}

function fingerprint(tool: ToolRow | undefined): ToolFingerprint | null {
  if (!tool) return null;
  return {
    toolName: tool.toolName ?? tool.name ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    source: typeof tool.source === 'string' ? tool.source : null,
    scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
    scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
    note: noteFromDetails(tool.details),
  };
}

function comparableKey(tool: ToolRow | undefined): string {
  const fp = fingerprint(tool);
  if (!fp) return 'missing';
  return JSON.stringify({
    toolName: fp.toolName,
    outcome: fp.outcome,
    stage: fp.stage,
    round: fp.round,
    source: fp.source,
    note: fp.note,
  });
}

function firstDivergentTool(
  baselineTools: ToolRow[],
  candidateTools: ToolRow[],
  predicate: (tool: ToolRow | undefined) => boolean,
): DivergentTool | null {
  const max = Math.max(baselineTools.length, candidateTools.length);
  for (let index = 0; index < max; index += 1) {
    const baseline = baselineTools[index];
    const candidate = candidateTools[index];
    if (!predicate(baseline) && !predicate(candidate)) continue;
    if (comparableKey(baseline) !== comparableKey(candidate)) {
      return {
        index,
        baseline: predicate(baseline) ? fingerprint(baseline) : null,
        candidate: predicate(candidate) ? fingerprint(candidate) : null,
      };
    }
  }
  return null;
}

function categoryDeltas(baseline: CategoryScores, candidate: CategoryScores): CategoryDelta[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
  return [...keys]
    .map(key => ({
      key,
      baseline: baseline[key] ?? 0,
      candidate: candidate[key] ?? 0,
      delta: (candidate[key] ?? 0) - (baseline[key] ?? 0),
    }))
    .filter(delta => delta.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key));
}

export function summarizeRetagInvolvement(tools: ToolRow[] = []): RetagInvolvement {
  const retagRows = tools
    .map((tool, index) => ({ tool, index }))
    .filter(row => (row.tool.toolName ?? row.tool.name) === 'retag_as_figure');
  return {
    scheduled: retagRows.length > 0,
    applied: retagRows.filter(row => row.tool.outcome === 'applied').length,
    rejected: retagRows.filter(row => row.tool.outcome === 'rejected').length,
    noEffect: retagRows.filter(row => row.tool.outcome === 'no_effect').length,
    failed: retagRows.filter(row => row.tool.outcome === 'failed').length,
    firstIndex: retagRows[0]?.index ?? null,
    notes: [...new Set(retagRows.map(row => noteFromDetails(row.tool.details)).filter((note): note is string => Boolean(note)))],
  };
}

function divergentToolMentionsRetag(tool: DivergentTool | null): boolean {
  return tool?.baseline?.toolName === 'retag_as_figure' || tool?.candidate?.toolName === 'retag_as_figure';
}

export function classifySensitiveRow(input: {
  rowId: string;
  scoreDelta: number | null;
  retag: RetagInvolvement;
  accepted: DivergentTool | null;
  rejected: DivergentTool | null;
  baseline?: BenchmarkRow;
  candidate?: BenchmarkRow;
}): { classification: Stage51Classification; reason: string } {
  if (!input.baseline || !input.candidate || input.scoreDelta == null) {
    return { classification: 'missing_baseline_or_candidate', reason: 'baseline_or_candidate_row_missing' };
  }
  if (input.scoreDelta >= -2) {
    return { classification: 'stable_or_improved', reason: 'score_within_two_points_or_improved' };
  }
  if (input.retag.scheduled && (divergentToolMentionsRetag(input.accepted) || divergentToolMentionsRetag(input.rejected))) {
    return { classification: 'stage50_specific_regression', reason: 'retag_as_figure_present_at_first_divergence' };
  }
  if (input.retag.applied > 0) {
    return { classification: 'stage50_specific_regression', reason: 'retag_as_figure_applied_on_regressing_row' };
  }
  if (KNOWN_PROTECTED_VOLATILITY_IDS.has(input.rowId)) {
    return { classification: 'legacy_protected_volatility', reason: 'regression_on_known_protected_volatility_row_without_retag_apply' };
  }
  return { classification: 'non_retag_candidate_regression', reason: 'regression_without_retag_attribution_on_unclassified_row' };
}

export function summarizeSensitiveRow(rowId: string, baseline?: BenchmarkRow, candidate?: BenchmarkRow): Stage51SensitiveRowReport {
  const baselineTools = baseline?.appliedTools ?? [];
  const candidateTools = candidate?.appliedTools ?? [];
  const accepted = firstDivergentTool(baselineTools, candidateTools, tool => tool?.outcome === 'applied');
  const rejected = firstDivergentTool(baselineTools, candidateTools, tool =>
    tool?.outcome === 'rejected' || tool?.outcome === 'no_effect' || tool?.outcome === 'failed');
  const retag = summarizeRetagInvolvement(candidateTools);
  const scoreDelta = typeof baseline?.afterScore === 'number' && typeof candidate?.afterScore === 'number'
    ? candidate.afterScore - baseline.afterScore
    : null;
  const classified = classifySensitiveRow({ rowId, scoreDelta, retag, accepted, rejected, baseline, candidate });
  return {
    rowId,
    file: baseline?.file ?? candidate?.file ?? candidate?.localFile ?? null,
    baselineScore: typeof baseline?.afterScore === 'number' ? baseline.afterScore : null,
    baselineGrade: baseline?.afterGrade ?? null,
    candidateScore: typeof candidate?.afterScore === 'number' ? candidate.afterScore : null,
    candidateGrade: candidate?.afterGrade ?? null,
    scoreDelta,
    categoryDeltas: categoryDeltas(categories(baseline), categories(candidate)),
    firstDivergentAcceptedTool: accepted,
    firstDivergentRejectedTool: rejected,
    retagAsFigure: retag,
    classification: classified.classification,
    decisionReason: classified.reason,
  };
}

export function buildStage51Report(input: {
  baselineRunDir: string;
  sensitiveRunDir: string;
  edgeMixRunDir: string;
  baselineRows: Map<string, BenchmarkRow>;
  sensitiveRows: Map<string, BenchmarkRow>;
  edgeMixSummary: Stage51Report['edgeMixSummary'];
  ids: string[];
  generatedAt?: string;
}): Stage51Report {
  const sensitiveRows = input.ids.map(id => summarizeSensitiveRow(id, input.baselineRows.get(id), input.sensitiveRows.get(id)));
  const stage50Regressions = sensitiveRows.filter(row => row.classification === 'stage50_specific_regression');
  const missingRows = sensitiveRows.filter(row => row.classification === 'missing_baseline_or_candidate');
  const reasons = [
    `${stage50Regressions.length} Stage50-specific regression(s)`,
    `${sensitiveRows.filter(row => row.classification === 'legacy_protected_volatility').length} legacy protected-volatility regression(s)`,
    `${sensitiveRows.filter(row => row.retagAsFigure.scheduled).length} row(s) scheduled retag_as_figure in sensitive run`,
  ];
  const status = missingRows.length > 0
    ? 'inconclusive'
    : stage50Regressions.length > 0
      ? 'stage50_specific_fix_required'
      : 'edge_mix_accepted_full_corpus_provisional';
  return {
    baselineRunDir: input.baselineRunDir,
    sensitiveRunDir: input.sensitiveRunDir,
    edgeMixRunDir: input.edgeMixRunDir,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sensitiveRows,
    edgeMixSummary: input.edgeMixSummary,
    decision: { status, reasons },
  };
}

function renderTool(tool: ToolFingerprint | null): string {
  if (!tool) return 'missing';
  return `${tool.toolName}:${tool.outcome}${tool.note ? `:${tool.note}` : ''}`;
}

function renderMarkdown(report: Stage51Report): string {
  const lines = [
    '# Stage 51 Stage 50 Acceptance Isolation',
    '',
    `- Baseline: \`${report.baselineRunDir}\``,
    `- Stage 50 edge mix: \`${report.edgeMixRunDir}\``,
    `- Stage 50 sensitive: \`${report.sensitiveRunDir}\``,
    `- Decision: **${report.decision.status}**`,
    `- Reasons: ${report.decision.reasons.join('; ')}`,
    '',
  ];
  if (report.edgeMixSummary) {
    lines.push('## Edge-Mix Result', '');
    lines.push(`- Mean after: ${report.edgeMixSummary.meanAfter ?? 'n/a'}`);
    lines.push(`- Median after: ${report.edgeMixSummary.medianAfter ?? 'n/a'}`);
    lines.push(`- Grades after: \`${JSON.stringify(report.edgeMixSummary.gradeDistributionAfter)}\``);
    lines.push(`- Attempts: ${report.edgeMixSummary.totalToolAttempts ?? 'n/a'}`);
    lines.push(`- False-positive applied: ${report.edgeMixSummary.falsePositiveAppliedCount ?? 'n/a'}`);
    lines.push('');
  }
  lines.push('## Sensitive Rows', '');
  lines.push('| row | score | class | retag | largest category deltas | first accepted divergence | first rejected/no-effect divergence |');
  lines.push('| --- | ---: | --- | --- | --- | --- | --- |');
  for (const row of report.sensitiveRows) {
    const deltas = row.categoryDeltas.slice(0, 3).map(delta => `${delta.key}:${delta.baseline}->${delta.candidate}`).join(', ') || 'none';
    const retag = row.retagAsFigure.scheduled
      ? `scheduled a${row.retagAsFigure.applied}/r${row.retagAsFigure.rejected}/n${row.retagAsFigure.noEffect}/f${row.retagAsFigure.failed}`
      : 'absent';
    lines.push(`| ${row.rowId} | ${row.baselineScore ?? 'n/a'} -> ${row.candidateScore ?? 'n/a'} | ${row.classification} | ${retag} | ${deltas} | ${renderTool(row.firstDivergentAcceptedTool?.candidate ?? row.firstDivergentAcceptedTool?.baseline ?? null)} | ${renderTool(row.firstDivergentRejectedTool?.candidate ?? row.firstDivergentRejectedTool?.baseline ?? null)} |`);
  }
  lines.push('');
  lines.push('Conclusion: Stage 50 should not be tuned for rows classified as legacy protected volatility unless full-corpus protected parity is explicitly resumed.');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): {
  baselineRun: string;
  sensitiveRun: string;
  edgeRun: string;
  outDir: string;
  ids: string[];
} {
  let baselineRun = DEFAULT_BASELINE_RUN;
  let sensitiveRun = DEFAULT_SENSITIVE_RUN;
  let edgeRun = DEFAULT_EDGE_MIX_RUN;
  let outDir = DEFAULT_OUT;
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--baseline-run') baselineRun = argv[++i] ?? baselineRun;
    else if (arg === '--sensitive-run') sensitiveRun = argv[++i] ?? sensitiveRun;
    else if (arg === '--edge-run') edgeRun = argv[++i] ?? edgeRun;
    else if (arg === '--out') outDir = argv[++i] ?? outDir;
    else if (arg === '--id') ids.push(argv[++i] ?? '');
    else if (arg === '--help') throw new Error(usage());
  }
  return { baselineRun, sensitiveRun, edgeRun, outDir, ids: ids.filter(Boolean) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const [baseline, sensitive, edgeMixSummary] = await Promise.all([
    loadRun(args.baselineRun),
    loadRun(args.sensitiveRun),
    loadEdgeMixSummaryForStage51(args.edgeRun),
  ]);
  const report = buildStage51Report({
    baselineRunDir: baseline.runDir,
    sensitiveRunDir: sensitive.runDir,
    edgeMixRunDir: resolve(args.edgeRun),
    baselineRows: baseline.rows,
    sensitiveRows: sensitive.rows,
    edgeMixSummary,
    ids: args.ids.length > 0 ? args.ids : DEFAULT_SENSITIVE_IDS,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage51-stage50-acceptance-isolation.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage51-stage50-acceptance-isolation.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 51 acceptance isolation report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

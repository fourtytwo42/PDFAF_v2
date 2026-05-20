#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_RUN = '/mnt/pdf-review/pdfaf-validation/report-layout-heading-recovery-2026-05-20-r1/run-r2/baseline_report.json';
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const HEADING_TOOL = 'create_heading_from_candidate';

export type ReportLayoutHeadingMutationClassification =
  | 'target_ref_fallback_mismatch'
  | 'strict_target_would_skip'
  | 'pac_figure_alt_side_effect'
  | 'root_rewrite_collapse'
  | 'safe_mutator_candidate'
  | 'no_behavior_path';

interface BenchmarkToolRow {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  stage?: number;
  round?: number;
  durationMs?: number;
  details?: string;
}

interface BenchmarkRow {
  file?: string;
  beforeScore?: number;
  afterScore?: number;
  afterGrade?: string;
  falsePositiveApplied?: number | boolean;
  appliedTools?: BenchmarkToolRow[];
}

interface BaselineReport {
  rows?: BenchmarkRow[];
  summary?: Record<string, unknown>;
}

interface CandidateDebug {
  structRef: string | null;
  tag: string | null;
  page: number | null;
  rootReachable: boolean | null;
  pageParentTreeHits: number | null;
}

interface SnapshotDebug {
  rootChildrenCount: number | null;
  topLevelNonEmptyCount: number | null;
  rootReachableHeadingCount: number | null;
  rootReachableDepth: number | null;
  rootReachableFigureCount: number | null;
  globalFigureCount: number | null;
  orphanMcidCount: number | null;
  checkerVisibleFigureCount: number | null;
  extractedFigureCount: number | null;
  candidate: CandidateDebug;
}

export interface ReportLayoutHeadingMutationAttempt {
  file: string;
  toolIndex: number;
  stage: number | null;
  round: number | null;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  note: string | null;
  plannedTargetRef: string | null;
  invariantTargetRef: string | null;
  actualBeforeTargetRef: string | null;
  actualAfterTargetRef: string | null;
  targetMismatch: boolean;
  classification: ReportLayoutHeadingMutationClassification;
  reasons: string[];
  pacRegressionRuleIds: string[];
  before: SnapshotDebug;
  after: SnapshotDebug;
}

export interface ReportLayoutHeadingMutationReport {
  createdAt: string;
  runPath: string;
  outDir: string;
  rowCount: number;
  attemptCount: number;
  classificationDistribution: Record<ReportLayoutHeadingMutationClassification, number>;
  decision: {
    status:
      | 'strict_target_behavior_supported'
      | 'park_reading_heading_move_table'
      | 'diagnostic_only_no_safe_behavior';
    reasons: string[];
  };
  attempts: ReportLayoutHeadingMutationAttempt[];
}

export interface ReportLayoutHeadingMutationArgs {
  run: string;
  outDir: string;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function defaultOutDir(): string {
  return join(DEFAULT_OUT_ROOT, `report-layout-heading-mutation-diagnostic-${timestampSlug()}`);
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/report-layout-heading-mutation-diagnostic.ts [options]

Options:
  --run <path>   baseline_report.json from targeted validation (default: ${DEFAULT_RUN})
  --out <dir>    Output directory (default: ${DEFAULT_OUT_ROOT}/report-layout-heading-mutation-diagnostic-<timestamp>)
  --help         Show this help

This script is diagnostic-only. It reads an existing benchmark report and does not analyze PDFs, mutate PDFs, call OpenDataLoader, or write remediated PDFs.`;
}

export function parseArgs(argv = process.argv.slice(2)): ReportLayoutHeadingMutationArgs {
  let run = DEFAULT_RUN;
  let outDir = defaultOutDir();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--run') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --run\n${usage()}`);
      run = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { run, outDir };
}

function parseDetails(details: string | undefined): Record<string, unknown> {
  if (!details?.startsWith('{')) return {};
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function upperRole(value: string | null): string | null {
  return value ? value.replace(/^\//, '').toUpperCase() : null;
}

function nestedObject(root: Record<string, unknown>, path: string[]): Record<string, unknown> | null {
  let current: Record<string, unknown> | null = root;
  for (const key of path) {
    if (!current) return null;
    current = objectValue(current[key]);
  }
  return current;
}

function nestedString(root: Record<string, unknown>, path: string[]): string | null {
  const parent = nestedObject(root, path.slice(0, -1));
  return parent ? stringValue(parent[path[path.length - 1]!]) : null;
}

function candidateDebug(value: Record<string, unknown> | null): CandidateDebug {
  return {
    structRef: stringValue(value?.['structRef']),
    tag: stringValue(value?.['tag']),
    page: numberValue(value?.['page']),
    rootReachable: booleanValue(value?.['rootReachable']),
    pageParentTreeHits: numberValue(value?.['pageParentTreeHits']),
  };
}

function snapshotDebug(value: Record<string, unknown> | null, replaySignals?: Record<string, unknown> | null): SnapshotDebug {
  return {
    rootChildrenCount: numberValue(value?.['rootChildrenCount']),
    topLevelNonEmptyCount: numberValue(value?.['topLevelNonEmptyCount']),
    rootReachableHeadingCount: numberValue(value?.['rootReachableHeadingCount'] ?? replaySignals?.['treeHeadingCount']),
    rootReachableDepth: numberValue(value?.['rootReachableDepth'] ?? replaySignals?.['headingTreeDepth']),
    rootReachableFigureCount: numberValue(value?.['rootReachableFigureCount'] ?? replaySignals?.['treeFigureCount']),
    globalFigureCount: numberValue(value?.['globalFigureCount'] ?? replaySignals?.['treeFigureCount']),
    orphanMcidCount: numberValue(value?.['orphanMcidCount'] ?? replaySignals?.['orphanMcidCount']),
    checkerVisibleFigureCount: numberValue(value?.['checkerVisibleFigureCount'] ?? replaySignals?.['checkerVisibleFigureCount']),
    extractedFigureCount: numberValue(value?.['extractedFigureCount'] ?? replaySignals?.['extractedFigureCount']),
    candidate: candidateDebug(objectValue(value?.['candidate'])),
  };
}

function pacRuleIds(details: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const single = objectValue(details['pacRuleRegression']);
  const singleId = stringValue(single?.['ruleId']);
  if (singleId) ids.push(singleId);
  const many = Array.isArray(details['pacRuleRegressions']) ? details['pacRuleRegressions'] : [];
  for (const row of many) {
    const ruleId = stringValue(objectValue(row)?.['ruleId']);
    if (ruleId) ids.push(ruleId);
  }
  return [...new Set(ids)].sort();
}

function figureCountIncreased(before: SnapshotDebug, after: SnapshotDebug): boolean {
  const pairs: Array<[number | null, number | null]> = [
    [before.extractedFigureCount, after.extractedFigureCount],
    [before.checkerVisibleFigureCount, after.checkerVisibleFigureCount],
    [before.rootReachableFigureCount, after.rootReachableFigureCount],
    [before.globalFigureCount, after.globalFigureCount],
  ];
  return pairs.some(([left, right]) => left !== null && right !== null && right > left);
}

function rootCollapsed(before: SnapshotDebug, after: SnapshotDebug): boolean {
  return (
    (before.topLevelNonEmptyCount !== null && after.topLevelNonEmptyCount !== null &&
      before.topLevelNonEmptyCount > 1 && after.topLevelNonEmptyCount <= 1) ||
    (before.rootChildrenCount !== null && after.rootChildrenCount !== null &&
      before.rootChildrenCount > 1 && after.rootChildrenCount <= 1) ||
    (before.rootReachableFigureCount !== null && after.rootReachableFigureCount !== null &&
      before.rootReachableFigureCount > 0 && after.rootReachableFigureCount === 0) ||
    (before.globalFigureCount !== null && after.globalFigureCount !== null &&
      before.globalFigureCount > 0 && after.globalFigureCount === 0)
  );
}

function paragraphLike(role: string | null): boolean {
  const normalized = upperRole(role);
  return normalized === 'P' || normalized === 'SPAN' || normalized === 'DIV';
}

function classifyAttempt(input: {
  plannedTargetRef: string | null;
  invariantTargetRef: string | null;
  actualBeforeTargetRef: string | null;
  actualAfterTargetRef: string | null;
  before: SnapshotDebug;
  after: SnapshotDebug;
  pacRegressionRuleIds: string[];
  outcome: string;
  note: string | null;
}): { classification: ReportLayoutHeadingMutationClassification; reasons: string[]; targetMismatch: boolean } {
  const reasons: string[] = [];
  if (input.note?.startsWith('strict_target_')) {
    reasons.push(input.note);
  }
  const actualRef = input.actualAfterTargetRef ?? input.actualBeforeTargetRef;
  const targetMismatch = Boolean(input.plannedTargetRef && actualRef && input.plannedTargetRef !== actualRef);
  if (targetMismatch) {
    reasons.push(`planned_target_differs_from_mutated_candidate:${input.plannedTargetRef}->${actualRef}`);
  }
  if (rootCollapsed(input.before, input.after)) {
    reasons.push('root_or_figure_structure_collapsed_after_mutation');
  }
  if (input.pacRegressionRuleIds.includes('pdfua.figure.alt_present') || figureCountIncreased(input.before, input.after)) {
    reasons.push(`figure_alt_or_figure_count_side_effect:${input.pacRegressionRuleIds.join(',') || 'figure_count_changed'}`);
  }
  const beforeRole = input.before.candidate.tag;
  const afterRole = input.after.candidate.tag;
  if (input.plannedTargetRef && input.invariantTargetRef && input.invariantTargetRef === input.plannedTargetRef) {
    const targetRole = upperRole(afterRole ?? beforeRole);
    if (targetRole && !paragraphLike(beforeRole) && !targetRole.startsWith('H')) {
      reasons.push(`planned_target_not_paragraph_like:${targetRole}`);
    }
  }
  if (input.plannedTargetRef && input.before.candidate.rootReachable === false && input.before.candidate.pageParentTreeHits === 0) {
    reasons.push('planned_target_not_root_safe');
  }

  if (targetMismatch) return { classification: 'target_ref_fallback_mismatch', reasons, targetMismatch };
  if (reasons.some(reason =>
    reason.startsWith('strict_target_') ||
    reason.startsWith('planned_target_not_paragraph_like') ||
    reason === 'planned_target_not_root_safe'
  )) {
    return { classification: 'strict_target_would_skip', reasons, targetMismatch };
  }
  if (reasons.some(reason => reason.startsWith('figure_alt_or_figure_count_side_effect'))) {
    return { classification: 'pac_figure_alt_side_effect', reasons, targetMismatch };
  }
  if (reasons.includes('root_or_figure_structure_collapsed_after_mutation')) {
    return { classification: 'root_rewrite_collapse', reasons, targetMismatch };
  }
  if (paragraphLike(beforeRole) && input.before.candidate.rootReachable !== false && input.outcome !== 'rejected') {
    return { classification: 'safe_mutator_candidate', reasons: [...reasons, 'paragraph_like_candidate_without_pac_rejection'], targetMismatch };
  }
  return { classification: 'no_behavior_path', reasons: reasons.length ? reasons : ['no_supported_behavior_signal'], targetMismatch };
}

export function classifyReportLayoutHeadingMutationAttempt(
  row: BenchmarkRow,
  tool: BenchmarkToolRow,
  toolIndex: number,
): ReportLayoutHeadingMutationAttempt | null {
  if (tool.toolName !== HEADING_TOOL) return null;
  const details = parseDetails(tool.details);
  const debug = objectValue(details['debug']) ?? {};
  const replay = objectValue(debug['replayState']) ?? {};
  const beforeSignals = objectValue(replay['detectionSignalsBefore']);
  const afterSignals = objectValue(replay['detectionSignalsAfter']);
  const before = snapshotDebug(objectValue(debug['before']), beforeSignals);
  const after = snapshotDebug(objectValue(debug['after']), afterSignals);
  const invariantTargetRef = nestedString(details, ['invariants', 'targetRef']);
  const plannedTargetRef =
    invariantTargetRef ??
    nestedString(debug, ['replayState', 'targetRef']) ??
    nestedString(debug, ['targetRef']);
  const actualBeforeTargetRef = before.candidate.structRef;
  const actualAfterTargetRef = after.candidate.structRef;
  const pacRegressionRuleIds = pacRuleIds(details);
  const note = stringValue(details['note']);
  const classified = classifyAttempt({
    plannedTargetRef,
    invariantTargetRef,
    actualBeforeTargetRef,
    actualAfterTargetRef,
    before,
    after,
    pacRegressionRuleIds,
    outcome: tool.outcome ?? 'unknown',
    note,
  });

  return {
    file: row.file ?? 'unknown',
    toolIndex,
    stage: numberValue(tool.stage),
    round: numberValue(tool.round),
    outcome: tool.outcome ?? 'unknown',
    scoreBefore: numberValue(tool.scoreBefore),
    scoreAfter: numberValue(tool.scoreAfter),
    delta: numberValue(tool.delta),
    note,
    plannedTargetRef,
    invariantTargetRef,
    actualBeforeTargetRef,
    actualAfterTargetRef,
    targetMismatch: classified.targetMismatch,
    classification: classified.classification,
    reasons: classified.reasons,
    pacRegressionRuleIds,
    before,
    after,
  };
}

function emptyDistribution(): Record<ReportLayoutHeadingMutationClassification, number> {
  return {
    target_ref_fallback_mismatch: 0,
    strict_target_would_skip: 0,
    pac_figure_alt_side_effect: 0,
    root_rewrite_collapse: 0,
    safe_mutator_candidate: 0,
    no_behavior_path: 0,
  };
}

function focusVa04OrVa07(file: string): boolean {
  return /va-0[47]/i.test(file);
}

export function buildReportLayoutHeadingMutationReport(input: {
  runPath: string;
  outDir: string;
  rows: BenchmarkRow[];
  now?: Date;
}): ReportLayoutHeadingMutationReport {
  const attempts: ReportLayoutHeadingMutationAttempt[] = [];
  for (const row of input.rows) {
    (row.appliedTools ?? []).forEach((tool, index) => {
      const attempt = classifyReportLayoutHeadingMutationAttempt(row, tool, index);
      if (attempt) attempts.push(attempt);
    });
  }
  const classificationDistribution = emptyDistribution();
  for (const attempt of attempts) {
    classificationDistribution[attempt.classification] += 1;
  }
  const focusStrictEvidence = attempts.some(attempt =>
    focusVa04OrVa07(attempt.file) &&
    (attempt.classification === 'target_ref_fallback_mismatch' || attempt.classification === 'root_rewrite_collapse'),
  );
  const onlyPacFigureSideEffects =
    attempts.length > 0 &&
    attempts.every(attempt => attempt.classification === 'pac_figure_alt_side_effect' || attempt.classification === 'no_behavior_path');
  const decision = focusStrictEvidence
    ? {
      status: 'strict_target_behavior_supported' as const,
      reasons: ['va-04_or_va-07_confirmed_target_fallback_or_root_collapse'],
    }
    : onlyPacFigureSideEffects
      ? {
        status: 'park_reading_heading_move_table' as const,
        reasons: ['heading_attempts_are_pac_figure_alt_side_effects_without_target_mismatch'],
      }
      : {
        status: 'diagnostic_only_no_safe_behavior' as const,
        reasons: ['no_strict_target_or_table_pivot_decision_supported'],
      };

  return {
    createdAt: (input.now ?? new Date()).toISOString(),
    runPath: input.runPath,
    outDir: input.outDir,
    rowCount: input.rows.length,
    attemptCount: attempts.length,
    classificationDistribution,
    decision,
    attempts,
  };
}

function renderMarkdown(report: ReportLayoutHeadingMutationReport): string {
  const lines: string[] = [];
  lines.push('# Report-Layout Heading Mutation Diagnostic');
  lines.push('');
  lines.push(`- Run: \`${report.runPath}\``);
  lines.push(`- Attempts: \`${report.attemptCount}\``);
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ')}`);
  lines.push('');
  lines.push('## Distribution');
  lines.push('');
  for (const [key, count] of Object.entries(report.classificationDistribution)) {
    lines.push(`- \`${key}\`: \`${count}\``);
  }
  lines.push('');
  lines.push('## Attempts');
  lines.push('');
  lines.push('| File | Outcome | Classification | Planned target | Actual target | Score | PAC | Reasons |');
  lines.push('|---|---:|---|---|---|---:|---|---|');
  for (const attempt of report.attempts) {
    const actual = attempt.actualAfterTargetRef ?? attempt.actualBeforeTargetRef ?? '';
    const score = `${attempt.scoreBefore ?? ''}->${attempt.scoreAfter ?? ''}`;
    lines.push([
      attempt.file,
      attempt.outcome,
      attempt.classification,
      attempt.plannedTargetRef ?? '',
      actual,
      score,
      attempt.pacRegressionRuleIds.join(', '),
      attempt.reasons.join('; '),
    ].map(value => `| ${String(value).replace(/\|/g, '\\|')} `).join('') + '|');
  }
  lines.push('');
  lines.push('This diagnostic is read-only. It consumes an existing benchmark report and does not analyze PDFs, mutate PDFs, call OpenDataLoader, or write remediated PDFs.');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const raw = await readFile(args.run, 'utf8');
  const parsed = JSON.parse(raw) as BaselineReport;
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`Report has no rows array: ${args.run}`);
  }
  await mkdir(args.outDir, { recursive: true });
  const report = buildReportLayoutHeadingMutationReport({
    runPath: args.run,
    outDir: args.outDir,
    rows: parsed.rows,
  });
  await writeFile(join(args.outDir, 'report-layout-heading-mutation-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'report-layout-heading-mutation-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote report-layout heading mutation diagnostic to ${args.outDir}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

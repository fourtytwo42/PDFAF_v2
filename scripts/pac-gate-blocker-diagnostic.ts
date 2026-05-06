#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { parsePacGateDetails } from './pac-gate-recovery-diagnostic.js';

const DEFAULT_REFERENCE = 'Output/experiment-corpus-baseline/run-stage187-full-2026-05-03-r1';
const DEFAULT_CANDIDATE = 'Output/experiment-corpus-baseline/run-pac-analysis-budget-2026-05-06-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-gate-blocker-diagnostic';
const FOCUS_RULES = new Set([
  'pdfua.content.orphan_mcids_absent',
  'pdfua.annotations.tagged_annotations_present',
  'pdfua.figure.alt_present',
]);

export type PacGateBlockerClassification =
  | 'blocked_useful_same_category_improvement'
  | 'blocked_useful_score_only'
  | 'real_harmful_regression'
  | 'true_regression_no_score_gain'
  | 'non_focus_rule';

export type PacGateBlockerRecommendation =
  | 'candidate_for_narrow_policy_review'
  | 'keep_gate'
  | 'diagnostic_only';

export interface PacGateBlockerRow {
  fileId: string;
  file: string;
  ruleId: string;
  toolName: string;
  stage: number;
  round: number;
  classification: PacGateBlockerClassification;
  recommendation: PacGateBlockerRecommendation;
  beforeStatus: string | null;
  afterStatus: string | null;
  beforeCount: number | null;
  afterCount: number | null;
  countIncrease: number | null;
  category: string | null;
  rejectedScoreBefore: number | null;
  rejectedScoreAfter: number | null;
  rejectedCategoryScoreBefore: number | null;
  rejectedCategoryScoreAfter: number | null;
  finalScore: number | null;
  referenceScore: number | null;
  estimatedRecovery: number | null;
}

export interface PacGateBlockerFrequencyRow {
  key: string;
  count: number;
  fileCount: number;
  candidateForReviewCount: number;
  estimatedRecovery: number;
}

export interface PacGateBlockerReport {
  generatedAt: string;
  referenceRunDir: string;
  candidateRunDir: string;
  summary: {
    candidateRows: number;
    pacGateRows: number;
    focusGateRows: number;
    candidateForPolicyReviewCount: number;
    realHarmfulRegressionCount: number;
    estimatedRecoverableFiles: number;
    estimatedRecoveryScoreSum: number;
  };
  byRule: PacGateBlockerFrequencyRow[];
  byTool: PacGateBlockerFrequencyRow[];
  rows: PacGateBlockerRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/pac-gate-blocker-diagnostic.ts [--reference <run-dir>] [--candidate <run-dir>] [--out <dir>]',
  ].join('\n');
}

function scoreFor(row?: RemediateBenchmarkRow): number | null {
  if (!row) return null;
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function mapRows(rows: RemediateBenchmarkRow[]): Map<string, RemediateBenchmarkRow> {
  return new Map(rows.map(row => [row.id, row]));
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function countIncrease(before: number | null, after: number | null): number | null {
  return before != null && after != null ? after - before : null;
}

export function classifyPacGateBlocker(input: {
  ruleId: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryScoreBefore: number | null;
  categoryScoreAfter: number | null;
}): PacGateBlockerClassification {
  if (!FOCUS_RULES.has(input.ruleId)) return 'non_focus_rule';
  const scoreGain = input.scoreBefore != null && input.scoreAfter != null && input.scoreAfter > input.scoreBefore;
  const categoryGain =
    input.categoryScoreBefore != null &&
    input.categoryScoreAfter != null &&
    input.categoryScoreAfter > input.categoryScoreBefore;
  const scoreLoss = input.scoreBefore != null && input.scoreAfter != null && input.scoreAfter < input.scoreBefore;
  const categoryLoss =
    input.categoryScoreBefore != null &&
    input.categoryScoreAfter != null &&
    input.categoryScoreAfter < input.categoryScoreBefore;

  if (categoryGain) return 'blocked_useful_same_category_improvement';
  if (scoreGain) return 'blocked_useful_score_only';
  if (scoreLoss || categoryLoss) return 'real_harmful_regression';
  return 'true_regression_no_score_gain';
}

function recommendationFor(row: Pick<PacGateBlockerRow, 'ruleId' | 'classification' | 'toolName'>): PacGateBlockerRecommendation {
  if (!FOCUS_RULES.has(row.ruleId)) return 'diagnostic_only';
  if (
    row.ruleId === 'pdfua.content.orphan_mcids_absent' &&
    row.classification === 'blocked_useful_same_category_improvement' &&
    (
      row.toolName === 'create_heading_from_candidate' ||
      row.toolName === 'normalize_heading_hierarchy' ||
      row.toolName === 'normalize_annotation_tab_order' ||
      row.toolName === 'repair_alt_text_structure'
    )
  ) {
    return 'candidate_for_narrow_policy_review';
  }
  return 'keep_gate';
}

function rowSort(a: PacGateBlockerRow, b: PacGateBlockerRow): number {
  const rank = (row: PacGateBlockerRow): number => row.recommendation === 'candidate_for_narrow_policy_review'
    ? 0
    : row.classification === 'real_harmful_regression'
      ? 1
      : row.classification === 'blocked_useful_score_only'
        ? 2
        : 3;
  return (
    rank(a) - rank(b) ||
    (b.estimatedRecovery ?? 0) - (a.estimatedRecovery ?? 0) ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.fileId.localeCompare(b.fileId) ||
    a.toolName.localeCompare(b.toolName) ||
    a.stage - b.stage ||
    a.round - b.round
  );
}

function buildFrequency(rows: PacGateBlockerRow[], keyFor: (row: PacGateBlockerRow) => string): PacGateBlockerFrequencyRow[] {
  const grouped = new Map<string, {
    key: string;
    count: number;
    files: string[];
    candidateForReviewCount: number;
    estimatedRecovery: number;
  }>();
  for (const row of rows) {
    const key = keyFor(row);
    const current = grouped.get(key) ?? {
      key,
      count: 0,
      files: [],
      candidateForReviewCount: 0,
      estimatedRecovery: 0,
    };
    current.count += 1;
    current.files.push(row.fileId);
    if (row.recommendation === 'candidate_for_narrow_policy_review') current.candidateForReviewCount += 1;
    current.estimatedRecovery += row.estimatedRecovery ?? 0;
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(row => ({
      key: row.key,
      count: row.count,
      fileCount: sortedUnique(row.files).length,
      candidateForReviewCount: row.candidateForReviewCount,
      estimatedRecovery: Math.round(row.estimatedRecovery * 100) / 100,
    }))
    .sort((a, b) =>
      b.candidateForReviewCount - a.candidateForReviewCount ||
      b.count - a.count ||
      b.estimatedRecovery - a.estimatedRecovery ||
      a.key.localeCompare(b.key),
    );
}

export function buildPacGateBlockerDiagnostic(input: {
  referenceRunDir: string;
  candidateRunDir: string;
  referenceRows: RemediateBenchmarkRow[];
  candidateRows: RemediateBenchmarkRow[];
  generatedAt?: string;
}): PacGateBlockerReport {
  const referenceById = mapRows(input.referenceRows);
  const rows: PacGateBlockerRow[] = [];
  for (const candidate of input.candidateRows) {
    const finalScore = scoreFor(candidate);
    const referenceScore = scoreFor(referenceById.get(candidate.id));
    for (const tool of candidate.appliedTools ?? []) {
      const parsed = parsePacGateDetails(tool.details);
      if (!parsed) continue;
      const classification = classifyPacGateBlocker({
        ruleId: parsed.ruleId,
        scoreBefore: parsed.scoreBefore,
        scoreAfter: parsed.scoreAfter,
        categoryScoreBefore: parsed.categoryScoreBefore,
        categoryScoreAfter: parsed.categoryScoreAfter,
      });
      const estimatedRecovery =
        finalScore != null && parsed.scoreAfter != null && parsed.scoreAfter > finalScore
          ? parsed.scoreAfter - finalScore
          : null;
      const row: PacGateBlockerRow = {
        fileId: candidate.id,
        file: candidate.file,
        ruleId: parsed.ruleId,
        toolName: tool.toolName,
        stage: tool.stage,
        round: tool.round,
        classification,
        recommendation: 'diagnostic_only',
        beforeStatus: parsed.beforeStatus,
        afterStatus: parsed.afterStatus,
        beforeCount: parsed.beforeCount,
        afterCount: parsed.afterCount,
        countIncrease: countIncrease(parsed.beforeCount, parsed.afterCount),
        category: parsed.category,
        rejectedScoreBefore: parsed.scoreBefore,
        rejectedScoreAfter: parsed.scoreAfter,
        rejectedCategoryScoreBefore: parsed.categoryScoreBefore,
        rejectedCategoryScoreAfter: parsed.categoryScoreAfter,
        finalScore,
        referenceScore,
        estimatedRecovery,
      };
      row.recommendation = recommendationFor(row);
      rows.push(row);
    }
  }

  rows.sort(rowSort);
  const recoverableByFile = new Map<string, number>();
  for (const row of rows) {
    if (row.recommendation !== 'candidate_for_narrow_policy_review' || row.estimatedRecovery == null) continue;
    recoverableByFile.set(row.fileId, Math.max(recoverableByFile.get(row.fileId) ?? 0, row.estimatedRecovery));
  }
  const estimatedRecoveryScoreSum = [...recoverableByFile.values()].reduce((sum, value) => sum + value, 0);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    referenceRunDir: input.referenceRunDir,
    candidateRunDir: input.candidateRunDir,
    summary: {
      candidateRows: input.candidateRows.length,
      pacGateRows: rows.length,
      focusGateRows: rows.filter(row => FOCUS_RULES.has(row.ruleId)).length,
      candidateForPolicyReviewCount: rows.filter(row => row.recommendation === 'candidate_for_narrow_policy_review').length,
      realHarmfulRegressionCount: rows.filter(row => row.classification === 'real_harmful_regression').length,
      estimatedRecoverableFiles: recoverableByFile.size,
      estimatedRecoveryScoreSum: Math.round(estimatedRecoveryScoreSum * 100) / 100,
    },
    byRule: buildFrequency(rows, row => row.ruleId),
    byTool: buildFrequency(rows, row => row.toolName),
    rows,
  };
}

function mdTable(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ['None.'];
  return [
    `| ${headers.join(' |')} |`,
    `| ${headers.map(() => '---').join(' |')} |`,
    ...rows.map(row => `| ${row.map(cell => String(cell).replace(/\|/g, '\\|')).join(' |')} |`),
  ];
}

export function renderPacGateBlockerMarkdown(report: PacGateBlockerReport): string {
  const lines: string[] = [];
  lines.push('# PAC Gate Blocker Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Reference run: \`${report.referenceRunDir}\``);
  lines.push(`Candidate run: \`${report.candidateRunDir}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- PAC gate rows: ${report.summary.pacGateRows}`);
  lines.push(`- Focus gate rows: ${report.summary.focusGateRows}`);
  lines.push(`- Candidate policy-review rows: ${report.summary.candidateForPolicyReviewCount}`);
  lines.push(`- Real harmful regressions: ${report.summary.realHarmfulRegressionCount}`);
  lines.push(`- Estimated recoverable files: ${report.summary.estimatedRecoverableFiles}`);
  lines.push(`- Estimated recovery score sum: ${report.summary.estimatedRecoveryScoreSum}`);
  lines.push('');
  lines.push('## By Rule');
  lines.push('');
  lines.push(...mdTable(
    ['Rule', 'Count', 'Files', 'Policy candidates', 'Estimated recovery'],
    report.byRule.map(row => [
      row.key,
      String(row.count),
      String(row.fileCount),
      String(row.candidateForReviewCount),
      String(row.estimatedRecovery),
    ]),
  ));
  lines.push('');
  lines.push('## By Tool');
  lines.push('');
  lines.push(...mdTable(
    ['Tool', 'Count', 'Files', 'Policy candidates', 'Estimated recovery'],
    report.byTool.map(row => [
      row.key,
      String(row.count),
      String(row.fileCount),
      String(row.candidateForReviewCount),
      String(row.estimatedRecovery),
    ]),
  ));
  lines.push('');
  lines.push('## Top Rows');
  lines.push('');
  lines.push(...mdTable(
    ['File', 'Rule', 'Tool', 'Class', 'Recommendation', 'Rejected score', 'Rejected category', 'Final', 'Recovery'],
    report.rows.slice(0, 100).map(row => [
      row.fileId,
      row.ruleId,
      row.toolName,
      row.classification,
      row.recommendation,
      `${row.rejectedScoreBefore ?? 'n/a'} -> ${row.rejectedScoreAfter ?? 'n/a'}`,
      `${row.rejectedCategoryScoreBefore ?? 'n/a'} -> ${row.rejectedCategoryScoreAfter ?? 'n/a'}`,
      String(row.finalScore ?? 'n/a'),
      String(row.estimatedRecovery ?? 'n/a'),
    ]),
  ));
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let reference = DEFAULT_REFERENCE;
  let candidate = DEFAULT_CANDIDATE;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--reference') reference = args[++index] ?? '';
    else if (arg === '--candidate') candidate = args[++index] ?? '';
    else if (arg === '--out') out = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!reference || !candidate || !out) throw new Error(usage());

  const [referenceRows, candidateRows] = await Promise.all([
    loadBenchmarkRowsFromRunDir(reference),
    loadBenchmarkRowsFromRunDir(candidate),
  ]);
  const report = buildPacGateBlockerDiagnostic({
    referenceRunDir: reference,
    candidateRunDir: candidate,
    referenceRows: referenceRows.remediateResults,
    candidateRows: candidateRows.remediateResults,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-gate-blocker-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-gate-blocker-diagnostic.md'), renderPacGateBlockerMarkdown(report), 'utf8');
  console.log(`Wrote PAC gate blocker diagnostic to ${outDir}`);
  console.log(`PAC gate rows: ${report.summary.pacGateRows}`);
  console.log(`Candidate policy-review rows: ${report.summary.candidateForPolicyReviewCount}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

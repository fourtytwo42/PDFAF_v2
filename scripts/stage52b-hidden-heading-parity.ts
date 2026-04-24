#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CATEGORY_BASE_WEIGHTS,
  GRADE_THRESHOLDS,
  LEGAL_PDF_STRICT_GRADED_CATEGORIES,
} from '../src/config.js';
import type { EdgeMixBenchmarkRow, EdgeMixToolRow } from './stage49-edge-mix-baseline.js';

export interface Stage52bHiddenHeadingParityAdjustment {
  kind: 'final_hidden_heading_parity';
  status: 'applied' | 'skipped';
  reason: string;
  evidenceCount: number;
  sourceTool: string | null;
  headingScoreBefore: number | null;
  headingScoreAfter: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  gradeBefore: string | null;
  gradeAfter: string | null;
}

export interface Stage52bParityRowReport extends Stage52bHiddenHeadingParityAdjustment {
  id: string;
  file?: string;
  altText: number | null;
  tableMarkup: number | null;
  extractedHeadingCount: number;
  treeHeadingCount: number;
}

export interface Stage52bParityReport {
  generatedAt: string;
  inputRunDir: string;
  rowCount: number;
  appliedCount: number;
  skippedCount: number;
  meanBefore: number;
  meanAfter: number;
  gradeDistributionBefore: Record<string, number>;
  gradeDistributionAfter: Record<string, number>;
  rows: Stage52bParityRowReport[];
}

const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage50-target-edge-mix-2026-04-24-r3';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage52b-hidden-heading-parity-2026-04-24-r1';
const SUFFICIENT_HIDDEN_HEADING_COUNT = 5;
const GRADED_CATEGORY_SET = new Set<string>(LEGAL_PDF_STRICT_GRADED_CATEGORIES);
const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage52b-hidden-heading-parity.ts [run-dir] [out-dir]

Defaults:
  run-dir: ${DEFAULT_RUN}
  out-dir: ${DEFAULT_OUT}`;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function categoryScore(row: Pick<EdgeMixBenchmarkRow, 'afterCategories'>, key: string): number | null {
  return row.afterCategories.find(category => category.key === key)?.score ?? null;
}

function categoryApplicable(category: { applicable?: boolean }): boolean {
  return category.applicable !== false;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string') return null;
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function maxRootReachableHeadingEvidence(tools: EdgeMixToolRow[]): { count: number; sourceTool: string | null } {
  let count = 0;
  let sourceTool: string | null = null;
  for (const tool of tools) {
    const details = parseDetails(tool.details);
    if (!details) continue;
    const invariants = nestedRecord(details, 'invariants');
    const debug = nestedRecord(details, 'debug');
    const candidates = [
      num(invariants['rootReachableHeadingCountAfter']),
      num(debug['rootReachableHeadingCount']),
    ];
    for (const key of ['afterSnapshot', 'after']) {
      const snapshot = nestedRecord(debug, key);
      candidates.push(num(snapshot['rootReachableHeadingCount']));
    }
    const localMax = Math.max(...candidates);
    if (localMax > count) {
      count = localMax;
      sourceTool = tool.toolName;
    }
  }
  return { count, sourceTool };
}

function headingSignals(row: EdgeMixBenchmarkRow): { extractedHeadingCount: number; treeHeadingCount: number } {
  const signals = row.afterDetectionProfile?.['headingSignals'];
  const heading = signals && typeof signals === 'object' && !Array.isArray(signals)
    ? signals as Record<string, unknown>
    : {};
  return {
    extractedHeadingCount: num(heading['extractedHeadingCount']),
    treeHeadingCount: num(heading['treeHeadingCount']),
  };
}

function hasCriticalScoreCap(row: EdgeMixBenchmarkRow): boolean {
  for (const cap of row.afterScoreCapsApplied ?? []) {
    if (!cap || typeof cap !== 'object' || Array.isArray(cap)) continue;
    const record = cap as Record<string, unknown>;
    const capValue = record['cap'];
    const reason = String(record['reason'] ?? '').toLowerCase();
    if (typeof capValue === 'number' && capValue <= 59) return true;
    if (reason.includes('critical')) return true;
  }
  return false;
}

function deriveGrade(score: number): string {
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  if (score >= GRADE_THRESHOLDS.C) return 'C';
  if (score >= GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}

function recomputeScore(categories: EdgeMixBenchmarkRow['afterCategories']): number {
  const applicable = categories.filter(category => categoryApplicable(category) && GRADED_CATEGORY_SET.has(category.key));
  const naWeight = categories
    .filter(category => !categoryApplicable(category) && GRADED_CATEGORY_SET.has(category.key))
    .reduce((sum, category) => sum + (CATEGORY_BASE_WEIGHTS[category.key as keyof typeof CATEGORY_BASE_WEIGHTS] ?? 0), 0);
  const applicableBaseWeight = applicable
    .reduce((sum, category) => sum + (CATEGORY_BASE_WEIGHTS[category.key as keyof typeof CATEGORY_BASE_WEIGHTS] ?? 0), 0);
  const raw = applicable.reduce((sum, category) => {
    const baseWeight = CATEGORY_BASE_WEIGHTS[category.key as keyof typeof CATEGORY_BASE_WEIGHTS] ?? 0;
    const effectiveWeight = applicableBaseWeight > 0
      ? baseWeight + naWeight * (baseWeight / applicableBaseWeight)
      : baseWeight;
    return sum + category.score * effectiveWeight;
  }, 0);
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function skipped(
  row: EdgeMixBenchmarkRow,
  reason: string,
  evidenceCount = 0,
  sourceTool: string | null = null,
): Stage52bHiddenHeadingParityAdjustment {
  return {
    kind: 'final_hidden_heading_parity',
    status: 'skipped',
    reason,
    evidenceCount,
    sourceTool,
    headingScoreBefore: categoryScore(row, 'heading_structure'),
    headingScoreAfter: categoryScore(row, 'heading_structure'),
    scoreBefore: row.afterScore,
    scoreAfter: row.afterScore,
    gradeBefore: row.afterGrade,
    gradeAfter: row.afterGrade,
  };
}

export function applyFinalHiddenHeadingParity(row: EdgeMixBenchmarkRow): EdgeMixBenchmarkRow {
  const adjustment = deriveFinalHiddenHeadingParity(row);
  if (adjustment.status !== 'applied') {
    return {
      ...row,
      finalAdjustments: [...(row.finalAdjustments ?? []), adjustment],
    };
  }
  const nextCategories = row.afterCategories.map(category =>
    category.key === 'heading_structure'
      ? { ...category, score: adjustment.headingScoreAfter ?? category.score }
      : category
  );
  return {
    ...row,
    afterCategories: nextCategories,
    afterScore: adjustment.scoreAfter,
    afterGrade: adjustment.gradeAfter,
    delta: typeof row.beforeScore === 'number' && typeof adjustment.scoreAfter === 'number'
      ? adjustment.scoreAfter - row.beforeScore
      : row.delta,
    finalAdjustments: [...(row.finalAdjustments ?? []), adjustment],
  };
}

export function deriveFinalHiddenHeadingParity(row: EdgeMixBenchmarkRow): Stage52bHiddenHeadingParityAdjustment {
  if (row.error) return skipped(row, 'row_error');
  const headingScore = categoryScore(row, 'heading_structure');
  if (headingScore !== 0) return skipped(row, 'heading_score_not_zero');
  const signals = headingSignals(row);
  if (signals.extractedHeadingCount > 0 || signals.treeHeadingCount > 0) {
    return skipped(row, 'final_heading_signals_not_zero');
  }
  const altText = categoryScore(row, 'alt_text');
  if (altText == null || altText < 70) return skipped(row, 'alt_text_below_guard');
  const tableMarkup = categoryScore(row, 'table_markup');
  if (tableMarkup == null || tableMarkup < 70) return skipped(row, 'table_markup_below_guard');
  if (hasCriticalScoreCap(row)) return skipped(row, 'critical_score_cap_present');

  const evidence = maxRootReachableHeadingEvidence(row.appliedTools);
  if (evidence.count <= 0) return skipped(row, 'missing_structured_root_reachable_heading_evidence');

  const adjustedHeadingScore = evidence.count >= SUFFICIENT_HIDDEN_HEADING_COUNT ? 86 : 78;
  const nextCategories = row.afterCategories.map(category =>
    category.key === 'heading_structure'
      ? { ...category, score: adjustedHeadingScore }
      : category
  );
  const nextScore = recomputeScore(nextCategories);
  return {
    kind: 'final_hidden_heading_parity',
    status: 'applied',
    reason: 'structured_root_reachable_heading_evidence_final_only',
    evidenceCount: evidence.count,
    sourceTool: evidence.sourceTool,
    headingScoreBefore: headingScore,
    headingScoreAfter: adjustedHeadingScore,
    scoreBefore: row.afterScore,
    scoreAfter: nextScore,
    gradeBefore: row.afterGrade,
    gradeAfter: deriveGrade(nextScore),
  };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function gradeDistribution(grades: Array<string | null>): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(GRADE_ORDER.map(grade => [grade, 0]));
  for (const grade of grades) {
    if (!grade) continue;
    out[grade] = (out[grade] ?? 0) + 1;
  }
  return out;
}

export function buildStage52bHiddenHeadingParityReport(
  rows: EdgeMixBenchmarkRow[],
  inputRunDir = DEFAULT_RUN,
): Stage52bParityReport {
  const adjustedRows = rows.map(applyFinalHiddenHeadingParity);
  const reports = adjustedRows.map((row, index) => {
    const original = rows[index]!;
    const adjustment = row.finalAdjustments?.find(item => item.kind === 'final_hidden_heading_parity')
      ?? deriveFinalHiddenHeadingParity(original);
    const signals = headingSignals(original);
    return {
      id: original.id,
      file: original.file,
      altText: categoryScore(original, 'alt_text'),
      tableMarkup: categoryScore(original, 'table_markup'),
      extractedHeadingCount: signals.extractedHeadingCount,
      treeHeadingCount: signals.treeHeadingCount,
      ...adjustment,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    inputRunDir,
    rowCount: rows.length,
    appliedCount: reports.filter(report => report.status === 'applied').length,
    skippedCount: reports.filter(report => report.status === 'skipped').length,
    meanBefore: mean(rows.map(row => row.afterScore).filter((score): score is number => typeof score === 'number')),
    meanAfter: mean(adjustedRows.map(row => row.afterScore).filter((score): score is number => typeof score === 'number')),
    gradeDistributionBefore: gradeDistribution(rows.map(row => row.afterGrade)),
    gradeDistributionAfter: gradeDistribution(adjustedRows.map(row => row.afterGrade)),
    rows: reports,
  };
}

function markdown(report: Stage52bParityReport): string {
  const lines = ['# Stage 52B Final-Only Hidden-Heading Parity', ''];
  lines.push(`Input run: \`${report.inputRunDir}\``);
  lines.push(`Rows: ${report.rowCount}; applied: ${report.appliedCount}; skipped: ${report.skippedCount}`);
  lines.push(`Mean score: ${report.meanBefore.toFixed(2)} -> ${report.meanAfter.toFixed(2)}`);
  lines.push(`Grades: \`${JSON.stringify(report.gradeDistributionBefore)}\` -> \`${JSON.stringify(report.gradeDistributionAfter)}\``, '');
  lines.push('| ID | Status | Reason | Evidence | Heading | Score | Grade |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.status} | ${row.reason} | ${row.evidenceCount} | ${row.headingScoreBefore ?? 'n/a'} -> ${row.headingScoreAfter ?? 'n/a'} | ${row.scoreBefore ?? 'n/a'} -> ${row.scoreAfter ?? 'n/a'} | ${row.gradeBefore ?? 'n/a'} -> ${row.gradeAfter ?? 'n/a'} |`);
  }
  return lines.join('\n');
}

async function loadRows(runDir: string): Promise<EdgeMixBenchmarkRow[]> {
  const raw = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error(`Expected remediate.results.json array in ${runDir}`);
  return raw as EdgeMixBenchmarkRow[];
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  argv = argv.filter(arg => arg !== '--');
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const runDir = argv[0] ?? DEFAULT_RUN;
  const outDir = argv[1] ?? DEFAULT_OUT;
  const rows = await loadRows(runDir);
  const report = buildStage52bHiddenHeadingParityReport(rows, runDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage52b-hidden-heading-parity.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'stage52b-hidden-heading-parity.md'), markdown(report));
  console.log(`Wrote Stage 52B hidden-heading parity report to ${outDir}`);
  console.log(`Mean: ${report.meanBefore.toFixed(2)} -> ${report.meanAfter.toFixed(2)}`);
  console.log(`Grades: ${JSON.stringify(report.gradeDistributionBefore)} -> ${JSON.stringify(report.gradeDistributionAfter)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

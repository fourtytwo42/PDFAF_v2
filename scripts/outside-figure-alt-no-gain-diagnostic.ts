#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectStage186TargetRefs } from '../src/services/remediation/stage186Hard2TableAlt.js';

const DEFAULT_OUT = '/mnt/pdf-review/pdfaf-validation/outside-figure-alt-no-gain-diagnostic-2026-05-21-r1';

type FigureAltNoGainClass =
  | 'checker_alt_full_tree_cap_candidate'
  | 'checker_alt_partial_existing_bound'
  | 'alt_target_not_checker_counted'
  | 'figure_pac_regression_blocker'
  | 'low_alt_no_alt_tool_evidence'
  | 'alt_high_or_not_focus'
  | 'timeout_or_error';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  delta?: number | null;
  details?: unknown;
}

interface BaselineReportRow {
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  categoryGap?: {
    after?: CategoryScore[];
  };
  categoriesAfter?: CategoryScore[];
  appliedTools?: AppliedTool[];
  falsePositiveApplied?: number | null;
  durationMs?: number | null;
  error?: string | null;
}

interface BaselineReport {
  generatedAt?: string;
  inputDir?: string;
  rows?: BaselineReportRow[];
}

interface ReplaySignals {
  checkerVisibleFigureCount: number | null;
  checkerVisibleFigureAltCount: number | null;
  extractedFigureCount: number | null;
  treeFigureCount: number | null;
  treeFigureMissingForExtractedFigures: boolean | null;
  orphanMcidCount: number | null;
}

interface ReplayCategories {
  alt_text: number | null;
  heading_structure: number | null;
  reading_order: number | null;
  table_markup: number | null;
  pdf_ua_compliance: number | null;
}

interface AltToolEvidence {
  toolName: string;
  outcome: string;
  targetRefs: string[];
  beforeAlt: number | null;
  afterAlt: number | null;
  beforeScore: number | null;
  afterScore: number | null;
  beforeSignals: ReplaySignals;
  afterSignals: ReplaySignals;
}

interface FigureAltNoGainRow {
  file: string;
  afterScore: number | null;
  afterGrade: string | null;
  classification: FigureAltNoGainClass;
  behaviorCandidate: boolean;
  scoringCalibrationCandidate: boolean;
  reason: string;
  categories: ReplayCategories;
  altToolCount: number;
  appliedAltWriteCount: number;
  attemptedAltRefs: string[];
  bestReplayAltAfter: number | null;
  maxReplayCheckerVisibleFigureCount: number | null;
  maxReplayCheckerVisibleFigureAltCount: number | null;
  treeFigureMissingAtMaxCoverage: boolean | null;
  extractedFigureCountAtMaxCoverage: number | null;
  treeFigureCountAtMaxCoverage: number | null;
  pacFigureAltRegressionCount: number;
  falsePositiveApplied: number;
  durationMs: number | null;
  altToolEvidence: AltToolEvidence[];
}

export interface FigureAltNoGainReport {
  generatedAt: string;
  sourceRun: string;
  inputDir: string | null;
  decision: {
    status:
      | 'plan_tree_cap_scoring_calibration_proof'
      | 'plan_target_discovery_proof'
      | 'keep_figure_alt_diagnostic_only'
      | 'no_figure_alt_focus_rows';
    reasons: string[];
  };
  rowCount: number;
  focusRows: number;
  candidateRows: number;
  falsePositiveApplied: number;
  classSummary: Array<{
    classification: FigureAltNoGainClass;
    rows: number;
    files: string[];
  }>;
  rows: FigureAltNoGainRow[];
}

const ALT_TOOL_NAMES = new Set([
  'set_figure_alt_text',
  'retag_as_figure',
  'canonicalize_figure_alt_ownership',
  'repair_alt_text_structure',
  'normalize_nested_figure_containers',
]);

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function categoryMap(row: BaselineReportRow): Map<string, number> {
  const categories = row.categoryGap?.after ?? row.categoriesAfter ?? [];
  return new Map(categories
    .filter(category => category.applicable !== false && typeof category.key === 'string' && typeof category.score === 'number')
    .map(category => [category.key as string, category.score as number]));
}

function categoryScore(row: BaselineReportRow, key: string): number | null {
  return categoryMap(row).get(key) ?? null;
}

function replayState(details: unknown): Record<string, unknown> | null {
  return nested(nested(parseDetails(details), 'debug'), 'replayState');
}

function replaySignals(details: unknown, suffix: 'Before' | 'After'): ReplaySignals {
  const signals = nested(replayState(details), `detectionSignals${suffix}`);
  return {
    checkerVisibleFigureCount: numberOrNull(signals?.checkerVisibleFigureCount),
    checkerVisibleFigureAltCount: numberOrNull(signals?.checkerVisibleFigureAltCount),
    extractedFigureCount: numberOrNull(signals?.extractedFigureCount),
    treeFigureCount: numberOrNull(signals?.treeFigureCount),
    treeFigureMissingForExtractedFigures: booleanOrNull(signals?.treeFigureMissingForExtractedFigures),
    orphanMcidCount: numberOrNull(signals?.orphanMcidCount),
  };
}

function replayCategory(details: unknown, suffix: 'Before' | 'After', key: keyof ReplayCategories): number | null {
  const scores = nested(replayState(details), `categoryScores${suffix}`);
  return numberOrNull(scores?.[key]);
}

function categoriesFor(row: BaselineReportRow): ReplayCategories {
  return {
    alt_text: categoryScore(row, 'alt_text'),
    heading_structure: categoryScore(row, 'heading_structure'),
    reading_order: categoryScore(row, 'reading_order'),
    table_markup: categoryScore(row, 'table_markup'),
    pdf_ua_compliance: categoryScore(row, 'pdf_ua_compliance'),
  };
}

function pacFigureAltRegressionCount(row: BaselineReportRow): number {
  let count = 0;
  for (const tool of row.appliedTools ?? []) {
    const text = JSON.stringify(parseDetails(tool.details) ?? tool.details ?? '');
    if (text.includes('pdfua.figure.alt_present')) count += 1;
  }
  return count;
}

function altToolEvidence(row: BaselineReportRow): AltToolEvidence[] {
  return (row.appliedTools ?? [])
    .filter(tool => tool.toolName && ALT_TOOL_NAMES.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
      targetRefs: [...collectStage186TargetRefs(tool.details)].sort(),
      beforeAlt: replayCategory(tool.details, 'Before', 'alt_text'),
      afterAlt: replayCategory(tool.details, 'After', 'alt_text'),
      beforeScore: numberOrNull(tool.scoreBefore),
      afterScore: numberOrNull(tool.scoreAfter),
      beforeSignals: replaySignals(tool.details, 'Before'),
      afterSignals: replaySignals(tool.details, 'After'),
    }));
}

function bestAltAfter(evidence: AltToolEvidence[]): number | null {
  const values = evidence.map(tool => tool.afterAlt).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

function maxCoverageEvidence(evidence: AltToolEvidence[]): { signals: ReplaySignals; alt: number | null } | null {
  const candidates: Array<{ signals: ReplaySignals; alt: number | null }> = [];
  for (const tool of evidence) {
    candidates.push({ signals: tool.beforeSignals, alt: tool.beforeAlt });
    candidates.push({ signals: tool.afterSignals, alt: tool.afterAlt });
  }
  const usable = candidates.filter(item =>
    item.signals.checkerVisibleFigureCount !== null &&
    item.signals.checkerVisibleFigureAltCount !== null
  );
  if (usable.length === 0) return null;
  return usable.sort((a, b) =>
    (b.signals.checkerVisibleFigureAltCount ?? -1) - (a.signals.checkerVisibleFigureAltCount ?? -1) ||
    (b.signals.checkerVisibleFigureCount ?? -1) - (a.signals.checkerVisibleFigureCount ?? -1) ||
    (b.alt ?? -1) - (a.alt ?? -1)
  )[0] ?? null;
}

function attemptedRefs(evidence: AltToolEvidence[]): string[] {
  return [...new Set(evidence.flatMap(tool => tool.targetRefs))].sort();
}

function classifyRow(row: BaselineReportRow): FigureAltNoGainRow {
  const categories = categoriesFor(row);
  const evidence = altToolEvidence(row);
  const maxCoverage = maxCoverageEvidence(evidence);
  const maxSignals = maxCoverage?.signals;
  const finalAlt = categories.alt_text ?? 100;
  const afterScore = numberOrNull(row.afterScore);
  const appliedAltWriteCount = evidence.filter(tool => tool.toolName === 'set_figure_alt_text' && tool.outcome === 'applied').length;
  const pacRegressionCount = pacFigureAltRegressionCount(row);
  const maxChecker = maxSignals?.checkerVisibleFigureCount ?? null;
  const maxCheckerAlt = maxSignals?.checkerVisibleFigureAltCount ?? null;
  const maxHasFullCheckerAlt = maxChecker !== null && maxChecker > 0 && maxCheckerAlt === maxChecker;
  const partialCheckerImproved = evidence.some(tool =>
    (tool.afterSignals.checkerVisibleFigureAltCount ?? -1) > (tool.beforeSignals.checkerVisibleFigureAltCount ?? -1) &&
    (tool.afterSignals.checkerVisibleFigureAltCount ?? -1) < (tool.afterSignals.checkerVisibleFigureCount ?? -1)
  );
  const targetNotCounted = evidence.some(tool =>
    tool.outcome === 'applied' &&
    tool.toolName === 'set_figure_alt_text' &&
    tool.afterSignals.checkerVisibleFigureAltCount !== null &&
    tool.beforeSignals.checkerVisibleFigureAltCount !== null &&
    tool.afterSignals.checkerVisibleFigureAltCount <= tool.beforeSignals.checkerVisibleFigureAltCount
  );

  let classification: FigureAltNoGainClass = 'alt_high_or_not_focus';
  let reason = 'alt score is already high enough or no figure-alt no-gain evidence was found';
  let behaviorCandidate = false;
  let scoringCalibrationCandidate = false;

  if (row.error || afterScore === null) {
    classification = 'timeout_or_error';
    reason = row.error ?? 'missing after score';
  } else if (finalAlt <= 50 && maxHasFullCheckerAlt && maxSignals?.treeFigureMissingForExtractedFigures === true) {
    classification = 'checker_alt_full_tree_cap_candidate';
    scoringCalibrationCandidate = true;
    reason = `checker-visible figures reached ${maxCheckerAlt}/${maxChecker} alt coverage, but treeFigureMissingForExtractedFigures kept alt_text at ${finalAlt}`;
  } else if (finalAlt <= 50 && partialCheckerImproved) {
    classification = 'checker_alt_partial_existing_bound';
    reason = 'bounded figure-alt writes improved checker-visible coverage but did not reach enough coverage to move final alt_text';
  } else if (finalAlt <= 50 && targetNotCounted) {
    classification = 'alt_target_not_checker_counted';
    behaviorCandidate = true;
    reason = 'an applied set_figure_alt_text target did not increase checker-visible alt coverage';
  } else if (finalAlt <= 50 && evidence.length === 0) {
    classification = 'low_alt_no_alt_tool_evidence';
    reason = 'low alt_text without visible figure-alt tool evidence in this run artifact';
  } else if (finalAlt <= 80 && pacRegressionCount > 0) {
    classification = 'figure_pac_regression_blocker';
    reason = 'figure-alt PAC regression guards blocked other structural changes';
  }

  return {
    file: row.file ?? 'unknown',
    afterScore,
    afterGrade: row.afterGrade ?? null,
    classification,
    behaviorCandidate,
    scoringCalibrationCandidate,
    reason,
    categories,
    altToolCount: evidence.length,
    appliedAltWriteCount,
    attemptedAltRefs: attemptedRefs(evidence),
    bestReplayAltAfter: bestAltAfter(evidence),
    maxReplayCheckerVisibleFigureCount: maxChecker,
    maxReplayCheckerVisibleFigureAltCount: maxCheckerAlt,
    treeFigureMissingAtMaxCoverage: maxSignals?.treeFigureMissingForExtractedFigures ?? null,
    extractedFigureCountAtMaxCoverage: maxSignals?.extractedFigureCount ?? null,
    treeFigureCountAtMaxCoverage: maxSignals?.treeFigureCount ?? null,
    pacFigureAltRegressionCount: pacRegressionCount,
    falsePositiveApplied: numberOrNull(row.falsePositiveApplied) ?? 0,
    durationMs: numberOrNull(row.durationMs),
    altToolEvidence: evidence,
  };
}

export function buildFigureAltNoGainReport(input: {
  sourceRun: string;
  report: BaselineReport;
  includeHighAlt?: boolean;
}): FigureAltNoGainReport {
  const rows = input.report.rows ?? [];
  const classified = rows.map(classifyRow);
  const focusRows = classified.filter(row =>
    input.includeHighAlt ||
    row.classification !== 'alt_high_or_not_focus' ||
    (row.categories.alt_text ?? 100) < 90 ||
    row.pacFigureAltRegressionCount > 0
  );
  const classMap = new Map<FigureAltNoGainClass, { rows: number; files: string[] }>();
  for (const row of focusRows) {
    const current = classMap.get(row.classification) ?? { rows: 0, files: [] };
    current.rows += 1;
    current.files.push(row.file);
    classMap.set(row.classification, current);
  }
  const classSummary = [...classMap.entries()]
    .map(([classification, value]) => ({ classification, ...value }))
    .sort((a, b) => b.rows - a.rows || a.classification.localeCompare(b.classification));
  const scoringCandidates = focusRows.filter(row => row.scoringCalibrationCandidate);
  const behaviorCandidates = focusRows.filter(row => row.behaviorCandidate);
  const falsePositiveApplied = classified.reduce((sum, row) => sum + row.falsePositiveApplied, 0);
  const status = scoringCandidates.length > 0
    ? 'plan_tree_cap_scoring_calibration_proof'
    : behaviorCandidates.length > 0
      ? 'plan_target_discovery_proof'
      : focusRows.length > 0
        ? 'keep_figure_alt_diagnostic_only'
        : 'no_figure_alt_focus_rows';
  const reasons = [
    `rows=${rows.length}`,
    `focus_rows=${focusRows.length}`,
    `scoring_candidates=${scoringCandidates.length}`,
    `behavior_candidates=${behaviorCandidates.length}`,
    `false_positive_applied=${falsePositiveApplied}`,
  ];
  if (scoringCandidates.length > 0) reasons.push(`tree_cap_candidates=${scoringCandidates.map(row => row.file).join(',')}`);
  if (behaviorCandidates.length > 0) reasons.push(`target_discovery_candidates=${behaviorCandidates.map(row => row.file).join(',')}`);

  return {
    generatedAt: new Date().toISOString(),
    sourceRun: input.sourceRun,
    inputDir: input.report.inputDir ?? null,
    decision: { status, reasons },
    rowCount: rows.length,
    focusRows: focusRows.length,
    candidateRows: scoringCandidates.length + behaviorCandidates.length,
    falsePositiveApplied,
    classSummary,
    rows: focusRows,
  };
}

function md(value: unknown): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function categoriesText(categories: ReplayCategories): string {
  return [
    `alt=${categories.alt_text ?? 'n/a'}`,
    `heading=${categories.heading_structure ?? 'n/a'}`,
    `reading=${categories.reading_order ?? 'n/a'}`,
    `table=${categories.table_markup ?? 'n/a'}`,
    `pdfua=${categories.pdf_ua_compliance ?? 'n/a'}`,
  ].join(' ');
}

export function renderFigureAltNoGainMarkdown(report: FigureAltNoGainReport): string {
  const lines = [
    '# Outside Figure/Alt No-Gain Diagnostic',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Source run: \`${report.sourceRun}\``,
    `- Input dir: ${report.inputDir ? `\`${report.inputDir}\`` : 'n/a'}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    `- False positives applied: ${report.falsePositiveApplied}`,
    '',
    'This is a diagnostic/reporting artifact only. It reads existing benchmark JSON replay evidence and does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java, call semantic AI, or change production scoring/planning behavior.',
    '',
    '## Class Summary',
    '',
    '| Class | Rows | Files |',
    '| --- | ---: | --- |',
  ];
  for (const row of report.classSummary) {
    lines.push([
      row.classification,
      row.rows,
      row.files.map(file => `\`${file}\``).join(', '),
    ].map(md).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Rows', '');
  lines.push('| File | Score | Class | Categories | Replay Checker Alt | Tree Cap | Alt Tools | PAC Figure Guards | Reason |');
  lines.push('| --- | ---: | --- | --- | ---: | --- | ---: | ---: | --- |');
  for (const row of report.rows) {
    const checker = row.maxReplayCheckerVisibleFigureAltCount === null || row.maxReplayCheckerVisibleFigureCount === null
      ? 'n/a'
      : `${row.maxReplayCheckerVisibleFigureAltCount}/${row.maxReplayCheckerVisibleFigureCount}`;
    lines.push([
      `\`${row.file}\``,
      `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? '?'}`,
      row.classification,
      categoriesText(row.categories),
      checker,
      row.treeFigureMissingAtMaxCoverage === null
        ? 'n/a'
        : `${row.treeFigureMissingAtMaxCoverage} (tree=${row.treeFigureCountAtMaxCoverage ?? 'n/a'}, extracted=${row.extractedFigureCountAtMaxCoverage ?? 'n/a'})`,
      row.appliedAltWriteCount,
      row.pacFigureAltRegressionCount,
      row.reason,
    ].map(md).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function writeFigureAltNoGainReport(input: {
  runPath: string;
  outDir: string;
  includeHighAlt?: boolean;
}): Promise<FigureAltNoGainReport> {
  const runPath = resolve(input.runPath);
  const raw = JSON.parse(await readFile(runPath, 'utf8')) as BaselineReport;
  if (!Array.isArray(raw.rows)) throw new Error(`Unsupported baseline report shape: ${runPath}`);
  const report = buildFigureAltNoGainReport({
    sourceRun: runPath,
    report: raw,
    includeHighAlt: input.includeHighAlt,
  });
  await mkdir(input.outDir, { recursive: true });
  await writeFile(join(input.outDir, 'outside-figure-alt-no-gain-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(input.outDir, 'outside-figure-alt-no-gain-diagnostic.md'), renderFigureAltNoGainMarkdown(report), 'utf8');
  return report;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts --run <baseline_report.json> [options]

Options:
  --run <path>         Existing baseline_report.json to inspect
  --out <dir>          Output directory (default: ${DEFAULT_OUT})
  --include-high-alt   Include all rows with figure-alt tool evidence, even high-alt rows
  --help               Show this help`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const runPath = argValue('--run');
  if (!runPath) throw new Error(`Missing --run.\n${usage()}`);
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const report = await writeFigureAltNoGainReport({
    runPath,
    outDir,
    includeHighAlt: process.argv.includes('--include-high-alt'),
  });
  console.log(`[outside-figure-alt-no-gain] wrote ${join(outDir, 'outside-figure-alt-no-gain-diagnostic.md')}`);
  console.log(`[outside-figure-alt-no-gain] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error((error as Error).message);
    process.exit(1);
  });
}

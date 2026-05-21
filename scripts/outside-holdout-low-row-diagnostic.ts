#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_OUT = '/mnt/pdf-review/pdfaf-validation/outside-holdout-low-row-diagnostic-2026-05-21-r1';

type CandidateClass =
  | 'figure_alt_object_candidate'
  | 'figure_alt_target_discovery_needed'
  | 'table_target_resolution_needed'
  | 'table_object_candidate'
  | 'reading_link_order_candidate'
  | 'metadata_pdfua_candidate'
  | 'near_miss_monitor'
  | 'timeout_or_error'
  | 'no_safe_predicate';

type Priority = 'high' | 'medium' | 'low' | 'blocked';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  details?: unknown;
  delta?: number;
  scoreBefore?: number;
  scoreAfter?: number;
}

interface BaselineReportRow {
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  durationMs?: number | null;
  categoryGap?: {
    before?: CategoryScore[];
    after?: CategoryScore[];
  };
  categoriesAfter?: CategoryScore[];
  appliedTools?: AppliedTool[];
  falsePositiveApplied?: number | null;
  error?: string | null;
}

interface BaselineReport {
  generatedAt?: string;
  inputDir?: string;
  rows?: BaselineReportRow[];
  summary?: {
    count?: number;
    meanAfter?: number;
    allRowMeanAfter?: number;
  };
}

export interface LowRowDiagnostic {
  file: string;
  afterScore: number | null;
  afterGrade: string | null;
  rawPointsToTarget: number;
  priority: Priority;
  candidateClass: CandidateClass;
  supportingClasses: CandidateClass[];
  lowestCategories: Array<{ key: string; score: number }>;
  evidence: string[];
  suggestedNextStep: string;
  falsePositiveApplied: number;
  durationMs: number | null;
  error: string | null;
}

export interface OutsideHoldoutLowRowReport {
  generatedAt: string;
  sourceRun: string;
  inputDir: string | null;
  targetMean: number;
  lowScoreThreshold: number;
  rowCount: number;
  completedRows: number;
  currentMeanAllRows: number | null;
  rawPointsNeededForTargetMean: number;
  falsePositiveApplied: number;
  timeoutOrErrorCount: number;
  decision: {
    status:
      | 'holdout_target_met'
      | 'plan_high_impact_targeted_diagnostic'
      | 'plan_medium_impact_targeted_diagnostic'
      | 'no_safe_low_row_lane';
    recommendedLane: CandidateClass | null;
    reasons: string[];
  };
  laneSummary: Array<{
    candidateClass: CandidateClass;
    rows: number;
    rawPointsToTarget: number;
    files: string[];
  }>;
  lowRows: LowRowDiagnostic[];
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function scoreValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rowScoreOrZero(row: BaselineReportRow): number {
  return scoreValue(row.afterScore) ?? 0;
}

function applicableAfterCategories(row: BaselineReportRow): Array<{ key: string; score: number }> {
  const categories = row.categoryGap?.after ?? row.categoriesAfter ?? [];
  return categories
    .filter(category => category.applicable !== false && typeof category.key === 'string' && typeof category.score === 'number')
    .map(category => ({ key: category.key as string, score: category.score as number }));
}

function categoryMap(row: BaselineReportRow): Map<string, number> {
  const map = new Map<string, number>();
  for (const category of applicableAfterCategories(row)) map.set(category.key, category.score);
  return map;
}

function categoryScore(categories: Map<string, number>, key: string): number {
  return categories.get(key) ?? 100;
}

function parseDetails(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function detailsText(value: unknown): string {
  const parsed = parseDetails(value);
  if (typeof parsed === 'string') return parsed;
  try {
    return JSON.stringify(parsed ?? {});
  } catch {
    return '';
  }
}

function toolRows(row: BaselineReportRow): AppliedTool[] {
  return Array.isArray(row.appliedTools) ? row.appliedTools : [];
}

function toolCount(row: BaselineReportRow, toolName: string, outcome?: string): number {
  return toolRows(row).filter(tool => tool.toolName === toolName && (!outcome || tool.outcome === outcome)).length;
}

function anyTool(row: BaselineReportRow, toolNames: string[], outcome?: string): boolean {
  return toolRows(row).some(tool => tool.toolName && toolNames.includes(tool.toolName) && (!outcome || tool.outcome === outcome));
}

function pacRegressionRules(row: BaselineReportRow): string[] {
  const rules = new Set<string>();
  for (const tool of toolRows(row)) {
    const text = detailsText(tool.details);
    for (const match of text.matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
      const rule = match[1];
      if (rule) rules.add(rule);
    }
  }
  return [...rules].sort((a, b) => a.localeCompare(b));
}

function priorityFor(score: number | null): Priority {
  if (score === null) return 'blocked';
  if (score <= 70) return 'high';
  if (score < 85) return 'medium';
  return 'low';
}

function suggestedStep(candidateClass: CandidateClass): string {
  switch (candidateClass) {
    case 'figure_alt_object_candidate':
      return 'Run a focused figure/alt object diagnostic against missing-alt ownership and accepted alt writes; behavior must be object-backed and control-validated.';
    case 'figure_alt_target_discovery_needed':
      return 'Inspect native figure target discovery before adding behavior; current evidence shows alt debt but no proven safe target path.';
    case 'table_target_resolution_needed':
      return 'Resolve table target identity before behavior promotion; verify requested refs are real /Table objects immediately before mutation.';
    case 'table_object_candidate':
      return 'Run a focused table object diagnostic for stable /Table refs, header debt, and normalize/header sequence safety.';
    case 'reading_link_order_candidate':
      return 'Run a native reading/link-order diagnostic; promote only if geometry/link structure evidence separates positives from controls.';
    case 'metadata_pdfua_candidate':
      return 'Inspect title/language/PDF-UA catalog syntax rejection reasons; promote only if native metadata evidence is stable and not already strict-score-active.';
    case 'near_miss_monitor':
      return 'Keep as a low-priority near miss unless a broader lane reaches it naturally without extra risk.';
    case 'timeout_or_error':
      return 'Treat as runtime/analyzer debt before scoring or remediation behavior.';
    case 'no_safe_predicate':
      return 'No safe general lane is visible from this run artifact alone.';
  }
}

function classifyRow(row: BaselineReportRow, targetScore: number): LowRowDiagnostic {
  const file = row.file ?? 'unknown';
  const afterScore = scoreValue(row.afterScore);
  const rawPointsToTarget = Math.max(0, Math.ceil(targetScore - (afterScore ?? 0)));
  const categories = categoryMap(row);
  const lowestCategories = [...categories.entries()]
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))
    .slice(0, 6);
  const evidence: string[] = [];
  const supporting = new Set<CandidateClass>();
  const rules = pacRegressionRules(row);

  if (row.error || afterScore === null) {
    evidence.push(row.error ? `row_error:${row.error}` : 'missing_after_score');
    return {
      file,
      afterScore,
      afterGrade: row.afterGrade ?? null,
      rawPointsToTarget,
      priority: 'blocked',
      candidateClass: 'timeout_or_error',
      supportingClasses: [],
      lowestCategories,
      evidence,
      suggestedNextStep: suggestedStep('timeout_or_error'),
      falsePositiveApplied: scoreValue(row.falsePositiveApplied) ?? 0,
      durationMs: scoreValue(row.durationMs),
      error: row.error ?? null,
    };
  }

  const alt = categoryScore(categories, 'alt_text');
  const table = categoryScore(categories, 'table_markup');
  const reading = categoryScore(categories, 'reading_order');
  const link = categoryScore(categories, 'link_quality');
  const titleLanguage = categoryScore(categories, 'title_language');
  const pdfUa = categoryScore(categories, 'pdf_ua_compliance');
  const heading = categoryScore(categories, 'heading_structure');

  const appliedAltWrites = toolCount(row, 'set_figure_alt_text', 'applied');
  const figureAltPacRegression = rules.some(rule => rule.includes('figure.alt_present'));
  const tableHeaderPacRegression = rules.some(rule => rule.includes('table.header_association_present'));
  const tableToolsTouched = anyTool(row, ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);
  const metadataToolsRejected = anyTool(row, ['set_document_title', 'set_document_language', 'normalize_pdfua_catalog_settings'], 'rejected');
  const readingOrLinkToolsTouched = anyTool(row, [
    'normalize_annotation_tab_order',
    'repair_native_link_structure',
    'set_link_annotation_contents',
    'tag_unowned_annotations',
    'artifact_repeating_page_furniture',
  ]);

  if (alt <= 50) {
    if (appliedAltWrites > 0 || figureAltPacRegression) {
      supporting.add('figure_alt_object_candidate');
      evidence.push(`alt_text=${alt} with ${appliedAltWrites} applied set_figure_alt_text attempt(s)`);
      if (figureAltPacRegression) evidence.push('PAC-like figure alt regression guard triggered');
    } else {
      supporting.add('figure_alt_target_discovery_needed');
      evidence.push(`alt_text=${alt} without a proven accepted figure-alt target path`);
    }
  }

  if (table <= 50 || (table <= 80 && tableHeaderPacRegression)) {
    if (tableToolsTouched || tableHeaderPacRegression) {
      supporting.add('table_target_resolution_needed');
      evidence.push(`table_markup=${table}; table tools or PAC table-header debt were present`);
      if (tableHeaderPacRegression) evidence.push('PAC-like table header association guard triggered');
    } else {
      supporting.add('table_object_candidate');
      evidence.push(`table_markup=${table} with no visible table-tool proof in this artifact`);
    }
  }

  if (reading <= 75 || link <= 75) {
    supporting.add('reading_link_order_candidate');
    evidence.push(`reading_order=${reading}, link_quality=${link}`);
    if (readingOrLinkToolsTouched) evidence.push('reading/link/page-furniture tools were attempted');
  }

  if (titleLanguage <= 50 || pdfUa <= 60) {
    supporting.add('metadata_pdfua_candidate');
    evidence.push(`title_language=${titleLanguage}, pdf_ua_compliance=${pdfUa}`);
    if (metadataToolsRejected) evidence.push('metadata/PDF-UA catalog tools were rejected');
  }

  if (heading <= 80 && !supporting.has('reading_link_order_candidate')) {
    evidence.push(`heading_structure=${heading}`);
  }

  let candidateClass: CandidateClass = 'no_safe_predicate';
  const priority = priorityFor(afterScore);
  const ordered: CandidateClass[] = [
    'figure_alt_object_candidate',
    'table_target_resolution_needed',
    'reading_link_order_candidate',
    'metadata_pdfua_candidate',
    'table_object_candidate',
    'figure_alt_target_discovery_needed',
  ];

  const severeCategoryDebt = lowestCategories.some(category => category.score <= 60);
  if (priority === 'low' && rawPointsToTarget <= 4 && !severeCategoryDebt) {
    candidateClass = 'near_miss_monitor';
    if (supporting.size > 0) evidence.push(`near_miss_lane_hint:${[...supporting].join(',')}`);
  } else {
    candidateClass = ordered.find(value => supporting.has(value)) ?? 'no_safe_predicate';
  }

  if (evidence.length === 0) evidence.push('no category/tool signal below safe diagnostic thresholds');

  return {
    file,
    afterScore,
    afterGrade: row.afterGrade ?? null,
    rawPointsToTarget,
    priority,
    candidateClass,
    supportingClasses: [...supporting].filter(value => value !== candidateClass),
    lowestCategories,
    evidence,
    suggestedNextStep: suggestedStep(candidateClass),
    falsePositiveApplied: scoreValue(row.falsePositiveApplied) ?? 0,
    durationMs: scoreValue(row.durationMs),
    error: row.error ?? null,
  };
}

function laneRank(candidateClass: CandidateClass): number {
  const ranks: CandidateClass[] = [
    'figure_alt_object_candidate',
    'table_target_resolution_needed',
    'reading_link_order_candidate',
    'metadata_pdfua_candidate',
    'table_object_candidate',
    'figure_alt_target_discovery_needed',
    'near_miss_monitor',
    'timeout_or_error',
    'no_safe_predicate',
  ];
  return ranks.indexOf(candidateClass) >= 0 ? ranks.indexOf(candidateClass) : ranks.length;
}

export function buildOutsideHoldoutLowRowReport(input: {
  sourceRun: string;
  report: BaselineReport;
  targetMean?: number;
  lowScoreThreshold?: number;
}): OutsideHoldoutLowRowReport {
  const targetMean = input.targetMean ?? 93;
  const lowScoreThreshold = input.lowScoreThreshold ?? targetMean;
  const rows = input.report.rows ?? [];
  const rowCount = rows.length;
  const completedRows = rows.filter(row => !row.error && scoreValue(row.afterScore) !== null).length;
  const scoreTotal = rows.reduce((sum, row) => sum + rowScoreOrZero(row), 0);
  const currentMeanAllRows = rowCount > 0 ? round4(scoreTotal / rowCount) : null;
  const rawPointsNeededForTargetMean = Math.max(0, Math.ceil((targetMean * rowCount) - scoreTotal));
  const falsePositiveApplied = rows.reduce((sum, row) => sum + (scoreValue(row.falsePositiveApplied) ?? 0), 0);
  const timeoutOrErrorCount = rows.filter(row => row.error || scoreValue(row.afterScore) === null).length;
  const lowRows = rows
    .filter(row => row.error || (scoreValue(row.afterScore) ?? 0) < lowScoreThreshold)
    .map(row => classifyRow(row, targetMean))
    .sort((a, b) => {
      const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2, blocked: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] ||
        b.rawPointsToTarget - a.rawPointsToTarget ||
        laneRank(a.candidateClass) - laneRank(b.candidateClass) ||
        a.file.localeCompare(b.file);
    });

  const laneMap = new Map<CandidateClass, { rows: number; rawPointsToTarget: number; files: string[] }>();
  for (const row of lowRows) {
    const current = laneMap.get(row.candidateClass) ?? { rows: 0, rawPointsToTarget: 0, files: [] };
    current.rows += 1;
    current.rawPointsToTarget += row.rawPointsToTarget;
    current.files.push(row.file);
    laneMap.set(row.candidateClass, current);
  }
  const laneSummary = [...laneMap.entries()]
    .map(([candidateClass, value]) => ({ candidateClass, ...value }))
    .sort((a, b) => b.rawPointsToTarget - a.rawPointsToTarget || laneRank(a.candidateClass) - laneRank(b.candidateClass));

  const recommended = laneSummary.find(lane =>
    lane.candidateClass !== 'near_miss_monitor' &&
    lane.candidateClass !== 'timeout_or_error' &&
    lane.candidateClass !== 'no_safe_predicate'
  ) ?? null;
  const highImpact = lowRows.some(row => row.priority === 'high' && row.candidateClass !== 'no_safe_predicate');
  const mediumImpact = lowRows.some(row => row.priority === 'medium' && row.candidateClass !== 'no_safe_predicate');
  const status = rawPointsNeededForTargetMean === 0
    ? 'holdout_target_met'
    : highImpact
      ? 'plan_high_impact_targeted_diagnostic'
      : mediumImpact
        ? 'plan_medium_impact_targeted_diagnostic'
        : 'no_safe_low_row_lane';

  const reasons = [
    `rows=${rowCount}`,
    `completed=${completedRows}`,
    `mean=${currentMeanAllRows ?? 'n/a'}`,
    `raw_points_needed=${rawPointsNeededForTargetMean}`,
    `low_rows=${lowRows.length}`,
    `false_positive_applied=${falsePositiveApplied}`,
    `timeout_or_error=${timeoutOrErrorCount}`,
  ];
  if (recommended) reasons.push(`recommended_lane=${recommended.candidateClass}:${recommended.rawPointsToTarget}pts`);

  return {
    generatedAt: new Date().toISOString(),
    sourceRun: input.sourceRun,
    inputDir: input.report.inputDir ?? null,
    targetMean,
    lowScoreThreshold,
    rowCount,
    completedRows,
    currentMeanAllRows,
    rawPointsNeededForTargetMean,
    falsePositiveApplied,
    timeoutOrErrorCount,
    decision: {
      status,
      recommendedLane: recommended?.candidateClass ?? null,
      reasons,
    },
    laneSummary,
    lowRows,
  };
}

function md(value: unknown): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function categorySummary(categories: Array<{ key: string; score: number }>): string {
  return categories.map(category => `${category.key}=${category.score}`).join(', ');
}

export function renderOutsideHoldoutLowRowMarkdown(report: OutsideHoldoutLowRowReport): string {
  const lines = [
    '# Outside Holdout Low-Row Diagnostic',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Source run: \`${report.sourceRun}\``,
    `- Input dir: ${report.inputDir ? `\`${report.inputDir}\`` : 'n/a'}`,
    `- Decision: \`${report.decision.status}\``,
    `- Recommended lane: \`${report.decision.recommendedLane ?? 'none'}\``,
    `- Mean all rows: ${report.currentMeanAllRows ?? 'n/a'}`,
    `- Target mean: ${report.targetMean}`,
    `- Raw points needed: ${report.rawPointsNeededForTargetMean}`,
    `- False positives applied: ${report.falsePositiveApplied}`,
    `- Timeout/error rows: ${report.timeoutOrErrorCount}`,
    '',
    'This is a diagnostic/reporting artifact only. It reads an existing baseline report and does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java, call semantic AI, or change production scoring/planning behavior.',
    '',
    '## Lane Summary',
    '',
    '| Candidate Class | Rows | Raw Points To Target | Files |',
    '| --- | ---: | ---: | --- |',
  ];
  for (const lane of report.laneSummary) {
    lines.push([
      lane.candidateClass,
      lane.rows,
      lane.rawPointsToTarget,
      lane.files.map(file => `\`${file}\``).join(', '),
    ].map(md).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Low Rows', '');
  lines.push('| File | Score | Priority | Class | Points | Lowest Categories | Evidence | Next Step |');
  lines.push('| --- | ---: | --- | --- | ---: | --- | --- | --- |');
  for (const row of report.lowRows) {
    lines.push([
      `\`${row.file}\``,
      `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? '?'}`,
      row.priority,
      row.candidateClass,
      row.rawPointsToTarget,
      categorySummary(row.lowestCategories),
      row.evidence.join('; '),
      row.suggestedNextStep,
    ].map(md).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function writeOutsideHoldoutLowRowReport(input: {
  runPath: string;
  outDir: string;
  targetMean?: number;
  lowScoreThreshold?: number;
}): Promise<OutsideHoldoutLowRowReport> {
  const runPath = resolve(input.runPath);
  const raw = JSON.parse(await readFile(runPath, 'utf8')) as BaselineReport;
  if (!Array.isArray(raw.rows)) throw new Error(`Unsupported baseline report shape: ${runPath}`);
  const report = buildOutsideHoldoutLowRowReport({
    sourceRun: runPath,
    report: raw,
    targetMean: input.targetMean,
    lowScoreThreshold: input.lowScoreThreshold,
  });
  await mkdir(input.outDir, { recursive: true });
  await writeFile(join(input.outDir, 'outside-holdout-low-row-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(input.outDir, 'outside-holdout-low-row-diagnostic.md'), renderOutsideHoldoutLowRowMarkdown(report), 'utf8');
  return report;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts --run <baseline_report.json> [options]

Options:
  --run <path>              Existing bounded/baseline report JSON to inspect
  --out <dir>               Output directory (default: ${DEFAULT_OUT})
  --target-mean <number>    Holdout target mean (default: 93)
  --low-score <number>      Include rows below this score (default: target mean)
  --help                    Show this help`;
}

function parseNumberArg(name: string, fallback: number): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${name}: ${raw}`);
  return parsed;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const runPath = argValue('--run');
  if (!runPath) throw new Error(`Missing --run.\n${usage()}`);
  const targetMean = parseNumberArg('--target-mean', 93);
  const lowScoreThreshold = parseNumberArg('--low-score', targetMean);
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const report = await writeOutsideHoldoutLowRowReport({
    runPath,
    outDir,
    targetMean,
    lowScoreThreshold,
  });
  console.log(`[outside-holdout-low-row] wrote ${join(outDir, 'outside-holdout-low-row-diagnostic.md')}`);
  console.log(`[outside-holdout-low-row] decision ${report.decision.status}; recommended ${report.decision.recommendedLane ?? 'none'}`);
  if (report.rawPointsNeededForTargetMean > 0) {
    console.log(`[outside-holdout-low-row] raw points needed for ${targetMean}: ${report.rawPointsNeededForTargetMean}`);
  }
  console.log(`[outside-holdout-low-row] source ${basename(resolve(runPath))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error((error as Error).message);
    process.exit(1);
  });
}

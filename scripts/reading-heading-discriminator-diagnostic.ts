#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  LayoutCandidateEvaluation,
  ReadingLayoutCalibrationReport,
  ReadingLayoutDiagnosticRow,
} from './reading-layout-calibration-diagnostic.js';

const DEFAULT_INPUT = '/mnt/pdf-review/pdfaf-odl-diagnostics/reading-layout-calibration-2026-05-19-r1/reading-layout-calibration.json';
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-odl-diagnostics';

export type ReadingHeadingDiscriminator =
  | 'report_layout_heading_recovery_candidate'
  | 'geometry_order_scoring_only_candidate'
  | 'control_like_short_guide_or_table_noise'
  | 'no_safe_discriminator';

export interface ReadingHeadingDiscriminatorArgs {
  input: string;
  outDir: string;
}

export interface ReadingHeadingDiscriminatorRow {
  id: string;
  pdfPath: string;
  role: 'focus' | 'control';
  sourceClassification: string;
  discriminator: ReadingHeadingDiscriminator;
  reasons: string[];
  features: {
    score: number | null;
    readingOrder: number | null;
    headingStructure: number | null;
    sampledPageCount: number;
    layoutHeadingCandidateCount: number;
    layoutHeadingDensity: number;
    repeatedHeaderFooterPageCount: number;
    headerFooterCoverageRatio: number;
    geometryOrderRiskPages: number;
    multiColumnPageCount: number;
    layoutTableCandidateCount: number;
    excludedNoiseCount: number;
    tableNoiseSampleCount: number;
    existingTargetMatchCount: number;
    paragraphMatchCount: number;
    mcidMatchCount: number;
    nativeTitleMatchCount: number;
    visibleAnchorMatchCount: number;
    matchedTargetTypes: string[];
    reportScaleSignal: boolean;
    targetBackedSignal: boolean;
    lowScoreHeadingReadingDebt: boolean;
    guideScaleSignal: boolean;
    tableNoiseSignal: boolean;
  };
  matchedTexts: string[];
}

export interface ReadingHeadingDiscriminatorReport {
  createdAt: string;
  inputPath: string;
  outDir: string;
  rowCount: number;
  discriminatorDistribution: Record<ReadingHeadingDiscriminator, number>;
  focusDistribution: Record<ReadingHeadingDiscriminator, number>;
  controlDistribution: Record<ReadingHeadingDiscriminator, number>;
  decision: {
    status:
      | 'clean_report_layout_discriminator_found'
      | 'reject_report_layout_discriminator_controls_trigger'
      | 'scoring_only_followup_candidate'
      | 'no_safe_discriminator';
    reasons: string[];
  };
  rows: ReadingHeadingDiscriminatorRow[];
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function defaultOutDir(): string {
  return join(DEFAULT_OUT_ROOT, `reading-heading-discriminator-${timestampSlug()}`);
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/reading-heading-discriminator-diagnostic.ts [options]

Options:
  --input <path>   Reading layout calibration JSON (default: ${DEFAULT_INPUT})
  --out <dir>      Output directory (default: ${DEFAULT_OUT_ROOT}/reading-heading-discriminator-<timestamp>)
  --help           Show this help

This script is diagnostic-only. It consumes a prior native calibration report and does not analyze, remediate, score, mutate, or call OpenDataLoader.`;
}

export function parseArgs(argv = process.argv.slice(2)): ReadingHeadingDiscriminatorArgs {
  let input = DEFAULT_INPUT;
  let outDir = defaultOutDir();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--input') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --input\n${usage()}`);
      input = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { input, outDir };
}

export async function loadReadingLayoutCalibrationReport(inputPath: string): Promise<ReadingLayoutCalibrationReport> {
  let raw: string;
  try {
    raw = await readFile(inputPath, 'utf8');
  } catch (err) {
    throw new Error(`Reading layout calibration report not found or unreadable: ${inputPath}; ${(err as Error).message}`);
  }
  const parsed = JSON.parse(raw) as Partial<ReadingLayoutCalibrationReport>;
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`Reading layout calibration report has no rows array: ${inputPath}`);
  }
  return parsed as ReadingLayoutCalibrationReport;
}

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function matchedCandidates(row: ReadingLayoutDiagnosticRow): LayoutCandidateEvaluation[] {
  return row.candidates.filter(candidate => candidate.decision === 'matched_existing_target');
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function featureReasons(row: ReadingHeadingDiscriminatorRow): string[] {
  const features = row.features;
  const reasons: string[] = [];
  if (features.lowScoreHeadingReadingDebt) reasons.push('low_reading_or_heading_score');
  if (features.reportScaleSignal) {
    reasons.push(`report_scale_layout_evidence:heads=${features.layoutHeadingCandidateCount},hfPages=${features.repeatedHeaderFooterPageCount}`);
  }
  if (features.targetBackedSignal) reasons.push(`existing_target_matches:${features.existingTargetMatchCount}`);
  if (features.guideScaleSignal) reasons.push('short_guide_scale_layout_evidence');
  if (features.tableNoiseSignal) reasons.push(`table_or_noise_heavy_samples:${features.tableNoiseSampleCount}/${features.excludedNoiseCount}`);
  if (features.geometryOrderRiskPages > 0 || features.multiColumnPageCount > 0) {
    reasons.push(`geometry_risk:geom=${features.geometryOrderRiskPages},multi=${features.multiColumnPageCount}`);
  }
  if (features.matchedTargetTypes.length > 0) reasons.push(`matchedTargetTypes=${features.matchedTargetTypes.join(',')}`);
  return reasons;
}

export function classifyReadingHeadingDiscriminator(row: ReadingLayoutDiagnosticRow): ReadingHeadingDiscriminatorRow {
  const matches = matchedCandidates(row);
  const matchedTargetTypes = [...new Set(matches.flatMap(candidate => candidate.matchedTargetType ? [candidate.matchedTargetType] : []))].sort();
  const matchedTexts = matches
    .map(candidate => normalizeText(candidate.text))
    .filter(Boolean)
    .slice(0, 8);
  const sampledPageCount = Math.max(1, row.layout.sampledPageCount || 0);
  const existingTargetMatchCount = matches.length;
  const excludedNoiseCount = row.candidates.filter(candidate => candidate.decision === 'excluded').length;
  const tableNoiseSampleCount = row.candidates.filter(candidate =>
    candidate.source === 'table_row_band' || candidate.exclusionReason === 'table_row_band' || candidate.exclusionReason === 'table_like_text',
  ).length;
  const readingOrder = safeNumber(row.scores.readingOrder);
  const headingStructure = safeNumber(row.scores.headingStructure);
  const lowScoreHeadingReadingDebt = (readingOrder ?? 100) <= 80 || (headingStructure ?? 100) <= 80;
  const layoutHeadingDensity = ratio(row.layout.layoutHeadingCandidateCount, sampledPageCount);
  const headerFooterCoverageRatio = ratio(row.layout.repeatedHeaderFooterPageCount, sampledPageCount);

  const reportScaleSignal =
    row.layout.layoutHeadingCandidateCount >= 60 &&
    row.layout.repeatedHeaderFooterPageCount >= 20 &&
    layoutHeadingDensity >= 2.0 &&
    headerFooterCoverageRatio >= 0.4;
  const targetBackedSignal = existingTargetMatchCount >= 2 && matchedTargetTypes.length > 0;
  const guideScaleSignal =
    row.layout.layoutHeadingCandidateCount <= 40 &&
    row.layout.repeatedHeaderFooterPageCount <= 8 &&
    matchedTexts.length > 0 &&
    matchedTexts.every(text => wordCount(text) <= 6);
  const tableNoiseSignal =
    tableNoiseSampleCount >= 4 ||
    (excludedNoiseCount >= 8 && existingTargetMatchCount === 0) ||
    row.layout.layoutTableCandidateCount >= Math.max(4, Math.ceil(row.layout.layoutHeadingCandidateCount * 0.2));

  let discriminator: ReadingHeadingDiscriminator;
  if (lowScoreHeadingReadingDebt && reportScaleSignal && targetBackedSignal) {
    discriminator = 'report_layout_heading_recovery_candidate';
  } else if (
    lowScoreHeadingReadingDebt &&
    (row.layout.geometryOrderRiskPages > 0 || row.layout.multiColumnPageCount > 0) &&
    !targetBackedSignal
  ) {
    discriminator = 'geometry_order_scoring_only_candidate';
  } else if (
    lowScoreHeadingReadingDebt &&
    (guideScaleSignal || tableNoiseSignal || row.role === 'control') &&
    !reportScaleSignal
  ) {
    discriminator = 'control_like_short_guide_or_table_noise';
  } else {
    discriminator = 'no_safe_discriminator';
  }

  const output: ReadingHeadingDiscriminatorRow = {
    id: row.id,
    pdfPath: row.pdfPath,
    role: row.role,
    sourceClassification: row.classification,
    discriminator,
    reasons: [],
    features: {
      score: safeNumber(row.scores.overall),
      readingOrder,
      headingStructure,
      sampledPageCount,
      layoutHeadingCandidateCount: row.layout.layoutHeadingCandidateCount,
      layoutHeadingDensity,
      repeatedHeaderFooterPageCount: row.layout.repeatedHeaderFooterPageCount,
      headerFooterCoverageRatio,
      geometryOrderRiskPages: row.layout.geometryOrderRiskPages,
      multiColumnPageCount: row.layout.multiColumnPageCount,
      layoutTableCandidateCount: row.layout.layoutTableCandidateCount,
      excludedNoiseCount,
      tableNoiseSampleCount,
      existingTargetMatchCount,
      paragraphMatchCount: matches.filter(candidate => candidate.matchedTargetType === 'paragraph_struct_elem').length,
      mcidMatchCount: matches.filter(candidate => candidate.matchedTargetType === 'mcid_text_span').length,
      nativeTitleMatchCount: matches.filter(candidate => candidate.matchedTargetType === 'native_title_bt').length,
      visibleAnchorMatchCount: matches.filter(candidate => candidate.matchedTargetType === 'visible_heading_anchor').length,
      matchedTargetTypes,
      reportScaleSignal,
      targetBackedSignal,
      lowScoreHeadingReadingDebt,
      guideScaleSignal,
      tableNoiseSignal,
    },
    matchedTexts,
  };
  output.reasons = featureReasons(output);
  if (output.reasons.length === 0) output.reasons.push('no_discriminator_threshold_met');
  return output;
}

function countByDiscriminator(rows: ReadingHeadingDiscriminatorRow[]): Record<ReadingHeadingDiscriminator, number> {
  return rows.reduce<Record<ReadingHeadingDiscriminator, number>>((acc, row) => {
    acc[row.discriminator] = (acc[row.discriminator] ?? 0) + 1;
    return acc;
  }, {} as Record<ReadingHeadingDiscriminator, number>);
}

export function buildReadingHeadingDiscriminatorReport(
  calibration: ReadingLayoutCalibrationReport,
  inputPath: string,
  outDir: string,
): ReadingHeadingDiscriminatorReport {
  const rows = calibration.rows.map(classifyReadingHeadingDiscriminator);
  const focusRows = rows.filter(row => row.role === 'focus');
  const controlRows = rows.filter(row => row.role === 'control');
  const focusDistribution = countByDiscriminator(focusRows);
  const controlDistribution = countByDiscriminator(controlRows);
  const discriminatorDistribution = countByDiscriminator(rows);
  const focusReportCandidates = focusDistribution.report_layout_heading_recovery_candidate ?? 0;
  const controlReportCandidates = controlDistribution.report_layout_heading_recovery_candidate ?? 0;
  const scoringOnlyCandidates = discriminatorDistribution.geometry_order_scoring_only_candidate ?? 0;
  const reasons = [
    `focus_report_layout_heading_recovery_candidate=${focusReportCandidates}`,
    `control_report_layout_heading_recovery_candidate=${controlReportCandidates}`,
    `geometry_order_scoring_only_candidate=${scoringOnlyCandidates}`,
  ];

  let status: ReadingHeadingDiscriminatorReport['decision']['status'];
  if (controlReportCandidates > 0) {
    status = 'reject_report_layout_discriminator_controls_trigger';
    reasons.push('at_least_one_control_matches_report_layout_predicate');
  } else if (focusReportCandidates >= 3) {
    status = 'clean_report_layout_discriminator_found';
    reasons.push('at_least_three_focus_rows_match_report_layout_predicate_and_controls_are_clean');
  } else if (scoringOnlyCandidates >= 1) {
    status = 'scoring_only_followup_candidate';
    reasons.push('geometry_order_evidence_exists_without_safe_repair_targets');
  } else {
    status = 'no_safe_discriminator';
    reasons.push('no_behavior_or_scoring_discriminator_met_thresholds');
  }

  return {
    createdAt: new Date().toISOString(),
    inputPath,
    outDir,
    rowCount: rows.length,
    discriminatorDistribution,
    focusDistribution,
    controlDistribution,
    decision: { status, reasons },
    rows,
  };
}

function mdEscape(value: string | number | null | undefined): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

export function markdownReport(report: ReadingHeadingDiscriminatorReport): string {
  const lines = [
    '# Reading/Heading Discriminator Diagnostic',
    '',
    `- Created: ${report.createdAt}`,
    `- Input: \`${report.inputPath}\``,
    `- Rows: ${report.rowCount}`,
    `- Discriminator distribution: ${JSON.stringify(report.discriminatorDistribution)}`,
    `- Focus distribution: ${JSON.stringify(report.focusDistribution)}`,
    `- Control distribution: ${JSON.stringify(report.controlDistribution)}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'This report is diagnostic-only. It consumes native calibration evidence and does not analyze PDFs, call OpenDataLoader, change scoring, route remediation, or mutate PDFs.',
    '',
    '| Row | Role | Score R/H | Discriminator | Report Scale | Targets | Layout Scale | Noise | Matched Text Samples | Reasons |',
    '| --- | --- | ---: | --- | --- | ---: | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const features = row.features;
    const layoutScale = [
      `heads=${features.layoutHeadingCandidateCount}`,
      `density=${fmt(features.layoutHeadingDensity)}`,
      `hf=${features.repeatedHeaderFooterPageCount}`,
      `hfRatio=${fmt(features.headerFooterCoverageRatio)}`,
      `geom=${features.geometryOrderRiskPages}`,
      `multi=${features.multiColumnPageCount}`,
    ].join(', ');
    const noise = [
      `excluded=${features.excludedNoiseCount}`,
      `tableNoise=${features.tableNoiseSampleCount}`,
      `layoutTables=${features.layoutTableCandidateCount}`,
    ].join(', ');
    lines.push([
      row.id,
      row.role,
      `${fmt(features.score, 0)} ${fmt(features.readingOrder, 0)}/${fmt(features.headingStructure, 0)}`,
      row.discriminator,
      features.reportScaleSignal ? 'yes' : 'no',
      features.existingTargetMatchCount,
      layoutScale,
      noise,
      row.matchedTexts.slice(0, 4).join('; ') || 'n/a',
      row.reasons.join('; '),
    ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function runReadingHeadingDiscriminator(
  args: ReadingHeadingDiscriminatorArgs,
): Promise<ReadingHeadingDiscriminatorReport> {
  const calibration = await loadReadingLayoutCalibrationReport(args.input);
  await mkdir(args.outDir, { recursive: true });
  const report = buildReadingHeadingDiscriminatorReport(calibration, args.input, args.outDir);
  await writeFile(join(args.outDir, 'reading-heading-discriminator.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.outDir, 'reading-heading-discriminator.md'), markdownReport(report));
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await runReadingHeadingDiscriminator(args);
  console.log(`[reading-heading-discriminator] input ${basename(args.input)}`);
  console.log(`[reading-heading-discriminator] wrote ${join(args.outDir, 'reading-heading-discriminator.md')}`);
  console.log(`[reading-heading-discriminator] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

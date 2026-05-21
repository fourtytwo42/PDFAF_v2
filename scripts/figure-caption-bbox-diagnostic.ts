#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { isWeakFigureAlt } from '../src/services/scorer/altTextHeuristics.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-figure-caption-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `figure-caption-bbox-${timestampSlug()}`);

const FIGURE_RULES = new Set([
  'pdfua.figure.alt_present',
  'pdfua.figure.alt_not_weak',
  'pdfua.figure.checker_visible_alt_present',
  'pdfua.figure.bbox_present',
  'pdfua.formula.alt_present',
  'pdfua.alt.text_element_alt_absent',
  'pdfua.alt.empty_alt_on_nonfigure',
]);

export type FigureCaptionBboxClassification =
  | 'caption_alt_behavior_candidate'
  | 'bbox_scoring_validation_candidate'
  | 'figure_alt_existing_score_active'
  | 'figure_caption_noise_or_control'
  | 'figure_no_native_support'
  | 'no_figure_gap'
  | 'analysis_error';

export type FigureCaptionBboxSuggestedAction =
  | 'caption_alt_validation_needed'
  | 'bbox_score_cap_validation_needed'
  | 'already_score_active'
  | 'keep_diagnostic'
  | 'no_action';

export interface FigureCaptionBboxFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  pageCount: number;
  altText: number;
  pdfUaCompliance: number;
  hasStructure: boolean;
  figureCount: number;
  informativeFigureCount: number;
  checkerFigureCount: number;
  missingAltFigureCount: number;
  checkerMissingAltCount: number;
  weakAltFigureCount: number;
  missingBBoxFigureCount: number;
  figureWithBBoxCount: number;
  captionCandidateCount: number;
  figureCaptionPairCount: number;
  pacFailures: string[];
  pacWarnings: string[];
}

export interface FigureCaptionBboxDiagnosticRow extends ContentEventSourceRow {
  classification: FigureCaptionBboxClassification;
  suggestedAction: FigureCaptionBboxSuggestedAction;
  reasons: string[];
  features: FigureCaptionBboxFeatures | null;
  error?: string;
}

export interface FigureCaptionBboxDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<FigureCaptionBboxClassification, number>;
  suggestedActionDistribution: Record<FigureCaptionBboxSuggestedAction, number>;
  decision: {
    status:
      | 'plan_caption_alt_behavior_validation'
      | 'plan_bbox_scoring_validation'
      | 'keep_figure_caption_bbox_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: FigureCaptionBboxDiagnosticRow[];
}

interface Args {
  pdfs: string[];
  manifests: string[];
  ids: string[];
  outDir: string;
  limit?: number;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/figure-caption-bbox-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and reports PAC/POC-style figure alt, caption, and BBox evidence. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const pdfs: string[] = [];
  const manifests: string[] = [];
  const ids: string[] = [];
  let outDir = DEFAULT_OUT;
  let limit: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --pdf\n${usage()}`);
      pdfs.push(resolve(value));
    } else if (arg === '--manifest') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --manifest\n${usage()}`);
      manifests.push(resolve(value));
    } else if (arg === '--id') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --id\n${usage()}`);
      ids.push(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--limit must be a positive integer');
      limit = Math.floor(value);
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { pdfs, manifests, ids, outDir, limit };
}

function categoryScore(analysis: AnalysisResult, key: string): number {
  return analysis.categories.find(category => category.key === key)?.score ?? 100;
}

function hasBbox(figure: { bbox?: unknown }): boolean {
  return Array.isArray(figure.bbox) && figure.bbox.length === 4;
}

export function extractFigureCaptionBboxFeatures(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): FigureCaptionBboxFeatures {
  const informative = snapshot.figures.filter(figure => !figure.isArtifact);
  const checkerFigures = (snapshot.checkerFigureTargets ?? []).filter(figure =>
    figure.reachable &&
    !figure.isArtifact &&
    ((figure.resolvedRole ?? figure.role ?? '').replace(/^\//, '').toLowerCase() === 'figure')
  );
  const pacRules = buildPacRuleEvidence(snapshot).filter(rule => FIGURE_RULES.has(rule.ruleId));
  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    pageCount: snapshot.pageCount,
    altText: categoryScore(analysis, 'alt_text'),
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    hasStructure: snapshot.structureTree !== null,
    figureCount: snapshot.figures.length,
    informativeFigureCount: informative.length,
    checkerFigureCount: checkerFigures.length,
    missingAltFigureCount: informative.filter(figure => !figure.hasAlt || !(figure.altText ?? '').trim()).length,
    checkerMissingAltCount: checkerFigures.filter(figure => !figure.hasAlt || !(figure.altText ?? '').trim()).length,
    weakAltFigureCount: informative.filter(figure => isWeakFigureAlt(figure.altText, figure.hasAlt)).length,
    missingBBoxFigureCount: informative.filter(figure => !hasBbox(figure)).length,
    figureWithBBoxCount: informative.filter(hasBbox).length,
    captionCandidateCount: snapshot.layoutAudit?.captionCandidateCount ?? 0,
    figureCaptionPairCount: snapshot.detectionProfile?.figureSignals.figureCaptionPairCount ?? 0,
    pacFailures: pacRules.filter(rule => rule.status === 'fail').map(rule => rule.ruleId).sort(),
    pacWarnings: pacRules.filter(rule => rule.status === 'warn').map(rule => rule.ruleId).sort(),
  };
}

export function classifyFigureCaptionBboxEvidence(features: FigureCaptionBboxFeatures): {
  classification: FigureCaptionBboxClassification;
  suggestedAction: FigureCaptionBboxSuggestedAction;
  reasons: string[];
} {
  const reasons: string[] = [];
  const altDebt = features.missingAltFigureCount + features.checkerMissingAltCount + features.weakAltFigureCount;
  if (altDebt > 0) reasons.push(`alt_debt:${altDebt}`);
  if (features.missingBBoxFigureCount > 0) reasons.push(`missing_bbox:${features.missingBBoxFigureCount}`);
  if (features.captionCandidateCount > 0) reasons.push(`captions:${features.captionCandidateCount}`);
  if (features.figureCaptionPairCount > 0) reasons.push(`figure_caption_pairs:${features.figureCaptionPairCount}`);

  if (!features.hasStructure && features.figureCount === 0 && features.captionCandidateCount === 0) {
    return {
      classification: 'figure_no_native_support',
      suggestedAction: 'keep_diagnostic',
      reasons: ['no_structure_or_native_figure_caption_support'],
    };
  }

  if (altDebt > 0 && features.altText < 90 && features.figureCaptionPairCount > 0) {
    return {
      classification: 'caption_alt_behavior_candidate',
      suggestedAction: 'caption_alt_validation_needed',
      reasons,
    };
  }

  if (
    features.missingBBoxFigureCount > 0 &&
    features.pdfUaCompliance >= 80 &&
    features.informativeFigureCount > 0
  ) {
    return {
      classification: 'bbox_scoring_validation_candidate',
      suggestedAction: 'bbox_score_cap_validation_needed',
      reasons,
    };
  }

  if (altDebt > 0 && features.altText < 90) {
    return {
      classification: 'figure_alt_existing_score_active',
      suggestedAction: 'already_score_active',
      reasons,
    };
  }

  if (features.captionCandidateCount > 0 || features.figureCaptionPairCount > 0 || features.missingBBoxFigureCount > 0) {
    return {
      classification: 'figure_caption_noise_or_control',
      suggestedAction: 'keep_diagnostic',
      reasons: reasons.length ? reasons : ['layout_figure_signal_without_score_debt'],
    };
  }

  return {
    classification: 'no_figure_gap',
    suggestedAction: 'no_action',
    reasons: ['no_figure_caption_bbox_gap'],
  };
}

export async function analyzeFigureCaptionBboxRow(row: ContentEventSourceRow): Promise<FigureCaptionBboxDiagnosticRow> {
  try {
    const analyzed = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractFigureCaptionBboxFeatures(analyzed.result, analyzed.snapshot);
    const classification = classifyFigureCaptionBboxEvidence(features);
    return {
      ...row,
      classification: classification.classification,
      suggestedAction: classification.suggestedAction,
      reasons: classification.reasons,
      features,
    };
  } catch (error) {
    return {
      ...row,
      classification: 'analysis_error',
      suggestedAction: 'keep_diagnostic',
      reasons: ['analysis_error'],
      features: null,
      error: (error as Error).message,
    };
  }
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function buildFigureCaptionBboxReport(
  outDir: string,
  rows: FigureCaptionBboxDiagnosticRow[],
): FigureCaptionBboxDiagnosticReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const captionFocus = rows.filter(row => row.role === 'focus' && row.classification === 'caption_alt_behavior_candidate').length;
  const captionControls = rows.filter(row => row.role === 'control' && row.classification === 'caption_alt_behavior_candidate').length;
  const bboxFocus = rows.filter(row => row.role === 'focus' && row.classification === 'bbox_scoring_validation_candidate').length;
  const bboxControls = rows.filter(row => row.role === 'control' && row.classification === 'bbox_scoring_validation_candidate').length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `caption_focus=${captionFocus}`,
    `caption_controls=${captionControls}`,
    `bbox_focus=${bboxFocus}`,
    `bbox_controls=${bboxControls}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : captionFocus >= 2 && captionControls === 0
      ? 'plan_caption_alt_behavior_validation'
      : bboxFocus >= 3 && bboxControls === 0
        ? 'plan_bbox_scoring_validation'
        : 'keep_figure_caption_bbox_diagnostic_only';
  return {
    createdAt: new Date().toISOString(),
    outDir,
    selectedRowCount: rows.length,
    classificationDistribution,
    suggestedActionDistribution,
    decision: { status, reasons },
    rows,
  };
}

function renderMarkdown(report: FigureCaptionBboxDiagnosticReport): string {
  const lines = [
    '# Figure/Caption/BBox Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native PDFAF figure/caption/BBox evidence. No PAC/POC/ODL/Java call, remediation, PDF mutation, scoring change, or planner routing change was performed.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Alt | PDF/UA | Figures | Missing Alt | Missing BBox | Captions/Pairs | Class | Action |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f ? String(f.altText) : 'ERR',
      f ? String(f.pdfUaCompliance) : 'ERR',
      f ? String(f.informativeFigureCount) : 'ERR',
      f ? String(f.missingAltFigureCount + f.checkerMissingAltCount + f.weakAltFigureCount) : 'ERR',
      f ? String(f.missingBBoxFigureCount) : 'ERR',
      f ? `${f.captionCandidateCount}/${f.figureCaptionPairCount}` : 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_caption_alt_behavior_validation') {
    lines.push('A later caption-alt behavior proof may be justified, but only for one-to-one nearby caption/object evidence with controls and final alt/PAC debt checks.');
  } else if (report.decision.status === 'plan_bbox_scoring_validation') {
    lines.push('A later BBox scoring-validation stage may be justified. This would be stricter grading, not a score-raising remediation lane, and controls must stay clean.');
  } else if (report.decision.status === 'diagnostic_errors_present') {
    lines.push('Resolve diagnostic errors before making a figure/caption/BBox lane decision.');
  } else {
    lines.push('No figure/caption/BBox promotion is justified from this sample. Keep the lane diagnostic-only or choose a more specific object-backed sample.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeFigureCaptionBboxReport(
  outDir: string,
  rows: FigureCaptionBboxDiagnosticRow[],
): Promise<FigureCaptionBboxDiagnosticReport> {
  const report = buildFigureCaptionBboxReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'figure-caption-bbox.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'figure-caption-bbox.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const sourceRows = await collectContentEventRows(args);
  if (sourceRows.length === 0) throw new Error('No rows matched the requested inputs.');
  const rows: FigureCaptionBboxDiagnosticRow[] = [];
  for (const row of sourceRows) {
    const result = await analyzeFigureCaptionBboxRow(row);
    rows.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[figure-caption] ${result.id} ${score} ${result.classification}`);
  }
  const report = await writeFigureCaptionBboxReport(args.outDir, rows);
  console.log(`[figure-caption] wrote ${join(args.outDir, 'figure-caption-bbox.md')}`);
  console.log(`[figure-caption] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

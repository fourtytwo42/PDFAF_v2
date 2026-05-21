#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { pacRuleScoringCap } from '../src/services/scorer/finalizeEvidence.js';
import type { AnalysisResult, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-artifact-page-furniture-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `artifacts-page-furniture-${timestampSlug()}`);

const ARTIFACT_RULES = new Set([
  'pdfua.content.path_paint_tagged_or_artifacted',
  'pdfua.content.text_tagged_or_artifacted',
  'pdfua.content.image_tagged_or_artifacted',
  'pdfua.content.artifact_tag_boundary_valid',
  'pdfua.content.no_artifact_in_tagged_content',
  'pdfua.content.no_tagged_content_in_artifact',
  'pdfua.content.marked_content_stack_valid',
  'pdfua.content.within_page_bounds',
]);

const BOUNDARY_RULES = new Set([
  'pdfua.content.artifact_tag_boundary_valid',
  'pdfua.content.no_artifact_in_tagged_content',
  'pdfua.content.no_tagged_content_in_artifact',
  'pdfua.content.marked_content_stack_valid',
]);

export type ArtifactPageFurnitureClassification =
  | 'verified_artifact_boundary_score_active'
  | 'page_furniture_safety_candidate'
  | 'page_furniture_noise_or_control'
  | 'content_tagging_score_active'
  | 'no_artifact_page_furniture_signal'
  | 'analysis_error';

export type ArtifactPageFurnitureSuggestedAction =
  | 'safety_filter_validation_needed'
  | 'already_score_active'
  | 'keep_diagnostic'
  | 'no_action';

export interface ArtifactPageFurnitureFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  pageCount: number;
  readingOrder: number;
  headingStructure: number;
  tableMarkup: number;
  altText: number;
  pdfUaCompliance: number;
  sampledPageCount: number;
  repeatedHeaderFooterBandCount: number;
  repeatedHeaderFooterPageCount: number;
  headerFooterCoverageRatio: number;
  headerFooterPollutionRisk: boolean;
  layoutHeadingCandidateCount: number;
  captionCandidateCount: number;
  layoutTableCandidateCount: number;
  denseRowBandTableCandidateCount: number;
  artifactBoundaryDebt: number;
  contentOutsideMarkedContentDebt: number;
  contentOutsidePageBounds: number;
  pacFailures: string[];
  verifiedFailRules: string[];
  scoreCapRules: string[];
  failRulesWithScoringPolicy: string[];
  failRulesWithoutScoringPolicy: string[];
}

export interface ArtifactPageFurnitureDiagnosticRow extends ContentEventSourceRow {
  classification: ArtifactPageFurnitureClassification;
  suggestedAction: ArtifactPageFurnitureSuggestedAction;
  reasons: string[];
  features: ArtifactPageFurnitureFeatures | null;
  error?: string;
}

export interface ArtifactPageFurnitureDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<ArtifactPageFurnitureClassification, number>;
  suggestedActionDistribution: Record<ArtifactPageFurnitureSuggestedAction, number>;
  decision: {
    status:
      | 'plan_page_furniture_safety_filter_validation'
      | 'keep_artifact_page_furniture_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: ArtifactPageFurnitureDiagnosticRow[];
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
  return `Usage: pnpm exec tsx scripts/artifacts-page-furniture-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and reports PAC/POC-style artifact-boundary debt plus native repeated header/footer page-furniture evidence. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
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

function scoreCapRules(analysis: AnalysisResult): string[] {
  const caps: ScoreCapApplied[] = [
    ...(analysis.scoreCapsApplied ?? []),
    ...analysis.categories.flatMap(category => category.scoreCapsApplied ?? []),
  ];
  const rules = new Set<string>();
  for (const cap of caps) {
    const match = cap.reason.match(/PAC rule failure: ([^\s]+)/);
    if (match?.[1] && ARTIFACT_RULES.has(match[1])) rules.add(match[1]);
  }
  return [...rules].sort();
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function extractArtifactPageFurnitureFeatures(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): ArtifactPageFurnitureFeatures {
  const layout = snapshot.layoutAudit;
  const tagging = snapshot.contentTaggingAudit;
  const pacRules = buildPacRuleEvidence(snapshot).filter(rule => ARTIFACT_RULES.has(rule.ruleId));
  const failures = pacRules.filter(rule => rule.status === 'fail').map(rule => rule.ruleId).sort();
  const verifiedFailRules = pacRules
    .filter(rule => rule.status === 'fail' && rule.confidence === 'verified')
    .map(rule => rule.ruleId)
    .sort();
  const scoreCaps = scoreCapRules(analysis);
  const failRulesWithScoringPolicy = failures.filter(ruleId => pacRuleScoringCap(ruleId) !== null).sort();
  const failRulesWithoutScoringPolicy = failures.filter(ruleId => pacRuleScoringCap(ruleId) === null).sort();
  const artifactBoundaryDebt =
    (tagging?.artifactInsideTaggedContent ?? 0) +
    (tagging?.taggedContentInsideArtifact ?? 0) +
    (tagging?.malformedMarkedContentStack ?? 0);
  const contentOutsideMarkedContentDebt =
    (tagging?.textOutsideMarkedContentOrArtifact ?? 0) +
    (tagging?.imageOutsideMarkedContentOrArtifact ?? 0) +
    Math.max(
      snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0,
      tagging?.pathOutsideMarkedContentOrArtifact ?? 0,
    );
  const sampledPageCount = layout?.sampledPageCount ?? snapshot.pageCount;
  const repeatedHeaderFooterPageCount = layout?.repeatedHeaderFooterPageCount ?? 0;

  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    pageCount: snapshot.pageCount,
    readingOrder: categoryScore(analysis, 'reading_order'),
    headingStructure: categoryScore(analysis, 'heading_structure'),
    tableMarkup: categoryScore(analysis, 'table_markup'),
    altText: categoryScore(analysis, 'alt_text'),
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    sampledPageCount,
    repeatedHeaderFooterBandCount: layout?.repeatedHeaderFooterBandCount ?? 0,
    repeatedHeaderFooterPageCount,
    headerFooterCoverageRatio: ratio(repeatedHeaderFooterPageCount, sampledPageCount),
    headerFooterPollutionRisk: snapshot.detectionProfile?.readingOrderSignals.headerFooterPollutionRisk === true,
    layoutHeadingCandidateCount: layout?.layoutHeadingCandidateCount ?? 0,
    captionCandidateCount: layout?.captionCandidateCount ?? 0,
    layoutTableCandidateCount: layout?.layoutTableCandidateCount ?? 0,
    denseRowBandTableCandidateCount: layout?.denseRowBandTableCandidateCount ?? 0,
    artifactBoundaryDebt,
    contentOutsideMarkedContentDebt,
    contentOutsidePageBounds: tagging?.contentOutsidePageBounds ?? 0,
    pacFailures: failures,
    verifiedFailRules,
    scoreCapRules: scoreCaps,
    failRulesWithScoringPolicy,
    failRulesWithoutScoringPolicy,
  };
}

export function classifyArtifactPageFurnitureEvidence(features: ArtifactPageFurnitureFeatures): {
  classification: ArtifactPageFurnitureClassification;
  suggestedAction: ArtifactPageFurnitureSuggestedAction;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (features.artifactBoundaryDebt > 0) reasons.push(`artifact_boundary_debt:${features.artifactBoundaryDebt}`);
  if (features.contentOutsideMarkedContentDebt > 0) reasons.push(`content_outside_mc_or_artifact:${features.contentOutsideMarkedContentDebt}`);
  if (features.contentOutsidePageBounds > 0) reasons.push(`content_outside_page_bounds:${features.contentOutsidePageBounds}`);
  if (features.repeatedHeaderFooterPageCount > 0) {
    reasons.push(`repeated_header_footer_pages:${features.repeatedHeaderFooterPageCount}`);
  }
  if (features.headerFooterPollutionRisk) reasons.push('header_footer_pollution_risk');
  if (features.failRulesWithoutScoringPolicy.length > 0) {
    reasons.push(`no_scoring_policy:${features.failRulesWithoutScoringPolicy.join('+')}`);
  }

  const verifiedBoundaryDebt = features.verifiedFailRules.some(ruleId => BOUNDARY_RULES.has(ruleId));
  if (verifiedBoundaryDebt) {
    return {
      classification: 'verified_artifact_boundary_score_active',
      suggestedAction: 'already_score_active',
      reasons,
    };
  }

  const contentScoreActive = features.pacFailures.some(ruleId => features.failRulesWithScoringPolicy.includes(ruleId));
  if (contentScoreActive) {
    return {
      classification: 'content_tagging_score_active',
      suggestedAction: 'already_score_active',
      reasons,
    };
  }

  const pageFurnitureEvidence = hasPageFurnitureSafetyEvidence(features);

  if (pageFurnitureEvidence) {
    return {
      classification: 'page_furniture_safety_candidate',
      suggestedAction: 'safety_filter_validation_needed',
      reasons,
    };
  }

  if (
    features.repeatedHeaderFooterPageCount > 0 ||
    features.layoutHeadingCandidateCount > 0 ||
    features.captionCandidateCount > 0 ||
    features.layoutTableCandidateCount > 0
  ) {
    return {
      classification: 'page_furniture_noise_or_control',
      suggestedAction: 'keep_diagnostic',
      reasons: reasons.length ? reasons : ['page_furniture_evidence_without_promotable_safety_gap'],
    };
  }

  return {
    classification: 'no_artifact_page_furniture_signal',
    suggestedAction: 'no_action',
    reasons: ['no_artifact_page_furniture_signal'],
  };
}

function hasPageFurnitureSafetyEvidence(features: ArtifactPageFurnitureFeatures): boolean {
  const pageFurnitureEvidence =
    features.repeatedHeaderFooterPageCount >= 5 &&
    features.headerFooterCoverageRatio >= 0.3 &&
    (
      features.layoutHeadingCandidateCount > 0 ||
      features.captionCandidateCount > 0 ||
      features.layoutTableCandidateCount > 0
    );
  const candidateCategoryDebt =
    features.readingOrder < 90 ||
    features.headingStructure < 90 ||
    features.tableMarkup < 90 ||
    features.altText < 90;
  return pageFurnitureEvidence && candidateCategoryDebt;
}

export async function analyzeArtifactPageFurnitureRow(
  row: ContentEventSourceRow,
): Promise<ArtifactPageFurnitureDiagnosticRow> {
  try {
    const analyzed = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractArtifactPageFurnitureFeatures(analyzed.result, analyzed.snapshot);
    const classification = classifyArtifactPageFurnitureEvidence(features);
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

export function buildArtifactPageFurnitureReport(
  outDir: string,
  rows: ArtifactPageFurnitureDiagnosticRow[],
): ArtifactPageFurnitureDiagnosticReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const safetyFocus = rows.filter(row => row.role === 'focus' && row.features && hasPageFurnitureSafetyEvidence(row.features)).length;
  const safetyControls = rows.filter(row => row.role === 'control' && row.features && hasPageFurnitureSafetyEvidence(row.features)).length;
  const boundaryScoreActive = rows.filter(row => row.classification === 'verified_artifact_boundary_score_active').length;
  const contentScoreActive = rows.filter(row => row.classification === 'content_tagging_score_active').length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `safety_focus=${safetyFocus}`,
    `safety_controls=${safetyControls}`,
    `boundary_score_active=${boundaryScoreActive}`,
    `content_score_active=${contentScoreActive}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : safetyFocus >= 3 && safetyControls === 0
      ? 'plan_page_furniture_safety_filter_validation'
      : 'keep_artifact_page_furniture_diagnostic_only';
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

function renderMarkdown(report: ArtifactPageFurnitureDiagnosticReport): string {
  const lines = [
    '# Artifacts/Page-Furniture Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native PDFAF artifact-boundary and repeated page-furniture evidence. No PAC/POC/ODL/Java call, remediation, PDF mutation, scoring change, or planner routing change was performed.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Read/Head/Table/Alt | HF Pages | HF Ratio | Layout H/C/T | Artifact Debt | Content Debt | Class | Action |',
    '| --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f ? `${f.readingOrder}/${f.headingStructure}/${f.tableMarkup}/${f.altText}` : 'ERR',
      f ? String(f.repeatedHeaderFooterPageCount) : 'ERR',
      f ? f.headerFooterCoverageRatio.toFixed(2) : 'ERR',
      f ? `${f.layoutHeadingCandidateCount}/${f.captionCandidateCount}/${f.layoutTableCandidateCount}` : 'ERR',
      f ? String(f.artifactBoundaryDebt) : 'ERR',
      f ? String(f.contentOutsideMarkedContentDebt) : 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_page_furniture_safety_filter_validation') {
    lines.push('Native page-furniture evidence appears to separate focus rows from controls. Plan a separate safety-filter validation before using it to constrain heading/caption/table promotion.');
  } else if (report.decision.status === 'diagnostic_errors_present') {
    lines.push('Resolve diagnostic errors before making an artifacts/page-furniture lane decision.');
  } else {
    lines.push('No artifacts/page-furniture promotion is justified from this sample. Verified artifact-boundary debt is already score-active, and repeated header/footer evidence should remain safety evidence only.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeArtifactPageFurnitureReport(
  outDir: string,
  rows: ArtifactPageFurnitureDiagnosticRow[],
): Promise<ArtifactPageFurnitureDiagnosticReport> {
  const report = buildArtifactPageFurnitureReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'artifacts-page-furniture.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'artifacts-page-furniture.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const sourceRows = await collectContentEventRows(args);
  if (sourceRows.length === 0) throw new Error('No rows matched the requested inputs.');
  const rows: ArtifactPageFurnitureDiagnosticRow[] = [];
  for (const row of sourceRows) {
    const result = await analyzeArtifactPageFurnitureRow(row);
    rows.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[artifact-page-furniture] ${result.id} ${score} ${result.classification}`);
  }
  const report = await writeArtifactPageFurnitureReport(args.outDir, rows);
  console.log(`[artifact-page-furniture] wrote ${join(args.outDir, 'artifacts-page-furniture.md')}`);
  console.log(`[artifact-page-furniture] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

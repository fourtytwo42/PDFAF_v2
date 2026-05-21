#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { pacRuleScoringCap } from '../src/services/scorer/finalizeEvidence.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-annotation-form-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `annotation-form-parity-${timestampSlug()}`);

const ANNOTATION_FORM_RULES = new Set([
  'pdfua.parent_tree.annotation_struct_parent_present',
  'pdfua.parent_tree.annotation_object_refs_consistent',
  'pdfua.annotations.tagged_annotations_present',
  'pdfua.annotations.link_in_link_tag',
  'pdfua.annotations.widget_in_form_tag',
  'pdfua.annotations.tab_order_structure',
  'pdfua.annotations.nonlink_contents_present',
  'pdfua.form.tu_present',
  'pdfua.annotation.alt_or_contents_present',
  'pdfua.language.annotation_contents_lang_valid',
  'pdfua.language.form_tu_lang_valid',
]);

export type AnnotationFormClassification =
  | 'form_tooltip_repair_candidate'
  | 'link_annotation_repair_candidate'
  | 'annotation_tab_order_candidate'
  | 'nonlink_annotation_contents_candidate'
  | 'widget_nesting_detection_gap'
  | 'annotation_form_score_active_only'
  | 'control_or_high_grade_annotation_noise'
  | 'no_annotation_form_debt'
  | 'analysis_error';

export type AnnotationFormSuggestedAction =
  | 'behavior_validation_candidate'
  | 'evidence_hardening_candidate'
  | 'already_score_active'
  | 'keep_diagnostic'
  | 'no_action';

export interface AnnotationFormFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  pageCount: number;
  pdfUaCompliance: number;
  linkQuality: number;
  readingOrder: number;
  altText: number;
  formAccessibility: number;
  hasStructure: boolean;
  formFieldCount: number;
  pdfjsFormFieldCount: number;
  totalFormFieldEvidenceCount: number;
  formFieldsMissingTooltipCount: number;
  pagesMissingTabsS: number;
  pagesAnnotationOrderDiffers: number;
  linkAnnotationsMissingStructure: number;
  nonLinkAnnotationsMissingStructure: number;
  linkAnnotationsMissingStructParent: number;
  nonLinkAnnotationsMissingStructParent: number;
  nonLinkAnnotationsMissingContents: number;
  parentTreeAnnotationReferenceMismatchCount: number;
  parentTreeObjectReferenceMismatchCount: number;
  pacFailures: string[];
  pacWarnings: string[];
  scoreCapRules: string[];
  failRulesWithScoringCap: string[];
  failRulesMissingScoreCap: string[];
}

export interface AnnotationFormDiagnosticRow extends ContentEventSourceRow {
  classification: AnnotationFormClassification;
  suggestedAction: AnnotationFormSuggestedAction;
  reasons: string[];
  features: AnnotationFormFeatures | null;
  error?: string;
}

export interface AnnotationFormDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<AnnotationFormClassification, number>;
  suggestedActionDistribution: Record<AnnotationFormSuggestedAction, number>;
  decision: {
    status:
      | 'plan_annotation_form_behavior_stage'
      | 'plan_annotation_form_evidence_hardening'
      | 'keep_annotation_form_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: AnnotationFormDiagnosticRow[];
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
  return `Usage: pnpm exec tsx scripts/annotation-form-parity-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and reports PAC/POC-style annotation/form parity evidence. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
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

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number {
  return analysis.categories.find(category => category.key === key)?.score ?? 100;
}

function scoreCapRules(analysis: AnalysisResult): string[] {
  const caps: ScoreCapApplied[] = [
    ...(analysis.scoreCapsApplied ?? []),
    ...analysis.categories.flatMap(category => category.scoreCapsApplied ?? []),
  ];
  const out = new Set<string>();
  for (const cap of caps) {
    const match = cap.reason.match(/PAC rule failure: ([^\s]+)/);
    if (match?.[1] && ANNOTATION_FORM_RULES.has(match[1])) out.add(match[1]);
  }
  return [...out].sort();
}

function annotationFormRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  return buildPacRuleEvidence(snapshot).filter(rule => ANNOTATION_FORM_RULES.has(rule.ruleId));
}

function missingTooltips(snapshot: DocumentSnapshot): number {
  const fields = [
    ...snapshot.formFields.map(field => field.tooltip ?? ''),
    ...snapshot.formFieldsFromPdfjs.map(field => field.tooltip ?? ''),
  ];
  return fields.filter(value => value.trim().length === 0).length;
}

export function extractAnnotationFormFeatures(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): AnnotationFormFeatures {
  const direct = snapshot.annotationAccessibility;
  const detection = snapshot.detectionProfile?.annotationSignals;
  const rules = annotationFormRules(snapshot);
  const failures = rules.filter(rule => rule.status === 'fail').map(rule => rule.ruleId).sort();
  const warnings = rules.filter(rule => rule.status === 'warn').map(rule => rule.ruleId).sort();
  const caps = scoreCapRules(analysis);
  const failRulesWithScoringCap = failures.filter(ruleId => pacRuleScoringCap(ruleId) !== null).sort();
  const failRulesMissingScoreCap = failRulesWithScoringCap.filter(ruleId => !caps.includes(ruleId)).sort();
  const linkMissingStructure = Math.max(
    detection?.linkAnnotationsMissingStructure ?? 0,
    direct?.linkAnnotationsMissingStructure ?? 0,
  );
  const nonLinkMissingStructure = Math.max(
    detection?.nonLinkAnnotationsMissingStructure ?? 0,
    direct?.nonLinkAnnotationsMissingStructure ?? 0,
  );
  const linkMissingStructParent = Math.max(
    detection?.linkAnnotationsMissingStructParent ?? 0,
    direct?.linkAnnotationsMissingStructParent ?? 0,
  );
  const nonLinkMissingStructParent = Math.max(
    detection?.nonLinkAnnotationsMissingStructParent ?? 0,
    direct?.nonLinkAnnotationsMissingStructParent ?? 0,
  );

  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    pageCount: snapshot.pageCount,
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    linkQuality: categoryScore(analysis, 'link_quality'),
    readingOrder: categoryScore(analysis, 'reading_order'),
    altText: categoryScore(analysis, 'alt_text'),
    formAccessibility: categoryScore(analysis, 'form_accessibility'),
    hasStructure: snapshot.structureTree !== null,
    formFieldCount: snapshot.formFields.length,
    pdfjsFormFieldCount: snapshot.formFieldsFromPdfjs.length,
    totalFormFieldEvidenceCount: snapshot.formFields.length + snapshot.formFieldsFromPdfjs.length,
    formFieldsMissingTooltipCount: missingTooltips(snapshot),
    pagesMissingTabsS: Math.max(detection?.pagesMissingTabsS ?? 0, direct?.pagesMissingTabsS ?? 0),
    pagesAnnotationOrderDiffers: Math.max(
      detection?.pagesAnnotationOrderDiffers ?? 0,
      direct?.pagesAnnotationOrderDiffers ?? 0,
    ),
    linkAnnotationsMissingStructure: linkMissingStructure,
    nonLinkAnnotationsMissingStructure: nonLinkMissingStructure,
    linkAnnotationsMissingStructParent: linkMissingStructParent,
    nonLinkAnnotationsMissingStructParent: nonLinkMissingStructParent,
    nonLinkAnnotationsMissingContents: direct?.nonLinkAnnotationsMissingContents ?? 0,
    parentTreeAnnotationReferenceMismatchCount: snapshot.parentTreeAudit?.annotationReferenceMismatchCount ?? 0,
    parentTreeObjectReferenceMismatchCount: snapshot.parentTreeAudit?.objectReferenceMismatchCount ?? 0,
    pacFailures: failures,
    pacWarnings: warnings,
    scoreCapRules: caps,
    failRulesWithScoringCap,
    failRulesMissingScoreCap,
  };
}

export function classifyAnnotationFormEvidence(features: AnnotationFormFeatures): {
  classification: AnnotationFormClassification;
  suggestedAction: AnnotationFormSuggestedAction;
  reasons: string[];
} {
  const reasons: string[] = [];
  const linkDebt =
    features.linkAnnotationsMissingStructure +
    features.linkAnnotationsMissingStructParent +
    features.parentTreeAnnotationReferenceMismatchCount +
    features.parentTreeObjectReferenceMismatchCount;
  const nonLinkStructureDebt =
    features.nonLinkAnnotationsMissingStructure + features.nonLinkAnnotationsMissingStructParent;
  const tabOrderDebt = features.pagesMissingTabsS + features.pagesAnnotationOrderDiffers;

  if (features.formFieldsMissingTooltipCount > 0) reasons.push(`form_missing_tu:${features.formFieldsMissingTooltipCount}`);
  if (linkDebt > 0) reasons.push(`link_annotation_debt:${linkDebt}`);
  if (nonLinkStructureDebt > 0) reasons.push(`nonlink_structure_debt:${nonLinkStructureDebt}`);
  if (tabOrderDebt > 0) reasons.push(`tab_order_debt:${tabOrderDebt}`);
  if (features.nonLinkAnnotationsMissingContents > 0) {
    reasons.push(`nonlink_missing_contents:${features.nonLinkAnnotationsMissingContents}`);
  }
  if (features.failRulesMissingScoreCap.length > 0) {
    reasons.push(`missing_score_cap:${features.failRulesMissingScoreCap.join('+')}`);
  }

  const hasAnyDebt =
    features.formFieldsMissingTooltipCount +
    linkDebt +
    nonLinkStructureDebt +
    tabOrderDebt +
    features.nonLinkAnnotationsMissingContents +
    features.failRulesWithScoringCap.length >
    0;

  if (!hasAnyDebt && features.pacWarnings.includes('pdfua.annotations.widget_in_form_tag')) {
    return {
      classification: 'widget_nesting_detection_gap',
      suggestedAction: 'evidence_hardening_candidate',
      reasons: ['widget_form_nesting_manual_review_only'],
    };
  }

  if (!hasAnyDebt) {
    return {
      classification: 'no_annotation_form_debt',
      suggestedAction: 'no_action',
      reasons: ['no_annotation_form_debt'],
    };
  }

  if (features.formFieldsMissingTooltipCount > 0 && features.formAccessibility < 90) {
    return {
      classification: 'form_tooltip_repair_candidate',
      suggestedAction: 'behavior_validation_candidate',
      reasons,
    };
  }

  if (linkDebt > 0 && features.linkQuality < 90) {
    return {
      classification: 'link_annotation_repair_candidate',
      suggestedAction: 'behavior_validation_candidate',
      reasons,
    };
  }

  if (tabOrderDebt > 0 && features.readingOrder < 90) {
    return {
      classification: 'annotation_tab_order_candidate',
      suggestedAction: 'behavior_validation_candidate',
      reasons,
    };
  }

  if (features.nonLinkAnnotationsMissingContents > 0 && features.altText < 90) {
    return {
      classification: 'nonlink_annotation_contents_candidate',
      suggestedAction: 'behavior_validation_candidate',
      reasons,
    };
  }

  if (features.failRulesWithScoringCap.length > 0 || features.scoreCapRules.length > 0) {
    return {
      classification: 'annotation_form_score_active_only',
      suggestedAction: 'already_score_active',
      reasons: reasons.length ? reasons : ['annotation_form_score_active'],
    };
  }

  return {
    classification: 'control_or_high_grade_annotation_noise',
    suggestedAction: 'keep_diagnostic',
    reasons: reasons.length ? reasons : ['high_grade_or_non_score_active_debt'],
  };
}

export async function analyzeAnnotationFormRow(row: ContentEventSourceRow): Promise<AnnotationFormDiagnosticRow> {
  try {
    const analyzed = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractAnnotationFormFeatures(analyzed.result, analyzed.snapshot);
    const classification = classifyAnnotationFormEvidence(features);
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

export function buildAnnotationFormReport(
  outDir: string,
  rows: AnnotationFormDiagnosticRow[],
): AnnotationFormDiagnosticReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const behaviorClasses = new Set<AnnotationFormClassification>([
    'form_tooltip_repair_candidate',
    'link_annotation_repair_candidate',
    'annotation_tab_order_candidate',
    'nonlink_annotation_contents_candidate',
  ]);
  const behaviorFocus = rows.filter(row => row.role === 'focus' && behaviorClasses.has(row.classification)).length;
  const behaviorControls = rows.filter(row => row.role === 'control' && behaviorClasses.has(row.classification)).length;
  const widgetFocus = rows.filter(row =>
    row.role === 'focus' &&
    row.classification === 'widget_nesting_detection_gap',
  ).length;
  const widgetControls = rows.filter(row =>
    row.role === 'control' &&
    row.classification === 'widget_nesting_detection_gap',
  ).length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `behavior_focus=${behaviorFocus}`,
    `behavior_controls=${behaviorControls}`,
    `widget_focus=${widgetFocus}`,
    `widget_controls=${widgetControls}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : behaviorFocus >= 2 && behaviorControls === 0
      ? 'plan_annotation_form_behavior_stage'
      : widgetFocus >= 2 && widgetControls === 0
        ? 'plan_annotation_form_evidence_hardening'
        : 'keep_annotation_form_diagnostic_only';
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

function renderMarkdown(report: AnnotationFormDiagnosticReport): string {
  const lines = [
    '# Annotation/Form PAC Parity Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native PDFAF annotation/form evidence. No PAC/POC/ODL/Java call, remediation, PDF mutation, scoring change, or planner routing change was performed.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Link | Reading | Alt | Form | Class | Action | Core Debt |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    const debt = f
      ? [
        `link:${f.linkAnnotationsMissingStructure + f.linkAnnotationsMissingStructParent}`,
        `tabs:${f.pagesMissingTabsS + f.pagesAnnotationOrderDiffers}`,
        `nonlinkContents:${f.nonLinkAnnotationsMissingContents}`,
        `formTU:${f.formFieldsMissingTooltipCount}`,
      ].join(' ')
      : 'ERR';
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f ? String(f.linkQuality) : 'ERR',
      f ? String(f.readingOrder) : 'ERR',
      f ? String(f.altText) : 'ERR',
      f ? String(f.formAccessibility) : 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
      debt,
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_annotation_form_behavior_stage') {
    lines.push('A later behavior proof may be justified, but it must stay object-backed and use existing annotation/form tools with targeted positives, nearby controls, and final PAC debt checks.');
  } else if (report.decision.status === 'plan_annotation_form_evidence_hardening') {
    lines.push('The sample supports native evidence hardening before behavior. Do not promote form/widget behavior until object-backed widget/Form nesting evidence exists.');
  } else if (report.decision.status === 'diagnostic_errors_present') {
    lines.push('Resolve diagnostic errors before making an annotation/form lane decision.');
  } else {
    lines.push('No annotation/form scoring or remediation promotion is justified from this sample. Keep the lane diagnostic-only or choose a more specific object-backed sample.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeAnnotationFormReport(
  outDir: string,
  rows: AnnotationFormDiagnosticRow[],
): Promise<AnnotationFormDiagnosticReport> {
  const report = buildAnnotationFormReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'annotation-form-parity.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'annotation-form-parity.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const sourceRows = await collectContentEventRows(args);
  if (sourceRows.length === 0) throw new Error('No rows matched the requested inputs.');
  const rows: AnnotationFormDiagnosticRow[] = [];
  for (const row of sourceRows) {
    const result = await analyzeAnnotationFormRow(row);
    rows.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[annotation-form] ${result.id} ${score} ${result.classification}`);
  }
  const report = await writeAnnotationFormReport(args.outDir, rows);
  console.log(`[annotation-form] wrote ${join(args.outDir, 'annotation-form-parity.md')}`);
  console.log(`[annotation-form] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

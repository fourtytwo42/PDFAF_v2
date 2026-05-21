#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { pacRuleScoringCap } from '../src/services/scorer/finalizeEvidence.js';
import { stage5PacCatalogGaps } from '../src/services/remediation/stage5PacCatalogSettings.js';
import type { AnalysisResult, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-catalog-syntax-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `pdfua-catalog-syntax-${timestampSlug()}`);

const CATALOG_SYNTAX_RULES = new Set([
  'pdfua.metadata.xmp_present',
  'pdfua.metadata.title_present',
  'pdfua.metadata.pdfua_identifier_present',
  'pdfua.settings.marked_true',
  'pdfua.settings.suspects_absent_or_false',
  'pdfua.settings.display_doc_title_present_or_unknown',
  'pdfua.language.document_lang_present',
  'pdfua.language.document_lang_syntax_valid',
  'pdfua.structure.struct_tree_present',
  'pdfua.structure.syntax_roles_present',
  'pdfua.structure.parent_links_valid',
  'pdfua.structure.child_roles_valid',
  'pdfua.structure.mcr_objr_valid',
  'pdfua.structure.rolemap_valid',
  'pdfua.optional_content.config_valid',
  'pdfua.filespec.f_and_uf_present',
  'pdfua.xfa.dynamic_absent',
]);

const BASELINE_SCORE_RULES = new Set([
  'pdfua.metadata.title_present',
  'pdfua.metadata.pdfua_identifier_present',
  'pdfua.settings.marked_true',
  'pdfua.language.document_lang_present',
  'pdfua.structure.struct_tree_present',
]);

const STRUCTURE_SCORE_RULES = new Set([
  'pdfua.structure.syntax_roles_present',
  'pdfua.structure.parent_links_valid',
  'pdfua.structure.child_roles_valid',
  'pdfua.structure.mcr_objr_valid',
]);

const OPTIONAL_DIAGNOSTIC_RULES = new Set([
  'pdfua.optional_content.config_valid',
  'pdfua.filespec.f_and_uf_present',
  'pdfua.xfa.dynamic_absent',
]);

export type PdfUaCatalogSyntaxClassification =
  | 'catalog_settings_behavior_candidate'
  | 'structure_rolemap_scoring_gap'
  | 'optional_catalog_diagnostic_gap'
  | 'catalog_baseline_score_active'
  | 'structure_syntax_score_active'
  | 'catalog_syntax_noise_or_control'
  | 'no_catalog_syntax_debt'
  | 'analysis_error';

export type PdfUaCatalogSyntaxSuggestedAction =
  | 'catalog_behavior_validation_needed'
  | 'rolemap_scoring_validation_needed'
  | 'optional_catalog_evidence_hardening_needed'
  | 'already_score_active'
  | 'keep_diagnostic'
  | 'no_action';

export interface PdfUaCatalogSyntaxFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  titleLanguage: number;
  pdfUaCompliance: number;
  readingOrder: number;
  hasStructure: boolean;
  isTagged: boolean;
  markInfoMarked: boolean | null;
  markInfoSuspects: boolean | null;
  displayDocTitle: boolean | null;
  lang: string | null;
  metadataLanguage: string | null;
  pdfUaVersion: string | null;
  hasTitle: boolean;
  catalogGapRuleIds: string[];
  fixableCatalogGapRuleIds: string[];
  structureRoleDebt: number;
  structureParentDebt: number;
  invalidChildRoleCount: number;
  invalidMcrObjrCount: number;
  roleMapDebt: number;
  optionalContentDebt: number;
  embeddedFileSpecDebt: number;
  dynamicXfaPresent: boolean;
  pacFailures: string[];
  pacWarnings: string[];
  scoreCapRules: string[];
  failRulesWithScoringPolicy: string[];
  failRulesWithoutScoringPolicy: string[];
  failRulesWithoutAppliedCapRecord: string[];
}

export interface PdfUaCatalogSyntaxDiagnosticRow extends ContentEventSourceRow {
  classification: PdfUaCatalogSyntaxClassification;
  suggestedAction: PdfUaCatalogSyntaxSuggestedAction;
  reasons: string[];
  features: PdfUaCatalogSyntaxFeatures | null;
  error?: string;
}

export interface PdfUaCatalogSyntaxDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<PdfUaCatalogSyntaxClassification, number>;
  suggestedActionDistribution: Record<PdfUaCatalogSyntaxSuggestedAction, number>;
  decision: {
    status:
      | 'plan_catalog_settings_behavior_validation'
      | 'plan_rolemap_scoring_validation'
      | 'plan_optional_catalog_evidence_hardening'
      | 'keep_pdfua_catalog_syntax_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: PdfUaCatalogSyntaxDiagnosticRow[];
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
  return `Usage: pnpm exec tsx scripts/pdfua-catalog-syntax-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and reports PAC/POC-style PDF/UA catalog, structure syntax, RoleMap, optional-content, file-spec, and XFA evidence. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
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
    if (match?.[1] && CATALOG_SYNTAX_RULES.has(match[1])) rules.add(match[1]);
  }
  return [...rules].sort();
}

export function extractPdfUaCatalogSyntaxFeatures(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): PdfUaCatalogSyntaxFeatures {
  const pacRules = buildPacRuleEvidence(snapshot).filter(rule => CATALOG_SYNTAX_RULES.has(rule.ruleId));
  const failures = pacRules.filter(rule => rule.status === 'fail').map(rule => rule.ruleId).sort();
  const warnings = pacRules.filter(rule => rule.status === 'warn').map(rule => rule.ruleId).sort();
  const caps = scoreCapRules(analysis);
  const failRulesWithScoringPolicy = failures.filter(ruleId => pacRuleScoringCap(ruleId) !== null).sort();
  const failRulesWithoutScoringPolicy = failures.filter(ruleId => pacRuleScoringCap(ruleId) === null).sort();
  const failRulesWithoutAppliedCapRecord = failRulesWithScoringPolicy.filter(ruleId => !caps.includes(ruleId)).sort();
  const catalogGaps = stage5PacCatalogGaps(analysis, snapshot);
  const structure = snapshot.structureSyntaxAudit;
  const optional = snapshot.optionalContentAudit;
  const structureRoleDebt = (structure?.missingStructureTypeCount ?? 0) + (structure?.missingRoleCount ?? 0);
  const structureParentDebt = (structure?.missingParentCount ?? 0) + (structure?.wrongParentCount ?? 0);
  const roleMapDebt =
    (structure?.circularRoleMapCount ?? 0) +
    (structure?.standardRoleRemappedCount ?? 0) +
    (structure?.unmappedNonstandardRoleCount ?? 0);
  const optionalContentDebt =
    (optional?.optionalContentConfigMissingNameCount ?? 0) +
    (optional?.optionalContentAsInvalidCount ?? 0) +
    (optional?.printerMarkOrTrapNetTaggedCount ?? 0);
  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    titleLanguage: categoryScore(analysis, 'title_language'),
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    readingOrder: categoryScore(analysis, 'reading_order'),
    hasStructure: snapshot.structureTree !== null,
    isTagged: snapshot.isTagged,
    markInfoMarked: snapshot.markInfo?.Marked ?? null,
    markInfoSuspects: snapshot.markInfo?.Suspects ?? null,
    displayDocTitle: snapshot.viewerPreferences?.displayDocTitle ?? null,
    lang: snapshot.lang,
    metadataLanguage: snapshot.metadata.language ?? null,
    pdfUaVersion: snapshot.pdfUaVersion,
    hasTitle: Boolean((snapshot.metadata.title ?? snapshot.structTitle ?? '').trim()),
    catalogGapRuleIds: catalogGaps.map(gap => gap.ruleId).sort(),
    fixableCatalogGapRuleIds: catalogGaps.filter(gap => gap.fixable).map(gap => gap.ruleId).sort(),
    structureRoleDebt,
    structureParentDebt,
    invalidChildRoleCount: structure?.invalidChildRoleCount ?? 0,
    invalidMcrObjrCount: structure?.invalidMcrObjrCount ?? 0,
    roleMapDebt,
    optionalContentDebt,
    embeddedFileSpecDebt: optional?.embeddedFileMissingFOrUfCount ?? 0,
    dynamicXfaPresent: optional?.dynamicXfaPresent === true,
    pacFailures: failures,
    pacWarnings: warnings,
    scoreCapRules: caps,
    failRulesWithScoringPolicy,
    failRulesWithoutScoringPolicy,
    failRulesWithoutAppliedCapRecord,
  };
}

export function classifyPdfUaCatalogSyntaxEvidence(features: PdfUaCatalogSyntaxFeatures): {
  classification: PdfUaCatalogSyntaxClassification;
  suggestedAction: PdfUaCatalogSyntaxSuggestedAction;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (features.fixableCatalogGapRuleIds.length > 0) {
    reasons.push(`fixable_catalog_gaps:${features.fixableCatalogGapRuleIds.join('+')}`);
  }
  if (features.roleMapDebt > 0) reasons.push(`rolemap_debt:${features.roleMapDebt}`);
  if (features.optionalContentDebt > 0) reasons.push(`optional_content_debt:${features.optionalContentDebt}`);
  if (features.embeddedFileSpecDebt > 0) reasons.push(`filespec_debt:${features.embeddedFileSpecDebt}`);
  if (features.dynamicXfaPresent) reasons.push('dynamic_xfa_present');
  if (features.failRulesWithoutAppliedCapRecord.length > 0) {
    reasons.push(`no_applied_cap_record:${features.failRulesWithoutAppliedCapRecord.join('+')}`);
  }
  if (features.failRulesWithoutScoringPolicy.length > 0) {
    reasons.push(`no_scoring_policy:${features.failRulesWithoutScoringPolicy.join('+')}`);
  }

  if (features.fixableCatalogGapRuleIds.length > 0) {
    return {
      classification: 'catalog_settings_behavior_candidate',
      suggestedAction: 'catalog_behavior_validation_needed',
      reasons,
    };
  }

  if (features.pacFailures.includes('pdfua.structure.rolemap_valid')) {
    return {
      classification: 'structure_rolemap_scoring_gap',
      suggestedAction: 'rolemap_scoring_validation_needed',
      reasons,
    };
  }

  if (features.pacFailures.some(ruleId => OPTIONAL_DIAGNOSTIC_RULES.has(ruleId))) {
    return {
      classification: 'optional_catalog_diagnostic_gap',
      suggestedAction: 'optional_catalog_evidence_hardening_needed',
      reasons,
    };
  }

  if (
    features.scoreCapRules.some(rule => BASELINE_SCORE_RULES.has(rule)) ||
    features.pacFailures.some(rule => BASELINE_SCORE_RULES.has(rule))
  ) {
    return {
      classification: 'catalog_baseline_score_active',
      suggestedAction: 'already_score_active',
      reasons: reasons.length ? reasons : ['baseline_catalog_debt_already_score_active'],
    };
  }

  if (
    features.scoreCapRules.some(rule => STRUCTURE_SCORE_RULES.has(rule)) ||
    features.pacFailures.some(rule => STRUCTURE_SCORE_RULES.has(rule))
  ) {
    return {
      classification: 'structure_syntax_score_active',
      suggestedAction: 'already_score_active',
      reasons: reasons.length ? reasons : ['structure_syntax_debt_already_score_active'],
    };
  }

  if (
    features.pacFailures.length > 0 ||
    features.pacWarnings.length > 0 ||
    features.isTagged ||
    features.hasStructure ||
    features.markInfoMarked !== null ||
    features.pdfUaVersion !== null
  ) {
    return {
      classification: 'catalog_syntax_noise_or_control',
      suggestedAction: 'keep_diagnostic',
      reasons: reasons.length ? reasons : ['catalog_syntax_evidence_without_promotable_debt'],
    };
  }

  return {
    classification: 'no_catalog_syntax_debt',
    suggestedAction: 'no_action',
    reasons: ['no_catalog_syntax_debt'],
  };
}

export async function analyzePdfUaCatalogSyntaxRow(
  row: ContentEventSourceRow,
): Promise<PdfUaCatalogSyntaxDiagnosticRow> {
  try {
    const analyzed = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractPdfUaCatalogSyntaxFeatures(analyzed.result, analyzed.snapshot);
    const classification = classifyPdfUaCatalogSyntaxEvidence(features);
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

export function buildPdfUaCatalogSyntaxReport(
  outDir: string,
  rows: PdfUaCatalogSyntaxDiagnosticRow[],
): PdfUaCatalogSyntaxDiagnosticReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const catalogFocus = rows.filter(row => row.role === 'focus' && row.classification === 'catalog_settings_behavior_candidate').length;
  const catalogControls = rows.filter(row => row.role === 'control' && row.classification === 'catalog_settings_behavior_candidate').length;
  const roleMapFocus = rows.filter(row => row.role === 'focus' && row.classification === 'structure_rolemap_scoring_gap').length;
  const roleMapControls = rows.filter(row => row.role === 'control' && row.classification === 'structure_rolemap_scoring_gap').length;
  const optionalFocus = rows.filter(row => row.role === 'focus' && row.classification === 'optional_catalog_diagnostic_gap').length;
  const optionalControls = rows.filter(row => row.role === 'control' && row.classification === 'optional_catalog_diagnostic_gap').length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `catalog_focus=${catalogFocus}`,
    `catalog_controls=${catalogControls}`,
    `rolemap_focus=${roleMapFocus}`,
    `rolemap_controls=${roleMapControls}`,
    `optional_focus=${optionalFocus}`,
    `optional_controls=${optionalControls}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : catalogFocus >= 2 && catalogControls === 0
      ? 'plan_catalog_settings_behavior_validation'
      : roleMapFocus >= 2 && roleMapControls === 0
        ? 'plan_rolemap_scoring_validation'
        : optionalFocus >= 2 && optionalControls === 0
          ? 'plan_optional_catalog_evidence_hardening'
          : 'keep_pdfua_catalog_syntax_diagnostic_only';
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

function renderMarkdown(report: PdfUaCatalogSyntaxDiagnosticReport): string {
  const lines = [
    '# PDF/UA Catalog/Syntax Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native PDFAF catalog, structure syntax, RoleMap, optional-content, file-spec, and XFA evidence. No PAC/POC/ODL/Java call, remediation, PDF mutation, scoring change, or planner routing change was performed.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | PDF/UA | Title/Lang | Marked/Suspects | DisplayTitle | PDF/UA ID | Catalog Gaps | Struct/RoleMap | Optional | Class | Action |',
    '| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f ? String(f.pdfUaCompliance) : 'ERR',
      f ? String(f.titleLanguage) : 'ERR',
      f ? `${f.markInfoMarked}/${f.markInfoSuspects}` : 'ERR',
      f ? String(f.displayDocTitle) : 'ERR',
      f ? (f.pdfUaVersion ?? 'missing') : 'ERR',
      f ? f.fixableCatalogGapRuleIds.join('+') || '-' : 'ERR',
      f ? `${f.structureRoleDebt + f.structureParentDebt + f.invalidChildRoleCount + f.invalidMcrObjrCount}/${f.roleMapDebt}` : 'ERR',
      f ? `${f.optionalContentDebt}/${f.embeddedFileSpecDebt}/${f.dynamicXfaPresent ? 1 : 0}` : 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_catalog_settings_behavior_validation') {
    lines.push('Existing `normalize_pdfua_catalog_settings` behavior may deserve a focused validation stage, because repeated focus rows have fixable `/Suspects` or `/DisplayDocTitle` PAC gaps and controls do not trigger.');
  } else if (report.decision.status === 'plan_rolemap_scoring_validation') {
    lines.push('Native RoleMap evidence appears repeatedly in focus rows without controls. Plan a separate scoring-validation stage before adding any score-active RoleMap rule.');
  } else if (report.decision.status === 'plan_optional_catalog_evidence_hardening') {
    lines.push('Optional-content, file-spec, or XFA evidence appears repeatedly in focus rows. Harden evidence/reporting first; do not promote scoring or remediation from this diagnostic alone.');
  } else if (report.decision.status === 'diagnostic_errors_present') {
    lines.push('Resolve diagnostic errors before making a PDF/UA catalog/syntax lane decision.');
  } else {
    lines.push('No PDF/UA catalog/syntax promotion is justified from this sample. Existing baseline and structure syntax failures are already score-active, or the evidence is clean/noisy.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writePdfUaCatalogSyntaxReport(
  outDir: string,
  rows: PdfUaCatalogSyntaxDiagnosticRow[],
): Promise<PdfUaCatalogSyntaxDiagnosticReport> {
  const report = buildPdfUaCatalogSyntaxReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pdfua-catalog-syntax.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pdfua-catalog-syntax.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const sourceRows = await collectContentEventRows(args);
  if (sourceRows.length === 0) throw new Error('No rows matched the requested inputs.');
  const rows: PdfUaCatalogSyntaxDiagnosticRow[] = [];
  for (const row of sourceRows) {
    const result = await analyzePdfUaCatalogSyntaxRow(row);
    rows.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[pdfua-catalog] ${result.id} ${score} ${result.classification}`);
  }
  const report = await writePdfUaCatalogSyntaxReport(args.outDir, rows);
  console.log(`[pdfua-catalog] wrote ${join(args.outDir, 'pdfua-catalog-syntax.md')}`);
  console.log(`[pdfua-catalog] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

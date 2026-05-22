#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { pacRuleScoringCap } from '../src/services/scorer/finalizeEvidence.js';
import type { AnalysisResult, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-language-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `language-parts-parity-${timestampSlug()}`);

const DOCUMENT_LANGUAGE_RULES = new Set([
  'pdfua.language.document_lang_present',
  'pdfua.language.document_lang_syntax_valid',
]);

const PART_LANGUAGE_RULES = new Set([
  'pdfua.language.text_object_lang_valid',
  'pdfua.language.alt_text_lang_valid',
  'pdfua.language.actual_text_lang_valid',
  'pdfua.language.annotation_contents_lang_valid',
  'pdfua.language.form_tu_lang_valid',
  'pdfua.language.outline_lang_valid',
  'pdfua.language.structure_lang_valid',
]);

const LANGUAGE_RULES = new Set([...DOCUMENT_LANGUAGE_RULES, ...PART_LANGUAGE_RULES]);

export type LanguagePartsClassification =
  | 'document_language_score_active'
  | 'language_parts_score_active'
  | 'document_language_syntax_scoring_gap'
  | 'explicit_structure_lang_scoring_candidate'
  | 'language_parts_heuristic_evidence'
  | 'language_parts_control_noise'
  | 'no_language_parts_debt'
  | 'analysis_error';

export type LanguagePartsSuggestedAction =
  | 'already_score_active'
  | 'document_language_syntax_validation_needed'
  | 'structure_lang_score_cap_validation_needed'
  | 'native_context_hardening_needed'
  | 'keep_diagnostic'
  | 'no_action';

export interface LanguagePartsFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  titleLanguage: number;
  altText: number;
  linkQuality: number;
  formAccessibility: number;
  pdfUaCompliance: number;
  lang: string | null;
  metadataLanguage: string | null;
  documentLanguageMissing: boolean;
  documentLanguageMalformed: boolean;
  altTextLanguageInvalidCount: number;
  actualTextLanguageInvalidCount: number;
  annotationContentsLanguageInvalidCount: number;
  formTuLanguageInvalidCount: number;
  outlineLanguageInvalidCount: number;
  expansionTextLanguageInvalidCount: number;
  structureLangInvalidCount: number;
  textObjectLanguageInvalidCount: number;
  totalPartLanguageInvalidCount: number;
  verifiedPartLanguageInvalidCount: number;
  heuristicPartLanguageInvalidCount: number;
  pacFailures: string[];
  pacWarnings: string[];
  verifiedFailures: string[];
  heuristicFailures: string[];
  scoreCapRules: string[];
  failRulesWithScoringPolicy: string[];
  failRulesWithoutScoringPolicy: string[];
  failRulesWithoutAppliedCapRecord: string[];
}

export interface LanguagePartsDiagnosticRow extends ContentEventSourceRow {
  classification: LanguagePartsClassification;
  suggestedAction: LanguagePartsSuggestedAction;
  reasons: string[];
  features: LanguagePartsFeatures | null;
  error?: string;
}

export interface LanguagePartsDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<LanguagePartsClassification, number>;
  suggestedActionDistribution: Record<LanguagePartsSuggestedAction, number>;
  decision: {
    status:
      | 'plan_document_language_syntax_scoring_validation'
      | 'plan_structure_lang_scoring_validation'
      | 'plan_language_parts_context_hardening'
      | 'keep_language_parts_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: LanguagePartsDiagnosticRow[];
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
  return `Usage: pnpm exec tsx scripts/language-parts-parity-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and reports PAC/POC-style document-language and language-of-parts evidence. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
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

function capRules(analysis: AnalysisResult): string[] {
  const caps: ScoreCapApplied[] = [
    ...(analysis.scoreCapsApplied ?? []),
    ...analysis.categories.flatMap(category => category.scoreCapsApplied ?? []),
  ];
  const out = new Set<string>();
  for (const cap of caps) {
    const match = cap.reason.match(/PAC rule failure: ([^\s]+)/);
    if (match?.[1] && LANGUAGE_RULES.has(match[1])) out.add(match[1]);
  }
  return [...out].sort();
}

function languageRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  return buildPacRuleEvidence(snapshot).filter(rule => LANGUAGE_RULES.has(rule.ruleId));
}

export function extractLanguagePartsFeatures(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): LanguagePartsFeatures {
  const audit = snapshot.languageAudit;
  const rules = languageRules(snapshot);
  const failures = rules.filter(rule => rule.status === 'fail');
  const caps = capRules(analysis);
  const failRulesWithScoringPolicy = failures
    .filter(rule => pacRuleScoringCap(rule.ruleId) !== null)
    .map(rule => rule.ruleId)
    .sort();
  const failRulesWithoutScoringPolicy = failures
    .filter(rule => pacRuleScoringCap(rule.ruleId) === null)
    .map(rule => rule.ruleId)
    .sort();
  const failRulesWithoutAppliedCapRecord = failRulesWithScoringPolicy
    .filter(ruleId => !caps.includes(ruleId))
    .sort();
  const documentLanguageMissing = failures.some(rule => rule.ruleId === 'pdfua.language.document_lang_present');
  const documentLanguageMalformed = failures.some(rule => rule.ruleId === 'pdfua.language.document_lang_syntax_valid');
  const altTextLanguageInvalidCount = audit?.altTextLanguageInvalidCount ?? 0;
  const actualTextLanguageInvalidCount = audit?.actualTextLanguageInvalidCount ?? 0;
  const annotationContentsLanguageInvalidCount = audit?.annotationContentsLanguageInvalidCount ?? 0;
  const formTuLanguageInvalidCount = audit?.formTuLanguageInvalidCount ?? 0;
  const outlineLanguageInvalidCount = audit?.outlineLanguageInvalidCount ?? 0;
  const expansionTextLanguageInvalidCount = audit?.expansionTextLanguageInvalidCount ?? 0;
  const structureLangInvalidCount = audit?.structureLangInvalidCount ?? 0;
  const textObjectLanguageInvalidCount = audit?.textObjectLanguageInvalidCount ?? 0;
  const heuristicPartLanguageInvalidCount =
    altTextLanguageInvalidCount +
    actualTextLanguageInvalidCount +
    annotationContentsLanguageInvalidCount +
    formTuLanguageInvalidCount +
    outlineLanguageInvalidCount +
    expansionTextLanguageInvalidCount +
    textObjectLanguageInvalidCount;
  const totalPartLanguageInvalidCount = heuristicPartLanguageInvalidCount + structureLangInvalidCount;

  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    titleLanguage: categoryScore(analysis, 'title_language'),
    altText: categoryScore(analysis, 'alt_text'),
    linkQuality: categoryScore(analysis, 'link_quality'),
    formAccessibility: categoryScore(analysis, 'form_accessibility'),
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    lang: snapshot.lang,
    metadataLanguage: snapshot.metadata.language ?? null,
    documentLanguageMissing,
    documentLanguageMalformed,
    altTextLanguageInvalidCount,
    actualTextLanguageInvalidCount,
    annotationContentsLanguageInvalidCount,
    formTuLanguageInvalidCount,
    outlineLanguageInvalidCount,
    expansionTextLanguageInvalidCount,
    structureLangInvalidCount,
    textObjectLanguageInvalidCount,
    totalPartLanguageInvalidCount,
    verifiedPartLanguageInvalidCount: structureLangInvalidCount,
    heuristicPartLanguageInvalidCount,
    pacFailures: failures.map(rule => rule.ruleId).sort(),
    pacWarnings: rules.filter(rule => rule.status === 'warn').map(rule => rule.ruleId).sort(),
    verifiedFailures: failures.filter(rule => rule.confidence === 'verified').map(rule => rule.ruleId).sort(),
    heuristicFailures: failures.filter(rule => rule.confidence === 'heuristic').map(rule => rule.ruleId).sort(),
    scoreCapRules: caps,
    failRulesWithScoringPolicy,
    failRulesWithoutScoringPolicy,
    failRulesWithoutAppliedCapRecord,
  };
}

export function classifyLanguagePartsEvidence(
  features: LanguagePartsFeatures,
  role: 'focus' | 'control' = 'focus',
): Pick<LanguagePartsDiagnosticRow, 'classification' | 'suggestedAction' | 'reasons'> {
  const reasons: string[] = [];
  if (features.documentLanguageMissing) reasons.push('document_language_missing');
  if (features.documentLanguageMalformed) reasons.push('document_language_malformed');
  if (features.structureLangInvalidCount > 0) reasons.push(`structure_lang_invalid:${features.structureLangInvalidCount}`);
  if (features.heuristicPartLanguageInvalidCount > 0) reasons.push(`heuristic_part_lang_invalid:${features.heuristicPartLanguageInvalidCount}`);

  if (
    (
      features.documentLanguageMissing &&
      features.failRulesWithScoringPolicy.includes('pdfua.language.document_lang_present')
    ) ||
    (
      features.documentLanguageMalformed &&
      features.failRulesWithScoringPolicy.includes('pdfua.language.document_lang_syntax_valid')
    )
  ) {
    return {
      classification: 'document_language_score_active',
      suggestedAction: 'already_score_active',
      reasons: reasons.length ? reasons : ['document_language_failure_already_score_active'],
    };
  }

  if (features.documentLanguageMalformed && !features.failRulesWithScoringPolicy.includes('pdfua.language.document_lang_syntax_valid')) {
    if (role === 'control' || features.score >= 90) {
      return {
        classification: 'language_parts_control_noise',
        suggestedAction: 'keep_diagnostic',
        reasons: reasons.length ? [...reasons, 'control_or_high_grade_language_syntax_debt'] : ['control_or_high_grade_language_syntax_debt'],
      };
    }
    return {
      classification: 'document_language_syntax_scoring_gap',
      suggestedAction: 'document_language_syntax_validation_needed',
      reasons: reasons.length ? reasons : ['document_language_syntax_failure_without_score_cap'],
    };
  }

  if (features.structureLangInvalidCount > 0) {
    if (features.failRulesWithScoringPolicy.includes('pdfua.language.structure_lang_valid')) {
      return {
        classification: 'language_parts_score_active',
        suggestedAction: 'already_score_active',
        reasons: reasons.length ? reasons : ['structure_language_failure_already_score_active'],
      };
    }
    if (role === 'control' || features.score >= 90) {
      return {
        classification: 'language_parts_control_noise',
        suggestedAction: 'keep_diagnostic',
        reasons: [...reasons, 'control_or_high_grade_structure_lang_debt'],
      };
    }
    return {
      classification: 'explicit_structure_lang_scoring_candidate',
      suggestedAction: 'structure_lang_score_cap_validation_needed',
      reasons,
    };
  }

  if (features.heuristicPartLanguageInvalidCount > 0) {
    if (role === 'control' || features.score >= 90) {
      return {
        classification: 'language_parts_control_noise',
        suggestedAction: 'keep_diagnostic',
        reasons: [...reasons, 'heuristic_language_part_debt_on_control_or_high_grade_row'],
      };
    }
    return {
      classification: 'language_parts_heuristic_evidence',
      suggestedAction: 'native_context_hardening_needed',
      reasons,
    };
  }

  return {
    classification: 'no_language_parts_debt',
    suggestedAction: 'no_action',
    reasons: ['no_language_parts_debt'],
  };
}

async function analyzeRow(row: ContentEventSourceRow): Promise<LanguagePartsDiagnosticRow> {
  try {
    const { result, snapshot } = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractLanguagePartsFeatures(result, snapshot);
    return {
      ...row,
      ...classifyLanguagePartsEvidence(features, row.role),
      features,
    };
  } catch (error) {
    return {
      ...row,
      classification: 'analysis_error',
      suggestedAction: 'keep_diagnostic',
      reasons: ['analysis_error'],
      features: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function countBy<T extends string>(rows: Array<Record<string, unknown>>, key: string, values: readonly T[]): Record<T, number> {
  const out = Object.fromEntries(values.map(value => [value, 0])) as Record<T, number>;
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string' && value in out) out[value as T] += 1;
  }
  return out;
}

const CLASSIFICATIONS: readonly LanguagePartsClassification[] = [
  'document_language_score_active',
  'language_parts_score_active',
  'document_language_syntax_scoring_gap',
  'explicit_structure_lang_scoring_candidate',
  'language_parts_heuristic_evidence',
  'language_parts_control_noise',
  'no_language_parts_debt',
  'analysis_error',
];

const ACTIONS: readonly LanguagePartsSuggestedAction[] = [
  'already_score_active',
  'document_language_syntax_validation_needed',
  'structure_lang_score_cap_validation_needed',
  'native_context_hardening_needed',
  'keep_diagnostic',
  'no_action',
];

export function buildLanguagePartsReport(
  outDir: string,
  rows: LanguagePartsDiagnosticRow[],
  createdAt = new Date().toISOString(),
): LanguagePartsDiagnosticReport {
  const documentSyntaxFocus = rows.filter(row => row.role === 'focus' && row.classification === 'document_language_syntax_scoring_gap').length;
  const documentSyntaxControls = rows.filter(row => row.role === 'control' && row.classification === 'document_language_syntax_scoring_gap').length;
  const structureFocus = rows.filter(row => row.role === 'focus' && row.classification === 'explicit_structure_lang_scoring_candidate').length;
  const structureControls = rows.filter(row => row.role === 'control' && row.classification === 'explicit_structure_lang_scoring_candidate').length;
  const heuristicFocus = rows.filter(row => row.role === 'focus' && row.classification === 'language_parts_heuristic_evidence').length;
  const heuristicControls = rows.filter(row => row.role === 'control' && row.classification === 'language_parts_heuristic_evidence').length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `document_syntax_focus=${documentSyntaxFocus}`,
    `document_syntax_controls=${documentSyntaxControls}`,
    `structure_focus=${structureFocus}`,
    `structure_controls=${structureControls}`,
    `heuristic_focus=${heuristicFocus}`,
    `heuristic_controls=${heuristicControls}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : documentSyntaxFocus >= 2 && documentSyntaxControls === 0
      ? 'plan_document_language_syntax_scoring_validation'
      : structureFocus >= 2 && structureControls === 0
        ? 'plan_structure_lang_scoring_validation'
        : heuristicFocus > 0 && heuristicControls === 0
          ? 'plan_language_parts_context_hardening'
          : 'keep_language_parts_diagnostic_only';

  return {
    createdAt,
    outDir,
    selectedRowCount: rows.length,
    classificationDistribution: countBy(rows, 'classification', CLASSIFICATIONS),
    suggestedActionDistribution: countBy(rows, 'suggestedAction', ACTIONS),
    decision: { status, reasons },
    rows,
  };
}

function mdRow(values: Array<string | number | null | undefined>): string {
  return `| ${values.map(value => String(value ?? '')).join(' | ')} |`;
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

export function renderMarkdown(report: LanguagePartsDiagnosticReport): string {
  const lines: string[] = [
    '# Language Parts Parity Diagnostic',
    '',
    `Generated: \`${report.createdAt}\``,
    `Rows: ${report.selectedRowCount}`,
    '',
    'Diagnostic-only native PDFAF document-language and language-of-parts evidence. No PAC/POC/ODL/Java call, remediation, PDF mutation, scoring change, or planner routing change was performed.',
    '',
    '## Decision',
    '',
    `- Status: \`${report.decision.status}\``,
    `- Reasons: ${report.decision.reasons.join(', ')}`,
    '',
    '## Rows',
    '',
    mdRow(['Row', 'Role', 'Score', 'Grade', 'Title/lang', 'Alt', 'Link', 'Form', 'PDF/UA', 'Doc', 'Parts', 'Caps', 'Class', 'Action']),
    mdRow(['---', '---', '---:', '---', '---:', '---:', '---:', '---:', '---:', '---', '---:', '---', '---', '---']),
  ];
  for (const row of report.rows) {
    const f = row.features;
    const doc = f ? `${f.documentLanguageMissing ? 'missing' : 'present'}${f.documentLanguageMalformed ? '+bad-syntax' : ''}` : 'ERR';
    lines.push(mdRow([
      row.id,
      row.role,
      f?.score,
      f?.grade,
      f?.titleLanguage,
      f?.altText,
      f?.linkQuality,
      f?.formAccessibility,
      f?.pdfUaCompliance,
      doc,
      f?.totalPartLanguageInvalidCount,
      f ? list(f.scoreCapRules) : 'ERR',
      row.classification,
      row.suggestedAction,
    ]));
  }
  lines.push('', '## Details');
  for (const row of report.rows) {
    lines.push('', `### ${row.id}`, '');
    lines.push(`- File: \`${row.pdfPath}\``);
    lines.push(`- Reasons: ${row.reasons.join('; ') || 'none'}`);
    if (row.error) lines.push(`- Error: \`${row.error}\``);
    if (row.features) {
      const f = row.features;
      lines.push(`- Document language: \`${f.lang ?? 'none'}\` (metadata \`${f.metadataLanguage ?? 'none'}\`)`);
      lines.push(`- Language audit: alt=${f.altTextLanguageInvalidCount}, actual=${f.actualTextLanguageInvalidCount}, annotation=${f.annotationContentsLanguageInvalidCount}, formTU=${f.formTuLanguageInvalidCount}, outline=${f.outlineLanguageInvalidCount}, expansion=${f.expansionTextLanguageInvalidCount}, structure=${f.structureLangInvalidCount}, textObject=${f.textObjectLanguageInvalidCount}`);
      lines.push(`- PAC failures: ${list(f.pacFailures)}`);
      lines.push(`- Verified failures: ${list(f.verifiedFailures)}`);
      lines.push(`- Heuristic failures: ${list(f.heuristicFailures)}`);
      lines.push(`- Fail rules without scoring policy: ${list(f.failRulesWithoutScoringPolicy)}`);
    }
  }
  lines.push('');
  if (report.decision.status === 'plan_document_language_syntax_scoring_validation') {
    lines.push('A later document-language syntax scoring validation may be justified. It must prove malformed explicit `/Lang` syntax on positives, clean controls, no false positives, and original-50 stability before any cap is accepted.');
  } else if (report.decision.status === 'plan_structure_lang_scoring_validation') {
    lines.push('A later structure-language scoring validation may be justified only for malformed explicit `/Lang` values on structure elements. Inherited-language or semantic language detection remains out of scope.');
  } else if (report.decision.status === 'plan_language_parts_context_hardening') {
    lines.push('The next safe step is evidence hardening, not scoring: separate explicit malformed `/Lang` values from inherited language context and semantic-language uncertainty before any score-active rule is considered.');
  } else if (report.decision.status === 'diagnostic_errors_present') {
    lines.push('Resolve diagnostic errors before making a language-parts parity lane decision.');
  } else {
    lines.push('No language-parts scoring or remediation promotion is justified from this sample. Keep the lane diagnostic-only or choose a more specific object-backed sample.');
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const selected = await collectContentEventRows(args);
  const rows: LanguagePartsDiagnosticRow[] = [];
  for (const row of selected) {
    const result = await analyzeRow(row);
    rows.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[language-parts] ${result.id} ${score} ${result.classification}`);
  }
  const report = buildLanguagePartsReport(args.outDir, rows);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'language-parts-parity.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'language-parts-parity.md'), renderMarkdown(report), 'utf8');
  console.log(`[language-parts] wrote ${join(args.outDir, 'language-parts-parity.md')}`);
  console.log(`[language-parts] decision ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

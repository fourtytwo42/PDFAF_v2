#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { replacementCharacterTextRisk } from '../src/services/scorer/replacementCharacterTextRisk.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-font-cmap-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `font-cmap-scoring-hardening-${timestampSlug()}`);
const CONTROL_RE = /(?:fixture|teams|adam2|accessible|control)/i;

export type FontCmapClassification =
  | 'replacement_character_score_active'
  | 'font_cmap_true_debt_candidate'
  | 'font_cmap_syntax_only'
  | 'font_cmap_existing_low_text_score'
  | 'font_cmap_manual_review_only'
  | 'font_cmap_no_debt'
  | 'analysis_error';

export type FontCmapSuggestedAction =
  | 'already_score_active'
  | 'score_cap_candidate_requires_controls'
  | 'keep_diagnostic'
  | 'no_action';

export interface FontCmapDiagnosticArgs {
  pdfs: string[];
  manifests: string[];
  ids: string[];
  outDir: string;
  limit?: number;
}

export interface FontCmapSourceRow {
  id: string;
  pdfPath: string;
  title: string;
  role: 'focus' | 'control';
}

export interface FontCmapFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  textExtractability: number;
  pageCount: number;
  textCharCount: number;
  charsPerPage: number;
  fontsChecked: number;
  fontCount: number;
  encodingRiskFontCount: number;
  missingUnicodeFontCount: number;
  unembeddedFontCount: number;
  missingToUnicodeCMapCount: number;
  invalidToUnicodeCMapCount: number;
  emptyToUnicodeCMapCount: number;
  unicodeCmapDebtCount: number;
  cidToGidMapRiskCount: number;
  trueTypeEncodingMismatchCount: number;
  wModeMismatchCount: number;
  externalCMapReferenceCount: number;
  type0DescendantFontRiskCount: number;
  replacementCharacterCount: number;
  replacementCharacterRatio: number;
  highReplacementCharacterPageCount: number;
  replacementRiskCap: number | null;
  pacFontFailures: string[];
  pacFontWarnings: string[];
}

export interface FontCmapDiagnosticRow {
  id: string;
  pdfPath: string;
  title: string;
  role: 'focus' | 'control';
  classification: FontCmapClassification;
  suggestedAction: FontCmapSuggestedAction;
  reasons: string[];
  features: FontCmapFeatures | null;
  error?: string;
}

export interface FontCmapDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<FontCmapClassification, number>;
  suggestedActionDistribution: Record<FontCmapSuggestedAction, number>;
  decision: {
    status:
      | 'plan_font_cmap_scoring_validation'
      | 'keep_font_cmap_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: FontCmapDiagnosticRow[];
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/font-cmap-scoring-hardening-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis, writes JSON/Markdown under the output directory, and never calls PAC/POC/ODL/Java, remediates PDFs, mutates PDFs, or changes scoring behavior.`;
}

export function parseArgs(argv = process.argv.slice(2)): FontCmapDiagnosticArgs {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function titleFromPath(pdfPath: string): string {
  return basename(pdfPath, extname(pdfPath)).replace(/[_-]+/g, ' ');
}

function roleFor(id: string, pdfPath: string, intent?: string): 'focus' | 'control' {
  return CONTROL_RE.test(`${id} ${pdfPath} ${intent ?? ''}`) ? 'control' : 'focus';
}

function matchesFilter(row: FontCmapSourceRow, ids: Set<string>): boolean {
  if (ids.size === 0) return true;
  const keys = [
    row.id,
    basename(row.pdfPath),
    basename(row.pdfPath, extname(row.pdfPath)),
    row.title,
  ].map(value => value.toLowerCase());
  return [...ids].some(id => keys.some(key => key.includes(id.toLowerCase())));
}

async function rowsFromManifest(manifestPath: string): Promise<FontCmapSourceRow[]> {
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  const root = dirname(manifestPath);
  const rows: FontCmapSourceRow[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const record = asRecord(item);
      const id = str(record['id']);
      const file = str(record['file']);
      if (!id || !file) continue;
      const pdfPath = resolve(root, file);
      const intent = str(record['intent']);
      rows.push({
        id,
        pdfPath,
        title: titleFromPath(pdfPath),
        role: roleFor(id, pdfPath, intent),
      });
    }
    return rows;
  }

  const wrapped = asRecord(raw);
  const edgeRows = Array.isArray(wrapped['rows']) ? wrapped['rows'] : [];
  for (const item of edgeRows) {
    const record = asRecord(item);
    const id = str(record['id']) || str(record['publicationId']);
    const localFile = str(record['localFile']) || str(record['file']);
    if (!id || !localFile) continue;
    const pdfPath = resolve(root, localFile);
    const title = str(record['title']) || titleFromPath(pdfPath);
    const problemMix = Array.isArray(record['problemMix'])
      ? record['problemMix'].map(str).join(' ')
      : '';
    rows.push({
      id,
      pdfPath,
      title,
      role: roleFor(id, pdfPath, problemMix),
    });
  }
  return rows;
}

export async function collectSourceRows(args: FontCmapDiagnosticArgs): Promise<FontCmapSourceRow[]> {
  const byKey = new Map<string, FontCmapSourceRow>();
  for (const pdf of args.pdfs) {
    const row: FontCmapSourceRow = {
      id: basename(pdf, extname(pdf)),
      pdfPath: resolve(pdf),
      title: titleFromPath(pdf),
      role: roleFor(basename(pdf), pdf),
    };
    byKey.set(row.pdfPath, row);
  }
  for (const manifest of args.manifests) {
    for (const row of await rowsFromManifest(manifest)) {
      byKey.set(row.pdfPath, row);
    }
  }
  const ids = new Set(args.ids);
  const rows = [...byKey.values()].filter(row => matchesFilter(row, ids));
  return typeof args.limit === 'number' ? rows.slice(0, args.limit) : rows;
}

function categoryScore(analysis: AnalysisResult, key: string): number {
  return analysis.categories.find(category => category.key === key)?.score ?? 100;
}

function fontRows(snapshot: DocumentSnapshot): {
  encodingRiskFontCount: number;
  missingUnicodeFontCount: number;
  unembeddedFontCount: number;
} {
  return {
    encodingRiskFontCount: snapshot.fonts.filter(font => font.encodingRisk).length,
    missingUnicodeFontCount: snapshot.fonts.filter(font => font.hasUnicode === false).length,
    unembeddedFontCount: snapshot.fonts.filter(font => font.isEmbedded === false).length,
  };
}

function pacFontRules(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  const ids = new Set([
    'pdfua.font.to_unicode_cmap_present',
    'pdfua.font.to_unicode_cmap_valid',
    'pdfua.content.characters_unicode_mappable',
    'pdfua.font.cid_to_gidmap_valid',
    'pdfua.font.truetype_encoding_consistent',
    'pdfua.font.wmode_consistent',
  ]);
  return buildPacRuleEvidence(snapshot).filter(rule => ids.has(rule.ruleId));
}

export function extractFontCmapFeatures(analysis: AnalysisResult, snapshot: DocumentSnapshot): FontCmapFeatures {
  const audit = snapshot.fontSyntaxAudit;
  const replacementRisk = replacementCharacterTextRisk(snapshot);
  const pacRules = pacFontRules(snapshot);
  const fonts = fontRows(snapshot);
  const missing = audit?.missingToUnicodeCMapCount ?? 0;
  const invalid = audit?.invalidToUnicodeCMapCount ?? 0;
  const empty = audit?.emptyToUnicodeCMapCount ?? 0;
  const cidToGid = audit?.cidToGidMapRiskCount ?? 0;
  const type0 = audit?.type0DescendantFontRiskCount ?? 0;
  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    textExtractability: categoryScore(analysis, 'text_extractability'),
    pageCount: snapshot.pageCount,
    textCharCount: snapshot.textCharCount,
    charsPerPage: snapshot.textCharCount / Math.max(snapshot.pageCount, 1),
    fontsChecked: audit?.fontsChecked ?? snapshot.fonts.length,
    fontCount: snapshot.fonts.length,
    ...fonts,
    missingToUnicodeCMapCount: missing,
    invalidToUnicodeCMapCount: invalid,
    emptyToUnicodeCMapCount: empty,
    unicodeCmapDebtCount: missing + invalid + empty,
    cidToGidMapRiskCount: cidToGid,
    trueTypeEncodingMismatchCount: audit?.trueTypeEncodingMismatchCount ?? 0,
    wModeMismatchCount: audit?.wModeMismatchCount ?? 0,
    externalCMapReferenceCount: audit?.externalCMapReferenceCount ?? 0,
    type0DescendantFontRiskCount: type0,
    replacementCharacterCount: audit?.replacementCharacterCount ?? 0,
    replacementCharacterRatio: audit?.replacementCharacterRatio ?? 0,
    highReplacementCharacterPageCount: audit?.highReplacementCharacterPageCount ?? 0,
    replacementRiskCap: replacementRisk?.scoreCap ?? null,
    pacFontFailures: pacRules.filter(rule => rule.status === 'fail').map(rule => rule.ruleId),
    pacFontWarnings: pacRules.filter(rule => rule.status === 'warn').map(rule => rule.ruleId),
  };
}

export function classifyFontCmapScoringEvidence(features: FontCmapFeatures): {
  classification: FontCmapClassification;
  suggestedAction: FontCmapSuggestedAction;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (features.textExtractability < 90) reasons.push(`text_extractability_already_low:${features.textExtractability}`);
  if (features.unicodeCmapDebtCount > 0) reasons.push(`unicode_cmap_debt:${features.unicodeCmapDebtCount}`);
  if (features.wModeMismatchCount > 0) reasons.push(`wmode_mismatch:${features.wModeMismatchCount}`);
  if (features.cidToGidMapRiskCount + features.type0DescendantFontRiskCount > 0) {
    reasons.push(`cid_or_type0_review:${features.cidToGidMapRiskCount + features.type0DescendantFontRiskCount}`);
  }
  if (features.trueTypeEncodingMismatchCount > 0) reasons.push(`truetype_encoding_review:${features.trueTypeEncodingMismatchCount}`);
  if (features.replacementCharacterCount > 0) {
    reasons.push(`replacement_chars:${features.replacementCharacterCount}`);
  }

  if (features.replacementRiskCap !== null) {
    return {
      classification: 'replacement_character_score_active',
      suggestedAction: 'already_score_active',
      reasons: [...reasons, `current_replacement_cap:${features.replacementRiskCap}`],
    };
  }

  const verifiedCmapDebt = features.unicodeCmapDebtCount + features.wModeMismatchCount > 0;
  const manualOnlyDebt =
    features.cidToGidMapRiskCount +
    features.trueTypeEncodingMismatchCount +
    features.externalCMapReferenceCount +
    features.type0DescendantFontRiskCount;

  if (!verifiedCmapDebt && manualOnlyDebt === 0) {
    return {
      classification: 'font_cmap_no_debt',
      suggestedAction: 'no_action',
      reasons: reasons.length ? reasons : ['no_font_cmap_debt'],
    };
  }

  if (features.textExtractability < 90) {
    return {
      classification: 'font_cmap_existing_low_text_score',
      suggestedAction: 'keep_diagnostic',
      reasons,
    };
  }

  if (!verifiedCmapDebt) {
    return {
      classification: 'font_cmap_manual_review_only',
      suggestedAction: 'keep_diagnostic',
      reasons,
    };
  }

  const denseTextLayer =
    features.textCharCount >= Math.max(1_000, features.pageCount * 150) &&
    features.charsPerPage >= 150 &&
    features.replacementCharacterRatio < 0.001 &&
    features.textExtractability >= 96;
  if (denseTextLayer) {
    return {
      classification: 'font_cmap_syntax_only',
      suggestedAction: 'keep_diagnostic',
      reasons: [...reasons, 'dense_text_layer_no_replacement_characters'],
    };
  }

  const suspiciousLowTextLayer =
    features.pdfClass === 'native_tagged' &&
    features.pageCount >= 2 &&
    features.charsPerPage < 80;
  const dominantFontMappingRisk =
    features.fontCount > 0 &&
    (features.missingUnicodeFontCount + features.encodingRiskFontCount) / features.fontCount >= 0.5;

  if (suspiciousLowTextLayer || dominantFontMappingRisk || features.wModeMismatchCount > 0) {
    return {
      classification: 'font_cmap_true_debt_candidate',
      suggestedAction: 'score_cap_candidate_requires_controls',
      reasons: [
        ...reasons,
        suspiciousLowTextLayer ? `low_native_text_density:${features.charsPerPage.toFixed(1)}` : '',
        dominantFontMappingRisk ? 'dominant_font_mapping_risk' : '',
      ].filter(Boolean),
    };
  }

  return {
    classification: 'font_cmap_syntax_only',
    suggestedAction: 'keep_diagnostic',
    reasons: [...reasons, 'cmap_syntax_debt_without_native_extraction_debt'],
  };
}

export async function analyzeFontCmapRow(row: FontCmapSourceRow): Promise<FontCmapDiagnosticRow> {
  try {
    const analyzed = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractFontCmapFeatures(analyzed.result, analyzed.snapshot);
    const classification = classifyFontCmapScoringEvidence(features);
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

export function buildFontCmapDiagnosticReport(outDir: string, rows: FontCmapDiagnosticRow[]): FontCmapDiagnosticReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const candidateFocus = rows.filter(row =>
    row.role === 'focus' &&
    row.classification === 'font_cmap_true_debt_candidate',
  ).length;
  const candidateControls = rows.filter(row =>
    row.role === 'control' &&
    row.classification === 'font_cmap_true_debt_candidate',
  ).length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `candidate_focus=${candidateFocus}`,
    `candidate_controls=${candidateControls}`,
    `replacement_score_active=${classificationDistribution.replacement_character_score_active ?? 0}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : candidateFocus >= 3 && candidateControls === 0
      ? 'plan_font_cmap_scoring_validation'
      : 'keep_font_cmap_diagnostic_only';
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

function renderMarkdown(report: FontCmapDiagnosticReport): string {
  const lines = [
    '# Font/CMap Scoring-Hardening Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'This report is diagnostic-only. It uses native PDFAF analysis and does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Text | Class | Action | CMap Debt | Replacement Ratio | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f ? String(f.textExtractability) : 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
      f ? String(f.unicodeCmapDebtCount + f.wModeMismatchCount) : 'ERR',
      f ? f.replacementCharacterRatio.toFixed(4) : 'ERR',
      row.reasons.join(', '),
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_font_cmap_scoring_validation') {
    lines.push('A separate scoring-validation stage is justified, but no score cap should be promoted until targeted positives and controls prove the cap reflects true extraction debt.');
  } else {
    lines.push('No score-active CMap cap is justified from this sample. Keep direct CMap/font syntax evidence diagnostic-only, except for existing replacement-character scoring that is already active.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeFontCmapDiagnostic(outDir: string, rows: FontCmapDiagnosticRow[]): Promise<FontCmapDiagnosticReport> {
  const report = buildFontCmapDiagnosticReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'font-cmap-scoring-hardening.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'font-cmap-scoring-hardening.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const rows = await collectSourceRows(args);
  if (rows.length === 0) throw new Error('No rows matched the requested inputs.');
  const analyzed: FontCmapDiagnosticRow[] = [];
  for (const row of rows) {
    const result = await analyzeFontCmapRow(row);
    analyzed.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[font-cmap] ${result.id} ${score} ${result.classification}`);
  }
  const report = await writeFontCmapDiagnostic(args.outDir, analyzed);
  console.log(`[font-cmap] wrote ${join(args.outDir, 'font-cmap-scoring-hardening.md')}`);
  console.log(`[font-cmap] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

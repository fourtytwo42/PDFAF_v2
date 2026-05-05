#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { REMEDIATION_CATEGORY_THRESHOLD } from '../src/config.js';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, CategoryKey } from '../src/types.js';
import {
  categorySnapshots,
  familyForPocStrongAreaRule,
  isPocStrongAreaRule,
  type PocStrongAreaFamily,
  type PocStrongAreaFileRow,
  type StrongAreaCategorySnapshot,
} from './poc-strong-areas-diagnostic.js';

const DEFAULT_OUT = 'Output/pac-promotion-readiness';

const SCORING_CANDIDATE_RULE_IDS = new Set([
  'pdfua.structure.rolemap_valid',
  'pdfua.structure.parent_links_valid',
  'pdfua.structure.mcr_objr_valid',
  'pdfua.parent_tree.mcid_entries_valid',
  'pdfua.content.text_tagged_or_artifacted',
  'pdfua.content.image_tagged_or_artifacted',
  'pdfua.table.header_association_present',
]);

const GATE_CANDIDATE_RULE_IDS = new Set([
  'pdfua.structure.parent_links_valid',
  'pdfua.structure.mcr_objr_valid',
  'pdfua.structure.child_roles_valid',
  'pdfua.structure.rolemap_valid',
  'pdfua.parent_tree.mcid_entries_valid',
  'pdfua.content.text_tagged_or_artifacted',
  'pdfua.content.image_tagged_or_artifacted',
  'pdfua.content.artifact_tag_boundary_valid',
  'pdfua.table.header_association_present',
]);

const OPTIONAL_DIAGNOSTIC_PREFIXES = [
  'wcag.contrast.',
  'pdfua.link.uri_',
  'pdfua.ai.',
];

export type PacPromotionReadiness =
  | 'ready_for_scoring_candidate'
  | 'ready_for_gate_candidate'
  | 'needs_more_evidence'
  | 'diagnostic_only_optional';

export interface PacPromotionRuleRow {
  fileId: string;
  file: string;
  ruleId: string;
  family: PocStrongAreaFamily;
  category: CategoryKey;
  categoryScore: number | null;
  categoryApplicable: boolean;
  status: PacRuleEvidence['status'];
  confidence: PacRuleEvidence['confidence'];
  message: string;
  categoryPassGap: boolean;
  noisy: boolean;
  optionalDiagnostic: boolean;
  scoringEligible: boolean;
  gateEligible: boolean;
  readiness: PacPromotionReadiness;
}

export interface PacPromotionRuleSummary {
  ruleId: string;
  family: PocStrongAreaFamily;
  category: CategoryKey;
  files: string[];
  verifiedFailCount: number;
  categoryPassGapCount: number;
  scoringCandidateCount: number;
  gateCandidateCount: number;
  noisyCount: number;
  blockedCount: number;
  diagnosticOnlyCount: number;
}

export interface PacPromotionReadinessSummary {
  generatedAt: string;
  fileCount: number;
  ruleRows: PacPromotionRuleRow[];
  scoringCandidates: PacPromotionRuleSummary[];
  gateCandidates: PacPromotionRuleSummary[];
  noisyRules: PacPromotionRuleSummary[];
  blockedRules: PacPromotionRuleSummary[];
  diagnosticOnlyRules: PacPromotionRuleSummary[];
}

interface ManifestLike {
  rows?: unknown[];
  entries?: unknown[];
  files?: unknown[];
}

interface MatrixLike {
  files?: unknown[];
}

function categoryForRule(rule: PacRuleEvidence, categories: StrongAreaCategorySnapshot[]): StrongAreaCategorySnapshot | undefined {
  return categories.find(category => category.key === rule.category);
}

function isOptionalDiagnosticRule(ruleId: string): boolean {
  return OPTIONAL_DIAGNOSTIC_PREFIXES.some(prefix => ruleId.startsWith(prefix));
}

function isVerifiedFail(rule: PacRuleEvidence): boolean {
  return rule.status === 'fail' && rule.confidence === 'verified';
}

function isFontCmapScoringRule(ruleId: string): boolean {
  return ruleId.startsWith('pdfua.font.');
}

export function classifyPacPromotionRule(
  rule: PacRuleEvidence,
  categories: StrongAreaCategorySnapshot[],
): PacPromotionRuleRow['readiness'] {
  const category = categoryForRule(rule, categories);
  const categoryPassGap = Boolean(
    category?.applicable &&
    typeof category.score === 'number' &&
    category.score >= REMEDIATION_CATEGORY_THRESHOLD &&
    rule.status === 'fail',
  );
  if (isVerifiedFail(rule) && categoryPassGap && SCORING_CANDIDATE_RULE_IDS.has(rule.ruleId)) {
    return 'ready_for_scoring_candidate';
  }
  if (isVerifiedFail(rule) && GATE_CANDIDATE_RULE_IDS.has(rule.ruleId)) return 'ready_for_gate_candidate';
  if (isOptionalDiagnosticRule(rule.ruleId)) return 'diagnostic_only_optional';
  return rule.status === 'pass' || rule.status === 'not_applicable'
    ? 'diagnostic_only_optional'
    : 'needs_more_evidence';
}

export function buildPacPromotionRuleRows(rows: PocStrongAreaFileRow[]): PacPromotionRuleRow[] {
  const out: PacPromotionRuleRow[] = [];
  for (const file of rows) {
    for (const rule of file.rules.filter(item => isPocStrongAreaRule(item.ruleId))) {
      const category = categoryForRule(rule, file.categories);
      const categoryPassGap = Boolean(
        category?.applicable &&
        typeof category.score === 'number' &&
        category.score >= REMEDIATION_CATEGORY_THRESHOLD &&
        rule.status === 'fail',
      );
      const scoringEligible = isVerifiedFail(rule) && categoryPassGap && SCORING_CANDIDATE_RULE_IDS.has(rule.ruleId);
      const gateEligible = isVerifiedFail(rule) && GATE_CANDIDATE_RULE_IDS.has(rule.ruleId);
      const optionalDiagnostic = isOptionalDiagnosticRule(rule.ruleId);
      out.push({
        fileId: file.id,
        file: file.file,
        ruleId: rule.ruleId,
        family: familyForPocStrongAreaRule(rule.ruleId),
        category: rule.category,
        categoryScore: category?.score ?? null,
        categoryApplicable: category?.applicable ?? false,
        status: rule.status,
        confidence: rule.confidence,
        message: rule.message,
        categoryPassGap,
        noisy: rule.status === 'warn' || rule.confidence !== 'verified',
        optionalDiagnostic,
        scoringEligible,
        gateEligible,
        readiness: classifyPacPromotionRule(rule, file.categories),
      });
    }
  }
  return out.sort(sortRuleRow);
}

export function buildPacPromotionReadinessSummary(rows: PocStrongAreaFileRow[]): PacPromotionReadinessSummary {
  const ruleRows = buildPacPromotionRuleRows(rows);
  const grouped = summarizeRules(ruleRows);
  return {
    generatedAt: new Date().toISOString(),
    fileCount: rows.length,
    ruleRows,
    scoringCandidates: grouped.filter(rule => rule.scoringCandidateCount > 0).sort(sortPromotionSummary),
    gateCandidates: grouped.filter(rule => rule.gateCandidateCount > 0).sort(sortPromotionSummary),
    noisyRules: grouped.filter(rule => rule.noisyCount > 0).sort(sortNoiseSummary),
    blockedRules: grouped.filter(rule => rule.blockedCount > 0).sort(sortBlockedSummary),
    diagnosticOnlyRules: grouped.filter(rule => rule.diagnosticOnlyCount > 0).sort(sortRuleSummary),
  };
}

export function renderPacPromotionReadinessMarkdown(summary: PacPromotionReadinessSummary): string {
  const lines = [
    '# PAC Promotion Readiness',
    '',
    `Generated: \`${summary.generatedAt}\``,
    `Files: ${summary.fileCount}`,
    '',
    '## Decision Boundary',
    '',
    'This diagnostic does not promote any rule into scoring, remediation gates, planner routing, API responses, rendered contrast, network link checks, or AI behavior. It only identifies verified checker evidence that is ready to evaluate in a later behavior stage.',
    '',
    '## Scoring-Cap Candidates',
    '',
  ];
  appendSummaryTable(lines, summary.scoringCandidates, 'No verified category-pass / PAC-fail scoring candidates found.');
  lines.push('## Gate Candidates', '');
  appendSummaryTable(lines, summary.gateCandidates, 'No verified structural/checker-facing gate candidates found.');
  lines.push('## Noisy Or Manual-Review Evidence', '');
  appendSummaryTable(lines, summary.noisyRules.slice(0, 30), 'No noisy strong-area evidence found.');
  lines.push('## Top Blocked Rules', '');
  appendSummaryTable(lines, summary.blockedRules.slice(0, 30), 'No blocked strong-area failures found.');
  lines.push('## Diagnostic-Only Optional Areas', '');
  appendSummaryTable(lines, summary.diagnosticOnlyRules.filter(rule => rule.family === 'contrast_link_ai_placeholders').slice(0, 30), 'No optional contrast/link/AI diagnostic rows found.');
  lines.push(
    '## Recommendation',
    '',
    'Promote only high-frequency verified scoring candidates in a separate stage, using the existing 89-point cap model. Promote gate candidates only when the rule can regress during deterministic structural mutations. Rendered contrast, link reachability, and AI visual-tag mismatch remain opt-in/manual-review because their disabled, uncertain, networked, or semantic evidence is not deterministic enough for default scoring or acceptance gates.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function summarizeRules(rows: PacPromotionRuleRow[]): PacPromotionRuleSummary[] {
  const map = new Map<string, PacPromotionRuleSummary>();
  for (const row of rows) {
    const key = `${row.category}\u0000${row.ruleId}`;
    const summary = map.get(key) ?? {
      ruleId: row.ruleId,
      family: row.family,
      category: row.category,
      files: [],
      verifiedFailCount: 0,
      categoryPassGapCount: 0,
      scoringCandidateCount: 0,
      gateCandidateCount: 0,
      noisyCount: 0,
      blockedCount: 0,
      diagnosticOnlyCount: 0,
    };
    if (!summary.files.includes(row.fileId)) summary.files.push(row.fileId);
    if (row.status === 'fail' && row.confidence === 'verified') summary.verifiedFailCount += 1;
    if (row.categoryPassGap) summary.categoryPassGapCount += 1;
    if (row.scoringEligible) summary.scoringCandidateCount += 1;
    if (row.gateEligible) summary.gateCandidateCount += 1;
    if (row.noisy) summary.noisyCount += 1;
    if (row.status === 'fail' && !row.scoringEligible && !row.gateEligible) summary.blockedCount += 1;
    if (row.readiness === 'diagnostic_only_optional') summary.diagnosticOnlyCount += 1;
    summary.files.sort((a, b) => a.localeCompare(b));
    map.set(key, summary);
  }
  for (const summary of map.values()) {
    if (
      summary.scoringCandidateCount === 0 &&
      summary.family === 'fonts_cmap' &&
      isFontCmapScoringRule(summary.ruleId) &&
      summary.categoryPassGapCount >= 2
    ) {
      summary.scoringCandidateCount = summary.categoryPassGapCount;
    }
  }
  return [...map.values()].sort(sortRuleSummary);
}

function sortRuleRow(a: PacPromotionRuleRow, b: PacPromotionRuleRow): number {
  return a.family.localeCompare(b.family) ||
    a.category.localeCompare(b.category) ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.fileId.localeCompare(b.fileId);
}

function sortRuleSummary(a: PacPromotionRuleSummary, b: PacPromotionRuleSummary): number {
  return a.family.localeCompare(b.family) ||
    a.category.localeCompare(b.category) ||
    a.ruleId.localeCompare(b.ruleId);
}

function sortPromotionSummary(a: PacPromotionRuleSummary, b: PacPromotionRuleSummary): number {
  return (b.scoringCandidateCount + b.gateCandidateCount) - (a.scoringCandidateCount + a.gateCandidateCount) ||
    b.categoryPassGapCount - a.categoryPassGapCount ||
    sortRuleSummary(a, b);
}

function sortNoiseSummary(a: PacPromotionRuleSummary, b: PacPromotionRuleSummary): number {
  return b.noisyCount - a.noisyCount || sortRuleSummary(a, b);
}

function sortBlockedSummary(a: PacPromotionRuleSummary, b: PacPromotionRuleSummary): number {
  return b.blockedCount - a.blockedCount || sortRuleSummary(a, b);
}

function appendSummaryTable(lines: string[], rows: PacPromotionRuleSummary[], emptyMessage: string): void {
  if (rows.length === 0) {
    lines.push(emptyMessage, '');
    return;
  }
  lines.push('| Family | Category | Rule | Verified fails | Pass gaps | Scoring | Gates | Noisy | Blocked | Files |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const row of rows) {
    lines.push(`| ${row.family} | ${row.category} | \`${row.ruleId}\` | ${row.verifiedFailCount} | ${row.categoryPassGapCount} | ${row.scoringCandidateCount} | ${row.gateCandidateCount} | ${row.noisyCount} | ${row.blockedCount} | ${row.files.slice(0, 8).join(', ')}${row.files.length > 8 ? ', ...' : ''} |`);
  }
  lines.push('');
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/pac-promotion-readiness.ts (--matrix <poc-strong-rule-matrix.json> | --input <pdf-or-dir> [--manifest <manifest.json>]) [--out <dir>] [--limit <n>]';
}

async function listPdfFiles(inputPath: string): Promise<string[]> {
  const absolute = resolve(inputPath);
  const info = await stat(absolute);
  if (info.isFile()) return extname(absolute).toLowerCase() === '.pdf' ? [absolute] : [];
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) out.push(path);
    }
  }
  await walk(absolute);
  return out.sort((a, b) => a.localeCompare(b));
}

function manifestRows(manifest: ManifestLike): unknown[] {
  return manifest.rows ?? manifest.entries ?? manifest.files ?? [];
}

function stringField(row: unknown, keys: string[]): string | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function filesFromManifest(manifestPath: string, inputRoot?: string): Promise<Array<{ id: string; file: string }>> {
  const absoluteManifest = resolve(manifestPath);
  const parsed = JSON.parse(await readFile(absoluteManifest, 'utf8')) as ManifestLike;
  const base = inputRoot ? resolve(inputRoot) : resolve(join(absoluteManifest, '..'));
  return manifestRows(parsed)
    .map((row, index) => {
      const rel = stringField(row, ['absolutePath', 'localFile', 'file', 'path']);
      if (!rel) return null;
      const fallbackId = basename(rel, extname(rel)) || `row-${index + 1}`;
      const id = stringField(row, ['id', 'publicationId', 'title']) ?? fallbackId;
      const file = isAbsolute(rel) ? rel : resolve(base, rel);
      return { id, file };
    })
    .filter((row): row is { id: string; file: string } => row !== null && row.file.toLowerCase().endsWith('.pdf'));
}

async function selectedFiles(): Promise<Array<{ id: string; file: string }>> {
  const input = argValue('--input');
  const manifest = argValue('--manifest');
  if (!input && !manifest) throw new Error(usage());
  const files = manifest
    ? await filesFromManifest(manifest, input)
    : (await listPdfFiles(input!)).map(file => ({ id: basename(file, extname(file)), file }));
  const limit = Number(argValue('--limit') ?? files.length);
  return files.slice(0, Number.isFinite(limit) && limit > 0 ? limit : files.length);
}

function scoreValue(analysis: AnalysisResult): number | null {
  return analysis.scoreProfile?.overallScore ?? analysis.score ?? null;
}

function isPocStrongAreaFileRow(row: unknown): row is PocStrongAreaFileRow {
  return Boolean(
    row &&
    typeof row === 'object' &&
    typeof (row as { id?: unknown }).id === 'string' &&
    typeof (row as { file?: unknown }).file === 'string' &&
    Array.isArray((row as { categories?: unknown }).categories) &&
    Array.isArray((row as { rules?: unknown }).rules),
  );
}

async function rowsFromMatrix(path: string): Promise<PocStrongAreaFileRow[]> {
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8')) as MatrixLike;
  if (!Array.isArray(parsed.files)) throw new Error(`Matrix does not contain a files array: ${path}`);
  return parsed.files.filter(isPocStrongAreaFileRow);
}

async function analyzeSelectedFiles(): Promise<PocStrongAreaFileRow[]> {
  const files = await selectedFiles();
  const rows: PocStrongAreaFileRow[] = [];
  for (const file of files) {
    try {
      const { result, snapshot } = await analyzePdf(file.file, basename(file.file));
      rows.push({
        id: file.id,
        file: file.file,
        score: scoreValue(result),
        grade: result.scoreProfile?.grade ?? result.grade ?? null,
        categories: categorySnapshots(result.categories),
        rules: buildPacRuleEvidence(snapshot).filter(rule => isPocStrongAreaRule(rule.ruleId)),
      });
    } catch (error) {
      rows.push({
        id: file.id,
        file: file.file,
        score: null,
        grade: null,
        categories: [],
        rules: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const matrix = argValue('--matrix');
  const rows = matrix ? await rowsFromMatrix(matrix) : await analyzeSelectedFiles();
  await mkdir(outDir, { recursive: true });
  const summary = buildPacPromotionReadinessSummary(rows);
  await writeFile(join(outDir, 'pac-promotion-readiness.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-promotion-readiness.md'), renderPacPromotionReadinessMarkdown(summary), 'utf8');
  console.log(`Wrote PAC promotion readiness report for ${rows.length} file(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

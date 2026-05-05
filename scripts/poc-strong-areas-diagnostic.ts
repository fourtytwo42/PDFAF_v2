#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { REMEDIATION_CATEGORY_THRESHOLD } from '../src/config.js';
import { buildPacRuleEvidence, type PacRuleEvidence, type PacRuleStatus } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, CategoryKey, ScoredCategory } from '../src/types.js';

const DEFAULT_OUT = 'Output/poc-strong-areas-diagnostic';

const STRONG_AREA_PREFIXES = [
  'pdfua.parent_tree.',
  'pdfua.content.text_',
  'pdfua.content.image_',
  'pdfua.content.artifact_',
  'pdfua.table.header_',
  'pdfua.font.',
  'pdfua.language.alt_text_',
  'pdfua.language.actual_text_',
  'pdfua.language.annotation_contents_',
  'pdfua.language.form_tu_',
  'pdfua.language.outline_',
  'pdfua.language.structure_',
  'wcag.contrast.',
  'pdfua.toc.',
  'pdfua.note.',
  'pdfua.optional_content.',
  'pdfua.filespec.',
  'pdfua.xfa.',
  'pdfua.link.uri_',
  'pdfua.ai.',
];

const GATE_CANDIDATE_PREFIXES = [
  'pdfua.parent_tree.',
  'pdfua.content.',
  'pdfua.table.header_',
];

export interface StrongAreaCategorySnapshot {
  key: CategoryKey;
  score: number | null;
  applicable: boolean;
}

export interface PocStrongAreaFileRow {
  id: string;
  file: string;
  score: number | null;
  grade: string | null;
  categories: StrongAreaCategorySnapshot[];
  rules: PacRuleEvidence[];
  error?: string;
}

export interface PocStrongAreaPromotionCandidate {
  fileId: string;
  file: string;
  category: CategoryKey;
  categoryScore: number | null;
  ruleId: string;
  status: PacRuleEvidence['status'];
  confidence: PacRuleEvidence['confidence'];
  classification: 'scoring_candidate' | 'gate_candidate' | 'diagnostic_only';
  message: string;
}

export interface PocStrongAreaSummary {
  generatedAt: string;
  fileCount: number;
  statusDistribution: Record<PacRuleStatus, number>;
  categoryPassPacFailGaps: PocStrongAreaPromotionCandidate[];
  noisyEvidence: PocStrongAreaPromotionCandidate[];
  promotionCandidates: PocStrongAreaPromotionCandidate[];
}

interface ManifestLike {
  rows?: unknown[];
  entries?: unknown[];
  files?: unknown[];
}

function emptyStatusCounts(): Record<PacRuleStatus, number> {
  return { pass: 0, warn: 0, fail: 0, not_applicable: 0 };
}

export function isPocStrongAreaRule(ruleId: string): boolean {
  return STRONG_AREA_PREFIXES.some(prefix => ruleId.startsWith(prefix));
}

export function categorySnapshots(categories: ScoredCategory[]): StrongAreaCategorySnapshot[] {
  return categories.map(category => ({
    key: category.key,
    score: typeof category.score === 'number' ? category.score : null,
    applicable: category.applicable !== false,
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function categoryForRule(rule: PacRuleEvidence, categories: StrongAreaCategorySnapshot[]): StrongAreaCategorySnapshot | undefined {
  return categories.find(category => category.key === rule.category);
}

export function classifyPocStrongAreaRule(
  rule: PacRuleEvidence,
  categories: StrongAreaCategorySnapshot[],
): PocStrongAreaPromotionCandidate['classification'] {
  if (rule.status !== 'fail') return 'diagnostic_only';
  const category = categoryForRule(rule, categories);
  const passingCategory = Boolean(
    category &&
    category.applicable &&
    typeof category.score === 'number' &&
    category.score >= REMEDIATION_CATEGORY_THRESHOLD,
  );
  if (rule.confidence === 'verified' && passingCategory) return 'scoring_candidate';
  if (rule.confidence === 'verified' && GATE_CANDIDATE_PREFIXES.some(prefix => rule.ruleId.startsWith(prefix))) {
    return 'gate_candidate';
  }
  return 'diagnostic_only';
}

export function buildPocStrongAreaSummary(rows: PocStrongAreaFileRow[]): PocStrongAreaSummary {
  const statusDistribution = emptyStatusCounts();
  const gaps: PocStrongAreaPromotionCandidate[] = [];
  const noisy: PocStrongAreaPromotionCandidate[] = [];
  const promotion: PocStrongAreaPromotionCandidate[] = [];

  for (const file of rows) {
    for (const rule of file.rules.filter(row => isPocStrongAreaRule(row.ruleId))) {
      statusDistribution[rule.status] += 1;
      const category = categoryForRule(rule, file.categories);
      const candidate: PocStrongAreaPromotionCandidate = {
        fileId: file.id,
        file: file.file,
        category: rule.category,
        categoryScore: category?.score ?? null,
        ruleId: rule.ruleId,
        status: rule.status,
        confidence: rule.confidence,
        classification: classifyPocStrongAreaRule(rule, file.categories),
        message: rule.message,
      };
      if (
        rule.status === 'fail' &&
        category?.applicable &&
        typeof category.score === 'number' &&
        category.score >= REMEDIATION_CATEGORY_THRESHOLD
      ) {
        gaps.push(candidate);
      }
      if (rule.status === 'warn' || rule.confidence !== 'verified') noisy.push(candidate);
      if (candidate.classification !== 'diagnostic_only') promotion.push(candidate);
    }
  }

  const sortCandidate = (a: PocStrongAreaPromotionCandidate, b: PocStrongAreaPromotionCandidate) =>
    a.category.localeCompare(b.category) ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.fileId.localeCompare(b.fileId);
  gaps.sort(sortCandidate);
  noisy.sort(sortCandidate);
  promotion.sort(sortCandidate);

  return {
    generatedAt: new Date().toISOString(),
    fileCount: rows.length,
    statusDistribution,
    categoryPassPacFailGaps: gaps,
    noisyEvidence: noisy,
    promotionCandidates: promotion,
  };
}

export function renderPocStrongAreaMarkdown(summary: PocStrongAreaSummary): string {
  const lines = [
    '# POC Strong-Area Diagnostic',
    '',
    `Generated: \`${summary.generatedAt}\``,
    `Files: ${summary.fileCount}`,
    '',
    '## Status Distribution',
    '',
    '| Status | Count |',
    '| --- | ---: |',
    ...Object.entries(summary.statusDistribution).map(([status, count]) => `| ${status} | ${count} |`),
    '',
    '## Category-Pass / PAC-Fail Gaps',
    '',
  ];
  appendCandidateTable(lines, summary.categoryPassPacFailGaps, 'No strong-area category-pass / PAC-fail gaps found.');
  lines.push('## Promotion Candidates', '');
  appendCandidateTable(lines, summary.promotionCandidates, 'No scoring or gate candidates found. Repairs remain diagnostic-only.');
  lines.push('## Noisy Or Incomplete Evidence', '');
  appendCandidateTable(lines, summary.noisyEvidence, 'No warning or non-verified strong-area evidence found.');
  return `${lines.join('\n')}\n`;
}

function appendCandidateTable(lines: string[], rows: PocStrongAreaPromotionCandidate[], emptyMessage: string): void {
  if (rows.length === 0) {
    lines.push(emptyMessage, '');
    return;
  }
  lines.push('| File | Category | Score | Rule | Status | Confidence | Classification | Message |');
  lines.push('| --- | --- | ---: | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| ${row.fileId} | ${row.category} | ${row.categoryScore ?? ''} | \`${row.ruleId}\` | ${row.status} | ${row.confidence} | ${row.classification} | ${row.message.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/poc-strong-areas-diagnostic.ts --input <pdf-or-dir> [--manifest <manifest.json>] [--out <dir>] [--limit <n>]';
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

async function main(): Promise<void> {
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const files = await selectedFiles();
  await mkdir(outDir, { recursive: true });
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
  const summary = buildPocStrongAreaSummary(rows);
  await writeFile(join(outDir, 'poc-strong-rule-matrix.json'), `${JSON.stringify({ generatedAt: summary.generatedAt, files: rows }, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'poc-strong-rule-summary.md'), renderPocStrongAreaMarkdown(summary), 'utf8');
  console.log(`Wrote POC strong-area diagnostic for ${rows.length} file(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

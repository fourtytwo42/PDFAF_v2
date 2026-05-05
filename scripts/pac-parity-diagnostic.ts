#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { REMEDIATION_CATEGORY_THRESHOLD } from '../src/config.js';
import { buildPacRuleEvidence, type PacRuleEvidence, type PacRuleStatus } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, CategoryKey, ScoredCategory } from '../src/types.js';

const DEFAULT_OUT = 'Output/pac-parity-diagnostic';

export interface PacParityCategorySnapshot {
  key: CategoryKey;
  score: number | null;
  applicable: boolean;
}

export interface PacParityFileRow {
  id: string;
  file: string;
  score: number | null;
  grade: string | null;
  pdfClass: string | null;
  pageCount: number | null;
  categories: PacParityCategorySnapshot[];
  rules: PacRuleEvidence[];
  error?: string;
}

export interface PacParityRuleSummary {
  ruleId: string;
  category: CategoryKey;
  pass: number;
  warn: number;
  fail: number;
  not_applicable: number;
  noisy: boolean;
}

export interface PacParityCategoryGap {
  fileId: string;
  file: string;
  category: CategoryKey;
  categoryScore: number;
  ruleId: string;
  message: string;
  confidence: PacRuleEvidence['confidence'];
}

export interface PacParitySummary {
  generatedAt: string;
  fileCount: number;
  statusDistribution: Record<PacRuleStatus, number>;
  categoryDistribution: Record<CategoryKey, Record<PacRuleStatus, number>>;
  ruleSummaries: PacParityRuleSummary[];
  categoryPassPacFailGaps: PacParityCategoryGap[];
  noisyRules: PacParityRuleSummary[];
}

interface ManifestLike {
  rows?: unknown[];
  entries?: unknown[];
  files?: unknown[];
}

function emptyStatusCounts(): Record<PacRuleStatus, number> {
  return { pass: 0, warn: 0, fail: 0, not_applicable: 0 };
}

export function categorySnapshots(categories: ScoredCategory[]): PacParityCategorySnapshot[] {
  return categories.map(category => ({
    key: category.key,
    score: typeof category.score === 'number' ? category.score : null,
    applicable: category.applicable !== false,
  }));
}

export function isCategoryPassPacFailGap(
  rule: PacRuleEvidence,
  categories: PacParityCategorySnapshot[],
): boolean {
  if (rule.status !== 'fail') return false;
  const category = categories.find(row => row.key === rule.category);
  return Boolean(
    category &&
    category.applicable &&
    typeof category.score === 'number' &&
    category.score >= REMEDIATION_CATEGORY_THRESHOLD,
  );
}

export function buildPacParitySummary(rows: PacParityFileRow[]): PacParitySummary {
  const statusDistribution = emptyStatusCounts();
  const categoryDistribution = {} as Record<CategoryKey, Record<PacRuleStatus, number>>;
  const byRule = new Map<string, PacParityRuleSummary>();
  const gaps: PacParityCategoryGap[] = [];

  for (const file of rows) {
    for (const rule of file.rules) {
      statusDistribution[rule.status] += 1;
      categoryDistribution[rule.category] ??= emptyStatusCounts();
      categoryDistribution[rule.category][rule.status] += 1;

      const existing = byRule.get(rule.ruleId) ?? {
        ruleId: rule.ruleId,
        category: rule.category,
        pass: 0,
        warn: 0,
        fail: 0,
        not_applicable: 0,
        noisy: false,
      };
      existing[rule.status] += 1;
      existing.noisy ||= rule.status === 'warn' || rule.confidence !== 'verified';
      byRule.set(rule.ruleId, existing);

      if (isCategoryPassPacFailGap(rule, file.categories)) {
        const category = file.categories.find(row => row.key === rule.category)!;
        gaps.push({
          fileId: file.id,
          file: file.file,
          category: rule.category,
          categoryScore: category.score!,
          ruleId: rule.ruleId,
          message: rule.message,
          confidence: rule.confidence,
        });
      }
    }
  }

  const ruleSummaries = [...byRule.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.ruleId.localeCompare(b.ruleId)
  );
  gaps.sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.fileId.localeCompare(b.fileId)
  );

  return {
    generatedAt: new Date().toISOString(),
    fileCount: rows.length,
    statusDistribution,
    categoryDistribution,
    ruleSummaries,
    categoryPassPacFailGaps: gaps,
    noisyRules: ruleSummaries.filter(rule => rule.noisy),
  };
}

export function renderPacParityMarkdown(summary: PacParitySummary): string {
  const lines = [
    '# PAC Rule Evidence Diagnostic',
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
    '## Category Pass / PAC Fail Gaps',
    '',
  ];
  if (summary.categoryPassPacFailGaps.length === 0) {
    lines.push('No category-pass / PAC-fail gaps found.', '');
  } else {
    lines.push('| File | Category | Score | Rule | Confidence | Message |');
    lines.push('| --- | --- | ---: | --- | --- | --- |');
    for (const gap of summary.categoryPassPacFailGaps) {
      lines.push(`| ${gap.fileId} | ${gap.category} | ${gap.categoryScore} | \`${gap.ruleId}\` | ${gap.confidence} | ${gap.message.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }

  lines.push('## Noisy Or Incomplete Rules', '');
  if (summary.noisyRules.length === 0) {
    lines.push('No warning or non-verified rules found.', '');
  } else {
    lines.push('| Rule | Category | Fail | Warn | Pass | N/A |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
    for (const rule of summary.noisyRules) {
      lines.push(`| \`${rule.ruleId}\` | ${rule.category} | ${rule.fail} | ${rule.warn} | ${rule.pass} | ${rule.not_applicable} |`);
    }
    lines.push('');
  }

  lines.push('## Rule Matrix Summary', '');
  lines.push('| Rule | Category | Fail | Warn | Pass | N/A |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const rule of summary.ruleSummaries) {
    lines.push(`| \`${rule.ruleId}\` | ${rule.category} | ${rule.fail} | ${rule.warn} | ${rule.pass} | ${rule.not_applicable} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/pac-parity-diagnostic.ts --input <pdf-or-dir> [--manifest <manifest.json>] [--out <dir>] [--limit <n>]`;
}

async function listPdfFiles(inputPath: string): Promise<string[]> {
  const absolute = resolve(inputPath);
  const info = await stat(absolute);
  if (info.isFile()) return extname(absolute).toLowerCase() === '.pdf' ? [absolute] : [];
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
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
  const rows: PacParityFileRow[] = [];
  for (const file of files) {
    try {
      const { result, snapshot } = await analyzePdf(file.file, basename(file.file));
      rows.push({
        id: file.id,
        file: file.file,
        score: scoreValue(result),
        grade: result.scoreProfile?.grade ?? result.grade ?? null,
        pdfClass: result.pdfClass ?? null,
        pageCount: result.pageCount ?? null,
        categories: categorySnapshots(result.categories),
        rules: buildPacRuleEvidence(snapshot),
      });
    } catch (error) {
      rows.push({
        id: file.id,
        file: file.file,
        score: null,
        grade: null,
        pdfClass: null,
        pageCount: null,
        categories: [],
        rules: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const summary = buildPacParitySummary(rows);
  await writeFile(join(outDir, 'pac-rule-matrix.json'), `${JSON.stringify({ generatedAt: summary.generatedAt, files: rows }, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-rule-summary.md'), renderPacParityMarkdown(summary), 'utf8');
  console.log(`Wrote PAC parity diagnostic for ${rows.length} file(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

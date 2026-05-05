#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  shouldTryStage5PacCatalogSettings,
  stage5CategoryPassedPacFailed,
  stage5PacCatalogGaps,
  type Stage5PacCatalogGap,
} from '../src/services/remediation/stage5PacCatalogSettings.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const DEFAULT_OUT = 'Output/pac-gap-fix-diagnostic';

export interface PacGapFixFileRow {
  id: string;
  file: string;
  score: number | null;
  grade: string | null;
  gaps: Stage5PacCatalogGap[];
  categoryPassedPacFailed: Stage5PacCatalogGap[];
  stage5CatalogSettingsApplicable: boolean;
  error?: string;
}

export interface PacGapFixSummary {
  generatedAt: string;
  fileCount: number;
  candidateCount: number;
  fixableByRule: Record<string, number>;
  rows: PacGapFixFileRow[];
}

interface ManifestLike {
  rows?: unknown[];
  entries?: unknown[];
  files?: unknown[];
}

export function buildPacGapFixRow(input: {
  id: string;
  file: string;
  analysis: Pick<AnalysisResult, 'score' | 'grade' | 'categories'>;
  snapshot: DocumentSnapshot;
}): PacGapFixFileRow {
  const analysis = input.analysis as AnalysisResult;
  const gaps = stage5PacCatalogGaps(analysis, input.snapshot)
    .sort((a, b) => a.category.localeCompare(b.category) || a.ruleId.localeCompare(b.ruleId));
  const categoryPassedPacFailed = stage5CategoryPassedPacFailed(analysis, input.snapshot);
  return {
    id: input.id,
    file: input.file,
    score: input.analysis.score,
    grade: input.analysis.grade,
    gaps,
    categoryPassedPacFailed,
    stage5CatalogSettingsApplicable: shouldTryStage5PacCatalogSettings(analysis, input.snapshot),
  };
}

export function buildPacGapFixSummary(rows: PacGapFixFileRow[]): PacGapFixSummary {
  const fixableByRule: Record<string, number> = {};
  for (const row of rows) {
    for (const gap of row.gaps) {
      if (!gap.fixable) continue;
      fixableByRule[gap.ruleId] = (fixableByRule[gap.ruleId] ?? 0) + 1;
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    fileCount: rows.length,
    candidateCount: rows.filter(row => row.stage5CatalogSettingsApplicable).length,
    fixableByRule: Object.fromEntries(Object.entries(fixableByRule).sort(([a], [b]) => a.localeCompare(b))),
    rows: [...rows].sort((a, b) =>
      Number(b.stage5CatalogSettingsApplicable) - Number(a.stage5CatalogSettingsApplicable) ||
      b.categoryPassedPacFailed.length - a.categoryPassedPacFailed.length ||
      a.id.localeCompare(b.id)
    ),
  };
}

export function renderPacGapFixMarkdown(summary: PacGapFixSummary): string {
  const lines = [
    '# PAC Gap Fix Diagnostic',
    '',
    `Generated: \`${summary.generatedAt}\``,
    `Files: ${summary.fileCount}`,
    `Stage 5 catalog-settings candidates: ${summary.candidateCount}`,
    '',
    '## Fixable Gaps By Rule',
    '',
    '| Rule | Count |',
    '| --- | ---: |',
  ];
  const byRule = Object.entries(summary.fixableByRule);
  if (byRule.length === 0) {
    lines.push('| none | 0 |');
  } else {
    for (const [ruleId, count] of byRule) {
      lines.push(`| \`${ruleId}\` | ${count} |`);
    }
  }
  lines.push('', '## Candidate Files', '');
  lines.push('| File | Score | Applicable | Category-pass/PAC-fail | Gaps |');
  lines.push('| --- | ---: | --- | ---: | --- |');
  for (const row of summary.rows.filter(row => row.gaps.length > 0)) {
    const gaps = row.gaps.map(gap => `${gap.ruleId}(${gap.category}:${gap.categoryScore ?? 'n/a'})`).join('<br>');
    lines.push(`| ${row.id} | ${row.score ?? 'n/a'} ${row.grade ?? ''} | ${row.stage5CatalogSettingsApplicable ? 'yes' : 'no'} | ${row.categoryPassedPacFailed.length} | ${gaps.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/pac-gap-fix-diagnostic.ts --input <pdf-or-dir> [--manifest <manifest.json>] [--out <dir>] [--limit <n>]';
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
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') out.push(path);
    }
  }
  await walk(absolute);
  return out.sort();
}

async function filesFromManifest(path: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as ManifestLike;
  const rows = manifest.rows ?? manifest.entries ?? manifest.files ?? [];
  return rows
    .map(row => {
      if (typeof row === 'string') return row;
      if (!row || typeof row !== 'object') return null;
      const obj = row as Record<string, unknown>;
      return obj['file'] ?? obj['path'] ?? obj['pdf'] ?? obj['input'];
    })
    .filter((value): value is string => typeof value === 'string' && value.toLowerCase().endsWith('.pdf'));
}

async function main(): Promise<void> {
  const input = argValue('--input');
  if (!input) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const manifest = argValue('--manifest');
  const limit = Number.parseInt(argValue('--limit') ?? '0', 10);
  const files = (manifest ? await filesFromManifest(manifest) : await listPdfFiles(input))
    .map(file => resolve(file))
    .slice(0, limit > 0 ? limit : undefined);

  await mkdir(outDir, { recursive: true });
  const rows: PacGapFixFileRow[] = [];
  for (const file of files) {
    const id = basename(file, extname(file));
    try {
      const { result, snapshot } = await analyzePdf(file, basename(file));
      rows.push(buildPacGapFixRow({ id, file, analysis: result, snapshot }));
    } catch (error) {
      rows.push({
        id,
        file,
        score: null,
        grade: null,
        gaps: [],
        categoryPassedPacFailed: [],
        stage5CatalogSettingsApplicable: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = buildPacGapFixSummary(rows);
  await writeFile(join(outDir, 'pac-gap-fix-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-gap-fix-summary.md'), renderPacGapFixMarkdown(summary), 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

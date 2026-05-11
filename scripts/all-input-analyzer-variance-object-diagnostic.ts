#!/usr/bin/env tsx
import 'dotenv/config';

import { readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const DEFAULT_INPUT_ROOT = 'Input';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/analyzer-variance-object-diagnostic-2026-05-11-r1';
const DEFAULT_IDS = ['4567', '4139', '4693'];
const DEFAULT_REPEATS = 3;

type Classification =
  | 'stable_source_analysis'
  | 'heading_object_variance'
  | 'figure_alt_object_variance'
  | 'table_object_variance'
  | 'parenttree_or_tagging_variance'
  | 'mixed_object_variance'
  | 'score_variance_without_object_identity';

interface ObjectMetrics {
  score: number;
  grade: string;
  heading: number | null;
  alt: number | null;
  table: number | null;
  pdfua: number | null;
  reading: number | null;
  pageCount: number | null;
  textCharCount: number | null;
  isTagged: boolean | null;
  headingCount: number;
  rootReachableHeadingCount: number | null;
  paragraphStructElemCount: number | null;
  tableCount: number;
  checkerVisibleFigureCount: number | null;
  checkerVisibleFigureAltCount: number | null;
  orphanMcidCount: number | null;
  parentTreeMissingMcidEntries: number | null;
  tableHeaderDebt: number | null;
  irregularTableCount: number | null;
  stronglyIrregularTableCount: number | null;
}

interface RowReport {
  id: string;
  pdf: string | null;
  repeats: ObjectMetrics[];
  scoreRange: number;
  varyingFamilies: string[];
  classification: Classification;
  recommendation: string;
}

interface Report {
  generatedAt: string;
  inputRoot: string;
  repeats: number;
  rows: RowReport[];
}

function parseArgs(argv: string[]): { inputRoot: string; out: string; ids: string[]; repeats: number } {
  const args = { inputRoot: DEFAULT_INPUT_ROOT, out: DEFAULT_OUT, ids: [] as string[], repeats: DEFAULT_REPEATS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--input-root' && next) {
      args.inputRoot = next;
      index += 1;
    } else if (arg === '--out' && next) {
      args.out = next;
      index += 1;
    } else if (arg === '--id' && next) {
      args.ids.push(next);
      index += 1;
    } else if (arg === '--repeats' && next) {
      args.repeats = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm exec tsx scripts/all-input-analyzer-variance-object-diagnostic.ts [--input-root <dir>] [--out <dir>] [--id <id>]... [--repeats <n>]');
      process.exit(0);
    }
  }
  return {
    inputRoot: resolve(args.inputRoot),
    out: resolve(args.out),
    ids: args.ids.length > 0 ? args.ids : DEFAULT_IDS,
    repeats: Number.isFinite(args.repeats) && args.repeats > 0 ? args.repeats : DEFAULT_REPEATS,
  };
}

async function listPdfs(root: string): Promise<string[]> {
  const entries = await readdir(root).catch(() => []);
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    const info = await stat(path).catch(() => null);
    if (!info) continue;
    if (info.isDirectory()) out.push(...await listPdfs(path));
    else if (entry.toLowerCase().endsWith('.pdf')) out.push(path);
  }
  return out;
}

function categoryScore(result: AnalysisResult, key: string): number | null {
  return result.categories.find(category => category.key === key)?.score ?? null;
}

function metrics(result: AnalysisResult, snapshot: DocumentSnapshot): ObjectMetrics {
  const audit = snapshot.tableHeaderAudit;
  return {
    score: result.score,
    grade: result.grade,
    heading: categoryScore(result, 'heading_structure'),
    alt: categoryScore(result, 'alt_text'),
    table: categoryScore(result, 'table_markup'),
    pdfua: categoryScore(result, 'pdf_ua_compliance'),
    reading: categoryScore(result, 'reading_order'),
    pageCount: snapshot.pageCount ?? null,
    textCharCount: snapshot.textCharCount ?? null,
    isTagged: snapshot.isTagged ?? null,
    headingCount: snapshot.headings.length,
    rootReachableHeadingCount: snapshot.detectionProfile?.headingSignals.rootReachableHeadingCount ?? null,
    paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? null,
    tableCount: snapshot.tables.length,
    checkerVisibleFigureCount: snapshot.figureAltAudit?.checkerVisibleFigureCount ?? null,
    checkerVisibleFigureAltCount: snapshot.figureAltAudit?.checkerVisibleFigureAltCount ?? null,
    orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? null,
    parentTreeMissingMcidEntries: snapshot.parentTreeAudit?.missingMcidParentTreeEntries ?? null,
    tableHeaderDebt: audit
      ? (audit.headerAssociationMissingCount ?? 0) + (audit.dataCellsWithoutHeaderCount ?? 0) + (audit.orphanHeaderCellCount ?? 0)
      : null,
    irregularTableCount: snapshot.detectionProfile?.tableSignals.irregularTableCount ?? null,
    stronglyIrregularTableCount: snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? null,
  };
}

function range(values: Array<number | null | boolean>): number {
  const normalized = values
    .map(value => typeof value === 'boolean' ? Number(value) : value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (normalized.length === 0) return 0;
  return Math.max(...normalized) - Math.min(...normalized);
}

export function classifyAnalyzerVariance(repeats: ObjectMetrics[]): Pick<RowReport, 'scoreRange' | 'varyingFamilies' | 'classification' | 'recommendation'> {
  const scoreRange = range(repeats.map(row => row.score));
  const families: string[] = [];
  if (range(repeats.map(row => row.heading)) > 0 || range(repeats.map(row => row.headingCount)) > 0 || range(repeats.map(row => row.rootReachableHeadingCount)) > 0) families.push('heading');
  if (range(repeats.map(row => row.alt)) > 0 || range(repeats.map(row => row.checkerVisibleFigureCount)) > 0 || range(repeats.map(row => row.checkerVisibleFigureAltCount)) > 0) families.push('figure_alt');
  if (range(repeats.map(row => row.table)) > 0 || range(repeats.map(row => row.tableCount)) > 0 || range(repeats.map(row => row.irregularTableCount)) > 0 || range(repeats.map(row => row.stronglyIrregularTableCount)) > 0) families.push('table');
  if (range(repeats.map(row => row.pdfua)) > 0 || range(repeats.map(row => row.orphanMcidCount)) > 0 || range(repeats.map(row => row.parentTreeMissingMcidEntries)) > 0) families.push('parenttree_or_tagging');
  if (scoreRange <= 2 && families.length === 0) {
    return {
      scoreRange,
      varyingFamilies: families,
      classification: 'stable_source_analysis',
      recommendation: 'Source analysis is stable enough; investigate remediation routing instead.',
    };
  }
  if (families.length > 1) {
    return {
      scoreRange,
      varyingFamilies: families,
      classification: 'mixed_object_variance',
      recommendation: 'Do not add a row guard; design analyzer evidence stabilization or rerun object-level extraction with stronger identity keys.',
    };
  }
  const family = families[0];
  if (family === 'heading') return { scoreRange, varyingFamilies: families, classification: 'heading_object_variance', recommendation: 'Inspect heading/root-reachability extraction before remediation behavior.' };
  if (family === 'figure_alt') return { scoreRange, varyingFamilies: families, classification: 'figure_alt_object_variance', recommendation: 'Inspect checker-visible figure/Alt extraction before remediation behavior.' };
  if (family === 'table') return { scoreRange, varyingFamilies: families, classification: 'table_object_variance', recommendation: 'Inspect table object identity and regularity extraction before remediation behavior.' };
  if (family === 'parenttree_or_tagging') return { scoreRange, varyingFamilies: families, classification: 'parenttree_or_tagging_variance', recommendation: 'Inspect ParentTree/tagged-content extraction before remediation behavior.' };
  return {
    scoreRange,
    varyingFamilies: families,
    classification: 'score_variance_without_object_identity',
    recommendation: 'Score varies without captured object metrics; add deeper snapshot fields before behavior.',
  };
}

function findPdf(id: string, pdfs: string[]): string | null {
  const exact = pdfs.find(path => new RegExp(`(?:^|[^0-9])${id}(?:[^0-9]|$)`).test(path));
  return exact ?? null;
}

async function buildReport(input: { inputRoot: string; ids: string[]; repeats: number }): Promise<Report> {
  const pdfs = await listPdfs(input.inputRoot);
  const rows: RowReport[] = [];
  for (const id of input.ids) {
    const pdf = findPdf(id, pdfs);
    if (!pdf) {
      rows.push({
        id,
        pdf: null,
        repeats: [],
        scoreRange: 0,
        varyingFamilies: [],
        classification: 'score_variance_without_object_identity',
        recommendation: 'PDF not found under input root.',
      });
      continue;
    }
    const repeats: ObjectMetrics[] = [];
    for (let repeat = 0; repeat < input.repeats; repeat += 1) {
      const analyzed = await analyzePdf(pdf, pdf, {
        bypassCache: true,
        timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
      });
      repeats.push(metrics(analyzed.result, analyzed.snapshot));
    }
    rows.push({
      id,
      pdf,
      repeats,
      ...classifyAnalyzerVariance(repeats),
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    inputRoot: input.inputRoot,
    repeats: input.repeats,
    rows,
  };
}

function render(report: Report): string {
  const lines: string[] = [];
  lines.push('# All-Input Analyzer Variance Object Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Input root: \`${report.inputRoot}\``);
  lines.push(`- Repeats per row: ${report.repeats}`);
  lines.push('');
  lines.push('| ID | Scores | Families | Classification | Recommendation |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| \`${row.id}\` | ${row.repeats.map(repeat => `${repeat.score}/${repeat.grade}`).join(', ') || 'missing'} | ${row.varyingFamilies.join(', ') || 'none'} | \`${row.classification}\` | ${row.recommendation} |`);
  }
  for (const row of report.rows) {
    lines.push('');
    lines.push(`## ${row.id}`);
    lines.push('');
    lines.push(row.pdf ? `PDF: \`${row.pdf}\`` : 'PDF: not found');
    lines.push('');
    if (row.repeats.length === 0) continue;
    lines.push('| Repeat | Score | Heading | Alt | Table | PDF/UA | Reading | Headings | Root headings | Figures/Alt | Tables | Orphans | ParentTree missing MCIDs |');
    lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |');
    row.repeats.forEach((repeat, index) => {
      lines.push(`| ${index + 1} | ${repeat.score}/${repeat.grade} | ${repeat.heading ?? 'n/a'} | ${repeat.alt ?? 'n/a'} | ${repeat.table ?? 'n/a'} | ${repeat.pdfua ?? 'n/a'} | ${repeat.reading ?? 'n/a'} | ${repeat.headingCount} | ${repeat.rootReachableHeadingCount ?? 'n/a'} | ${repeat.checkerVisibleFigureAltCount ?? 'n/a'}/${repeat.checkerVisibleFigureCount ?? 'n/a'} | ${repeat.tableCount} | ${repeat.orphanMcidCount ?? 'n/a'} | ${repeat.parentTreeMissingMcidEntries ?? 'n/a'} |`);
    });
  }
  lines.push('');
  lines.push('Diagnostic only. Do not use analyzer-volatile rows for remediation guards until the object evidence is stable or a quality-preserving analyzer design is proven.');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport(args);
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'analyzer-variance-object-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.out, 'analyzer-variance-object-diagnostic.md'), render(report), 'utf8');
  console.log(`Wrote ${join(args.out, 'analyzer-variance-object-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

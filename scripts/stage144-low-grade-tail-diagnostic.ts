#!/usr/bin/env tsx
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage129OcrPageShell,
  type Stage129OcrPageShellClass,
} from '../src/services/remediation/ocrPageShellHeading.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

type TailClass =
  | 'ocr_page_shell_reading_order_candidate'
  | 'figure_alt_mixed_tail'
  | 'native_zero_heading_or_reading_order'
  | 'table_link_annotation_tail'
  | 'analyzer_volatility'
  | 'no_safe_candidate';

interface Args {
  csvPath: string;
  runDir?: string;
  outDir: string;
  ids: string[];
}

interface CsvRow {
  corpus: string;
  sourceFolder: string;
  id: string;
  file: string;
  beforeScore: number;
  beforeGrade: string;
  afterScore: number;
  afterGrade: string;
  falsePositiveAppliedCount: number;
  runtimeMs: number;
}

interface BenchmarkRow {
  id: string;
  publicationId?: string;
  file?: string;
  afterCategories?: AnalysisResult['categories'];
  reanalyzedCategories?: AnalysisResult['categories'];
  afterDetectionProfile?: unknown;
  reanalyzedDetectionProfile?: unknown;
  afterPdfClass?: string;
  reanalyzedPdfClass?: string;
  appliedTools?: Array<{ toolName: string; outcome: string; details?: string; delta?: number }>;
}

interface DiagnosticRow {
  id: string;
  file: string;
  sourceFolder: string;
  after: string;
  classification: TailClass;
  reasons: string[];
  ocrClassification?: Stage129OcrPageShellClass;
  lowCategories: Record<string, number>;
  ocrShape?: {
    pdfClass: string;
    textCharCount: number;
    pageCount: number;
    structureTreeDepth: number | null;
    paragraphStructElemCount: number;
    mcidTextSpanCount: number;
    engineAppliedOcr: boolean;
    engineTaggedOcrText: boolean;
  };
  acceptedTools: string[];
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage144-low-grade-tail-diagnostic.ts [options]

Options:
  --csv <path>     Combined current-engine grades CSV
  --run <dir>      Optional benchmark run directory with remediated PDFs/results
  --out <dir>      Output directory
  --id <id>        Row id/publication id to inspect; repeatable
  --ids <csv>      Comma-separated ids`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  let csvPath = 'Output/v1-all-current-2026-04-27/current-engine-grades.csv';
  let runDir = '';
  let outDir = 'Output/v1-all-current-2026-04-27/stage144-low-grade-tail-diagnostic';
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--csv') csvPath = argv[++i] ?? csvPath;
    else if (arg === '--run') runDir = argv[++i] ?? '';
    else if (arg === '--out') outDir = argv[++i] ?? outDir;
    else if (arg === '--id') ids.push(argv[++i] ?? '');
    else if (arg === '--ids') ids.push(...(argv[++i] ?? '').split(',').map(value => value.trim()).filter(Boolean));
    else throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }
  return {
    csvPath: resolve(csvPath),
    runDir: runDir ? resolve(runDir) : undefined,
    outDir: resolve(outDir),
    ids,
  };
}

function parseCsv(text: string): CsvRow[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const header = (headerLine ?? '').split(',');
  return lines.map(line => {
    const values = line.split(',');
    const row = Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
    return {
      corpus: row['corpus'] ?? '',
      sourceFolder: row['sourceFolder'] ?? '',
      id: row['id'] ?? '',
      file: row['file'] ?? '',
      beforeScore: Number(row['beforeScore'] ?? 0),
      beforeGrade: row['beforeGrade'] ?? '',
      afterScore: Number(row['afterScore'] ?? 0),
      afterGrade: row['afterGrade'] ?? '',
      falsePositiveAppliedCount: Number(row['falsePositiveAppliedCount'] ?? 0),
      runtimeMs: Number(row['runtimeMs'] ?? 0),
    };
  });
}

function score(categories: AnalysisResult['categories'] | undefined, key: string): number {
  return categories?.find(category => category.key === key)?.score ?? 100;
}

function lowCategories(categories: AnalysisResult['categories'] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? [])
    .filter(category => typeof category.score === 'number' && category.score < 80)
    .map(category => [category.key, category.score]));
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function findRemediatedPdf(runDir: string, id: string): Promise<string | null> {
  const names = await readdir(runDir).catch(() => []);
  const bare = id.replace(/^v1-all-/, '').replace(/^all-/, '');
  const candidates = names.filter(name =>
    name.endsWith('.remediated.pdf') &&
    (name.startsWith(`${id}-`) || name.includes(`-${bare.slice(0, 4)}-`) || name.startsWith(`${bare.slice(0, 4)}-`)),
  );
  return candidates.sort()[0] ? join(runDir, candidates.sort()[0]!) : null;
}

function rowMatches(row: CsvRow, ids: string[]): boolean {
  if (ids.length === 0) return true;
  return ids.some(id => row.id.includes(id) || row.file.includes(id));
}

function classifyStatic(row: CsvRow, benchmark?: BenchmarkRow | null): { classification: TailClass; reasons: string[] } {
  const categories = benchmark?.reanalyzedCategories ?? benchmark?.afterCategories;
  const lows = lowCategories(categories);
  if (row.afterGrade === 'A' || row.afterGrade === 'B') return { classification: 'no_safe_candidate', reasons: ['already_ab'] };
  if (/manual_scanned/i.test(row.file) || /manual_scanned/i.test(row.sourceFolder)) {
    return { classification: 'ocr_page_shell_reading_order_candidate', reasons: ['manual_scanned_tail'] };
  }
  const afterScore = (benchmark as { afterScore?: number } | undefined)?.afterScore ?? row.afterScore;
  const reanalyzedScore = (benchmark as { reanalyzedScore?: number } | undefined)?.reanalyzedScore ?? row.afterScore;
  if (Math.abs(afterScore - reanalyzedScore) >= 10) {
    return { classification: 'analyzer_volatility', reasons: ['after_reanalyzed_score_delta'] };
  }
  if ((lows['alt_text'] ?? 100) < 80 || /figure_alt|figure-/.test(row.file)) {
    return { classification: 'figure_alt_mixed_tail', reasons: ['alt_or_figure_tail'] };
  }
  if ((lows['table_markup'] ?? 100) < 80 || (lows['link_quality'] ?? 100) < 80 || /table_link_annotation/.test(row.file)) {
    return { classification: 'table_link_annotation_tail', reasons: ['table_or_link_tail'] };
  }
  if ((lows['heading_structure'] ?? 100) < 80 || (lows['reading_order'] ?? 100) < 80) {
    return { classification: 'native_zero_heading_or_reading_order', reasons: ['heading_or_reading_tail'] };
  }
  return { classification: 'no_safe_candidate', reasons: ['no_matching_tail_rule'] };
}

function renderMarkdown(report: { rows: DiagnosticRow[]; distribution: Record<string, number> }): string {
  const lines = [
    '# Stage 144 Low-Grade Tail Diagnostic',
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.distribution).sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| ID | After | Class | Low categories | OCR class | Shape | Tools |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const shape = row.ocrShape
      ? `text=${row.ocrShape.textCharCount} depth=${row.ocrShape.structureTreeDepth ?? 'n/a'} P=${row.ocrShape.paragraphStructElemCount} MCID=${row.ocrShape.mcidTextSpanCount}`
      : 'n/a';
    lines.push(`| ${row.id} | ${row.after} | ${row.classification} | ${Object.entries(row.lowCategories).map(([key, value]) => `${key}:${value}`).join(', ') || 'none'} | ${row.ocrClassification ?? 'n/a'} | ${shape} | ${row.acceptedTools.join(', ') || 'none'} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const csvRows = parseCsv(await readFile(args.csvPath, 'utf8'))
    .filter(row => row.afterGrade !== 'A' && row.afterGrade !== 'B')
    .filter(row => rowMatches(row, args.ids));
  const benchmarkRows = args.runDir
    ? await readJson<BenchmarkRow[]>(join(args.runDir, 'remediate.results.json')) ?? []
    : [];
  const benchmarkById = new Map(benchmarkRows.map(row => [row.id, row]));
  const rows: DiagnosticRow[] = [];
  for (const csvRow of csvRows) {
    const benchmark = benchmarkById.get(csvRow.id) ?? benchmarkRows.find(row => csvRow.id.includes(row.publicationId ?? ''));
    const categories = benchmark?.reanalyzedCategories ?? benchmark?.afterCategories;
    const initial = classifyStatic(csvRow, benchmark);
    let ocrClassification: Stage129OcrPageShellClass | undefined;
    let ocrShape: DiagnosticRow['ocrShape'];
    if (args.runDir && (initial.classification === 'ocr_page_shell_reading_order_candidate' || csvRow.file.includes('manual_scanned'))) {
      const pdfPath = await findRemediatedPdf(args.runDir, csvRow.id);
      if (pdfPath) {
        const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
        const disposition = classifyStage129OcrPageShell(analyzed.result, analyzed.snapshot);
        ocrClassification = disposition.classification;
        const reading = analyzed.snapshot.detectionProfile?.readingOrderSignals;
        ocrShape = {
          pdfClass: analyzed.result.pdfClass,
          textCharCount: analyzed.snapshot.textCharCount,
          pageCount: analyzed.snapshot.pageCount,
          structureTreeDepth: reading?.structureTreeDepth ?? null,
          paragraphStructElemCount: analyzed.snapshot.paragraphStructElems?.length ?? 0,
          mcidTextSpanCount: analyzed.snapshot.mcidTextSpans?.length ?? 0,
          engineAppliedOcr: analyzed.snapshot.remediationProvenance?.engineAppliedOcr === true,
          engineTaggedOcrText: analyzed.snapshot.remediationProvenance?.engineTaggedOcrText === true,
        };
      }
    }
    rows.push({
      id: csvRow.id,
      file: csvRow.file,
      sourceFolder: csvRow.sourceFolder,
      after: `${csvRow.afterScore}/${csvRow.afterGrade}`,
      classification: ocrClassification === 'ocr_page_shell_reading_order_candidate'
        ? 'ocr_page_shell_reading_order_candidate'
        : initial.classification,
      reasons: initial.reasons,
      ocrClassification,
      lowCategories: lowCategories(categories),
      ocrShape,
      acceptedTools: (benchmark?.appliedTools ?? []).filter(tool => tool.outcome === 'applied').map(tool => tool.toolName),
    });
  }
  const distribution: Record<string, number> = {};
  for (const row of rows) distribution[row.classification] = (distribution[row.classification] ?? 0) + 1;
  const report = {
    generatedAt: new Date().toISOString(),
    csvPath: args.csvPath,
    runDir: args.runDir ?? null,
    rows,
    distribution,
  };
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage144-low-grade-tail-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage144-low-grade-tail-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 144 low-grade tail diagnostic to ${args.outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { debugOcrPageShellHeadingSelection } from '../src/services/remediation/ocrPageShellHeading.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const execFileAsync = promisify(execFile);

interface CategoryRow { key: string; score: number; applicable?: boolean }
interface ToolRow { toolName: string; outcome: string; scoreBefore?: number; scoreAfter?: number }
interface BenchmarkRow {
  id: string;
  publicationId?: string;
  title?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: CategoryRow[];
  appliedTools?: ToolRow[];
}

interface PythonTitleOwnerReport {
  isOcr?: boolean;
  title?: string | null;
  page0McidCount?: number;
  normalMcidCap?: number;
  titleCandidates?: Array<{
    page: number;
    mcid: number;
    mcids: number[];
    text: string;
    source: string;
    matchedTokenCount: number;
    totalTokenCount: number;
    startIndex: number;
    beyondGlobalCap: boolean;
  }>;
  error?: string;
}

type Classification =
  | 'title_mcid_beyond_cap'
  | 'title_visible_without_mcid_owner'
  | 'title_ocr_misread_no_safe_anchor'
  | 'cover_page_not_title_page'
  | 'already_fixed_control'
  | 'manual_no_safe_heading'
  | 'missing_analysis_pdf';

const DEFAULT_RUN = 'Output/stage145-low-grade-tail/run-stage154-target-ocr-ownership-2026-04-29-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage155-ocr-title-owner-diagnostic-2026-04-29-r1';
const DEFAULT_IDS = ['3451', '3459', '3602', '3423', '3429', '3433', '4184', '4485', 'holdout4-06', '4156', '4172', '4699'];

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

function csvArg(flag: string): string[] {
  const value = argValue(flag);
  return value ? value.split(',').map(part => part.trim()).filter(Boolean) : [];
}

function rowKey(row: BenchmarkRow): string {
  return [row.id, row.publicationId, row.title, row.file, row.localFile].filter(Boolean).join(' ');
}

function rowMatches(row: BenchmarkRow, ids: string[]): boolean {
  const key = rowKey(row);
  return ids.some(id => key.includes(id));
}

async function findRemediatedPdf(runDir: string, row: BenchmarkRow): Promise<string | null> {
  const names = await readdir(runDir).catch(() => []);
  const ids = [row.id, row.publicationId].filter((value): value is string => Boolean(value));
  const found = names.find(name =>
    name.endsWith('.remediated.pdf') &&
    ids.some(id => name.startsWith(`${id}-`) || name.includes(id)),
  );
  return found ? join(runDir, found) : null;
}

function categoryScore(categories: CategoryRow[] | undefined, key: string): number | null {
  const row = categories?.find(item => item.key === key);
  return row?.applicable === false ? null : row?.score ?? null;
}

function alphaTokens(value: string | undefined | null): string[] {
  return (value ?? '').toLowerCase().match(/[a-z]+/g) ?? [];
}

function visibleTitleTokenHits(snapshot: DocumentSnapshot | null, title: string | undefined | null): number {
  if (!snapshot) return 0;
  const text = (snapshot.textByPage[0] ?? '').toLowerCase();
  const tokens = [...new Set(alphaTokens(title).filter(token => token.length >= 4))];
  return tokens.filter(token => text.includes(token)).length;
}

function classify(args: {
  analysis: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
  python: PythonTitleOwnerReport | null;
  row: BenchmarkRow;
}): { classification: Classification; reasons: string[] } {
  const { analysis, snapshot, python, row } = args;
  if (!analysis || !snapshot || !python) return { classification: 'missing_analysis_pdf', reasons: ['missing_written_pdf_or_analysis'] };
  if (analysis.pdfClass === 'scanned' || snapshot.textCharCount <= 0) {
    return { classification: 'manual_no_safe_heading', reasons: ['no_extractable_ocr_text'] };
  }
  if (!python.isOcr || (categoryScore(row.afterCategories, 'heading_structure') ?? 0) > 0) {
    return { classification: 'already_fixed_control', reasons: ['not_ocr_zero_heading_target'] };
  }
  const deep = (python.titleCandidates ?? []).find(candidate => candidate.beyondGlobalCap);
  if (deep) {
    return {
      classification: 'title_mcid_beyond_cap',
      reasons: [`matched_${deep.matchedTokenCount}_of_${deep.totalTokenCount}_title_tokens`, `start_mcid_ordinal_${deep.startIndex}`],
    };
  }
  const title = python.title ?? snapshot.metadata.title ?? row.title ?? '';
  const visibleHits = visibleTitleTokenHits(snapshot, title);
  if (visibleHits >= 4) {
    return { classification: 'title_visible_without_mcid_owner', reasons: [`${visibleHits}_title_tokens_visible_in_pdfjs_page0`] };
  }
  if ((snapshot.textByPage[0] ?? '').trim().length < 80 && snapshot.pageCount > 1) {
    return { classification: 'cover_page_not_title_page', reasons: ['page0_text_sparse_or_cover_like'] };
  }
  return { classification: 'title_ocr_misread_no_safe_anchor', reasons: ['title_tokens_not_visible_as_owned_page0_mcid_window'] };
}

async function pythonTitleOwner(pdfPath: string): Promise<PythonTitleOwnerReport | null> {
  const { stdout } = await execFileAsync('python3', ['python/pdf_analysis_helper.py', '--stage155-title-owner', pdfPath], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 8,
  });
  return JSON.parse(stdout) as PythonTitleOwnerReport;
}

async function main(): Promise<void> {
  const runs = csvArg('--runs');
  const singleRun = argValue('--run');
  if (singleRun) runs.push(singleRun);
  if (!runs.length) runs.push(DEFAULT_RUN);
  const ids = csvArg('--ids');
  const targetIds = ids.length ? ids : DEFAULT_IDS;
  const outDir = argValue('--out') ?? DEFAULT_OUT;

  const loaded: Array<{ runDir: string; row: BenchmarkRow }> = [];
  for (const runDir of runs) {
    const file = join(runDir, 'remediate.results.json');
    if (!existsSync(file)) continue;
    const rows = JSON.parse(await readFile(file, 'utf8')) as BenchmarkRow[];
    for (const row of rows) if (rowMatches(row, targetIds)) loaded.push({ runDir, row });
  }

  const records = [];
  for (const { runDir, row } of loaded) {
    const pdfPath = await findRemediatedPdf(runDir, row);
    const analyzed = pdfPath ? await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true }) : null;
    const python = pdfPath ? await pythonTitleOwner(pdfPath) : null;
    const debug = analyzed ? debugOcrPageShellHeadingSelection(analyzed.result, analyzed.snapshot) : null;
    const disposition = classify({ analysis: analyzed?.result ?? null, snapshot: analyzed?.snapshot ?? null, python, row });
    records.push({
      runDir,
      id: row.id,
      title: row.title ?? '',
      file: row.localFile ?? row.file ?? '',
      pdfPath,
      score: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
      classification: disposition.classification,
      reasons: disposition.reasons,
      categories: {
        heading_structure: categoryScore(row.afterCategories, 'heading_structure'),
        reading_order: categoryScore(row.afterCategories, 'reading_order'),
        text_extractability: categoryScore(row.afterCategories, 'text_extractability'),
      },
      pythonTitleOwner: python,
      firstPageLines: (analyzed?.snapshot.textByPage[0] ?? '')
        .split(/\r?\n| {2,}/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 10),
      ocrHeadingSeeds: debug?.seeds ?? [],
      titleMcidCandidates: debug?.titleMcidCandidates ?? [],
      toolTimeline: (row.appliedTools ?? [])
        .filter(tool => /ocr|heading|structure|tag|reading/.test(tool.toolName))
        .map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore ?? '?'}->${tool.scoreAfter ?? '?'}`),
    });
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage155-ocr-title-owner-diagnostic.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    runs,
    targetIds,
    records,
  }, null, 2));

  const counts = records.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = ['# Stage 155 OCR Title-Owner Diagnostic', '', `Runs: ${runs.map(run => `\`${run}\``).join(', ')}`, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(counts).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  for (const record of records) {
    lines.push(`## ${record.id}`);
    lines.push('');
    lines.push(`- Score: ${record.score}`);
    lines.push(`- Class: ${record.classification}`);
    lines.push(`- Reasons: ${record.reasons.join('; ')}`);
    lines.push(`- Categories: ${JSON.stringify(record.categories)}`);
    lines.push(`- Page0 MCIDs: ${record.pythonTitleOwner?.page0McidCount ?? 'n/a'}; title candidates: ${JSON.stringify(record.pythonTitleOwner?.titleCandidates ?? [])}`);
    lines.push(`- First-page lines: ${record.firstPageLines.slice(0, 5).join(' | ') || 'none'}`);
    lines.push(`- Tool timeline: ${record.toolTimeline.join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage155-ocr-title-owner-diagnostic.md'), lines.join('\n'));
  console.log(`Wrote Stage 155 OCR title-owner diagnostic to ${outDir}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

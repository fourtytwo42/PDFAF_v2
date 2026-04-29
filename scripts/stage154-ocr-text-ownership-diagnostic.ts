#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { debugOcrPageShellHeadingSelection } from '../src/services/remediation/ocrPageShellHeading.js';
import { classifyStage154OcrTextOwnership } from '../src/services/remediation/ocrTextOwnership.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

interface CategoryRow { key: string; score: number; applicable?: boolean }
interface ToolRow { toolName: string; outcome: string; details?: unknown; scoreBefore?: number; scoreAfter?: number }
interface BenchmarkRow {
  id: string;
  publicationId?: string;
  title?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  afterPdfClass?: string;
  afterCategories?: CategoryRow[];
  appliedTools?: ToolRow[];
}

const DEFAULT_RUNS = [
  'Output/stage145-low-grade-tail/run-stage147-active-tail-2026-04-28-r1',
  'Output/from_sibling_pdfaf_v1_holdout_4/run-stage153-holdout4-target-2026-04-29-r1',
];
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage154-ocr-text-ownership-diagnostic-2026-04-29-r1';
const DEFAULT_IDS = ['3451', '3459', '3602', '3423', '3429', '3433', '4485', '4184', 'holdout4-06', '4156', '4172', '4699'];

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

async function loadRows(runDirs: string[]): Promise<Array<{ runDir: string; row: BenchmarkRow }>> {
  const out: Array<{ runDir: string; row: BenchmarkRow }> = [];
  for (const runDir of runDirs) {
    const file = join(runDir, 'remediate.results.json');
    if (!existsSync(file)) continue;
    const rows = JSON.parse(await readFile(file, 'utf8')) as BenchmarkRow[];
    for (const row of rows) out.push({ runDir, row });
  }
  return out;
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

function toolTimeline(row: BenchmarkRow): string[] {
  return (row.appliedTools ?? [])
    .filter(tool => /ocr|heading|tag_ocr|recover_ocr|reading_order|structure/i.test(tool.toolName))
    .map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore ?? '?'}->${tool.scoreAfter ?? '?'}`);
}

function detailsFor(row: BenchmarkRow, toolName: string): unknown[] {
  return (row.appliedTools ?? [])
    .filter(tool => tool.toolName === toolName)
    .map(tool => tool.details ?? '');
}

function firstPageLines(snapshot: DocumentSnapshot): string[] {
  return (snapshot.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function analyzeForRow(runDir: string, row: BenchmarkRow): Promise<{
  analysis: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
  pdfPath: string | null;
}> {
  const pdfPath = await findRemediatedPdf(runDir, row);
  if (!pdfPath) return { analysis: null, snapshot: null, pdfPath: null };
  const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  return { analysis: analyzed.result, snapshot: analyzed.snapshot, pdfPath };
}

async function main(): Promise<void> {
  const runs = csvArg('--runs');
  const singleRun = argValue('--run');
  if (singleRun) runs.push(singleRun);
  if (!runs.length) runs.push(...DEFAULT_RUNS);
  const ids = csvArg('--ids');
  const targetIds = ids.length ? ids : DEFAULT_IDS;
  const outDir = argValue('--out') ?? DEFAULT_OUT;

  const loaded = (await loadRows(runs)).filter(({ row }) => rowMatches(row, targetIds));
  const records = [];
  for (const { runDir, row } of loaded) {
    const analyzed = await analyzeForRow(runDir, row);
    const analysis = analyzed.analysis;
    const snapshot = analyzed.snapshot;
    const disposition = analysis && snapshot ? classifyStage154OcrTextOwnership(analysis, snapshot) : null;
    const ocrDebug = analysis && snapshot ? debugOcrPageShellHeadingSelection(analysis, snapshot) : null;
    records.push({
      runDir,
      id: row.id,
      title: row.title ?? '',
      file: row.localFile ?? row.file ?? '',
      pdfPath: analyzed.pdfPath,
      score: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
      classification: disposition?.classification ?? 'missing_analysis_pdf',
      reasons: disposition?.reasons ?? ['remediated_pdf_not_written'],
      categories: {
        heading_structure: categoryScore(row.afterCategories, 'heading_structure'),
        reading_order: categoryScore(row.afterCategories, 'reading_order'),
        text_extractability: categoryScore(row.afterCategories, 'text_extractability'),
      },
      ocrSignals: snapshot
        ? {
          pdfClass: analysis?.pdfClass,
          creator: snapshot.metadata.creator ?? '',
          producer: snapshot.metadata.producer ?? '',
          engineAppliedOcr: snapshot.remediationProvenance?.engineAppliedOcr === true,
          engineTaggedOcrText: snapshot.remediationProvenance?.engineTaggedOcrText === true,
          pageCount: snapshot.pageCount,
          textCharCount: snapshot.textCharCount,
          isTagged: snapshot.isTagged,
          structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
          mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
          taggedAuditMcidTextSpanCount: snapshot.taggedContentAudit?.mcidTextSpanCount ?? 0,
          paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
          orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? 0,
        }
        : {},
      firstPageLines: snapshot ? firstPageLines(snapshot) : [],
      ocrHeadingSeeds: ocrDebug?.seeds ?? [],
      firstPageMcidSamples: ocrDebug?.firstPageMcidSpanSamples ?? [],
      tagOcrDetails: detailsFor(row, 'tag_ocr_text_blocks'),
      recoverOcrDetails: detailsFor(row, 'recover_ocr_text_ownership'),
      toolTimeline: toolTimeline(row),
    });
  }

  await mkdir(outDir, { recursive: true });
  const payload = { generatedAt: new Date().toISOString(), runs, targetIds, records };
  await writeFile(join(outDir, 'stage154-ocr-text-ownership-diagnostic.json'), JSON.stringify(payload, null, 2));

  const counts = records.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = ['# Stage 154 OCR Text Ownership Diagnostic', '', `Runs: ${runs.map(run => `\`${run}\``).join(', ')}`, ''];
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
    lines.push(`- OCR signals: ${JSON.stringify(record.ocrSignals)}`);
    lines.push(`- First-page lines: ${record.firstPageLines.slice(0, 5).join(' | ') || 'none'}`);
    lines.push(`- Heading seeds: ${record.ocrHeadingSeeds.map(seed => `${seed.text}:${seed.matchedTokenCount}:${seed.mcids.join('+')}`).join(' | ') || 'none'}`);
    lines.push(`- Tool timeline: ${record.toolTimeline.join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage154-ocr-text-ownership-diagnostic.md'), lines.join('\n'));
  console.log(`Wrote Stage 154 OCR ownership diagnostic to ${outDir}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

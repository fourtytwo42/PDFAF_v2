#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { debugOcrPageShellHeadingSelection } from '../src/services/remediation/ocrPageShellHeading.js';
import { classifyStage153HeadingZeroResidual } from '../src/services/remediation/headingZeroResidual.js';
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
  afterDetectionProfile?: {
    readingOrderSignals?: Record<string, unknown>;
    headingSignals?: Record<string, unknown>;
    annotationSignals?: Record<string, unknown>;
    tableSignals?: Record<string, unknown>;
    pdfUaSignals?: Record<string, unknown>;
  };
  appliedTools?: ToolRow[];
}

const DEFAULT_RUNS = [
  'Output/from_sibling_pdfaf_v1_holdout_4/run-stage152-holdout4-full-2026-04-29-r1',
  'Output/stage145-low-grade-tail/run-stage147-active-tail-2026-04-28-r1',
  'Output/experiment-corpus-baseline/run-stage152-full-2026-04-29-r2',
];
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_holdout_4/stage153-heading-zero-diagnostic-2026-04-29-r1';
const DEFAULT_IDS = [
  'holdout4-03',
  'holdout4-06',
  '3451',
  '3459',
  '3602',
  '4485',
  'holdout4-14',
  'holdout4-10',
  '4184',
  '4737',
  '4002',
  'structure-4207',
  '4207',
  '4156',
  '4172',
  '4699',
];

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

function resolveLocalPath(row: BenchmarkRow): string | null {
  const raw = row.localFile ?? row.file;
  if (!raw) return null;
  if (isAbsolute(raw) && existsSync(raw)) return raw;
  const candidates = [raw, join('Input', raw), join('Input/from_sibling_pdfaf_v1_holdout_4', raw)];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

function categoryScore(categories: CategoryRow[] | undefined, key: string): number | null {
  const row = categories?.find(item => item.key === key);
  return row?.applicable === false ? null : row?.score ?? null;
}

function firstPageLines(snapshot: DocumentSnapshot): string[] {
  return (snapshot.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function headingTools(row: BenchmarkRow): string[] {
  return (row.appliedTools ?? [])
    .filter(tool => /heading|structure|tag_native|ocr_scanned_pdf|reading_order/i.test(tool.toolName))
    .map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore ?? '?'}->${tool.scoreAfter ?? '?'}`);
}

async function analyzeForRow(runDir: string, row: BenchmarkRow): Promise<{
  analysis: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
  pdfPath: string | null;
  source: string;
}> {
  const remediated = await findRemediatedPdf(runDir, row);
  const allowSource = process.argv.includes('--analyze-source');
  const pdfPath = remediated ?? (allowSource ? resolveLocalPath(row) : null);
  if (!pdfPath) return { analysis: null, snapshot: null, pdfPath: null, source: 'missing_pdf' };
  const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  return {
    analysis: analyzed.result,
    snapshot: analyzed.snapshot,
    pdfPath,
    source: remediated ? 'remediated_pdf' : 'source_pdf',
  };
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
    const disposition = analysis && snapshot
      ? classifyStage153HeadingZeroResidual(analysis, snapshot)
      : null;
    const ocrDebug = analysis && snapshot ? debugOcrPageShellHeadingSelection(analysis, snapshot) : null;
    records.push({
      runDir,
      id: row.id,
      title: row.title ?? '',
      file: row.localFile ?? row.file ?? '',
      source: analyzed.source,
      pdfPath: analyzed.pdfPath,
      score: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
      pdfClass: analysis?.pdfClass ?? row.afterPdfClass ?? 'unknown',
      classification: disposition?.classification ?? 'missing_analysis',
      reasons: disposition?.reasons ?? ['missing_analysis_pdf'],
      candidate: disposition?.candidate
        ? {
          text: disposition.candidate.text,
          source: disposition.candidate.source,
          score: disposition.candidate.score,
          page: disposition.candidate.page,
          reasons: disposition.candidate.reasons,
          mcid: 'mcid' in disposition.candidate ? disposition.candidate.mcid : undefined,
          mcids: 'mcids' in disposition.candidate ? disposition.candidate.mcids : undefined,
          targetRef: 'targetRef' in disposition.candidate ? disposition.candidate.targetRef : undefined,
        }
        : null,
      categoryScores: {
        heading_structure: categoryScore(row.afterCategories, 'heading_structure'),
        reading_order: categoryScore(row.afterCategories, 'reading_order'),
        text_extractability: categoryScore(row.afterCategories, 'text_extractability'),
        alt_text: categoryScore(row.afterCategories, 'alt_text'),
        table_markup: categoryScore(row.afterCategories, 'table_markup'),
        link_quality: categoryScore(row.afterCategories, 'link_quality'),
      },
      analysisSignals: snapshot
        ? {
          pageCount: snapshot.pageCount,
          textCharCount: snapshot.textCharCount,
          isTagged: snapshot.isTagged,
          ocrProducer: snapshot.remediationProvenance?.engineAppliedOcr === true,
          structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
          degenerateStructureTree: snapshot.detectionProfile?.readingOrderSignals.degenerateStructureTree ?? null,
          extractedHeadingCount: snapshot.detectionProfile?.headingSignals.extractedHeadingCount ?? snapshot.headings.length,
          treeHeadingCount: snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? snapshot.headings.length,
          mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
          paragraphCandidateCount: snapshot.paragraphStructElems?.length ?? 0,
          orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? 0,
        }
        : row.afterDetectionProfile ?? {},
      firstPageVisibleLines: snapshot ? firstPageLines(snapshot) : [],
      metadataTitle: snapshot?.metadata.title ?? '',
      bookmarkSeeds: (snapshot?.bookmarks ?? []).slice(0, 5).map(bookmark => bookmark.title),
      ocrSeedDiagnostics: ocrDebug?.seeds ?? [],
      ocrFirstPageMcidSamples: ocrDebug?.firstPageMcidSpanSamples ?? [],
      headingToolTimeline: headingTools(row),
    });
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage153-heading-zero-diagnostic.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    runs,
    targetIds,
    records,
  }, null, 2));
  const counts = records.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = ['# Stage 153 Heading-Zero Residual Diagnostic', '', `Runs: ${runs.map(run => `\`${run}\``).join(', ')}`, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(counts).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  for (const record of records) {
    lines.push(`## ${record.id}`);
    lines.push('');
    lines.push(`- Score: ${record.score}`);
    lines.push(`- Class: ${record.classification}`);
    lines.push(`- Reasons: ${record.reasons.join('; ') || 'none'}`);
    lines.push(`- Candidate: ${record.candidate ? `${record.candidate.text} (${record.candidate.source}, ${record.candidate.score})` : 'none'}`);
    lines.push(`- Categories: ${JSON.stringify(record.categoryScores)}`);
    lines.push(`- Signals: ${JSON.stringify(record.analysisSignals)}`);
    lines.push(`- First-page lines: ${record.firstPageVisibleLines.slice(0, 5).join(' | ') || 'none'}`);
    lines.push(`- Heading tools: ${record.headingToolTimeline.join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage153-heading-zero-diagnostic.md'), lines.join('\n'));
  console.log(`Wrote Stage 153 heading-zero diagnostic to ${outDir}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

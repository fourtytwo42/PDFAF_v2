#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage175OcrCollectionCover,
  debugOcrPageShellHeadingSelection,
  selectOcrCollectionCoverTitleHeadingCandidate,
  selectOcrPageShellHeadingCandidate,
} from '../src/services/remediation/ocrPageShellHeading.js';
import { isOcrPageShell } from '../src/services/remediation/visibleHeadingAnchor.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_1/manifest.json';
const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_hard_1/run-stage172-target-ocr-heading-2026-05-01-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_1/stage175-ocr-collection-title-diagnostic-2026-05-01-r1';
const DEFAULT_IDS = [
  'v1-3476',
  'v1-3473',
  'v1-3470',
  'v1-3569',
  'v1-3475',
  'v1-3577',
  'v1-3443',
  'v1-3423',
  'v1-3429',
  'v1-3433',
  'v1-4213',
];

interface RunCategory { key?: string; score?: number; applicable?: boolean }
interface RunTool {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
  source?: string;
}
interface RunRow {
  id?: string;
  publicationId?: string;
  title?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: RunCategory[];
  appliedTools?: RunTool[];
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage175-ocr-collection-title-diagnostic.ts [options]

Options:
  --manifest <path>       Hard holdout manifest (default: ${DEFAULT_MANIFEST})
  --run <dir>             Benchmark run directory (default: ${DEFAULT_RUN})
  --out <dir>             Diagnostic output directory (default: ${DEFAULT_OUT})
  --ids <csv>             Row ids/publication ids to include
  --file <id>             Add one row id/publication id; repeatable
  --analyze-source        Analyze source PDFs when no written final PDF is present
  --help                  Show this help`;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function csvArg(flag: string): string[] {
  const value = argValue(flag);
  return value ? value.split(',').map(part => part.trim()).filter(Boolean) : [];
}

function repeatedArg(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

function categoryScore(categories: RunCategory[] | undefined, key: string): number | null {
  const row = categories?.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function analysisCategoryScore(analysis: AnalysisResult | null, key: string): number | null {
  const row = analysis?.categories.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function rowIdMatches(row: EdgeMixManifestRow, ids: Set<string>): boolean {
  return ids.has(row.id) || ids.has(row.publicationId);
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const rows = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as RunRow[];
  return new Map(rows.flatMap(row => {
    const keys = [row.id, row.publicationId].filter((value): value is string => Boolean(value));
    return keys.map(key => [key, row] as const);
  }));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findRemediatedPdf(runDir: string, row: EdgeMixManifestRow): Promise<string | null> {
  for (const candidate of [join(runDir, 'pdfs', `${row.id}.pdf`), join(runDir, 'pdfs', `${row.publicationId}.pdf`)]) {
    if (await fileExists(candidate)) return candidate;
  }
  const names = await readdir(runDir).catch(() => []);
  const prefix = `${row.publicationId}-`;
  const found = names.find(name => name.endsWith('.remediated.pdf') && (name.startsWith(prefix) || name.includes(row.id)));
  return found ? join(runDir, found) : null;
}

async function analyzeRowPdf(runDir: string, row: EdgeMixManifestRow, analyzeSource: boolean): Promise<{
  analysis: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
  pdfPath: string | null;
  analyzedSource: 'remediated_pdf' | 'source_pdf' | 'missing_pdf';
}> {
  const remediated = await findRemediatedPdf(runDir, row);
  const pdfPath = remediated ?? (analyzeSource ? row.absolutePath : null);
  if (!pdfPath || !(await fileExists(pdfPath))) {
    return { analysis: null, snapshot: null, pdfPath: null, analyzedSource: 'missing_pdf' };
  }
  const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  return {
    analysis: analyzed.result,
    snapshot: analyzed.snapshot,
    pdfPath,
    analyzedSource: remediated ? 'remediated_pdf' : 'source_pdf',
  };
}

function linesForPage(snapshot: DocumentSnapshot | null, page: number): string[] {
  return (snapshot?.textByPage[page] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function relevantTimeline(row: RunRow | undefined): Array<Record<string, unknown>> {
  return (row?.appliedTools ?? [])
    .filter(tool => /ocr|heading|structure|tag|reading|figure|alt|table|artifact|orphan/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? '',
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
      delta: typeof tool.delta === 'number' ? tool.delta : null,
      source: tool.source ?? null,
      details: typeof tool.details === 'string' ? tool.details.slice(0, 260) : null,
    }));
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const manifestPath = argValue('--manifest') ?? DEFAULT_MANIFEST;
  const runDir = argValue('--run') ?? DEFAULT_RUN;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const ids = new Set([...DEFAULT_IDS, ...csvArg('--ids'), ...repeatedArg('--file')].filter(Boolean));
  const analyzeSource = process.argv.includes('--analyze-source');
  const manifestRows = (await loadEdgeMixManifest(manifestPath)).filter(row => rowIdMatches(row, ids));
  const runRows = await loadRunRows(runDir);

  const records = [];
  for (const row of manifestRows) {
    const runRow = runRows.get(row.id) ?? runRows.get(row.publicationId);
    const analyzed = await analyzeRowPdf(runDir, row, analyzeSource);
    const analysis = analyzed.analysis;
    const snapshot = analyzed.snapshot;
    const debug = analysis && snapshot ? debugOcrPageShellHeadingSelection(analysis, snapshot) : null;
    const page1Candidate = analysis && snapshot ? selectOcrPageShellHeadingCandidate(analysis, snapshot) : null;
    const collectionCandidate = analysis && snapshot ? selectOcrCollectionCoverTitleHeadingCandidate(analysis, snapshot) : null;
    const disposition = analysis && snapshot
      ? classifyStage175OcrCollectionCover(analysis, snapshot)
      : { classification: 'not_ocr_page_shell' as const, candidate: null, reasons: ['missing_analysis'] };
    records.push({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      benchmark: {
        beforeScore: runRow?.beforeScore ?? null,
        beforeGrade: runRow?.beforeGrade ?? null,
        afterScore: runRow?.afterScore ?? null,
        afterGrade: runRow?.afterGrade ?? null,
      },
      analyzedSource: analyzed.analyzedSource,
      pdfPath: analyzed.pdfPath,
      analysisScore: analysis?.score ?? null,
      analysisGrade: analysis?.grade ?? null,
      pdfClass: analysis?.pdfClass ?? null,
      categories: {
        heading_structure: categoryScore(runRow?.afterCategories, 'heading_structure') ?? analysisCategoryScore(analysis, 'heading_structure'),
        reading_order: categoryScore(runRow?.afterCategories, 'reading_order') ?? analysisCategoryScore(analysis, 'reading_order'),
        text_extractability: categoryScore(runRow?.afterCategories, 'text_extractability') ?? analysisCategoryScore(analysis, 'text_extractability'),
        alt_text: categoryScore(runRow?.afterCategories, 'alt_text') ?? analysisCategoryScore(analysis, 'alt_text'),
        table_markup: categoryScore(runRow?.afterCategories, 'table_markup') ?? analysisCategoryScore(analysis, 'table_markup'),
        pdf_ua_compliance: categoryScore(runRow?.afterCategories, 'pdf_ua_compliance') ?? analysisCategoryScore(analysis, 'pdf_ua_compliance'),
      },
      signals: snapshot && analysis ? {
        pageCount: snapshot.pageCount,
        textCharCount: snapshot.textCharCount,
        isTagged: snapshot.isTagged,
        isOcr: isOcrPageShell(snapshot, analysis),
        treeHeadingCount: snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? null,
        paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
        mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
        collectionCoverDetected: debug?.collectionCover?.firstPageLooksLikeCollectionCover ?? false,
      } : null,
      classification: disposition.classification,
      reasons: disposition.reasons,
      page1Candidate,
      collectionCandidate,
      firstPageLines: linesForPage(snapshot, 0),
      titlePageLines: [1, 2, 3, 4, 5, 6, 7].map(page => ({ page, lines: linesForPage(snapshot, page) })),
      collectionCandidates: debug?.collectionCover?.candidates ?? [],
      page1SeedDiagnostics: debug?.seeds ?? [],
      page1McidSamples: debug?.firstPageMcidSpanSamples ?? [],
      paragraphSamples: (snapshot?.paragraphStructElems ?? [])
        .filter(paragraph => paragraph.page >= 0 && paragraph.page <= 7)
        .slice(0, 24)
        .map(paragraph => ({
          page: paragraph.page,
          text: paragraph.text.replace(/\s+/g, ' ').trim().slice(0, 220),
          structRef: paragraph.structRef,
        })),
      currentHeadingToolTimeline: relevantTimeline(runRow),
    });
  }

  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    acc[record.classification] = (acc[record.classification] ?? 0) + 1;
    return acc;
  }, {});
  const selectedRows = records
    .filter(record => record.classification === 'ocr_collection_cover_title_candidate')
    .map(record => record.id);
  const report = {
    generatedAt: new Date().toISOString(),
    manifest: resolve(manifestPath),
    runDir: resolve(runDir),
    analyzeSourceFallback: analyzeSource,
    records,
    decision: {
      distribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0
        ? 'enable_collection_cover_ocr_title_heading_recovery'
        : 'diagnostic_only_no_owned_later_title_page',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage175-ocr-collection-title-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 175 OCR Collection-Cover Title Diagnostic', '', `Run: \`${runDir}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Selected rows: ${selectedRows.length ? selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Score | Class | Candidate | Key lows |');
  lines.push('|---|---:|---|---|---|');
  for (const record of records) {
    const lows = Object.entries(record.categories)
      .filter(([, value]) => typeof value === 'number' && value < 80)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    const candidate = record.collectionCandidate
      ? `p${record.collectionCandidate.page + 1}: ${record.collectionCandidate.text}`
      : record.page1Candidate
        ? `page1: ${record.page1Candidate.text}`
        : 'none';
    lines.push([
      `\`${record.id}\``,
      `${record.benchmark.afterScore ?? record.analysisScore ?? 'n/a'}/${record.benchmark.afterGrade ?? record.analysisGrade ?? 'n/a'}`,
      record.classification,
      candidate,
      lows || 'none',
    ].join(' | '));
  }
  lines.push('');
  for (const record of records.filter(row => row.classification !== 'already_fixed_control')) {
    lines.push(`## ${record.id}`);
    lines.push('');
    lines.push(`- Classification: ${record.classification} (${record.reasons.join(', ')})`);
    lines.push(`- Signals: ${JSON.stringify(record.signals)}`);
    lines.push(`- First page lines: ${record.firstPageLines.join(' | ') || 'none'}`);
    lines.push(`- Later-page candidates: ${JSON.stringify(record.collectionCandidates)}`);
    lines.push(`- Paragraph samples: ${JSON.stringify(record.paragraphSamples)}`);
    lines.push(`- Tool timeline: ${record.currentHeadingToolTimeline.map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore}->${tool.scoreAfter}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage175-ocr-collection-title-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 175 OCR collection-title diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

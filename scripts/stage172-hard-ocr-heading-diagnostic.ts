#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  debugOcrPageShellHeadingSelection,
  selectOcrPageShellHeadingCandidate,
} from '../src/services/remediation/ocrPageShellHeading.js';
import { isOcrPageShell } from '../src/services/remediation/visibleHeadingAnchor.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_1/manifest.json';
const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_hard_1/run-stage171-hard-2026-05-01-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_1/stage172-hard-ocr-heading-diagnostic-2026-05-01-r1';
const DEFAULT_IDS = [
  'v1-3476',
  'v1-3473',
  'v1-3470',
  'v1-3569',
  'v1-3475',
  'v1-3577',
  'v1-4213',
  'v1-4767',
];
const PRIMARY_ZERO_HEADING_IDS = new Set(['v1-3476', 'v1-3473', 'v1-3470', 'v1-3569']);
const POSITIVE_CONTRAST_IDS = new Set(['v1-3475', 'v1-3577', 'v1-3443', 'v1-3423', 'v1-3429', 'v1-3433']);
const MIXED_RESIDUAL_IDS = new Set(['v1-4213']);

export type Stage172Class =
  | 'ocr_safe_title_owner_candidate'
  | 'ocr_title_owner_beyond_cap'
  | 'ocr_split_or_noisy_title_candidate'
  | 'title_page_not_first_page'
  | 'ocr_visible_title_without_owner'
  | 'ocr_title_misread_no_safe_anchor'
  | 'manual_no_safe_heading'
  | 'safe_alt_continuation_candidate'
  | 'safe_table_continuation_candidate'
  | 'mixed_alt_table_pdfua_debt'
  | 'no_safe_target'
  | 'already_fixed_control';

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
  file?: string;
  localFile?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  afterPdfClass?: string;
  afterCategories?: RunCategory[];
  afterDetectionProfile?: Record<string, unknown> | null;
  appliedTools?: RunTool[];
}

export interface Stage172ZeroHeadingInput {
  role: 'primary_zero_heading' | 'positive_contrast' | 'other_control';
  headingStructure: number | null;
  textExtractability: number | null;
  isOcr: boolean;
  hasSafeOcrCandidate: boolean;
  hasDeepTitleCandidateBeyondCap: boolean;
  hasWindowMatch: boolean;
  visibleTitleTokenHits: number;
  firstPageMcidCount: number;
  firstPageTextLength: number;
  firstPageLooksLikeCollectionCover: boolean;
  pageCount: number;
}

export interface Stage172MixedInput {
  altText: number | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  extractedFigureCount: number;
  treeFigureCount: number;
  stronglyIrregularTableCount: number;
  orphanMcidCount: number;
}

export interface Stage172Classification {
  classification: Stage172Class;
  implementable: boolean;
  reason: string;
}

export function classifyStage172ZeroHeading(input: Stage172ZeroHeadingInput): Stage172Classification {
  if (input.headingStructure !== null && input.headingStructure > 0) {
    return { classification: 'already_fixed_control', implementable: false, reason: `heading_structure:${input.headingStructure}` };
  }
  if (input.role !== 'primary_zero_heading') {
    return { classification: 'already_fixed_control', implementable: false, reason: 'non-primary zero-heading control' };
  }
  if ((input.textExtractability ?? 0) < 60) {
    return { classification: 'manual_no_safe_heading', implementable: false, reason: 'text not extractable enough for safe OCR heading' };
  }
  if (!input.isOcr) {
    return { classification: 'manual_no_safe_heading', implementable: false, reason: 'not an OCR page shell' };
  }
  if (input.hasSafeOcrCandidate) {
    return { classification: 'ocr_safe_title_owner_candidate', implementable: true, reason: 'current selector found a safe owned OCR title' };
  }
  if (input.hasDeepTitleCandidateBeyondCap) {
    return { classification: 'ocr_title_owner_beyond_cap', implementable: true, reason: 'title-owned MCIDs exist beyond the bounded MCID sample' };
  }
  if (input.hasWindowMatch) {
    return { classification: 'ocr_split_or_noisy_title_candidate', implementable: true, reason: 'line-aware OCR title tokens match owned MCIDs but did not pass final selector' };
  }
  if (input.pageCount > 1 && input.firstPageTextLength > 0 && input.firstPageTextLength < 80) {
    return { classification: 'title_page_not_first_page', implementable: false, reason: 'first page is sparse or cover-like' };
  }
  if (input.firstPageLooksLikeCollectionCover && input.visibleTitleTokenHits < 4) {
    return { classification: 'title_page_not_first_page', implementable: false, reason: 'first page appears to be a collection cover, not the row title page' };
  }
  if (input.visibleTitleTokenHits >= 4) {
    const owner = input.firstPageMcidCount > 0 ? 'with page-0 MCIDs but no safe title window' : 'without page-0 MCID ownership';
    return { classification: 'ocr_visible_title_without_owner', implementable: false, reason: `${input.visibleTitleTokenHits} title tokens visible ${owner}` };
  }
  return { classification: 'ocr_title_misread_no_safe_anchor', implementable: false, reason: 'title tokens are not visibly recoverable as safe OCR text' };
}

export function classifyStage172MixedResidual(input: Stage172MixedInput): Stage172Classification {
  const alt = input.altText ?? 100;
  const table = input.tableMarkup ?? 100;
  const pdfua = input.pdfUaCompliance ?? 100;
  if (alt < 80 && (table < 80 || pdfua < 80)) {
    return {
      classification: 'mixed_alt_table_pdfua_debt',
      implementable: false,
      reason: `mixed residual alt:${alt} table:${table} pdfua:${pdfua}`,
    };
  }
  if (alt < 80 && input.extractedFigureCount > input.treeFigureCount) {
    return {
      classification: 'safe_alt_continuation_candidate',
      implementable: true,
      reason: `figure mismatch extracted:${input.extractedFigureCount} tree:${input.treeFigureCount}`,
    };
  }
  if (table < 80 && input.stronglyIrregularTableCount > 0) {
    return {
      classification: 'safe_table_continuation_candidate',
      implementable: true,
      reason: `strongly irregular tables:${input.stronglyIrregularTableCount}`,
    };
  }
  return { classification: 'no_safe_target', implementable: false, reason: `no single safe mixed residual target alt:${alt} table:${table} pdfua:${pdfua}` };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage172-hard-ocr-heading-diagnostic.ts [options]

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

function alphaTokens(value: string | undefined | null): string[] {
  return (value ?? '').toLowerCase().match(/[a-z]+/g) ?? [];
}

function strongTitleTokenHits(snapshot: DocumentSnapshot | null, row: EdgeMixManifestRow): number {
  if (!snapshot) return 0;
  const text = (snapshot.textByPage[0] ?? '').toLowerCase();
  const seeds = [snapshot.metadata.title, row.title, row.localFile]
    .flatMap(value => alphaTokens(value))
    .filter(token => token.length >= 4 && !['pdf', 'manual', 'scanned'].includes(token));
  const unique = [...new Set(seeds)];
  return unique.filter(token => text.includes(token)).length;
}

function firstPageLines(snapshot: DocumentSnapshot | null): string[] {
  return (snapshot?.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function firstPageLooksLikeCollectionCover(snapshot: DocumentSnapshot | null): boolean {
  const text = (snapshot?.textByPage[0] ?? '').replace(/\s+/g, ' ').toLowerCase();
  return /research and program evaluation in illinois/.test(text) ||
    /studies on drug abuse and violent crime/.test(text);
}

function firstPageMcidCount(snapshot: DocumentSnapshot | null): number {
  return (snapshot?.mcidTextSpans ?? []).filter(row => row.page === 0 && Number.isInteger(row.mcid)).length;
}

function toolTimeline(row: RunRow | undefined): Array<Record<string, unknown>> {
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

function detectionNumber(row: RunRow | undefined, path: string[]): number {
  let current: unknown = row?.afterDetectionProfile ?? null;
  for (const part of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return 0;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : 0;
}

function rowRole(row: EdgeMixManifestRow): 'primary_zero_heading' | 'positive_contrast' | 'mixed_residual' | 'other_control' {
  if (PRIMARY_ZERO_HEADING_IDS.has(row.id)) return 'primary_zero_heading';
  if (MIXED_RESIDUAL_IDS.has(row.id)) return 'mixed_residual';
  if (POSITIVE_CONTRAST_IDS.has(row.id)) return 'positive_contrast';
  return 'other_control';
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
  for (const manifestRow of manifestRows) {
    const role = rowRole(manifestRow);
    const runRow = runRows.get(manifestRow.id) ?? runRows.get(manifestRow.publicationId);
    const analyzed = await analyzeRowPdf(runDir, manifestRow, analyzeSource);
    const analysis = analyzed.analysis;
    const snapshot = analyzed.snapshot;
    const ocrDebug = analysis && snapshot ? debugOcrPageShellHeadingSelection(analysis, snapshot) : null;
    const safeOcrCandidate = analysis && snapshot ? selectOcrPageShellHeadingCandidate(analysis, snapshot) : null;
    const headingStructure = categoryScore(runRow?.afterCategories, 'heading_structure') ?? analysisCategoryScore(analysis, 'heading_structure');
    const textExtractability = categoryScore(runRow?.afterCategories, 'text_extractability') ?? analysisCategoryScore(analysis, 'text_extractability');
    const altText = categoryScore(runRow?.afterCategories, 'alt_text') ?? analysisCategoryScore(analysis, 'alt_text');
    const tableMarkup = categoryScore(runRow?.afterCategories, 'table_markup') ?? analysisCategoryScore(analysis, 'table_markup');
    const pdfUa = categoryScore(runRow?.afterCategories, 'pdf_ua_compliance') ?? analysisCategoryScore(analysis, 'pdf_ua_compliance');
    const classification = role === 'mixed_residual'
      ? classifyStage172MixedResidual({
        altText,
        tableMarkup,
        pdfUaCompliance: pdfUa,
        extractedFigureCount: snapshot?.detectionProfile?.figureSignals.extractedFigureCount ?? detectionNumber(runRow, ['figureSignals', 'extractedFigureCount']),
        treeFigureCount: snapshot?.detectionProfile?.figureSignals.treeFigureCount ?? detectionNumber(runRow, ['figureSignals', 'treeFigureCount']),
        stronglyIrregularTableCount: snapshot?.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? detectionNumber(runRow, ['tableSignals', 'stronglyIrregularTableCount']),
        orphanMcidCount: snapshot?.detectionProfile?.pdfUaSignals.orphanMcidCount ?? detectionNumber(runRow, ['pdfUaSignals', 'orphanMcidCount']),
      })
      : classifyStage172ZeroHeading({
        role: role === 'positive_contrast' ? 'positive_contrast' : role === 'primary_zero_heading' ? 'primary_zero_heading' : 'other_control',
        headingStructure,
        textExtractability,
        isOcr: analysis && snapshot ? isOcrPageShell(snapshot, analysis) : false,
        hasSafeOcrCandidate: Boolean(safeOcrCandidate),
        hasDeepTitleCandidateBeyondCap: Boolean((ocrDebug?.titleMcidCandidates ?? []).some(candidate => candidate.beyondGlobalCap)),
        hasWindowMatch: Boolean((ocrDebug?.seeds ?? []).some(seed => seed.windowMatch && (seed.score ?? 0) >= 50)),
        visibleTitleTokenHits: strongTitleTokenHits(snapshot, manifestRow),
        firstPageMcidCount: firstPageMcidCount(snapshot),
        firstPageTextLength: (snapshot?.textByPage[0] ?? '').trim().length,
        firstPageLooksLikeCollectionCover: firstPageLooksLikeCollectionCover(snapshot),
        pageCount: snapshot?.pageCount ?? 0,
      });
    records.push({
      id: manifestRow.id,
      publicationId: manifestRow.publicationId,
      role,
      title: manifestRow.title,
      file: manifestRow.localFile,
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
      pdfClass: analysis?.pdfClass ?? runRow?.afterPdfClass ?? null,
      categories: {
        heading_structure: headingStructure,
        reading_order: categoryScore(runRow?.afterCategories, 'reading_order') ?? analysisCategoryScore(analysis, 'reading_order'),
        text_extractability: textExtractability,
        alt_text: altText,
        table_markup: tableMarkup,
        pdf_ua_compliance: pdfUa,
        link_quality: categoryScore(runRow?.afterCategories, 'link_quality') ?? analysisCategoryScore(analysis, 'link_quality'),
      },
      signals: snapshot ? {
        pageCount: snapshot.pageCount,
        textCharCount: snapshot.textCharCount,
        isTagged: snapshot.isTagged,
        isOcr: isOcrPageShell(snapshot, analysis!),
        structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
        degenerateStructureTree: snapshot.detectionProfile?.readingOrderSignals.degenerateStructureTree ?? null,
        treeHeadingCount: snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? null,
        extractedHeadingCount: snapshot.detectionProfile?.headingSignals.extractedHeadingCount ?? null,
        page0McidCount: firstPageMcidCount(snapshot),
        paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
        ocrTitleMcidCandidateCount: snapshot.ocrTitleMcidCandidates?.length ?? 0,
        extractedFigureCount: snapshot.detectionProfile?.figureSignals.extractedFigureCount ?? null,
        treeFigureCount: snapshot.detectionProfile?.figureSignals.treeFigureCount ?? null,
        orphanMcidCount: snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? null,
        stronglyIrregularTableCount: snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? null,
      } : null,
      classification,
      selectedOcrCandidate: safeOcrCandidate,
      firstPageVisibleLines: firstPageLines(snapshot),
      metadataTitle: snapshot?.metadata.title ?? null,
      bookmarkSeeds: (snapshot?.bookmarks ?? []).slice(0, 8).map(bookmark => bookmark.title),
      ocrSeedDiagnostics: ocrDebug?.seeds ?? [],
      ocrFirstPageMcidSamples: ocrDebug?.firstPageMcidSpanSamples ?? [],
      ocrTitleMcidCandidates: ocrDebug?.titleMcidCandidates ?? [],
      paragraphSamples: ocrDebug?.paragraphSamples ?? [],
      titleTokenHits: strongTitleTokenHits(snapshot, manifestRow),
      toolTimeline: toolTimeline(runRow),
    });
  }

  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.classification.classification;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const selectedRows = records
    .filter(record => record.role === 'primary_zero_heading' && record.classification.implementable)
    .map(record => record.id);
  const mixedRows = records
    .filter(record => record.role === 'mixed_residual')
    .map(record => ({ id: record.id, classification: record.classification.classification, reason: record.classification.reason }));
  const report = {
    generatedAt: new Date().toISOString(),
    manifest: resolve(manifestPath),
    runDir: resolve(runDir),
    analyzeSourceFallback: analyzeSource,
    records,
    decision: {
      distribution,
      selectedRows,
      mixedRows,
      recommendedDirection: selectedRows.length > 0
        ? 'implement_safe_ocr_heading_anchor_recovery'
        : 'diagnostic_only_no_safe_ocr_heading_anchor',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage172-hard-ocr-heading-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 172 Hard-Holdout OCR Heading Diagnostic', '', `Run: \`${runDir}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Selected zero-heading rows: ${selectedRows.length ? selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Score | Class | Reason | Candidate | Key lows |');
  lines.push('|---|---|---:|---|---|---|---|');
  for (const record of records) {
    const lows = Object.entries(record.categories)
      .filter(([, value]) => typeof value === 'number' && value < 80)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    lines.push([
      `\`${record.id}\``,
      record.role,
      `${record.benchmark.afterScore ?? record.analysisScore ?? 'n/a'}/${record.benchmark.afterGrade ?? record.analysisGrade ?? 'n/a'}`,
      record.classification.classification,
      record.classification.reason,
      record.selectedOcrCandidate ? `${record.selectedOcrCandidate.text} (${record.selectedOcrCandidate.source})` : 'none',
      lows || 'none',
    ].join(' | '));
  }
  lines.push('');
  for (const record of records.filter(row => row.role === 'primary_zero_heading' || row.role === 'mixed_residual')) {
    lines.push(`## ${record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title}`);
    lines.push(`- Classification: ${record.classification.classification} (${record.classification.reason})`);
    lines.push(`- Analyzed source: ${record.analyzedSource}`);
    lines.push(`- Signals: ${JSON.stringify(record.signals)}`);
    lines.push(`- First-page lines: ${record.firstPageVisibleLines.slice(0, 8).join(' | ') || 'none'}`);
    lines.push(`- OCR seeds: ${JSON.stringify(record.ocrSeedDiagnostics)}`);
    lines.push(`- OCR title MCID candidates: ${JSON.stringify(record.ocrTitleMcidCandidates)}`);
    lines.push(`- Tool timeline: ${record.toolTimeline.map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore}->${tool.scoreAfter}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage172-hard-ocr-heading-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 172 hard OCR heading diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

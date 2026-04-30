#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { classifyStage153HeadingZeroResidual } from '../src/services/remediation/headingZeroResidual.js';
import { debugOcrPageShellHeadingSelection, selectOcrPageShellHeadingCandidate } from '../src/services/remediation/ocrPageShellHeading.js';
import {
  classifyPartialHeadingReachability,
  classifyTaggedZeroHeadingAnchor,
  isOcrPageShell,
  selectTaggedVisibleHeadingAnchorCandidate,
} from '../src/services/remediation/visibleHeadingAnchor.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_holdout_5/manifest.json';
const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage167-baseline-2026-04-30-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_holdout_5/stage168-zero-heading-diagnostic-2026-04-30-r1';
const DEFAULT_IDS = [
  'v1-3443',
  'v1-4657',
  'v1-4760',
  'v1-3430',
  'v1-3432',
  'v1-4553',
];
const PRIMARY_IDS = new Set(['v1-3443', 'v1-4657', 'v1-4760']);

export type Stage168ZeroHeadingClass =
  | 'ocr_safe_title_owner_candidate'
  | 'native_tagged_title_anchor_candidate'
  | 'native_heading_plus_figure_alt_candidate'
  | 'content_owner_missing'
  | 'no_safe_heading_anchor'
  | 'analyzer_or_route_volatility';

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
  falsePositiveAppliedCount?: number;
}

export interface Stage168ClassificationInput {
  id: string;
  isPrimary: boolean;
  headingStructure: number | null;
  textExtractability: number | null;
  pdfClass: string;
  isOcr: boolean;
  ownerCount: number;
  hasOcrCandidate: boolean;
  hasNativeCandidate: boolean;
  hasFigureAltDebt: boolean;
  hasHeadingVolatilitySignal: boolean;
}

export interface Stage168Classification {
  classification: Stage168ZeroHeadingClass;
  implementable: boolean;
  reason: string;
}

export function classifyStage168ZeroHeading(input: Stage168ClassificationInput): Stage168Classification {
  if (!input.isPrimary) {
    return { classification: 'no_safe_heading_anchor', implementable: false, reason: 'control row' };
  }
  if ((input.headingStructure ?? 100) > 0) {
    return { classification: 'no_safe_heading_anchor', implementable: false, reason: `heading_structure:${input.headingStructure}` };
  }
  if ((input.textExtractability ?? 0) < 60) {
    return { classification: 'content_owner_missing', implementable: false, reason: 'text not extractable enough for safe anchor recovery' };
  }
  if (input.hasHeadingVolatilitySignal) {
    return { classification: 'analyzer_or_route_volatility', implementable: false, reason: 'heading evidence is unstable or missing from tree' };
  }
  if (input.isOcr) {
    if (input.hasOcrCandidate && input.ownerCount > 0) {
      return { classification: 'ocr_safe_title_owner_candidate', implementable: true, reason: 'safe OCR title candidate has MCID ownership' };
    }
    return {
      classification: input.ownerCount <= 0 ? 'content_owner_missing' : 'no_safe_heading_anchor',
      implementable: false,
      reason: input.ownerCount <= 0 ? 'OCR text has no safe owner' : 'OCR text has owners but no safe title anchor',
    };
  }
  if (input.pdfClass === 'native_tagged') {
    if (input.hasNativeCandidate && input.hasFigureAltDebt) {
      return { classification: 'native_heading_plus_figure_alt_candidate', implementable: true, reason: 'native tagged heading anchor exists, with separate figure-alt debt' };
    }
    if (input.hasNativeCandidate) {
      return { classification: 'native_tagged_title_anchor_candidate', implementable: true, reason: 'native tagged title anchor is content-backed' };
    }
    return {
      classification: input.ownerCount <= 0 ? 'content_owner_missing' : 'no_safe_heading_anchor',
      implementable: false,
      reason: input.ownerCount <= 0 ? 'native row lacks content owners' : 'native row lacks a safe title-like content anchor',
    };
  }
  return {
    classification: input.ownerCount <= 0 ? 'content_owner_missing' : 'no_safe_heading_anchor',
    implementable: false,
    reason: input.ownerCount <= 0 ? 'no content owner available' : `unsupported pdfClass:${input.pdfClass}`,
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage168-zero-heading-diagnostic.ts [options]

Options:
  --manifest <path>       Holdout manifest (default: ${DEFAULT_MANIFEST})
  --run <dir>             Benchmark run directory (default: ${DEFAULT_RUN})
  --out <dir>             Diagnostic output directory (default: ${DEFAULT_OUT})
  --ids <csv>             Row ids/publication ids to include
  --file <id>             Add one row id/publication id; repeatable
  --analyze-source        Analyze source PDFs when no remediated PDF artifact exists
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
  const file = join(runDir, 'remediate.results.json');
  const rows = JSON.parse(await readFile(file, 'utf8')) as RunRow[];
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

function firstPageLines(snapshot: DocumentSnapshot | null): string[] {
  return (snapshot?.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function relevantHeadingTools(row: RunRow | undefined): Array<Record<string, unknown>> {
  return (row?.appliedTools ?? [])
    .filter(tool => /heading|structure|ocr|tag_native|ensure_accessibility|figure_alt|retag|link|artifact/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? '',
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
      delta: typeof tool.delta === 'number' ? tool.delta : null,
      source: tool.source ?? null,
      note: typeof tool.details === 'string' ? tool.details.slice(0, 220) : null,
    }));
}

function ownerCount(snapshot: DocumentSnapshot | null): number {
  if (!snapshot) return 0;
  return (snapshot.mcidTextSpans?.length ?? 0) +
    (snapshot.paragraphStructElems?.length ?? 0) +
    snapshot.headings.length +
    snapshot.figures.length +
    snapshot.tables.length;
}

function figureAltDebt(snapshot: DocumentSnapshot | null, row: RunRow | undefined, analysis: AnalysisResult | null): boolean {
  const altText = categoryScore(row?.afterCategories, 'alt_text') ?? analysisCategoryScore(analysis, 'alt_text') ?? 100;
  const figureSignals = snapshot?.detectionProfile?.figureSignals;
  return altText < 80 ||
    ((figureSignals?.extractedFigureCount ?? 0) > (figureSignals?.treeFigureCount ?? 0)) ||
    figureSignals?.treeFigureMissingForExtractedFigures === true;
}

function headingVolatilitySignal(snapshot: DocumentSnapshot | null): boolean {
  const headingSignals = snapshot?.detectionProfile?.headingSignals;
  return Boolean(
    (headingSignals?.extractedHeadingCount ?? 0) > 0 &&
    (headingSignals?.treeHeadingCount ?? 0) === 0 &&
    headingSignals?.extractedHeadingsMissingFromTree === true,
  );
}

function nativeCandidateExists(analysis: AnalysisResult | null, snapshot: DocumentSnapshot | null): boolean {
  if (!analysis || !snapshot) return false;
  const tagged = classifyTaggedZeroHeadingAnchor(analysis, snapshot);
  if (tagged.classification === 'tagged_zero_heading_anchor_candidate' && tagged.candidate) return true;
  const partial = classifyPartialHeadingReachability(analysis, snapshot);
  if (
    (partial.classification === 'safe_partial_heading_anchor_candidate' ||
      partial.classification === 'split_mcid_heading_anchor_candidate') &&
    partial.candidate
  ) {
    return true;
  }
  return Boolean(selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot));
}

function safeCandidateSummary(analysis: AnalysisResult | null, snapshot: DocumentSnapshot | null): Record<string, unknown> | null {
  if (!analysis || !snapshot) return null;
  const stage153 = classifyStage153HeadingZeroResidual(analysis, snapshot);
  const ocr = selectOcrPageShellHeadingCandidate(analysis, snapshot);
  const tagged = classifyTaggedZeroHeadingAnchor(analysis, snapshot);
  const partial = classifyPartialHeadingReachability(analysis, snapshot);
  const candidate = ocr ?? stage153.candidate ?? tagged.candidate ?? partial.candidate ?? null;
  return {
    stage153Class: stage153.classification,
    stage153Reasons: stage153.reasons,
    candidate: candidate ? {
      text: candidate.text,
      page: candidate.page,
      mcid: 'mcid' in candidate ? candidate.mcid : undefined,
      mcids: 'mcids' in candidate ? candidate.mcids : undefined,
      source: candidate.source,
      score: candidate.score,
      reasons: candidate.reasons,
    } : null,
    taggedClass: tagged.classification,
    taggedReasons: tagged.reasons,
    partialClass: partial.classification,
    partialReasons: partial.reasons,
  };
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
    const runRow = runRows.get(manifestRow.id) ?? runRows.get(manifestRow.publicationId);
    const analyzed = await analyzeRowPdf(runDir, manifestRow, analyzeSource);
    const analysis = analyzed.analysis;
    const snapshot = analyzed.snapshot;
    const isOcr = analysis && snapshot ? isOcrPageShell(snapshot, analysis) : false;
    const ocrCandidate = analysis && snapshot ? selectOcrPageShellHeadingCandidate(analysis, snapshot) : null;
    const classification = classifyStage168ZeroHeading({
      id: manifestRow.id,
      isPrimary: PRIMARY_IDS.has(manifestRow.id),
      headingStructure: categoryScore(runRow?.afterCategories, 'heading_structure') ?? analysisCategoryScore(analysis, 'heading_structure'),
      textExtractability: categoryScore(runRow?.afterCategories, 'text_extractability') ?? analysisCategoryScore(analysis, 'text_extractability'),
      pdfClass: analysis?.pdfClass ?? runRow?.afterPdfClass ?? 'unknown',
      isOcr,
      ownerCount: ownerCount(snapshot),
      hasOcrCandidate: Boolean(ocrCandidate),
      hasNativeCandidate: nativeCandidateExists(analysis, snapshot),
      hasFigureAltDebt: figureAltDebt(snapshot, runRow, analysis),
      hasHeadingVolatilitySignal: headingVolatilitySignal(snapshot),
    });
    const ocrDebug = analysis && snapshot ? debugOcrPageShellHeadingSelection(analysis, snapshot) : null;
    records.push({
      id: manifestRow.id,
      publicationId: manifestRow.publicationId,
      title: manifestRow.title,
      file: manifestRow.localFile,
      isPrimary: PRIMARY_IDS.has(manifestRow.id),
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
        heading_structure: categoryScore(runRow?.afterCategories, 'heading_structure') ?? analysisCategoryScore(analysis, 'heading_structure'),
        reading_order: categoryScore(runRow?.afterCategories, 'reading_order') ?? analysisCategoryScore(analysis, 'reading_order'),
        text_extractability: categoryScore(runRow?.afterCategories, 'text_extractability') ?? analysisCategoryScore(analysis, 'text_extractability'),
        alt_text: categoryScore(runRow?.afterCategories, 'alt_text') ?? analysisCategoryScore(analysis, 'alt_text'),
        pdf_ua_compliance: categoryScore(runRow?.afterCategories, 'pdf_ua_compliance') ?? analysisCategoryScore(analysis, 'pdf_ua_compliance'),
        link_quality: categoryScore(runRow?.afterCategories, 'link_quality') ?? analysisCategoryScore(analysis, 'link_quality'),
        table_markup: categoryScore(runRow?.afterCategories, 'table_markup') ?? analysisCategoryScore(analysis, 'table_markup'),
      },
      signals: snapshot ? {
        pageCount: snapshot.pageCount,
        textCharCount: snapshot.textCharCount,
        isTagged: snapshot.isTagged,
        isOcr,
        structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
        degenerateStructureTree: snapshot.detectionProfile?.readingOrderSignals.degenerateStructureTree ?? null,
        extractedHeadingCount: snapshot.detectionProfile?.headingSignals.extractedHeadingCount ?? snapshot.headings.length,
        treeHeadingCount: snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? snapshot.headings.length,
        extractedHeadingsMissingFromTree: snapshot.detectionProfile?.headingSignals.extractedHeadingsMissingFromTree ?? false,
        ownerCount: ownerCount(snapshot),
        mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
        paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
        extractedFigureCount: snapshot.detectionProfile?.figureSignals.extractedFigureCount ?? snapshot.figures.length,
        treeFigureCount: snapshot.detectionProfile?.figureSignals.treeFigureCount ?? snapshot.figures.length,
        treeFigureMissingForExtractedFigures: snapshot.detectionProfile?.figureSignals.treeFigureMissingForExtractedFigures ?? false,
        suspectedPathPaintOutsideMc: snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0,
      } : null,
      classification,
      candidateSummary: safeCandidateSummary(analysis, snapshot),
      firstPageVisibleLines: firstPageLines(snapshot),
      metadataTitle: snapshot?.metadata.title ?? null,
      bookmarkSeeds: (snapshot?.bookmarks ?? []).slice(0, 8).map(bookmark => bookmark.title),
      ocrSeedDiagnostics: ocrDebug?.seeds ?? [],
      ocrFirstPageMcidSamples: ocrDebug?.firstPageMcidSpanSamples ?? [],
      paragraphSamples: (snapshot?.paragraphStructElems ?? [])
        .filter(row => row.page === 0)
        .slice(0, 8)
        .map(row => ({ text: row.text, tag: row.tag, structRef: row.structRef, reachable: row.reachable })),
      headingToolTimeline: relevantHeadingTools(runRow),
    });
  }

  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.classification.classification;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const selectedRows = records
    .filter(record => record.isPrimary && record.classification.implementable)
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
        ? 'implement_safe_heading_anchor_recovery'
        : 'diagnostic_only_no_safe_heading_anchor',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage168-zero-heading-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 168 Fresh Holdout Zero-Heading Diagnostic', '', `Run: \`${runDir}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Selected rows: ${selectedRows.length ? selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Score | Class | Reason | Candidate | Key lows |');
  lines.push('|---|---:|---|---|---|---|');
  for (const record of records) {
    const candidate = record.candidateSummary?.candidate as { text?: string; source?: string; score?: number } | null | undefined;
    const lows = Object.entries(record.categories)
      .filter(([, value]) => typeof value === 'number' && value < 80)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    lines.push([
      `\`${record.id}\``,
      `${record.benchmark.afterScore ?? record.analysisScore ?? 'n/a'}/${record.benchmark.afterGrade ?? record.analysisGrade ?? 'n/a'}`,
      record.classification.classification,
      record.classification.reason,
      candidate ? `${candidate.text} (${candidate.source}, ${candidate.score})` : 'none',
      lows || 'none',
    ].join(' | '));
  }
  lines.push('');
  for (const record of records.filter(row => row.isPrimary)) {
    lines.push(`## ${record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title}`);
    lines.push(`- Classification: ${record.classification.classification} (${record.classification.reason})`);
    lines.push(`- Analyzed source: ${record.analyzedSource}`);
    lines.push(`- Signals: ${JSON.stringify(record.signals)}`);
    lines.push(`- Candidate summary: ${JSON.stringify(record.candidateSummary)}`);
    lines.push(`- First-page lines: ${record.firstPageVisibleLines.slice(0, 8).join(' | ') || 'none'}`);
    lines.push(`- Heading/structure tools: ${record.headingToolTimeline.map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore}->${tool.scoreAfter}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage168-zero-heading-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 168 zero-heading diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

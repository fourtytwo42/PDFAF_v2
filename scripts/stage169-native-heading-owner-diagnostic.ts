#!/usr/bin/env tsx
import 'dotenv/config';

import { execFile } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PYTHON_SCRIPT_PATH } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { classifyStage153HeadingZeroResidual } from '../src/services/remediation/headingZeroResidual.js';
import {
  classifyPartialHeadingReachability,
  classifyTaggedZeroHeadingAnchor,
  classifyStage127ZeroHeadingAnchor,
  isOcrPageShell,
  selectTaggedVisibleHeadingAnchorCandidate,
} from '../src/services/remediation/visibleHeadingAnchor.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const execFileAsync = promisify(execFile);

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_holdout_5/manifest.json';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_holdout_5/stage169-native-heading-owner-diagnostic-2026-04-30-r1';
const DEFAULT_RUNS = {
  stage167: 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage167-baseline-2026-04-30-r1',
  stage168Focused: 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage168-target-zero-heading-2026-04-30-r1',
  stage168Full: 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage168-full-holdout5-2026-04-30-r1',
  stage169Target: 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage169-target-native-heading-2026-04-30-r1',
};
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage168-full-2026-04-30-r1';
const DEFAULT_IDS = ['v1-4657', 'v1-4760', 'v1-4553', 'v1-3443', 'v1-3430', 'v1-3432'];
const PRIMARY_IDS = new Set(['v1-4657', 'v1-4760']);
const VOLATILITY_IDS = new Set(['v1-4553']);
const DEFAULT_LEGACY_CONTROL_IDS = ['fixture-inaccessible', 'figure-4754', 'font-4156', 'font-4172', 'font-4699'];

export type Stage169NativeHeadingClass =
  | 'native_content_owned_title_candidate'
  | 'native_visible_title_without_owner'
  | 'native_structure_bootstrap_required'
  | 'figure_alt_after_heading_candidate'
  | 'route_order_volatility'
  | 'same_buffer_analyzer_variance'
  | 'no_safe_anchor';

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
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterPdfClass?: string;
  afterCategories?: RunCategory[];
  reanalyzedCategories?: RunCategory[];
  appliedTools?: RunTool[];
}

export interface Stage169ClassificationInput {
  id: string;
  isPrimary: boolean;
  isVolatilityControl: boolean;
  headingStructure: number | null;
  textExtractability: number | null;
  pdfClass: string;
  isOcr: boolean;
  hasNativeCandidate: boolean;
  hasVisibleTitle: boolean;
  ownerCount: number;
  firstPageMcidCount: number;
  firstPageParagraphCount: number;
  structureDepth: number | null;
  hasBtEtEvidence: boolean;
  hasFigureAltDebt: boolean;
  scoreRange: number;
  sameBufferScoreRange?: number | null;
}

export interface Stage169Classification {
  classification: Stage169NativeHeadingClass;
  implementable: boolean;
  reason: string;
}

export function classifyStage169NativeHeading(input: Stage169ClassificationInput): Stage169Classification {
  if (input.sameBufferScoreRange != null && input.sameBufferScoreRange >= 10) {
    return { classification: 'same_buffer_analyzer_variance', implementable: false, reason: `same-buffer score range ${input.sameBufferScoreRange}` };
  }
  if (!input.isPrimary && !input.isVolatilityControl) {
    return { classification: 'no_safe_anchor', implementable: false, reason: 'control row' };
  }
  if (input.isVolatilityControl || input.scoreRange >= 20) {
    return { classification: 'route_order_volatility', implementable: false, reason: input.isVolatilityControl ? 'volatility control row' : `score range ${input.scoreRange}` };
  }
  if ((input.headingStructure ?? 100) > 0) {
    return { classification: 'no_safe_anchor', implementable: false, reason: `heading_structure:${input.headingStructure}` };
  }
  if (input.isOcr || input.pdfClass !== 'native_tagged') {
    return { classification: 'no_safe_anchor', implementable: false, reason: `not native tagged:${input.pdfClass}` };
  }
  if ((input.textExtractability ?? 0) < 90) {
    return { classification: 'no_safe_anchor', implementable: false, reason: 'text extractability below native heading threshold' };
  }
  if (input.hasNativeCandidate) {
    if (input.hasFigureAltDebt) {
      return { classification: 'figure_alt_after_heading_candidate', implementable: true, reason: 'safe native heading candidate exists, with separate figure-alt debt' };
    }
    return { classification: 'native_content_owned_title_candidate', implementable: true, reason: 'safe native heading candidate has content ownership' };
  }
  if (input.hasVisibleTitle && input.firstPageMcidCount + input.firstPageParagraphCount <= 0) {
    if ((input.structureDepth ?? 0) <= 2 || input.hasBtEtEvidence) {
      return { classification: 'native_structure_bootstrap_required', implementable: true, reason: 'visible first-page title lacks owner but raw text groups are available' };
    }
    return { classification: 'native_visible_title_without_owner', implementable: false, reason: 'visible first-page title has no safe MCID or paragraph owner' };
  }
  if (input.hasVisibleTitle && input.ownerCount > 0) {
    return { classification: 'native_visible_title_without_owner', implementable: false, reason: 'visible title exists but is not tied to a safe title-like owner' };
  }
  return { classification: 'no_safe_anchor', implementable: false, reason: 'no safe native title anchor evidence' };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage169-native-heading-owner-diagnostic.ts [options]

Options:
  --manifest <path>          Holdout manifest (default: ${DEFAULT_MANIFEST})
  --stage167-run <dir>       Stage 167 run directory
  --stage168-focused-run <dir>
  --stage168-full-run <dir>
  --stage169-target-run <dir>
  --legacy-run <dir>         Original-50 control run (default: ${DEFAULT_LEGACY_RUN})
  --out <dir>                Output directory (default: ${DEFAULT_OUT})
  --ids <csv>                Holdout row ids/publication ids to include
  --file <id>                Add one holdout row id/publication id; repeatable
  --legacy-control-ids <csv> Original-50 control ids
  --help                     Show this help`;
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

async function maybeLoadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  try {
    return await loadRunRows(runDir);
  } catch {
    return new Map();
  }
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

async function selectAnalysisPdf(runDirs: string[], row: EdgeMixManifestRow): Promise<{ path: string; source: string }> {
  for (const runDir of runDirs) {
    const pdf = await findRemediatedPdf(runDir, row);
    if (pdf && await fileExists(pdf)) return { path: pdf, source: runDir };
  }
  return { path: row.absolutePath, source: 'source_pdf' };
}

function firstPageLines(snapshot: DocumentSnapshot | null): string[] {
  return (snapshot?.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 14);
}

function firstPageMcidSamples(snapshot: DocumentSnapshot | null): Array<Record<string, unknown>> {
  return (snapshot?.mcidTextSpans ?? [])
    .filter(row => row.page === 0)
    .slice(0, 24)
    .map(row => ({
      mcid: row.mcid,
      text: (row.resolvedText ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
      snippet: row.snippet.slice(0, 180),
    }));
}

function firstPageParagraphSamples(snapshot: DocumentSnapshot | null): Array<Record<string, unknown>> {
  return (snapshot?.paragraphStructElems ?? [])
    .filter(row => row.page === 0)
    .slice(0, 18)
    .map(row => ({
      tag: row.tag,
      text: row.text.replace(/\s+/g, ' ').trim().slice(0, 180),
      structRef: row.structRef,
      reachable: row.reachable,
      directContent: row.directContent,
      parentPath: row.parentPath,
    }));
}

function visibleTitleCandidate(lines: string[]): string | null {
  const joined = lines.slice(0, 8).join(' ').replace(/\s+/g, ' ').trim();
  if (!joined || joined.length < 8) return null;
  if (/^(vol\.|issn|page\s+\d+)/i.test(joined)) {
    const later = lines.slice(1, 10).join(' ').replace(/\s+/g, ' ').trim();
    return later.length >= 8 ? later.slice(0, 180) : null;
  }
  return joined.slice(0, 180);
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

function relevantTools(row: RunRow | undefined): Array<Record<string, unknown>> {
  return (row?.appliedTools ?? [])
    .filter(tool => /heading|structure|layout|artifact|orphan|figure|alt|annotation|link/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? '',
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
      source: tool.source ?? null,
      note: typeof tool.details === 'string' ? tool.details.slice(0, 220) : null,
    }));
}

function scoreRange(rows: Array<RunRow | undefined>): number {
  const scores = rows
    .map(row => row?.reanalyzedScore ?? row?.afterScore)
    .filter((value): value is number => typeof value === 'number');
  if (scores.length < 2) return 0;
  return Math.max(...scores) - Math.min(...scores);
}

async function dumpStructurePage(pdfPath: string): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await execFileAsync('python3', [PYTHON_SCRIPT_PATH, '--dump-structure-page', '0', pdfPath], {
      maxBuffer: 2 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof parsed['contentSnippet'] === 'string') {
      parsed['contentSnippet'] = parsed['contentSnippet'].slice(0, 1500);
    }
    return parsed;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function hasBtEtEvidence(structDump: Record<string, unknown> | null): boolean {
  const snippet = typeof structDump?.['contentSnippet'] === 'string' ? structDump['contentSnippet'] : '';
  return /\bBT\b[\s\S]{0,800}\bET\b/.test(snippet);
}

function runSummary(row: RunRow | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    beforeScore: row.beforeScore ?? null,
    beforeGrade: row.beforeGrade ?? null,
    afterScore: row.afterScore ?? null,
    afterGrade: row.afterGrade ?? null,
    reanalyzedScore: row.reanalyzedScore ?? null,
    reanalyzedGrade: row.reanalyzedGrade ?? null,
    headingStructure: categoryScore(row.reanalyzedCategories, 'heading_structure') ?? categoryScore(row.afterCategories, 'heading_structure'),
    readingOrder: categoryScore(row.reanalyzedCategories, 'reading_order') ?? categoryScore(row.afterCategories, 'reading_order'),
    altText: categoryScore(row.reanalyzedCategories, 'alt_text') ?? categoryScore(row.afterCategories, 'alt_text'),
    pdfUaCompliance: categoryScore(row.reanalyzedCategories, 'pdf_ua_compliance') ?? categoryScore(row.afterCategories, 'pdf_ua_compliance'),
  };
}

function candidateSummary(analysis: AnalysisResult, snapshot: DocumentSnapshot): Record<string, unknown> {
  const tagged = classifyTaggedZeroHeadingAnchor(analysis, snapshot);
  const partial = classifyPartialHeadingReachability(analysis, snapshot);
  const stage127 = classifyStage127ZeroHeadingAnchor(analysis, snapshot);
  const stage153 = classifyStage153HeadingZeroResidual(analysis, snapshot);
  const candidate = selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot);
  return {
    taggedClass: tagged.classification,
    taggedReasons: tagged.reasons,
    partialClass: partial.classification,
    partialReasons: partial.reasons,
    stage127Class: stage127.classification,
    stage127Reasons: stage127.reasons,
    stage153Class: stage153.classification,
    stage153Reasons: stage153.reasons,
    selectedCandidate: candidate ? {
      text: candidate.text,
      page: candidate.page,
      mcid: candidate.mcid,
      mcids: candidate.mcids,
      targetRef: candidate.targetRef,
      source: candidate.source,
      score: candidate.score,
      reasons: candidate.reasons,
    } : null,
  };
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const manifestPath = argValue('--manifest') ?? DEFAULT_MANIFEST;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const runDirs = {
    stage167: argValue('--stage167-run') ?? DEFAULT_RUNS.stage167,
    stage168Focused: argValue('--stage168-focused-run') ?? DEFAULT_RUNS.stage168Focused,
    stage168Full: argValue('--stage168-full-run') ?? DEFAULT_RUNS.stage168Full,
    stage169Target: argValue('--stage169-target-run') ?? DEFAULT_RUNS.stage169Target,
  };
  const legacyRun = argValue('--legacy-run') ?? DEFAULT_LEGACY_RUN;
  const ids = new Set([...DEFAULT_IDS, ...csvArg('--ids'), ...repeatedArg('--file')].filter(Boolean));
  const legacyControlIds = csvArg('--legacy-control-ids');
  const legacyControls = legacyControlIds.length > 0 ? legacyControlIds : DEFAULT_LEGACY_CONTROL_IDS;
  const manifestRows = (await loadEdgeMixManifest(manifestPath)).filter(row => rowIdMatches(row, ids));
  const runMaps = {
    stage167: await maybeLoadRunRows(runDirs.stage167),
    stage168Focused: await maybeLoadRunRows(runDirs.stage168Focused),
    stage168Full: await maybeLoadRunRows(runDirs.stage168Full),
    stage169Target: await maybeLoadRunRows(runDirs.stage169Target),
  };
  const legacyRows = await maybeLoadRunRows(legacyRun);

  const records = [];
  for (const manifestRow of manifestRows) {
    const rowsByRun = {
      stage167: runMaps.stage167.get(manifestRow.id) ?? runMaps.stage167.get(manifestRow.publicationId),
      stage168Focused: runMaps.stage168Focused.get(manifestRow.id) ?? runMaps.stage168Focused.get(manifestRow.publicationId),
      stage168Full: runMaps.stage168Full.get(manifestRow.id) ?? runMaps.stage168Full.get(manifestRow.publicationId),
      stage169Target: runMaps.stage169Target.get(manifestRow.id) ?? runMaps.stage169Target.get(manifestRow.publicationId),
    };
    const analysisPdf = await selectAnalysisPdf([runDirs.stage169Target, runDirs.stage168Focused], manifestRow);
    const analyzed = await analyzePdf(analysisPdf.path, basename(analysisPdf.path), { bypassCache: true });
    const analysis = analyzed.result;
    const snapshot = analyzed.snapshot;
    const lines = firstPageLines(snapshot);
    const structDump = await dumpStructurePage(analysisPdf.path);
    const heading = categoryScore(rowsByRun.stage169Target?.afterCategories, 'heading_structure') ?? analysisCategoryScore(analysis, 'heading_structure');
    const textExtractability = categoryScore(rowsByRun.stage169Target?.afterCategories, 'text_extractability') ?? analysisCategoryScore(analysis, 'text_extractability');
    const firstPageMcids = (snapshot.mcidTextSpans ?? []).filter(row => row.page === 0).length;
    const firstPageParagraphs = (snapshot.paragraphStructElems ?? []).filter(row => row.page === 0 && row.text.trim().length > 0).length;
    const selectedCandidate = selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot);
    const classification = classifyStage169NativeHeading({
      id: manifestRow.id,
      isPrimary: PRIMARY_IDS.has(manifestRow.id),
      isVolatilityControl: VOLATILITY_IDS.has(manifestRow.id),
      headingStructure: heading,
      textExtractability,
      pdfClass: analysis.pdfClass,
      isOcr: isOcrPageShell(snapshot, analysis),
      hasNativeCandidate: Boolean(selectedCandidate),
      hasVisibleTitle: Boolean(visibleTitleCandidate(lines)),
      ownerCount: ownerCount(snapshot),
      firstPageMcidCount: firstPageMcids,
      firstPageParagraphCount: firstPageParagraphs,
      structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
      hasBtEtEvidence: hasBtEtEvidence(structDump),
      hasFigureAltDebt: figureAltDebt(snapshot, rowsByRun.stage169Target, analysis),
      scoreRange: scoreRange(Object.values(rowsByRun)),
    });
    records.push({
      id: manifestRow.id,
      publicationId: manifestRow.publicationId,
      title: manifestRow.title,
      file: manifestRow.localFile,
      role: PRIMARY_IDS.has(manifestRow.id) ? 'primary' : VOLATILITY_IDS.has(manifestRow.id) ? 'volatility_control' : 'control',
      runs: {
        stage167: runSummary(rowsByRun.stage167),
        stage168Focused: runSummary(rowsByRun.stage168Focused),
        stage168Full: runSummary(rowsByRun.stage168Full),
        stage169Target: runSummary(rowsByRun.stage169Target),
      },
      analysisPdf: analysisPdf.path,
      analysisPdfSource: analysisPdf.source,
      analysis: {
        score: analysis.score,
        grade: analysis.grade,
        pdfClass: analysis.pdfClass,
        isOcr: isOcrPageShell(snapshot, analysis),
      },
      categories: {
        heading_structure: heading,
        reading_order: categoryScore(rowsByRun.stage169Target?.afterCategories, 'reading_order') ?? analysisCategoryScore(analysis, 'reading_order'),
        text_extractability: textExtractability,
        alt_text: categoryScore(rowsByRun.stage169Target?.afterCategories, 'alt_text') ?? analysisCategoryScore(analysis, 'alt_text'),
        pdf_ua_compliance: categoryScore(rowsByRun.stage169Target?.afterCategories, 'pdf_ua_compliance') ?? analysisCategoryScore(analysis, 'pdf_ua_compliance'),
        link_quality: categoryScore(rowsByRun.stage169Target?.afterCategories, 'link_quality') ?? analysisCategoryScore(analysis, 'link_quality'),
        table_markup: categoryScore(rowsByRun.stage169Target?.afterCategories, 'table_markup') ?? analysisCategoryScore(analysis, 'table_markup'),
      },
      signals: {
        pageCount: snapshot.pageCount,
        textCharCount: snapshot.textCharCount,
        isTagged: snapshot.isTagged,
        structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
        degenerateStructureTree: snapshot.detectionProfile?.readingOrderSignals.degenerateStructureTree ?? null,
        treeHeadingCount: snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? snapshot.headings.length,
        extractedHeadingCount: snapshot.detectionProfile?.headingSignals.extractedHeadingCount ?? snapshot.headings.length,
        extractedHeadingsMissingFromTree: snapshot.detectionProfile?.headingSignals.extractedHeadingsMissingFromTree ?? false,
        ownerCount: ownerCount(snapshot),
        mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
        firstPageMcidCount: firstPageMcids,
        paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
        firstPageParagraphCount: firstPageParagraphs,
        extractedFigureCount: snapshot.detectionProfile?.figureSignals.extractedFigureCount ?? snapshot.figures.length,
        treeFigureCount: snapshot.detectionProfile?.figureSignals.treeFigureCount ?? snapshot.figures.length,
        suspectedPathPaintOutsideMc: snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0,
      },
      classification,
      candidateSummary: candidateSummary(analysis, snapshot),
      firstPageVisibleLines: lines,
      visibleTitleCandidate: visibleTitleCandidate(lines),
      metadataTitle: snapshot.metadata.title ?? snapshot.structTitle ?? null,
      bookmarkSeeds: (snapshot.bookmarks ?? []).slice(0, 10).map(bookmark => bookmark.title),
      firstPageMcidSamples: firstPageMcidSamples(snapshot),
      firstPageParagraphSamples: firstPageParagraphSamples(snapshot),
      structurePageDump: structDump,
      toolTimeline: relevantTools(rowsByRun.stage169Target ?? rowsByRun.stage168Full ?? rowsByRun.stage168Focused),
    });
  }

  const legacyControlRows = legacyControls.map(id => {
    const row = legacyRows.get(id);
    return {
      id,
      run: runSummary(row),
      toolTimeline: relevantTools(row).slice(0, 8),
    };
  });
  const distribution = records.reduce<Record<string, number>>((acc, row) => {
    const key = row.classification.classification;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const selectedRows = records
    .filter(row => row.role === 'primary' && row.classification.implementable)
    .map(row => row.id);
  const report = {
    generatedAt: new Date().toISOString(),
    manifest: resolve(manifestPath),
    runDirs: Object.fromEntries(Object.entries(runDirs).map(([key, value]) => [key, resolve(value)])),
    legacyRun: resolve(legacyRun),
    records,
    legacyControlRows,
    decision: {
      distribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0
        ? 'implement_native_heading_owner_recovery'
        : 'diagnostic_only_park_no_safe_native_anchor',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage169-native-heading-owner-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 169 Native Heading Owner Diagnostic', '', `Target run: \`${runDirs.stage169Target}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Selected rows: ${selectedRows.length ? selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Stage167 | Stage168 full | Stage169 target | Class | Reason | Candidate |');
  lines.push('|---|---|---:|---:|---:|---|---|---|');
  for (const row of records) {
    const candidate = row.candidateSummary.selectedCandidate as { text?: string; source?: string; score?: number } | null;
    const score = (run: Record<string, unknown> | null) => run ? `${run.afterScore ?? 'n/a'}/${run.afterGrade ?? 'n/a'}` : 'n/a';
    lines.push([
      `\`${row.id}\``,
      row.role,
      score(row.runs.stage167),
      score(row.runs.stage168Full),
      score(row.runs.stage169Target),
      row.classification.classification,
      row.classification.reason,
      candidate ? `${candidate.text} (${candidate.source}, ${candidate.score})` : 'none',
    ].join(' | '));
  }
  lines.push('');
  for (const row of records.filter(item => item.role !== 'control')) {
    lines.push(`## ${row.id}`);
    lines.push('');
    lines.push(`- Classification: ${row.classification.classification} (${row.classification.reason})`);
    lines.push(`- Visible title candidate: ${row.visibleTitleCandidate ?? 'none'}`);
    lines.push(`- Candidate summary: ${JSON.stringify(row.candidateSummary)}`);
    lines.push(`- Signals: ${JSON.stringify(row.signals)}`);
    lines.push(`- First-page lines: ${row.firstPageVisibleLines.join(' | ') || 'none'}`);
    lines.push(`- MCID samples: ${JSON.stringify(row.firstPageMcidSamples.slice(0, 8))}`);
    lines.push(`- Paragraph samples: ${JSON.stringify(row.firstPageParagraphSamples.slice(0, 6))}`);
    lines.push(`- Structure dump: ${JSON.stringify({
      structTreeRootPresent: row.structurePageDump?.['structTreeRootPresent'],
      parentTreeNumsPairCount: row.structurePageDump?.['parentTreeNumsPairCount'],
      pageDictKeys: row.structurePageDump?.['pageDictKeys'],
      mcidMatches: row.structurePageDump?.['mcidMatches'],
    })}`);
    lines.push(`- Tool timeline: ${row.toolTimeline.map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore}->${tool.scoreAfter}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  lines.push('## Legacy Controls');
  lines.push('');
  lines.push('| Row | Score | Reanalyzed | Key categories |');
  lines.push('|---|---:|---:|---|');
  for (const row of legacyControlRows) {
    const run = row.run as Record<string, unknown> | null;
    lines.push(`| \`${row.id}\` | ${run ? `${run.afterScore}/${run.afterGrade}` : 'missing'} | ${run ? `${run.reanalyzedScore ?? 'n/a'}/${run.reanalyzedGrade ?? 'n/a'}` : 'missing'} | ${run ? `heading:${run.headingStructure}, reading:${run.readingOrder}, alt:${run.altText}, pdfua:${run.pdfUaCompliance}` : 'missing'} |`);
  }
  await writeFile(join(outDir, 'stage169-native-heading-owner-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 169 native heading owner diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

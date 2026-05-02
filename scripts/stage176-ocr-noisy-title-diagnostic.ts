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

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_2/manifest.json';
const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_hard_2/run-stage176-failures-written-2026-05-02-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_2/stage176-ocr-noisy-title-diagnostic-2026-05-02-r1';
const DEFAULT_IDS = ['v1-3510', 'v1-3508', 'v1-4105'];
const PRIMARY_IDS = new Set(['v1-3510', '3510']);
const MIXED_IDS = new Set(['v1-4105', '4105']);

export type Stage176OcrNoisyTitleClass =
  | 'ocr_noisy_split_title_candidate'
  | 'ocr_title_visible_but_too_weak'
  | 'ocr_owner_missing'
  | 'collection_cover_not_this_stage'
  | 'already_fixed_control'
  | 'mixed_not_heading_stage';

export interface Stage176OcrNoisyTitleInput {
  role: 'primary' | 'control' | 'mixed_control';
  headingStructure: number | null;
  textExtractability: number | null;
  isOcr: boolean;
  hasMcidOwner: boolean;
  hasNoisyCandidate: boolean;
  hasAnySafeCandidate: boolean;
  collectionCoverDetected: boolean;
  visibleTitleTokenHits: number;
}

export function classifyStage176OcrNoisyTitle(input: Stage176OcrNoisyTitleInput): {
  classification: Stage176OcrNoisyTitleClass;
  implementable: boolean;
  reason: string;
} {
  if (input.role === 'mixed_control') {
    return { classification: 'mixed_not_heading_stage', implementable: false, reason: 'mixed structural row parked for a separate stage' };
  }
  if ((input.headingStructure ?? 100) > 0) {
    return { classification: 'already_fixed_control', implementable: false, reason: `heading_structure:${input.headingStructure}` };
  }
  if (input.role !== 'primary') {
    return { classification: 'already_fixed_control', implementable: false, reason: 'non-primary zero-heading control' };
  }
  if (!input.isOcr || (input.textExtractability ?? 0) < 60) {
    return { classification: 'ocr_owner_missing', implementable: false, reason: 'not an extractable OCR page shell' };
  }
  if (!input.hasMcidOwner) {
    return { classification: 'ocr_owner_missing', implementable: false, reason: 'no first-page OCR MCID ownership' };
  }
  if (input.hasNoisyCandidate) {
    return { classification: 'ocr_noisy_split_title_candidate', implementable: true, reason: 'safe noisy/split metadata title window is MCID-owned' };
  }
  if (input.hasAnySafeCandidate) {
    return { classification: 'already_fixed_control', implementable: false, reason: 'current OCR heading selector already finds a safe candidate' };
  }
  if (input.collectionCoverDetected) {
    return { classification: 'collection_cover_not_this_stage', implementable: false, reason: 'collection-cover title-page logic owns this class' };
  }
  return {
    classification: 'ocr_title_visible_but_too_weak',
    implementable: false,
    reason: input.visibleTitleTokenHits > 0
      ? `${input.visibleTitleTokenHits} title tokens visible but no safe noisy title window`
      : 'title tokens not visibly recoverable in first-page OCR text',
  };
}

interface RunCategory { key?: string; score?: number; applicable?: boolean }
interface RunTool { toolName?: string; outcome?: string; scoreBefore?: number; scoreAfter?: number; delta?: number; details?: unknown; source?: string }
interface RunRow {
  id?: string;
  publicationId?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: RunCategory[];
  appliedTools?: RunTool[];
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage176-ocr-noisy-title-diagnostic.ts [options]

Options:
  --manifest <path>       Manifest path (default: ${DEFAULT_MANIFEST})
  --run <dir>             Benchmark run directory (default: ${DEFAULT_RUN})
  --out <dir>             Diagnostic output directory (default: ${DEFAULT_OUT})
  --ids <csv>             Row ids/publication ids to include
  --file <id>             Add one row id/publication id; repeatable
  --analyze-source        Analyze source PDF if no written final PDF exists
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

function visibleTitleTokenHits(snapshot: DocumentSnapshot | null, row: EdgeMixManifestRow): number {
  if (!snapshot) return 0;
  const text = (snapshot.textByPage[0] ?? '').toLowerCase();
  const tokens = [snapshot.metadata.title, row.title, row.localFile]
    .flatMap(value => alphaTokens(value))
    .filter(token => token.length >= 4 && !['manual', 'scanned', 'remediated'].includes(token));
  return [...new Set(tokens)].filter(token => text.includes(token)).length;
}

function firstPageLines(snapshot: DocumentSnapshot | null): string[] {
  return (snapshot?.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function toolTimeline(row: RunRow | undefined): Array<Record<string, unknown>> {
  return (row?.appliedTools ?? [])
    .filter(tool => /ocr|heading|structure|tag|reading/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? '',
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
      delta: typeof tool.delta === 'number' ? tool.delta : null,
      source: tool.source ?? null,
      details: typeof tool.details === 'string' ? tool.details.slice(0, 240) : null,
    }));
}

function roleFor(row: EdgeMixManifestRow): 'primary' | 'control' | 'mixed_control' {
  if (MIXED_IDS.has(row.id) || MIXED_IDS.has(row.publicationId)) return 'mixed_control';
  if (PRIMARY_IDS.has(row.id) || PRIMARY_IDS.has(row.publicationId)) return 'primary';
  return 'control';
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
    const candidate = analysis && snapshot ? selectOcrPageShellHeadingCandidate(analysis, snapshot) : null;
    const noisySeed = debug?.seeds.find(seed => seed.noisyMatch === true);
    const headingStructure = categoryScore(runRow?.afterCategories, 'heading_structure') ?? analysisCategoryScore(analysis, 'heading_structure');
    const textExtractability = categoryScore(runRow?.afterCategories, 'text_extractability') ?? analysisCategoryScore(analysis, 'text_extractability');
    const role = roleFor(row);
    const isOcr = Boolean(analysis && snapshot && isOcrPageShell(snapshot, analysis));
    const classification = classifyStage176OcrNoisyTitle({
      role,
      headingStructure,
      textExtractability,
      isOcr,
      hasMcidOwner: (snapshot?.mcidTextSpans ?? []).some(span => span.page === 0 && Number.isInteger(span.mcid)),
      hasNoisyCandidate: Boolean(candidate?.reasons.includes('noisy_split_title_window') || noisySeed),
      hasAnySafeCandidate: Boolean(candidate),
      collectionCoverDetected: debug?.collectionCover?.firstPageLooksLikeCollectionCover === true,
      visibleTitleTokenHits: visibleTitleTokenHits(snapshot, row),
    });
    records.push({
      id: row.id,
      publicationId: row.publicationId,
      role,
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
      categories: {
        heading_structure: headingStructure,
        reading_order: categoryScore(runRow?.afterCategories, 'reading_order') ?? analysisCategoryScore(analysis, 'reading_order'),
        text_extractability: textExtractability,
        alt_text: categoryScore(runRow?.afterCategories, 'alt_text') ?? analysisCategoryScore(analysis, 'alt_text'),
        table_markup: categoryScore(runRow?.afterCategories, 'table_markup') ?? analysisCategoryScore(analysis, 'table_markup'),
        pdf_ua_compliance: categoryScore(runRow?.afterCategories, 'pdf_ua_compliance') ?? analysisCategoryScore(analysis, 'pdf_ua_compliance'),
      },
      signals: snapshot ? {
        pageCount: snapshot.pageCount,
        textCharCount: snapshot.textCharCount,
        isOcr,
        page0McidCount: (snapshot.mcidTextSpans ?? []).filter(span => span.page === 0 && Number.isInteger(span.mcid)).length,
        paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
        treeHeadingCount: snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? null,
        structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
        degenerateStructureTree: snapshot.detectionProfile?.readingOrderSignals.degenerateStructureTree ?? null,
      } : null,
      classification,
      selectedCandidate: candidate,
      noisySeed,
      firstPageLines: firstPageLines(snapshot),
      metadataTitle: snapshot?.metadata.title ?? null,
      seedDiagnostics: debug?.seeds ?? [],
      firstPageMcidSamples: debug?.firstPageMcidSpanSamples ?? [],
      paragraphSamples: debug?.paragraphSamples ?? [],
      toolTimeline: toolTimeline(runRow),
    });
  }
  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    acc[record.classification.classification] = (acc[record.classification.classification] ?? 0) + 1;
    return acc;
  }, {});
  const selectedRows = records.filter(record => record.classification.implementable).map(record => record.id);
  const report = {
    generatedAt: new Date().toISOString(),
    manifest: resolve(manifestPath),
    runDir: resolve(runDir),
    records,
    decision: {
      distribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0
        ? 'implement_ocr_noisy_split_title_anchor'
        : 'diagnostic_only_no_safe_noisy_title_anchor',
    },
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage176-ocr-noisy-title-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const lines = ['# Stage 176 OCR Noisy Split Title Diagnostic', '', `Run: \`${runDir}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Selected rows: ${selectedRows.length ? selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
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
      record.selectedCandidate ? `${record.selectedCandidate.text} (${record.selectedCandidate.source})` : 'none',
      lows || 'none',
    ].join(' | '));
  }
  lines.push('');
  for (const record of records.filter(row => row.role !== 'control')) {
    lines.push(`## ${record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title}`);
    lines.push(`- Classification: ${record.classification.classification} (${record.classification.reason})`);
    lines.push(`- First-page lines: ${record.firstPageLines.slice(0, 8).join(' | ') || 'none'}`);
    lines.push(`- Noisy seed: ${record.noisySeed ? JSON.stringify(record.noisySeed) : 'none'}`);
    lines.push(`- Selected candidate: ${record.selectedCandidate ? JSON.stringify(record.selectedCandidate) : 'none'}`);
    lines.push(`- Tool timeline: ${record.toolTimeline.map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore}->${tool.scoreAfter}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage176-ocr-noisy-title-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 176 OCR noisy title diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

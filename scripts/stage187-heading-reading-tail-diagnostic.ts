#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { classifyStage153HeadingZeroResidual } from '../src/services/remediation/headingZeroResidual.js';
import { classifyStage187HeadingReadingTail } from '../src/services/remediation/stage187HeadingReadingTail.js';
import { debugOcrPageShellHeadingSelection } from '../src/services/remediation/ocrPageShellHeading.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const DEFAULT_SUMMARY = '/tmp/pdfaf-all-input-current-grade-summary.json';
const DEFAULT_OUT = 'Output/stage187-heading-reading-tail-diagnostic-2026-05-03-r1';

const PRIMARY_ZERO = [
  'v1_holdout_4-holdout4-03-2c974ae2',
  '4519',
  '3506',
  '4673',
  'v1_evolve_2-3451',
  'v1_evolve_2-3459',
  'v1_evolve_4-3602',
  'v1_evolve_3-4635',
];

const PRIMARY_PARTIAL = [
  'v1_holdout_4-holdout4-04-27f9d243',
  'legacy-4078-4078-community-reentry-challenges-daunt-exoff',
  'legacy-4188-4188-corrections-data-illustrate-juvenile-inc',
  '4693',
  'v1_edge_mix-4567',
  'v1_edge_mix_2-4171',
  'v1_evolve_2-4614',
  '4427',
  'v1_holdout_5-4760',
  'long-4516',
];

const CONTROLS = [
  'v1_holdout_3-3423',
  'v1_holdout_3-3429',
  'v1_holdout_3-3433',
  'v1_holdout_5-3443',
  'v1_hard_1-3476',
  'v1_hard_2-3510',
  'v1_hard_2-4705',
  'figure-4754',
  'font-4057',
  'font-4172',
];

const KNOWN_VOLATILE = new Set([
  'structure-4076',
  'long-4516',
  'short-4214',
  'short-4176',
  'long-4683',
  'v1_edge_mix-4567',
  'v1_edge_mix_2-4171',
]);

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
  afterCategories?: RunCategory[];
  afterPdfClass?: string;
  afterDetectionProfile?: Record<string, unknown> | null;
  appliedTools?: RunTool[];
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
  totalPipelineMs?: number;
}
interface SummaryFile {
  manifests?: string[];
  resultFiles?: string[];
  below?: Array<{ id: string; source?: string; resultFile?: string }>;
}
interface ManifestRow {
  id: string;
  publicationId: string;
  title: string;
  absolutePath: string;
  localFile: string;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage187-heading-reading-tail-diagnostic.ts [options]

Options:
  --summary <path>              Combined snapshot JSON (default: ${DEFAULT_SUMMARY})
  --out <dir>                   Diagnostic output directory (default: ${DEFAULT_OUT})
  --ids <csv>                   Override target/control ids
  --file <id>                   Add a target/control id; repeatable
  --result-file <path>          Add a remediated results JSON; repeatable
  --manifest <path>             Add a manifest for source path lookup; repeatable
  --analyze-source              Analyze source PDFs when no written remediated PDF exists
  --write-target-manifest <p>   Write a local manifest for the selected rows
  --help                        Show this help`;
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
  const out: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) out.push(process.argv[index + 1]!);
  }
  return out;
}

function categoryScore(categories: RunCategory[] | undefined, key: string): number | null {
  const row = categories?.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function analysisCategoryScore(analysis: AnalysisResult | null, key: string): number | null {
  const row = analysis?.categories.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function normalizeKey(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/^v1-/, '').replace(/^v1_/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function rowKeys(row: RunRow | ManifestRow): Set<string> {
  const keys = new Set<string>();
  const values = [
    'id' in row ? row.id : undefined,
    'publicationId' in row ? row.publicationId : undefined,
    'title' in row ? row.title : undefined,
    'localFile' in row ? row.localFile : undefined,
    'file' in row ? row.file : undefined,
  ];
  for (const value of values) {
    if (!value) continue;
    const text = String(value);
    keys.add(text);
    keys.add(normalizeKey(text));
    const base = basename(text).replace(/\.pdf$/i, '');
    keys.add(base);
    keys.add(normalizeKey(base));
  }
  return keys;
}

function matchesAlias(row: RunRow | ManifestRow, alias: string): boolean {
  const normalizedAlias = normalizeKey(alias);
  for (const key of rowKeys(row)) {
    const normalizedKey = normalizeKey(key);
    if (key === alias || normalizedKey === normalizedAlias) return true;
    if (normalizedKey.endsWith(`-${normalizedAlias}`)) return true;
  }
  return false;
}

function rowsMatch(left: RunRow | ManifestRow, right: RunRow | ManifestRow): boolean {
  const leftKeys = [...rowKeys(left)].map(normalizeKey).filter(Boolean);
  const rightKeys = new Set([...rowKeys(right)].map(normalizeKey).filter(Boolean));
  return leftKeys.some(key => rightKeys.has(key));
}

function rowRole(row: RunRow): 'primary_zero' | 'primary_partial' | 'control' | 'extra' {
  if (PRIMARY_ZERO.some(alias => matchesAlias(row, alias))) return 'primary_zero';
  if (PRIMARY_PARTIAL.some(alias => matchesAlias(row, alias))) return 'primary_partial';
  if (CONTROLS.some(alias => matchesAlias(row, alias))) return 'control';
  return 'extra';
}

function knownVolatile(row: RunRow): boolean {
  return [...KNOWN_VOLATILE].some(alias => matchesAlias(row, alias));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadManifestRows(manifestPaths: string[]): Promise<ManifestRow[]> {
  const rows: ManifestRow[] = [];
  for (const manifestPath of manifestPaths) {
    const absoluteManifest = resolve(manifestPath);
    const root = dirname(absoluteManifest);
    const raw = JSON.parse(await readFile(absoluteManifest, 'utf8')) as unknown;
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { rows?: unknown[] }).rows)
        ? (raw as { rows: unknown[] }).rows
        : [];
    for (const item of items) {
      const obj = item as Record<string, unknown>;
      const id = String(obj.id ?? obj.publicationId ?? obj.file ?? obj.localFile ?? '');
      const publicationId = String(obj.publicationId ?? obj.id ?? id);
      const title = String(obj.title ?? obj.id ?? obj.publicationId ?? '');
      const localFile = String(obj.localFile ?? obj.file ?? '');
      if (!localFile) continue;
      rows.push({
        id,
        publicationId,
        title,
        localFile,
        absolutePath: isAbsolute(localFile) ? localFile : resolve(root, localFile),
      });
    }
  }
  return rows;
}

async function loadResultRows(resultFiles: string[]): Promise<Array<{ row: RunRow; resultFile: string }>> {
  const out: Array<{ row: RunRow; resultFile: string }> = [];
  for (const resultFile of resultFiles) {
    const raw = JSON.parse(await readFile(resultFile, 'utf8')) as unknown;
    const rows = Array.isArray(raw) ? raw as RunRow[] : [raw as RunRow];
    for (const row of rows) out.push({ row, resultFile });
  }
  return out;
}

function uniqueRows(rows: Array<{ row: RunRow; resultFile: string }>): Array<{ row: RunRow; resultFile: string }> {
  const selected = new Map<string, { row: RunRow; resultFile: string }>();
  for (const item of rows) {
    const key = item.row.publicationId ?? item.row.id ?? `${item.resultFile}:${selected.size}`;
    selected.set(key, item);
  }
  return [...selected.values()];
}

async function findRemediatedPdf(resultFile: string, row: RunRow): Promise<string | null> {
  const resultDir = dirname(resultFile);
  const names = await readdir(resultDir).catch(() => []);
  const prefixes = [row.publicationId, row.id].filter((value): value is string => Boolean(value));
  for (const name of names) {
    if (!name.endsWith('.remediated.pdf')) continue;
    if (prefixes.some(prefix => name.startsWith(`${prefix}-`) || name.includes(prefix))) {
      return join(resultDir, name);
    }
  }
  return null;
}

async function sourcePathFor(row: RunRow, manifestRows: ManifestRow[]): Promise<string | null> {
  const candidates = [row.localFile, row.file].filter((value): value is string => Boolean(value));
  for (const value of candidates) {
    if (isAbsolute(value) && await fileExists(value)) return value;
  }
  const manifest = manifestRows.find(candidate => rowsMatch(row, candidate));
  if (manifest && await fileExists(manifest.absolutePath)) return manifest.absolutePath;
  return null;
}

async function analyzeForRow(
  resultFile: string,
  row: RunRow,
  manifestRows: ManifestRow[],
  analyzeSource: boolean,
): Promise<{ analysis: AnalysisResult | null; snapshot: DocumentSnapshot | null; pdfPath: string | null; source: string }> {
  const remediated = await findRemediatedPdf(resultFile, row);
  const fallback = analyzeSource ? await sourcePathFor(row, manifestRows) : null;
  const pdfPath = remediated ?? fallback;
  if (!pdfPath) return { analysis: null, snapshot: null, pdfPath: null, source: 'missing_pdf' };
  const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  return {
    analysis: analyzed.result,
    snapshot: analyzed.snapshot,
    pdfPath,
    source: remediated ? 'remediated_pdf' : 'source_pdf',
  };
}

function firstLines(snapshot: DocumentSnapshot | null, page = 0): string[] {
  return (snapshot?.textByPage[page] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function relevantTools(row: RunRow): Array<Record<string, unknown>> {
  return (row.appliedTools ?? [])
    .filter(tool => /heading|structure|ocr|synthesize|tag_native|artifact|link|table|figure|alt/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? '',
      source: tool.source ?? null,
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
      delta: typeof tool.delta === 'number' ? tool.delta : null,
      details: typeof tool.details === 'string' ? tool.details.slice(0, 260) : null,
    }));
}

function candidateSummary(disposition: ReturnType<typeof classifyStage187HeadingReadingTail>): Record<string, unknown> | null {
  const candidate = disposition.candidate;
  if (!candidate) return null;
  return {
    text: 'text' in candidate ? candidate.text : null,
    page: 'page' in candidate ? candidate.page : null,
    source: 'source' in candidate ? candidate.source : null,
    score: 'score' in candidate ? candidate.score : null,
    mcid: 'mcid' in candidate ? candidate.mcid : null,
    mcids: 'mcids' in candidate ? candidate.mcids : null,
    groupIndexes: 'groupIndexes' in candidate ? candidate.groupIndexes : null,
    reasons: 'reasons' in candidate ? candidate.reasons : [],
  };
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const summaryPath = argValue('--summary') ?? DEFAULT_SUMMARY;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const analyzeSource = process.argv.includes('--analyze-source');
  const overrideIds = [...csvArg('--ids'), ...repeatedArg('--file')];
  const requestedAliases = overrideIds.length > 0
    ? overrideIds
    : [...PRIMARY_ZERO, ...PRIMARY_PARTIAL, ...CONTROLS];

  const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as SummaryFile;
  const resultFiles = repeatedArg('--result-file');
  const manifestPaths = repeatedArg('--manifest');
  const manifestRows = await loadManifestRows(manifestPaths.length > 0 ? manifestPaths : summary.manifests ?? []);
  const allRows = uniqueRows(await loadResultRows(resultFiles.length > 0 ? resultFiles : summary.resultFiles ?? []));
  const selected = allRows.filter(({ row }) => requestedAliases.some(alias => matchesAlias(row, alias)));

  const records = [];
  for (const { row, resultFile } of selected) {
    const analyzed = await analyzeForRow(resultFile, row, manifestRows, analyzeSource);
    const analysis = analyzed.analysis;
    const snapshot = analyzed.snapshot;
    const disposition = analysis && snapshot
      ? classifyStage187HeadingReadingTail(analysis, snapshot, { knownVolatile: knownVolatile(row) })
      : null;
    const stage153 = analysis && snapshot ? classifyStage153HeadingZeroResidual(analysis, snapshot) : null;
    const ocrDebug = analysis && snapshot ? debugOcrPageShellHeadingSelection(analysis, snapshot) : null;
    records.push({
      id: row.id ?? null,
      publicationId: row.publicationId ?? null,
      title: row.title ?? null,
      role: rowRole(row),
      resultFile,
      benchmark: {
        before: `${row.beforeScore ?? 'n/a'}/${row.beforeGrade ?? 'n/a'}`,
        after: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
        score: row.afterScore ?? null,
        grade: row.afterGrade ?? null,
        pdfClass: row.afterPdfClass ?? null,
        falsePositiveAppliedCount: row.falsePositiveAppliedCount ?? null,
        wallRemediateMs: row.wallRemediateMs ?? null,
        totalPipelineMs: row.totalPipelineMs ?? null,
      },
      categories: {
        heading_structure: categoryScore(row.afterCategories, 'heading_structure') ?? analysisCategoryScore(analysis, 'heading_structure'),
        reading_order: categoryScore(row.afterCategories, 'reading_order') ?? analysisCategoryScore(analysis, 'reading_order'),
        text_extractability: categoryScore(row.afterCategories, 'text_extractability') ?? analysisCategoryScore(analysis, 'text_extractability'),
        alt_text: categoryScore(row.afterCategories, 'alt_text') ?? analysisCategoryScore(analysis, 'alt_text'),
        table_markup: categoryScore(row.afterCategories, 'table_markup') ?? analysisCategoryScore(analysis, 'table_markup'),
        pdf_ua_compliance: categoryScore(row.afterCategories, 'pdf_ua_compliance') ?? analysisCategoryScore(analysis, 'pdf_ua_compliance'),
        link_quality: categoryScore(row.afterCategories, 'link_quality') ?? analysisCategoryScore(analysis, 'link_quality'),
        form_accessibility: categoryScore(row.afterCategories, 'form_accessibility') ?? analysisCategoryScore(analysis, 'form_accessibility'),
      },
      analyzed: {
        source: analyzed.source,
        pdfPath: analyzed.pdfPath,
        score: analysis?.score ?? null,
        grade: analysis?.grade ?? null,
        pdfClass: analysis?.pdfClass ?? null,
      },
      signals: snapshot ? {
        pageCount: snapshot.pageCount,
        textCharCount: snapshot.textCharCount,
        isTagged: snapshot.isTagged,
        structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
        degenerateStructureTree: snapshot.detectionProfile?.readingOrderSignals.degenerateStructureTree ?? null,
        extractedHeadingCount: snapshot.detectionProfile?.headingSignals.extractedHeadingCount ?? snapshot.headings.length,
        treeHeadingCount: snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? snapshot.headings.length,
        extractedHeadingsMissingFromTree: snapshot.detectionProfile?.headingSignals.extractedHeadingsMissingFromTree ?? false,
        mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
        paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
        nativeTitleBtCandidateCount: snapshot.nativeTitleBtCandidates?.length ?? 0,
        engineAppliedOcr: snapshot.remediationProvenance?.engineAppliedOcr ?? false,
        engineTaggedOcrText: snapshot.remediationProvenance?.engineTaggedOcrText ?? false,
      } : null,
      stage187: disposition ? {
        classification: disposition.classification,
        implementable: disposition.implementable,
        toolName: disposition.toolName,
        reasons: disposition.reasons,
        candidate: candidateSummary(disposition),
      } : null,
      stage153: stage153 ? {
        classification: stage153.classification,
        reasons: stage153.reasons,
        candidate: stage153.candidate ? {
          text: stage153.candidate.text,
          page: stage153.candidate.page,
          source: stage153.candidate.source,
          score: stage153.candidate.score,
        } : null,
      } : null,
      firstPageLines: firstLines(snapshot, 0),
      page2Lines: firstLines(snapshot, 1),
      metadataTitle: snapshot?.metadata.title ?? null,
      bookmarkSeeds: (snapshot?.bookmarks ?? []).slice(0, 8).map(bookmark => bookmark.title),
      ocrSeedDiagnostics: ocrDebug?.seeds ?? [],
      ocrCollectionDiagnostics: ocrDebug?.collectionCover ?? null,
      paragraphSamples: (snapshot?.paragraphStructElems ?? [])
        .slice(0, 8)
        .map(item => ({ page: item.page, tag: item.tag, text: item.text.slice(0, 180), structRef: item.structRef, reachable: item.reachable })),
      mcidSamples: (snapshot?.mcidTextSpans ?? [])
        .slice(0, 12)
        .map(item => ({ page: item.page, mcid: item.mcid, text: (item.resolvedText ?? item.snippet).slice(0, 160) })),
      toolTimeline: relevantTools(row),
    });
  }

  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.stage187?.classification ?? 'not_analyzed';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const implementableRows = records
    .filter(record => record.role !== 'control' && record.stage187?.implementable)
    .map(record => record.publicationId ?? record.id ?? 'unknown');
  const report = {
    generatedAt: new Date().toISOString(),
    summaryPath: resolve(summaryPath),
    analyzeSourceFallback: analyzeSource,
    requestedAliases,
    records,
    decision: {
      distribution,
      implementableRows,
      recommendedDirection: implementableRows.length > 0
        ? 'run_focused_target_with_existing_safe_heading_tools'
        : 'park_no_safe_heading_anchor_and_pivot_to_mixed_tail',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage187-heading-reading-tail-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 187 Heading/Reading Tail Diagnostic', '', `Summary: \`${summaryPath}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Implementable rows: ${implementableRows.length ? implementableRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Grade | Class | Tool | Key lows | Candidate |');
  lines.push('|---|---|---:|---|---|---|---|');
  for (const record of records) {
    const lows = Object.entries(record.categories)
      .filter(([, value]) => typeof value === 'number' && value < 80)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    const candidate = record.stage187?.candidate as { text?: string; source?: string; score?: number } | null | undefined;
    lines.push([
      `\`${record.publicationId ?? record.id}\``,
      record.role,
      record.benchmark.after,
      record.stage187?.classification ?? 'not_analyzed',
      record.stage187?.toolName ?? '',
      lows || 'none',
      candidate ? `${candidate.text} (${candidate.source}, ${candidate.score})` : 'none',
    ].join(' | '));
  }
  lines.push('');
  for (const record of records.filter(row => row.role !== 'control')) {
    lines.push(`## ${record.publicationId ?? record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title ?? ''}`);
    lines.push(`- Stage187: ${record.stage187 ? `${record.stage187.classification}; tool=${record.stage187.toolName ?? 'none'}; reasons=${record.stage187.reasons.join(', ')}` : 'not analyzed'}`);
    lines.push(`- Analyzed: ${record.analyzed.source}; ${record.analyzed.pdfPath ?? 'missing PDF'}`);
    lines.push(`- Signals: ${JSON.stringify(record.signals)}`);
    lines.push(`- First-page lines: ${record.firstPageLines.slice(0, 8).join(' | ') || 'none'}`);
    lines.push(`- Page 2 lines: ${record.page2Lines.slice(0, 6).join(' | ') || 'none'}`);
    lines.push(`- Candidate: ${JSON.stringify(record.stage187?.candidate ?? null)}`);
    lines.push(`- Tool timeline: ${record.toolTimeline.map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore}->${tool.scoreAfter}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage187-heading-reading-tail-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');

  const targetManifestPath = argValue('--write-target-manifest');
  if (targetManifestPath) {
    const manifestRowsForOutput = records
      .filter(record => record.analyzed.pdfPath)
      .map(record => ({
        publicationId: record.publicationId ?? record.id,
        title: record.title ?? record.publicationId ?? record.id,
        localFile: record.analyzed.pdfPath,
        stage187Role: record.role,
        stage187Class: record.stage187?.classification ?? 'not_analyzed',
      }));
    await writeFile(resolve(targetManifestPath), `${JSON.stringify({
      name: 'stage187-heading-reading-tail-target',
      createdAt: new Date().toISOString(),
      rows: manifestRowsForOutput,
    }, null, 2)}\n`, 'utf8');
  }

  console.log(`Wrote Stage 187 heading/reading diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

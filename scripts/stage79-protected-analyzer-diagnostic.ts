#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { sha256Buffer } from '../src/services/benchmark/protectedReanalysisSelection.js';
import type { AnalysisResult, DetectionProfile, DocumentSnapshot } from '../src/types.js';

type JsonRecord = Record<string, unknown>;
type CategoryScores = Record<string, number>;

type Stage79Class =
  | 'same_buffer_python_structural_variance'
  | 'same_buffer_scoring_variance'
  | 'route_debt_no_safe_buffer'
  | 'stable_below_floor';

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  reanalyzedScore?: number;
  afterCategories?: Array<{ key: string; score: number }>;
  reanalyzedCategories?: Array<{ key: string; score: number }>;
  protectedReanalysisSelection?: unknown;
}

interface RepeatSummary {
  repeat: number;
  score: number | null;
  grade: string | null;
  pdfClass: string | null;
  categoryScores: CategoryScores;
  scoreCaps: unknown[];
  detectionSignals: JsonRecord;
  snapshotCounts: JsonRecord;
  signatures: {
    score: string;
    detection: string;
    pdfjs: string | null;
    pythonStructure: string | null;
    mergedSnapshot: string | null;
  };
  runtimeMs: number;
  error?: string;
}

interface RowReport {
  id: string;
  runDir: string;
  pdfPath: string | null;
  bufferSha256: string | null;
  baselineScore: number | null;
  baselineCategories: CategoryScores;
  runRowScore: number | null;
  protectedReanalysisSelection?: unknown;
  classification: Stage79Class;
  reason: string;
  changedFields: string[];
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  categorySwings: Array<{ key: string; min: number; max: number; delta: number }>;
  repeats: RepeatSummary[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage79-protected-analyzer-diagnostic-2026-04-26-r1';
const DEFAULT_IDS = ['structure-4076', 'fixture-teams-remediated', 'long-4683', 'long-4470'];
const DEFAULT_REPEATS = 5;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signature(value: unknown): string {
  return createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 20);
}

function categoryScores(result: AnalysisResult): CategoryScores {
  return Object.fromEntries((result.categories ?? []).map(category => [category.key, category.score]));
}

function rowCategoryScores(row?: BenchmarkRow): CategoryScores {
  const categories = row?.reanalyzedCategories?.length ? row.reanalyzedCategories : row?.afterCategories ?? [];
  return Object.fromEntries(categories.map(category => [category.key, category.score]));
}

function rowScore(row?: BenchmarkRow): number | null {
  const value = row?.reanalyzedScore ?? row?.afterScore;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function flattenDetection(profile: DetectionProfile | null | undefined): JsonRecord {
  if (!profile) return {};
  return {
    ...profile.headingSignals,
    ...profile.figureSignals,
    ...profile.tableSignals,
    ...profile.readingOrderSignals,
    ...profile.pdfUaSignals,
    ...profile.annotationSignals,
    sampledPages: profile.sampledPages,
    confidence: profile.confidence,
  };
}

function structureNodeSignature(node: DocumentSnapshot['structureTree']): unknown {
  if (!node) return null;
  return {
    type: node.type,
    page: node.page ?? null,
    children: (node.children ?? []).map(structureNodeSignature),
  };
}

function bboxKey(bbox?: [number, number, number, number]): string {
  return bbox ? bbox.map(value => Number(value).toFixed(2)).join(',') : '';
}

function sortedMapped<T>(items: T[] | undefined, mapper: (item: T) => JsonRecord, keyer: (mapped: JsonRecord) => string): JsonRecord[] {
  return (items ?? []).map(mapper).sort((a, b) => keyer(a).localeCompare(keyer(b)));
}

function snapshotParts(snapshot?: DocumentSnapshot): {
  pdfjs: JsonRecord | null;
  pythonStructure: JsonRecord | null;
  mergedSnapshot: JsonRecord | null;
  counts: JsonRecord;
} {
  if (!snapshot) return { pdfjs: null, pythonStructure: null, mergedSnapshot: null, counts: {} };
  const headings = sortedMapped(
    snapshot.headings,
    heading => ({
      level: heading.level,
      text: heading.text,
      page: heading.page,
      structRef: heading.structRef ?? null,
    }),
    heading => `${heading.page}:${heading.level}:${heading.structRef ?? ''}:${heading.text}`,
  );
  const figures = sortedMapped(
    snapshot.figures,
    figure => ({
      page: figure.page,
      hasAlt: figure.hasAlt,
      isArtifact: figure.isArtifact,
      role: figure.role ?? null,
      rawRole: figure.rawRole ?? null,
      structRef: figure.structRef ?? null,
      reachable: figure.reachable ?? null,
      directContent: figure.directContent ?? null,
      subtreeMcidCount: figure.subtreeMcidCount ?? null,
      bbox: bboxKey(figure.bbox),
    }),
    figure => `${figure.page}:${figure.structRef ?? ''}:${figure.role ?? ''}:${figure.bbox ?? ''}`,
  );
  const tables = sortedMapped(
    snapshot.tables,
    table => ({
      page: table.page,
      structRef: table.structRef ?? null,
      hasHeaders: table.hasHeaders,
      headerCount: table.headerCount,
      totalCells: table.totalCells,
      rowCount: table.rowCount ?? null,
      cellsMisplacedCount: table.cellsMisplacedCount ?? null,
      irregularRows: table.irregularRows ?? null,
      rowCellCounts: table.rowCellCounts ?? null,
      dominantColumnCount: table.dominantColumnCount ?? null,
    }),
    table => `${table.page}:${table.structRef ?? ''}:${table.totalCells}:${table.headerCount}`,
  );
  const paragraphs = sortedMapped(
    snapshot.paragraphStructElems,
    elem => ({
      tag: elem.tag,
      text: elem.text.slice(0, 160),
      page: elem.page,
      structRef: elem.structRef,
      bbox: bboxKey(elem.bbox),
    }),
    elem => `${elem.page}:${elem.structRef}:${elem.tag}:${elem.bbox}:${elem.text}`,
  );
  const pdfjs = {
    pageCount: snapshot.pageCount,
    textCharCount: snapshot.textCharCount,
    imageOnlyPageCount: snapshot.imageOnlyPageCount,
    textByPageHash: signature(snapshot.textByPage),
    linkCount: snapshot.links.length,
    formFieldsFromPdfjsCount: snapshot.formFieldsFromPdfjs.length,
    metadata: snapshot.metadata,
  };
  const pythonStructure = {
    isTagged: snapshot.isTagged,
    markInfo: snapshot.markInfo,
    lang: snapshot.lang,
    pdfUaVersion: snapshot.pdfUaVersion,
    structTitle: snapshot.structTitle ?? null,
    headings,
    figures,
    checkerFigureTargets: sortedMapped(
      snapshot.checkerFigureTargets,
      target => ({
        page: target.page,
        hasAlt: target.hasAlt,
        isArtifact: target.isArtifact,
        role: target.role ?? null,
        resolvedRole: target.resolvedRole ?? null,
        structRef: target.structRef ?? null,
        reachable: target.reachable,
        directContent: target.directContent,
        parentPath: target.parentPath,
      }),
      target => `${target.page}:${target.structRef ?? ''}:${target.resolvedRole ?? ''}`,
    ),
    tables,
    paragraphStructElems: paragraphs,
    structureTree: structureNodeSignature(snapshot.structureTree),
    orphanMcids: [...(snapshot.orphanMcids ?? [])].sort((a, b) => a.page - b.page || a.mcid - b.mcid),
    taggedContentAudit: snapshot.taggedContentAudit ?? null,
    annotationAccessibility: snapshot.annotationAccessibility ?? null,
    listStructureAudit: snapshot.listStructureAudit ?? null,
    acrobatStyleAltRisks: snapshot.acrobatStyleAltRisks ?? null,
  };
  const counts = {
    pageCount: snapshot.pageCount,
    textCharCount: snapshot.textCharCount,
    imageOnlyPageCount: snapshot.imageOnlyPageCount,
    linkCount: snapshot.links.length,
    formFieldCount: snapshot.formFields.length,
    pdfjsFormFieldCount: snapshot.formFieldsFromPdfjs.length,
    headingCount: snapshot.headings.length,
    figureCount: snapshot.figures.length,
    checkerFigureTargetCount: snapshot.checkerFigureTargets?.length ?? 0,
    checkerFigureWithAltCount: snapshot.checkerFigureTargets?.filter(target => target.hasAlt).length ?? 0,
    tableCount: snapshot.tables.length,
    paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
    orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? snapshot.orphanMcids?.length ?? 0,
    mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
    bookmarkCount: snapshot.bookmarks.length,
    fontCount: snapshot.fonts.length,
    structureTreePresent: snapshot.structureTree !== null,
  };
  return {
    pdfjs,
    pythonStructure,
    mergedSnapshot: { pdfjs, pythonStructure, pdfClass: snapshot.pdfClass, detectionProfile: snapshot.detectionProfile ?? null },
    counts,
  };
}

function uniqueValues(values: Array<string | null>): string[] {
  return [...new Set(values.map(value => value ?? 'missing'))].sort();
}

function changedFields(repeats: RepeatSummary[]): string[] {
  const fields: Array<[string, Array<string | null>]> = [
    ['score', repeats.map(repeat => repeat.signatures.score)],
    ['detection', repeats.map(repeat => repeat.signatures.detection)],
    ['pdfjs', repeats.map(repeat => repeat.signatures.pdfjs)],
    ['pythonStructure', repeats.map(repeat => repeat.signatures.pythonStructure)],
    ['mergedSnapshot', repeats.map(repeat => repeat.signatures.mergedSnapshot)],
  ];
  return fields.filter(([, values]) => uniqueValues(values).length > 1).map(([field]) => field);
}

function scoreRange(repeats: RepeatSummary[]): RowReport['scoreRange'] {
  const scores = repeats.map(repeat => repeat.score).filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return { min: null, max: null, delta: null };
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return { min, max, delta: max - min };
}

function categorySwings(repeats: RepeatSummary[]): RowReport['categorySwings'] {
  const values = new Map<string, number[]>();
  for (const repeat of repeats) {
    for (const [key, score] of Object.entries(repeat.categoryScores)) {
      const current = values.get(key) ?? [];
      current.push(score);
      values.set(key, current);
    }
  }
  return [...values.entries()]
    .map(([key, scores]) => {
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      return { key, min, max, delta: max - min };
    })
    .filter(row => row.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key));
}

export function classifyStage79AnalyzerRow(input: {
  repeats: RepeatSummary[];
  baselineScore?: number | null;
}): { classification: Stage79Class; reason: string; changedFields: string[] } {
  if (input.repeats.length === 0) {
    return { classification: 'route_debt_no_safe_buffer', reason: 'missing_repeats_or_pdf_artifact', changedFields: [] };
  }
  const changed = changedFields(input.repeats);
  if (changed.includes('pythonStructure')) {
    return { classification: 'same_buffer_python_structural_variance', reason: 'python_structure_signature_changed', changedFields: changed };
  }
  if (changed.includes('score') || changed.includes('detection') || changed.includes('mergedSnapshot')) {
    return { classification: 'same_buffer_scoring_variance', reason: 'score_or_detection_changed_with_stable_python_signature', changedFields: changed };
  }
  const range = scoreRange(input.repeats);
  const floor = typeof input.baselineScore === 'number' ? input.baselineScore - 2 : null;
  if (floor != null && range.max != null && range.max < floor) {
    return { classification: 'stable_below_floor', reason: `all_repeats_below_floor(${range.max}<${floor})`, changedFields: changed };
  }
  return { classification: 'route_debt_no_safe_buffer', reason: 'stable_or_inconclusive_without_floor_safe_evidence', changedFields: changed };
}

async function readRunRows(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const rows = JSON.parse(await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
}

async function analyzeRepeat(input: { buffer: Buffer; filename: string; id: string; repeat: number }): Promise<RepeatSummary> {
  const started = performance.now();
  const tmp = join(tmpdir(), `pdfaf-stage79-${input.id}-${input.repeat}-${process.pid}.pdf`);
  try {
    await writeFile(tmp, input.buffer);
    const analyzed = await analyzePdf(tmp, input.filename, { bypassCache: true });
    const parts = snapshotParts(analyzed.snapshot);
    return {
      repeat: input.repeat,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      pdfClass: analyzed.result.pdfClass,
      categoryScores: categoryScores(analyzed.result),
      scoreCaps: analyzed.result.scoreCapsApplied ?? [],
      detectionSignals: flattenDetection(analyzed.result.detectionProfile),
      snapshotCounts: parts.counts,
      signatures: {
        score: signature({
          score: analyzed.result.score,
          grade: analyzed.result.grade,
          pdfClass: analyzed.result.pdfClass,
          categories: categoryScores(analyzed.result),
          scoreCaps: analyzed.result.scoreCapsApplied ?? [],
        }),
        detection: signature(analyzed.result.detectionProfile ?? null),
        pdfjs: parts.pdfjs ? signature(parts.pdfjs) : null,
        pythonStructure: parts.pythonStructure ? signature(parts.pythonStructure) : null,
        mergedSnapshot: parts.mergedSnapshot ? signature(parts.mergedSnapshot) : null,
      },
      runtimeMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      repeat: input.repeat,
      score: null,
      grade: null,
      pdfClass: null,
      categoryScores: {},
      scoreCaps: [],
      detectionSignals: {},
      snapshotCounts: {},
      signatures: {
        score: 'error',
        detection: 'error',
        pdfjs: null,
        pythonStructure: null,
        mergedSnapshot: null,
      },
      runtimeMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

async function buildRow(input: {
  id: string;
  runDir: string;
  baselineRow?: BenchmarkRow;
  runRow?: BenchmarkRow;
  repeatCount: number;
}): Promise<RowReport> {
  const pdfPath = join(resolve(input.runDir), 'pdfs', `${input.id}.pdf`);
  let buffer: Buffer;
  try {
    buffer = await readFile(pdfPath);
  } catch {
    const baselineScore = rowScore(input.baselineRow);
    return {
      id: input.id,
      runDir: input.runDir,
      pdfPath: null,
      bufferSha256: null,
      baselineScore,
      baselineCategories: rowCategoryScores(input.baselineRow),
      runRowScore: rowScore(input.runRow),
      protectedReanalysisSelection: input.runRow?.protectedReanalysisSelection,
      classification: 'route_debt_no_safe_buffer',
      reason: 'missing_write_pdfs_artifact',
      changedFields: [],
      scoreRange: { min: null, max: null, delta: null },
      categorySwings: [],
      repeats: [],
    };
  }
  const repeats: RepeatSummary[] = [];
  const filename = input.runRow?.file ? basename(input.runRow.file) : `${input.id}.pdf`;
  for (let repeat = 1; repeat <= input.repeatCount; repeat += 1) {
    repeats.push(await analyzeRepeat({ buffer, filename, id: input.id, repeat }));
  }
  const baselineScore = rowScore(input.baselineRow);
  const classified = classifyStage79AnalyzerRow({ repeats, baselineScore });
  return {
    id: input.id,
    runDir: input.runDir,
    pdfPath,
    bufferSha256: sha256Buffer(buffer),
    baselineScore,
    baselineCategories: rowCategoryScores(input.baselineRow),
    runRowScore: rowScore(input.runRow),
    protectedReanalysisSelection: input.runRow?.protectedReanalysisSelection,
    classification: classified.classification,
    reason: classified.reason,
    changedFields: classified.changedFields,
    scoreRange: scoreRange(repeats),
    categorySwings: categorySwings(repeats),
    repeats,
  };
}

function renderMarkdown(report: { runDir: string; baselineRun: string; repeatCount: number; rows: RowReport[] }): string {
  const counts = report.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# Stage 79 Protected Analyzer Diagnostic',
    '',
    `- Run: \`${report.runDir}\``,
    `- Baseline: \`${report.baselineRun}\``,
    `- Repeats: ${report.repeatCount}`,
    '',
    '## Classification Counts',
    '',
    ...Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => `- ${key}: ${count}`),
    '',
    '## Rows',
    '',
    '| Row | Classification | Score range | Changed fields | Top category swings |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const range = row.scoreRange.min == null ? 'n/a' : `${row.scoreRange.min}-${row.scoreRange.max} (${row.scoreRange.delta})`;
    const swings = row.categorySwings.slice(0, 4).map(swing => `${swing.key}:${swing.min}-${swing.max}`).join(', ') || 'none';
    lines.push(`| ${row.id} | ${row.classification} | ${range} | ${row.changedFields.join(', ') || 'none'} | ${swings} |`);
  }
  for (const row of report.rows) {
    lines.push('', `### ${row.id}`);
    lines.push(`- Reason: ${row.reason}`);
    lines.push(`- Buffer SHA-256: ${row.bufferSha256 ?? 'n/a'}`);
    lines.push(`- Baseline score: ${row.baselineScore ?? 'n/a'}; run row score: ${row.runRowScore ?? 'n/a'}`);
    lines.push(`- Stage 78 selection: \`${JSON.stringify(row.protectedReanalysisSelection ?? null)}\``);
    for (const repeat of row.repeats) {
      lines.push(`- Repeat ${repeat.repeat}: score=${repeat.score ?? 'error'} grade=${repeat.grade ?? 'n/a'} runtimeMs=${repeat.runtimeMs}`);
      lines.push(`  - categories: \`${JSON.stringify(repeat.categoryScores)}\``);
      lines.push(`  - counts: \`${JSON.stringify(repeat.snapshotCounts)}\``);
      lines.push(`  - detection: \`${JSON.stringify(repeat.detectionSignals)}\``);
      lines.push(`  - signatures: \`${JSON.stringify(repeat.signatures)}\``);
      if (repeat.error) lines.push(`  - error: ${repeat.error}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): {
  runDir: string;
  baselineRun: string;
  outDir: string;
  ids: string[];
  repeatCount: number;
} {
  let runDir = '';
  let baselineRun = DEFAULT_BASELINE_RUN;
  let outDir = DEFAULT_OUT;
  let ids = DEFAULT_IDS;
  let repeatCount = DEFAULT_REPEATS;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/stage79-protected-analyzer-diagnostic.ts --run <dir> [options]',
        `  --baseline-run <dir> Default: ${DEFAULT_BASELINE_RUN}`,
        `  --out <dir>          Default: ${DEFAULT_OUT}`,
        `  --ids <csv>          Default: ${DEFAULT_IDS.join(',')}`,
        `  --repeats <n>        Default: ${DEFAULT_REPEATS}`,
      ].join('\n'));
      process.exit(0);
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--run') runDir = next;
    else if (arg === '--baseline-run') baselineRun = next;
    else if (arg === '--out') outDir = next;
    else if (arg === '--ids') ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--repeats') repeatCount = Math.max(1, Math.min(10, Number.parseInt(next, 10) || DEFAULT_REPEATS));
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  if (!runDir) throw new Error('Missing required --run directory.');
  return { runDir, baselineRun, outDir, ids, repeatCount };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [baselineRows, runRows] = await Promise.all([
    readRunRows(args.baselineRun),
    readRunRows(args.runDir),
  ]);
  const rows: RowReport[] = [];
  for (const id of args.ids) {
    process.stdout.write(`[${id}] same-buffer analyzer repeats ... `);
    const row = await buildRow({
      id,
      runDir: args.runDir,
      baselineRow: baselineRows.get(id),
      runRow: runRows.get(id),
      repeatCount: args.repeatCount,
    });
    rows.push(row);
    console.log(`${row.classification} scoreRange=${row.scoreRange.min ?? 'n/a'}..${row.scoreRange.max ?? 'n/a'}`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    runDir: args.runDir,
    baselineRun: args.baselineRun,
    repeatCount: args.repeatCount,
    ids: args.ids,
    rows,
  };
  const out = resolve(args.outDir);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage79-protected-analyzer-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(out, 'stage79-protected-analyzer-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

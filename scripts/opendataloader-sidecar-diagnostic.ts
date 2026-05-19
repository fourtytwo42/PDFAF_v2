#!/usr/bin/env tsx
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { replacementCharacterTextRisk } from '../src/services/scorer/replacementCharacterTextRisk.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const DEFAULT_ODL_CMD = 'opendataloader-pdf';
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-odl-diagnostics';
const DEFAULT_ODL_TIMEOUT_MS = 60_000;
const TEXT_SAMPLE_LIMIT = 12;
const TEXT_SAMPLE_CHARS = 120;

export interface SidecarArgs {
  pdfs: string[];
  manifest?: string;
  outDir: string;
  limit?: number;
  odlCmd: string;
  timeoutMs: number;
}

export interface PdfInput {
  id: string;
  pdfPath: string;
  title?: string;
}

export type CommandStatus = 'ok' | 'failed' | 'timeout' | 'missing_command' | 'spawn_error';

export interface CommandResult {
  status: CommandStatus;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  runtimeMs: number;
  error?: string;
}

export interface OdlSummary {
  headingCount: number;
  headingLevels: number[];
  tableCount: number;
  tableShapes: Array<{ rows: number | null; columns: number | null }>;
  denseTableHintCount: number;
  undersegmentedTableHintCount: number;
  imageCount: number;
  captionCount: number;
  textSamples: string[];
}

interface PdfafSummary {
  pageCount: number;
  textCharCount: number;
  score: number;
  grade: string;
  categoryScores: Record<string, number | null>;
  detectionProfile: AnalysisResult['detectionProfile'] | null;
  headingCount: number;
  headingLevels: number[];
  tableCount: number;
  tableShapes: Array<{ rows: number | null; columns: number | null; totalCells: number | null }>;
  imageCount: number;
  captionCount: number;
  textSamples: string[];
  fontSyntaxAudit: DocumentSnapshot['fontSyntaxAudit'] | null;
  replacementCharacterRisk: {
    level: 'minor' | 'moderate' | 'critical';
    scoreCap: number;
    replacementCharacterRatio: number;
    replacementCharacterCount: number;
    highReplacementCharacterPageCount: number;
    highReplacementCharacterPageRatio: number;
  } | null;
}

type SuggestedScoringAction =
  | 'text_extractability_penalty'
  | 'reading_order_diagnostic_only'
  | 'table_diagnostic_only'
  | 'no_action';

interface ScoringCalibrationSummary {
  currentCategoryScores: Record<string, number | null>;
  nativePdfafSignalAvailable: {
    replacementCharacterRatio: number;
    replacementCharacterCount: number;
    highReplacementCharacterPageCount: number;
    replacementCharacterTextRiskLevel: 'minor' | 'moderate' | 'critical' | null;
    replacementCharacterTextRiskCap: number | null;
    readingOrderDetectionProfile: boolean;
    tableDetectionProfile: boolean;
  };
  suggestedScoringAction: SuggestedScoringAction;
  reason: string;
}

interface DiagnosticRow {
  id: string;
  pdfPath: string;
  title: string;
  pdfaf: {
    status: 'ok' | 'failed';
    runtimeMs: number;
    summary?: PdfafSummary;
    error?: string;
  };
  odl: {
    status: CommandStatus | 'parse_error' | 'no_json';
    runtimeMs: number;
    outputDir: string;
    args: string[];
    summary?: OdlSummary;
    error?: string;
    stderrTail?: string;
  };
  comparison: {
    headingDelta: number | null;
    tableDelta: number | null;
    imageDelta: number | null;
    textOrderSimilarity: number | null;
    supportedLane: 'cid_text_extraction' | 'reading_order' | 'table_structure' | 'no_safe_lane' | 'odl_unavailable';
    reason: string;
  };
  scoringCalibration: ScoringCalibrationSummary;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function defaultOutDir(): string {
  return join(DEFAULT_OUT_ROOT, timestampSlug());
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/opendataloader-sidecar-diagnostic.ts [options]

Options:
  --pdf <path>          PDF to compare; repeatable
  --manifest <path>     Optional JSON manifest with rows/items/pdfs/files
  --out <dir>           Output directory (default: ${DEFAULT_OUT_ROOT}/<timestamp>)
  --limit <n>           Limit selected PDFs after manifest/pdf expansion
  --odl-cmd <cmd>       OpenDataLoader executable (default: ${DEFAULT_ODL_CMD})
  --timeout-ms <n>      Per-PDF OpenDataLoader timeout (default: ${DEFAULT_ODL_TIMEOUT_MS})
  --help                Show this help

The sidecar is diagnostic-only. It never requests tagged-pdf output and never writes remediated PDFs.`;
}

export function parseArgs(argv = process.argv.slice(2)): SidecarArgs {
  const pdfs: string[] = [];
  let manifest: string | undefined;
  let outDir = defaultOutDir();
  let limit: number | undefined;
  let odlCmd = DEFAULT_ODL_CMD;
  let timeoutMs = DEFAULT_ODL_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --pdf\n${usage()}`);
      pdfs.push(resolve(value));
    } else if (arg === '--manifest') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --manifest\n${usage()}`);
      manifest = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--limit must be a positive number');
      limit = Math.floor(value);
    } else if (arg === '--odl-cmd') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --odl-cmd\n${usage()}`);
      odlCmd = value;
    } else if (arg === '--timeout-ms') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--timeout-ms must be a positive number');
      timeoutMs = Math.floor(value);
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { pdfs, manifest, outDir, limit, odlCmd, timeoutMs };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function manifestRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      const row = asRecord(item);
      return row ? [row] : [];
    });
  }
  const root = asRecord(value);
  if (!root) return [];
  for (const key of ['rows', 'items', 'pdfs', 'files', 'documents']) {
    if (Array.isArray(root[key])) return manifestRows(root[key]);
  }
  return [root];
}

export async function loadPdfInputs(args: SidecarArgs): Promise<PdfInput[]> {
  const inputs: PdfInput[] = args.pdfs.map(pdfPath => ({
    id: basename(pdfPath, extname(pdfPath)),
    pdfPath,
  }));

  if (args.manifest) {
    const raw = JSON.parse(await readFile(args.manifest, 'utf8')) as unknown;
    const baseDir = dirname(args.manifest);
    for (const row of manifestRows(raw)) {
      const rawPath = stringField(row, ['path', 'pdf', 'file', 'localFile', 'sourcePath', 'pdfPath']);
      if (!rawPath) continue;
      const pdfPath = resolve(baseDir, rawPath);
      inputs.push({
        id: stringField(row, ['id', 'publicationId', 'key', 'name']) ?? basename(pdfPath, extname(pdfPath)),
        pdfPath,
        title: stringField(row, ['title', 'name']) ?? undefined,
      });
    }
  }

  const deduped = new Map<string, PdfInput>();
  for (const input of inputs) {
    if (!deduped.has(input.pdfPath)) deduped.set(input.pdfPath, input);
  }
  const selected = [...deduped.values()];
  return typeof args.limit === 'number' ? selected.slice(0, args.limit) : selected;
}

export async function runCommandWithTimeout(
  command: string,
  commandArgs: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  const started = performance.now();
  return new Promise((resolveResult) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveResult(result);
    };

    const proc = spawn(command, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 2_500).unref();
    }, timeoutMs);

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', chunk => {
      stdout += chunk;
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk;
    });
    proc.on('error', err => {
      const code = (err as NodeJS.ErrnoException).code;
      settle({
        status: code === 'ENOENT' ? 'missing_command' : 'spawn_error',
        code: null,
        signal: null,
        stdout,
        stderr,
        runtimeMs: performance.now() - started,
        error: err.message,
      });
    });
    proc.on('close', (code, signal) => {
      const runtimeMs = performance.now() - started;
      const status: CommandStatus = timedOut ? 'timeout' : code === 0 ? 'ok' : 'failed';
      settle({ status, code, signal, stdout, stderr, runtimeMs });
    });
  });
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function numberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalizedType(row: Record<string, unknown>): string {
  for (const key of ['type', 'kind', 'label', 'name', 'role', 'category']) {
    const value = row[key];
    if (typeof value === 'string') return value.toLowerCase();
  }
  return '';
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, TEXT_SAMPLE_CHARS) : null;
}

function collectRows(value: unknown, visit: (row: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, visit);
    return;
  }
  const row = asRecord(value);
  if (!row) return;
  visit(row);
  for (const child of Object.values(row)) {
    if (child && typeof child === 'object') collectRows(child, visit);
  }
}

function directText(row: Record<string, unknown>): string | null {
  for (const key of ['text', 'content', 'value', 'caption']) {
    const text = normalizeText(row[key]);
    if (text) return text;
  }
  return null;
}

function tableShape(row: Record<string, unknown>): { rows: number | null; columns: number | null } {
  const rows = numberLike(row.rowCount)
    ?? numberLike(row.rows)
    ?? numberLike(row.numRows)
    ?? numberLike(row.nRows);
  const columns = numberLike(row.columnCount)
    ?? numberLike(row.columns)
    ?? numberLike(row.cols)
    ?? numberLike(row.numColumns)
    ?? numberLike(row.nCols);
  return { rows, columns };
}

export function summarizeOpenDataLoaderJson(json: unknown): OdlSummary {
  const headingLevels: number[] = [];
  const tableShapes: Array<{ rows: number | null; columns: number | null }> = [];
  const textSamples: string[] = [];
  let imageCount = 0;
  let captionCount = 0;

  collectRows(json, row => {
    const type = normalizedType(row);
    const level = numberLike(row.level) ?? numberLike(row.headingLevel) ?? numberLike(row.heading_level);
    if (type.includes('heading') || (level !== null && level >= 1 && level <= 6)) {
      headingLevels.push(level ?? 1);
    }
    if (type.includes('table')) {
      tableShapes.push(tableShape(row));
    }
    if (type.includes('image') || type.includes('picture') || type.includes('figure')) {
      imageCount += 1;
    }
    if (type.includes('caption')) {
      captionCount += 1;
    }
    const text = directText(row);
    if (text && textSamples.length < TEXT_SAMPLE_LIMIT) textSamples.push(text);
  });

  const denseTableHintCount = tableShapes.filter(shape => (shape.rows ?? 0) >= 3 && (shape.columns ?? 0) >= 3).length;
  const undersegmentedTableHintCount = tableShapes.filter(shape => (shape.rows ?? 0) <= 1 && (shape.columns ?? 0) >= 4).length;
  return {
    headingCount: headingLevels.length,
    headingLevels,
    tableCount: tableShapes.length,
    tableShapes,
    denseTableHintCount,
    undersegmentedTableHintCount,
    imageCount,
    captionCount,
    textSamples,
  };
}

function categoryScore(result: AnalysisResult, key: string): number | null {
  const found = result.categories.find(category => category.key === key);
  return typeof found?.score === 'number' && found.applicable !== false ? found.score : null;
}

function pdfafSummary(result: AnalysisResult, snapshot: DocumentSnapshot): PdfafSummary {
  const replacementRisk = replacementCharacterTextRisk(snapshot);
  return {
    pageCount: snapshot.pageCount,
    textCharCount: snapshot.textCharCount,
    score: result.score,
    grade: result.grade,
    categoryScores: {
      text_extractability: categoryScore(result, 'text_extractability'),
      reading_order: categoryScore(result, 'reading_order'),
      heading_structure: categoryScore(result, 'heading_structure'),
      alt_text: categoryScore(result, 'alt_text'),
      table_markup: categoryScore(result, 'table_markup'),
      pdf_ua_compliance: categoryScore(result, 'pdf_ua_compliance'),
    },
    detectionProfile: result.detectionProfile ?? null,
    headingCount: snapshot.headings.length,
    headingLevels: snapshot.headings.map(heading => heading.level),
    tableCount: snapshot.tables.length,
    tableShapes: snapshot.tables.map(table => ({
      rows: table.rowCount ?? null,
      columns: table.dominantColumnCount ?? null,
      totalCells: table.totalCells ?? null,
    })),
    imageCount: snapshot.figures.length,
    captionCount: 0,
    textSamples: snapshot.textByPage
      .map(normalizeText)
      .filter((text): text is string => Boolean(text))
      .slice(0, TEXT_SAMPLE_LIMIT),
    fontSyntaxAudit: snapshot.fontSyntaxAudit ?? null,
    replacementCharacterRisk: replacementRisk
      ? {
          level: replacementRisk.level,
          scoreCap: replacementRisk.scoreCap,
          replacementCharacterRatio: replacementRisk.replacementCharacterRatio,
          replacementCharacterCount: replacementRisk.replacementCharacterCount,
          highReplacementCharacterPageCount: replacementRisk.highReplacementCharacterPageCount,
          highReplacementCharacterPageRatio: replacementRisk.highReplacementCharacterPageRatio,
        }
      : null,
  };
}

function textOrderSimilarity(left: string[], right: string[]): number | null {
  if (left.length === 0 || right.length === 0) return null;
  const rightSet = new Set(right.map(sample => sample.toLowerCase()));
  const exactMatches = left.filter(sample => rightSet.has(sample.toLowerCase())).length;
  return exactMatches / Math.max(left.length, right.length);
}

function selectLane(pdfaf: PdfafSummary | undefined, odl: OdlSummary | undefined, odlStatus: DiagnosticRow['odl']['status']): DiagnosticRow['comparison'] {
  if (!pdfaf || !odl || odlStatus !== 'ok') {
    return {
      headingDelta: null,
      tableDelta: null,
      imageDelta: null,
      textOrderSimilarity: null,
      supportedLane: 'odl_unavailable',
      reason: 'OpenDataLoader output was unavailable, timed out, or could not be parsed.',
    };
  }

  const headingDelta = odl.headingCount - pdfaf.headingCount;
  const tableDelta = odl.tableCount - pdfaf.tableCount;
  const imageDelta = odl.imageCount - pdfaf.imageCount;
  const similarity = textOrderSimilarity(pdfaf.textSamples, odl.textSamples);
  const replacementRatio = pdfaf.fontSyntaxAudit?.replacementCharacterRatio ?? 0;
  const textScore = pdfaf.categoryScores.text_extractability ?? 100;
  const readingScore = pdfaf.categoryScores.reading_order ?? 100;
  const tableScore = pdfaf.categoryScores.table_markup ?? 100;

  if (replacementRatio >= 0.1 && textScore < 93) {
    return {
      headingDelta,
      tableDelta,
      imageDelta,
      textOrderSimilarity: similarity,
      supportedLane: 'cid_text_extraction',
      reason: `pdf.js replacement-character ratio ${replacementRatio.toFixed(4)} aligns with text extractability ${textScore}.`,
    };
  }
  if (tableScore < 93 && (tableDelta > 0 || odl.denseTableHintCount > 0 || odl.undersegmentedTableHintCount > 0)) {
    return {
      headingDelta,
      tableDelta,
      imageDelta,
      textOrderSimilarity: similarity,
      supportedLane: 'table_structure',
      reason: `OpenDataLoader reports ${odl.tableCount} table(s) versus PDFAF ${pdfaf.tableCount}, with dense hints ${odl.denseTableHintCount}.`,
    };
  }
  if (readingScore < 93 && (headingDelta > 0 || (similarity !== null && similarity < 0.5))) {
    return {
      headingDelta,
      tableDelta,
      imageDelta,
      textOrderSimilarity: similarity,
      supportedLane: 'reading_order',
      reason: `Reading order score ${readingScore} plus heading/text-order mismatch suggests a native geometry lane to investigate.`,
    };
  }

  return {
    headingDelta,
    tableDelta,
    imageDelta,
    textOrderSimilarity: similarity,
    supportedLane: 'no_safe_lane',
    reason: 'No sidecar-supported lane met the conservative diagnostic thresholds.',
  };
}

export function scoringCalibrationForRow(
  pdfaf: PdfafSummary | undefined,
  comparison: DiagnosticRow['comparison'],
): ScoringCalibrationSummary {
  const categoryScores = pdfaf?.categoryScores ?? {};
  const replacementRisk = pdfaf?.replacementCharacterRisk ?? null;
  const nativePdfafSignalAvailable = {
    replacementCharacterRatio: pdfaf?.fontSyntaxAudit?.replacementCharacterRatio ?? 0,
    replacementCharacterCount: pdfaf?.fontSyntaxAudit?.replacementCharacterCount ?? 0,
    highReplacementCharacterPageCount: pdfaf?.fontSyntaxAudit?.highReplacementCharacterPageCount ?? 0,
    replacementCharacterTextRiskLevel: replacementRisk?.level ?? null,
    replacementCharacterTextRiskCap: replacementRisk?.scoreCap ?? null,
    readingOrderDetectionProfile: Boolean(pdfaf?.detectionProfile?.readingOrderSignals),
    tableDetectionProfile: Boolean(pdfaf?.detectionProfile?.tableSignals),
  };

  if (replacementRisk) {
    return {
      currentCategoryScores: categoryScores,
      nativePdfafSignalAvailable,
      suggestedScoringAction: 'text_extractability_penalty',
      reason: `Native replacement-character risk is ${replacementRisk.level}; text_extractability should be capped at ${replacementRisk.scoreCap}.`,
    };
  }
  if (comparison.supportedLane === 'reading_order') {
    return {
      currentCategoryScores: categoryScores,
      nativePdfafSignalAvailable,
      suggestedScoringAction: 'reading_order_diagnostic_only',
      reason: 'OpenDataLoader suggests a reading-order gap, but this pass has no accepted native scoring predicate.',
    };
  }
  if (comparison.supportedLane === 'table_structure') {
    return {
      currentCategoryScores: categoryScores,
      nativePdfafSignalAvailable,
      suggestedScoringAction: 'table_diagnostic_only',
      reason: 'OpenDataLoader suggests a table-structure gap, but table scoring remains unchanged in this pass.',
    };
  }
  return {
    currentCategoryScores: categoryScores,
    nativePdfafSignalAvailable,
    suggestedScoringAction: 'no_action',
    reason: comparison.supportedLane === 'odl_unavailable'
      ? 'No sidecar scoring action because OpenDataLoader evidence was unavailable.'
      : 'No native scoring-calibration signal met the threshold.',
  };
}

async function runOpenDataLoader(input: PdfInput, outDir: string, args: SidecarArgs): Promise<DiagnosticRow['odl']> {
  const rowDir = join(outDir, 'odl-json', input.id.replace(/[^a-z0-9_.-]+/gi, '_'));
  await mkdir(rowDir, { recursive: true });
  const odlArgs = [
    input.pdfPath,
    '--output-dir', rowDir,
    '--format', 'json',
    '--image-output', 'off',
    '--quiet',
    '--threads', '1',
  ];
  const command = await runCommandWithTimeout(args.odlCmd, odlArgs, args.timeoutMs);
  const stderrTail = command.stderr.trim().slice(-2_000) || undefined;
  if (command.status !== 'ok') {
    return {
      status: command.status,
      runtimeMs: command.runtimeMs,
      outputDir: rowDir,
      args: [args.odlCmd, ...odlArgs],
      error: command.error ?? `OpenDataLoader exited with code ${command.code ?? 'null'} signal ${command.signal ?? 'null'}`,
      stderrTail,
    };
  }

  const jsonFiles = await collectJsonFiles(rowDir);
  if (jsonFiles.length === 0) {
    return {
      status: 'no_json',
      runtimeMs: command.runtimeMs,
      outputDir: rowDir,
      args: [args.odlCmd, ...odlArgs],
      error: 'OpenDataLoader completed but produced no JSON file.',
      stderrTail,
    };
  }

  try {
    const parsed = JSON.parse(await readFile(jsonFiles[0]!, 'utf8')) as unknown;
    return {
      status: 'ok',
      runtimeMs: command.runtimeMs,
      outputDir: rowDir,
      args: [args.odlCmd, ...odlArgs],
      summary: summarizeOpenDataLoaderJson(parsed),
      stderrTail,
    };
  } catch (err) {
    return {
      status: 'parse_error',
      runtimeMs: command.runtimeMs,
      outputDir: rowDir,
      args: [args.odlCmd, ...odlArgs],
      error: (err as Error).message,
      stderrTail,
    };
  }
}

async function analyzeWithPdfaf(input: PdfInput): Promise<DiagnosticRow['pdfaf']> {
  const started = performance.now();
  try {
    const { result, snapshot } = await analyzePdf(input.pdfPath, basename(input.pdfPath), { bypassCache: true });
    return {
      status: 'ok',
      runtimeMs: performance.now() - started,
      summary: pdfafSummary(result, snapshot),
    };
  } catch (err) {
    return {
      status: 'failed',
      runtimeMs: performance.now() - started,
      error: (err as Error).message,
    };
  }
}

async function runRow(input: PdfInput, outDir: string, args: SidecarArgs): Promise<DiagnosticRow> {
  const [pdfaf, odl] = await Promise.all([
    analyzeWithPdfaf(input),
    runOpenDataLoader(input, outDir, args),
  ]);
  const comparison = selectLane(pdfaf.summary, odl.summary, odl.status);
  const scoringCalibration = scoringCalibrationForRow(pdfaf.summary, comparison);
  return {
    id: input.id,
    pdfPath: input.pdfPath,
    title: input.title ?? basename(input.pdfPath),
    pdfaf,
    odl,
    comparison,
    scoringCalibration,
  };
}

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function markdownReport(rows: DiagnosticRow[], args: SidecarArgs): string {
  const laneCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.comparison.supportedLane] = (acc[row.comparison.supportedLane] ?? 0) + 1;
    return acc;
  }, {});
  const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.odl.status] = (acc[row.odl.status] ?? 0) + 1;
    return acc;
  }, {});
  const scoringActionCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.scoringCalibration.suggestedScoringAction] =
      (acc[row.scoringCalibration.suggestedScoringAction] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# OpenDataLoader Sidecar Diagnostic',
    '',
    `- Created: ${new Date().toISOString()}`,
    `- PDFs requested: ${rows.length}`,
    `- OpenDataLoader command: \`${args.odlCmd}\``,
    `- OpenDataLoader timeout: ${args.timeoutMs}ms`,
    `- Run mode: \`--format json --image-output off --quiet --threads 1\``,
    `- ODL status counts: ${JSON.stringify(statusCounts)}`,
    `- Supported lane counts: ${JSON.stringify(laneCounts)}`,
    `- Suggested scoring-action counts: ${JSON.stringify(scoringActionCounts)}`,
    '',
    'This report is diagnostic-only. It does not write remediated PDFs, request `tagged-pdf`, change scores, or route remediation.',
    '',
    '| Row | PDFAF | ODL | Lane | Score Action | Replacement Ratio | Headings | Tables | Text Sim | Reason |',
    '| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    const pdfafScore = row.pdfaf.summary ? `${fmt(row.pdfaf.summary.score)}/${row.pdfaf.summary.grade}` : row.pdfaf.status;
    const cells = [
      row.id,
      pdfafScore,
      row.odl.status,
      row.comparison.supportedLane,
      row.scoringCalibration.suggestedScoringAction,
      fmt(row.scoringCalibration.nativePdfafSignalAvailable.replacementCharacterRatio, 4),
      fmt(row.comparison.headingDelta, 0),
      fmt(row.comparison.tableDelta, 0),
      fmt(row.comparison.textOrderSimilarity, 2),
      row.scoringCalibration.reason.replace(/\|/g, '/'),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const inputs = await loadPdfInputs(args);
  if (inputs.length === 0) {
    throw new Error('No PDFs selected. Provide --pdf or --manifest.');
  }
  await mkdir(args.outDir, { recursive: true });
  const rows: DiagnosticRow[] = [];
  for (const input of inputs) {
    console.log(`[odl-sidecar] ${input.id}: ${input.pdfPath}`);
    rows.push(await runRow(input, args.outDir, args));
  }

  const report = {
    createdAt: new Date().toISOString(),
    args: {
      manifest: args.manifest,
      outDir: args.outDir,
      limit: args.limit,
      odlCmd: args.odlCmd,
      timeoutMs: args.timeoutMs,
      runMode: ['--format', 'json', '--image-output', 'off', '--quiet', '--threads', '1'],
    },
    rows,
  };
  await writeFile(join(args.outDir, 'comparison-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.outDir, 'comparison-report.md'), markdownReport(rows, args));
  console.log(`[odl-sidecar] wrote ${join(args.outDir, 'comparison-report.md')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

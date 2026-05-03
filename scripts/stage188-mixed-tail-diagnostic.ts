#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage188MixedTail,
  type Stage188MixedTailClass,
} from '../src/services/remediation/stage188MixedTail.js';
import {
  collectStage186TargetRefs,
  type Stage186TableTarget,
} from '../src/services/remediation/stage186Hard2TableAlt.js';
import type { Stage181HiddenAltTarget } from '../src/services/remediation/stage181HiddenAlt.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../src/types.js';

const DEFAULT_SUMMARY = '/tmp/pdfaf-all-input-current-grade-summary.json';
const DEFAULT_OUT = 'Output/stage188-mixed-tail-diagnostic-2026-05-03-r1';

const PRIMARY_IDS = [
  '4213',
  '4105',
  '4694',
  '4690',
  '4147',
  '4453',
  '4735',
  'holdout4-11',
];
const SECONDARY_IDS = ['4503', '4145', '4748', '4761', '4767'];
const PARKED_IDS = ['structure-4076', 'long-4470', 'long-4516', 'long-4683', 'short-4214', 'short-4176'];
const PRIOR_WIN_IDS = [
  '4614',
  '4427',
  '3423',
  '3429',
  '3433',
  '3443',
  '3476',
  '3510',
  '4705',
  'figure-4754',
  'font-4057',
  'font-4172',
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
  stage?: number;
  round?: number;
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
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  reanalyzedCategories?: RunCategory[];
  appliedTools?: RunTool[];
  falsePositiveApplied?: number;
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
}
interface SummaryFile {
  manifests?: string[];
  resultFiles?: string[];
}
interface ManifestRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  absolutePath: string;
}
interface Stage188ToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  targetRefs: string[];
  tableBefore: number | null;
  tableAfter: number | null;
  altBefore: number | null;
  altAfter: number | null;
  pdfuaBefore: number | null;
  pdfuaAfter: number | null;
  note: string | null;
}
interface Stage188Row {
  id: string | null;
  publicationId: string | null;
  title: string | null;
  role: 'primary' | 'secondary' | 'parked' | 'prior_win' | 'extra';
  resultFile: string;
  sourcePdf: string | null;
  analyzedPdf: string | null;
  analyzedSource: 'remediated_pdf' | 'source_pdf' | 'missing_pdf';
  benchmark: {
    before: string;
    after: string;
    score: number | null;
    grade: string | null;
    falsePositiveApplied: number;
    wallRemediateMs: number | null;
  };
  analyzed: {
    score: number | null;
    grade: string | null;
    pdfClass: string | null;
  };
  categories: Partial<Record<CategoryKey, number | null>>;
  signals: {
    tableCount: number;
    tableTargets: Stage186TableTarget[];
    attemptedTableRefs: string[];
    altTargets: Stage181HiddenAltTarget[];
    attemptedAltRefs: string[];
    checkerVisibleFigureCount: number;
    checkerVisibleFigureAltCount: number;
    roleMapFigureTargets: number;
    orphanMcidCount: number;
    suspectedPathPaintOutsideMc: number;
    stronglyIrregularTableCount: number;
    directCellUnderTableCount: number;
    misplacedCellCount: number;
  } | null;
  stage188: {
    classification: Stage188MixedTailClass;
    shouldAttemptTable: boolean;
    shouldAttemptAlt: boolean;
    shouldAttemptPdfUaCleanup: boolean;
    reason: string;
  } | null;
  relevantTools: Stage188ToolSummary[];
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage188-mixed-tail-diagnostic.ts [options]

Options:
  --summary <path>              Combined snapshot JSON (default: ${DEFAULT_SUMMARY})
  --out <dir>                   Diagnostic output directory (default: ${DEFAULT_OUT})
  --ids <csv>                   Override target/control ids
  --file <id>                   Add a target/control id; repeatable
  --result-file <path>          Add a remediated results JSON; repeatable
  --manifest <path>             Add a manifest for source path lookup; repeatable
  --analyze-source              Analyze source PDFs when no written remediated PDF exists
  --write-target-manifest <p>   Write a local benchmark manifest for selected rows
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

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryScore(categories: RunCategory[] | undefined, key: CategoryKey): number | null {
  const row = categories?.find(category => category.key === key);
  return row?.applicable === false ? null : numberOrNull(row?.score);
}

function analysisCategoryScore(analysis: AnalysisResult | null, key: CategoryKey): number | null {
  const row = analysis?.categories.find(category => category.key === key);
  return row?.applicable === false ? null : numberOrNull(row?.score);
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^v1-/, '')
    .replace(/^v1_/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function rowKeys(row: RunRow | ManifestRow): Set<string> {
  const keys = new Set<string>();
  for (const value of [
    'id' in row ? row.id : undefined,
    'publicationId' in row ? row.publicationId : undefined,
    'title' in row ? row.title : undefined,
    'localFile' in row ? row.localFile : undefined,
    'file' in row ? row.file : undefined,
  ]) {
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
    if (normalizedKey.includes(normalizedAlias) && normalizedAlias.length >= 7) return true;
  }
  return false;
}

function rowsMatch(left: RunRow | ManifestRow, right: RunRow | ManifestRow): boolean {
  const leftKeys = [...rowKeys(left)].map(normalizeKey).filter(Boolean);
  const rightKeys = new Set([...rowKeys(right)].map(normalizeKey).filter(Boolean));
  return leftKeys.some(key => rightKeys.has(key));
}

function rowRole(row: RunRow): Stage188Row['role'] {
  if (PRIMARY_IDS.some(alias => matchesAlias(row, alias))) return 'primary';
  if (SECONDARY_IDS.some(alias => matchesAlias(row, alias))) return 'secondary';
  if (PARKED_IDS.some(alias => matchesAlias(row, alias))) return 'parked';
  if (PRIOR_WIN_IDS.some(alias => matchesAlias(row, alias))) return 'prior_win';
  return 'extra';
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadManifestRows(paths: string[]): Promise<ManifestRow[]> {
  const rows: ManifestRow[] = [];
  for (const manifestPath of paths) {
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
      const localFile = String(obj.localFile ?? obj.file ?? '');
      if (!localFile) continue;
      const id = String(obj.id ?? obj.publicationId ?? localFile);
      const publicationId = String(obj.publicationId ?? obj.id ?? id);
      rows.push({
        id,
        publicationId,
        title: String(obj.title ?? publicationId),
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
    selected.set(item.row.publicationId ?? item.row.id ?? `${item.resultFile}:${selected.size}`, item);
  }
  return [...selected.values()];
}

async function findRemediatedPdf(resultFile: string, row: RunRow): Promise<string | null> {
  const resultDir = dirname(resultFile);
  const names = await readdir(resultDir).catch(() => []);
  const prefixes = [row.publicationId, row.id].filter((value): value is string => Boolean(value));
  for (const name of names) {
    if (!name.endsWith('.remediated.pdf')) continue;
    if (prefixes.some(prefix => name.startsWith(`${prefix}-`) || name.includes(prefix))) return join(resultDir, name);
  }
  return null;
}

async function sourcePathFor(row: RunRow, manifestRows: ManifestRow[]): Promise<string | null> {
  for (const value of [row.localFile, row.file].filter((item): item is string => Boolean(item))) {
    if (isAbsolute(value) && await fileExists(value)) return value;
  }
  const manifest = manifestRows.find(candidate => rowsMatch(row, candidate));
  return manifest && await fileExists(manifest.absolutePath) ? manifest.absolutePath : null;
}

async function analyzeForRow(input: {
  resultFile: string;
  row: RunRow;
  manifestRows: ManifestRow[];
  analyzeSource: boolean;
}): Promise<{
  analysis: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
  pdfPath: string | null;
  sourcePdf: string | null;
  source: Stage188Row['analyzedSource'];
}> {
  const remediated = await findRemediatedPdf(input.resultFile, input.row);
  const sourcePdf = await sourcePathFor(input.row, input.manifestRows);
  const pdfPath = remediated ?? (input.analyzeSource ? sourcePdf : null);
  if (!pdfPath) return { analysis: null, snapshot: null, pdfPath: null, sourcePdf, source: 'missing_pdf' };
  const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  return {
    analysis: analyzed.result,
    snapshot: analyzed.snapshot,
    pdfPath,
    sourcePdf,
    source: remediated ? 'remediated_pdf' : 'source_pdf',
  };
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function replayCategory(details: unknown, suffix: 'Before' | 'After', key: CategoryKey): number | null {
  const scores = nested(nested(nested(parseRecord(details), 'debug'), 'replayState'), `categoryScores${suffix}`);
  return numberOrNull(scores?.[key]);
}

function noteFromDetails(details: unknown): string | null {
  const parsed = parseRecord(details);
  const note = parsed?.note ?? parsed?.raw;
  return typeof note === 'string' ? note.slice(0, 180) : null;
}

function relevantTools(row: RunRow): Stage188ToolSummary[] {
  const names = new Set([
    'normalize_table_structure',
    'set_table_header_cells',
    'repair_native_table_headers',
    'set_figure_alt_text',
    'retag_as_figure',
    'canonicalize_figure_alt_ownership',
    'repair_alt_text_structure',
    'remap_orphan_mcids_as_artifacts',
    'repair_native_link_structure',
    'normalize_heading_hierarchy',
  ]);
  return (row.appliedTools ?? [])
    .filter(tool => tool.toolName && names.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName!,
      outcome: tool.outcome ?? 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      delta: numberOrNull(tool.delta),
      targetRefs: [...collectStage186TargetRefs(tool.details)].sort(),
      tableBefore: replayCategory(tool.details, 'Before', 'table_markup'),
      tableAfter: replayCategory(tool.details, 'After', 'table_markup'),
      altBefore: replayCategory(tool.details, 'Before', 'alt_text'),
      altAfter: replayCategory(tool.details, 'After', 'alt_text'),
      pdfuaBefore: replayCategory(tool.details, 'Before', 'pdf_ua_compliance'),
      pdfuaAfter: replayCategory(tool.details, 'After', 'pdf_ua_compliance'),
      note: noteFromDetails(tool.details),
    }));
}

function categoriesFor(row: RunRow, analysis: AnalysisResult | null): Partial<Record<CategoryKey, number | null>> {
  const categories = row.reanalyzedCategories ?? row.afterCategories;
  const out: Partial<Record<CategoryKey, number | null>> = {};
  for (const key of ['heading_structure', 'reading_order', 'alt_text', 'table_markup', 'pdf_ua_compliance', 'link_quality'] as const) {
    out[key] = categoryScore(categories, key) ?? analysisCategoryScore(analysis, key);
  }
  return out;
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
    : [...PRIMARY_IDS, ...SECONDARY_IDS, ...PARKED_IDS, ...PRIOR_WIN_IDS];

  const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as SummaryFile;
  const resultFiles = repeatedArg('--result-file');
  const manifestPaths = repeatedArg('--manifest');
  const manifestRows = await loadManifestRows(manifestPaths.length > 0 ? manifestPaths : summary.manifests ?? []);
  const allRows = uniqueRows(await loadResultRows(resultFiles.length > 0 ? resultFiles : summary.resultFiles ?? []));
  const selected = allRows.filter(({ row }) => requestedAliases.some(alias => matchesAlias(row, alias)));

  const records: Stage188Row[] = [];
  for (const { row, resultFile } of selected) {
    const analyzed = await analyzeForRow({ resultFile, row, manifestRows, analyzeSource });
    const decision = analyzed.analysis && analyzed.snapshot
      ? classifyStage188MixedTail({
        analysis: analyzed.analysis,
        snapshot: analyzed.snapshot,
        appliedTools: (row.appliedTools ?? []) as AppliedRemediationTool[],
        parked: rowRole(row) === 'parked',
        falsePositiveApplied: Number(row.falsePositiveAppliedCount ?? row.falsePositiveApplied ?? 0),
      })
      : null;
    records.push({
      id: row.id ?? null,
      publicationId: row.publicationId ?? null,
      title: row.title ?? null,
      role: rowRole(row),
      resultFile,
      sourcePdf: analyzed.sourcePdf,
      analyzedPdf: analyzed.pdfPath,
      analyzedSource: analyzed.source,
      benchmark: {
        before: `${row.beforeScore ?? 'n/a'}/${row.beforeGrade ?? 'n/a'}`,
        after: `${row.afterScore ?? row.reanalyzedScore ?? 'n/a'}/${row.afterGrade ?? row.reanalyzedGrade ?? 'n/a'}`,
        score: numberOrNull(row.reanalyzedScore ?? row.afterScore),
        grade: typeof (row.reanalyzedGrade ?? row.afterGrade) === 'string' ? row.reanalyzedGrade ?? row.afterGrade ?? null : null,
        falsePositiveApplied: Number(row.falsePositiveAppliedCount ?? row.falsePositiveApplied ?? 0),
        wallRemediateMs: numberOrNull(row.wallRemediateMs),
      },
      analyzed: {
        score: analyzed.analysis?.score ?? null,
        grade: analyzed.analysis?.grade ?? null,
        pdfClass: analyzed.analysis?.pdfClass ?? row.afterPdfClass ?? null,
      },
      categories: categoriesFor(row, analyzed.analysis),
      signals: analyzed.snapshot && decision ? {
        tableCount: analyzed.snapshot.tables.length,
        tableTargets: decision.tableTargets,
        attemptedTableRefs: decision.attemptedTableRefs,
        altTargets: decision.altTargets,
        attemptedAltRefs: decision.attemptedAltRefs,
        checkerVisibleFigureCount: decision.checkerVisibleFigureCount,
        checkerVisibleFigureAltCount: decision.checkerVisibleFigureAltCount,
        roleMapFigureTargets: analyzed.snapshot.figures.filter(figure =>
          figure.reachable === true &&
          !figure.hasAlt &&
          (figure.role ?? '').replace(/^\//, '').toLowerCase() === 'figure' &&
          (figure.rawRole ?? '').replace(/^\//, '').toLowerCase() !== 'figure'
        ).length,
        orphanMcidCount: decision.orphanMcidCount,
        suspectedPathPaintOutsideMc: decision.suspectedPathPaintOutsideMc,
        stronglyIrregularTableCount: analyzed.snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0,
        directCellUnderTableCount: analyzed.snapshot.detectionProfile?.tableSignals.directCellUnderTableCount ?? 0,
        misplacedCellCount: analyzed.snapshot.detectionProfile?.tableSignals.misplacedCellCount ?? 0,
      } : null,
      stage188: decision ? {
        classification: decision.classification,
        shouldAttemptTable: decision.shouldAttemptTable,
        shouldAttemptAlt: decision.shouldAttemptAlt,
        shouldAttemptPdfUaCleanup: decision.shouldAttemptPdfUaCleanup,
        reason: decision.reason,
      } : null,
      relevantTools: relevantTools(row),
    });
  }

  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.stage188?.classification ?? 'not_analyzed';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const selectedRows = records
    .filter(record =>
      record.role === 'primary' &&
      (record.stage188?.shouldAttemptTable || record.stage188?.shouldAttemptAlt || record.stage188?.shouldAttemptPdfUaCleanup)
    )
    .map(record => record.publicationId ?? record.id ?? 'unknown');
  const report = {
    generatedAt: new Date().toISOString(),
    summaryPath: resolve(summaryPath),
    analyzeSourceFallback: analyzeSource,
    requestedAliases,
    records,
    decision: {
      distribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0
        ? 'run_focused_stage188_target_for_one_proven_path'
        : 'diagnostic_only_no_safe_mixed_path',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage188-mixed-tail-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 188 Mixed Table/Alt/PDF-UA Diagnostic', '', `Summary: \`${summaryPath}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Selected primary rows: ${selectedRows.length ? selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Grade | Class | Key lows | Table targets | Alt targets | Checker alt | PDF/UA debt | Reason |');
  lines.push('|---|---|---:|---|---|---:|---:|---:|---:|---|');
  for (const record of records) {
    const lows = Object.entries(record.categories)
      .filter(([, value]) => typeof value === 'number' && value < 80)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    lines.push([
      `\`${record.publicationId ?? record.id}\``,
      record.role,
      record.benchmark.after,
      record.stage188?.classification ?? 'not_analyzed',
      lows || 'none',
      String(record.signals?.tableTargets.length ?? 'n/a'),
      String(record.signals?.altTargets.length ?? 'n/a'),
      `${record.signals?.checkerVisibleFigureAltCount ?? 'n/a'}/${record.signals?.checkerVisibleFigureCount ?? 'n/a'}`,
      `orphans=${record.signals?.orphanMcidCount ?? 'n/a'} path=${record.signals?.suspectedPathPaintOutsideMc ?? 'n/a'}`,
      record.stage188?.reason ?? '',
    ].join(' | '));
  }
  lines.push('');
  for (const record of records.filter(row => row.role === 'primary' || row.role === 'secondary')) {
    lines.push(`## ${record.publicationId ?? record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title ?? ''}`);
    lines.push(`- Analyzed: ${record.analyzedSource}; ${record.analyzedPdf ?? 'missing PDF'}`);
    lines.push(`- Classification: ${record.stage188?.classification ?? 'not_analyzed'}; ${record.stage188?.reason ?? ''}`);
    lines.push(`- Categories: ${JSON.stringify(record.categories)}`);
    lines.push(`- Table targets: ${record.signals?.tableTargets.map(target => `${target.structRef}@p${target.page + 1}:ir${target.irregularRows}/c${target.dominantColumnCount}`).join(', ') || 'none'}`);
    lines.push(`- Alt targets: ${record.signals?.altTargets.map(target => `${target.toolName}:${target.structRef}@p${target.page + 1}:${target.source}`).join(', ') || 'none'}`);
    lines.push(`- Attempted refs: tables=${record.signals?.attemptedTableRefs.join(', ') || 'none'}; alt=${record.signals?.attemptedAltRefs.join(', ') || 'none'}`);
    lines.push(`- Tool deltas: ${record.relevantTools.map(tool => `${tool.toolName}:${tool.outcome}[${tool.targetRefs.join(',') || 'no-ref'}]:score ${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}, table ${tool.tableBefore ?? 'n/a'}->${tool.tableAfter ?? 'n/a'}, alt ${tool.altBefore ?? 'n/a'}->${tool.altAfter ?? 'n/a'}, pdfua ${tool.pdfuaBefore ?? 'n/a'}->${tool.pdfuaAfter ?? 'n/a'}${tool.note ? ` (${tool.note})` : ''}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage188-mixed-tail-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');

  const targetManifestPath = argValue('--write-target-manifest');
  if (targetManifestPath) {
    const manifestRowsForOutput = records
      .filter(record => record.sourcePdf)
      .map(record => ({
        publicationId: record.publicationId ?? record.id,
        title: record.title ?? record.publicationId ?? record.id,
        localFile: record.sourcePdf,
        stage188Role: record.role,
        stage188Class: record.stage188?.classification ?? 'not_analyzed',
      }));
    await writeFile(resolve(targetManifestPath), `${JSON.stringify({
      name: 'stage188-mixed-tail-target',
      createdAt: new Date().toISOString(),
      rows: manifestRowsForOutput,
    }, null, 2)}\n`, 'utf8');
  }

  console.log(`Wrote Stage 188 mixed-tail diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

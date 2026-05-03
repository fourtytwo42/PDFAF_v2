#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage189HiddenAltNoGain,
  type Stage189HiddenAltNoGainClass,
  type Stage189AltToolEvidence,
} from '../src/services/remediation/stage189HiddenAltNoGain.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../src/types.js';

const DEFAULT_SUMMARY = '/tmp/pdfaf-all-input-current-grade-summary.json';
const DEFAULT_OUT = 'Output/stage189-hidden-alt-no-gain-diagnostic-2026-05-03-r1';

const PRIMARY_IDS = ['4213'];
const SECONDARY_IDS = ['4453', '4748', '4767', '4145', 'font-4172'];
const DIAGNOSTIC_CONTROL_IDS = ['4105', '4147', '4735', '4690', '4694', 'holdout4-11', 'figure-4754', 'font-4057'];
const PARKED_IDS = ['structure-4076', 'long-4516', 'long-4683', 'short-4214', 'short-4176'];

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
interface Stage189Row {
  id: string | null;
  publicationId: string | null;
  title: string | null;
  role: 'primary' | 'secondary' | 'diagnostic_control' | 'parked' | 'extra';
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
    informativeFigureCount: number;
    informativeFigureAltCount: number;
    checkerVisibleFigureCount: number;
    checkerVisibleFigureAltCount: number;
    roleMapFigureTargetCount: number;
    nonFigureRoleCount: number;
    currentAltTargets: Array<{
      toolName: string;
      structRef: string;
      page: number;
      source: string;
      rawRole?: string | null;
      resolvedRole?: string | null;
      directContent: boolean;
      subtreeMcidCount: number;
    }>;
    attemptedAltRefs: string[];
    checkerTargets: Array<{
      structRef: string | null;
      page: number;
      hasAlt: boolean;
      rawRole: string | null;
      resolvedRole: string | null;
      reachable: boolean;
      directContent: boolean;
      parentPath: string[];
    }>;
    acrobatStyleAltRisks: DocumentSnapshot['acrobatStyleAltRisks'];
  } | null;
  stage189: {
    classification: Stage189HiddenAltNoGainClass;
    safeAnalyzerAlignmentCandidate: boolean;
    shouldCorrectTargetSelection: boolean;
    reason: string;
    bestReplayAltAfter: number | null;
    maxReplayCheckerVisibleWithAlt: number | null;
    maxReplayCheckerVisibleCount: number | null;
  } | null;
  altToolEvidence: Stage189AltToolEvidence[];
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage189-hidden-alt-no-gain-diagnostic.ts [options]

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

function rowRole(row: RunRow): Stage189Row['role'] {
  if (PRIMARY_IDS.some(alias => matchesAlias(row, alias))) return 'primary';
  if (SECONDARY_IDS.some(alias => matchesAlias(row, alias))) return 'secondary';
  if (DIAGNOSTIC_CONTROL_IDS.some(alias => matchesAlias(row, alias))) return 'diagnostic_control';
  if (PARKED_IDS.some(alias => matchesAlias(row, alias))) return 'parked';
  return 'extra';
}

function mdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
  source: Stage189Row['analyzedSource'];
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
    : [...PRIMARY_IDS, ...SECONDARY_IDS, ...DIAGNOSTIC_CONTROL_IDS, ...PARKED_IDS];

  const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as SummaryFile;
  const resultFiles = repeatedArg('--result-file');
  const manifestPaths = repeatedArg('--manifest');
  const manifestRows = await loadManifestRows(manifestPaths.length > 0 ? manifestPaths : summary.manifests ?? []);
  const allRows = uniqueRows(await loadResultRows(resultFiles.length > 0 ? resultFiles : summary.resultFiles ?? []));
  const selected = allRows.filter(({ row }) => requestedAliases.some(alias => matchesAlias(row, alias)));

  const records: Stage189Row[] = [];
  for (const { row, resultFile } of selected) {
    const analyzed = await analyzeForRow({ resultFile, row, manifestRows, analyzeSource });
    const decision = analyzed.analysis && analyzed.snapshot
      ? classifyStage189HiddenAltNoGain({
        analysis: analyzed.analysis,
        snapshot: analyzed.snapshot,
        appliedTools: (row.appliedTools ?? []) as AppliedRemediationTool[],
        parked: rowRole(row) === 'parked',
        falsePositiveApplied: Number(row.falsePositiveAppliedCount ?? row.falsePositiveApplied ?? 0),
      })
      : null;
    const checkerTargets = analyzed.snapshot?.checkerFigureTargets ?? [];
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
        informativeFigureCount: decision.informativeFigureCount,
        informativeFigureAltCount: decision.informativeFigureAltCount,
        checkerVisibleFigureCount: decision.checkerVisibleFigureCount,
        checkerVisibleFigureAltCount: decision.checkerVisibleFigureAltCount,
        roleMapFigureTargetCount: decision.roleMapFigureTargetCount,
        nonFigureRoleCount: decision.nonFigureRoleCount,
        currentAltTargets: decision.currentAltTargets,
        attemptedAltRefs: decision.attemptedAltRefs,
        checkerTargets: checkerTargets.map(target => ({
          structRef: target.structRef ?? null,
          page: target.page,
          hasAlt: target.hasAlt,
          rawRole: target.role ?? null,
          resolvedRole: target.resolvedRole ?? target.role ?? null,
          reachable: target.reachable,
          directContent: target.directContent,
          parentPath: target.parentPath,
        })),
        acrobatStyleAltRisks: analyzed.snapshot.acrobatStyleAltRisks,
      } : null,
      stage189: decision ? {
        classification: decision.classification,
        safeAnalyzerAlignmentCandidate: decision.safeAnalyzerAlignmentCandidate,
        shouldCorrectTargetSelection: decision.shouldCorrectTargetSelection,
        reason: decision.reason,
        bestReplayAltAfter: decision.bestReplayAltAfter,
        maxReplayCheckerVisibleWithAlt: decision.maxReplayCheckerVisibleWithAlt,
        maxReplayCheckerVisibleCount: decision.maxReplayCheckerVisibleCount,
      } : null,
      altToolEvidence: decision?.altToolEvidence ?? [],
    });
  }

  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.stage189?.classification ?? 'not_analyzed';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const behaviorCandidates = records.filter(record =>
    record.stage189?.safeAnalyzerAlignmentCandidate || record.stage189?.shouldCorrectTargetSelection
  );
  const report = {
    generatedAt: new Date().toISOString(),
    summaryPath: resolve(summaryPath),
    analyzeSourceFallback: analyzeSource,
    requestedAliases,
    records,
    decision: {
      distribution,
      behaviorCandidateRows: behaviorCandidates.map(record => record.publicationId ?? record.id ?? 'unknown'),
      recommendedDirection: behaviorCandidates.length > 0
        ? 'investigate_one_stage189_evidence_backed_fix'
        : 'diagnostic_only_no_safe_hidden_alt_rule',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage189-hidden-alt-no-gain-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 189 Hidden Alt No-Gain Diagnostic', '', `Summary: \`${summaryPath}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Behavior candidate rows: ${report.decision.behaviorCandidateRows.length ? report.decision.behaviorCandidateRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Grade | Class | Key lows | Checker alt | Informative alt | Role-map/non-Figure | Replay max | Reason |');
  lines.push('|---|---|---:|---|---|---:|---:|---:|---:|---|');
  for (const record of records) {
    const lows = Object.entries(record.categories)
      .filter(([, value]) => typeof value === 'number' && value < 80)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    lines.push(`| ${[
      `\`${record.publicationId ?? record.id}\``,
      record.role,
      record.benchmark.after,
      record.stage189?.classification ?? 'not_analyzed',
      lows || 'none',
      `${record.signals?.checkerVisibleFigureAltCount ?? 'n/a'}/${record.signals?.checkerVisibleFigureCount ?? 'n/a'}`,
      `${record.signals?.informativeFigureAltCount ?? 'n/a'}/${record.signals?.informativeFigureCount ?? 'n/a'}`,
      `${record.signals?.roleMapFigureTargetCount ?? 'n/a'}/${record.signals?.nonFigureRoleCount ?? 'n/a'}`,
      `${record.stage189?.bestReplayAltAfter ?? 'n/a'} alt, ${record.stage189?.maxReplayCheckerVisibleWithAlt ?? 'n/a'}/${record.stage189?.maxReplayCheckerVisibleCount ?? 'n/a'} checker`,
      record.stage189?.reason ?? '',
    ].map(mdCell).join(' | ')} |`);
  }
  lines.push('');
  for (const record of records.filter(row => row.role === 'primary' || row.role === 'secondary')) {
    lines.push(`## ${record.publicationId ?? record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title ?? ''}`);
    lines.push(`- Analyzed: ${record.analyzedSource}; ${record.analyzedPdf ?? 'missing PDF'}`);
    lines.push(`- Classification: ${record.stage189?.classification ?? 'not_analyzed'}; ${record.stage189?.reason ?? ''}`);
    lines.push(`- Categories: ${JSON.stringify(record.categories)}`);
    lines.push(`- Checker-visible targets: ${record.signals?.checkerTargets.map(target => `${target.structRef}@p${target.page + 1}:${target.hasAlt ? 'alt' : 'missing'}:${target.resolvedRole}`).join(', ') || 'none'}`);
    lines.push(`- Current alt targets: ${record.signals?.currentAltTargets.map(target => `${target.toolName}:${target.structRef}@p${target.page + 1}:${target.source}`).join(', ') || 'none'}`);
    lines.push(`- Attempted alt refs: ${record.signals?.attemptedAltRefs.join(', ') || 'none'}`);
    lines.push(`- Alt tool replay: ${record.altToolEvidence.map(tool => `${tool.toolName}:${tool.outcome}[${tool.targetRefs.join(',') || 'no-ref'}]:alt ${tool.beforeAlt ?? 'n/a'}->${tool.afterAlt ?? 'n/a'}, checker ${tool.checkerVisibleWithAltBefore ?? 'n/a'}/${tool.checkerVisibleBefore ?? 'n/a'}->${tool.checkerVisibleWithAltAfter ?? 'n/a'}/${tool.checkerVisibleAfter ?? 'n/a'}${tool.note ? ` (${tool.note})` : ''}`).join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage189-hidden-alt-no-gain-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');

  const targetManifestPath = argValue('--write-target-manifest');
  if (targetManifestPath) {
    const manifestRowsForOutput = records
      .filter(record => record.sourcePdf)
      .map(record => ({
        publicationId: record.publicationId ?? record.id,
        title: record.title ?? record.publicationId ?? record.id,
        localFile: record.sourcePdf,
        stage189Role: record.role,
        stage189Class: record.stage189?.classification ?? 'not_analyzed',
      }));
    await writeFile(resolve(targetManifestPath), `${JSON.stringify({
      name: 'stage189-hidden-alt-no-gain-target',
      createdAt: new Date().toISOString(),
      rows: manifestRowsForOutput,
    }, null, 2)}\n`, 'utf8');
  }

  console.log(`Wrote Stage 189 hidden-alt no-gain diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage192TrueMissingAlt,
  type Stage192MissingAltTargetClass,
} from '../src/services/remediation/stage192TrueMissingAlt.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../src/types.js';

const DEFAULT_SUMMARY = '/tmp/pdfaf-all-input-current-grade-summary.json';
const DEFAULT_OUT = 'Output/stage192-true-missing-alt-diagnostic-2026-05-03-r1';

const PRIMARY_IDS = ['4213', '4145', '4748', '4767'];
const CONTROL_IDS = ['4105', '4147', '4453', '4735', '4690', '4694', 'holdout4-11'];
const PRIOR_WIN_IDS = ['figure-4754', 'font-4057', 'font-4172', '3510', '4705', '3423', '3429', '3433', '3443', '3476'];
const PARKED_IDS = ['structure-4076', 'long-4516', 'long-4683', 'short-4214', 'short-4176'];

interface RunCategory { key?: string; score?: number; applicable?: boolean }
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
  appliedTools?: AppliedRemediationTool[];
  falsePositiveApplied?: number;
  falsePositiveAppliedCount?: number;
}
interface SummaryFile { manifests?: string[]; resultFiles?: string[] }
interface ManifestRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  absolutePath: string;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage192-true-missing-alt-diagnostic.ts [options]

Options:
  --summary <path>      Combined snapshot JSON (default: ${DEFAULT_SUMMARY})
  --out <dir>           Diagnostic output directory (default: ${DEFAULT_OUT})
  --ids <csv>           Override target/control ids
  --file <id>           Add a target/control id; repeatable
  --result-file <path>  Add a remediated results JSON; repeatable
  --manifest <path>     Add a manifest for source path lookup; repeatable
  --analyze-source      Analyze source PDFs when no written remediated PDF exists
  --help                Show this help`;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function repeatedArg(flag: string): string[] {
  const out: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) out.push(process.argv[index + 1]!);
  }
  return out;
}

function csvArg(flag: string): string[] {
  const value = argValue(flag);
  return value ? value.split(',').map(part => part.trim()).filter(Boolean) : [];
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^v1[-_]/, '')
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
    if (normalizedAlias.length >= 7 && normalizedKey.includes(normalizedAlias)) return true;
  }
  return false;
}

function rowsMatch(left: RunRow | ManifestRow, right: RunRow | ManifestRow): boolean {
  const rightKeys = new Set([...rowKeys(right)].map(normalizeKey));
  return [...rowKeys(left)].map(normalizeKey).some(key => rightKeys.has(key));
}

function rowRole(row: RunRow): 'primary' | 'control' | 'prior_win' | 'parked' | 'extra' {
  if (PRIMARY_IDS.some(alias => matchesAlias(row, alias))) return 'primary';
  if (CONTROL_IDS.some(alias => matchesAlias(row, alias))) return 'control';
  if (PRIOR_WIN_IDS.some(alias => matchesAlias(row, alias))) return 'prior_win';
  if (PARKED_IDS.some(alias => matchesAlias(row, alias))) return 'parked';
  return 'extra';
}

function categoryScore(categories: RunCategory[] | undefined, key: CategoryKey): number | null {
  const row = categories?.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function categoriesFor(row: RunRow, analysis: AnalysisResult | null): Partial<Record<CategoryKey, number | null>> {
  const categories = row.reanalyzedCategories ?? row.afterCategories;
  const out: Partial<Record<CategoryKey, number | null>> = {};
  for (const key of ['heading_structure', 'reading_order', 'alt_text', 'table_markup', 'pdf_ua_compliance', 'link_quality'] as const) {
    out[key] = categoryScore(categories, key) ??
      analysis?.categories.find(category => category.key === key)?.score ??
      null;
  }
  return out;
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
      rows.push({
        id,
        publicationId: String(obj.publicationId ?? obj.id ?? id),
        title: String(obj.title ?? obj.publicationId ?? id),
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
    const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as { rows?: RunRow[] } : null;
    const rows = Array.isArray(raw) ? raw as RunRow[] : (Array.isArray(record?.rows) ? record.rows : [raw as RunRow]);
    for (const row of rows) out.push({ row, resultFile });
  }
  return out;
}

function safeBase(name: string): string {
  return basename(name).replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
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
  const prefixes = [row.publicationId, row.id, row.file ? safeBase(row.file) : null]
    .filter((value): value is string => Boolean(value));
  for (const name of names) {
    if (!name.endsWith('.remediated.pdf') && !name.endsWith('_remediated.pdf')) continue;
    if (prefixes.some(prefix => name.startsWith(`${prefix}-`) || name.startsWith(`${prefix}_`) || name.includes(prefix))) {
      return join(resultDir, name);
    }
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
}): Promise<{ analysis: AnalysisResult | null; snapshot: DocumentSnapshot | null; pdfPath: string | null; analyzedSource: string }> {
  const remediated = await findRemediatedPdf(input.resultFile, input.row);
  const sourcePdf = await sourcePathFor(input.row, input.manifestRows);
  const pdfPath = remediated ?? (input.analyzeSource ? sourcePdf : null);
  if (!pdfPath) return { analysis: null, snapshot: null, pdfPath: null, analyzedSource: 'missing_pdf' };
  const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  return {
    analysis: analyzed.result,
    snapshot: analyzed.snapshot,
    pdfPath,
    analyzedSource: remediated ? 'remediated_pdf' : 'source_pdf',
  };
}

function mdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
  const requestedAliases = overrideIds.length > 0 ? overrideIds : [...PRIMARY_IDS, ...CONTROL_IDS, ...PRIOR_WIN_IDS, ...PARKED_IDS];
  const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as SummaryFile;
  const resultFiles = repeatedArg('--result-file');
  const manifestPaths = repeatedArg('--manifest');
  const manifestRows = await loadManifestRows(manifestPaths.length > 0 ? manifestPaths : summary.manifests ?? []);
  const allRows = uniqueRows(await loadResultRows(resultFiles.length > 0 ? resultFiles : summary.resultFiles ?? []));
  const selected = allRows.filter(({ row }) => requestedAliases.some(alias => matchesAlias(row, alias)));

  const records = [];
  for (const { row, resultFile } of selected) {
    const analyzed = await analyzeForRow({ resultFile, row, manifestRows, analyzeSource });
    const decision = analyzed.analysis && analyzed.snapshot
      ? classifyStage192TrueMissingAlt({
        analysis: analyzed.analysis,
        snapshot: analyzed.snapshot,
        appliedTools: row.appliedTools ?? [],
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
      analyzedPdf: analyzed.pdfPath,
      analyzedSource: analyzed.analyzedSource,
      benchmark: {
        before: `${row.beforeScore ?? 'n/a'}/${row.beforeGrade ?? 'n/a'}`,
        after: `${row.reanalyzedScore ?? row.afterScore ?? 'n/a'}/${row.reanalyzedGrade ?? row.afterGrade ?? 'n/a'}`,
        falsePositiveApplied: Number(row.falsePositiveAppliedCount ?? row.falsePositiveApplied ?? 0),
      },
      analyzed: {
        score: analyzed.analysis?.score ?? null,
        grade: analyzed.analysis?.grade ?? null,
        pdfClass: analyzed.analysis?.pdfClass ?? row.afterPdfClass ?? null,
      },
      categories: categoriesFor(row, analyzed.analysis),
      stage192: decision,
    });
  }

  const rowDistribution = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.stage192?.rowClassification ?? 'not_analyzed';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const targetDistribution = records.reduce<Record<Stage192MissingAltTargetClass, number>>((acc, record) => {
    for (const [key, count] of Object.entries(record.stage192?.targetClassCounts ?? {}) as Array<[Stage192MissingAltTargetClass, number]>) {
      acc[key] = (acc[key] ?? 0) + count;
    }
    return acc;
  }, {} as Record<Stage192MissingAltTargetClass, number>);
  const behaviorCandidateRows = records
    .filter(record => record.stage192?.behaviorCandidate)
    .map(record => record.publicationId ?? record.id ?? 'unknown');
  const report = {
    generatedAt: new Date().toISOString(),
    summaryPath: resolve(summaryPath),
    requestedAliases,
    records,
    decision: {
      rowDistribution,
      targetDistribution,
      behaviorCandidateRows,
      recommendedDirection: behaviorCandidateRows.length > 0
        ? 'investigate_one_stage192_deterministic_cleanup_path'
        : 'diagnostic_only_missing_alt_requires_semantic_or_more_specific_evidence',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage192-true-missing-alt-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 192 True Missing-Alt Diagnostic', '', `Summary: \`${summaryPath}\``, ''];
  lines.push('| Row class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(rowDistribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push('| Target class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(targetDistribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Behavior candidate rows: ${behaviorCandidateRows.length ? behaviorCandidateRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Grade | Row class | Key lows | Missing targets | Target mix | Reason |');
  lines.push('|---|---|---:|---|---|---:|---|---|');
  for (const record of records) {
    const lows = Object.entries(record.categories)
      .filter(([, value]) => typeof value === 'number' && value < 80)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    const targetMix = Object.entries(record.stage192?.targetClassCounts ?? {})
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    lines.push(`| ${[
      `\`${record.publicationId ?? record.id}\``,
      record.role,
      record.benchmark.after,
      record.stage192?.rowClassification ?? 'not_analyzed',
      lows || 'none',
      record.stage192?.missingAltTargets.length ?? 'n/a',
      targetMix || 'none',
      record.stage192?.reason ?? '',
    ].map(mdCell).join(' | ')} |`);
  }
  lines.push('');
  for (const record of records.filter(row => row.role === 'primary' || row.stage192?.behaviorCandidate)) {
    lines.push(`## ${record.publicationId ?? record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title ?? ''}`);
    lines.push(`- Analyzed: ${record.analyzedSource}; ${record.analyzedPdf ?? 'missing PDF'}`);
    lines.push(`- Row classification: ${record.stage192?.rowClassification ?? 'not_analyzed'}; ${record.stage192?.reason ?? ''}`);
    lines.push(`- Categories: ${JSON.stringify(record.categories)}`);
    lines.push('- Missing-alt targets:');
    for (const target of record.stage192?.missingAltTargets.slice(0, 80) ?? []) {
      lines.push(`  - ${target.structRef}@p${target.page + 1} ${target.rawRole}->${target.resolvedRole} ${target.source}: ${target.classification}; mcids=${target.subtreeMcidCount}; repeat=${target.repeatedSignatureCount}; bbox=${target.bbox ? target.bbox.join(',') : 'none'}; attempted=${target.attemptedBefore}; ${target.reason}`);
    }
    lines.push('');
  }
  await writeFile(join(outDir, 'stage192-true-missing-alt-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 192 true missing-alt diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

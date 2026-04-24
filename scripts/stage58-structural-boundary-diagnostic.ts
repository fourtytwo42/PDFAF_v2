#!/usr/bin/env tsx
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

type JsonRecord = Record<string, unknown>;

export type Stage58VarianceKind =
  | 'stable'
  | 'pure_ordering'
  | 'duplicate_drop_variation'
  | 'page_ref_text_mismatch'
  | 'missing_snapshot_detail';

export interface Stage58FieldComparison {
  field: string;
  kind: Stage58VarianceKind;
  canonicalizable: boolean;
  rawSignatures: string[];
  canonicalSignatures: string[];
  counts: number[];
  detail: string;
}

export interface Stage58Repeat {
  repeat: number;
  score: number | null;
  grade: string | null;
  categoryScores: Record<string, number>;
  detectionSignals: JsonRecord;
  fields: Record<string, unknown>;
  runtimeMs: number;
  error?: string;
}

export interface Stage58RowReport {
  rowId: string;
  publicationId: string;
  file: string;
  role: 'focus' | 'control';
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  comparisons: Stage58FieldComparison[];
  repeats: Stage58Repeat[];
  decision: {
    status: 'stable' | 'canonicalization_candidate' | 'non_canonicalizable_variance' | 'inconclusive';
    reasons: string[];
  };
}

export interface Stage58Report {
  generatedAt: string;
  manifestPath: string;
  repeatCount: number;
  rows: Stage58RowReport[];
  decision: {
    status: 'diagnostic_only' | 'canonicalization_candidate' | 'stable';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix_2/manifest.json';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage58-structural-boundary-diagnostic-2026-04-24-r1';
const DEFAULT_REPEATS = 5;
const DEFAULT_FOCUS_IDS = ['v1-4722', 'v1-4171', 'v1-4758'];
const DEFAULT_CONTROL_IDS = ['v1-3479', 'v1-3507', 'v1-3585'];
const STRUCTURAL_FIELDS = [
  'headings',
  'figures',
  'checkerFigureTargets',
  'tables',
  'paragraphStructElems',
  'orphanMcids',
  'mcidTextSpans',
  'structureTree',
  'taggedContentAudit',
  'detectionSignals',
] as const;

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage58-structural-boundary-diagnostic.ts [options]',
    `  --manifest <path>  Default: ${DEFAULT_MANIFEST}`,
    `  --out <dir>        Default: ${DEFAULT_OUT}`,
    `  --repeats <n>      Default: ${DEFAULT_REPEATS}`,
    '  --id <row-id>      Repeat to override focus ids',
    '  --control <id>     Repeat to override control ids',
  ].join('\n');
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
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

function textKey(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
}

function bboxKey(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(item => Number(item).toFixed(2)).join(',');
}

function identityFor(field: string, value: unknown): string {
  const item = value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
  if (field === 'headings') return [item['page'], item['level'], item['structRef'], textKey(item['text'])].join('|');
  if (field === 'figures') return [item['page'], item['structRef'], item['rawRole'], item['role'], item['hasAlt'], item['reachable'], item['directContent'], item['subtreeMcidCount'], bboxKey(item['bbox'])].join('|');
  if (field === 'checkerFigureTargets') return [item['page'], item['structRef'], item['role'], item['resolvedRole'], item['hasAlt'], item['reachable'], item['directContent']].join('|');
  if (field === 'tables') return [item['page'], item['structRef'], item['totalCells'], item['rowCount'], item['headerCount'], item['cellsMisplacedCount'], stableStringify(item['rowCellCounts'] ?? [])].join('|');
  if (field === 'paragraphStructElems') return [item['page'], item['structRef'], item['tag'], bboxKey(item['bbox']), textKey(item['text'])].join('|');
  if (field === 'orphanMcids') return [item['page'], item['mcid']].join('|');
  if (field === 'mcidTextSpans') return [item['page'], item['mcid'], textKey(item['resolvedText'] ?? item['snippet'])].join('|');
  return stableStringify(value);
}

function canonicalizeField(field: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(item => ({ identity: identityFor(field, item), value: item }))
      .sort((a, b) => a.identity.localeCompare(b.identity) || stableStringify(a.value).localeCompare(stableStringify(b.value)));
  }
  if (field === 'structureTree') return canonicalizeTree(value);
  return value ?? null;
}

function canonicalizeTree(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const object = value as JsonRecord;
  const children = Array.isArray(object['children'])
    ? object['children'].map(canonicalizeTree).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))
    : [];
  return { type: object['type'] ?? null, page: object['page'] ?? null, children };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function countFor(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return value == null ? 0 : 1;
}

function sortedIdentityCounts(field: string, value: unknown): Map<string, number> | null {
  if (!Array.isArray(value)) return null;
  const out = new Map<string, number>();
  for (const item of value) {
    const key = identityFor(field, item);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function mapSignature(map: Map<string, number> | null): string {
  if (!map) return 'not-array';
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `${key}#${count}`).join('\n');
}

export function compareStructuralField(field: string, values: unknown[]): Stage58FieldComparison {
  if (values.length === 0 || values.some(value => value === undefined)) {
    return {
      field,
      kind: 'missing_snapshot_detail',
      canonicalizable: false,
      rawSignatures: values.map(signature),
      canonicalSignatures: values.map(value => signature(canonicalizeField(field, value))),
      counts: values.map(countFor),
      detail: 'missing field in one or more repeats',
    };
  }
  const rawSignatures = values.map(signature);
  const canonicalSignatures = values.map(value => signature(canonicalizeField(field, value)));
  const counts = values.map(countFor);
  if (unique(rawSignatures).length === 1) {
    return { field, kind: 'stable', canonicalizable: true, rawSignatures, canonicalSignatures, counts, detail: 'raw signatures match' };
  }
  if (unique(canonicalSignatures).length === 1) {
    return { field, kind: 'pure_ordering', canonicalizable: true, rawSignatures, canonicalSignatures, counts, detail: 'canonical signatures match after deterministic ordering' };
  }
  const identitySignatures = values.map(value => mapSignature(sortedIdentityCounts(field, value)));
  if (unique(counts.map(String)).length > 1) {
    return { field, kind: 'duplicate_drop_variation', canonicalizable: false, rawSignatures, canonicalSignatures, counts, detail: 'identity counts differ across repeats' };
  }
  if (unique(identitySignatures).length > 1) {
    return { field, kind: 'page_ref_text_mismatch', canonicalizable: false, rawSignatures, canonicalSignatures, counts, detail: 'same count but page/ref/text/content identity differs' };
  }
  return { field, kind: 'page_ref_text_mismatch', canonicalizable: false, rawSignatures, canonicalSignatures, counts, detail: 'same count but page/ref/text/content identity differs' };
}

function categoryScores(result: AnalysisResult): Record<string, number> {
  return Object.fromEntries((result.categories ?? []).map(category => [category.key, category.score]));
}

function detectionSignals(result: AnalysisResult): JsonRecord {
  const profile = result.detectionProfile;
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

function structuralFields(snapshot: DocumentSnapshot, result: AnalysisResult): Record<string, unknown> {
  return {
    headings: snapshot.headings,
    figures: snapshot.figures,
    checkerFigureTargets: snapshot.checkerFigureTargets ?? [],
    tables: snapshot.tables,
    paragraphStructElems: snapshot.paragraphStructElems ?? [],
    orphanMcids: snapshot.orphanMcids ?? [],
    mcidTextSpans: snapshot.mcidTextSpans ?? [],
    structureTree: snapshot.structureTree,
    taggedContentAudit: snapshot.taggedContentAudit ?? null,
    detectionSignals: detectionSignals(result),
  };
}

async function analyzeRepeat(row: EdgeMixManifestRow, repeat: number): Promise<Stage58Repeat> {
  const started = performance.now();
  const inputBuffer = await readFile(row.absolutePath);
  const tmp = join(tmpdir(), `pdfaf-stage58-${row.publicationId}-${repeat}-${process.pid}.pdf`);
  try {
    await writeFile(tmp, inputBuffer);
    const analyzed = await analyzePdf(tmp, row.localFile, { bypassCache: true });
    return {
      repeat,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      categoryScores: categoryScores(analyzed.result),
      detectionSignals: detectionSignals(analyzed.result),
      fields: structuralFields(analyzed.snapshot, analyzed.result),
      runtimeMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      repeat,
      score: null,
      grade: null,
      categoryScores: {},
      detectionSignals: {},
      fields: {},
      runtimeMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function scoreRange(repeats: Stage58Repeat[]): Stage58RowReport['scoreRange'] {
  const scores = repeats.map(repeat => repeat.score).filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return { min: null, max: null, delta: null };
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return { min, max, delta: max - min };
}

export function buildStage58RowReport(input: {
  row: Pick<EdgeMixManifestRow, 'id' | 'publicationId' | 'localFile'>;
  role: 'focus' | 'control';
  repeats: Stage58Repeat[];
}): Stage58RowReport {
  const comparisons = STRUCTURAL_FIELDS.map(field => compareStructuralField(field, input.repeats.map(repeat => repeat.fields[field])));
  const unstable = comparisons.filter(comparison => comparison.kind !== 'stable');
  const nonCanonical = unstable.filter(comparison => !comparison.canonicalizable);
  const range = scoreRange(input.repeats);
  const status = input.repeats.some(repeat => repeat.error)
    ? 'inconclusive'
    : nonCanonical.length > 0
      ? 'non_canonicalizable_variance'
      : unstable.length > 0
        ? 'canonicalization_candidate'
        : 'stable';
  return {
    rowId: input.row.id,
    publicationId: input.row.publicationId,
    file: input.row.localFile,
    role: input.role,
    scoreRange: range,
    comparisons,
    repeats: input.repeats,
    decision: {
      status,
      reasons: [
        `scoreRange=${range.min ?? 'n/a'}-${range.max ?? 'n/a'} delta=${range.delta ?? 'n/a'}`,
        `${unstable.length} differing structural field(s)`,
        `${nonCanonical.length} non-canonicalizable field(s)`,
      ],
    },
  };
}

export function buildStage58Report(input: {
  manifestPath: string;
  repeatCount: number;
  rows: Stage58RowReport[];
  generatedAt?: string;
}): Stage58Report {
  const focusRows = input.rows.filter(row => row.role === 'focus');
  const harmful = focusRows.filter(row => row.scoreRange.delta != null && row.scoreRange.delta > 2);
  const nonCanonicalHarmful = harmful.filter(row => row.decision.status === 'non_canonicalizable_variance');
  const canonicalizableHarmful = harmful.filter(row => row.decision.status === 'canonicalization_candidate');
  const status = canonicalizableHarmful.length > 0 && nonCanonicalHarmful.length === 0
    ? 'canonicalization_candidate'
    : input.rows.every(row => row.decision.status === 'stable')
      ? 'stable'
      : 'diagnostic_only';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifestPath: resolve(input.manifestPath),
    repeatCount: input.repeatCount,
    rows: input.rows,
    decision: {
      status,
      recommendedNext: status === 'canonicalization_candidate'
        ? 'Implement deterministic ordering/exact-duplicate canonicalization only for the reported canonicalizable fields.'
        : status === 'stable'
          ? 'Proceed to the next structural fixer; boundary variance was not reproduced.'
          : 'Do not implement canonicalization from this evidence; park true missing/drop structural variance or design a quality-preserving analyzer fix.',
      reasons: [
        `${harmful.length} harmful focus row(s) with score delta > 2`,
        `${canonicalizableHarmful.length} harmful row(s) canonicalizable by ordering/exact duplicate handling`,
        `${nonCanonicalHarmful.length} harmful row(s) with non-canonicalizable structural variance`,
      ],
    },
  };
}

function markdown(report: Stage58Report): string {
  const lines = ['# Stage 58 Structural Boundary Diagnostic', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push('| row | role | score range | row decision | differing fields | non-canonical fields |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const differing = row.comparisons.filter(comparison => comparison.kind !== 'stable');
    const nonCanonical = differing.filter(comparison => !comparison.canonicalizable);
    lines.push(`| ${row.rowId} | ${row.role} | ${row.scoreRange.min ?? 'n/a'}-${row.scoreRange.max ?? 'n/a'} (${row.scoreRange.delta ?? 'n/a'}) | ${row.decision.status} | ${differing.map(field => `${field.field}:${field.kind}`).join(', ') || 'none'} | ${nonCanonical.map(field => field.field).join(', ') || 'none'} |`);
  }
  for (const row of report.rows) {
    lines.push('', `## ${row.rowId}`, `- File: \`${row.file}\``, `- Decision: \`${row.decision.status}\``, `- Reasons: ${row.decision.reasons.join('; ')}`);
    for (const comparison of row.comparisons.filter(item => item.kind !== 'stable')) {
      lines.push(`- ${comparison.field}: \`${comparison.kind}\`, canonicalizable=${comparison.canonicalizable}, counts=${comparison.counts.join('/')}, detail=${comparison.detail}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): { manifestPath: string; outDir: string; repeatCount: number; focusIds: string[]; controlIds: string[] } {
  let manifestPath = DEFAULT_MANIFEST;
  let outDir = DEFAULT_OUT;
  let repeatCount = DEFAULT_REPEATS;
  const focusIds: string[] = [];
  const controlIds: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--manifest') manifestPath = argv[++index] ?? manifestPath;
    else if (arg === '--out') outDir = argv[++index] ?? outDir;
    else if (arg === '--repeats') repeatCount = Number(argv[++index] ?? repeatCount);
    else if (arg === '--id') {
      const id = argv[++index];
      if (id) focusIds.push(id);
    } else if (arg === '--control') {
      const id = argv[++index];
      if (id) controlIds.push(id);
    } else if (arg === '--help' || arg === '-h') {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return {
    manifestPath,
    outDir,
    repeatCount: Number.isFinite(repeatCount) && repeatCount > 0 ? Math.floor(repeatCount) : DEFAULT_REPEATS,
    focusIds: focusIds.length ? focusIds : [...DEFAULT_FOCUS_IDS],
    controlIds: controlIds.length ? controlIds : [...DEFAULT_CONTROL_IDS],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const manifest = await loadEdgeMixManifest(args.manifestPath);
  const wanted = new Map<string, 'focus' | 'control'>();
  for (const id of args.focusIds) wanted.set(id, 'focus');
  for (const id of args.controlIds) if (!wanted.has(id)) wanted.set(id, 'control');

  const rows: Stage58RowReport[] = [];
  for (const row of manifest) {
    const role = wanted.get(row.id);
    if (!role) continue;
    const repeats: Stage58Repeat[] = [];
    for (let repeat = 1; repeat <= args.repeatCount; repeat += 1) repeats.push(await analyzeRepeat(row, repeat));
    rows.push(buildStage58RowReport({ row, role, repeats }));
    const latest = rows[rows.length - 1]!;
    console.log(`[${row.id}] ${latest.decision.status} score=${latest.scoreRange.min ?? 'n/a'}-${latest.scoreRange.max ?? 'n/a'} differing=${latest.comparisons.filter(c => c.kind !== 'stable').length}`);
  }
  const missing = [...wanted.keys()].filter(id => !rows.some(row => row.rowId === id));
  if (missing.length > 0) throw new Error(`Manifest missing requested row ids: ${missing.join(', ')}`);

  const report = buildStage58Report({ manifestPath: args.manifestPath, repeatCount: args.repeatCount, rows });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage58-structural-boundary-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage58-structural-boundary-diagnostic.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 58 structural boundary diagnostic to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
  console.log(report.decision.recommendedNext);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

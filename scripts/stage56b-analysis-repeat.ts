#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DetectionProfile, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

type JsonRecord = Record<string, unknown>;
type CategoryScores = Record<string, number>;

export type Stage56bVarianceClass =
  | 'stable_analysis'
  | 'pdfjs_variance'
  | 'python_structure_variance'
  | 'merge_or_detection_variance'
  | 'inconclusive_missing_snapshot_detail';

export interface Stage56bRepeatSummary {
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

export interface Stage56bRowReport {
  rowId: string;
  publicationId: string;
  file: string;
  role: 'focus' | 'control';
  classification: Stage56bVarianceClass;
  reason: string;
  repeats: Stage56bRepeatSummary[];
  changedFields: string[];
  scoreRange: { min: number | null; max: number | null; delta: number | null };
}

export interface Stage56bReport {
  generatedAt: string;
  manifestPath: string;
  repeatCount: number;
  focusIds: string[];
  controlIds: string[];
  rows: Stage56bRowReport[];
  decision: {
    status: 'diagnostic_only' | 'analysis_determinism_candidate' | 'stable_analysis';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix/manifest.json';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage56b-analysis-repeat-2026-04-24-r1';
const DEFAULT_REPEATS = 5;
const DEFAULT_FOCUS_IDS = ['v1-4683'];
const DEFAULT_CONTROL_IDS = ['v1-4139', 'v1-4567', 'v1-4215', 'v1-4122', 'v1-4751', 'v1-4627'];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage56b-analysis-repeat.ts [options]',
    `  --manifest <path>  Default: ${DEFAULT_MANIFEST}`,
    `  --out <dir>        Default: ${DEFAULT_OUT}`,
    `  --repeats <n>      Default: ${DEFAULT_REPEATS}`,
    '  --id <row-id>      Repeat to override focus ids',
    '  --control <id>     Repeat to override control ids',
  ].join('\n');
}

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
  const out: CategoryScores = {};
  for (const category of result.categories ?? []) out[category.key] = category.score;
  return out;
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

function sortableBBox(bbox?: [number, number, number, number]): string {
  return bbox ? bbox.map(value => Number(value).toFixed(2)).join(',') : '';
}

function sortedMapped<T>(items: T[], mapper: (item: T) => JsonRecord, keyer: (mapped: JsonRecord) => string): JsonRecord[] {
  return items.map(mapper).sort((a, b) => keyer(a).localeCompare(keyer(b)));
}

function snapshotParts(snapshot?: DocumentSnapshot): {
  pdfjs: JsonRecord | null;
  pythonStructure: JsonRecord | null;
  mergedSnapshot: JsonRecord | null;
  counts: JsonRecord;
} {
  if (!snapshot) {
    return { pdfjs: null, pythonStructure: null, mergedSnapshot: null, counts: {} };
  }
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
      bbox: sortableBBox(figure.bbox),
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
    }),
    table => `${table.page}:${table.structRef ?? ''}:${table.totalCells}:${table.headerCount}`,
  );
  const paragraphs = sortedMapped(
    snapshot.paragraphStructElems ?? [],
    elem => ({
      tag: elem.tag,
      text: elem.text.slice(0, 160),
      page: elem.page,
      structRef: elem.structRef,
      bbox: sortableBBox(elem.bbox),
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

function changedFields(repeats: Stage56bRepeatSummary[]): string[] {
  const fields: Array<[string, Array<string | null>]> = [
    ['score', repeats.map(repeat => repeat.signatures.score)],
    ['detection', repeats.map(repeat => repeat.signatures.detection)],
    ['pdfjs', repeats.map(repeat => repeat.signatures.pdfjs)],
    ['pythonStructure', repeats.map(repeat => repeat.signatures.pythonStructure)],
    ['mergedSnapshot', repeats.map(repeat => repeat.signatures.mergedSnapshot)],
  ];
  return fields.filter(([, values]) => uniqueValues(values).length > 1).map(([field]) => field);
}

export function classifyStage56bAnalysisVariance(repeats: Stage56bRepeatSummary[]): { classification: Stage56bVarianceClass; reason: string; changedFields: string[] } {
  if (repeats.length === 0 || repeats.some(repeat => !repeat.signatures.pdfjs || !repeat.signatures.pythonStructure || !repeat.signatures.mergedSnapshot)) {
    return { classification: 'inconclusive_missing_snapshot_detail', reason: 'missing_snapshot_signature', changedFields: changedFields(repeats) };
  }
  const changed = changedFields(repeats);
  if (changed.length === 0) return { classification: 'stable_analysis', reason: 'all_repeat_signatures_match', changedFields: [] };
  if (changed.includes('pdfjs')) return { classification: 'pdfjs_variance', reason: 'pdfjs_snapshot_signature_changed', changedFields: changed };
  if (changed.includes('pythonStructure')) return { classification: 'python_structure_variance', reason: 'python_structure_signature_changed', changedFields: changed };
  if (changed.includes('detection') || changed.includes('score') || changed.includes('mergedSnapshot')) {
    return { classification: 'merge_or_detection_variance', reason: 'score_or_detection_changed_with_stable_extractor_signatures', changedFields: changed };
  }
  return { classification: 'inconclusive_missing_snapshot_detail', reason: 'unclassified_signature_change', changedFields: changed };
}

async function analyzeRepeat(row: EdgeMixManifestRow, repeat: number): Promise<Stage56bRepeatSummary> {
  const started = performance.now();
  const inputBuffer = await readFile(row.absolutePath);
  const tmp = join(tmpdir(), `pdfaf-stage56b-${row.publicationId}-${repeat}-${process.pid}.pdf`);
  try {
    await writeFile(tmp, inputBuffer);
    const analyzed = await analyzePdf(tmp, row.localFile, { bypassCache: true });
    const parts = snapshotParts(analyzed.snapshot);
    return {
      repeat,
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
      repeat,
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

function scoreRange(repeats: Stage56bRepeatSummary[]): Stage56bRowReport['scoreRange'] {
  const scores = repeats.map(repeat => repeat.score).filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return { min: null, max: null, delta: null };
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return { min, max, delta: max - min };
}

async function buildRow(row: EdgeMixManifestRow, role: 'focus' | 'control', repeatCount: number): Promise<Stage56bRowReport> {
  const repeats: Stage56bRepeatSummary[] = [];
  for (let repeat = 1; repeat <= repeatCount; repeat += 1) {
    repeats.push(await analyzeRepeat(row, repeat));
  }
  const classified = classifyStage56bAnalysisVariance(repeats);
  return {
    rowId: row.id,
    publicationId: row.publicationId,
    file: row.localFile,
    role,
    classification: classified.classification,
    reason: classified.reason,
    repeats,
    changedFields: classified.changedFields,
    scoreRange: scoreRange(repeats),
  };
}

export function buildStage56bReport(input: {
  manifestPath: string;
  repeatCount: number;
  focusIds: string[];
  controlIds: string[];
  rows: Stage56bRowReport[];
  generatedAt?: string;
}): Stage56bReport {
  const harmful = input.rows.filter(row => row.role === 'focus' && row.scoreRange.delta != null && row.scoreRange.delta > 2);
  const unstable = input.rows.filter(row => row.classification !== 'stable_analysis');
  const status = harmful.some(row => row.classification !== 'stable_analysis')
    ? 'analysis_determinism_candidate'
    : unstable.length > 0
      ? 'diagnostic_only'
      : 'stable_analysis';
  const recommendedNext = status === 'analysis_determinism_candidate'
    ? 'Stabilize the first reported variance source before mutator or corpus expansion work.'
    : status === 'diagnostic_only'
      ? 'Document non-harmful analysis variance; do not add a mutator guard from this evidence.'
      : 'Analysis repeats are stable; Stage 57 may proceed to the next corpus or fixer family.';
  const distribution = new Map<Stage56bVarianceClass, number>();
  for (const row of input.rows) distribution.set(row.classification, (distribution.get(row.classification) ?? 0) + 1);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifestPath: resolve(input.manifestPath),
    repeatCount: input.repeatCount,
    focusIds: input.focusIds,
    controlIds: input.controlIds,
    rows: input.rows,
    decision: {
      status,
      recommendedNext,
      reasons: [
        ...[...distribution.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => `${count} row(s): ${key}`),
        `${harmful.length} harmful focus row(s) with score delta > 2`,
      ],
    },
  };
}

function markdown(report: Stage56bReport): string {
  const lines = ['# Stage 56B Initial Analysis Repeat Diagnostic', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push('| row | role | class | score range | changed fields |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.rowId} | ${row.role} | ${row.classification} | ${row.scoreRange.min ?? 'n/a'}-${row.scoreRange.max ?? 'n/a'} (${row.scoreRange.delta ?? 'n/a'}) | ${row.changedFields.join(', ') || 'none'} |`);
  }
  for (const row of report.rows) {
    lines.push('', `## ${row.rowId}`, `- File: \`${row.file}\``, `- Reason: ${row.reason}`);
    for (const repeat of row.repeats) {
      lines.push(`- Repeat ${repeat.repeat}: score=${repeat.score ?? 'error'} grade=${repeat.grade ?? 'n/a'} class=${repeat.pdfClass ?? 'n/a'} runtimeMs=${repeat.runtimeMs}`);
      lines.push(`  - categories: \`${JSON.stringify(repeat.categoryScores)}\``);
      lines.push(`  - counts: \`${JSON.stringify(repeat.snapshotCounts)}\``);
      lines.push(`  - detection: \`${JSON.stringify(repeat.detectionSignals)}\``);
      lines.push(`  - signatures: \`${JSON.stringify(repeat.signatures)}\``);
      if (repeat.error) lines.push(`  - error: ${repeat.error}`);
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
  if (!Number.isFinite(repeatCount) || repeatCount < 1) throw new Error('Expected --repeats to be a positive integer');
  return {
    manifestPath,
    outDir,
    repeatCount: Math.floor(repeatCount),
    focusIds: focusIds.length > 0 ? focusIds : [...DEFAULT_FOCUS_IDS],
    controlIds: controlIds.length > 0 ? controlIds : [...DEFAULT_CONTROL_IDS],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const manifest = await loadEdgeMixManifest(args.manifestPath);
  const wanted = new Map<string, 'focus' | 'control'>();
  for (const id of args.focusIds) wanted.set(id, 'focus');
  for (const id of args.controlIds) if (!wanted.has(id)) wanted.set(id, 'control');
  const rows: Stage56bRowReport[] = [];
  for (const row of manifest) {
    const role = wanted.get(row.id);
    if (!role) continue;
    rows.push(await buildRow(row, role, args.repeatCount));
  }
  const missing = [...wanted.keys()].filter(id => !rows.some(row => row.rowId === id));
  if (missing.length > 0) throw new Error(`Manifest missing requested row ids: ${missing.join(', ')}`);
  const report = buildStage56bReport({
    manifestPath: args.manifestPath,
    repeatCount: args.repeatCount,
    focusIds: args.focusIds,
    controlIds: args.controlIds,
    rows,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage56b-analysis-repeat.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage56b-analysis-repeat.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 56B analysis repeat report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
  console.log(report.decision.recommendedNext);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

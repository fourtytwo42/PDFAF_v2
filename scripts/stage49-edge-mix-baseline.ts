#!/usr/bin/env tsx
import 'dotenv/config';

import Database from 'better-sqlite3';
import { access, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { remediatePdf } from '../src/services/remediation/orchestrator.js';
import type { AnalysisResult, AppliedRemediationTool } from '../src/types.js';
import { applyFinalHiddenHeadingParity, type Stage52bHiddenHeadingParityAdjustment } from './stage52b-hidden-heading-parity.js';

type EdgeMixResidualFamily =
  | 'figure_alt_tail'
  | 'zero_heading_tail'
  | 'table_tail'
  | 'reading_order_tail'
  | 'font_text_tail'
  | 'annotation_link_tail'
  | 'mixed_tail'
  | 'manual_or_scanned_tail';

interface RawEdgeMixManifest {
  name?: string;
  rows?: unknown[];
}

interface RawEdgeMixManifestRow {
  publicationId?: unknown;
  title?: unknown;
  localFile?: unknown;
  v1Score?: unknown;
  v1Grade?: unknown;
  pageCount?: unknown;
  problemMix?: unknown;
}

export interface EdgeMixManifestRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  absolutePath: string;
  v1Score: number | null;
  v1Grade: string | null;
  pageCount: number | null;
  problemMix: string[];
}

export interface EdgeMixToolRow {
  toolName: string;
  stage: number;
  round: number;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  outcome: string;
  details?: string;
  durationMs?: number;
  source?: string;
}

export interface EdgeMixBenchmarkRow {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  localFile: string;
  v1Score: number | null;
  v1Grade: string | null;
  pageCount: number | null;
  problemMix: string[];
  beforeScore: number | null;
  beforeGrade: string | null;
  beforeCategories: Array<{ key: string; score: number; applicable?: boolean }>;
  beforePdfClass?: string | null;
  afterScore: number | null;
  afterGrade: string | null;
  afterCategories: Array<{ key: string; score: number; applicable?: boolean }>;
  afterPdfClass?: string | null;
  afterScoreCapsApplied?: unknown[];
  afterDetectionProfile?: Record<string, unknown> | null;
  delta: number | null;
  appliedTools: EdgeMixToolRow[];
  falsePositiveAppliedCount: number;
  wallRemediateMs: number | null;
  analysisBeforeMs: number | null;
  analysisAfterMs: number | null;
  totalPipelineMs: number | null;
  finalAdjustments?: Stage52bHiddenHeadingParityAdjustment[];
  error?: string;
}

interface EdgeMixSummary {
  count: number;
  success: number;
  errors: number;
  meanBefore: number;
  meanAfter: number;
  medianBefore: number;
  medianAfter: number;
  gradeDistributionBefore: Record<string, number>;
  gradeDistributionAfter: Record<string, number>;
  totalToolAttempts: number;
  falsePositiveAppliedCount: number;
  residualFamilyDistribution: Record<string, number>;
  selectedNextFixerFamily: string;
  selectedStage50FixerFamily: string;
}

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix/manifest.json';
const DEFAULT_OUT_ROOT = 'Output/from_sibling_pdfaf_v1_edge_mix';
const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage49-edge-mix-baseline.ts [options]

Options:
  --manifest <path>   Edge-mix manifest path (default: ${DEFAULT_MANIFEST})
  --out <dir>         Output run directory (default: ${DEFAULT_OUT_ROOT}/run-stage49-baseline-<date>-r1)
  --file <id>         Limit run to a publication id or manifest id; repeatable
  --write-pdfs        Write remediated PDFs into output dir
  --help              Show this help`;
}

function todayRunDir(): string {
  return join(DEFAULT_OUT_ROOT, `run-stage49-baseline-${new Date().toISOString().slice(0, 10)}-r1`);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function categoryMap(categories: Array<{ key: string; score: number }>): Record<string, number> {
  return Object.fromEntries(categories.map(category => [category.key, category.score]));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function gradeDistribution(grades: Array<string | null>): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(GRADE_ORDER.map(grade => [grade, 0]));
  for (const grade of grades) {
    if (!grade) continue;
    out[grade] = (out[grade] ?? 0) + 1;
  }
  return out;
}

function normalizeTool(tool: AppliedRemediationTool): EdgeMixToolRow {
  return {
    toolName: tool.toolName,
    stage: tool.stage,
    round: tool.round,
    scoreBefore: tool.scoreBefore,
    scoreAfter: tool.scoreAfter,
    delta: tool.delta,
    outcome: tool.outcome,
    ...(tool.details ? { details: tool.details } : {}),
    ...(typeof tool.durationMs === 'number' ? { durationMs: tool.durationMs } : {}),
    ...(tool.source ? { source: tool.source } : {}),
  };
}

function analysisCategories(analysis: AnalysisResult): Array<{ key: string; score: number; applicable?: boolean }> {
  return analysis.categories.map(category => ({
    key: category.key,
    score: category.score,
    applicable: category.applicable,
  }));
}

function parseDetails(details: unknown): { kind: 'json'; value: Record<string, unknown> } | { kind: 'legacy' | 'missing' } {
  if (!details) return { kind: 'missing' };
  if (typeof details === 'object' && !Array.isArray(details)) return { kind: 'json', value: details as Record<string, unknown> };
  if (typeof details !== 'string') return { kind: 'legacy' };
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { kind: 'legacy' };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { kind: 'json', value: parsed as Record<string, unknown> }
      : { kind: 'legacy' };
  } catch {
    return { kind: 'legacy' };
  }
}

function invariantFailureReason(details: Record<string, unknown>): string | null {
  if (details['outcome'] === 'no_effect' || details['outcome'] === 'failed') return `details_outcome_${details['outcome']}`;
  const inv = details['invariants'];
  if (!inv || typeof inv !== 'object' || Array.isArray(inv)) return null;
  const invariants = inv as Record<string, unknown>;
  for (const key of ['targetReachable', 'targetIsFigureAfter', 'tableTreeValidAfter', 'ownershipPreserved']) {
    if (invariants[key] === false) return `invariant_${key}_false`;
  }
  return null;
}

export function countFalsePositiveApplied(tools: EdgeMixToolRow[]): number {
  let count = 0;
  for (const tool of tools) {
    if (tool.outcome !== 'applied') continue;
    const parsed = parseDetails(tool.details);
    if (parsed.kind !== 'json') continue;
    if (invariantFailureReason(parsed.value)) count += 1;
  }
  return count;
}

export async function loadEdgeMixManifest(manifestPath: string): Promise<EdgeMixManifestRow[]> {
  const absoluteManifest = resolve(manifestPath);
  const corpusRoot = dirname(absoluteManifest);
  const raw = JSON.parse(await readFile(absoluteManifest, 'utf8')) as RawEdgeMixManifest;
  if (!Array.isArray(raw.rows)) throw new Error('Edge-mix manifest must contain a rows array.');
  const seen = new Set<string>();
  const rows: EdgeMixManifestRow[] = [];
  for (const [index, item] of raw.rows.entries()) {
    const obj = item as RawEdgeMixManifestRow;
    const publicationId = str(obj.publicationId);
    const localFile = str(obj.localFile);
    if (!publicationId) throw new Error(`Manifest row ${index} is missing publicationId.`);
    if (!localFile) throw new Error(`Manifest row ${publicationId} is missing localFile.`);
    if (seen.has(publicationId)) throw new Error(`Duplicate publicationId ${publicationId}.`);
    seen.add(publicationId);
    const absolutePath = resolve(corpusRoot, localFile);
    try {
      await access(absolutePath);
    } catch {
      throw new Error(`Manifest row ${publicationId} points to missing file ${absolutePath}.`);
    }
    rows.push({
      id: `v1-${publicationId}`,
      publicationId,
      title: str(obj.title) || publicationId,
      localFile,
      absolutePath,
      v1Score: num(obj.v1Score),
      v1Grade: str(obj.v1Grade) || null,
      pageCount: num(obj.pageCount),
      problemMix: Array.isArray(obj.problemMix) ? obj.problemMix.map(str).filter(Boolean) : [],
    });
  }
  return rows;
}

function terminalTools(row: EdgeMixBenchmarkRow, names: string[]): EdgeMixToolRow[] {
  return row.appliedTools.filter(tool => names.includes(tool.toolName) && ['no_effect', 'failed', 'rejected'].includes(tool.outcome));
}

export function classifyEdgeMixResidual(row: EdgeMixBenchmarkRow): {
  recommendedFamily: EdgeMixResidualFamily;
  families: EdgeMixResidualFamily[];
  reasons: string[];
} {
  if (row.error) return { recommendedFamily: 'manual_or_scanned_tail', families: ['manual_or_scanned_tail'], reasons: [`error=${row.error}`] };
  const cats = categoryMap(row.afterCategories);
  const detection = row.afterDetectionProfile ?? {};
  const heading = (detection['headingSignals'] ?? {}) as Record<string, unknown>;
  const figure = (detection['figureSignals'] ?? {}) as Record<string, unknown>;
  const table = (detection['tableSignals'] ?? {}) as Record<string, unknown>;
  const reading = (detection['readingOrderSignals'] ?? {}) as Record<string, unknown>;
  const pdfUa = (detection['pdfUaSignals'] ?? {}) as Record<string, unknown>;
  const annotation = (detection['annotationSignals'] ?? {}) as Record<string, unknown>;
  const families = new Set<EdgeMixResidualFamily>();
  const reasons: string[] = [];

  const headingScore = cats['heading_structure'] ?? 100;
  const headingCount = Number(heading['treeHeadingCount'] ?? 0);
  if (headingScore < 70 || headingCount === 0 || heading['extractedHeadingsMissingFromTree'] === true) {
    families.add('zero_heading_tail');
    reasons.push(`heading_structure=${headingScore}, treeHeadingCount=${headingCount}`);
  }

  const altScore = cats['alt_text'] ?? 100;
  const extractedFigures = Number(figure['extractedFigureCount'] ?? 0);
  const treeFigures = Number(figure['treeFigureCount'] ?? 0);
  const figureTerminal = terminalTools(row, ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'set_figure_alt_text', 'repair_alt_text_structure']).length;
  if (altScore < 70 || (extractedFigures > 0 && (treeFigures === 0 || figure['treeFigureMissingForExtractedFigures'] === true)) || figureTerminal > 0) {
    families.add('figure_alt_tail');
    reasons.push(`alt_text=${altScore}, extractedFigureCount=${extractedFigures}, treeFigureCount=${treeFigures}, terminalFigureTools=${figureTerminal}`);
  }

  const tableScore = cats['table_markup'] ?? 100;
  const directCells = Number(table['directCellUnderTableCount'] ?? 0);
  const rowless = Number(table['stronglyIrregularTableCount'] ?? 0);
  if (tableScore < 70 || directCells > 0 || rowless > 0) {
    families.add('table_tail');
    reasons.push(`table_markup=${tableScore}, directCellUnderTableCount=${directCells}, stronglyIrregularTableCount=${rowless}`);
  }

  const readingScore = cats['reading_order'] ?? 100;
  const orphanMcid = Number(pdfUa['orphanMcidCount'] ?? 0);
  if (readingScore < 70 || Number(reading['structureTreeDepth'] ?? 99) <= 1 || orphanMcid > 0) {
    families.add('reading_order_tail');
    reasons.push(`reading_order=${readingScore}, orphanMcidCount=${orphanMcid}`);
  }

  const textScore = cats['text_extractability'] ?? 100;
  if (textScore < 70 || Number(pdfUa['fontUnicodeCount'] ?? 0) > 0 || Number(pdfUa['fontEmbeddingCount'] ?? 0) > 0) {
    families.add('font_text_tail');
    reasons.push(`text_extractability=${textScore}, fontUnicodeCount=${Number(pdfUa['fontUnicodeCount'] ?? 0)}, fontEmbeddingCount=${Number(pdfUa['fontEmbeddingCount'] ?? 0)}`);
  }

  const linkScore = cats['link_quality'] ?? 100;
  const missingStructParent = Number(annotation['visibleAnnotationsMissingStructParent'] ?? annotation['linkAnnotationsMissingStructParent'] ?? 0);
  const missingStructure = Number(annotation['visibleAnnotationsMissingStructure'] ?? annotation['linkAnnotationsMissingStructure'] ?? 0);
  const annotationTerminal = terminalTools(row, ['repair_native_link_structure', 'tag_unowned_annotations', 'set_link_annotation_contents', 'normalize_annotation_tab_order']).length;
  if (linkScore < 70 || missingStructParent > 0 || missingStructure > 0 || annotationTerminal > 0) {
    families.add('annotation_link_tail');
    reasons.push(`link_quality=${linkScore}, missingStructParent=${missingStructParent}, missingStructure=${missingStructure}, terminalAnnotationTools=${annotationTerminal}`);
  }

  if ((row.afterPdfClass ?? '').includes('scanned') || row.problemMix.includes('manual_tail')) {
    families.add('manual_or_scanned_tail');
    reasons.push(`pdfClass=${row.afterPdfClass ?? 'unknown'}, problemMix=${row.problemMix.join(',')}`);
  }

  const familyList = [...families];
  if (familyList.length === 0) return { recommendedFamily: 'mixed_tail', families: [], reasons: ['no low residual family detected'] };
  if (familyList.length === 1) return { recommendedFamily: familyList[0]!, families: familyList, reasons };
  if (altScore <= 30 && extractedFigures > 0) return { recommendedFamily: 'figure_alt_tail', families: familyList, reasons };
  if (headingScore <= 30) return { recommendedFamily: 'zero_heading_tail', families: familyList, reasons };
  if (tableScore <= 35) return { recommendedFamily: 'table_tail', families: familyList, reasons };
  return { recommendedFamily: 'mixed_tail', families: familyList, reasons };
}

export function chooseStage50Fixer(rows: EdgeMixBenchmarkRow[]): string {
  const failing = rows.filter(row => !row.error && (row.afterScore ?? 100) < 90);
  const classified = failing.map(row => ({ row, classification: classifyEdgeMixResidual(row) }));
  const figureRows = classified.filter(({ classification }) => classification.families.includes('figure_alt_tail'));
  const figureRowsWithTerminalProof = figureRows.filter(({ row }) => terminalTools(row, ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'set_figure_alt_text', 'repair_alt_text_structure']).length > 0);
  if (figureRows.length >= 3 && figureRowsWithTerminalProof.length >= 3) return 'Figure/Alt Recovery v3';
  if (classified.filter(({ classification }) => classification.families.includes('zero_heading_tail')).length >= 3) return 'Heading Tail Recovery';
  if (classified.filter(({ classification }) => classification.families.includes('table_tail')).length >= 2) return 'Table Tail Follow-up';
  return 'Next deterministic structural family from edge-mix residuals';
}

export function buildEdgeMixSummary(rows: EdgeMixBenchmarkRow[]): EdgeMixSummary {
  const ok = rows.filter(row => !row.error);
  const beforeScores = ok.map(row => row.beforeScore).filter((score): score is number => typeof score === 'number');
  const afterScores = ok.map(row => row.afterScore).filter((score): score is number => typeof score === 'number');
  const residualFamilyDistribution: Record<string, number> = {};
  for (const row of rows.filter(row => row.error || (row.afterScore ?? 100) < 90)) {
    const family = classifyEdgeMixResidual(row).recommendedFamily;
    residualFamilyDistribution[family] = (residualFamilyDistribution[family] ?? 0) + 1;
  }
  const selectedNextFixerFamily = chooseStage50Fixer(rows);
  return {
    count: rows.length,
    success: ok.length,
    errors: rows.length - ok.length,
    meanBefore: mean(beforeScores),
    meanAfter: mean(afterScores),
    medianBefore: median(beforeScores),
    medianAfter: median(afterScores),
    gradeDistributionBefore: gradeDistribution(ok.map(row => row.beforeGrade)),
    gradeDistributionAfter: gradeDistribution(ok.map(row => row.afterGrade)),
    totalToolAttempts: rows.reduce((sum, row) => sum + row.appliedTools.length, 0),
    falsePositiveAppliedCount: rows.reduce((sum, row) => sum + row.falsePositiveAppliedCount, 0),
    residualFamilyDistribution,
    selectedNextFixerFamily,
    selectedStage50FixerFamily: selectedNextFixerFamily,
  };
}

function renderMarkdown(rows: EdgeMixBenchmarkRow[], summary: EdgeMixSummary): string {
  const lines = ['# v1 Edge Mix Baseline', ''];
  lines.push(`Files: ${summary.count} (${summary.success} OK, ${summary.errors} errors)`);
  lines.push(`Mean score: ${summary.meanBefore.toFixed(2)} -> ${summary.meanAfter.toFixed(2)}`);
  lines.push(`Median score: ${summary.medianBefore} -> ${summary.medianAfter}`);
  lines.push(`Grades after: \`${JSON.stringify(summary.gradeDistributionAfter)}\``);
  lines.push(`Total tool attempts: ${summary.totalToolAttempts}`);
  lines.push(`False-positive applied: ${summary.falsePositiveAppliedCount}`);
  lines.push(`Residual families: \`${JSON.stringify(summary.residualFamilyDistribution)}\``);
  lines.push(`Selected next fixer family: **${summary.selectedNextFixerFamily}**`, '');
  lines.push('| ID | File | v1 | Before | After | Family | Attempts | Runtime ms |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |');
  for (const row of rows) {
    const family = classifyEdgeMixResidual(row).recommendedFamily;
    const before = row.beforeScore == null ? 'ERR' : `${row.beforeScore}/${row.beforeGrade}`;
    const after = row.afterScore == null ? 'ERR' : `${row.afterScore}/${row.afterGrade}`;
    lines.push(`| ${row.publicationId} | ${row.localFile} | ${row.v1Score ?? 'n/a'}/${row.v1Grade ?? 'n/a'} | ${before} | ${after} | ${family} | ${row.appliedTools.length} | ${row.totalPipelineMs ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Residual Details');
  for (const row of rows.filter(row => row.error || (row.afterScore ?? 100) < 90)) {
    const classification = classifyEdgeMixResidual(row);
    lines.push(`### ${row.publicationId} ${row.title}`);
    lines.push(`- File: \`${row.localFile}\``);
    lines.push(`- Recommended family: \`${classification.recommendedFamily}\``);
    lines.push(`- Families: \`${classification.families.join(', ') || 'none'}\``);
    lines.push(`- Reasons: ${classification.reasons.join('; ')}`);
    const terminal = row.appliedTools
      .filter(tool => ['no_effect', 'failed', 'rejected'].includes(tool.outcome))
      .map(tool => `${tool.toolName}/${tool.outcome}`)
      .join(', ');
    lines.push(`- Terminal tools: ${terminal || 'none'}`);
  }
  return lines.join('\n');
}

async function runRow(row: EdgeMixManifestRow, writePdfs: boolean, outDir: string): Promise<EdgeMixBenchmarkRow> {
  const pipelineStart = performance.now();
  const baseFields = {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    file: row.localFile,
    localFile: row.localFile,
    v1Score: row.v1Score,
    v1Grade: row.v1Grade,
    pageCount: row.pageCount,
    problemMix: row.problemMix,
  };
  try {
    const inputBuffer = await readFile(row.absolutePath);
    const tmpIn = join(tmpdir(), `pdfaf-stage49-in-${randomUUID()}.pdf`);
    await writeFile(tmpIn, inputBuffer);
    const beforeStart = performance.now();
    const analyzed = await analyzePdf(tmpIn, row.localFile, { bypassCache: true });
    await unlink(tmpIn).catch(() => {});
    const analysisBeforeMs = Math.round(performance.now() - beforeStart);

    const memDb = new Database(':memory:');
    initSchema(memDb);
    const remStart = performance.now();
    const remediation = await remediatePdf(inputBuffer, row.localFile, analyzed.result, analyzed.snapshot, {
      maxRounds: 10,
      playbookStore: createPlaybookStore(memDb),
      toolOutcomeStore: createToolOutcomeStore(memDb),
    });
    memDb.close();
    const wallRemediateMs = Math.round(performance.now() - remStart);

    const tmpOut = join(tmpdir(), `pdfaf-stage49-out-${randomUUID()}.pdf`);
    await writeFile(tmpOut, remediation.buffer);
    const afterStart = performance.now();
    const after = await analyzePdf(tmpOut, row.localFile, { bypassCache: true });
    await unlink(tmpOut).catch(() => {});
    const analysisAfterMs = Math.round(performance.now() - afterStart);

    if (writePdfs) {
      await writeFile(join(outDir, `${row.publicationId}-${row.localFile.split('/').pop()!.replace(/\.pdf$/i, '')}.remediated.pdf`), remediation.buffer);
    }

    const appliedTools = remediation.remediation.appliedTools.map(normalizeTool);
    return applyFinalHiddenHeadingParity({
      ...baseFields,
      beforeScore: analyzed.result.score,
      beforeGrade: analyzed.result.grade,
      beforeCategories: analysisCategories(analyzed.result),
      beforePdfClass: analyzed.result.pdfClass,
      afterScore: after.result.score,
      afterGrade: after.result.grade,
      afterCategories: analysisCategories(after.result),
      afterPdfClass: after.result.pdfClass,
      afterScoreCapsApplied: after.result.scoreCapsApplied,
      afterDetectionProfile: after.result.detectionProfile as Record<string, unknown> | null,
      delta: after.result.score - analyzed.result.score,
      appliedTools,
      falsePositiveAppliedCount: countFalsePositiveApplied(appliedTools),
      wallRemediateMs,
      analysisBeforeMs,
      analysisAfterMs,
      totalPipelineMs: Math.round(performance.now() - pipelineStart),
    });
  } catch (error) {
    return {
      ...baseFields,
      beforeScore: null,
      beforeGrade: null,
      beforeCategories: [],
      afterScore: null,
      afterGrade: null,
      afterCategories: [],
      afterScoreCapsApplied: [],
      afterDetectionProfile: null,
      delta: null,
      appliedTools: [],
      falsePositiveAppliedCount: 0,
      wallRemediateMs: null,
      analysisBeforeMs: null,
      analysisAfterMs: null,
      totalPipelineMs: Math.round(performance.now() - pipelineStart),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  let manifestPath = DEFAULT_MANIFEST;
  let outDir = todayRunDir();
  let writePdfs = false;
  const targetIds = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--manifest') manifestPath = args[++i] ?? '';
    else if (arg === '--out') outDir = args[++i] ?? '';
    else if (arg === '--file') targetIds.add(args[++i] ?? '');
    else if (arg === '--write-pdfs') writePdfs = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}.\n${usage()}`);
    }
  }
  if (!manifestPath || !outDir) throw new Error(usage());
  await mkdir(outDir, { recursive: true });
  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const rows = targetIds.size > 0
    ? manifestRows.filter(row => targetIds.has(row.publicationId) || targetIds.has(row.id))
    : manifestRows;
  if (targetIds.size > 0) {
    const found = new Set(rows.flatMap(row => [row.publicationId, row.id]));
    const missing = [...targetIds].filter(id => !found.has(id));
    if (missing.length > 0) throw new Error(`Manifest target(s) not found: ${missing.join(', ')}`);
  }
  const results: EdgeMixBenchmarkRow[] = [];
  for (const row of rows) {
    const result = await runRow(row, writePdfs, outDir);
    results.push(result);
    const before = result.beforeScore == null ? 'ERR' : `${result.beforeScore}/${result.beforeGrade}`;
    const after = result.afterScore == null ? 'ERR' : `${result.afterScore}/${result.afterGrade}`;
    console.log(`[${row.publicationId}] ${row.localFile} ${before} -> ${after}`);
  }
  const summary = buildEdgeMixSummary(results);
  await writeFile(join(outDir, 'remediate.results.json'), JSON.stringify(results, null, 2));
  await writeFile(join(outDir, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), manifestPath: resolve(manifestPath), outDir: resolve(outDir), writePdfs, summary }, null, 2));
  await writeFile(join(outDir, 'summary.md'), renderMarkdown(results, summary));
  console.log(`Wrote Stage 49 edge-mix baseline to ${outDir}`);
  console.log(`Mean: ${summary.meanBefore.toFixed(2)} -> ${summary.meanAfter.toFixed(2)}`);
  console.log(`Grades after: ${JSON.stringify(summary.gradeDistributionAfter)}`);
  console.log(`Selected next fixer family: ${summary.selectedNextFixerFamily}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

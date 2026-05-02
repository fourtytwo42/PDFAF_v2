#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_2/manifest.json';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_2/stage177-hard2-remaining-f-diagnostic-2026-05-02-r1';
const DEFAULT_RUNS: Record<string, string> = {
  baseline: 'Output/from_sibling_pdfaf_v1_hard_2/run-stage176-hard2-baseline-2026-05-02-r1',
  full: 'Output/from_sibling_pdfaf_v1_hard_2/run-stage176-hard2-full-2026-05-02-r1',
  repeat4705: 'Output/from_sibling_pdfaf_v1_hard_2/run-stage176-target-4705-repeat-2026-05-02-r1',
  fresh4705: 'Output/from_sibling_pdfaf_v1_hard_2/run-stage177-target-4705-2026-05-02-r1',
};
const DEFAULT_IDS = ['v1-4705', 'v1-4105', 'v1-3510', 'v1-3508'];
const NATIVE_PRIMARY_IDS = new Set(['v1-4705', '4705']);
const MIXED_PRIMARY_IDS = new Set(['v1-4105', '4105']);

export type Stage177Classification =
  | 'native_synthesis_route_variance'
  | 'native_mcid_synthesis_fallback_candidate'
  | 'same_buffer_analyzer_variance'
  | 'mixed_residual_debt'
  | 'stable_control'
  | 'no_safe_rule';

export interface Stage177ClassificationInput {
  role: 'native_primary' | 'mixed_primary' | 'control';
  scoreRange: number;
  hasGoodRoute: boolean;
  hasBadRoute: boolean;
  goodRouteHasSynthesis: boolean;
  badRouteMissingSynthesis: boolean;
  finalReanalysisRange: number | null;
  pdfClass: string | null;
  headingStructure: number | null;
  pdfUaCompliance: number | null;
  tableMarkup: number | null;
  linkQuality: number | null;
  paragraphCount: number;
  mcidCount: number;
  structureDepth: number | null;
  orphanMcidCount: number;
}

export interface Stage177ClassificationResult {
  classification: Stage177Classification;
  implementable: boolean;
  reason: string;
}

export function classifyStage177RemainingF(input: Stage177ClassificationInput): Stage177ClassificationResult {
  if (input.finalReanalysisRange != null && input.finalReanalysisRange >= 10) {
    return { classification: 'same_buffer_analyzer_variance', implementable: false, reason: `final reanalysis range ${input.finalReanalysisRange}` };
  }
  if (input.role === 'mixed_primary') {
    return { classification: 'mixed_residual_debt', implementable: false, reason: 'mixed heading/table/alt/PDF-UA row parked for a dedicated stage' };
  }
  if (input.role === 'control') {
    return { classification: 'stable_control', implementable: false, reason: 'control row' };
  }
  if (input.hasGoodRoute && input.hasBadRoute && input.goodRouteHasSynthesis && input.badRouteMissingSynthesis) {
    return {
      classification: 'native_synthesis_route_variance',
      implementable: true,
      reason: 'good route uses bounded native synthesis while bad route misses it',
    };
  }
  if (
    input.pdfClass === 'native_tagged' &&
    input.headingStructure === 0 &&
    (input.pdfUaCompliance ?? 100) < 80 &&
    (input.tableMarkup ?? 100) >= 80 &&
    (input.linkQuality ?? 100) >= 80 &&
    input.paragraphCount < 8 &&
    input.mcidCount >= 24 &&
    (input.structureDepth ?? 0) >= 3 &&
    input.orphanMcidCount > 0
  ) {
    return {
      classification: 'native_mcid_synthesis_fallback_candidate',
      implementable: true,
      reason: 'native tagged zero-heading row has MCID/PDF-UA evidence but paragraph extraction dropped out',
    };
  }
  return { classification: 'no_safe_rule', implementable: false, reason: 'no deterministic safe route rule proven' };
}

interface RunCategory { key?: string; score?: number; applicable?: boolean }
interface RunTool {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
  debug?: { replayState?: { stateSignatureBefore?: string; stateSignatureAfter?: string; targetRef?: string } };
}
interface RunRow {
  id?: string;
  publicationId?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  afterPdfClass?: string;
  afterCategories?: RunCategory[];
  appliedTools?: RunTool[];
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage177-hard2-remaining-f-diagnostic.ts [options]

Options:
  --manifest <path>       Manifest path (default: ${DEFAULT_MANIFEST})
  --out <dir>             Diagnostic output directory (default: ${DEFAULT_OUT})
  --run <name=dir>        Add/override a run directory; repeatable
  --ids <csv>             Row ids/publication ids to include
  --file <id>             Add one row id/publication id; repeatable
  --final-repeats <n>     Reanalyze written PDFs N times when present (default: 1)
  --help                  Show this help`;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function repeatedArg(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

function csvArg(flag: string): string[] {
  const value = argValue(flag);
  return value ? value.split(',').map(part => part.trim()).filter(Boolean) : [];
}

function roleFor(row: EdgeMixManifestRow): Stage177ClassificationInput['role'] {
  if (NATIVE_PRIMARY_IDS.has(row.id) || NATIVE_PRIMARY_IDS.has(row.publicationId)) return 'native_primary';
  if (MIXED_PRIMARY_IDS.has(row.id) || MIXED_PRIMARY_IDS.has(row.publicationId)) return 'mixed_primary';
  return 'control';
}

function categoryScore(categories: RunCategory[] | undefined, key: string): number | null {
  const category = categories?.find(row => row.key === key);
  return category?.applicable === false ? null : typeof category?.score === 'number' ? category.score : null;
}

function analysisCategoryScore(analysis: AnalysisResult | null, key: string): number | null {
  const category = analysis?.categories.find(row => row.key === key);
  return category?.applicable === false ? null : typeof category?.score === 'number' ? category.score : null;
}

function rowMatches(row: EdgeMixManifestRow, ids: Set<string>): boolean {
  return ids.has(row.id) || ids.has(row.publicationId);
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const path = join(runDir, 'remediate.results.json');
  try {
    const rows = JSON.parse(await readFile(path, 'utf8')) as RunRow[];
    return new Map(rows.flatMap(row => {
      const keys = [row.id, row.publicationId].filter((value): value is string => Boolean(value));
      return keys.map(key => [key, row] as const);
    }));
  } catch {
    return new Map();
  }
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

async function analyzePdfRepeats(path: string | null, repeats: number): Promise<Array<Record<string, unknown>>> {
  if (!path || !(await fileExists(path))) return [];
  const rows = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const analyzed = await analyzePdf(path, basename(path), { bypassCache: true });
    const snapshot = analyzed.snapshot;
    rows.push({
      repeat,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      categories: {
        heading_structure: analysisCategoryScore(analyzed.result, 'heading_structure'),
        reading_order: analysisCategoryScore(analyzed.result, 'reading_order'),
        alt_text: analysisCategoryScore(analyzed.result, 'alt_text'),
        table_markup: analysisCategoryScore(analyzed.result, 'table_markup'),
        pdf_ua_compliance: analysisCategoryScore(analyzed.result, 'pdf_ua_compliance'),
        link_quality: analysisCategoryScore(analyzed.result, 'link_quality'),
      },
      signals: snapshotSignals(snapshot),
    });
  }
  return rows;
}

function snapshotSignals(snapshot: DocumentSnapshot | null): Record<string, unknown> | null {
  if (!snapshot) return null;
  return {
    pdfClass: snapshot.pdfClass,
    headings: snapshot.headings.length,
    paragraphs: snapshot.paragraphStructElems?.length ?? 0,
    mcids: snapshot.mcidTextSpans?.length ?? 0,
    figures: snapshot.figures.length,
    tables: snapshot.tables.length,
    structureDepth: snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
    orphanMcidCount: snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? null,
    pathPaintOutsideMc: snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? null,
  };
}

function runSummary(row: RunRow | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    before: `${row.beforeScore ?? 'n/a'}/${row.beforeGrade ?? 'n/a'}`,
    after: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
    score: row.afterScore ?? null,
    grade: row.afterGrade ?? null,
    pdfClass: row.afterPdfClass ?? null,
    categories: {
      heading_structure: categoryScore(row.afterCategories, 'heading_structure'),
      reading_order: categoryScore(row.afterCategories, 'reading_order'),
      alt_text: categoryScore(row.afterCategories, 'alt_text'),
      table_markup: categoryScore(row.afterCategories, 'table_markup'),
      pdf_ua_compliance: categoryScore(row.afterCategories, 'pdf_ua_compliance'),
      link_quality: categoryScore(row.afterCategories, 'link_quality'),
    },
    tools: toolTimeline(row),
  };
}

function toolTimeline(row: RunRow | undefined): Array<Record<string, unknown>> {
  return (row?.appliedTools ?? [])
    .filter(tool => /heading|structure|synthesize|artifact|alt|table|link|native/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? '',
      scoreBefore: tool.scoreBefore ?? null,
      scoreAfter: tool.scoreAfter ?? null,
      delta: tool.delta ?? null,
      signatureBefore: tool.debug?.replayState?.stateSignatureBefore ?? null,
      targetRef: tool.debug?.replayState?.targetRef ?? null,
      details: typeof tool.details === 'string' ? tool.details.slice(0, 220) : null,
    }));
}

function firstDivergence(good: RunRow | undefined, bad: RunRow | undefined): Record<string, unknown> | null {
  if (!good || !bad) return null;
  const goodTools = good.appliedTools ?? [];
  const badTools = bad.appliedTools ?? [];
  const length = Math.max(goodTools.length, badTools.length);
  for (let index = 0; index < length; index += 1) {
    const left = goodTools[index];
    const right = badTools[index];
    if (left?.toolName !== right?.toolName || left?.outcome !== right?.outcome) {
      return {
        index,
        good: left ? { toolName: left.toolName, outcome: left.outcome, scoreBefore: left.scoreBefore, scoreAfter: left.scoreAfter } : null,
        bad: right ? { toolName: right.toolName, outcome: right.outcome, scoreBefore: right.scoreBefore, scoreAfter: right.scoreAfter } : null,
      };
    }
  }
  return null;
}

function parseRunArgs(): Record<string, string> {
  const runs = { ...DEFAULT_RUNS };
  for (const value of repeatedArg('--run')) {
    const equals = value.indexOf('=');
    if (equals > 0) runs[value.slice(0, equals)] = value.slice(equals + 1);
  }
  return runs;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const manifestPath = argValue('--manifest') ?? DEFAULT_MANIFEST;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const ids = new Set([...DEFAULT_IDS, ...csvArg('--ids'), ...repeatedArg('--file')].filter(Boolean));
  const finalRepeats = Math.max(0, Math.min(5, Number(argValue('--final-repeats') ?? 1) || 1));
  const manifestRows = (await loadEdgeMixManifest(manifestPath)).filter(row => rowMatches(row, ids));
  const runDirs = parseRunArgs();
  const runRows = new Map<string, Map<string, RunRow>>();
  for (const [name, dir] of Object.entries(runDirs)) runRows.set(name, await loadRunRows(dir));

  const records = [];
  for (const row of manifestRows) {
    const summaries: Record<string, ReturnType<typeof runSummary>> = {};
    const finalRepeatsByRun: Record<string, Array<Record<string, unknown>>> = {};
    for (const [name, dir] of Object.entries(runDirs)) {
      const runRow = runRows.get(name)?.get(row.id) ?? runRows.get(name)?.get(row.publicationId);
      summaries[name] = runSummary(runRow);
      const pdfPath = await findRemediatedPdf(dir, row);
      finalRepeatsByRun[name] = await analyzePdfRepeats(pdfPath, finalRepeats);
    }
    const availableRows = Object.keys(runDirs)
      .map(name => runRows.get(name)?.get(row.id) ?? runRows.get(name)?.get(row.publicationId))
      .filter((value): value is RunRow => Boolean(value));
    const scores = availableRows.map(run => run.afterScore).filter((value): value is number => typeof value === 'number');
    const good = availableRows.find(run => (run.afterScore ?? 0) >= 80);
    const bad = availableRows.find(run => (run.afterScore ?? 100) < 70);
    const latest = availableRows.at(-1);
    const freshRepeats = finalRepeatsByRun.fresh4705 ?? [];
    const freshSignals = freshRepeats[0]?.signals as Record<string, unknown> | undefined;
    const latestCategories = latest?.afterCategories;
    const finalReanalysisRanges = Object.values(finalRepeatsByRun)
      .map(repeats => {
        const scores = repeats.map(repeat => repeat.score).filter((value): value is number => typeof value === 'number');
        return scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : null;
      })
      .filter((value): value is number => value != null);
    const classification = classifyStage177RemainingF({
      role: roleFor(row),
      scoreRange: scores.length ? Math.max(...scores) - Math.min(...scores) : 0,
      hasGoodRoute: availableRows.some(run => (run.afterScore ?? 0) >= 80),
      hasBadRoute: availableRows.some(run => (run.afterScore ?? 100) < 70),
      goodRouteHasSynthesis: availableRows.some(run => (run.afterScore ?? 0) >= 80 && (run.appliedTools ?? []).some(tool => tool.toolName === 'synthesize_basic_structure_from_layout')),
      badRouteMissingSynthesis: availableRows.some(run => (run.afterScore ?? 100) < 70 && !(run.appliedTools ?? []).some(tool => tool.toolName === 'synthesize_basic_structure_from_layout')),
      finalReanalysisRange: finalReanalysisRanges.length ? Math.max(...finalReanalysisRanges) : null,
      pdfClass: latest?.afterPdfClass ?? (freshSignals?.pdfClass as string | undefined) ?? null,
      headingStructure: categoryScore(latestCategories, 'heading_structure'),
      pdfUaCompliance: categoryScore(latestCategories, 'pdf_ua_compliance'),
      tableMarkup: categoryScore(latestCategories, 'table_markup'),
      linkQuality: categoryScore(latestCategories, 'link_quality'),
      paragraphCount: typeof freshSignals?.paragraphs === 'number' ? freshSignals.paragraphs : 0,
      mcidCount: typeof freshSignals?.mcids === 'number' ? freshSignals.mcids : 0,
      structureDepth: typeof freshSignals?.structureDepth === 'number' ? freshSignals.structureDepth : null,
      orphanMcidCount: typeof freshSignals?.orphanMcidCount === 'number' ? freshSignals.orphanMcidCount : 0,
    });
    records.push({
      id: row.id,
      publicationId: row.publicationId,
      role: roleFor(row),
      title: row.title,
      file: row.localFile,
      runs: summaries,
      finalRepeats: finalRepeatsByRun,
      firstDivergence: firstDivergence(good, bad),
      classification,
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
    runDirs: Object.fromEntries(Object.entries(runDirs).map(([name, dir]) => [name, resolve(dir)])),
    records,
    decision: {
      distribution,
      selectedRows,
      recommendedDirection: selectedRows.includes('v1-4705')
        ? 'keep_native_mcid_synthesis_fallback_if_validation_passes'
        : 'diagnostic_only_or_pivot_to_4105_mixed_residual',
    },
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage177-hard2-remaining-f-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 177 Hard-Holdout-2 Remaining F Diagnostic', '', `Manifest: \`${manifestPath}\``, ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(distribution).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push(`Recommended direction: **${report.decision.recommendedDirection}**`);
  lines.push(`Selected rows: ${selectedRows.length ? selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Class | Reason | Scores | First divergence |');
  lines.push('|---|---|---|---|---|---|');
  for (const record of records) {
    const scoreText = Object.entries(record.runs)
      .filter(([, summary]) => summary)
      .map(([name, summary]) => `${name}:${summary?.after}`)
      .join(', ');
    const div = record.firstDivergence
      ? `${(record.firstDivergence.good as { toolName?: string } | null)?.toolName ?? 'none'} vs ${(record.firstDivergence.bad as { toolName?: string } | null)?.toolName ?? 'none'}`
      : 'none';
    lines.push([
      `\`${record.id}\``,
      record.role,
      record.classification.classification,
      record.classification.reason,
      scoreText,
      div,
    ].join(' | '));
  }
  await writeFile(join(outDir, 'stage177-hard2-remaining-f-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 177 hard-holdout-2 diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { execFile } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PYTHON_SCRIPT_PATH } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage170NativeTitleOwnerBridge,
  extractNativeOwnerBridgeVisibleTitle,
  selectNativeTitleOwnerBridgeCandidate,
} from '../src/services/remediation/nativeTitleOwnerBridge.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const execFileAsync = promisify(execFile);

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_holdout_5/manifest.json';
const DEFAULT_STAGE168_FULL = 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage168-full-holdout5-2026-04-30-r1';
const DEFAULT_STAGE169_TARGET = 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage169-target-native-heading-2026-04-30-r1';
const DEFAULT_STAGE170_TARGET = 'Output/from_sibling_pdfaf_v1_holdout_5/run-stage170-target-native-title-owner-2026-05-01-r2';
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage168-full-2026-04-30-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_holdout_5/stage170-native-title-owner-bridge-diagnostic-2026-05-01-r1';
const DEFAULT_IDS = ['v1-4760', 'v1-4657', 'v1-4553', 'v1-3443', 'v1-3430', 'v1-3432'];
const ROUTE_VOLATILE_IDS = new Set(['v1-4657', 'v1-4553']);
const CONTROL_IDS = new Set(['v1-3443', 'v1-3430', 'v1-3432']);
const DEFAULT_LEGACY_CONTROL_IDS = ['fixture-inaccessible', 'figure-4754', 'font-4156', 'font-4172', 'font-4699'];

interface RunCategory { key?: string; score?: number; applicable?: boolean }
interface RunTool { toolName?: string; outcome?: string; scoreBefore?: number; scoreAfter?: number; details?: unknown }
interface RunRow {
  id?: string;
  publicationId?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: RunCategory[];
  reanalyzedCategories?: RunCategory[];
  appliedTools?: RunTool[];
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function csvArg(flag: string, fallback: string[]): string[] {
  const value = argValue(flag);
  return value ? value.split(',').map(part => part.trim()).filter(Boolean) : fallback;
}

function categoryScore(categories: RunCategory[] | undefined, key: string): number | null {
  const row = categories?.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function analysisScore(analysis: AnalysisResult, key: string): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  try {
    const rows = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as RunRow[];
    return new Map(rows.flatMap(row => [row.id, row.publicationId]
      .filter((value): value is string => Boolean(value))
      .map(key => [key, row] as const)));
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

async function selectAnalysisPdf(runDirs: string[], row: EdgeMixManifestRow): Promise<{ path: string; source: string }> {
  for (const runDir of runDirs) {
    const pdf = await findRemediatedPdf(runDir, row);
    if (pdf && await fileExists(pdf)) return { path: pdf, source: runDir };
  }
  return { path: row.absolutePath, source: 'source_pdf' };
}

async function dumpStructurePage(pdfPath: string): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await execFileAsync('python3', [PYTHON_SCRIPT_PATH, '--dump-structure-page', '0', pdfPath], {
      maxBuffer: 2 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof parsed['contentSnippet'] === 'string') parsed['contentSnippet'] = parsed['contentSnippet'].slice(0, 3000);
    return parsed;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function firstPageLines(snapshot: DocumentSnapshot): string[] {
  return (snapshot.textByPage[0] ?? '')
    .split(/\r?\n| {2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 16);
}

function summarizeRun(row: RunRow | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    beforeScore: row.beforeScore ?? null,
    beforeGrade: row.beforeGrade ?? null,
    afterScore: row.afterScore ?? null,
    afterGrade: row.afterGrade ?? null,
    reanalyzedScore: row.reanalyzedScore ?? null,
    reanalyzedGrade: row.reanalyzedGrade ?? null,
    heading: categoryScore(row.reanalyzedCategories, 'heading_structure') ?? categoryScore(row.afterCategories, 'heading_structure'),
    reading: categoryScore(row.reanalyzedCategories, 'reading_order') ?? categoryScore(row.afterCategories, 'reading_order'),
  };
}

function toolTimeline(row: RunRow | undefined): Array<Record<string, unknown>> {
  return (row?.appliedTools ?? [])
    .filter(tool => /heading|structure|owner|artifact|orphan|link|annotation|alt/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
      details: typeof tool.details === 'string' ? tool.details.slice(0, 220) : null,
    }));
}

async function main(): Promise<void> {
  const manifestPath = argValue('--manifest') ?? DEFAULT_MANIFEST;
  const stage168Full = argValue('--stage168-full-run') ?? DEFAULT_STAGE168_FULL;
  const stage169Target = argValue('--stage169-target-run') ?? DEFAULT_STAGE169_TARGET;
  const stage170Target = argValue('--stage170-target-run') ?? DEFAULT_STAGE170_TARGET;
  const legacyRun = argValue('--legacy-run') ?? DEFAULT_LEGACY_RUN;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const ids = new Set(csvArg('--ids', DEFAULT_IDS));
  const legacyControlIds = csvArg('--legacy-control-ids', DEFAULT_LEGACY_CONTROL_IDS);

  const manifestRows = (await loadEdgeMixManifest(manifestPath))
    .filter(row => ids.has(row.id) || ids.has(row.publicationId));
  const stage168Rows = await loadRunRows(stage168Full);
  const stage169Rows = await loadRunRows(stage169Target);
  const stage170Rows = await loadRunRows(stage170Target);
  const legacyRows = await loadRunRows(legacyRun);

  const records = [];
  for (const row of manifestRows) {
    const run168 = stage168Rows.get(row.id) ?? stage168Rows.get(row.publicationId);
    const run169 = stage169Rows.get(row.id) ?? stage169Rows.get(row.publicationId);
    const run170 = stage170Rows.get(row.id) ?? stage170Rows.get(row.publicationId);
    const analysisPdf = await selectAnalysisPdf([stage170Target, stage169Target, stage168Full], row);
    const analyzed = await analyzePdf(analysisPdf.path, basename(analysisPdf.path), { bypassCache: true });
    const disposition = classifyStage170NativeTitleOwnerBridge(analyzed.result, analyzed.snapshot, {
      routeVolatile: ROUTE_VOLATILE_IDS.has(row.id),
      alreadyFixedControl: CONTROL_IDS.has(row.id),
    });
    const candidate = selectNativeTitleOwnerBridgeCandidate(analyzed.result, analyzed.snapshot);
    const structDump = await dumpStructurePage(analysisPdf.path);
    records.push({
      id: row.id,
      publicationId: row.publicationId,
      role: row.id === 'v1-4760' ? 'primary' : ROUTE_VOLATILE_IDS.has(row.id) ? 'route_volatility_control' : 'control',
      title: row.title,
      analysisPdf: analysisPdf.path,
      analysisPdfSource: analysisPdf.source,
      runs: {
        stage168Full: summarizeRun(run168),
        stage169Target: summarizeRun(run169),
        stage170Target: summarizeRun(run170),
      },
      current: {
        score: analyzed.result.score,
        grade: analyzed.result.grade,
        pdfClass: analyzed.result.pdfClass,
        heading: analysisScore(analyzed.result, 'heading_structure'),
        reading: analysisScore(analyzed.result, 'reading_order'),
      },
      classification: disposition,
      visibleTitle: extractNativeOwnerBridgeVisibleTitle(analyzed.snapshot, analyzed.result.filename),
      selectedCandidate: candidate,
      firstPageLines: firstPageLines(analyzed.snapshot),
      nativeTitleBtCandidates: analyzed.snapshot.nativeTitleBtCandidates ?? [],
      firstPageMcidSamples: (analyzed.snapshot.mcidTextSpans ?? []).filter(item => item.page === 0).slice(0, 12),
      firstPageParagraphSamples: (analyzed.snapshot.paragraphStructElems ?? []).filter(item => item.page === 0).slice(0, 12),
      structurePageDump: structDump,
      toolTimeline: toolTimeline(run170 ?? run169 ?? run168),
    });
  }

  const legacyControls = legacyControlIds.map(id => ({
    id,
    run: summarizeRun(legacyRows.get(id)),
    toolTimeline: toolTimeline(legacyRows.get(id)).slice(0, 8),
  }));
  const distribution = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.classification.classification;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const selectedRows = records
    .filter(record => record.role === 'primary' && record.classification.classification === 'native_title_bt_owner_bridge_candidate')
    .map(record => record.id);
  const report = {
    generatedAt: new Date().toISOString(),
    manifest: resolve(manifestPath),
    runs: { stage168Full: resolve(stage168Full), stage169Target: resolve(stage169Target), stage170Target: resolve(stage170Target) },
    records,
    legacyControls,
    decision: {
      distribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0 ? 'run_native_title_owner_bridge' : 'diagnostic_only_park_native_title',
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage170-native-title-owner-bridge-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const md = ['# Stage 170 Native Title Owner Bridge Diagnostic', '', `Recommended direction: **${report.decision.recommendedDirection}**`, ''];
  md.push('| Class | Count |');
  md.push('|---|---:|');
  for (const [key, count] of Object.entries(distribution).sort()) md.push(`| ${key} | ${count} |`);
  md.push('', '| Row | Role | Current | Class | Visible Title | Candidate |');
  md.push('|---|---|---:|---|---|---|');
  for (const record of records) {
    md.push([
      `\`${record.id}\``,
      record.role,
      `${record.current.score}/${record.current.grade}`,
      record.classification.classification,
      record.visibleTitle ?? 'none',
      record.selectedCandidate ? `${record.selectedCandidate.groupIndexes.join(',')} score ${record.selectedCandidate.score}` : 'none',
    ].join(' | '));
  }
  md.push('', '## Legacy Controls', '', '| Row | Score | Heading/Reading |', '|---|---:|---|');
  for (const control of legacyControls) {
    const run = control.run as Record<string, unknown> | null;
    md.push(`| \`${control.id}\` | ${run ? `${run.afterScore}/${run.afterGrade}` : 'missing'} | ${run ? `${run.heading}/${run.reading}` : 'missing'} |`);
  }
  await writeFile(join(outDir, 'stage170-native-title-owner-bridge-diagnostic.md'), `${md.join('\n')}\n`, 'utf8');
  console.log(`Wrote Stage 170 diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

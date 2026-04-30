#!/usr/bin/env tsx
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';

type JsonRecord = Record<string, unknown>;

export type Stage158RunPhase = 'baseline' | 'candidate' | 'repeat' | 'target';

export type Stage158RowClass =
  | 'stable_fix_candidate'
  | 'route_order_variance'
  | 'same_buffer_analyzer_variance'
  | 'accepted_tool_harm'
  | 'manual_or_ocr_parked'
  | 'no_safe_candidate';

export interface Stage158RunInput {
  label: string;
  phase: Stage158RunPhase;
  runDir: string;
}

export interface Stage158RunScore {
  label: string;
  phase: Stage158RunPhase;
  score: number | null;
  grade: string | null;
  categories: Record<string, number>;
  falsePositiveApplied: number;
  toolCount: number;
  finalPdf?: {
    path: string;
    sha256: string;
    score: number;
    grade: string;
    scoreDeltaFromRun: number;
  };
}

export interface Stage158AcceptedToolHarm {
  runLabel: string;
  toolName: string;
  targetRef: string | null;
  targetCategory: string | null;
  targetDelta: number | null;
  droppedCategory: string;
  droppedDelta: number;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
}

export interface Stage158RowReport {
  id: string;
  publicationId: string;
  file: string;
  scores: Stage158RunScore[];
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  categoryRanges: Record<string, { min: number | null; max: number | null; delta: number | null }>;
  firstAcceptedToolHarm: Stage158AcceptedToolHarm | null;
  firstCategoryDrop: Stage158AcceptedToolHarm | null;
  finalPdfReanalysisMismatch: boolean;
  class: Stage158RowClass;
  reasons: string[];
}

export interface Stage158Report {
  generatedAt: string;
  runs: Stage158RunInput[];
  rows: Stage158RowReport[];
  classDistribution: Record<Stage158RowClass, number>;
  selectedNextDirection: 'route_stabilization' | 'stable_candidate_fixer' | 'diagnostic_only';
  decisionReasons: string[];
}

const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage158-active-tail-repeatability-triage-2026-04-30-r1';
const DEFAULT_RUNS: Stage158RunInput[] = [
  {
    label: 'stage156-baseline',
    phase: 'baseline',
    runDir: 'Output/stage145-low-grade-tail/run-stage156-active-tail-baseline-2026-04-29-r1',
  },
  {
    label: 'stage156-rejected-figure-cap',
    phase: 'candidate',
    runDir: 'Output/stage145-low-grade-tail/run-stage156-active-tail-figure-continuation-2026-04-29-r1',
  },
  {
    label: 'stage157-rejected-table-cap',
    phase: 'candidate',
    runDir: 'Output/stage145-low-grade-tail/run-stage157-active-tail-table-continuation-2026-04-29-r1',
  },
];

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];
const CORE_CATEGORIES = ['heading_structure', 'alt_text', 'table_markup', 'reading_order'] as const;
const LOW_SCORE_THRESHOLD = 80;
const STABLE_REPEAT_DELTA = 5;
const VOLATILE_REPEAT_DELTA = 10;
const STRONG_CATEGORY_DROP = 20;
const MANUAL_OR_OCR_IDS = new Set(['v1-v1-3451', 'v1-v1-3459', 'v1-v1-3602']);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage158-active-tail-repeatability-triage.ts [options]',
    `  --out <dir>                  Default: ${DEFAULT_OUT}`,
    '  --run <label,phase,dir>      Add run; phase=baseline|candidate|repeat|target',
    '  --file <id>                  Limit to publication id/canonical id; repeatable',
    '  --reanalyse-pdfs             Reanalyze final PDFs when run dirs contain *.remediated.pdf artifacts',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function canonicalId(row: JsonRecord): string {
  return str(row['publicationId']) || str(row['id']);
}

function categories(row: JsonRecord | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const list = Array.isArray(row?.['afterCategories']) ? row!['afterCategories'] as JsonRecord[] : [];
  for (const item of list) {
    const key = str(item['key']);
    const score = num(item['score']);
    if (key && score != null) out[key] = score;
  }
  return out;
}

function range(values: Array<number | null | undefined>): { min: number | null; max: number | null; delta: number | null } {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) return { min: null, max: null, delta: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, delta: max - min };
}

function falsePositiveCount(row: JsonRecord | undefined): number {
  return num(row?.['falsePositiveAppliedCount']) ?? num(row?.['falsePositiveApplied']) ?? 0;
}

function toolRows(row: JsonRecord | undefined): JsonRecord[] {
  return Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
}

function parseDetails(details: unknown): JsonRecord | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
}

function replayState(details: JsonRecord | null): JsonRecord | null {
  const debug = details?.['debug'];
  if (!debug || typeof debug !== 'object' || Array.isArray(debug)) return null;
  const replay = (debug as JsonRecord)['replayState'];
  return replay && typeof replay === 'object' && !Array.isArray(replay) ? replay as JsonRecord : null;
}

function replayCategories(replay: JsonRecord | null, key: 'categoryScoresBefore' | 'categoryScoresAfter'): Record<string, number> {
  const raw = replay?.[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [category, value] of Object.entries(raw as JsonRecord)) {
    const score = num(value);
    if (score != null) out[category] = score;
  }
  return out;
}

function targetCategoryForTool(toolName: string): string | null {
  if (/figure|alt/i.test(toolName)) return 'alt_text';
  if (/table/i.test(toolName)) return 'table_markup';
  if (/heading/i.test(toolName)) return 'heading_structure';
  if (/reading|structure|orphan|artifact|conformance/i.test(toolName)) return 'reading_order';
  if (/font/i.test(toolName)) return 'text_extractability';
  return null;
}

function targetRefFromDetails(details: JsonRecord | null): string | null {
  const inv = details?.['invariants'];
  if (inv && typeof inv === 'object' && !Array.isArray(inv)) {
    const ref = (inv as JsonRecord)['targetRef'];
    if (typeof ref === 'string' && ref.length > 0) return ref;
  }
  const debug = details?.['debug'];
  if (debug && typeof debug === 'object' && !Array.isArray(debug)) {
    const ref = (debug as JsonRecord)['targetRef'];
    if (typeof ref === 'string' && ref.length > 0) return ref;
  }
  return null;
}

function acceptedToolHarm(runLabel: string, row: JsonRecord | undefined): Stage158AcceptedToolHarm | null {
  for (const tool of toolRows(row)) {
    if (str(tool['outcome']) !== 'applied') continue;
    const toolName = str(tool['toolName']);
    const details = parseDetails(tool['details']);
    const replay = replayState(details);
    const before = replayCategories(replay, 'categoryScoresBefore');
    const after = replayCategories(replay, 'categoryScoresAfter');
    if (!Object.keys(before).length || !Object.keys(after).length) continue;
    const targetCategory = targetCategoryForTool(toolName);
    if (!targetCategory) continue;
    const targetDelta = targetCategory && before[targetCategory] != null && after[targetCategory] != null
      ? after[targetCategory]! - before[targetCategory]!
      : null;
    let strongestDrop: { key: string; delta: number } | null = null;
    for (const key of CORE_CATEGORIES) {
      if (key === targetCategory) continue;
      if (before[key] == null || after[key] == null) continue;
      const delta = after[key]! - before[key]!;
      if (delta <= -STRONG_CATEGORY_DROP && (!strongestDrop || delta < strongestDrop.delta)) {
        strongestDrop = { key, delta };
      }
    }
    if (strongestDrop && (targetDelta == null || targetDelta < 5)) {
      return {
        runLabel,
        toolName,
        targetRef: targetRefFromDetails(details),
        targetCategory,
        targetDelta,
        droppedCategory: strongestDrop.key,
        droppedDelta: strongestDrop.delta,
        stateSignatureBefore: str(replay?.['stateSignatureBefore']) || null,
        stateSignatureAfter: str(replay?.['stateSignatureAfter']) || null,
      };
    }
  }
  return null;
}

function isManualOrOcr(row: JsonRecord | undefined, id: string): boolean {
  if (MANUAL_OR_OCR_IDS.has(id)) return true;
  const file = str(row?.['localFile']) || str(row?.['file']);
  const beforeClass = str(row?.['beforePdfClass']);
  const afterClass = str(row?.['afterPdfClass']);
  const problemMix = Array.isArray(row?.['problemMix']) ? row!['problemMix'].map(String) : [];
  return file.includes('manual_scanned') || beforeClass.includes('scanned') || afterClass.includes('scanned') || problemMix.includes('manual_tail');
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function loadRows(runDir: string): Promise<Map<string, JsonRecord>> {
  const parsed = await readJson(join(runDir, 'remediate.results.json'));
  const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
  const out = new Map<string, JsonRecord>();
  for (const row of rows) {
    const id = canonicalId(row);
    if (id) out.set(id, row);
  }
  return out;
}

async function finalPdfFor(runDir: string, row: JsonRecord): Promise<string | null> {
  const id = canonicalId(row);
  const rowId = str(row['id']);
  try {
    const files = await readdir(runDir);
    const found = files.find(file =>
      file.endsWith('.remediated.pdf') &&
      (file.startsWith(`${id}-`) || (rowId.length > 0 && file.startsWith(`${rowId}-`)))
    );
    return found ? join(runDir, found) : null;
  } catch {
    return null;
  }
}

async function maybeReanalyzeFinalPdf(run: Stage158RunInput, row: JsonRecord, enabled: boolean): Promise<Stage158RunScore['finalPdf'] | undefined> {
  if (!enabled) return undefined;
  const path = await finalPdfFor(run.runDir, row);
  if (!path) return undefined;
  const buf = await readFile(path);
  const analyzed = await analyzePdf(path, basename(path), { bypassCache: true });
  return {
    path,
    sha256: createHash('sha256').update(buf).digest('hex'),
    score: analyzed.result.score,
    grade: analyzed.result.grade,
    scoreDeltaFromRun: analyzed.result.score - (num(row['afterScore']) ?? analyzed.result.score),
  };
}

export function classifyStage158Row(input: {
  id: string;
  representative?: JsonRecord;
  repeatScores: Array<number | null>;
  allScores: Array<number | null>;
  finalScore: number | null;
  finalGrade: string | null;
  finalCategories: Record<string, number>;
  firstAcceptedToolHarm: Stage158AcceptedToolHarm | null;
  finalPdfReanalysisMismatch: boolean;
}): { class: Stage158RowClass; reasons: string[] } {
  const reasons: string[] = [];
  if (isManualOrOcr(input.representative, input.id)) {
    return { class: 'manual_or_ocr_parked', reasons: ['manual_or_ocr_row_parked'] };
  }
  if (input.finalPdfReanalysisMismatch) {
    return { class: 'same_buffer_analyzer_variance', reasons: ['final_pdf_reanalysis_mismatch'] };
  }
  if (input.firstAcceptedToolHarm) {
    return {
      class: 'accepted_tool_harm',
      reasons: [`accepted_${input.firstAcceptedToolHarm.toolName}_dropped_${input.firstAcceptedToolHarm.droppedCategory}_${input.firstAcceptedToolHarm.droppedDelta}`],
    };
  }
  const repeatRange = range(input.repeatScores);
  if ((repeatRange.delta ?? 0) >= VOLATILE_REPEAT_DELTA) {
    return { class: 'route_order_variance', reasons: [`repeat_score_swing=${repeatRange.delta}`] };
  }
  const finalScore = input.finalScore ?? 100;
  if (input.finalGrade === 'A' || input.finalGrade === 'B' || finalScore >= LOW_SCORE_THRESHOLD) {
    return { class: 'no_safe_candidate', reasons: ['already_high_or_resolved'] };
  }
  const lowCategories = Object.entries(input.finalCategories)
    .filter(([key, score]) => CORE_CATEGORIES.includes(key as (typeof CORE_CATEGORIES)[number]) && score < 80)
    .map(([key]) => key);
  if (lowCategories.length === 0) {
    return { class: 'no_safe_candidate', reasons: ['no_core_low_category'] };
  }
  if ((repeatRange.delta ?? 0) <= STABLE_REPEAT_DELTA) {
    return { class: 'stable_fix_candidate', reasons: [`stable_low_categories=${lowCategories.sort().join(',')}`] };
  }
  return { class: 'route_order_variance', reasons: [`unstable_low_tail_repeat_delta=${repeatRange.delta ?? 'n/a'}`] };
}

export async function buildStage158Report(input: {
  runs: Stage158RunInput[];
  requestedIds?: Set<string>;
  reanalysePdfs?: boolean;
}): Promise<Stage158Report> {
  const runRows = await Promise.all(input.runs.map(async run => ({ run, rows: await loadRows(run.runDir) })));
  const allIds = new Set<string>();
  for (const { rows } of runRows) for (const id of rows.keys()) allIds.add(id);
  const ids = [...allIds]
    .filter(id => !input.requestedIds?.size || input.requestedIds.has(id))
    .sort();
  const rows: Stage158RowReport[] = [];
  for (const id of ids) {
    const perRun = runRows.map(({ run, rows: rowsForRun }) => ({ run, row: rowsForRun.get(id) }));
    const representative = perRun.find(item => item.row)?.row;
    const scores: Stage158RunScore[] = [];
    for (const { run, row } of perRun) {
      scores.push({
        label: run.label,
        phase: run.phase,
        score: num(row?.['afterScore']),
        grade: str(row?.['afterGrade']) || null,
        categories: categories(row),
        falsePositiveApplied: falsePositiveCount(row),
        toolCount: toolRows(row).length,
        finalPdf: row ? await maybeReanalyzeFinalPdf(run, row, Boolean(input.reanalysePdfs)) : undefined,
      });
    }
    const repeatScores = scores.filter(score => score.phase === 'baseline' || score.phase === 'repeat').map(score => score.score);
    const scoreRange = range(repeatScores);
    const categoryKeys = [...new Set(scores.flatMap(score => Object.keys(score.categories)))].sort();
    const categoryRanges = Object.fromEntries(categoryKeys.map(key => [
      key,
      range(scores.filter(score => score.phase === 'baseline' || score.phase === 'repeat').map(score => score.categories[key])),
    ]));
    const finalScore = [...scores].reverse().find(score => score.score != null)?.score ?? null;
    const finalGrade = [...scores].reverse().find(score => score.grade != null)?.grade ?? null;
    const finalCategories = [...scores].reverse().find(score => Object.keys(score.categories).length > 0)?.categories ?? {};
    const harms = perRun
      .map(item => item.row ? acceptedToolHarm(item.run.label, item.row) : null)
      .filter((value): value is Stage158AcceptedToolHarm => value !== null);
    const finalPdfReanalysisMismatch = scores.some(score => Math.abs(score.finalPdf?.scoreDeltaFromRun ?? 0) >= VOLATILE_REPEAT_DELTA);
    const classified = classifyStage158Row({
      id,
      representative,
      repeatScores,
      allScores: scores.map(score => score.score),
      finalScore,
      finalGrade,
      finalCategories,
      firstAcceptedToolHarm: harms[0] ?? null,
      finalPdfReanalysisMismatch,
    });
    rows.push({
      id,
      publicationId: id,
      file: str(representative?.['localFile']) || str(representative?.['file']),
      scores,
      scoreRange,
      categoryRanges,
      firstAcceptedToolHarm: harms[0] ?? null,
      firstCategoryDrop: harms[0] ?? null,
      finalPdfReanalysisMismatch,
      ...classified,
    });
  }
  const classDistribution = rows.reduce<Record<Stage158RowClass, number>>((acc, row) => {
    acc[row.class] += 1;
    return acc;
  }, {
    stable_fix_candidate: 0,
    route_order_variance: 0,
    same_buffer_analyzer_variance: 0,
    accepted_tool_harm: 0,
    manual_or_ocr_parked: 0,
    no_safe_candidate: 0,
  });
  const decisionReasons: string[] = [];
  if (classDistribution.accepted_tool_harm > 0) decisionReasons.push('accepted tool harm exists; route stabilization should be investigated before new fixers');
  if (classDistribution.route_order_variance > classDistribution.stable_fix_candidate) decisionReasons.push('route variance exceeds stable candidate count');
  if (classDistribution.stable_fix_candidate > 0) decisionReasons.push('stable low-grade candidates remain available after parking volatility');
  const selectedNextDirection = classDistribution.accepted_tool_harm > 0 || classDistribution.route_order_variance > classDistribution.stable_fix_candidate
    ? 'route_stabilization'
    : classDistribution.stable_fix_candidate > 0
      ? 'stable_candidate_fixer'
      : 'diagnostic_only';
  return {
    generatedAt: new Date().toISOString(),
    runs: input.runs,
    rows,
    classDistribution,
    selectedNextDirection,
    decisionReasons,
  };
}

function renderMarkdown(report: Stage158Report): string {
  const lines = [
    '# Stage 158 Active-Tail Repeatability Triage',
    '',
    `Decision: \`${report.selectedNextDirection}\``,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Class | Range | Latest | H | RO | Alt | Table | First harm | Reasons |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const latest = [...row.scores].reverse().find(score => score.score != null);
    const cats = latest?.categories ?? {};
    const harm = row.firstAcceptedToolHarm
      ? `${row.firstAcceptedToolHarm.runLabel}:${row.firstAcceptedToolHarm.toolName}:${row.firstAcceptedToolHarm.droppedCategory}${row.firstAcceptedToolHarm.droppedDelta}`
      : '';
    lines.push(`| ${row.publicationId} | ${row.class} | ${row.scoreRange.delta ?? 'n/a'} | ${latest?.score ?? 'n/a'} ${latest?.grade ?? ''} | ${cats.heading_structure ?? 'n/a'} | ${cats.reading_order ?? 'n/a'} | ${cats.alt_text ?? 'n/a'} | ${cats.table_markup ?? 'n/a'} | ${harm} | ${row.reasons.join('; ')} |`);
  }
  lines.push('', ...report.decisionReasons.map(reason => `- ${reason}`));
  return `${lines.join('\n')}\n`;
}

function parseRun(value: string): Stage158RunInput {
  const [label, phase, ...rest] = value.split(',');
  const runDir = rest.join(',');
  if (!label || !phase || !runDir) throw new Error(`Invalid --run value: ${value}`);
  if (!['baseline', 'candidate', 'repeat', 'target'].includes(phase)) throw new Error(`Invalid run phase: ${phase}`);
  return { label, phase: phase as Stage158RunPhase, runDir };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let outDir = DEFAULT_OUT;
  const runs = [...DEFAULT_RUNS];
  const requestedIds = new Set<string>();
  let reanalysePdfs = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--run') runs.push(parseRun(args[++i] ?? ''));
    else if (arg === '--file') requestedIds.add(args[++i] ?? '');
    else if (arg === '--reanalyse-pdfs') reanalysePdfs = true;
    else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  const report = await buildStage158Report({
    runs,
    requestedIds,
    reanalysePdfs,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage158-active-tail-repeatability-triage.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage158-active-tail-repeatability-triage.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export type Stage65Corpus = 'edge_mix_1' | 'edge_mix_2';

export type Stage65RunPhase = 'stage62' | 'stage64' | 'repeat';

export type Stage65RowClass =
  | 'stable_structural_residual'
  | 'parked_analyzer_volatility'
  | 'manual_scanned_debt'
  | 'mixed_no_safe_target'
  | 'resolved_or_stable_high'
  | 'inconclusive_repeat_missing';

export type Stage66Direction =
  | 'Table Tail Follow-up v3'
  | 'Mixed Structural Diagnostic'
  | 'Manual/Scanned Debt Diagnostic'
  | 'Analyzer Volatility Design'
  | 'No Fixer - Resolve Evidence Gap';

export interface Stage65RunInput {
  label: string;
  corpus: Stage65Corpus;
  phase: Stage65RunPhase;
  runDir: string;
}

export interface Stage65RunSummary {
  label: string;
  corpus: Stage65Corpus;
  phase: Stage65RunPhase;
  count: number;
  success: number;
  mean: number | null;
  median: number | null;
  grades: Record<string, number>;
  attempts: number;
  falsePositiveApplied: number;
  totalPipelineMs: number | null;
  p95PipelineMs: number | null;
}

export interface Stage65RowReport {
  id: string;
  publicationId: string;
  corpus: Stage65Corpus;
  file: string;
  scores: Array<{ label: string; phase: Stage65RunPhase; score: number | null; grade: string | null; categories: Record<string, number> }>;
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  categoryRanges: Record<string, { min: number | null; max: number | null; delta: number | null }>;
  stage64Gain: { required: boolean; repeated: boolean; scoreDeltaMin: number | null; altDeltaMin: number | null };
  class: Stage65RowClass;
  residualFamily: 'figure_alt' | 'table' | 'heading' | 'manual_scanned' | 'mixed' | 'none' | 'unknown';
  reasons: string[];
}

export interface Stage65Report {
  generatedAt: string;
  runs: Stage65RunInput[];
  runSummaries: Stage65RunSummary[];
  rows: Stage65RowReport[];
  classDistribution: Record<string, number>;
  selectedStage66Direction: Stage66Direction;
  decisionReasons: string[];
}

const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage65-repeatability-decision-2026-04-24-r1';

const DEFAULT_RUNS: Stage65RunInput[] = [
  {
    label: 'edge1-stage62',
    corpus: 'edge_mix_1',
    phase: 'stage62',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage62-edge-mix-2026-04-24-r1',
  },
  {
    label: 'edge1-stage64',
    corpus: 'edge_mix_1',
    phase: 'stage64',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage64-edge-mix-2026-04-24-r5',
  },
  {
    label: 'edge1-stage65-r1',
    corpus: 'edge_mix_1',
    phase: 'repeat',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage65-edge-mix-r1',
  },
  {
    label: 'edge1-stage65-r2',
    corpus: 'edge_mix_1',
    phase: 'repeat',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage65-edge-mix-r2',
  },
  {
    label: 'edge2-stage62',
    corpus: 'edge_mix_2',
    phase: 'stage62',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage62-edge-mix2-2026-04-24-r1',
  },
  {
    label: 'edge2-stage64',
    corpus: 'edge_mix_2',
    phase: 'stage64',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage64-edge-mix2-2026-04-24-r2',
  },
  {
    label: 'edge2-stage65-r1',
    corpus: 'edge_mix_2',
    phase: 'repeat',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage65-edge-mix2-r1',
  },
  {
    label: 'edge2-stage65-r2',
    corpus: 'edge_mix_2',
    phase: 'repeat',
    runDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage65-edge-mix2-r2',
  },
];

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];
const CORE_CATEGORIES = ['heading_structure', 'alt_text', 'table_markup', 'reading_order'] as const;
const LOW_CATEGORY_THRESHOLD = 70;
const LOW_SCORE_THRESHOLD = 80;
const PARKED_ANALYZER_ROWS = new Set(['v1-4683', 'v1-4171', 'v1-4487']);
const MANUAL_SCANNED_ROWS = new Set(['v1-3479', 'v1-3507']);
const STAGE64_GAIN_TARGETS = new Set(['v1-3921', 'v1-4145', 'v1-4758']);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage65-repeatability-decision.ts [options]',
    `  --out <dir>                   Default: ${DEFAULT_OUT}`,
    '  --run <label,corpus,phase,dir>  Add/override run; corpus=edge_mix_1|edge_mix_2, phase=stage62|stage64|repeat',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function p95(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
}

function range(values: Array<number | null | undefined>): { min: number | null; max: number | null; delta: number | null } {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (nums.length === 0) return { min: null, max: null, delta: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, delta: max - min };
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

function gradeDistribution(rows: JsonRecord[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(GRADE_ORDER.map(grade => [grade, 0]));
  for (const row of rows) {
    const grade = str(row['afterGrade']);
    if (grade) out[grade] = (out[grade] ?? 0) + 1;
  }
  return out;
}

function canonicalId(row: JsonRecord): string {
  const id = str(row['id']);
  if (id) return id.startsWith('v1-') ? id : `v1-${id}`;
  const publicationId = str(row['publicationId']);
  return publicationId ? `v1-${publicationId.replace(/^v1-/, '')}` : '';
}

function isManualScanned(row: JsonRecord | undefined, id: string): boolean {
  if (MANUAL_SCANNED_ROWS.has(id)) return true;
  const localFile = str(row?.['localFile']) || str(row?.['file']);
  const beforeClass = str(row?.['beforePdfClass']);
  const afterClass = str(row?.['afterPdfClass']);
  const problemMix = Array.isArray(row?.['problemMix']) ? row!['problemMix'] as unknown[] : [];
  return localFile.includes('manual_scanned') ||
    beforeClass.includes('scanned') ||
    afterClass.includes('scanned') ||
    problemMix.map(String).includes('manual_tail');
}

function lowCategoryKeys(cats: Record<string, number>): string[] {
  return Object.entries(cats)
    .filter(([, score]) => score < LOW_CATEGORY_THRESHOLD)
    .map(([key]) => key)
    .sort();
}

function falsePositiveCount(row: JsonRecord): number {
  return num(row['falsePositiveAppliedCount']) ?? 0;
}

function structuralToolFamilies(row: JsonRecord | undefined): Set<string> {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  const out = new Set<string>();
  for (const tool of tools) {
    const name = str(tool['toolName']);
    if (/figure|alt/i.test(name)) out.add('figure_alt');
    if (/table/i.test(name)) out.add('table');
    if (/heading|synthesize|structure_conformance/i.test(name)) out.add('heading');
  }
  return out;
}

function residualFamily(row: JsonRecord | undefined, cats: Record<string, number>): Stage65RowReport['residualFamily'] {
  if (!row) return 'unknown';
  const lowCore = CORE_CATEGORIES.filter(key => (cats[key] ?? 100) < LOW_CATEGORY_THRESHOLD);
  const families = structuralToolFamilies(row);
  if (isManualScanned(row, canonicalId(row)) && (num(row['afterScore']) ?? 100) < LOW_SCORE_THRESHOLD) return 'manual_scanned';
  if (lowCore.length > 1) return 'mixed';
  if ((cats['table_markup'] ?? 100) < LOW_CATEGORY_THRESHOLD && families.has('table')) return 'table';
  if ((cats['alt_text'] ?? 100) < LOW_CATEGORY_THRESHOLD && families.has('figure_alt')) return 'figure_alt';
  if ((cats['heading_structure'] ?? 100) < LOW_CATEGORY_THRESHOLD) return 'heading';
  if ((num(row['afterScore']) ?? 100) < LOW_SCORE_THRESHOLD) return 'mixed';
  return 'none';
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

export function summarizeStage65Run(run: Stage65RunInput, rows: JsonRecord[]): Stage65RunSummary {
  const successRows = rows.filter(row => !row['error']);
  const scores = successRows.map(row => num(row['afterScore'])).filter((value): value is number => value != null);
  const pipelineTimes = successRows.map(row => num(row['totalPipelineMs'])).filter((value): value is number => value != null);
  return {
    label: run.label,
    corpus: run.corpus,
    phase: run.phase,
    count: rows.length,
    success: successRows.length,
    mean: mean(scores),
    median: median(scores),
    grades: gradeDistribution(successRows),
    attempts: rows.reduce((sum, row) => sum + (Array.isArray(row['appliedTools']) ? (row['appliedTools'] as unknown[]).length : 0), 0),
    falsePositiveApplied: rows.reduce((sum, row) => sum + falsePositiveCount(row), 0),
    totalPipelineMs: pipelineTimes.length ? pipelineTimes.reduce((sum, value) => sum + value, 0) : null,
    p95PipelineMs: p95(pipelineTimes),
  };
}

function minDeltaFromStage62(input: {
  stage62?: JsonRecord;
  candidates: Array<JsonRecord | undefined>;
  categoryKey?: string;
}): number | null {
  const baseline = input.categoryKey
    ? categories(input.stage62)[input.categoryKey]
    : num(input.stage62?.['afterScore']);
  if (baseline == null) return null;
  const deltas = input.candidates
    .map(row => input.categoryKey ? categories(row)[input.categoryKey] : num(row?.['afterScore']))
    .filter((value): value is number => value != null)
    .map(value => value - baseline);
  return deltas.length ? Math.min(...deltas) : null;
}

export function buildStage65RowReport(input: {
  id: string;
  corpus: Stage65Corpus;
  runRows: Array<{ run: Stage65RunInput; row?: JsonRecord }>;
}): Stage65RowReport {
  const stage62 = input.runRows.find(item => item.run.phase === 'stage62')?.row;
  const repeatRows = input.runRows.filter(item => item.run.phase === 'stage64' || item.run.phase === 'repeat');
  const presentRepeatRows = repeatRows.filter(item => item.row);
  const representative = [...presentRepeatRows, ...input.runRows].find(item => item.row)?.row;
  const scores = input.runRows.map(({ run, row }) => ({
    label: run.label,
    phase: run.phase,
    score: num(row?.['afterScore']),
    grade: str(row?.['afterGrade']) || null,
    categories: categories(row),
  }));
  const repeatScores = repeatRows.map(item => num(item.row?.['afterScore']));
  const scoreRange = range(repeatScores);
  const categoryKeys = [...new Set(scores.flatMap(score => Object.keys(score.categories)))].sort();
  const categoryRanges = Object.fromEntries(categoryKeys.map(key => [key, range(repeatRows.map(item => categories(item.row)[key]))]));
  const finalRow = presentRepeatRows.at(-1)?.row ?? representative;
  const finalCats = categories(finalRow);
  const family = residualFamily(finalRow, finalCats);
  const finalScore = num(finalRow?.['afterScore']) ?? 100;
  const reasons: string[] = [];
  const scoreDeltaMin = minDeltaFromStage62({ stage62, candidates: repeatRows.map(item => item.row) });
  const altDeltaMin = minDeltaFromStage62({ stage62, candidates: repeatRows.map(item => item.row), categoryKey: 'alt_text' });
  const stage64GainRequired = STAGE64_GAIN_TARGETS.has(input.id);
  const stage64GainRepeated = !stage64GainRequired || ((scoreDeltaMin ?? -Infinity) >= 3 || (altDeltaMin ?? -Infinity) >= 20);
  if (stage64GainRequired) {
    reasons.push(stage64GainRepeated
      ? `stage64_gain_repeated(scoreDeltaMin=${scoreDeltaMin ?? 'n/a'},altDeltaMin=${altDeltaMin ?? 'n/a'})`
      : `stage64_gain_not_repeated(scoreDeltaMin=${scoreDeltaMin ?? 'n/a'},altDeltaMin=${altDeltaMin ?? 'n/a'})`);
  }

  let klass: Stage65RowClass = 'resolved_or_stable_high';
  if (presentRepeatRows.length !== repeatRows.length) {
    klass = 'inconclusive_repeat_missing';
    reasons.push('missing_stage64_or_repeat_row');
  } else if (isManualScanned(finalRow, input.id) && finalScore < LOW_SCORE_THRESHOLD) {
    klass = 'manual_scanned_debt';
    reasons.push('manual_or_scanned_debt_excluded_from_structural_selection');
  } else if (PARKED_ANALYZER_ROWS.has(input.id)) {
    klass = 'parked_analyzer_volatility';
    reasons.push('known_parked_analyzer_volatility_row');
  } else if ((scoreRange.delta ?? 0) > 2) {
    klass = 'parked_analyzer_volatility';
    reasons.push(`repeat_score_swing=${scoreRange.delta}`);
  } else if (finalScore >= LOW_SCORE_THRESHOLD && lowCategoryKeys(finalCats).length === 0) {
    klass = 'resolved_or_stable_high';
    reasons.push('stable_high_or_resolved');
  } else if (family === 'mixed') {
    klass = 'mixed_no_safe_target';
    reasons.push(`mixed_low_categories=${lowCategoryKeys(finalCats).join(',') || 'none'}`);
  } else {
    klass = 'stable_structural_residual';
    reasons.push(`stable_structural_family=${family}`);
  }

  return {
    id: input.id,
    publicationId: input.id.replace(/^v1-/, ''),
    corpus: input.corpus,
    file: str(finalRow?.['localFile']) || str(finalRow?.['file']),
    scores,
    scoreRange,
    categoryRanges,
    stage64Gain: {
      required: stage64GainRequired,
      repeated: stage64GainRepeated,
      scoreDeltaMin,
      altDeltaMin,
    },
    class: klass,
    residualFamily: family,
    reasons,
  };
}

export function buildStage65Report(input: {
  runs: Stage65RunInput[];
  runSummaries: Stage65RunSummary[];
  rows: Stage65RowReport[];
  generatedAt?: string;
}): Stage65Report {
  const classDistribution: Record<string, number> = {};
  for (const row of input.rows) classDistribution[row.class] = (classDistribution[row.class] ?? 0) + 1;
  const newVolatile = input.rows.filter(row => row.class === 'parked_analyzer_volatility' && !PARKED_ANALYZER_ROWS.has(row.id));
  const stableResiduals = input.rows.filter(row => row.class === 'stable_structural_residual');
  const tableRows = stableResiduals.filter(row => row.residualFamily === 'table');
  const mixedRows = input.rows.filter(row => row.class === 'mixed_no_safe_target');
  const manualRows = input.rows.filter(row => row.class === 'manual_scanned_debt');
  const unresolvedStructuralRows = [...stableResiduals, ...mixedRows];
  const gainFailures = input.rows.filter(row => row.stage64Gain.required && !row.stage64Gain.repeated);
  const missing = input.rows.filter(row => row.class === 'inconclusive_repeat_missing');

  let selectedStage66Direction: Stage66Direction = 'No Fixer - Resolve Evidence Gap';
  const decisionReasons: string[] = [];

  if (newVolatile.length > 0) {
    selectedStage66Direction = 'Analyzer Volatility Design';
    decisionReasons.push(`${newVolatile.length} non-parked row(s) now swing by more than 2 points across repeats.`);
  } else if (tableRows.length > 0) {
    selectedStage66Direction = 'Table Tail Follow-up v3';
    decisionReasons.push(`${tableRows.length} stable table residual row(s) remain.`);
  } else if (mixedRows.length >= 2) {
    selectedStage66Direction = 'Mixed Structural Diagnostic';
    decisionReasons.push(`${mixedRows.length} stable mixed residual row(s) remain.`);
  } else if (manualRows.length >= 2 && unresolvedStructuralRows.length === 0) {
    selectedStage66Direction = 'Manual/Scanned Debt Diagnostic';
    decisionReasons.push('Remaining low rows are primarily manual/scanned debt.');
  } else {
    decisionReasons.push('No stable structural family met Stage66 selection thresholds.');
  }
  if (gainFailures.length > 0) decisionReasons.push(`${gainFailures.length} Stage64 gain target(s) did not repeat.`);
  if (missing.length > 0) decisionReasons.push(`${missing.length} row(s) have missing repeat artifacts.`);
  decisionReasons.push(`${input.runSummaries.reduce((sum, run) => sum + run.falsePositiveApplied, 0)} total false-positive applied rows across configured runs.`);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runs: input.runs,
    runSummaries: input.runSummaries,
    rows: input.rows,
    classDistribution,
    selectedStage66Direction,
    decisionReasons,
  };
}

function parseRun(value: string): Stage65RunInput {
  const [label, corpus, phase, ...rest] = value.split(',');
  const runDir = rest.join(',');
  if (!label || (corpus !== 'edge_mix_1' && corpus !== 'edge_mix_2') || !['stage62', 'stage64', 'repeat'].includes(phase ?? '') || !runDir) {
    throw new Error(`Invalid --run value: ${value}`);
  }
  return { label, corpus, phase: phase as Stage65RunPhase, runDir };
}

function parseArgs(argv: string[]): { outDir: string; runs: Stage65RunInput[] } {
  const args = { outDir: DEFAULT_OUT, runs: [] as Stage65RunInput[] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--out') args.outDir = argv[++index] ?? args.outDir;
    else if (arg === '--run') args.runs.push(parseRun(argv[++index] ?? ''));
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (args.runs.length === 0) args.runs = DEFAULT_RUNS;
  return args;
}

function formatScore(value: number | null): string {
  return value == null ? 'n/a' : Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function markdown(report: Stage65Report): string {
  const lines = ['# Stage 65 Repeatability Decision', ''];
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Selected Stage 66 direction: \`${report.selectedStage66Direction}\``, '');
  lines.push('Decision reasons:');
  for (const reason of report.decisionReasons) lines.push(`- ${reason}`);
  lines.push('', '## Run Summaries', '');
  lines.push('| Run | Corpus | Phase | Mean | Median | Grades | Attempts | FP Applied | p95 Pipeline ms |');
  lines.push('| --- | --- | --- | ---: | ---: | --- | ---: | ---: | ---: |');
  for (const run of report.runSummaries) {
    lines.push(`| ${run.label} | ${run.corpus} | ${run.phase} | ${formatScore(run.mean)} | ${formatScore(run.median)} | \`${JSON.stringify(run.grades)}\` | ${run.attempts} | ${run.falsePositiveApplied} | ${formatScore(run.p95PipelineMs)} |`);
  }
  lines.push('', '## Distribution', '');
  for (const [key, count] of Object.entries(report.classDistribution).sort()) lines.push(`- ${key}: ${count}`);
  lines.push('', '## Rows', '');
  lines.push('| ID | Corpus | Range | Class | Family | Stage64 Gain | Scores |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const scores = row.scores.map(score => `${score.label}=${score.score ?? 'missing'}${score.grade ? `/${score.grade}` : ''}`).join(', ');
    const gain = row.stage64Gain.required ? (row.stage64Gain.repeated ? 'repeated' : 'not repeated') : 'n/a';
    lines.push(`| ${row.id} | ${row.corpus} | ${row.scoreRange.min ?? 'n/a'}-${row.scoreRange.max ?? 'n/a'} (${row.scoreRange.delta ?? 'n/a'}) | ${row.class} | ${row.residualFamily} | ${gain} | ${scores} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const rowMaps = new Map<string, Map<string, JsonRecord>>();
  const runSummaries: Stage65RunSummary[] = [];
  for (const run of args.runs) {
    const rows = await loadRows(run.runDir);
    rowMaps.set(run.label, rows);
    runSummaries.push(summarizeStage65Run(run, [...rows.values()]));
  }
  const ids = [...new Set([...rowMaps.values()].flatMap(map => [...map.keys()]))].sort();
  const rows: Stage65RowReport[] = [];
  for (const id of ids) {
    const corpus = args.runs.find(run => rowMaps.get(run.label)?.has(id))?.corpus ?? 'edge_mix_1';
    const corpusRuns = args.runs.filter(run => run.corpus === corpus);
    rows.push(buildStage65RowReport({
      id,
      corpus,
      runRows: corpusRuns.map(run => ({ run, row: rowMaps.get(run.label)?.get(id) })),
    }));
  }
  const report = buildStage65Report({ runs: args.runs, runSummaries, rows });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage65-repeatability-decision.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage65-repeatability-decision.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 65 repeatability decision to ${resolve(args.outDir)}`);
  console.log(`Selected Stage 66 direction: ${report.selectedStage66Direction}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

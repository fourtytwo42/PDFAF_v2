#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export type Stage60RowDecision =
  | 'safe_for_next_fixer'
  | 'parked_analyzer_debt'
  | 'parked_manual_scanned_debt'
  | 'stage59_specific_regression'
  | 'inconclusive_missing_artifact';

export type Stage60OverallDecision =
  | 'park_analyzer_volatility_and_continue'
  | 'block_new_fixers_until_analyzer_design'
  | 'inconclusive_missing_artifact';

export interface Stage60RunInput {
  label: string;
  runDir: string;
  stage: 'stage50' | 'stage55' | 'stage57' | 'stage59' | 'other';
  corpus: 'edge_mix_1' | 'edge_mix_2';
}

export interface Stage60VarianceEvidence {
  source: string;
  classification: string;
  scoreDelta: number | null;
  detail: string;
}

export interface Stage60RowReport {
  id: string;
  publicationId: string;
  corpus: 'edge_mix_1' | 'edge_mix_2';
  file: string;
  scores: Array<{ label: string; score: number | null; grade: string | null; categories: Record<string, number>; figureToolSignature: string }>;
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  categoryRanges: Record<string, { min: number | null; max: number | null; delta: number | null }>;
  varianceEvidence: Stage60VarianceEvidence[];
  stage59FigureToolsInvolved: boolean;
  decision: Stage60RowDecision;
  reason: string;
}

export interface Stage60Report {
  generatedAt: string;
  runs: Stage60RunInput[];
  rows: Stage60RowReport[];
  decision: {
    status: Stage60OverallDecision;
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage60-volatility-decision-2026-04-24-r1';

const DEFAULT_RUNS: Stage60RunInput[] = [
  { label: 'edge1-stage50', corpus: 'edge_mix_1', stage: 'stage50', runDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage50-target-edge-mix-2026-04-24-r3' },
  { label: 'edge1-stage55', corpus: 'edge_mix_1', stage: 'stage55', runDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage55-edge-mix-r7' },
  { label: 'edge1-stage59', corpus: 'edge_mix_1', stage: 'stage59', runDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage59-edge-mix-2026-04-24-r1' },
  { label: 'edge2-stage57', corpus: 'edge_mix_2', stage: 'stage57', runDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage57-baseline-2026-04-24-r1' },
  { label: 'edge2-stage59-r1', corpus: 'edge_mix_2', stage: 'stage59', runDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage59-edge-mix2-2026-04-24-r1' },
  { label: 'edge2-stage59-r2', corpus: 'edge_mix_2', stage: 'stage59', runDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage59-edge-mix2-2026-04-24-r2' },
];

const DEFAULT_ROW_IDS = new Set(['4171', '4722', '4487', '4758', '4700', '4699', '4683', '4567', '4139']);

const DEFAULT_VARIANCE_REPORTS = [
  'Output/from_sibling_pdfaf_v1_edge_mix/stage56b-analysis-repeat-2026-04-24-r1/stage56b-analysis-repeat.json',
  'Output/from_sibling_pdfaf_v1_edge_mix/stage58-structural-boundary-diagnostic-2026-04-24-r1/stage58-structural-boundary-diagnostic.json',
  'Output/from_sibling_pdfaf_v1_edge_mix_2/stage57-analysis-repeat-2026-04-24-r1/stage56b-analysis-repeat.json',
  'Output/from_sibling_pdfaf_v1_edge_mix_2/stage58-structural-boundary-diagnostic-2026-04-24-r1/stage58-structural-boundary-diagnostic.json',
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage60-volatility-decision.ts [options]',
    `  --out <dir>              Default: ${DEFAULT_OUT}`,
    '  --run <label=dir>        Additional benchmark run dir; label should include edge1/edge2 and stage59 when applicable',
    '  --variance <path>        Additional Stage56B/58 variance report JSON',
    '  --row <id>               Publication id to include; repeatable',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function categoryScores(row: JsonRecord): Record<string, number> {
  const categories = Array.isArray(row['afterCategories']) ? row['afterCategories'] as JsonRecord[] : [];
  const out: Record<string, number> = {};
  for (const category of categories) {
    const key = str(category['key']);
    const score = num(category['score']);
    if (key && score != null) out[key] = score;
  }
  return out;
}

function range(values: Array<number | null | undefined>): { min: number | null; max: number | null; delta: number | null } {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (nums.length === 0) return { min: null, max: null, delta: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, delta: max - min };
}

function figureToolSignature(row: JsonRecord | undefined): string {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  return tools
    .filter(tool => ['set_figure_alt_text', 'retag_as_figure', 'canonicalize_figure_alt_ownership', 'normalize_nested_figure_containers'].includes(str(tool['toolName'])))
    .map(tool => `${tool['toolName']}:${tool['outcome']}:${tool['scoreBefore']}->${tool['scoreAfter']}`)
    .join('|');
}

function hasStage59FigureAltApply(row: JsonRecord | undefined): boolean {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  return tools.some(tool => str(tool['toolName']) === 'set_figure_alt_text' && str(tool['outcome']) === 'applied');
}

function isManualScanned(row: JsonRecord | undefined): boolean {
  const localFile = str(row?.['localFile']);
  const afterClass = str(row?.['afterPdfClass']);
  const beforeClass = str(row?.['beforePdfClass']);
  return localFile.includes('manual_scanned') || afterClass.includes('scanned') || beforeClass.includes('scanned');
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function loadRunRows(run: Stage60RunInput): Promise<Map<string, JsonRecord>> {
  const parsed = await readJson(join(run.runDir, 'remediate.results.json'));
  const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
  const out = new Map<string, JsonRecord>();
  for (const row of rows) {
    const publicationId = str(row['publicationId']);
    const id = str(row['id']);
    if (publicationId) out.set(publicationId, row);
    if (id) out.set(id.replace(/^v1-/, ''), row);
  }
  return out;
}

async function loadVarianceEvidence(paths: string[]): Promise<Map<string, Stage60VarianceEvidence[]>> {
  const out = new Map<string, Stage60VarianceEvidence[]>();
  for (const path of paths) {
    const parsed = await readJson(path);
    const rows = parsed && typeof parsed === 'object' && Array.isArray((parsed as JsonRecord)['rows'])
      ? (parsed as JsonRecord)['rows'] as JsonRecord[]
      : [];
    for (const row of rows) {
      const publicationId = str(row['publicationId']);
      const rowId = str(row['rowId']).replace(/^v1-/, '');
      const key = publicationId || rowId;
      if (!key) continue;
      const classification = str(row['classification']) ||
        str((row['decision'] as JsonRecord | undefined)?.['status']) ||
        'unknown';
      const scoreRange = row['scoreRange'] as JsonRecord | undefined;
      const evidence: Stage60VarianceEvidence = {
        source: path,
        classification,
        scoreDelta: num(scoreRange?.['delta']),
        detail: str(row['reason']) || (
          Array.isArray((row['decision'] as JsonRecord | undefined)?.['reasons'])
            ? ((row['decision'] as JsonRecord)['reasons'] as unknown[]).map(String).join('; ')
            : ''
        ),
      };
      out.set(key, [...(out.get(key) ?? []), evidence]);
    }
  }
  return out;
}

function hasAnalyzerVariance(evidence: Stage60VarianceEvidence[]): boolean {
  return evidence.some(item =>
    item.classification === 'python_structure_variance' ||
    item.classification === 'non_canonicalizable_variance' ||
    item.classification === 'duplicate_drop_variation' ||
    item.classification === 'page_ref_text_mismatch' ||
    ((item.scoreDelta ?? 0) > 2 && item.classification !== 'stable_analysis' && item.classification !== 'stable')
  );
}

export function buildStage60RowReport(input: {
  id: string;
  corpus: Stage60RunInput['corpus'];
  runRows: Array<{ run: Stage60RunInput; row?: JsonRecord }>;
  varianceEvidence?: Stage60VarianceEvidence[];
}): Stage60RowReport {
  const present = input.runRows.filter(item => item.row);
  const representative = present[0]?.row;
  const scores = input.runRows.map(({ run, row }) => ({
    label: run.label,
    score: num(row?.['afterScore']),
    grade: str(row?.['afterGrade']) || null,
    categories: row ? categoryScores(row) : {},
    figureToolSignature: figureToolSignature(row),
  }));
  const scoreRange = range(scores.map(score => score.score));
  const categoryKeys = [...new Set(scores.flatMap(score => Object.keys(score.categories)))].sort();
  const categoryRanges = Object.fromEntries(categoryKeys.map(key => [key, range(scores.map(score => score.categories[key]))]));
  const stage59Rows = input.runRows.filter(item => item.run.stage === 'stage59');
  const nonStage59Rows = input.runRows.filter(item => item.run.stage !== 'stage59');
  const worst = Math.min(...stage59Rows.map(item => num(item.row?.['afterScore']) ?? Number.POSITIVE_INFINITY));
  const bestStage59 = Math.max(...stage59Rows.map(item => num(item.row?.['afterScore']) ?? Number.NEGATIVE_INFINITY));
  const bestPrior = Math.max(...nonStage59Rows.map(item => num(item.row?.['afterScore']) ?? Number.NEGATIVE_INFINITY));
  const stage59NonRegressing = Number.isFinite(worst) && Number.isFinite(bestPrior) && worst >= bestPrior - 2;
  const stage59PositiveGain = stage59NonRegressing && Number.isFinite(bestStage59) && Number.isFinite(bestPrior) && bestStage59 > bestPrior + 2;
  const stage59FigureToolsInvolved =
    stage59Rows.some(item => hasStage59FigureAltApply(item.row)) &&
    Number.isFinite(worst) &&
    Number.isFinite(bestPrior) &&
    worst < bestPrior - 2;
  const evidence = input.varianceEvidence ?? [];

  let decision: Stage60RowDecision = 'safe_for_next_fixer';
  let reason = 'score range is stable or Stage59 changes are non-regressing';
  if (present.length === 0) {
    decision = 'inconclusive_missing_artifact';
    reason = 'row missing from all configured benchmark artifacts';
  } else if (isManualScanned(representative)) {
    decision = 'parked_manual_scanned_debt';
    reason = 'manual/scanned-looking row is outside deterministic structural fixer scope';
  } else if (stage59FigureToolsInvolved) {
    decision = 'stage59_specific_regression';
    reason = 'worst Stage59 score is more than 2 below previous runs and Stage59 figure-alt tools applied';
  } else if ((scoreRange.delta ?? 0) > 2 && stage59PositiveGain) {
    decision = 'safe_for_next_fixer';
    reason = 'score range reflects a non-regressing Stage59 gain rather than volatility';
  } else if ((scoreRange.delta ?? 0) > 2 && hasAnalyzerVariance(evidence)) {
    decision = 'parked_analyzer_debt';
    reason = 'harmful score swing matches documented Python structural/analyzer variance';
  } else if ((scoreRange.delta ?? 0) > 2 && evidence.length === 0) {
    decision = 'inconclusive_missing_artifact';
    reason = 'harmful score swing has no matching analyzer variance artifact';
  }

  return {
    id: `v1-${input.id}`,
    publicationId: input.id,
    corpus: input.corpus,
    file: str(representative?.['localFile']) || str(representative?.['file']),
    scores,
    scoreRange,
    categoryRanges,
    varianceEvidence: evidence,
    stage59FigureToolsInvolved,
    decision,
    reason,
  };
}

export function buildStage60Report(input: {
  runs: Stage60RunInput[];
  rows: Stage60RowReport[];
  generatedAt?: string;
}): Stage60Report {
  const stage59Regressions = input.rows.filter(row => row.decision === 'stage59_specific_regression');
  const inconclusive = input.rows.filter(row => row.decision === 'inconclusive_missing_artifact');
  const analyzerDebt = input.rows.filter(row => row.decision === 'parked_analyzer_debt');
  const status: Stage60OverallDecision = stage59Regressions.length > 0
    ? 'block_new_fixers_until_analyzer_design'
    : inconclusive.length > 1
      ? 'inconclusive_missing_artifact'
      : 'park_analyzer_volatility_and_continue';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runs: input.runs,
    rows: input.rows,
    decision: {
      status,
      recommendedNext: status === 'park_analyzer_volatility_and_continue'
        ? 'Proceed to Stage 61 using stable residual rows only; keep Python structural volatility parked as analyzer debt.'
        : status === 'block_new_fixers_until_analyzer_design'
          ? 'Do not add another fixer; first isolate the reported Stage59-specific regression/analyzer path.'
          : 'Fill missing artifacts or rerun the affected edge-mix benchmark before selecting Stage 61.',
      reasons: [
        `${stage59Regressions.length} Stage59-specific regression row(s)`,
        `${analyzerDebt.length} parked analyzer-debt row(s)`,
        `${inconclusive.length} inconclusive row(s)`,
      ],
    },
  };
}

function markdown(report: Stage60Report): string {
  const lines = ['# Stage 60 Volatility Decision', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push('| row | corpus | score range | decision | Stage59 tools involved | variance evidence |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const evidence = row.varianceEvidence.map(item => `${item.classification}${item.scoreDelta != null ? `:${item.scoreDelta}` : ''}`).join(', ') || 'none';
    lines.push(`| ${row.id} | ${row.corpus} | ${row.scoreRange.min ?? 'n/a'}-${row.scoreRange.max ?? 'n/a'} (${row.scoreRange.delta ?? 'n/a'}) | ${row.decision} | ${row.stage59FigureToolsInvolved ? 'yes' : 'no'} | ${evidence} |`);
  }
  for (const row of report.rows) {
    lines.push('', `## ${row.id}`, `- File: \`${row.file || 'n/a'}\``, `- Decision: \`${row.decision}\``, `- Reason: ${row.reason}`);
    lines.push(`- Scores: ${row.scores.map(score => `${score.label}=${score.score ?? 'n/a'}${score.grade ? `/${score.grade}` : ''}`).join(', ')}`);
    const lowCategories = Object.entries(row.categoryRanges)
      .filter(([, value]) => (value.min ?? 100) < 70 || (value.delta ?? 0) > 2)
      .map(([key, value]) => `${key}:${value.min ?? 'n/a'}-${value.max ?? 'n/a'}`);
    lines.push(`- Category ranges: ${lowCategories.join(', ') || 'stable/non-blocking'}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseRun(value: string): Stage60RunInput {
  const [label, ...rest] = value.split('=');
  const runDir = rest.join('=');
  if (!label || !runDir) throw new Error(`Expected --run label=dir, got ${value}`);
  return {
    label,
    runDir,
    corpus: label.includes('edge1') ? 'edge_mix_1' : 'edge_mix_2',
    stage: label.includes('stage59') ? 'stage59' : label.includes('stage57') ? 'stage57' : label.includes('stage55') ? 'stage55' : label.includes('stage50') ? 'stage50' : 'other',
  };
}

function parseArgs(argv: string[]): { outDir: string; runs: Stage60RunInput[]; varianceReports: string[]; rowIds: Set<string> } {
  let outDir = DEFAULT_OUT;
  const runs = [...DEFAULT_RUNS];
  const varianceReports = [...DEFAULT_VARIANCE_REPORTS];
  const rowIds = new Set(DEFAULT_ROW_IDS);
  let explicitRows = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--out') outDir = argv[++index] ?? outDir;
    else if (arg === '--run') runs.push(parseRun(argv[++index] ?? ''));
    else if (arg === '--variance') varianceReports.push(argv[++index] ?? '');
    else if (arg === '--row') {
      if (!explicitRows) {
        rowIds.clear();
        explicitRows = true;
      }
      rowIds.add((argv[++index] ?? '').replace(/^v1-/, ''));
    } else if (arg === '--help' || arg === '-h') {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return { outDir, runs, varianceReports: varianceReports.filter(Boolean), rowIds };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const rowMaps = new Map<string, Map<string, JsonRecord>>();
  for (const run of args.runs) rowMaps.set(run.label, await loadRunRows(run));
  const variance = await loadVarianceEvidence(args.varianceReports);
  const rows: Stage60RowReport[] = [];
  for (const id of [...args.rowIds].sort()) {
    const runRows = args.runs
      .filter(run => (id === '4683' || id === '4567' || id === '4139') ? run.corpus === 'edge_mix_1' : run.corpus === 'edge_mix_2')
      .map(run => ({ run, row: rowMaps.get(run.label)?.get(id) }));
    const corpus = (id === '4683' || id === '4567' || id === '4139') ? 'edge_mix_1' : 'edge_mix_2';
    rows.push(buildStage60RowReport({ id, corpus, runRows, varianceEvidence: variance.get(id) ?? [] }));
  }
  const report = buildStage60Report({ runs: args.runs, rows });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage60-volatility-decision.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage60-volatility-decision.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 60 volatility decision to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
  console.log(report.decision.recommendedNext);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

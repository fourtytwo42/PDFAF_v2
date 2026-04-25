#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export type Stage68TableResidualClass =
  | 'bounded_multi_table_candidate'
  | 'post_normalization_table_residual'
  | 'no_safe_table_path'
  | 'resolved_or_control'
  | 'excluded_analyzer_volatility'
  | 'excluded_manual_scanned'
  | 'missing_row_or_artifact';

export interface Stage68RunInput {
  label: string;
  corpus: string;
  phase: string;
  runDir: string;
}

export interface Stage68TableToolStep {
  runLabel: string;
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  tableMarkupBefore: number | null;
  tableMarkupAfter: number | null;
  irregularRowsBefore: number | null;
  irregularRowsAfter: number | null;
  stronglyIrregularBefore: number | null;
  stronglyIrregularAfter: number | null;
  headerCellCountBefore: number | null;
  headerCellCountAfter: number | null;
  tableTreeValidAfter: boolean | null;
  tableValidityImproved: boolean;
  targetRef: string | null;
  maxTablesPerRun: number | null;
  note: string | null;
}

export interface Stage68RowReport {
  id: string;
  role: 'target' | 'control' | 'excluded';
  class: Stage68TableResidualClass;
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  tableMarkupRange: { min: number | null; max: number | null; delta: number | null };
  finalStronglyIrregularRange: { min: number | null; max: number | null; delta: number | null };
  finalIrregularRange: { min: number | null; max: number | null; delta: number | null };
  tableToolSteps: Stage68TableToolStep[];
  normalizeAppliedCount: number;
  normalizeImprovementCount: number;
  terminalNoEffectCount: number;
  plausibleInvariantPath: boolean;
  reasons: string[];
}

export interface Stage68Report {
  generatedAt: string;
  inputs: {
    stage67ReportPath: string;
    runs: Stage68RunInput[];
  };
  rows: Stage68RowReport[];
  classificationDistribution: Record<string, number>;
  decision: {
    status: 'implement_bounded_multi_table_normalization' | 'diagnostic_only_no_safe_table_fix' | 'diagnostic_only_inconclusive';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_STAGE67_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage67-stable-residual-selection-2026-04-24-r1/stage67-stable-residual-selection.json';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage68-table-residual-diagnostic-2026-04-25-r1';
const FOCUS_IDS = new Set(['v1-4722']);
const CONTROL_IDS = new Set(['v1-4178', 'v1-4758', 'v1-4700', 'v1-4699', 'v1-4627', 'v1-4751']);
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage68-table-residual-diagnostic.ts [options]',
    `  --out <dir>       Default: ${DEFAULT_OUT}`,
    `  --stage67 <path>  Default: ${DEFAULT_STAGE67_REPORT}`,
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function range(values: Array<number | null | undefined>): { min: number | null; max: number | null; delta: number | null } {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) return { min: null, max: null, delta: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, delta: max - min };
}

function parseDetails(details: unknown): JsonRecord {
  if (details && typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return asRecord(parsed);
  } catch {
    return { raw: details };
  }
}

function categoryScore(row: JsonRecord | undefined, key: string): number | null {
  const categories = Array.isArray(row?.['afterCategories']) ? row!['afterCategories'] as JsonRecord[] : [];
  return categories.find(category => str(category['key']) === key)?.['score'] as number ?? null;
}

function replayCategory(details: JsonRecord, key: 'Before' | 'After', category: string): number | null {
  const replayState = asRecord(asRecord(details['debug'])['replayState']);
  return num(asRecord(replayState[`categoryScores${key}`])[category]);
}

function tableSignals(row: JsonRecord | undefined): JsonRecord {
  return asRecord(asRecord(row?.['afterDetectionProfile'])['tableSignals']);
}

function toolName(tool: JsonRecord): string {
  return str(tool['toolName']) || str(tool['name']) || 'unknown';
}

function canonicalId(row: JsonRecord): string {
  const id = str(row['id']);
  if (id) return id.startsWith('v1-') ? id : `v1-${id}`;
  const publicationId = str(row['publicationId']);
  return publicationId ? `v1-${publicationId.replace(/^v1-/, '')}` : '';
}

function tableSteps(runLabel: string, row: JsonRecord | undefined): Stage68TableToolStep[] {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  return tools.filter(tool => TABLE_TOOLS.has(toolName(tool))).map(tool => {
    const details = parseDetails(tool['details']);
    const invariants = asRecord(details['invariants']);
    const benefits = asRecord(details['structuralBenefits']);
    const debug = asRecord(details['debug']);
    return {
      runLabel,
      toolName: toolName(tool),
      outcome: str(tool['outcome']) || 'unknown',
      stage: num(tool['stage']),
      round: num(tool['round']),
      scoreBefore: num(tool['scoreBefore']),
      scoreAfter: num(tool['scoreAfter']),
      tableMarkupBefore: replayCategory(details, 'Before', 'table_markup'),
      tableMarkupAfter: replayCategory(details, 'After', 'table_markup'),
      irregularRowsBefore: num(invariants['irregularRowsBefore']),
      irregularRowsAfter: num(invariants['irregularRowsAfter']),
      stronglyIrregularBefore: num(invariants['stronglyIrregularTableCountBefore']),
      stronglyIrregularAfter: num(invariants['stronglyIrregularTableCountAfter']),
      headerCellCountBefore: num(invariants['headerCellCountBefore']),
      headerCellCountAfter: num(invariants['headerCellCountAfter']),
      tableTreeValidAfter: bool(invariants['tableTreeValidAfter']),
      tableValidityImproved: benefits['tableValidityImproved'] === true,
      targetRef: typeof invariants['targetRef'] === 'string' ? invariants['targetRef'] : null,
      maxTablesPerRun: num(debug['maxTablesPerRun']),
      note: str(details['note']) || str(details['raw']) || null,
    };
  });
}

function classifyRow(input: {
  id: string;
  stage67Class: string;
  stage67Decision: string | null;
  rowRuns: Array<{ run: Stage68RunInput; row?: JsonRecord }>;
}): Stage68RowReport {
  const scores = input.rowRuns.map(item => num(item.row?.['afterScore']));
  const tableScores = input.rowRuns.map(item => categoryScore(item.row, 'table_markup'));
  const strongly = input.rowRuns.map(item => num(tableSignals(item.row)['stronglyIrregularTableCount']));
  const irregular = input.rowRuns.map(item => num(tableSignals(item.row)['irregularTableCount']));
  const steps = input.rowRuns.flatMap(item => tableSteps(item.run.label, item.row));
  const normalizeSteps = steps.filter(step => step.toolName === 'normalize_table_structure');
  const normalizeApplied = normalizeSteps.filter(step => step.outcome === 'applied');
  const normalizeImproved = normalizeApplied.filter(step =>
    step.tableValidityImproved &&
    (
      (step.stronglyIrregularAfter ?? Infinity) < (step.stronglyIrregularBefore ?? -Infinity) ||
      (step.irregularRowsAfter ?? Infinity) < (step.irregularRowsBefore ?? -Infinity) ||
      (step.headerCellCountAfter ?? -Infinity) > (step.headerCellCountBefore ?? Infinity)
    ),
  );
  const terminalNoEffectCount = steps.filter(step => step.outcome === 'no_effect' || step.outcome === 'rejected' || step.outcome === 'failed').length;
  const scoreR = range(scores);
  const tableR = range(tableScores);
  const strongR = range(strongly);
  const irregularR = range(irregular);
  const missing = input.rowRuns.some(item => !item.row);
  const role = FOCUS_IDS.has(input.id) ? 'target' : CONTROL_IDS.has(input.id) ? 'control' : 'excluded';
  const reasons: string[] = [];
  if (missing) {
    reasons.push('missing_row_from_one_or_more_runs');
    return {
      id: input.id,
      role,
      class: 'missing_row_or_artifact',
      scoreRange: scoreR,
      tableMarkupRange: tableR,
      finalStronglyIrregularRange: strongR,
      finalIrregularRange: irregularR,
      tableToolSteps: steps,
      normalizeAppliedCount: normalizeApplied.length,
      normalizeImprovementCount: normalizeImproved.length,
      terminalNoEffectCount,
      plausibleInvariantPath: false,
      reasons,
    };
  }
  if (input.stage67Class === 'excluded_analyzer_volatility' || input.stage67Decision === 'non_canonicalizable_analyzer_debt') {
    reasons.push('excluded_analyzer_volatility');
    return {
      id: input.id,
      role: 'excluded',
      class: 'excluded_analyzer_volatility',
      scoreRange: scoreR,
      tableMarkupRange: tableR,
      finalStronglyIrregularRange: strongR,
      finalIrregularRange: irregularR,
      tableToolSteps: steps,
      normalizeAppliedCount: normalizeApplied.length,
      normalizeImprovementCount: normalizeImproved.length,
      terminalNoEffectCount,
      plausibleInvariantPath: false,
      reasons,
    };
  }
  if (input.stage67Class === 'excluded_manual_scanned' || input.stage67Decision === 'policy_debt') {
    reasons.push('excluded_manual_scanned');
    return {
      id: input.id,
      role: 'excluded',
      class: 'excluded_manual_scanned',
      scoreRange: scoreR,
      tableMarkupRange: tableR,
      finalStronglyIrregularRange: strongR,
      finalIrregularRange: irregularR,
      tableToolSteps: steps,
      normalizeAppliedCount: normalizeApplied.length,
      normalizeImprovementCount: normalizeImproved.length,
      terminalNoEffectCount,
      plausibleInvariantPath: false,
      reasons,
    };
  }
  if ((tableR.max ?? 100) >= 70) {
    reasons.push('table_markup_not_repeatedly_failing');
    return {
      id: input.id,
      role,
      class: 'resolved_or_control',
      scoreRange: scoreR,
      tableMarkupRange: tableR,
      finalStronglyIrregularRange: strongR,
      finalIrregularRange: irregularR,
      tableToolSteps: steps,
      normalizeAppliedCount: normalizeApplied.length,
      normalizeImprovementCount: normalizeImproved.length,
      terminalNoEffectCount,
      plausibleInvariantPath: false,
      reasons,
    };
  }
  reasons.push(`table_markup_range=${tableR.min ?? 'n/a'}-${tableR.max ?? 'n/a'}`);
  reasons.push(`final_strongly_irregular_range=${strongR.min ?? 'n/a'}-${strongR.max ?? 'n/a'}`);
  reasons.push(`normalize_improvements=${normalizeImproved.length}`);
  if (
    input.id === 'v1-4722' &&
    normalizeImproved.length >= 2 &&
    (strongR.min ?? 0) > 0 &&
    normalizeApplied.every(step => (step.maxTablesPerRun ?? 0) <= 2)
  ) {
    reasons.push('repeated_bounded_normalize_success_left_remaining_strongly_irregular_tables');
    return {
      id: input.id,
      role,
      class: 'bounded_multi_table_candidate',
      scoreRange: scoreR,
      tableMarkupRange: tableR,
      finalStronglyIrregularRange: strongR,
      finalIrregularRange: irregularR,
      tableToolSteps: steps,
      normalizeAppliedCount: normalizeApplied.length,
      normalizeImprovementCount: normalizeImproved.length,
      terminalNoEffectCount,
      plausibleInvariantPath: true,
      reasons,
    };
  }
  if (normalizeImproved.length > 0 && (strongR.min ?? 0) > 0) {
    reasons.push('post_normalization_table_debt_remains');
    return {
      id: input.id,
      role,
      class: 'post_normalization_table_residual',
      scoreRange: scoreR,
      tableMarkupRange: tableR,
      finalStronglyIrregularRange: strongR,
      finalIrregularRange: irregularR,
      tableToolSteps: steps,
      normalizeAppliedCount: normalizeApplied.length,
      normalizeImprovementCount: normalizeImproved.length,
      terminalNoEffectCount,
      plausibleInvariantPath: false,
      reasons,
    };
  }
  reasons.push('no_new_table_invariant_path_identified');
  return {
    id: input.id,
    role,
    class: 'no_safe_table_path',
    scoreRange: scoreR,
    tableMarkupRange: tableR,
    finalStronglyIrregularRange: strongR,
    finalIrregularRange: irregularR,
    tableToolSteps: steps,
    normalizeAppliedCount: normalizeApplied.length,
    normalizeImprovementCount: normalizeImproved.length,
    terminalNoEffectCount,
    plausibleInvariantPath: false,
    reasons,
  };
}

export function buildStage68Report(input: {
  stage67: JsonRecord;
  runRowsByLabel: Map<string, Map<string, JsonRecord>>;
  generatedAt?: string;
}): Stage68Report {
  const runs = (Array.isArray(asRecord(input.stage67['inputs'])['runs']) ? asRecord(input.stage67['inputs'])['runs'] as JsonRecord[] : [])
    .map(run => ({
      label: str(run['label']),
      corpus: str(run['corpus']),
      phase: str(run['phase']),
      runDir: str(run['runDir']),
    }))
    .filter(run => run.label && run.runDir);
  const stage67Rows = Array.isArray(input.stage67['rows']) ? input.stage67['rows'] as JsonRecord[] : [];
  const stage67ById = new Map(stage67Rows.map(row => [str(row['id']), row]));
  const ids = [...new Set([...FOCUS_IDS, ...CONTROL_IDS, ...stage67Rows.map(row => str(row['id'])).filter(Boolean)])].sort();
  const rows = ids.map(id => {
    const stage67Row = stage67ById.get(id);
    const rowCorpus = str(stage67Row?.['corpus']);
    return classifyRow({
      id,
      stage67Class: str(stage67Row?.['class']),
      stage67Decision: str(stage67Row?.['stage66Decision']) || null,
      rowRuns: runs
        .filter(run => (rowCorpus ? run.corpus === rowCorpus : true) && (FOCUS_IDS.has(id) || CONTROL_IDS.has(id) ? true : stage67ById.has(id)))
        .map(run => ({ run, row: input.runRowsByLabel.get(run.label)?.get(id) })),
    });
  });
  const classificationDistribution: Record<string, number> = {};
  for (const row of rows) classificationDistribution[row.class] = (classificationDistribution[row.class] ?? 0) + 1;
  const focus = rows.find(row => row.id === 'v1-4722');
  const reasons: string[] = [];
  let status: Stage68Report['decision']['status'] = 'diagnostic_only_inconclusive';
  let recommendedNext = 'Resolve missing Stage 68 diagnostic evidence before changing table behavior.';
  if (focus?.class === 'bounded_multi_table_candidate') {
    status = 'implement_bounded_multi_table_normalization';
    recommendedNext = 'Increase bounded strongly-irregular table normalization target count; do not add retries or new table routes.';
    reasons.push('v1-4722 repeatedly improved under normalize_table_structure but stopped with remaining strongly-irregular tables.');
  } else if (focus) {
    status = 'diagnostic_only_no_safe_table_fix';
    recommendedNext = 'Park table work and move to Legacy Reconciliation / End-Gate Prep.';
    reasons.push(`v1-4722 class=${focus.class}`);
  } else {
    reasons.push('v1-4722 missing from Stage68 rows.');
  }
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      stage67ReportPath: DEFAULT_STAGE67_REPORT,
      runs,
    },
    rows,
    classificationDistribution,
    decision: { status, recommendedNext, reasons },
  };
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function loadRunRows(runDir: string): Promise<Map<string, JsonRecord>> {
  const parsed = await readJson(join(runDir, 'remediate.results.json'));
  const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
  const out = new Map<string, JsonRecord>();
  for (const row of rows) {
    const id = canonicalId(row);
    if (id) out.set(id, row);
  }
  return out;
}

async function loadRunRowsByLabel(runs: Stage68RunInput[]): Promise<Map<string, Map<string, JsonRecord>>> {
  const out = new Map<string, Map<string, JsonRecord>>();
  for (const run of runs) out.set(run.label, await loadRunRows(run.runDir));
  return out;
}

function parseArgs(argv: string[]): { outDir: string; stage67ReportPath: string } {
  let outDir = DEFAULT_OUT;
  let stage67ReportPath = DEFAULT_STAGE67_REPORT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--') continue;
    if (arg === '--out') outDir = argv[++index] ?? outDir;
    else if (arg === '--stage67') stage67ReportPath = argv[++index] ?? stage67ReportPath;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return { outDir, stage67ReportPath };
}

function formatRange(value: { min: number | null; max: number | null; delta: number | null }): string {
  return `${value.min ?? 'n/a'}-${value.max ?? 'n/a'} (${value.delta ?? 'n/a'})`;
}

function markdown(report: Stage68Report): string {
  const lines = ['# Stage 68 Table Residual Diagnostic', ''];
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Decision: \`${report.decision.status}\``);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`, '');
  lines.push('Reasons:');
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Distribution', '');
  for (const [key, count] of Object.entries(report.classificationDistribution).sort()) lines.push(`- ${key}: ${count}`);
  lines.push('', '## Rows', '');
  lines.push('| Row | Role | Score Range | Table Range | Strong Range | Class | Normalize | Terminal |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |');
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.role} | ${formatRange(row.scoreRange)} | ${formatRange(row.tableMarkupRange)} | ${formatRange(row.finalStronglyIrregularRange)} | ${row.class} | ${row.normalizeImprovementCount}/${row.normalizeAppliedCount} | ${row.terminalNoEffectCount} |`);
  }
  for (const row of report.rows.filter(row => row.role !== 'excluded' || row.class !== 'resolved_or_control')) {
    lines.push('', `## ${row.id}`, '');
    lines.push(`Reasons: \`${row.reasons.join('; ')}\``);
    lines.push(`Plausible invariant path: \`${row.plausibleInvariantPath}\``);
    lines.push(`Table tool steps: \`${JSON.stringify(row.tableToolSteps)}\``);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const stage67 = await readJson(args.stage67ReportPath);
  if (!stage67 || typeof stage67 !== 'object' || Array.isArray(stage67)) throw new Error(`Missing or invalid Stage67 report: ${args.stage67ReportPath}`);
  const runs = (Array.isArray(asRecord((stage67 as JsonRecord)['inputs'])['runs']) ? asRecord((stage67 as JsonRecord)['inputs'])['runs'] as JsonRecord[] : [])
    .map(run => ({
      label: str(run['label']),
      corpus: str(run['corpus']),
      phase: str(run['phase']),
      runDir: str(run['runDir']),
    }))
    .filter(run => run.label && run.runDir);
  const runRowsByLabel = await loadRunRowsByLabel(runs);
  const report = buildStage68Report({ stage67: stage67 as JsonRecord, runRowsByLabel });
  report.inputs.stage67ReportPath = args.stage67ReportPath;
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage68-table-residual-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage68-table-residual-diagnostic.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 68 table residual diagnostic to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

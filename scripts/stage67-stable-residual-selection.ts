#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export type Stage67RowClass =
  | 'stable_table_residual'
  | 'stable_figure_alt_residual'
  | 'stable_heading_residual'
  | 'stable_mixed_residual'
  | 'resolved_or_high'
  | 'excluded_analyzer_volatility'
  | 'excluded_manual_scanned'
  | 'inconclusive_missing_artifact';

export type Stage68Direction =
  | 'Table Tail Follow-up v3'
  | 'Figure/Alt Polish'
  | 'Manual/Scanned Policy Diagnostic'
  | 'Legacy Reconciliation'
  | 'No Fixer - Resolve Evidence Gap';

export interface Stage67RunInput {
  label: string;
  corpus: string;
  phase: string;
  runDir: string;
}

export interface Stage67ToolEvidence {
  toolName: string;
  outcomes: Record<string, number>;
  terminalOutcomes: Record<string, number>;
}

export interface Stage67RowReport {
  id: string;
  corpus: string;
  file: string;
  stage65Class: string;
  stage65Family: string;
  stage66Decision: string | null;
  class: Stage67RowClass;
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  categoryRanges: Record<string, { min: number | null; max: number | null; delta: number | null }>;
  repeatedLowCategories: string[];
  toolEvidence: Stage67ToolEvidence[];
  plausibleNextFixer: boolean;
  nextFixerReason: string;
  stage64GainPreserved: boolean | null;
  reasons: string[];
}

export interface Stage67Report {
  generatedAt: string;
  inputs: {
    stage65ReportPath: string;
    stage66ReportPath: string;
    runs: Stage67RunInput[];
  };
  rows: Stage67RowReport[];
  classDistribution: Record<string, number>;
  preservedStage64Gains: string[];
  selectedStage68Direction: Stage68Direction;
  decisionReasons: string[];
}

const DEFAULT_STAGE65_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage65-repeatability-decision-2026-04-24-r1/stage65-repeatability-decision.json';
const DEFAULT_STAGE66_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage66-analyzer-volatility-design-2026-04-24-r1/stage66-analyzer-volatility-design.json';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage67-stable-residual-selection-2026-04-24-r1';
const LOW_CATEGORY_THRESHOLD = 70;
const A_SCORE_THRESHOLD = 90;
const BELOW_C_SCORE_THRESHOLD = 70;
const STAGE64_GAIN_TARGETS = new Set(['v1-3921', 'v1-4145', 'v1-4758']);
const STRUCTURAL_TOOL_PATTERNS: Array<[string, RegExp]> = [
  ['table', /table/i],
  ['figure_alt', /figure|alt/i],
  ['heading', /heading|synthesize|structure_conformance/i],
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage67-stable-residual-selection.ts [options]',
    `  --out <dir>       Default: ${DEFAULT_OUT}`,
    `  --stage65 <path>  Default: ${DEFAULT_STAGE65_REPORT}`,
    `  --stage66 <path>  Default: ${DEFAULT_STAGE66_REPORT}`,
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function scoreRange(value: unknown): { min: number | null; max: number | null; delta: number | null } {
  const object = asRecord(value);
  return { min: num(object['min']), max: num(object['max']), delta: num(object['delta']) };
}

function canonicalId(row: JsonRecord): string {
  const id = str(row['id']);
  if (id) return id.startsWith('v1-') ? id : `v1-${id}`;
  const publicationId = str(row['publicationId']);
  return publicationId ? `v1-${publicationId.replace(/^v1-/, '')}` : '';
}

function rowCategories(row: JsonRecord | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const list = Array.isArray(row?.['afterCategories']) ? row!['afterCategories'] as JsonRecord[] : [];
  for (const item of list) {
    const key = str(item['key']);
    const score = num(item['score']);
    if (key && score != null) out[key] = score;
  }
  return out;
}

function rowMapScoreCategories(score: JsonRecord): Record<string, number> {
  const categories = asRecord(score['categories']);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(categories)) {
    const scoreValue = num(value);
    if (scoreValue != null) out[key] = scoreValue;
  }
  return out;
}

function repeatedLowCategories(categoryRanges: Record<string, unknown>): string[] {
  return Object.entries(categoryRanges)
    .filter(([, value]) => {
      const range = scoreRange(value);
      return range.max != null && range.max < LOW_CATEGORY_THRESHOLD;
    })
    .map(([key]) => key)
    .sort();
}

function toolFamily(toolName: string): string | null {
  for (const [family, pattern] of STRUCTURAL_TOOL_PATTERNS) {
    if (pattern.test(toolName)) return family;
  }
  return null;
}

function hasToolFamily(evidence: Stage67ToolEvidence[], family: string): boolean {
  return evidence.some(item => toolFamily(item.toolName) === family);
}

function terminalOutcomesFor(tool: JsonRecord): boolean {
  const outcome = str(tool['outcome']);
  return outcome === 'no_effect' || outcome === 'rejected' || outcome === 'failed';
}

function buildToolEvidence(rows: Array<JsonRecord | undefined>): Stage67ToolEvidence[] {
  const byTool = new Map<string, Stage67ToolEvidence>();
  for (const row of rows) {
    const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
    for (const tool of tools) {
      const toolName = str(tool['toolName']);
      const outcome = str(tool['outcome']) || 'unknown';
      if (!toolName || !toolFamily(toolName)) continue;
      const entry = byTool.get(toolName) ?? { toolName, outcomes: {}, terminalOutcomes: {} };
      entry.outcomes[outcome] = (entry.outcomes[outcome] ?? 0) + 1;
      if (terminalOutcomesFor(tool)) entry.terminalOutcomes[outcome] = (entry.terminalOutcomes[outcome] ?? 0) + 1;
      byTool.set(toolName, entry);
    }
  }
  return [...byTool.values()].sort((a, b) => a.toolName.localeCompare(b.toolName));
}

function inferClass(input: {
  stage65Class: string;
  stage65Family: string;
  stage66Decision: string | null;
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  repeatedLowCategories: string[];
  toolEvidence: Stage67ToolEvidence[];
}): Pick<Stage67RowReport, 'class' | 'plausibleNextFixer' | 'nextFixerReason' | 'reasons'> {
  const reasons: string[] = [];
  if (input.stage66Decision === 'non_canonicalizable_analyzer_debt' || input.stage65Class === 'parked_analyzer_volatility') {
    return {
      class: 'excluded_analyzer_volatility',
      plausibleNextFixer: false,
      nextFixerReason: 'excluded_non_canonicalizable_analyzer_volatility',
      reasons: ['stage66_or_stage65_marks_analyzer_volatility'],
    };
  }
  if (input.stage66Decision === 'policy_debt' || input.stage65Class === 'manual_scanned_debt' || input.stage65Family === 'manual_scanned') {
    return {
      class: 'excluded_manual_scanned',
      plausibleNextFixer: false,
      nextFixerReason: 'excluded_manual_scanned_policy_debt',
      reasons: ['manual_scanned_policy_debt_excluded_from_structural_selection'],
    };
  }
  if (input.stage65Class === 'inconclusive_repeat_missing') {
    return {
      class: 'inconclusive_missing_artifact',
      plausibleNextFixer: false,
      nextFixerReason: 'missing_stage65_repeat_artifact',
      reasons: ['missing_stage65_repeat_artifact'],
    };
  }
  if (input.stage65Class === 'resolved_or_stable_high' || input.repeatedLowCategories.length === 0) {
    return {
      class: 'resolved_or_high',
      plausibleNextFixer: false,
      nextFixerReason: 'no_repeated_low_structural_category',
      reasons: ['resolved_or_stable_high'],
    };
  }

  const hasTable = input.repeatedLowCategories.includes('table_markup') || input.stage65Family === 'table';
  const hasAlt = input.repeatedLowCategories.includes('alt_text') || input.stage65Family === 'figure_alt';
  const hasHeading = input.repeatedLowCategories.includes('heading_structure') || input.stage65Family === 'heading';
  const lowFamilies = [hasTable, hasAlt, hasHeading].filter(Boolean).length;
  if (hasTable && lowFamilies === 1) {
    reasons.push('stable_repeated_table_debt');
    return {
      class: 'stable_table_residual',
      plausibleNextFixer: hasToolFamily(input.toolEvidence, 'table'),
      nextFixerReason: hasToolFamily(input.toolEvidence, 'table')
        ? 'table_tool_evidence_present_requires_new_invariant_path_not_retry'
        : 'table_score_low_but_no_table_tool_evidence',
      reasons,
    };
  }
  if (hasAlt && lowFamilies === 1) {
    reasons.push('stable_repeated_figure_alt_debt');
    return {
      class: 'stable_figure_alt_residual',
      plausibleNextFixer: hasToolFamily(input.toolEvidence, 'figure_alt'),
      nextFixerReason: hasToolFamily(input.toolEvidence, 'figure_alt')
        ? 'figure_alt_tool_evidence_present'
        : 'alt_score_low_but_no_figure_tool_evidence',
      reasons,
    };
  }
  if (hasHeading && lowFamilies === 1) {
    reasons.push('stable_repeated_heading_debt');
    return {
      class: 'stable_heading_residual',
      plausibleNextFixer: hasToolFamily(input.toolEvidence, 'heading'),
      nextFixerReason: hasToolFamily(input.toolEvidence, 'heading')
        ? 'heading_tool_evidence_present'
        : 'heading_score_low_but_no_heading_tool_evidence',
      reasons,
    };
  }
  reasons.push(`stable_mixed_low_categories=${input.repeatedLowCategories.join(',')}`);
  return {
    class: 'stable_mixed_residual',
    plausibleNextFixer: false,
    nextFixerReason: 'mixed_debt_needs_separate_diagnostic_before_fixer',
    reasons,
  };
}

export function buildStage67RowReport(input: {
  stage65Row: JsonRecord;
  stage66ById: Map<string, JsonRecord>;
  runRows?: Array<JsonRecord | undefined>;
}): Stage67RowReport {
  const id = str(input.stage65Row['id']);
  const stage66Row = input.stage66ById.get(id);
  const categoryRangesRaw = asRecord(input.stage65Row['categoryRanges']);
  const categoryRanges = Object.fromEntries(Object.entries(categoryRangesRaw).map(([key, value]) => [key, scoreRange(value)]));
  const lowCategories = repeatedLowCategories(categoryRangesRaw);
  const toolEvidence = buildToolEvidence(input.runRows ?? []);
  const stage65Class = str(input.stage65Row['class']);
  const stage65Family = str(input.stage65Row['residualFamily']);
  const stage66Decision = stage66Row ? str(stage66Row['decision']) || null : null;
  const score = scoreRange(input.stage65Row['scoreRange']);
  const classification = inferClass({
    stage65Class,
    stage65Family,
    stage66Decision,
    scoreRange: score,
    repeatedLowCategories: lowCategories,
    toolEvidence,
  });
  const stage64Gain = asRecord(input.stage65Row['stage64Gain']);
  const gainRequired = stage64Gain['required'] === true || STAGE64_GAIN_TARGETS.has(id);
  const gainPreserved = gainRequired ? stage64Gain['repeated'] === true : null;
  return {
    id,
    corpus: str(input.stage65Row['corpus']),
    file: str(input.stage65Row['file']),
    stage65Class,
    stage65Family,
    stage66Decision,
    class: classification.class,
    scoreRange: score,
    categoryRanges,
    repeatedLowCategories: lowCategories,
    toolEvidence,
    plausibleNextFixer: classification.plausibleNextFixer,
    nextFixerReason: classification.nextFixerReason,
    stage64GainPreserved: gainPreserved,
    reasons: classification.reasons,
  };
}

export function selectStage68Direction(rows: Stage67RowReport[]): { selectedStage68Direction: Stage68Direction; decisionReasons: string[] } {
  const decisionReasons: string[] = [];
  const inconclusive = rows.filter(row => row.class === 'inconclusive_missing_artifact');
  const analyzer = rows.filter(row => row.class === 'excluded_analyzer_volatility');
  const manual = rows.filter(row => row.class === 'excluded_manual_scanned');
  const stableStructural = rows.filter(row => row.class.startsWith('stable_'));
  const tableBelowC = rows.filter(row =>
    row.class === 'stable_table_residual' &&
    row.plausibleNextFixer &&
    (row.scoreRange.max ?? Infinity) < BELOW_C_SCORE_THRESHOLD
  );
  const figurePolish = rows.filter(row =>
    row.class === 'stable_figure_alt_residual' &&
    row.plausibleNextFixer &&
    (row.scoreRange.max ?? Infinity) < A_SCORE_THRESHOLD &&
    (row.categoryRanges['alt_text']?.max ?? Infinity) < LOW_CATEGORY_THRESHOLD
  );
  const lowRows = rows.filter(row => (row.scoreRange.max ?? Infinity) < BELOW_C_SCORE_THRESHOLD);
  const structuralLowRows = lowRows.filter(row => !['excluded_analyzer_volatility', 'excluded_manual_scanned'].includes(row.class));

  if (inconclusive.length > 0) {
    return {
      selectedStage68Direction: 'No Fixer - Resolve Evidence Gap',
      decisionReasons: [`${inconclusive.length} row(s) have missing repeat/decision artifacts.`],
    };
  }
  if (tableBelowC.length === 1 && tableBelowC[0]?.id === 'v1-4722') {
    decisionReasons.push('v1-4722 is the only stable below-C structural row with repeated table debt and table tool evidence.');
    decisionReasons.push(`${analyzer.length} analyzer-volatility row(s) remain parked; ${manual.length} manual/scanned row(s) remain excluded.`);
    return { selectedStage68Direction: 'Table Tail Follow-up v3', decisionReasons };
  }
  if (figurePolish.length >= 2) {
    decisionReasons.push(`${figurePolish.length} stable below-A row(s) have repeated low alt_text and figure-tool evidence.`);
    decisionReasons.push(`${analyzer.length} analyzer-volatility row(s) remain parked; ${manual.length} manual/scanned row(s) remain excluded.`);
    return { selectedStage68Direction: 'Figure/Alt Polish', decisionReasons };
  }
  if (manual.length > 0 && structuralLowRows.length === 0 && stableStructural.length === 0) {
    decisionReasons.push('All remaining below-C rows after analyzer exclusions are manual/scanned policy debt.');
    return { selectedStage68Direction: 'Manual/Scanned Policy Diagnostic', decisionReasons };
  }
  if (stableStructural.length === 0) {
    decisionReasons.push('Stable structural residuals are exhausted after exclusions.');
    return { selectedStage68Direction: 'Legacy Reconciliation', decisionReasons };
  }
  decisionReasons.push('Stable residuals remain, but no Stage68 selection threshold was met.');
  return { selectedStage68Direction: 'Legacy Reconciliation', decisionReasons };
}

export function buildStage67Report(input: {
  stage65: JsonRecord;
  stage66: JsonRecord;
  runRowsByLabel?: Map<string, Map<string, JsonRecord>>;
  generatedAt?: string;
}): Stage67Report {
  const stage65Rows = Array.isArray(input.stage65['rows']) ? input.stage65['rows'] as JsonRecord[] : [];
  const stage66Rows = Array.isArray(input.stage66['rows']) ? input.stage66['rows'] as JsonRecord[] : [];
  const runs = Array.isArray(input.stage65['runs']) ? input.stage65['runs'] as JsonRecord[] : [];
  const stage66ById = new Map(stage66Rows.map(row => [str(row['id']), row]));
  const rows = stage65Rows.map(row => {
    const id = str(row['id']);
    const runRows = input.runRowsByLabel
      ? runs.map(run => input.runRowsByLabel?.get(str(run['label']))?.get(id))
      : [];
    return buildStage67RowReport({ stage65Row: row, stage66ById, runRows });
  });
  const classDistribution: Record<string, number> = {};
  for (const row of rows) classDistribution[row.class] = (classDistribution[row.class] ?? 0) + 1;
  const preservedStage64Gains = rows.filter(row => row.stage64GainPreserved === true).map(row => row.id).sort();
  const selection = selectStage68Direction(rows);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      stage65ReportPath: DEFAULT_STAGE65_REPORT,
      stage66ReportPath: DEFAULT_STAGE66_REPORT,
      runs: runs.map(run => ({
        label: str(run['label']),
        corpus: str(run['corpus']),
        phase: str(run['phase']),
        runDir: str(run['runDir']),
      })),
    },
    rows,
    classDistribution,
    preservedStage64Gains,
    ...selection,
  };
}

async function readJson(path: string): Promise<JsonRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
}

async function readAnyJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function loadRunRows(runDir: string): Promise<Map<string, JsonRecord>> {
  const parsed = await readAnyJson(join(runDir, 'remediate.results.json'));
  const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
  const out = new Map<string, JsonRecord>();
  for (const row of rows) {
    const id = canonicalId(row);
    if (id) out.set(id, row);
  }
  return out;
}

async function loadRunRowsByLabel(stage65: JsonRecord): Promise<Map<string, Map<string, JsonRecord>>> {
  const runs = Array.isArray(stage65['runs']) ? stage65['runs'] as JsonRecord[] : [];
  const out = new Map<string, Map<string, JsonRecord>>();
  for (const run of runs) {
    const label = str(run['label']);
    const runDir = str(run['runDir']);
    if (!label || !runDir) continue;
    out.set(label, await loadRunRows(runDir));
  }
  return out;
}

function parseArgs(argv: string[]): { outDir: string; stage65ReportPath: string; stage66ReportPath: string } {
  let outDir = DEFAULT_OUT;
  let stage65ReportPath = DEFAULT_STAGE65_REPORT;
  let stage66ReportPath = DEFAULT_STAGE66_REPORT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--out') outDir = argv[++index] ?? outDir;
    else if (arg === '--stage65') stage65ReportPath = argv[++index] ?? stage65ReportPath;
    else if (arg === '--stage66') stage66ReportPath = argv[++index] ?? stage66ReportPath;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return { outDir, stage65ReportPath, stage66ReportPath };
}

function formatRange(rangeValue: { min: number | null; max: number | null; delta: number | null }): string {
  return `${rangeValue.min ?? 'n/a'}-${rangeValue.max ?? 'n/a'} (${rangeValue.delta ?? 'n/a'})`;
}

function markdown(report: Stage67Report): string {
  const lines = ['# Stage 67 Stable Residual Selection', ''];
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Selected Stage 68 direction: \`${report.selectedStage68Direction}\``, '');
  lines.push('Decision reasons:');
  for (const reason of report.decisionReasons) lines.push(`- ${reason}`);
  lines.push('', '## Distribution', '');
  for (const [key, count] of Object.entries(report.classDistribution).sort()) lines.push(`- ${key}: ${count}`);
  lines.push('', '## Preserved Stage64 Gains', '');
  lines.push(report.preservedStage64Gains.length ? report.preservedStage64Gains.map(id => `- ${id}`).join('\n') : '- none');
  lines.push('', '## Rows', '');
  lines.push('| Row | Corpus | Range | Class | Low Categories | Plausible Fixer | Tool Evidence |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const low = row.repeatedLowCategories.join(', ') || 'none';
    const evidence = row.toolEvidence.map(tool => `${tool.toolName}:${Object.entries(tool.outcomes).map(([outcome, count]) => `${outcome}=${count}`).join('/')}`).join(', ') || 'none';
    lines.push(`| ${row.id} | ${row.corpus} | ${formatRange(row.scoreRange)} | ${row.class} | ${low} | ${row.plausibleNextFixer ? row.nextFixerReason : 'no'} | ${evidence} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const stage65 = await readJson(args.stage65ReportPath);
  if (!stage65) throw new Error(`Missing or invalid Stage65 report: ${args.stage65ReportPath}`);
  const stage66 = await readJson(args.stage66ReportPath);
  if (!stage66) throw new Error(`Missing or invalid Stage66 report: ${args.stage66ReportPath}`);
  const runRowsByLabel = await loadRunRowsByLabel(stage65);
  const report = buildStage67Report({ stage65, stage66, runRowsByLabel });
  report.inputs.stage65ReportPath = args.stage65ReportPath;
  report.inputs.stage66ReportPath = args.stage66ReportPath;
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage67-stable-residual-selection.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage67-stable-residual-selection.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 67 stable residual selection report to ${resolve(args.outDir)}`);
  console.log(`Selected Stage 68 direction: ${report.selectedStage68Direction}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

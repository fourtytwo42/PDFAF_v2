#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export type Stage72DebtBucket =
  | 'stable_structural_residual'
  | 'parked_analyzer_volatility'
  | 'manual_scanned_policy_debt'
  | 'mixed_no_safe_target'
  | 'resolved_high'
  | 'inconclusive_missing_artifact';

export type Stage73Direction =
  | 'Stage 73: Stable Edge-Mix A/B Cleanup'
  | 'Stage 73: Single-Row Stable Cleanup plus End-Gate Target Revisit'
  | 'Stage 73: Acceptance Waiver Prep'
  | 'Stage 73: Analyzer Volatility Project'
  | 'Stage 73: Resolve Evidence Gap';

export interface BenchmarkToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  details?: unknown;
}

export interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: string; score: number }>;
  appliedTools?: BenchmarkToolRow[];
  falsePositiveAppliedCount?: number;
}

export interface Stage72ToolEvidence {
  toolName: string;
  outcomes: Record<string, number>;
  terminalOutcomes: Record<string, number>;
  notes: string[];
}

export interface Stage72RowReport {
  id: string;
  corpus: 'edge_mix_1' | 'edge_mix_2';
  file: string | null;
  score: number | null;
  grade: string | null;
  lowCategories: Array<{ key: string; score: number }>;
  stage65Class: string | null;
  stage65Family: string | null;
  stage66Decision: string | null;
  stage66RootCause: string | null;
  debtBucket: Stage72DebtBucket;
  repeatStable: boolean;
  fixerPathExists: boolean;
  expectedAbContribution: 0 | 1;
  toolEvidence: Stage72ToolEvidence[];
  reasons: string[];
}

export interface Stage72Report {
  generatedAt: string;
  inputs: {
    edgeMix1RunDir: string;
    edgeMix2RunDir: string;
    stage65ReportPath: string;
    stage66ReportPath: string;
    stage71ReportPath: string;
  };
  abMath: {
    currentAbCount: number;
    totalRows: number;
    targetAbCount: number;
    neededAdditionalAbRows: number;
    stableCandidateCount: number;
    projectedAbCountWithStableCandidates: number;
    reachableWithoutParkedOrManualRows: boolean;
  };
  rows: Stage72RowReport[];
  classDistribution: Record<Stage72DebtBucket, number>;
  selectedStage73Direction: Stage73Direction;
  decisionReasons: string[];
}

const DEFAULT_EDGE1_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage68-edge-mix-2026-04-25-r1';
const DEFAULT_EDGE2_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage68-edge-mix2-2026-04-25-r1';
const DEFAULT_STAGE65_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage65-repeatability-decision-2026-04-24-r1/stage65-repeatability-decision.json';
const DEFAULT_STAGE66_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage66-analyzer-volatility-design-2026-04-24-r1/stage66-analyzer-volatility-design.json';
const DEFAULT_STAGE71_REPORT = 'Output/engine-v2-general-acceptance/stage71-end-gate-2026-04-25-r1/stage71-end-gate-report.json';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage72-edge-mix-ab-feasibility-2026-04-25-r1';

const LOW_CATEGORY_THRESHOLD = 70;
const AB_TARGET_PERCENT = 80;
const STRUCTURAL_TOOL_PATTERN = /figure|alt|table|heading|structure|artifact|orphan/i;

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage72-edge-mix-ab-feasibility.ts [options]',
    `  --edge1-run <dir>   Default: ${DEFAULT_EDGE1_RUN}`,
    `  --edge2-run <dir>   Default: ${DEFAULT_EDGE2_RUN}`,
    `  --stage65 <json>    Default: ${DEFAULT_STAGE65_REPORT}`,
    `  --stage66 <json>    Default: ${DEFAULT_STAGE66_REPORT}`,
    `  --stage71 <json>    Default: ${DEFAULT_STAGE71_REPORT}`,
    `  --out <dir>         Default: ${DEFAULT_OUT}`,
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

function canonicalId(row: BenchmarkRow | JsonRecord): string {
  const id = str(row.id);
  if (id) return id.startsWith('v1-') ? id : `v1-${id}`;
  const publicationId = str(row.publicationId);
  return publicationId ? `v1-${publicationId.replace(/^v1-/, '')}` : '';
}

function categories(row: BenchmarkRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const category of row.afterCategories ?? []) {
    const score = num(category.score);
    if (category.key && score != null) out[category.key] = score;
  }
  return out;
}

function lowCategories(row: BenchmarkRow): Array<{ key: string; score: number }> {
  return Object.entries(categories(row))
    .filter(([, score]) => score < LOW_CATEGORY_THRESHOLD)
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
}

function grade(row: BenchmarkRow): string | null {
  return str(row.afterGrade) || null;
}

function isAb(row: BenchmarkRow): boolean {
  return grade(row) === 'A' || grade(row) === 'B';
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    return asRecord(JSON.parse(trimmed) as unknown);
  } catch {
    return { raw: details };
  }
}

function toolName(tool: BenchmarkToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function noteFromTool(tool: BenchmarkToolRow): string {
  const details = parseDetails(tool.details);
  return str(details.note) || str(details.raw);
}

function buildToolEvidence(row: BenchmarkRow): Stage72ToolEvidence[] {
  const byTool = new Map<string, Stage72ToolEvidence>();
  for (const tool of row.appliedTools ?? []) {
    const name = toolName(tool);
    if (!STRUCTURAL_TOOL_PATTERN.test(name)) continue;
    const outcome = tool.outcome ?? 'unknown';
    const entry = byTool.get(name) ?? { toolName: name, outcomes: {}, terminalOutcomes: {}, notes: [] };
    entry.outcomes[outcome] = (entry.outcomes[outcome] ?? 0) + 1;
    if (outcome === 'no_effect' || outcome === 'rejected' || outcome === 'failed') {
      entry.terminalOutcomes[outcome] = (entry.terminalOutcomes[outcome] ?? 0) + 1;
    }
    const note = noteFromTool(tool);
    if (note && !entry.notes.includes(note)) entry.notes.push(note);
    byTool.set(name, entry);
  }
  return [...byTool.values()].sort((a, b) => a.toolName.localeCompare(b.toolName));
}

function stage65Rows(report: JsonRecord): Map<string, JsonRecord> {
  const rows = Array.isArray(report.rows) ? report.rows as JsonRecord[] : [];
  return new Map(rows.map(row => [str(row.id), row]).filter(([id]) => Boolean(id)));
}

function stage66Rows(report: JsonRecord): Map<string, JsonRecord> {
  const rows = Array.isArray(report.rows) ? report.rows as JsonRecord[] : [];
  return new Map(rows.map(row => [str(row.id), row]).filter(([id]) => Boolean(id)));
}

function hasFigureOrTablePath(row: BenchmarkRow, evidence: Stage72ToolEvidence[]): boolean {
  const lows = lowCategories(row).map(category => category.key);
  if (lows.includes('alt_text')) return evidence.some(tool => /figure|alt/i.test(tool.toolName));
  if (lows.includes('table_markup')) return evidence.some(tool => /table/i.test(tool.toolName));
  if (lows.includes('heading_structure')) return evidence.some(tool => /heading|structure/i.test(tool.toolName));
  return evidence.length > 0;
}

export function classifyStage72Row(input: {
  row: BenchmarkRow;
  corpus: 'edge_mix_1' | 'edge_mix_2';
  stage65Row?: JsonRecord;
  stage66Row?: JsonRecord;
}): Stage72RowReport {
  const id = canonicalId(input.row);
  const rowGrade = grade(input.row);
  const stage65Class = str(input.stage65Row?.class) || null;
  const stage65Family = str(input.stage65Row?.residualFamily) || null;
  const stage66Decision = str(input.stage66Row?.decision) || null;
  const stage66RootCause = str(input.stage66Row?.rootCause) || null;
  const evidence = buildToolEvidence(input.row);
  const reasons: string[] = [];
  let debtBucket: Stage72DebtBucket = 'stable_structural_residual';
  let repeatStable = true;

  if (rowGrade === 'A' || rowGrade === 'B') {
    debtBucket = 'resolved_high';
    reasons.push('row_is_already_A_or_B');
  } else if (!input.stage65Row && !input.stage66Row) {
    debtBucket = 'inconclusive_missing_artifact';
    repeatStable = false;
    reasons.push('missing_stage65_and_stage66_repeatability_evidence');
  } else if (stage66Decision === 'non_canonicalizable_analyzer_debt' || stage65Class === 'parked_analyzer_volatility') {
    debtBucket = 'parked_analyzer_volatility';
    repeatStable = false;
    reasons.push('excluded_by_stage65_or_stage66_analyzer_volatility');
  } else if (stage66Decision === 'policy_debt' || stage65Class === 'manual_scanned_debt' || stage65Family === 'manual_scanned') {
    debtBucket = 'manual_scanned_policy_debt';
    reasons.push('excluded_manual_scanned_policy_debt');
  } else if (stage65Class === 'mixed_no_safe_target') {
    debtBucket = 'mixed_no_safe_target';
    reasons.push('stage65_mixed_no_safe_target');
  } else {
    reasons.push('stable_non_parked_non_AB_row');
  }

  const fixerPathExists =
    debtBucket === 'stable_structural_residual' &&
    rowGrade !== 'A' &&
    rowGrade !== 'B' &&
    hasFigureOrTablePath(input.row, evidence);
  if (fixerPathExists) reasons.push('structural_tool_evidence_matches_low_category');
  else if (debtBucket === 'stable_structural_residual' && rowGrade !== 'A' && rowGrade !== 'B') reasons.push('no_matching_checker_visible_tool_evidence');

  return {
    id,
    corpus: input.corpus,
    file: input.row.file ?? input.row.localFile ?? null,
    score: num(input.row.afterScore),
    grade: rowGrade,
    lowCategories: lowCategories(input.row),
    stage65Class,
    stage65Family,
    stage66Decision,
    stage66RootCause,
    debtBucket,
    repeatStable,
    fixerPathExists,
    expectedAbContribution: fixerPathExists ? 1 : 0,
    toolEvidence: evidence,
    reasons,
  };
}

function classDistribution(rows: Stage72RowReport[]): Record<Stage72DebtBucket, number> {
  const keys: Stage72DebtBucket[] = [
    'stable_structural_residual',
    'parked_analyzer_volatility',
    'manual_scanned_policy_debt',
    'mixed_no_safe_target',
    'resolved_high',
    'inconclusive_missing_artifact',
  ];
  return Object.fromEntries(keys.map(key => [key, rows.filter(row => row.debtBucket === key).length])) as Record<Stage72DebtBucket, number>;
}

export function selectStage73Direction(input: {
  currentAbCount: number;
  totalRows: number;
  rows: Stage72RowReport[];
}): Pick<Stage72Report, 'abMath' | 'selectedStage73Direction' | 'decisionReasons'> {
  const targetAbCount = Math.ceil((AB_TARGET_PERCENT / 100) * input.totalRows);
  const needed = Math.max(0, targetAbCount - input.currentAbCount);
  const candidates = input.rows.filter(row => row.fixerPathExists);
  const projected = input.currentAbCount + candidates.length;
  const analyzerRows = input.rows.filter(row => row.debtBucket === 'parked_analyzer_volatility');
  const manualRows = input.rows.filter(row => row.debtBucket === 'manual_scanned_policy_debt');
  const inconclusiveRows = input.rows.filter(row => row.debtBucket === 'inconclusive_missing_artifact');
  const reachable = projected >= targetAbCount;
  const decisionReasons = [
    `current A/B ${input.currentAbCount}/${input.totalRows}; target ${targetAbCount}/${input.totalRows}; need ${needed}`,
    `${candidates.length} stable non-parked A/B lift candidate(s): ${candidates.map(row => row.id).join(', ') || 'none'}`,
  ];
  let selectedStage73Direction: Stage73Direction;
  if (inconclusiveRows.length > 0) {
    selectedStage73Direction = 'Stage 73: Resolve Evidence Gap';
    decisionReasons.push(`${inconclusiveRows.length} row(s) have missing repeatability evidence`);
  } else if (candidates.length >= needed && needed > 0 && candidates.length >= 2) {
    selectedStage73Direction = 'Stage 73: Stable Edge-Mix A/B Cleanup';
    decisionReasons.push('edge-mix A/B target is reachable using stable non-parked rows');
  } else if (candidates.length === 1) {
    selectedStage73Direction = 'Stage 73: Single-Row Stable Cleanup plus End-Gate Target Revisit';
    decisionReasons.push('only one stable candidate is safely fixable, so 80% A/B cannot be reached without a waiver or parked-row work');
  } else if (analyzerRows.length > 0 || manualRows.length > 0) {
    selectedStage73Direction = 'Stage 73: Acceptance Waiver Prep';
    decisionReasons.push(`${analyzerRows.length} analyzer-volatility row(s) and ${manualRows.length} manual/scanned row(s) block the missing A/B rows`);
  } else {
    selectedStage73Direction = 'Stage 73: Resolve Evidence Gap';
    decisionReasons.push('no stable candidates and no explicit parked/manual blocker bucket found');
  }
  if (!reachable) decisionReasons.push(`projected stable-candidate A/B is ${projected}/${input.totalRows}, below target ${targetAbCount}/${input.totalRows}`);
  return {
    abMath: {
      currentAbCount: input.currentAbCount,
      totalRows: input.totalRows,
      targetAbCount,
      neededAdditionalAbRows: needed,
      stableCandidateCount: candidates.length,
      projectedAbCountWithStableCandidates: projected,
      reachableWithoutParkedOrManualRows: reachable,
    },
    selectedStage73Direction,
    decisionReasons,
  };
}

export function buildStage72Report(input: {
  edgeMix1RunDir: string;
  edgeMix2RunDir: string;
  stage65ReportPath: string;
  stage66ReportPath: string;
  stage71ReportPath: string;
  edgeMix1Rows: BenchmarkRow[];
  edgeMix2Rows: BenchmarkRow[];
  stage65Report: JsonRecord;
  stage66Report: JsonRecord;
  generatedAt?: string;
}): Stage72Report {
  const stage65 = stage65Rows(input.stage65Report);
  const stage66 = stage66Rows(input.stage66Report);
  const allRows = [
    ...input.edgeMix1Rows.map(row => ({ row, corpus: 'edge_mix_1' as const })),
    ...input.edgeMix2Rows.map(row => ({ row, corpus: 'edge_mix_2' as const })),
  ];
  const currentAbCount = allRows.filter(({ row }) => isAb(row)).length;
  const nonAbRows = allRows.filter(({ row }) => !isAb(row));
  const rows = nonAbRows
    .map(({ row, corpus }) => {
      const id = canonicalId(row);
      return classifyStage72Row({ row, corpus, stage65Row: stage65.get(id), stage66Row: stage66.get(id) });
    })
    .sort((a, b) => a.corpus.localeCompare(b.corpus) || (a.score ?? 999) - (b.score ?? 999) || a.id.localeCompare(b.id));
  const selected = selectStage73Direction({ currentAbCount, totalRows: allRows.length, rows });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      edgeMix1RunDir: input.edgeMix1RunDir,
      edgeMix2RunDir: input.edgeMix2RunDir,
      stage65ReportPath: input.stage65ReportPath,
      stage66ReportPath: input.stage66ReportPath,
      stage71ReportPath: input.stage71ReportPath,
    },
    ...selected,
    rows,
    classDistribution: classDistribution(rows),
  };
}

function renderToolEvidence(evidence: Stage72ToolEvidence[]): string {
  if (!evidence.length) return 'none';
  return evidence
    .slice(0, 3)
    .map(tool => `${tool.toolName}:${JSON.stringify(tool.outcomes)}`)
    .join('; ');
}

function renderRow(row: Stage72RowReport): string {
  const lows = row.lowCategories.map(category => `${category.key}:${category.score}`).join(', ') || 'none';
  return `| ${row.id} | ${row.corpus} | ${row.score ?? 'n/a'}/${row.grade ?? 'n/a'} | ${row.debtBucket} | ${row.repeatStable ? 'yes' : 'no'} | ${row.fixerPathExists ? 'yes' : 'no'} | ${row.expectedAbContribution} | ${lows} | ${renderToolEvidence(row.toolEvidence)} |`;
}

export function renderStage72Markdown(report: Stage72Report): string {
  const lines = [
    '# Stage 72 Edge-Mix A/B Feasibility',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Selected Stage 73 direction: \`${report.selectedStage73Direction}\``,
    '',
    'Decision reasons:',
    ...report.decisionReasons.map(reason => `- ${reason}`),
    '',
    '## A/B Math',
    '',
    `- Current A/B: ${report.abMath.currentAbCount}/${report.abMath.totalRows}`,
    `- Target A/B: ${report.abMath.targetAbCount}/${report.abMath.totalRows}`,
    `- Additional A/B rows needed: ${report.abMath.neededAdditionalAbRows}`,
    `- Stable candidate count: ${report.abMath.stableCandidateCount}`,
    `- Projected A/B using stable candidates: ${report.abMath.projectedAbCountWithStableCandidates}/${report.abMath.totalRows}`,
    `- Reachable without parked/manual rows: ${report.abMath.reachableWithoutParkedOrManualRows ? 'yes' : 'no'}`,
    '',
    '## Class Distribution',
    '',
    '```json',
    JSON.stringify(report.classDistribution, null, 2),
    '```',
    '',
    '## Non-A/B Rows',
    '',
    '| Row | Corpus | Score/Grade | Debt Bucket | Repeat Stable | Fixer Path | A/B Contribution | Low Categories | Tool Evidence |',
    '| --- | --- | ---: | --- | --- | --- | ---: | --- | --- |',
    ...report.rows.map(renderRow),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function loadRows(runDir: string): Promise<BenchmarkRow[]> {
  const path = join(resolve(runDir), 'remediate.results.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as BenchmarkRow[] | { rows?: BenchmarkRow[]; results?: BenchmarkRow[] };
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : raw.results;
  if (!Array.isArray(rows)) throw new Error(`No remediation rows found in ${path}`);
  return rows;
}

async function readJson(path: string): Promise<JsonRecord> {
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  return asRecord(parsed);
}

function parseArgs(argv: string[]): {
  edge1Run: string;
  edge2Run: string;
  stage65: string;
  stage66: string;
  stage71: string;
  outDir: string;
} {
  const args = {
    edge1Run: DEFAULT_EDGE1_RUN,
    edge2Run: DEFAULT_EDGE2_RUN,
    stage65: DEFAULT_STAGE65_REPORT,
    stage66: DEFAULT_STAGE66_REPORT,
    stage71: DEFAULT_STAGE71_REPORT,
    outDir: DEFAULT_OUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--edge1-run') args.edge1Run = argv[++index] ?? args.edge1Run;
    else if (arg === '--edge2-run') args.edge2Run = argv[++index] ?? args.edge2Run;
    else if (arg === '--stage65') args.stage65 = argv[++index] ?? args.stage65;
    else if (arg === '--stage66') args.stage66 = argv[++index] ?? args.stage66;
    else if (arg === '--stage71') args.stage71 = argv[++index] ?? args.stage71;
    else if (arg === '--out') args.outDir = argv[++index] ?? args.outDir;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const [edgeMix1Rows, edgeMix2Rows, stage65Report, stage66Report] = await Promise.all([
    loadRows(args.edge1Run),
    loadRows(args.edge2Run),
    readJson(args.stage65),
    readJson(args.stage66),
    readJson(args.stage71),
  ]);
  const report = buildStage72Report({
    edgeMix1RunDir: resolve(args.edge1Run),
    edgeMix2RunDir: resolve(args.edge2Run),
    stage65ReportPath: resolve(args.stage65),
    stage66ReportPath: resolve(args.stage66),
    stage71ReportPath: resolve(args.stage71),
    edgeMix1Rows,
    edgeMix2Rows,
    stage65Report,
    stage66Report,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage72-edge-mix-ab-feasibility.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage72-edge-mix-ab-feasibility.md'), renderStage72Markdown(report), 'utf8');
  console.log(`Wrote Stage 72 feasibility report to ${resolve(args.outDir)}`);
  console.log(`Selected Stage 73 direction: ${report.selectedStage73Direction}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

#!/usr/bin/env tsx
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export type TableOriginalControlImpactClass =
  | 'direct_table_behavior_improved_or_stable'
  | 'direct_table_behavior_regressed'
  | 'direct_table_behavior_non_table_pac_side_effect'
  | 'table_route_changed_without_behavior_marker'
  | 'unrelated_route_regression'
  | 'runtime_timeout_regression'
  | 'stable_or_recovered'
  | 'missing_baseline';

export type TableOriginalControlImpactDecision =
  | 'table_behavior_harmed_original_controls'
  | 'original_gate_blocked_by_unrelated_route'
  | 'table_impact_clear_return_to_table_proof'
  | 'insufficient_comparison_evidence';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  source?: string;
  details?: unknown;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
}

interface NormalizedRow {
  id: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  error: string | null;
  categories: Record<string, number>;
  appliedTools: AppliedTool[];
}

interface ArtifactRows {
  path: string;
  rows: NormalizedRow[];
}

export interface TableOriginalControlImpactRow {
  id: string;
  file: string;
  candidatePath: string;
  baselineScore: number | null;
  candidateScore: number | null;
  scoreDelta: number | null;
  baselineTableMarkup: number | null;
  candidateTableMarkup: number | null;
  tableDelta: number | null;
  candidateTimedOut: boolean;
  tableBehaviorMarkerFired: boolean;
  tableToolsApplied: string[];
  pacRegressions: string[];
  classification: TableOriginalControlImpactClass;
  reasons: string[];
}

export interface TableOriginalControlImpactReport {
  generatedAt: string;
  outDir: string;
  baselinePath: string;
  candidatePaths: string[];
  behaviorMarkers: string[];
  summary: {
    rowComparisons: number;
    byClass: Record<TableOriginalControlImpactClass, number>;
    directBehaviorRows: string[];
    directBehaviorRegressions: string[];
    nonTablePacSideEffectRows: string[];
    unrelatedRouteRegressions: string[];
    tableRouteChangedWithoutMarkerRows: string[];
    timeoutRegressions: string[];
  };
  decision: {
    status: TableOriginalControlImpactDecision;
    nextLane: string;
    reasons: string[];
  };
  rows: TableOriginalControlImpactRow[];
}

interface Args {
  baseline: string | null;
  candidates: string[];
  outDir: string;
  behaviorMarkers: string[];
}

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';
const DEFAULT_BEHAVIOR_MARKERS = [
  'stage180_empty_row_regularity_cleanup',
  'stage180_header_regularization_sequence',
  'stage180_explicit_table_continuation',
  'largeObjectBackedTableBatch',
];

const CLASSES: TableOriginalControlImpactClass[] = [
  'direct_table_behavior_improved_or_stable',
  'direct_table_behavior_regressed',
  'direct_table_behavior_non_table_pac_side_effect',
  'table_route_changed_without_behavior_marker',
  'unrelated_route_regression',
  'runtime_timeout_regression',
  'stable_or_recovered',
  'missing_baseline',
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-original-control-impact-diagnostic.ts [options]

Options:
  --baseline <json-or-run-dir>      Accepted/control original-50 artifact.
  --candidate <json-or-run-dir>     Candidate original-50 artifact. Repeatable.
  --marker <text>                   Behavior marker text to treat as direct table-lane execution. Repeatable.
  --out <dir>                       Output directory.
  --help                            Show this help.

The script reads existing JSON artifacts only. It does not analyze PDFs, remediate PDFs, write PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  let baseline: string | null = null;
  const candidates: string[] = [];
  const behaviorMarkers: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `table-original-control-impact-${timestampSlug(now)}`);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--baseline') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --baseline value\n${usage()}`);
      baseline = resolve(value);
      continue;
    }
    if (arg === '--candidate') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --candidate value\n${usage()}`);
      candidates.push(resolve(value));
      continue;
    }
    if (arg === '--marker') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --marker value\n${usage()}`);
      behaviorMarkers.push(value);
      continue;
    }
    if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (!baseline) throw new Error(`--baseline is required\n${usage()}`);
  if (candidates.length === 0) throw new Error(`At least one --candidate is required\n${usage()}`);
  return {
    baseline,
    candidates,
    outDir,
    behaviorMarkers: behaviorMarkers.length > 0 ? behaviorMarkers : DEFAULT_BEHAVIOR_MARKERS,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function categoryMap(values: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(values)) return out;
  for (const value of values as CategoryScore[]) {
    if (value.applicable === false) continue;
    if (typeof value.key === 'string' && typeof value.score === 'number') out[value.key] = value.score;
  }
  return out;
}

function artifactText(row: NormalizedRow): string {
  return JSON.stringify(row.appliedTools ?? []);
}

function behaviorMarkerFired(row: NormalizedRow, markers: string[]): boolean {
  const text = artifactText(row);
  return markers.some(marker => text.includes(marker));
}

function tableToolsApplied(row: NormalizedRow): string[] {
  return row.appliedTools
    .filter(tool => ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'].includes(tool.toolName ?? ''))
    .filter(tool => tool.outcome === 'applied')
    .map(tool => `${tool.toolName}:${tool.source ?? 'unknown'}`);
}

function pacRegressions(row: NormalizedRow): string[] {
  const rules = new Set<string>();
  for (const tool of row.appliedTools) {
    if (typeof tool.details !== 'string') continue;
    for (const match of tool.details.matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
      if (match[1]) rules.add(match[1]);
    }
  }
  return [...rules].sort((a, b) => a.localeCompare(b));
}

function directAppliedMarkerPacRegressions(row: NormalizedRow, markers: string[]): string[] {
  const rules = new Set<string>();
  for (const tool of row.appliedTools) {
    if (tool.outcome !== 'applied' || typeof tool.details !== 'string') continue;
    if (!markers.some(marker => tool.details!.toString().includes(marker))) continue;
    for (const match of tool.details.matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
      if (match[1]) rules.add(match[1]);
    }
  }
  return [...rules].sort((a, b) => a.localeCompare(b));
}

function hasNonTablePacSideEffect(rules: string[]): boolean {
  return rules.some(rule => !rule.startsWith('pdfua.table.'));
}

function timedOut(row: NormalizedRow): boolean {
  const duration = row.durationMs ?? 0;
  return /timeout/i.test(row.error ?? '') || (row.afterScore === 0 && row.afterGrade === '?' && duration >= 295_000);
}

function category(row: NormalizedRow | null, key: string): number | null {
  if (!row) return null;
  return typeof row.categories[key] === 'number' ? row.categories[key]! : null;
}

function delta(after: number | null, before: number | null): number | null {
  return after !== null && before !== null ? after - before : null;
}

function rowKey(row: Pick<NormalizedRow, 'id' | 'file'>): string {
  for (const value of [row.id, row.file]) {
    const match = value.match(/(?:^|[-_/ ])(\d{4})(?:[-_ .]|$)/);
    if (match?.[1]) return match[1];
  }
  return row.id || basename(row.file).replace(/\.pdf$/i, '');
}

export function classifyTableOriginalControlImpact(input: {
  baselineRow: NormalizedRow | null;
  candidateRow: NormalizedRow;
  candidatePath: string;
  behaviorMarkers?: string[];
}): TableOriginalControlImpactRow {
  const markers = input.behaviorMarkers ?? DEFAULT_BEHAVIOR_MARKERS;
  const tableBehaviorMarker = behaviorMarkerFired(input.candidateRow, markers);
  const appliedTableTools = tableToolsApplied(input.candidateRow);
  const pac = pacRegressions(input.candidateRow);
  const directPac = directAppliedMarkerPacRegressions(input.candidateRow, markers);
  const candidateTimedOut = timedOut(input.candidateRow);
  const scoreDelta = delta(input.candidateRow.afterScore, input.baselineRow?.afterScore ?? null);
  const baselineTable = category(input.baselineRow, 'table_markup');
  const candidateTable = category(input.candidateRow, 'table_markup');
  const tableDelta = delta(candidateTable, baselineTable);
  const materialScoreDrop =
    scoreDelta !== null &&
    scoreDelta < 0 &&
    ((input.candidateRow.afterScore ?? 100) < 93 || scoreDelta <= -5);
  const reasons: string[] = [];
  let classification: TableOriginalControlImpactClass = 'stable_or_recovered';

  if (!input.baselineRow) {
    classification = 'missing_baseline';
    reasons.push('candidate row has no baseline counterpart');
  } else if (candidateTimedOut && !timedOut(input.baselineRow)) {
    classification = 'runtime_timeout_regression';
    reasons.push('candidate row timed out while baseline did not');
  } else if (tableBehaviorMarker && hasNonTablePacSideEffect(directPac)) {
    classification = 'direct_table_behavior_non_table_pac_side_effect';
    reasons.push(`non-table PAC regression in applied direct table behavior: ${directPac.join(',')}`);
  } else if (tableBehaviorMarker && materialScoreDrop) {
    classification = 'direct_table_behavior_regressed';
    reasons.push(`score_delta=${scoreDelta}`);
  } else if (tableBehaviorMarker) {
    classification = 'direct_table_behavior_improved_or_stable';
    reasons.push(`score_delta=${scoreDelta ?? 'n/a'}`);
  } else if (materialScoreDrop && appliedTableTools.length > 0 && (tableDelta ?? 0) < 0) {
    classification = 'table_route_changed_without_behavior_marker';
    reasons.push(`score_delta=${scoreDelta}`);
    reasons.push(`table_delta=${tableDelta}`);
    reasons.push('table tools applied, but no configured table behavior marker fired');
  } else if (materialScoreDrop) {
    classification = 'unrelated_route_regression';
    reasons.push(`score_delta=${scoreDelta}`);
    if (candidateTable !== null) reasons.push(`candidate_table_markup=${candidateTable}`);
  } else {
    reasons.push(`score_delta=${scoreDelta ?? 'n/a'}`);
  }

  if (pac.length > 0) reasons.push(`pac_regressions=${pac.join(',')}`);

  return {
    id: rowKey(input.candidateRow),
    file: input.candidateRow.file,
    candidatePath: input.candidatePath,
    baselineScore: input.baselineRow?.afterScore ?? null,
    candidateScore: input.candidateRow.afterScore,
    scoreDelta,
    baselineTableMarkup: baselineTable,
    candidateTableMarkup: candidateTable,
    tableDelta,
    candidateTimedOut,
    tableBehaviorMarkerFired: tableBehaviorMarker,
    tableToolsApplied: appliedTableTools,
    pacRegressions: pac,
    classification,
    reasons: [...new Set(reasons)],
  };
}

export function buildTableOriginalControlImpactReport(input: {
  outDir: string;
  baseline: ArtifactRows;
  candidates: ArtifactRows[];
  behaviorMarkers?: string[];
  now?: Date;
}): TableOriginalControlImpactReport {
  const markers = input.behaviorMarkers ?? DEFAULT_BEHAVIOR_MARKERS;
  const baselineByKey = new Map(input.baseline.rows.map(row => [rowKey(row), row]));
  const rows = input.candidates.flatMap(candidate =>
    candidate.rows.map(row => classifyTableOriginalControlImpact({
      baselineRow: baselineByKey.get(rowKey(row)) ?? null,
      candidateRow: row,
      candidatePath: candidate.path,
      behaviorMarkers: markers,
    })),
  ).sort((a, b) => a.id.localeCompare(b.id) || a.candidatePath.localeCompare(b.candidatePath));

  const byClass = Object.fromEntries(CLASSES.map(rowClass => [rowClass, 0])) as Record<TableOriginalControlImpactClass, number>;
  for (const row of rows) byClass[row.classification] += 1;

  const directBehaviorRows = rows.filter(row => row.tableBehaviorMarkerFired).map(row => row.id);
  const directBehaviorRegressions = rows
    .filter(row => row.classification === 'direct_table_behavior_regressed')
    .map(row => row.id);
  const nonTablePacSideEffectRows = rows
    .filter(row => row.classification === 'direct_table_behavior_non_table_pac_side_effect')
    .map(row => row.id);
  const unrelatedRouteRegressions = rows
    .filter(row => row.classification === 'unrelated_route_regression')
    .map(row => row.id);
  const tableRouteChangedWithoutMarkerRows = rows
    .filter(row => row.classification === 'table_route_changed_without_behavior_marker')
    .map(row => row.id);
  const timeoutRegressions = rows
    .filter(row => row.classification === 'runtime_timeout_regression')
    .map(row => row.id);

  let status: TableOriginalControlImpactDecision = 'insufficient_comparison_evidence';
  let nextLane = 'collect_table_behavior_comparison';
  const reasons: string[] = [];
  if (rows.length > 0) {
    if (directBehaviorRegressions.length > 0 || nonTablePacSideEffectRows.length > 0) {
      status = 'table_behavior_harmed_original_controls';
      nextLane = 'fix_table_side_effect_before_acceptance';
      reasons.push('at least one direct table behavior marker row regressed or exposed a non-table PAC side effect');
    } else if (timeoutRegressions.length > 0 || unrelatedRouteRegressions.length > 0 || tableRouteChangedWithoutMarkerRows.length > 0) {
      status = 'original_gate_blocked_by_unrelated_route';
      nextLane = 'park_or_stabilize_original_route_debt_then_return_to_table_behavior';
      reasons.push('candidate gate failures are not tied to configured direct table behavior markers');
      if (timeoutRegressions.length > 0) reasons.push(`${timeoutRegressions.length} runtime timeout regression row(s)`);
      if (unrelatedRouteRegressions.length > 0) reasons.push(`${unrelatedRouteRegressions.length} unrelated route regression row(s)`);
      if (tableRouteChangedWithoutMarkerRows.length > 0) reasons.push(`${tableRouteChangedWithoutMarkerRows.length} table-route changed row(s) without direct behavior marker`);
    } else {
      status = 'table_impact_clear_return_to_table_proof';
      nextLane = 'strict_object_backed_table_transaction_or_mixed_heading_table_diagnostic';
      reasons.push('no direct table behavior regression or unrelated original-control blocker was found in the supplied comparison');
    }
  }

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    outDir: input.outDir,
    baselinePath: input.baseline.path,
    candidatePaths: input.candidates.map(candidate => candidate.path),
    behaviorMarkers: markers,
    summary: {
      rowComparisons: rows.length,
      byClass,
      directBehaviorRows: [...new Set(directBehaviorRows)].sort((a, b) => a.localeCompare(b)),
      directBehaviorRegressions: [...new Set(directBehaviorRegressions)].sort((a, b) => a.localeCompare(b)),
      nonTablePacSideEffectRows: [...new Set(nonTablePacSideEffectRows)].sort((a, b) => a.localeCompare(b)),
      unrelatedRouteRegressions: [...new Set(unrelatedRouteRegressions)].sort((a, b) => a.localeCompare(b)),
      tableRouteChangedWithoutMarkerRows: [...new Set(tableRouteChangedWithoutMarkerRows)].sort((a, b) => a.localeCompare(b)),
      timeoutRegressions: [...new Set(timeoutRegressions)].sort((a, b) => a.localeCompare(b)),
    },
    decision: { status, nextLane, reasons },
    rows,
  };
}

export function renderTableOriginalControlImpactMarkdown(report: TableOriginalControlImpactReport): string {
  const lines: string[] = [];
  lines.push('# Table Original-Control Impact Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`, '');
  lines.push('## Decision', '');
  lines.push(`- Status: \`${report.decision.status}\``);
  lines.push(`- Next lane: \`${report.decision.nextLane}\``);
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Inputs', '');
  lines.push(`- Baseline: \`${report.baselinePath}\``);
  for (const candidate of report.candidatePaths) lines.push(`- Candidate: \`${candidate}\``);
  lines.push(`- Behavior markers: ${report.behaviorMarkers.map(marker => `\`${marker}\``).join(', ')}`, '');
  lines.push('## Summary', '');
  for (const rowClass of CLASSES) lines.push(`- \`${rowClass}\`: ${report.summary.byClass[rowClass]}`);
  lines.push(`- Direct behavior rows: ${report.summary.directBehaviorRows.join(', ') || 'none'}`);
  lines.push(`- Direct behavior regressions: ${report.summary.directBehaviorRegressions.join(', ') || 'none'}`);
  lines.push(`- Non-table PAC side effects: ${report.summary.nonTablePacSideEffectRows.join(', ') || 'none'}`);
  lines.push(`- Unrelated route regressions: ${report.summary.unrelatedRouteRegressions.join(', ') || 'none'}`);
  lines.push(`- Table route changed without marker: ${report.summary.tableRouteChangedWithoutMarkerRows.join(', ') || 'none'}`);
  lines.push(`- Timeout regressions: ${report.summary.timeoutRegressions.join(', ') || 'none'}`, '');

  for (const rowClass of CLASSES) {
    const rows = report.rows.filter(row => row.classification === rowClass);
    if (rows.length === 0) continue;
    lines.push(`## ${rowClass}`, '');
    for (const row of rows) {
      lines.push(`- \`${row.id}\`: score ${row.baselineScore ?? '?'} -> ${row.candidateScore ?? '?'} (delta ${row.scoreDelta ?? 'n/a'}), table ${row.baselineTableMarkup ?? '?'} -> ${row.candidateTableMarkup ?? '?'}; ${row.reasons.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## Notes', '');
  lines.push('- Read-only diagnostic: no PDFs are analyzed or remediated by this script.');
  lines.push('- Direct table impact is based on configured behavior markers, not filenames, row IDs, or sources.');
  lines.push('- Original-50 validation is still required after behavior changes; this report attributes whether failures are table-lane side effects.');
  return `${lines.join('\n')}\n`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path)).isDirectory();
}

async function loadArtifactRows(path: string): Promise<ArtifactRows> {
  const resolved = resolve(path);
  const jsonPath = await isDirectory(resolved) ? join(resolved, 'remediate.results.json') : resolved;
  const json = await readJson(jsonPath) as { rows?: Array<Record<string, unknown>> };
  const rawRows = Array.isArray(json) ? json as Array<Record<string, unknown>> : json.rows ?? [];
  return {
    path: resolved,
    rows: rawRows.map(row => ({
      id: stringOrNull(row.id) ?? rowKey({ id: '', file: String(row.file ?? row.filename ?? 'unknown') }),
      file: String(row.file ?? row.filename ?? 'unknown'),
      beforeScore: numberOrNull(row.beforeScore),
      afterScore: numberOrNull(row.afterScore),
      afterGrade: stringOrNull(row.afterGrade),
      durationMs: numberOrNull(row.durationMs) ?? numberOrNull(row.totalPipelineMs),
      error: stringOrNull((row.boundedRunner as { errorType?: unknown } | undefined)?.errorType) ?? stringOrNull(row.error),
      categories: categoryMap((row.categoryGap as { after?: unknown } | undefined)?.after ?? row.categoriesAfter ?? row.afterCategories),
      appliedTools: Array.isArray(row.appliedTools) ? row.appliedTools as AppliedTool[] : [],
    })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const baseline = await loadArtifactRows(args.baseline!);
  const candidates = await Promise.all(args.candidates.map(loadArtifactRows));
  const report = buildTableOriginalControlImpactReport({
    outDir: resolve(args.outDir),
    baseline,
    candidates,
    behaviorMarkers: args.behaviorMarkers,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'table-original-control-impact-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'table-original-control-impact-diagnostic.md'), renderTableOriginalControlImpactMarkdown(report), 'utf8');
  console.log(`Decision: ${report.decision.status}`);
  console.log(`Next lane: ${report.decision.nextLane}`);
  console.log(`Wrote ${join(args.outDir, 'table-original-control-impact-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

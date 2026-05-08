#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
} from './pac-target-route-diagnostic.js';

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/figure4702-sequence-repeatability-diagnostic-2026-05-08-r1';
const DEFAULT_ROWS = [
  'figure-4702',
  'structure-3775',
  'long-4516',
  'structure-4438',
  'long-4700',
  'font-4699',
  'fixture-accessible',
  'fixture-inaccessible',
  'figure-4753',
  'figure-4754',
  'font-4035',
  'long-4683',
];

const TABLE_ROWS = new Set(['long-4700', 'font-4699']);
const PARKED_ROUTE_ROWS = new Set(['structure-3775', 'long-4516', 'fixture-inaccessible', 'figure-4754']);
const PARKED_RUNTIME_ROWS = new Set(['structure-4438']);
const NON_PARKED_CONTROL_ROWS = new Set(['fixture-accessible', 'figure-4753', 'font-4035', 'long-4683']);

export type Figure4702SequenceRepeatabilityClassification =
  | 'sequence_stable'
  | 'parked_route_volatility'
  | 'parked_runtime_debt'
  | 'control_regression'
  | 'table_observation_stable'
  | 'needs_behavior_diagnostic';

export type Figure4702SequenceRepeatabilityDecision =
  | 'proceed_to_fixed50'
  | 'blocked_by_sequence_instability'
  | 'blocked_by_false_positive'
  | 'blocked_by_non_parked_control_regression'
  | 'needs_more_evidence';

export interface Figure4702SequenceObservation {
  runDir: string;
  rowId: string;
  score: number | null;
  grade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  error: string | null;
  hardTimeout: boolean;
  sequenceRecovered: boolean;
  falsePositiveApplied: boolean;
  tableAssociationImproved: boolean;
  tableHeaderAssociationBefore: number | null;
  tableHeaderAssociationAfter: number | null;
  dataCellsWithoutHeaderBefore: number | null;
  dataCellsWithoutHeaderAfter: number | null;
  tableCapCount: number;
  pacBlockedTools: string[];
}

export interface Figure4702SequenceComparison {
  leftRun: string;
  rightRun: string;
  leftScore: number | null;
  rightScore: number | null;
  firstDivergence: TimelineDivergence | null;
}

export interface Figure4702SequenceRow {
  rowId: string;
  classification: Figure4702SequenceRepeatabilityClassification;
  scoreRange: { min: number | null; max: number | null };
  reanalyzedScoreRange: { min: number | null; max: number | null };
  observations: Figure4702SequenceObservation[];
  comparisons: Figure4702SequenceComparison[];
  sequenceRecoveredCount: number;
  hardTimeoutCount: number;
  falsePositiveAppliedCount: number;
  tableAssociationImprovedCount: number;
  pacBlockedToolNames: string[];
  firstDivergenceSummary: string | null;
  recommendation: string;
}

export interface Figure4702SequenceRepeatabilityDiagnostic {
  generatedAt: string;
  runDirs: string[];
  rows: Figure4702SequenceRow[];
  summary: {
    decision: Figure4702SequenceRepeatabilityDecision;
    sequenceStableRows: string[];
    parkedRouteVolatilityRows: string[];
    parkedRuntimeDebtRows: string[];
    tableObservationStableRows: string[];
    controlRegressionRows: string[];
    needsBehaviorDiagnosticRows: string[];
    falsePositiveAppliedRows: string[];
    fixed50Allowed: boolean;
  };
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/figure4702-sequence-repeatability-diagnostic.ts --run <dir> [--run <dir>...] [--row <id>...] [--out <dir>]';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function valuesRange(values: Array<number | null>): { min: number | null; max: number | null } {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numbers.length === 0) return { min: null, max: null };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function finalScore(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function finalGrade(row: RemediateBenchmarkRow | null | undefined): string | null {
  return row?.reanalyzedGrade ?? row?.afterGrade ?? null;
}

function hasHardTimeout(row: RemediateBenchmarkRow | null | undefined): boolean {
  const error = stringOrNull(asRecord(row)?.['error'])?.toLowerCase() ?? '';
  if (!error) return false;
  return error.includes('timeout') || error.includes('aborted');
}

function hasSequenceRecovery(row: RemediateBenchmarkRow | null | undefined): boolean {
  return (row?.appliedTools ?? []).some((tool) => {
    if (tool.details?.includes('structure_annotation_sequence_recovered')) return true;
    const parsed = parseDetails(tool.details);
    return parsed?.['note'] === 'structure_annotation_sequence_recovered' ||
      asRecord(parsed?.['sequenceRecovery'])?.['note'] === 'structure_annotation_sequence_recovered';
  });
}

function tableAssociationSummary(row: RemediateBenchmarkRow | null | undefined): {
  improved: boolean;
  headerAssociationBefore: number | null;
  headerAssociationAfter: number | null;
  dataCellsWithoutHeaderBefore: number | null;
  dataCellsWithoutHeaderAfter: number | null;
} {
  let improved = false;
  let headerAssociationBefore: number | null = null;
  let headerAssociationAfter: number | null = null;
  let dataCellsWithoutHeaderBefore: number | null = null;
  let dataCellsWithoutHeaderAfter: number | null = null;
  for (const tool of row?.appliedTools ?? []) {
    if (tool.toolName !== 'set_table_header_cells') continue;
    const parsed = parseDetails(tool.details);
    const invariants = asRecord(parsed?.['invariants']);
    const before = numberOrNull(invariants?.['headerAssociationMissingCountBefore']);
    const after = numberOrNull(invariants?.['headerAssociationMissingCountAfter']);
    const tdBefore = numberOrNull(invariants?.['dataCellsWithoutHeaderCountBefore']);
    const tdAfter = numberOrNull(invariants?.['dataCellsWithoutHeaderCountAfter']);
    if (before != null) headerAssociationBefore = headerAssociationBefore == null ? before : Math.max(headerAssociationBefore, before);
    if (after != null) headerAssociationAfter = headerAssociationAfter == null ? after : Math.min(headerAssociationAfter, after);
    if (tdBefore != null) dataCellsWithoutHeaderBefore = dataCellsWithoutHeaderBefore == null ? tdBefore : Math.max(dataCellsWithoutHeaderBefore, tdBefore);
    if (tdAfter != null) dataCellsWithoutHeaderAfter = dataCellsWithoutHeaderAfter == null ? tdAfter : Math.min(dataCellsWithoutHeaderAfter, tdAfter);
    if ((before != null && after != null && after < before) || (tdBefore != null && tdAfter != null && tdAfter < tdBefore)) improved = true;
  }
  return {
    improved,
    headerAssociationBefore,
    headerAssociationAfter,
    dataCellsWithoutHeaderBefore,
    dataCellsWithoutHeaderAfter,
  };
}

function scoreCapCount(row: RemediateBenchmarkRow | null | undefined, rulePrefix: string): number {
  return (row?.reanalyzedScoreCapsApplied ?? row?.afterScoreCapsApplied ?? [])
    .filter(cap => cap.reason.includes(rulePrefix))
    .length;
}

function falsePositiveApplied(row: RemediateBenchmarkRow | null | undefined): boolean {
  const rawSummary = asRecord(row?.remediationOutcomeSummary);
  if (rawSummary?.['falsePositiveApplied'] === true) return true;
  return (row?.appliedTools ?? []).some((tool) => {
    const parsed = parseDetails(tool.details);
    return parsed?.['falsePositiveApplied'] === true;
  });
}

function pacBlockedTools(row: RemediateBenchmarkRow | null | undefined): string[] {
  const out = new Set<string>();
  for (const tool of row?.appliedTools ?? []) {
    if (tool.outcome !== 'rejected') continue;
    if (tool.details?.includes('pac_rule_regressed(')) out.add(tool.toolName);
    const parsed = parseDetails(tool.details);
    if (parsed?.['pacRuleRegression'] || parsed?.['pacRuleRegressions']) out.add(tool.toolName);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function observation(runDir: string, rowId: string, row: RemediateBenchmarkRow | null | undefined): Figure4702SequenceObservation {
  const table = tableAssociationSummary(row);
  return {
    runDir,
    rowId,
    score: row?.afterScore ?? null,
    grade: row?.afterGrade ?? null,
    reanalyzedScore: row?.reanalyzedScore ?? null,
    reanalyzedGrade: row?.reanalyzedGrade ?? null,
    error: stringOrNull(asRecord(row)?.['error']),
    hardTimeout: hasHardTimeout(row),
    sequenceRecovered: hasSequenceRecovery(row),
    falsePositiveApplied: falsePositiveApplied(row),
    tableAssociationImproved: table.improved,
    tableHeaderAssociationBefore: table.headerAssociationBefore,
    tableHeaderAssociationAfter: table.headerAssociationAfter,
    dataCellsWithoutHeaderBefore: table.dataCellsWithoutHeaderBefore,
    dataCellsWithoutHeaderAfter: table.dataCellsWithoutHeaderAfter,
    tableCapCount: scoreCapCount(row, 'pdfua.table.'),
    pacBlockedTools: pacBlockedTools(row),
  };
}

function rowComparisons(runRows: Array<{ runDir: string; row: RemediateBenchmarkRow | null }>): Figure4702SequenceComparison[] {
  const out: Figure4702SequenceComparison[] = [];
  for (let left = 0; left < runRows.length; left += 1) {
    for (let right = left + 1; right < runRows.length; right += 1) {
      const a = runRows[left];
      const b = runRows[right];
      out.push({
        leftRun: a.runDir,
        rightRun: b.runDir,
        leftScore: finalScore(a.row),
        rightScore: finalScore(b.row),
        firstDivergence: a.row && b.row ? firstTimelineDivergence(toolTimeline(a.row), toolTimeline(b.row)) : null,
      });
    }
  }
  return out;
}

function cleanScoresAtLeast(observations: Figure4702SequenceObservation[], floor: number): boolean {
  return observations.length > 0 &&
    observations.every(obs => !obs.hardTimeout && (obs.reanalyzedScore ?? obs.score ?? -1) >= floor);
}

function scoreSpread(observations: Figure4702SequenceObservation[]): number {
  const range = valuesRange(observations.map(obs => obs.reanalyzedScore ?? obs.score));
  return range.min == null || range.max == null ? 0 : range.max - range.min;
}

function classifyRow(input: {
  rowId: string;
  observations: Figure4702SequenceObservation[];
  comparisons: Figure4702SequenceComparison[];
}): Pick<Figure4702SequenceRow, 'classification' | 'recommendation'> {
  if (input.observations.some(obs => obs.falsePositiveApplied)) {
    return {
      classification: 'control_regression',
      recommendation: 'False-positive-applied evidence blocks repeatability acceptance.',
    };
  }
  if (PARKED_RUNTIME_ROWS.has(input.rowId) && input.observations.some(obs => obs.hardTimeout)) {
    return {
      classification: 'parked_runtime_debt',
      recommendation: 'Known runtime/checkpoint debt; does not block this repeatability decision unless new eligible checkpoint evidence appears.',
    };
  }
  if (input.rowId === 'figure-4702') {
    if (cleanScoresAtLeast(input.observations, 80) && input.observations.every(obs => obs.sequenceRecovered)) {
      return {
        classification: 'sequence_stable',
        recommendation: 'Structure-annotation sequence repeated at or above the B floor; fixed-50 validation is allowed if controls remain clean or parked.',
      };
    }
    return {
      classification: 'needs_behavior_diagnostic',
      recommendation: 'Sequence recovery did not repeat at the required floor; do not run fixed-50.',
    };
  }
  if (TABLE_ROWS.has(input.rowId)) {
    if (input.rowId === 'font-4699' && cleanScoresAtLeast(input.observations, 90)) {
      return {
        classification: 'table_observation_stable',
        recommendation: 'Small-table association control remains A-grade.',
      };
    }
    if (input.rowId === 'long-4700' && input.observations.some(obs => obs.tableAssociationImproved) && cleanScoresAtLeast(input.observations, 70)) {
      return {
        classification: 'table_observation_stable',
        recommendation: 'Many-table association debt reduction remains stable enough for observation.',
      };
    }
    return {
      classification: 'needs_behavior_diagnostic',
      recommendation: 'Table observation row did not preserve expected score/evidence movement.',
    };
  }
  if (PARKED_ROUTE_ROWS.has(input.rowId)) {
    const hasVolatility = scoreSpread(input.observations) >= 8 ||
      input.comparisons.some(comp => comp.firstDivergence?.classification === 'upstream_state_drift' || comp.firstDivergence?.classification === 'same_state_outcome_drift');
    const hasKnownLowRoute = input.observations.some(obs => (obs.reanalyzedScore ?? obs.score ?? 100) < 90);
    if (hasVolatility || hasKnownLowRoute) {
      return {
        classification: 'parked_route_volatility',
        recommendation: 'Known route/reanalysis volatility row; classify separately from sequence-probe causality.',
      };
    }
    return {
      classification: 'sequence_stable',
      recommendation: 'Parked-observation row was clean in these repeats.',
    };
  }
  if (NON_PARKED_CONTROL_ROWS.has(input.rowId)) {
    if (cleanScoresAtLeast(input.observations, 90)) {
      return {
        classification: 'sequence_stable',
        recommendation: 'Non-parked control stayed A-grade.',
      };
    }
    return {
      classification: 'control_regression',
      recommendation: 'Non-parked control regressed; diagnose before fixed-50.',
    };
  }
  if (input.observations.some(obs => obs.error || obs.score == null)) {
    return {
      classification: 'needs_behavior_diagnostic',
      recommendation: 'Missing or errored row data requires focused diagnosis.',
    };
  }
  return {
    classification: 'sequence_stable',
    recommendation: 'No repeatability blocker detected.',
  };
}

function summarizeDivergence(divergence: TimelineDivergence | null): string | null {
  if (!divergence) return null;
  const left = divergence.left ? `${divergence.left.toolName}:${divergence.left.outcome}:${divergence.left.stateSignatureBefore ?? 'no-state'}` : 'none';
  const right = divergence.right ? `${divergence.right.toolName}:${divergence.right.outcome}:${divergence.right.stateSignatureBefore ?? 'no-state'}` : 'none';
  return `${divergence.reason}/${divergence.classification} [${left} vs ${right}]`;
}

function firstNonNullDivergence(comparisons: Figure4702SequenceComparison[]): string | null {
  for (const comparison of comparisons) {
    const rendered = summarizeDivergence(comparison.firstDivergence);
    if (rendered) return `${comparison.leftRun} vs ${comparison.rightRun}: ${rendered}`;
  }
  return null;
}

export function buildFigure4702SequenceRepeatabilityDiagnostic(input: {
  runDirs: string[];
  runs: Array<{ runDir: string; rows: RemediateBenchmarkRow[] }>;
  rowIds: string[];
  generatedAt?: string;
}): Figure4702SequenceRepeatabilityDiagnostic {
  const rows = input.rowIds.map((rowId) => {
    const runRows = input.runs.map(run => ({
      runDir: run.runDir,
      row: run.rows.find(row => row.id === rowId) ?? null,
    }));
    const observations = runRows.map(run => observation(run.runDir, rowId, run.row));
    const comparisons = rowComparisons(runRows);
    const classified = classifyRow({ rowId, observations, comparisons });
    const pacBlockedToolNames = [...new Set(observations.flatMap(obs => obs.pacBlockedTools))].sort((a, b) => a.localeCompare(b));
    return {
      rowId,
      classification: classified.classification,
      scoreRange: valuesRange(observations.map(obs => obs.score)),
      reanalyzedScoreRange: valuesRange(observations.map(obs => obs.reanalyzedScore)),
      observations,
      comparisons,
      sequenceRecoveredCount: observations.filter(obs => obs.sequenceRecovered).length,
      hardTimeoutCount: observations.filter(obs => obs.hardTimeout).length,
      falsePositiveAppliedCount: observations.filter(obs => obs.falsePositiveApplied).length,
      tableAssociationImprovedCount: observations.filter(obs => obs.tableAssociationImproved).length,
      pacBlockedToolNames,
      firstDivergenceSummary: firstNonNullDivergence(comparisons),
      recommendation: classified.recommendation,
    };
  }).sort((a, b) => {
    const left = DEFAULT_ROWS.indexOf(a.rowId);
    const right = DEFAULT_ROWS.indexOf(b.rowId);
    if (left !== -1 || right !== -1) return (left === -1 ? Number.MAX_SAFE_INTEGER : left) - (right === -1 ? Number.MAX_SAFE_INTEGER : right);
    return a.rowId.localeCompare(b.rowId);
  });
  const byClass = (classification: Figure4702SequenceRepeatabilityClassification): string[] => rows
    .filter(row => row.classification === classification)
    .map(row => row.rowId)
    .sort((a, b) => a.localeCompare(b));
  const falsePositiveAppliedRows = rows
    .filter(row => row.falsePositiveAppliedCount > 0)
    .map(row => row.rowId)
    .sort((a, b) => a.localeCompare(b));
  const sequenceRow = rows.find(row => row.rowId === 'figure-4702');
  const tableRows = rows.filter(row => TABLE_ROWS.has(row.rowId));
  const controlRegressions = byClass('control_regression');
  const needsBehavior = byClass('needs_behavior_diagnostic');
  let decision: Figure4702SequenceRepeatabilityDecision = 'proceed_to_fixed50';
  if (falsePositiveAppliedRows.length > 0) decision = 'blocked_by_false_positive';
  else if (sequenceRow?.classification !== 'sequence_stable') decision = 'blocked_by_sequence_instability';
  else if (controlRegressions.length > 0) decision = 'blocked_by_non_parked_control_regression';
  else if (needsBehavior.some(rowId => !PARKED_ROUTE_ROWS.has(rowId) && !PARKED_RUNTIME_ROWS.has(rowId))) decision = 'needs_more_evidence';
  else if (tableRows.some(row => row.classification !== 'table_observation_stable')) decision = 'needs_more_evidence';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDirs: input.runDirs,
    rows,
    summary: {
      decision,
      sequenceStableRows: byClass('sequence_stable'),
      parkedRouteVolatilityRows: byClass('parked_route_volatility'),
      parkedRuntimeDebtRows: byClass('parked_runtime_debt'),
      tableObservationStableRows: byClass('table_observation_stable'),
      controlRegressionRows: controlRegressions,
      needsBehaviorDiagnosticRows: needsBehavior,
      falsePositiveAppliedRows,
      fixed50Allowed: decision === 'proceed_to_fixed50',
    },
  };
}

export function renderFigure4702SequenceRepeatabilityMarkdown(report: Figure4702SequenceRepeatabilityDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Figure-4702 Sequence Repeatability Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('Runs:');
  for (const run of report.runDirs) lines.push(`- \`${run}\``);
  lines.push('', '## Summary', '');
  lines.push(`- Decision: \`${report.summary.decision}\``);
  lines.push(`- Fixed-50 allowed: \`${report.summary.fixed50Allowed}\``);
  lines.push(`- Sequence stable: ${report.summary.sequenceStableRows.join(', ') || 'none'}`);
  lines.push(`- Parked route volatility: ${report.summary.parkedRouteVolatilityRows.join(', ') || 'none'}`);
  lines.push(`- Parked runtime debt: ${report.summary.parkedRuntimeDebtRows.join(', ') || 'none'}`);
  lines.push(`- Table observations stable: ${report.summary.tableObservationStableRows.join(', ') || 'none'}`);
  lines.push(`- Control regressions: ${report.summary.controlRegressionRows.join(', ') || 'none'}`);
  lines.push(`- Needs behavior diagnostic: ${report.summary.needsBehaviorDiagnosticRows.join(', ') || 'none'}`);
  lines.push(`- False-positive-applied rows: ${report.summary.falsePositiveAppliedRows.join(', ') || 'none'}`, '');
  for (const row of report.rows) {
    lines.push(`## ${row.rowId}`, '');
    lines.push(`- Classification: \`${row.classification}\``);
    lines.push(`- Score range: \`${row.scoreRange.min ?? 'n/a'}-${row.scoreRange.max ?? 'n/a'}\`; reanalyzed: \`${row.reanalyzedScoreRange.min ?? 'n/a'}-${row.reanalyzedScoreRange.max ?? 'n/a'}\``);
    lines.push(`- Sequence recovered: \`${row.sequenceRecoveredCount}\`; hard timeouts: \`${row.hardTimeoutCount}\`; false-positive-applied: \`${row.falsePositiveAppliedCount}\``);
    lines.push(`- Table association improvements: \`${row.tableAssociationImprovedCount}\`; PAC-blocked tools: ${row.pacBlockedToolNames.join(', ') || 'none'}`);
    lines.push(`- First divergence: ${row.firstDivergenceSummary ?? 'none'}`);
    lines.push(`- Recommendation: ${row.recommendation}`, '');
    lines.push('| Run | Score | Reanalyzed | Seq | Timeout | Table debt | Table caps | PAC blocked | Error |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const obs of row.observations) {
      const tableDebt = obs.tableHeaderAssociationBefore != null || obs.tableHeaderAssociationAfter != null
        ? `${obs.tableHeaderAssociationBefore ?? 'n/a'} -> ${obs.tableHeaderAssociationAfter ?? 'n/a'}; TD ${obs.dataCellsWithoutHeaderBefore ?? 'n/a'} -> ${obs.dataCellsWithoutHeaderAfter ?? 'n/a'}`
        : 'none';
      lines.push(`| \`${obs.runDir}\` | \`${obs.score ?? 'n/a'}/${obs.grade ?? 'n/a'}\` | \`${obs.reanalyzedScore ?? 'n/a'}/${obs.reanalyzedGrade ?? 'n/a'}\` | \`${obs.sequenceRecovered}\` | \`${obs.hardTimeout}\` | \`${tableDebt}\` | \`${obs.tableCapCount}\` | ${obs.pacBlockedTools.join(', ') || 'none'} | ${obs.error ? `\`${obs.error}\`` : 'none'} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runDirs: string[] = [];
  const rowIds: string[] = [];
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run') runDirs.push(args[++index] ?? '');
    else if (arg === '--row') rowIds.push(args[++index] ?? '');
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const selectedRuns = runDirs.filter(Boolean);
  if (selectedRuns.length < 2) throw new Error(`At least two --run directories are required.\n${usage()}`);
  const selectedRows = (rowIds.length ? rowIds : DEFAULT_ROWS).filter(Boolean);
  const runs = await Promise.all(selectedRuns.map(async runDir => ({
    runDir,
    rows: (await loadBenchmarkRowsFromRunDir(runDir)).remediateResults,
  })));
  const report = buildFigure4702SequenceRepeatabilityDiagnostic({
    runDirs: selectedRuns,
    runs,
    rowIds: selectedRows,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'figure4702-sequence-repeatability-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'figure4702-sequence-repeatability-diagnostic.md'), renderFigure4702SequenceRepeatabilityMarkdown(report), 'utf8');
  console.log(`Wrote figure-4702 sequence repeatability diagnostic to ${outDir}`);
  console.log(`Decision: ${report.summary.decision}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

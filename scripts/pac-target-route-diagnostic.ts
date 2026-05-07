#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { AppliedRemediationTool, CategoryKey } from '../src/types.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { parseRuntimeTimeoutTrace, type RuntimeTimeoutTraceSummary } from './pac-runtime-tail-diagnostic.js';

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-target-route-diagnostic';

export interface ToolTimelineEvent {
  index: number;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  note: string | null;
  pacReason: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  categoryScoresBefore: Partial<Record<CategoryKey, number>>;
  categoryScoresAfter: Partial<Record<CategoryKey, number>>;
}

export interface TimelineDivergence {
  index: number;
  left: ToolTimelineEvent | null;
  right: ToolTimelineEvent | null;
  reason: string;
}

export interface FixtureRouteClassification {
  classification: 'route_volatility' | 'same_route' | 'missing_evidence';
  goodScore: number | null;
  badScore: number | null;
  goodLinkRepairOutcome: string | null;
  badLinkRepairOutcome: string | null;
  firstDivergence: TimelineDivergence | null;
  recommendation: string;
}

export interface StructureCheckpointClassification {
  classification: 'eligible_checkpoint_available' | 'no_eligible_checkpoint_available' | 'missing_timeout_trace';
  floor: number;
  bestCheckpointScore: number | null;
  bestEligibleScore: number | null;
  checkpointCount: number;
  lastEligibilityReason: string | null;
  recommendation: string;
}

export interface RowDriftClassification {
  rowId: string;
  classification: 'route_drift' | 'final_reanalysis_drop' | 'same_route' | 'missing_evidence';
  goodScore: number | null;
  badScore: number | null;
  goodReanalyzedScore: number | null;
  badReanalyzedScore: number | null;
  firstDivergence: TimelineDivergence | null;
  finalReanalysisDrop: number | null;
  recommendation: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details || !details.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function categoryMap(value: unknown): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  const record = asRecord(value);
  if (!record) return out;
  for (const [key, score] of Object.entries(record)) {
    if (typeof score === 'number') out[key as CategoryKey] = score;
  }
  return out;
}

function pacReasonFromDetails(details: Record<string, unknown> | null): string | null {
  const note = stringOrNull(details?.['note']);
  if (note?.startsWith('pac_rule_regressed(')) return note;
  const raw = stringOrNull(details?.['raw']);
  if (raw?.startsWith('pac_rule_regressed(')) return raw;
  return null;
}

export function toolTimeline(row: Pick<RemediateBenchmarkRow, 'appliedTools'>): ToolTimelineEvent[] {
  return (row.appliedTools ?? []).map((tool: AppliedRemediationTool, index) => {
    const parsed = parseDetails(tool.details);
    const debug = asRecord(parsed?.['debug']);
    const replayState = asRecord(debug?.['replayState']);
    return {
      index,
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
      delta: typeof tool.delta === 'number' ? tool.delta : null,
      note: stringOrNull(parsed?.['note']) ?? stringOrNull(parsed?.['raw']),
      pacReason: pacReasonFromDetails(parsed),
      stateSignatureBefore: stringOrNull(replayState?.['stateSignatureBefore']),
      stateSignatureAfter: stringOrNull(replayState?.['stateSignatureAfter']),
      categoryScoresBefore: categoryMap(replayState?.['categoryScoresBefore']),
      categoryScoresAfter: categoryMap(replayState?.['categoryScoresAfter']),
    };
  });
}

export function firstTimelineDivergence(left: ToolTimelineEvent[], right: ToolTimelineEvent[]): TimelineDivergence | null {
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const a = left[index] ?? null;
    const b = right[index] ?? null;
    if (!a || !b) return { index, left: a, right: b, reason: 'tool_missing' };
    if (a.toolName !== b.toolName) return { index, left: a, right: b, reason: 'tool_name_changed' };
    if (a.outcome !== b.outcome) return { index, left: a, right: b, reason: 'tool_outcome_changed' };
    if (a.stateSignatureBefore && b.stateSignatureBefore && a.stateSignatureBefore !== b.stateSignatureBefore) {
      return { index, left: a, right: b, reason: 'state_signature_changed' };
    }
    if (a.scoreAfter !== b.scoreAfter) return { index, left: a, right: b, reason: 'score_after_changed' };
  }
  return null;
}

function linkRepairOutcome(events: ToolTimelineEvent[]): string | null {
  const row = events.find(event => event.toolName === 'repair_native_link_structure');
  return row ? row.outcome : null;
}

export function classifyFixtureRoute(input: {
  goodRow?: RemediateBenchmarkRow | null;
  badRow?: RemediateBenchmarkRow | null;
}): FixtureRouteClassification {
  if (!input.goodRow || !input.badRow) {
    return {
      classification: 'missing_evidence',
      goodScore: null,
      badScore: null,
      goodLinkRepairOutcome: null,
      badLinkRepairOutcome: null,
      firstDivergence: null,
      recommendation: 'Collect both a good and bad fixture-inaccessible run before changing behavior.',
    };
  }
  const goodTimeline = toolTimeline(input.goodRow);
  const badTimeline = toolTimeline(input.badRow);
  const goodLink = linkRepairOutcome(goodTimeline);
  const badLink = linkRepairOutcome(badTimeline);
  const firstDivergence = firstTimelineDivergence(goodTimeline, badTimeline);
  const routeVolatile = (input.goodRow.afterScore ?? 0) > (input.badRow.afterScore ?? 0) &&
    goodLink === 'applied' &&
    badLink !== 'applied';
  return {
    classification: routeVolatile ? 'route_volatility' : 'same_route',
    goodScore: input.goodRow.afterScore ?? null,
    badScore: input.badRow.afterScore ?? null,
    goodLinkRepairOutcome: goodLink,
    badLinkRepairOutcome: badLink,
    firstDivergence,
    recommendation: routeVolatile
      ? 'Investigate repair_native_link_structure acceptance after orphan-MCID cleanup; do not add a broad PAC exception.'
      : 'No link-repair route divergence is proven from the supplied runs.',
  };
}

export function classifyStructureCheckpoint(input: {
  trace?: RuntimeTimeoutTraceSummary | null;
  floor?: number;
}): StructureCheckpointClassification {
  const floor = input.floor ?? 90;
  const history = input.trace?.verifiedCheckpointHistory ?? [];
  if (!input.trace) {
    return {
      classification: 'missing_timeout_trace',
      floor,
      bestCheckpointScore: null,
      bestEligibleScore: null,
      checkpointCount: 0,
      lastEligibilityReason: null,
      recommendation: 'Run a focused structure-4438 repeat with timeout traces enabled.',
    };
  }
  const scores = history.map(row => row.score);
  const eligibleScores = history.filter(row => row.eligible).map(row => row.score);
  const bestCheckpointScore = scores.length > 0 ? Math.max(...scores) : input.trace.lastVerifiedCheckpointScore;
  const bestEligibleScore = eligibleScores.length > 0 ? Math.max(...eligibleScores) : null;
  const hasEligible = bestEligibleScore != null && bestEligibleScore >= floor;
  return {
    classification: hasEligible ? 'eligible_checkpoint_available' : 'no_eligible_checkpoint_available',
    floor,
    bestCheckpointScore: bestCheckpointScore ?? null,
    bestEligibleScore,
    checkpointCount: history.length,
    lastEligibilityReason: input.trace.lastVerifiedCheckpointEligibilityReason,
    recommendation: hasEligible
      ? 'Identify and stabilize the route that produced the eligible checkpoint.'
      : 'Keep hard-timeout behavior for structure-4438; no eligible checkpoint is available at the current floor.',
  };
}

export function classifyRowDrift(input: {
  rowId: string;
  goodRow?: RemediateBenchmarkRow | null;
  badRow?: RemediateBenchmarkRow | null;
}): RowDriftClassification {
  if (!input.goodRow || !input.badRow) {
    return {
      rowId: input.rowId,
      classification: 'missing_evidence',
      goodScore: null,
      badScore: null,
      goodReanalyzedScore: null,
      badReanalyzedScore: null,
      firstDivergence: null,
      finalReanalysisDrop: null,
      recommendation: 'Collect both good and bad target rows before changing remediation behavior.',
    };
  }
  const firstDivergence = firstTimelineDivergence(toolTimeline(input.goodRow), toolTimeline(input.badRow));
  const badFinalDrop = (
    typeof input.badRow.afterScore === 'number' &&
    typeof input.badRow.reanalyzedScore === 'number'
  )
    ? input.badRow.afterScore - input.badRow.reanalyzedScore
    : null;
  const classification = firstDivergence
    ? 'route_drift'
    : badFinalDrop != null && badFinalDrop >= 5
      ? 'final_reanalysis_drop'
      : 'same_route';
  return {
    rowId: input.rowId,
    classification,
    goodScore: input.goodRow.afterScore ?? null,
    badScore: input.badRow.afterScore ?? null,
    goodReanalyzedScore: input.goodRow.reanalyzedScore ?? null,
    badReanalyzedScore: input.badRow.reanalyzedScore ?? null,
    firstDivergence,
    finalReanalysisDrop: badFinalDrop,
    recommendation: classification === 'route_drift'
      ? 'Do not add a behavior guard until the same-state divergence is proven safe on controls.'
      : classification === 'final_reanalysis_drop'
        ? 'Inspect final reanalysis evidence before accepting a preserved in-run state.'
        : 'No route drift is proven from the supplied rows.',
  };
}

async function loadRows(runDir: string): Promise<RemediateBenchmarkRow[]> {
  const loaded = await loadBenchmarkRowsFromRunDir(runDir);
  return loaded.remediateResults;
}

async function loadTrace(runDir: string, rowId: string): Promise<RuntimeTimeoutTraceSummary | null> {
  try {
    const raw = JSON.parse(await readFile(join(runDir, 'runtime-timeouts', `${rowId}.json`), 'utf8')) as unknown;
    return parseRuntimeTimeoutTrace(raw);
  } catch {
    return null;
  }
}

function rowById(rows: RemediateBenchmarkRow[], id: string): RemediateBenchmarkRow | null {
  return rows.find(row => row.id === id) ?? null;
}

function renderTool(event: ToolTimelineEvent | null): string {
  if (!event) return 'none';
  return `${event.toolName}:${event.outcome}:${event.scoreAfter ?? 'n/a'}:${event.stateSignatureBefore ?? 'no-state'}`;
}

function markdown(report: {
  goodRun: string;
  badRun: string;
  structureRun: string;
  fixture: FixtureRouteClassification;
  structure: StructureCheckpointClassification;
  structure4076: RowDriftClassification;
}): string {
  const lines: string[] = [];
  lines.push('# PAC Target Route Diagnostic', '');
  lines.push(`Good fixture run: \`${report.goodRun}\``);
  lines.push(`Bad/candidate run: \`${report.badRun}\``);
  lines.push(`Structure run: \`${report.structureRun}\``, '');
  lines.push('## Fixture Inaccessible', '');
  lines.push(`- Classification: \`${report.fixture.classification}\``);
  lines.push(`- Scores: good \`${report.fixture.goodScore ?? 'n/a'}\`, bad \`${report.fixture.badScore ?? 'n/a'}\``);
  lines.push(`- Link repair outcomes: good \`${report.fixture.goodLinkRepairOutcome ?? 'missing'}\`, bad \`${report.fixture.badLinkRepairOutcome ?? 'missing'}\``);
  if (report.fixture.firstDivergence) {
    lines.push(`- First divergence: \`${report.fixture.firstDivergence.reason}\` at index \`${report.fixture.firstDivergence.index}\``);
    lines.push(`- Good event: \`${renderTool(report.fixture.firstDivergence.left)}\``);
    lines.push(`- Bad event: \`${renderTool(report.fixture.firstDivergence.right)}\``);
  }
  lines.push(`- Recommendation: ${report.fixture.recommendation}`, '');
  lines.push('## Structure 4438', '');
  lines.push(`- Classification: \`${report.structure.classification}\``);
  lines.push(`- Floor: \`${report.structure.floor}\``);
  lines.push(`- Checkpoint count: \`${report.structure.checkpointCount}\``);
  lines.push(`- Best checkpoint score: \`${report.structure.bestCheckpointScore ?? 'n/a'}\``);
  lines.push(`- Best eligible score: \`${report.structure.bestEligibleScore ?? 'n/a'}\``);
  lines.push(`- Last eligibility reason: \`${report.structure.lastEligibilityReason ?? 'n/a'}\``);
  lines.push(`- Recommendation: ${report.structure.recommendation}`, '');
  lines.push('## Structure 4076 Drift', '');
  lines.push(`- Classification: \`${report.structure4076.classification}\``);
  lines.push(`- Scores: good \`${report.structure4076.goodScore ?? 'n/a'}\` / reanalyzed \`${report.structure4076.goodReanalyzedScore ?? 'n/a'}\`, bad \`${report.structure4076.badScore ?? 'n/a'}\` / reanalyzed \`${report.structure4076.badReanalyzedScore ?? 'n/a'}\``);
  lines.push(`- Final reanalysis drop: \`${report.structure4076.finalReanalysisDrop ?? 'n/a'}\``);
  if (report.structure4076.firstDivergence) {
    lines.push(`- First divergence: \`${report.structure4076.firstDivergence.reason}\` at index \`${report.structure4076.firstDivergence.index}\``);
    lines.push(`- Good event: \`${renderTool(report.structure4076.firstDivergence.left)}\``);
    lines.push(`- Bad event: \`${renderTool(report.structure4076.firstDivergence.right)}\``);
  }
  lines.push(`- Recommendation: ${report.structure4076.recommendation}`, '');
  return lines.join('\n');
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main(): Promise<void> {
  const goodRun = argValue('--good') ?? 'Output/experiment-corpus-baseline/run-trace-driven-final-reanalysis-target-2026-05-06-r2';
  const badRun = argValue('--bad') ?? 'Output/experiment-corpus-baseline/run-verified-checkpoint-timeout-recovery-target-2026-05-07-r1';
  const structureRun = argValue('--structure') ?? badRun;
  const out = argValue('--out') ?? DEFAULT_OUT;
  const [goodRows, badRows, trace] = await Promise.all([
    loadRows(goodRun),
    loadRows(badRun),
    loadTrace(structureRun, 'structure-4438'),
  ]);
  const fixture = classifyFixtureRoute({
    goodRow: rowById(goodRows, 'fixture-inaccessible'),
    badRow: rowById(badRows, 'fixture-inaccessible'),
  });
  const structure = classifyStructureCheckpoint({ trace, floor: 90 });
  const structure4076 = classifyRowDrift({
    rowId: 'structure-4076',
    goodRow: rowById(goodRows, 'structure-4076'),
    badRow: rowById(badRows, 'structure-4076'),
  });
  const report = {
    generatedAt: new Date().toISOString(),
    goodRun,
    badRun,
    structureRun,
    fixture,
    structure,
    structure4076,
  };
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-target-route-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-target-route-diagnostic.md'), markdown(report), 'utf8');
  console.log(`Wrote PAC target route diagnostic to ${outDir}`);
  console.log(`Fixture: ${fixture.classification}; structure-4438: ${structure.classification}; structure-4076: ${structure4076.classification}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

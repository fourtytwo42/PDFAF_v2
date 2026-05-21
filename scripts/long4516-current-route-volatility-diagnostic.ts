#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REFERENCE =
  '/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json';
const DEFAULT_CURRENT =
  '/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-calibration-2026-05-21-r1/baseline_report.json';
const DEFAULT_REPEAT =
  '/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-regression-repeat-2026-05-21-r1/run-r1/baseline_report.json';
const DEFAULT_OUT =
  '/mnt/pdf-review/pdfaf-validation/long4516-current-route-volatility-2026-05-21-r1';
const DEFAULT_ROW_MATCH = '4516';

type Current4516Classification =
  | 'repeatable_low_route_current_blocker'
  | 'known_runtime_timeout_debt'
  | 'route_variance_no_safe_selector'
  | 'checkpoint_return_candidate'
  | 'no_safe_behavior_path';

type DecisionStatus =
  | 'park_tree_cap_acceptance_on_4516_route_debt'
  | 'park_acceptance_on_runtime_timeout_debt'
  | 'investigate_checkpoint_return'
  | 'keep_diagnostic_only';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  stage?: number | null;
  round?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  delta?: number | null;
  durationMs?: number | null;
  details?: unknown;
}

interface BaselineReportRow {
  id?: string;
  file?: string;
  filename?: string;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  afterDeterministicScore?: number | null;
  afterDeterministicGrade?: string | null;
  error?: string | null;
  durationMs?: number | null;
  wallRemediateMs?: number | null;
  falsePositiveApplied?: number | null;
  categoriesAfter?: CategoryScore[];
  reanalyzedCategoryScores?: CategoryScore[];
  afterCategoryScores?: CategoryScore[];
  categoryGap?: {
    after?: CategoryScore[];
    before?: CategoryScore[];
  };
  appliedTools?: AppliedTool[];
}

interface BaselineReport {
  generatedAt?: string;
  inputDir?: string;
  rows?: BaselineReportRow[];
  remediateResults?: BaselineReportRow[];
}

interface ReplaySignals {
  checkerVisibleFigureCount: number | null;
  checkerVisibleFigureAltCount: number | null;
  extractedFigureCount: number | null;
  treeFigureCount: number | null;
  treeFigureMissingForExtractedFigures: boolean | null;
  directCellUnderTableCount: number | null;
  malformedTableCount: number | null;
  misplacedCellCount: number | null;
  orphanMcidCount: number | null;
}

interface ReplaySummary {
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryScoresBefore: Record<string, number>;
  categoryScoresAfter: Record<string, number>;
  detectionSignalsBefore: ReplaySignals;
  detectionSignalsAfter: ReplaySignals;
  targetRef: string | null;
}

interface ToolSummary {
  toolName: string;
  outcome: string;
  stage: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  durationMs: number | null;
  rawReason: string | null;
  note: string | null;
  targetRef: string | null;
  replay: ReplaySummary | null;
}

interface TreeCapEvidence {
  treeFigureMissingForExtractedFigures: boolean | null;
  checkerVisibleFigureCount: number | null;
  checkerVisibleFigureAltCount: number | null;
  extractedFigureCount: number | null;
  treeFigureCount: number | null;
  fullCheckerVisibleAltCoverage: boolean;
  treeCapScoringCandidate: boolean;
}

interface RunSummary {
  label: 'reference' | 'current' | 'repeat';
  path: string;
  present: boolean;
  file: string | null;
  beforeScore: number | null;
  beforeGrade: string | null;
  score: number | null;
  grade: string | null;
  deterministicScore: number | null;
  deterministicGrade: string | null;
  hardTimeout: boolean;
  error: string | null;
  durationMs: number | null;
  falsePositiveApplied: number;
  appliedToolCount: number;
  outcomeSummary: Array<{ outcome: string; count: number }>;
  categoryScores: Record<string, number>;
  firstStateSignature: string | null;
  lastStateSignature: string | null;
  scoreMovingAppliedTools: ToolSummary[];
  repeatedNoGainTools: ToolSummary[];
  treeCapEvidence: TreeCapEvidence;
  toolTimeline: ToolSummary[];
}

export interface Long4516CurrentRouteVolatilityReport {
  generatedAt: string;
  rowMatch: string;
  decision: {
    status: DecisionStatus;
    recommendation: string;
    reasons: string[];
  };
  classification: Current4516Classification;
  evidence: {
    referenceScore: number | null;
    currentScore: number | null;
    repeatScore: number | null;
    currentDropFromReference: number | null;
    repeatDropFromReference: number | null;
    repeatableLowCurrentRoute: boolean;
    anyHardTimeout: boolean;
    anyTreeCapScoringCandidate: boolean;
    referenceLooksAnalyzerOptimistic: boolean;
    sharedReferenceRepeatInitialState: boolean;
    noSafeSelectorVisible: boolean;
  };
  runs: {
    reference: RunSummary;
    current: RunSummary;
    repeat: RunSummary;
  };
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/long4516-current-route-volatility-diagnostic.ts [options]',
    '  --reference <baseline_report.json>',
    '  --current <baseline_report.json>',
    '  --repeat <baseline_report.json>',
    '  --row <substring>',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    return recordOrNull(JSON.parse(details) as unknown);
  } catch {
    return null;
  }
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  return recordOrNull(record?.[key]);
}

function categoryRecord(value: unknown): Record<string, number> {
  const record = recordOrNull(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}

function signals(value: unknown): ReplaySignals {
  const record = recordOrNull(value);
  return {
    checkerVisibleFigureCount: numberOrNull(record?.checkerVisibleFigureCount),
    checkerVisibleFigureAltCount: numberOrNull(record?.checkerVisibleFigureAltCount),
    extractedFigureCount: numberOrNull(record?.extractedFigureCount),
    treeFigureCount: numberOrNull(record?.treeFigureCount),
    treeFigureMissingForExtractedFigures: booleanOrNull(record?.treeFigureMissingForExtractedFigures),
    directCellUnderTableCount: numberOrNull(record?.directCellUnderTableCount),
    malformedTableCount: numberOrNull(record?.malformedTableCount),
    misplacedCellCount: numberOrNull(record?.misplacedCellCount),
    orphanMcidCount: numberOrNull(record?.orphanMcidCount),
  };
}

function replaySummary(details: unknown): ReplaySummary | null {
  const replay = nested(nested(parseDetails(details), 'debug'), 'replayState');
  if (!replay) return null;
  return {
    stateSignatureBefore: stringOrNull(replay.stateSignatureBefore),
    stateSignatureAfter: stringOrNull(replay.stateSignatureAfter),
    scoreBefore: numberOrNull(replay.scoreBefore),
    scoreAfter: numberOrNull(replay.scoreAfter),
    categoryScoresBefore: categoryRecord(replay.categoryScoresBefore),
    categoryScoresAfter: categoryRecord(replay.categoryScoresAfter),
    detectionSignalsBefore: signals(replay.detectionSignalsBefore),
    detectionSignalsAfter: signals(replay.detectionSignalsAfter),
    targetRef: stringOrNull(replay.targetRef),
  };
}

function rawReason(details: unknown): string | null {
  const parsed = parseDetails(details);
  return stringOrNull(parsed?.raw) ?? null;
}

function note(details: unknown): string | null {
  const parsed = parseDetails(details);
  return stringOrNull(parsed?.note) ?? stringOrNull(parsed?.outcome) ?? null;
}

function invariantTargetRef(details: unknown): string | null {
  const parsed = parseDetails(details);
  return stringOrNull(nested(parsed, 'invariants')?.targetRef);
}

function summarizeTool(tool: AppliedTool): ToolSummary {
  const replay = replaySummary(tool.details);
  return {
    toolName: tool.toolName ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: numberOrNull(tool.stage),
    scoreBefore: numberOrNull(tool.scoreBefore),
    scoreAfter: numberOrNull(tool.scoreAfter),
    delta: numberOrNull(tool.delta),
    durationMs: numberOrNull(tool.durationMs),
    rawReason: rawReason(tool.details),
    note: note(tool.details),
    targetRef: invariantTargetRef(tool.details) ?? replay?.targetRef ?? null,
    replay,
  };
}

function rowsFrom(report: BaselineReport): BaselineReportRow[] {
  if (Array.isArray(report.rows)) return report.rows;
  if (Array.isArray(report.remediateResults)) return report.remediateResults;
  return [];
}

function rowName(row: BaselineReportRow): string {
  return row.file ?? row.filename ?? row.id ?? '';
}

function findRow(report: BaselineReport, rowMatch: string): BaselineReportRow | undefined {
  const lowered = rowMatch.toLowerCase();
  return rowsFrom(report).find(row => rowName(row).toLowerCase().includes(lowered));
}

function categoriesFrom(row: BaselineReportRow | undefined): Record<string, number> {
  const categories =
    row?.categoryGap?.after ??
    row?.categoriesAfter ??
    row?.reanalyzedCategoryScores ??
    row?.afterCategoryScores ??
    [];
  return Object.fromEntries(
    categories
      .filter(category => category.applicable !== false && typeof category.key === 'string' && typeof category.score === 'number')
      .map(category => [category.key as string, category.score as number]),
  );
}

function outcomeSummary(tools: ToolSummary[]): Array<{ outcome: string; count: number }> {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    counts.set(tool.outcome, (counts.get(tool.outcome) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([outcome, count]) => ({ outcome, count }));
}

function scoreFor(row: BaselineReportRow | undefined): number | null {
  return numberOrNull(row?.reanalyzedScore) ?? numberOrNull(row?.afterScore);
}

function gradeFor(row: BaselineReportRow | undefined): string | null {
  return stringOrNull(row?.reanalyzedGrade) ?? stringOrNull(row?.afterGrade);
}

function hardTimeout(row: BaselineReportRow | undefined): boolean {
  if (!row) return false;
  return scoreFor(row) === null && /timeout|aborted due to timeout/i.test(row.error ?? '');
}

function bestTreeSignals(row: BaselineReportRow | undefined, tools: ToolSummary[]): ReplaySignals {
  const candidates: ReplaySignals[] = [];
  for (const tool of tools) {
    if (tool.replay) {
      candidates.push(tool.replay.detectionSignalsBefore, tool.replay.detectionSignalsAfter);
    }
  }
  const usable = candidates.filter(item => item.checkerVisibleFigureCount !== null || item.extractedFigureCount !== null);
  if (usable.length === 0) {
    const categories = categoriesFrom(row);
    void categories;
    return signals(null);
  }
  return usable.sort((a, b) =>
    (b.checkerVisibleFigureAltCount ?? -1) - (a.checkerVisibleFigureAltCount ?? -1) ||
    (b.checkerVisibleFigureCount ?? -1) - (a.checkerVisibleFigureCount ?? -1) ||
    (b.extractedFigureCount ?? -1) - (a.extractedFigureCount ?? -1)
  )[0] ?? signals(null);
}

function treeCapEvidence(row: BaselineReportRow | undefined, tools: ToolSummary[]): TreeCapEvidence {
  const best = bestTreeSignals(row, tools);
  const fullCheckerVisibleAltCoverage =
    best.checkerVisibleFigureCount !== null &&
    best.checkerVisibleFigureCount > 0 &&
    best.checkerVisibleFigureAltCount === best.checkerVisibleFigureCount;
  return {
    treeFigureMissingForExtractedFigures: best.treeFigureMissingForExtractedFigures,
    checkerVisibleFigureCount: best.checkerVisibleFigureCount,
    checkerVisibleFigureAltCount: best.checkerVisibleFigureAltCount,
    extractedFigureCount: best.extractedFigureCount,
    treeFigureCount: best.treeFigureCount,
    fullCheckerVisibleAltCoverage,
    treeCapScoringCandidate: fullCheckerVisibleAltCoverage && best.treeFigureMissingForExtractedFigures === true,
  };
}

function summarizeRun(
  label: RunSummary['label'],
  path: string,
  report: BaselineReport,
  rowMatch: string,
): RunSummary {
  const row = findRow(report, rowMatch);
  const tools = (row?.appliedTools ?? []).map(summarizeTool);
  const firstReplay = tools.find(tool => tool.replay)?.replay ?? null;
  const lastReplay = [...tools].reverse().find(tool => tool.replay)?.replay ?? null;
  return {
    label,
    path,
    present: Boolean(row),
    file: row ? rowName(row) : null,
    beforeScore: numberOrNull(row?.beforeScore),
    beforeGrade: stringOrNull(row?.beforeGrade),
    score: scoreFor(row),
    grade: gradeFor(row),
    deterministicScore: numberOrNull(row?.afterDeterministicScore),
    deterministicGrade: stringOrNull(row?.afterDeterministicGrade),
    hardTimeout: hardTimeout(row),
    error: stringOrNull(row?.error),
    durationMs: numberOrNull(row?.durationMs) ?? numberOrNull(row?.wallRemediateMs),
    falsePositiveApplied: numberOrNull(row?.falsePositiveApplied) ?? 0,
    appliedToolCount: tools.length,
    outcomeSummary: outcomeSummary(tools),
    categoryScores: categoriesFrom(row),
    firstStateSignature: firstReplay?.stateSignatureBefore ?? null,
    lastStateSignature: lastReplay?.stateSignatureAfter ?? null,
    scoreMovingAppliedTools: tools.filter(tool =>
      tool.outcome === 'applied' &&
      tool.scoreBefore !== null &&
      tool.scoreAfter !== null &&
      tool.scoreAfter > tool.scoreBefore
    ),
    repeatedNoGainTools: tools.filter(tool =>
      ['rejected', 'no_effect'].includes(tool.outcome) ||
      (tool.scoreBefore !== null && tool.scoreAfter !== null && tool.scoreAfter <= tool.scoreBefore)
    ),
    treeCapEvidence: treeCapEvidence(row, tools),
    toolTimeline: tools,
  };
}

function scoreDrop(reference: number | null, candidate: number | null): number | null {
  return reference !== null && candidate !== null ? reference - candidate : null;
}

function referenceLooksAnalyzerOptimistic(reference: RunSummary, current: RunSummary, repeat: RunSummary): boolean {
  const replayCategoryAfter = (run: RunSummary, key: string): number | null => {
    const values = run.toolTimeline
      .map(tool => tool.replay?.categoryScoresAfter[key])
      .filter((value): value is number => typeof value === 'number');
    return values.length > 0 ? Math.max(...values) : null;
  };
  const referenceAlt = reference.categoryScores.alt_text ?? replayCategoryAfter(reference, 'alt_text');
  const referenceTable = reference.categoryScores.table_markup ?? replayCategoryAfter(reference, 'table_markup');
  const currentAlt = current.categoryScores.alt_text ?? null;
  const repeatAlt = repeat.categoryScores.alt_text ?? null;
  const repeatTable = repeat.categoryScores.table_markup ?? null;
  return Boolean(
    reference.score !== null &&
    reference.score >= 80 &&
    reference.appliedToolCount <= 3 &&
    (referenceAlt ?? 0) >= 80 &&
    (referenceTable ?? 0) >= 100 &&
    ((currentAlt !== null && currentAlt <= 20) || (repeatAlt !== null && repeatAlt <= 20)) &&
    (repeatTable === null || repeatTable <= 20),
  );
}

export function buildLong4516CurrentRouteVolatilityReport(input: {
  rowMatch?: string;
  referencePath: string;
  currentPath: string;
  repeatPath: string;
  referenceReport: BaselineReport;
  currentReport: BaselineReport;
  repeatReport: BaselineReport;
  generatedAt?: string;
}): Long4516CurrentRouteVolatilityReport {
  const rowMatch = input.rowMatch ?? DEFAULT_ROW_MATCH;
  const reference = summarizeRun('reference', input.referencePath, input.referenceReport, rowMatch);
  const current = summarizeRun('current', input.currentPath, input.currentReport, rowMatch);
  const repeat = summarizeRun('repeat', input.repeatPath, input.repeatReport, rowMatch);
  const currentDropFromReference = scoreDrop(reference.score, current.score);
  const repeatDropFromReference = scoreDrop(reference.score, repeat.score);
  const repeatableLowCurrentRoute = Boolean(
    reference.score !== null &&
    reference.score >= 80 &&
    current.score !== null &&
    repeat.score !== null &&
    current.score <= 65 &&
    repeat.score <= 65 &&
    (currentDropFromReference ?? 0) >= 20 &&
    (repeatDropFromReference ?? 0) >= 20,
  );
  const anyHardTimeout = current.hardTimeout || repeat.hardTimeout;
  const anyTreeCapScoringCandidate =
    reference.treeCapEvidence.treeCapScoringCandidate ||
    current.treeCapEvidence.treeCapScoringCandidate ||
    repeat.treeCapEvidence.treeCapScoringCandidate;
  const sharedReferenceRepeatInitialState = Boolean(
    reference.firstStateSignature &&
    repeat.firstStateSignature &&
    reference.firstStateSignature === repeat.firstStateSignature,
  );
  const analyzerOptimistic = referenceLooksAnalyzerOptimistic(reference, current, repeat);
  const noSafeSelectorVisible = Boolean(
    repeatableLowCurrentRoute &&
    !anyTreeCapScoringCandidate &&
    !current.scoreMovingAppliedTools.some(tool => tool.scoreAfter !== null && tool.scoreAfter >= 80) &&
    !repeat.scoreMovingAppliedTools.some(tool => tool.scoreAfter !== null && tool.scoreAfter >= 80),
  );

  let classification: Current4516Classification = 'no_safe_behavior_path';
  let status: DecisionStatus = 'keep_diagnostic_only';
  const reasons: string[] = [];
  let recommendation =
    'Keep this diagnostic-only; do not change scoring, routing, checkpoint floors, PAC gates, or timeout policy from this evidence.';

  if (anyHardTimeout) {
    classification = 'known_runtime_timeout_debt';
    status = 'park_acceptance_on_runtime_timeout_debt';
    reasons.push('At least one current artifact is a hard timeout, so this is runtime-tail debt before scoring/remediation behavior.');
    recommendation = 'Treat the row as runtime-tail debt; only revisit behavior with a floor-safe verified checkpoint or a same-state no-gain loop.';
  } else if (repeatableLowCurrentRoute) {
    classification = 'repeatable_low_route_current_blocker';
    status = 'park_tree_cap_acceptance_on_4516_route_debt';
    reasons.push(`Current and repeat scores both stay at or below 65 while the reference route reached ${reference.score ?? 'n/a'}.`);
    if (!anyTreeCapScoringCandidate) {
      reasons.push('The current and repeat evidence do not match the figure/alt tree-cap scoring predicate.');
    }
    if (analyzerOptimistic) {
      reasons.push('The reference B-grade route looks analyzer/route-optimistic: metadata-only repair coincided with high alt/table scores that did not repeat.');
    }
    recommendation =
      'Do not accept the provisional tree-cap calibration as original-50 clean yet. Park acceptance on the independent 4516 route/analyzer debt, or open a dedicated current-code 4516 stabilization stage with fresh targeted controls.';
  } else if (reference.score !== null && current.score !== null && Math.abs(reference.score - current.score) >= 20) {
    classification = 'route_variance_no_safe_selector';
    reasons.push('Reference/current movement is large, but the repeat evidence does not prove a stable score-moving selector.');
  }

  const currentOrRepeatReachedFloorSafeTool =
    current.scoreMovingAppliedTools.some(tool => tool.scoreAfter !== null && tool.scoreAfter >= 85) ||
    repeat.scoreMovingAppliedTools.some(tool => tool.scoreAfter !== null && tool.scoreAfter >= 85);
  if (!anyHardTimeout && currentOrRepeatReachedFloorSafeTool) {
    classification = 'checkpoint_return_candidate';
    status = 'investigate_checkpoint_return';
    reasons.push('A current score-moving tool reached a floor-safe state that may need checkpoint-return analysis.');
    recommendation =
      'Inspect timeout/checkpoint traces before behavior work; do not lower floors or return stale checkpoints without PAC-safe verification.';
  }

  if (reasons.length === 0) {
    reasons.push('No repeatable current-code score-moving behavior candidate is visible from the compared artifacts.');
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    rowMatch,
    decision: { status, recommendation, reasons },
    classification,
    evidence: {
      referenceScore: reference.score,
      currentScore: current.score,
      repeatScore: repeat.score,
      currentDropFromReference,
      repeatDropFromReference,
      repeatableLowCurrentRoute,
      anyHardTimeout,
      anyTreeCapScoringCandidate,
      referenceLooksAnalyzerOptimistic: analyzerOptimistic,
      sharedReferenceRepeatInitialState,
      noSafeSelectorVisible,
    },
    runs: { reference, current, repeat },
  };
}

function formatScore(score: number | null, grade: string | null): string {
  return score === null ? 'n/a' : `${score}/${grade ?? 'n/a'}`;
}

function categorySummary(categories: Record<string, number>): string {
  const keys = ['heading_structure', 'alt_text', 'table_markup', 'reading_order', 'title_language', 'pdf_ua_compliance'];
  return keys
    .map(key => `${key}=${categories[key] ?? 'n/a'}`)
    .join(', ');
}

function toolList(tools: ToolSummary[]): string {
  if (tools.length === 0) return 'none';
  return tools
    .slice(0, 8)
    .map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`)
    .join('<br>');
}

export function renderLong4516CurrentRouteVolatilityMarkdown(
  report: Long4516CurrentRouteVolatilityReport,
): string {
  const lines: string[] = [];
  lines.push('# Long-4516 Current Route Volatility Diagnostic', '');
  lines.push('Diagnostic-only comparison of existing benchmark JSON. It does not analyze PDFs, remediate PDFs, call PAC/POC/ODL/Java/semantic AI, write remediated PDFs, or change production behavior.', '');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Recommendation: ${report.decision.recommendation}`);
  lines.push(`- Reference score: \`${formatScore(report.evidence.referenceScore, report.runs.reference.grade)}\``);
  lines.push(`- Current score: \`${formatScore(report.evidence.currentScore, report.runs.current.grade)}\``);
  lines.push(`- Focused repeat score: \`${formatScore(report.evidence.repeatScore, report.runs.repeat.grade)}\``);
  lines.push(`- Repeatable low current route: \`${report.evidence.repeatableLowCurrentRoute}\``);
  lines.push(`- Any tree-cap scoring candidate: \`${report.evidence.anyTreeCapScoringCandidate}\``);
  lines.push(`- Reference looks analyzer optimistic: \`${report.evidence.referenceLooksAnalyzerOptimistic}\``);
  lines.push(`- Shared reference/repeat initial state: \`${report.evidence.sharedReferenceRepeatInitialState}\``);
  lines.push('');
  lines.push('## Reasons', '');
  for (const reason of report.decision.reasons) {
    lines.push(`- ${reason}`);
  }
  lines.push('', '## Run Comparison', '');
  lines.push('| Run | File | Score | Duration | Tools | Categories | Tree-Cap Candidate | Score-Moving Tools |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- | --- | --- |');
  for (const run of [report.runs.reference, report.runs.current, report.runs.repeat]) {
    lines.push(`| ${run.label} | ${basename(run.file ?? run.path)} | ${formatScore(run.score, run.grade)} | ${run.durationMs ?? 'n/a'} | ${run.appliedToolCount} | ${categorySummary(run.categoryScores)} | ${run.treeCapEvidence.treeCapScoringCandidate} | ${toolList(run.scoreMovingAppliedTools)} |`);
  }
  lines.push('', '## Current/Repeat No-Gain And Rejected Tools', '');
  for (const run of [report.runs.current, report.runs.repeat]) {
    lines.push(`### ${run.label}`, '');
    lines.push(toolList(run.repeatedNoGainTools), '');
  }
  return `${lines.join('\n')}\n`;
}

async function loadReport(path: string): Promise<BaselineReport> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as BaselineReport;
}

export async function writeLong4516CurrentRouteVolatilityReport(input: {
  referencePath?: string;
  currentPath?: string;
  repeatPath?: string;
  rowMatch?: string;
  outDir?: string;
}): Promise<Long4516CurrentRouteVolatilityReport> {
  const referencePath = input.referencePath ?? DEFAULT_REFERENCE;
  const currentPath = input.currentPath ?? DEFAULT_CURRENT;
  const repeatPath = input.repeatPath ?? DEFAULT_REPEAT;
  const outDir = input.outDir ?? DEFAULT_OUT;
  const [referenceReport, currentReport, repeatReport] = await Promise.all([
    loadReport(referencePath),
    loadReport(currentPath),
    loadReport(repeatPath),
  ]);
  const report = buildLong4516CurrentRouteVolatilityReport({
    rowMatch: input.rowMatch,
    referencePath,
    currentPath,
    repeatPath,
    referenceReport,
    currentReport,
    repeatReport,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'long4516-current-route-volatility-diagnostic.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(outDir, 'long4516-current-route-volatility-diagnostic.md'),
    renderLong4516CurrentRouteVolatilityMarkdown(report),
    'utf8',
  );
  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let referencePath = DEFAULT_REFERENCE;
  let currentPath = DEFAULT_CURRENT;
  let repeatPath = DEFAULT_REPEAT;
  let rowMatch = DEFAULT_ROW_MATCH;
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--reference' && value) {
      referencePath = value;
      index += 1;
    } else if (arg === '--current' && value) {
      currentPath = value;
      index += 1;
    } else if (arg === '--repeat' && value) {
      repeatPath = value;
      index += 1;
    } else if (arg === '--row' && value) {
      rowMatch = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }

  const report = await writeLong4516CurrentRouteVolatilityReport({
    referencePath,
    currentPath,
    repeatPath,
    rowMatch,
    outDir,
  });
  console.log(`Wrote long-4516 current route volatility diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

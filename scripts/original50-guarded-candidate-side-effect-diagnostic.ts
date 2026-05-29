#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;

type SideEffectFamily =
  | 'reading_order_category_regression'
  | 'table_header_pac_regression'
  | 'figure_alt_pac_regression'
  | 'other_pac_regression'
  | 'category_regression'
  | 'unknown';

export type GuardedCandidateClassification =
  | 'accepted_reference_same_state_context_divergence'
  | 'structure_stable_analysis_count_drift'
  | 'pac_count_increment_without_score_drop'
  | 'real_side_effect_needs_cleanup'
  | 'no_behavior_ready';

export type GuardedCandidateDecision =
  | 'diagnose_acceptance_context_determinism'
  | 'diagnose_analysis_count_drift'
  | 'diagnose_pac_count_attribution'
  | 'plan_cleanup_transaction_proof'
  | 'no_behavior_ready';

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  stage?: number | null;
  round?: number | null;
  source?: string | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  durationMs?: number | null;
  details?: unknown;
}

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface BaselineRow {
  id?: string;
  file?: string;
  filename?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterDeterministicScore?: number | null;
  afterDeterministicGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  durationMs?: number | null;
  falsePositiveApplied?: number | null;
  falsePositiveAppliedCount?: number | null;
  categoryGap?: { after?: CategoryScore[] };
  categoriesAfter?: CategoryScore[];
  afterCategoryScores?: CategoryScore[];
  reanalyzedCategoryScores?: CategoryScore[];
  appliedTools?: AppliedTool[] | null;
}

interface BaselineReport {
  rows?: BaselineRow[];
  remediateResults?: BaselineRow[];
}

interface ParsedDetails {
  reason: string | null;
  pacRuleRegressions: Array<{
    ruleId: string;
    category: string | null;
    beforeStatus: string | null;
    afterStatus: string | null;
    beforeCount: number | null;
    afterCount: number | null;
  }>;
  stageRegressions: string[];
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryScoresBefore: Record<string, number>;
  categoryScoresAfter: Record<string, number>;
  detectionSignalsBefore: Record<string, number | boolean | string | null>;
  detectionSignalsAfter: Record<string, number | boolean | string | null>;
}

interface NormalizedTool extends ParsedDetails {
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  durationMs: number | null;
}

const COMMITTED_OUTCOMES = new Set(['applied', 'no_effect']);

interface NormalizedRow {
  key: string;
  file: string;
  score: number | null;
  grade: string | null;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  tools: NormalizedTool[];
  firstStateSignature: string | null;
  lastStateSignature: string | null;
}

interface ReferenceInput {
  label: string;
  path: string;
  report: BaselineReport;
}

export interface GuardedCandidateAttempt {
  rowKey: string;
  file: string;
  toolName: string;
  outcome: string;
  stage: number | null;
  reason: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  sideEffectFamilies: SideEffectFamily[];
  pacRuleRegressions: ParsedDetails['pacRuleRegressions'];
  stageRegressions: string[];
  categoryDeltas: Record<string, number>;
  signalDeltas: Record<string, { before: number | boolean | string | null; after: number | boolean | string | null }>;
  matchingAcceptedReferences: Array<{
    label: string;
    score: number | null;
    grade: string | null;
    matchKind: 'final_state' | 'tool_after_state';
    toolName: string | null;
    outcome: string | null;
  }>;
  classification: GuardedCandidateClassification;
  recommendedNext: string;
}

export interface GuardedCandidateRow {
  key: string;
  file: string;
  gateScore: number | null;
  gateGrade: string | null;
  bestReferenceScore: number | null;
  bestReferenceLabel: string | null;
  highBlockedAttemptCount: number;
  classifications: Record<GuardedCandidateClassification, number>;
  sideEffectFamilies: Record<SideEffectFamily, number>;
  attempts: GuardedCandidateAttempt[];
}

export interface GuardedCandidateDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  inputs: {
    gate: string;
    references: Array<{ label: string; path: string }>;
  };
  summary: {
    rowCount: number;
    highBlockedAttemptCount: number;
    classifications: Record<GuardedCandidateClassification, number>;
    sideEffectFamilies: Record<SideEffectFamily, number>;
  };
  decision: {
    status: GuardedCandidateDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: GuardedCandidateRow[];
}

interface Args {
  gate: string;
  references: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
}

const CLASSIFICATIONS: GuardedCandidateClassification[] = [
  'accepted_reference_same_state_context_divergence',
  'structure_stable_analysis_count_drift',
  'pac_count_increment_without_score_drop',
  'real_side_effect_needs_cleanup',
  'no_behavior_ready',
];

const SIDE_EFFECT_FAMILIES: SideEffectFamily[] = [
  'reading_order_category_regression',
  'table_header_pac_regression',
  'figure_alt_pac_regression',
  'other_pac_regression',
  'category_regression',
  'unknown',
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-guarded-candidate-side-effect-diagnostic.ts --gate <baseline_report.json> --reference <label=baseline_report.json> [options]

Options:
  --row <id>             Restrict to row key substring. Repeatable.
  --target-score <n>     Minimum rejected candidate replay score. Default ${DEFAULT_TARGET_SCORE}.
  --out <dir>            Output directory. Default ${DEFAULT_OUT_ROOT}/original50-guarded-candidate-side-effect-diagnostic-<timestamp>.

This script reads existing benchmark JSON only. It does not analyze PDFs, remediate PDFs, or write remediated files.`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    gate: '',
    references: [],
    rows: [],
    outDir: '',
    targetScore: DEFAULT_TARGET_SCORE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--gate' && next) {
      args.gate = next;
      index += 1;
    } else if (arg === '--reference' && next) {
      const eq = next.indexOf('=');
      if (eq <= 0) throw new Error(`Invalid --reference value: ${next}`);
      args.references.push({ label: next.slice(0, eq), path: next.slice(eq + 1) });
      index += 1;
    } else if (arg === '--row' && next) {
      args.rows.push(next);
      index += 1;
    } else if (arg === '--target-score' && next) {
      args.targetScore = Number(next);
      index += 1;
    } else if (arg === '--out' && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!args.gate) throw new Error('Missing --gate');
  if (args.references.length === 0) throw new Error('At least one --reference is required');
  if (!Number.isFinite(args.targetScore)) throw new Error(`Invalid --target-score: ${args.targetScore}`);
  if (!args.outDir) {
    args.outDir = join(DEFAULT_OUT_ROOT, `original50-guarded-candidate-side-effect-diagnostic-${timestampSlug()}`);
  }
  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function rowsOf(report: BaselineReport): BaselineRow[] {
  return Array.isArray(report.rows) ? report.rows : Array.isArray(report.remediateResults) ? report.remediateResults : [];
}

function rowFile(row: BaselineRow): string {
  return row.file ?? row.filename ?? row.id ?? '';
}

function rowKey(row: BaselineRow): string {
  const file = rowFile(row);
  const match = file.match(/\b(\d{4})\b/);
  return match?.[1] ?? row.id ?? file;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numericMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(asRecord(value))) {
    if (typeof val === 'number' && Number.isFinite(val)) out[key] = val;
  }
  return out;
}

function signalMap(value: unknown): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const [key, val] of Object.entries(asRecord(value))) {
    if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string' || val === null) out[key] = val;
  }
  return out;
}

function parseDetails(details: unknown): ParsedDetails {
  let parsed: Record<string, unknown> = {};
  if (typeof details === 'string' && details.trim()) {
    try {
      parsed = JSON.parse(details) as Record<string, unknown>;
    } catch {
      parsed = { raw: details };
    }
  } else if (details && typeof details === 'object') {
    parsed = details as Record<string, unknown>;
  }

  const debug = asRecord(parsed.debug);
  const replayState = asRecord(debug.replayState);
  const pacRuleRegressions = Array.isArray(parsed.pacRuleRegressions)
    ? parsed.pacRuleRegressions.map(item => {
      const obj = asRecord(item);
      return {
        ruleId: String(obj.ruleId ?? ''),
        category: typeof obj.category === 'string' ? obj.category : null,
        beforeStatus: typeof obj.beforeStatus === 'string' ? obj.beforeStatus : null,
        afterStatus: typeof obj.afterStatus === 'string' ? obj.afterStatus : null,
        beforeCount: asNumber(obj.beforeCount),
        afterCount: asNumber(obj.afterCount),
      };
    }).filter(item => item.ruleId.length > 0)
    : [];

  const explicitReason =
    typeof parsed.note === 'string' ? parsed.note
      : typeof parsed.raw === 'string' ? parsed.raw
        : typeof parsed.reason === 'string' ? parsed.reason
          : typeof parsed.outcome === 'string' ? parsed.outcome
            : null;

  const reasonText = [
    explicitReason,
    ...pacRuleRegressions.map(regression => `pac_rule_regressed(${regression.ruleId})`),
  ].filter((item): item is string => Boolean(item)).join(' ');
  const stageRegressions = [...reasonText.matchAll(/stage_regressed_category\(([^)]+)\)/g)]
    .flatMap(match => match[1]?.split(',') ?? [])
    .map(item => item.trim())
    .filter(Boolean);

  return {
    reason: explicitReason,
    pacRuleRegressions,
    stageRegressions,
    stateSignatureBefore: typeof replayState.stateSignatureBefore === 'string' ? replayState.stateSignatureBefore : null,
    stateSignatureAfter: typeof replayState.stateSignatureAfter === 'string' ? replayState.stateSignatureAfter : null,
    scoreBefore: asNumber(replayState.scoreBefore),
    scoreAfter: asNumber(replayState.scoreAfter),
    categoryScoresBefore: numericMap(replayState.categoryScoresBefore),
    categoryScoresAfter: numericMap(replayState.categoryScoresAfter),
    detectionSignalsBefore: signalMap(replayState.detectionSignalsBefore),
    detectionSignalsAfter: signalMap(replayState.detectionSignalsAfter),
  };
}

function categories(row: BaselineRow): Record<string, number> {
  const list = row.categoryGap?.after ?? row.categoriesAfter ?? row.afterCategoryScores ?? row.reanalyzedCategoryScores ?? [];
  const out: Record<string, number> = {};
  for (const item of list) {
    if (item.key && typeof item.score === 'number') out[item.key] = item.score;
  }
  return out;
}

function normalizeTool(tool: AppliedTool): NormalizedTool {
  const parsed = parseDetails(tool.details);
  return {
    ...parsed,
    toolName: tool.toolName ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    source: typeof tool.source === 'string' ? tool.source : null,
    durationMs: typeof tool.durationMs === 'number' ? tool.durationMs : null,
    scoreBefore: parsed.scoreBefore ?? (typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null),
    scoreAfter: parsed.scoreAfter ?? (typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null),
  };
}

function normalizeRow(row: BaselineRow): NormalizedRow {
  const tools = (row.appliedTools ?? []).map(normalizeTool);
  const committedTools = tools.filter(tool => COMMITTED_OUTCOMES.has(tool.outcome));
  const score = asNumber(row.afterScore) ?? asNumber(row.afterDeterministicScore) ?? asNumber(row.reanalyzedScore);
  const grade = row.afterGrade ?? row.afterDeterministicGrade ?? row.reanalyzedGrade ?? null;
  return {
    key: rowKey(row),
    file: rowFile(row),
    score,
    grade,
    falsePositiveApplied: asNumber(row.falsePositiveApplied) ?? asNumber(row.falsePositiveAppliedCount) ?? 0,
    categories: categories(row),
    tools,
    firstStateSignature: committedTools.find(tool => tool.stateSignatureBefore)?.stateSignatureBefore ?? null,
    lastStateSignature: [...committedTools].reverse().find(tool => tool.stateSignatureAfter)?.stateSignatureAfter ?? null,
  };
}

function rowMatches(row: NormalizedRow, keys: string[]): boolean {
  if (keys.length === 0) return true;
  return keys.some(key => row.key === key || row.file.includes(key));
}

function categoryDeltas(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Record<string, number> = {};
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (typeof b === 'number' && typeof a === 'number' && b !== a) out[key] = a - b;
  }
  return out;
}

function signalDeltas(before: Record<string, number | boolean | string | null>, after: Record<string, number | boolean | string | null>): Record<string, { before: number | boolean | string | null; after: number | boolean | string | null }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Record<string, { before: number | boolean | string | null; after: number | boolean | string | null }> = {};
  for (const key of keys) {
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (b !== a) out[key] = { before: b, after: a };
  }
  return out;
}

function sideEffectFamilies(tool: NormalizedTool): SideEffectFamily[] {
  const families = new Set<SideEffectFamily>();
  for (const regression of tool.pacRuleRegressions) {
    if (regression.ruleId === 'pdfua.table.header_association_present') families.add('table_header_pac_regression');
    else if (regression.ruleId === 'pdfua.figure.alt_present') families.add('figure_alt_pac_regression');
    else families.add('other_pac_regression');
  }
  for (const regression of tool.stageRegressions) {
    if (regression.startsWith('reading_order:')) families.add('reading_order_category_regression');
    else families.add('category_regression');
  }
  if (families.size === 0) families.add('unknown');
  return [...families];
}

function structureStableWithAnalysisCountDrift(tool: NormalizedTool): boolean {
  const categoryDelta = categoryDeltas(tool.categoryScoresBefore, tool.categoryScoresAfter);
  const signalDelta = signalDeltas(tool.detectionSignalsBefore, tool.detectionSignalsAfter);
  const readingDropped = (categoryDelta.reading_order ?? 0) < 0;
  const structuralSignalsStable = [
    'treeHeadingCount',
    'headingTreeDepth',
    'structureTreeDepth',
    'orphanMcidCount',
    'directCellUnderTableCount',
    'malformedTableCount',
    'misplacedCellCount',
    'annotationOrderRiskCount',
    'annotationStructParentRiskCount',
    'linkAnnotationsMissingStructure',
    'linkAnnotationsMissingStructParent',
  ].every(key => !Object.prototype.hasOwnProperty.call(signalDelta, key));
  const extractionCountChanged = [
    'extractedHeadingCount',
    'extractedFigureCount',
    'checkerVisibleFigureCount',
    'checkerVisibleFigureAltCount',
  ].some(key => Object.prototype.hasOwnProperty.call(signalDelta, key));
  return readingDropped && structuralSignalsStable && extractionCountChanged;
}

function pacIncrementWithoutScoreDrop(tool: NormalizedTool): boolean {
  if (tool.pacRuleRegressions.length === 0) return false;
  const deltas = categoryDeltas(tool.categoryScoresBefore, tool.categoryScoresAfter);
  const hasCountIncrease = tool.pacRuleRegressions.some(regression => (
    typeof regression.beforeCount === 'number' &&
    typeof regression.afterCount === 'number' &&
    regression.afterCount > regression.beforeCount
  ));
  const categoryDrops = Object.values(deltas).some(delta => delta < 0);
  return hasCountIncrease && !categoryDrops;
}

function highBlockedTool(tool: NormalizedTool, targetScore: number): boolean {
  const scoreAfter = tool.scoreAfter ?? 0;
  if (scoreAfter < targetScore) return false;
  if (!['rejected', 'no_effect'].includes(tool.outcome)) return false;
  return tool.pacRuleRegressions.length > 0 || tool.stageRegressions.length > 0;
}

function referenceMatches(
  candidate: NormalizedTool,
  rowKey: string,
  references: ReferenceInput[],
  targetScore: number,
): GuardedCandidateAttempt['matchingAcceptedReferences'] {
  if (!candidate.stateSignatureAfter) return [];
  const matches: GuardedCandidateAttempt['matchingAcceptedReferences'] = [];
  for (const reference of references) {
    for (const row of rowsOf(reference.report).map(normalizeRow)) {
      if (row.key !== rowKey && !row.file.includes(rowKey)) continue;
      if ((row.score ?? 0) < targetScore) continue;
      if (row.lastStateSignature === candidate.stateSignatureAfter) {
        matches.push({
          label: reference.label,
          score: row.score,
          grade: row.grade,
          matchKind: 'final_state',
          toolName: null,
          outcome: null,
        });
      }
      for (const tool of row.tools) {
        if (tool.stateSignatureAfter === candidate.stateSignatureAfter && tool.outcome === 'applied') {
          matches.push({
            label: reference.label,
            score: row.score,
            grade: row.grade,
            matchKind: 'tool_after_state',
            toolName: tool.toolName,
            outcome: tool.outcome,
          });
        }
      }
    }
  }
  return dedupeMatches(matches);
}

function dedupeMatches(matches: GuardedCandidateAttempt['matchingAcceptedReferences']): GuardedCandidateAttempt['matchingAcceptedReferences'] {
  const seen = new Set<string>();
  const out: GuardedCandidateAttempt['matchingAcceptedReferences'] = [];
  for (const match of matches) {
    const key = `${match.label}|${match.matchKind}|${match.toolName ?? ''}|${match.outcome ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

function classifyAttempt(tool: NormalizedTool, matches: GuardedCandidateAttempt['matchingAcceptedReferences']): GuardedCandidateClassification {
  if (matches.length > 0) return 'accepted_reference_same_state_context_divergence';
  if (structureStableWithAnalysisCountDrift(tool)) return 'structure_stable_analysis_count_drift';
  if (pacIncrementWithoutScoreDrop(tool)) return 'pac_count_increment_without_score_drop';
  if (tool.pacRuleRegressions.length > 0 || tool.stageRegressions.length > 0) return 'real_side_effect_needs_cleanup';
  return 'no_behavior_ready';
}

function recommendation(classification: GuardedCandidateClassification): string {
  switch (classification) {
    case 'accepted_reference_same_state_context_divergence':
      return 'Compare acceptance context and PAC replay for the same final state before changing behavior.';
    case 'structure_stable_analysis_count_drift':
      return 'Diagnose native analysis count drift; only promote if the category drop is proven analyzer noise and controls stay stable.';
    case 'pac_count_increment_without_score_drop':
      return 'Attribute the PAC count increment to a concrete table/header object before planning cleanup.';
    case 'real_side_effect_needs_cleanup':
      return 'Plan a cleanup/prevention proof; do not relax the guard.';
    case 'no_behavior_ready':
      return 'No safe behavior path from current evidence.';
  }
}

function classifyRows(input: {
  gate: BaselineReport;
  references: ReferenceInput[];
  rows: string[];
  targetScore: number;
}): GuardedCandidateRow[] {
  const gateRows = rowsOf(input.gate).map(normalizeRow).filter(row => rowMatches(row, input.rows));
  return gateRows.flatMap(row => {
    const attempts = row.tools
      .filter(tool => highBlockedTool(tool, input.targetScore))
      .map(tool => {
        const matches = referenceMatches(tool, row.key, input.references, input.targetScore);
        const classification = classifyAttempt(tool, matches);
        return {
          rowKey: row.key,
          file: row.file,
          toolName: tool.toolName,
          outcome: tool.outcome,
          stage: tool.stage,
          reason: tool.reason,
          scoreBefore: tool.scoreBefore,
          scoreAfter: tool.scoreAfter,
          stateSignatureBefore: tool.stateSignatureBefore,
          stateSignatureAfter: tool.stateSignatureAfter,
          sideEffectFamilies: sideEffectFamilies(tool),
          pacRuleRegressions: tool.pacRuleRegressions,
          stageRegressions: tool.stageRegressions,
          categoryDeltas: categoryDeltas(tool.categoryScoresBefore, tool.categoryScoresAfter),
          signalDeltas: signalDeltas(tool.detectionSignalsBefore, tool.detectionSignalsAfter),
          matchingAcceptedReferences: matches,
          classification,
          recommendedNext: recommendation(classification),
        };
      });

    if (attempts.length === 0) return [];
    const referenceRows = input.references
      .flatMap(reference => rowsOf(reference.report).map(normalizeRow).map(refRow => ({ reference, row: refRow })))
      .filter(({ row: refRow }) => refRow.key === row.key || refRow.file.includes(row.key));
    const best = referenceRows.reduce<{ label: string | null; score: number | null }>((acc, item) => {
      if ((item.row.score ?? -Infinity) > (acc.score ?? -Infinity)) return { label: item.reference.label, score: item.row.score };
      return acc;
    }, { label: null, score: null });

    return [{
      key: row.key,
      file: row.file,
      gateScore: row.score,
      gateGrade: row.grade,
      bestReferenceScore: best.score,
      bestReferenceLabel: best.label,
      highBlockedAttemptCount: attempts.length,
      classifications: countValues(CLASSIFICATIONS, attempts.map(attempt => attempt.classification)),
      sideEffectFamilies: countValues(SIDE_EFFECT_FAMILIES, attempts.flatMap(attempt => attempt.sideEffectFamilies)),
      attempts,
    }];
  });
}

function countValues<T extends string>(keys: readonly T[], values: T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map(key => [key, 0])) as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function decide(rows: GuardedCandidateRow[]): GuardedCandidateDiagnostic['decision'] {
  const classes = countValues(CLASSIFICATIONS, rows.flatMap(row => row.attempts.map(attempt => attempt.classification)));
  if (classes.accepted_reference_same_state_context_divergence > 0) {
    return {
      status: 'diagnose_acceptance_context_determinism',
      reasons: [`${classes.accepted_reference_same_state_context_divergence} guarded high candidate(s) match accepted reference states`],
      nextLane: 'same_state_pac_acceptance_context_probe',
    };
  }
  if (classes.structure_stable_analysis_count_drift > 0) {
    return {
      status: 'diagnose_analysis_count_drift',
      reasons: [`${classes.structure_stable_analysis_count_drift} guarded high candidate(s) show structure-stable analysis count drift`],
      nextLane: 'native_analysis_count_drift_probe',
    };
  }
  if (classes.pac_count_increment_without_score_drop > 0) {
    return {
      status: 'diagnose_pac_count_attribution',
      reasons: [`${classes.pac_count_increment_without_score_drop} guarded high candidate(s) increase PAC counts without category score drops`],
      nextLane: 'pac_count_object_attribution_probe',
    };
  }
  if (classes.real_side_effect_needs_cleanup > 0) {
    return {
      status: 'plan_cleanup_transaction_proof',
      reasons: [`${classes.real_side_effect_needs_cleanup} guarded high candidate(s) need side-effect prevention or cleanup`],
      nextLane: 'side_effect_cleanup_transaction_proof',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: ['No behavior-ready guarded candidate evidence found'],
    nextLane: 'park_or_collect_more_repeats',
  };
}

export function buildGuardedCandidateSideEffectDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  gatePath: string;
  gate: BaselineReport;
  referenceInputs: ReferenceInput[];
  rows?: string[];
  targetScore?: number;
}): GuardedCandidateDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const rows = classifyRows({
    gate: input.gate,
    references: input.referenceInputs,
    rows: input.rows ?? [],
    targetScore,
  });
  const attempts = rows.flatMap(row => row.attempts);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    inputs: {
      gate: input.gatePath,
      references: input.referenceInputs.map(reference => ({ label: reference.label, path: reference.path })),
    },
    summary: {
      rowCount: rows.length,
      highBlockedAttemptCount: attempts.length,
      classifications: countValues(CLASSIFICATIONS, attempts.map(attempt => attempt.classification)),
      sideEffectFamilies: countValues(SIDE_EFFECT_FAMILIES, attempts.flatMap(attempt => attempt.sideEffectFamilies)),
    },
    decision: decide(rows),
    rows,
  };
}

export function renderGuardedCandidateSideEffectMarkdown(diagnostic: GuardedCandidateDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Guarded Candidate Side-Effect Diagnostic');
  lines.push('');
  lines.push(`Generated: ${diagnostic.generatedAt}`);
  lines.push(`Target score: ${diagnostic.targetScore}`);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(`Decision: \`${diagnostic.decision.status}\``);
  lines.push(`Next lane: \`${diagnostic.decision.nextLane}\``);
  for (const reason of diagnostic.decision.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`Rows with guarded candidates: ${diagnostic.summary.rowCount}`);
  lines.push(`High blocked attempts: ${diagnostic.summary.highBlockedAttemptCount}`);
  lines.push('');
  lines.push('| Class | Count |');
  lines.push('| --- | ---: |');
  for (const klass of CLASSIFICATIONS) lines.push(`| \`${klass}\` | ${diagnostic.summary.classifications[klass]} |`);
  lines.push('');
  lines.push('| Side Effect Family | Count |');
  lines.push('| --- | ---: |');
  for (const family of SIDE_EFFECT_FAMILIES) lines.push(`| \`${family}\` | ${diagnostic.summary.sideEffectFamilies[family]} |`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Row | Gate | Best Ref | High Attempts | Primary Classes | Primary Families |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- |');
  for (const row of diagnostic.rows) {
    const classes = Object.entries(row.classifications).filter(([, count]) => count > 0).map(([key, count]) => `${key}=${count}`).join(', ');
    const families = Object.entries(row.sideEffectFamilies).filter(([, count]) => count > 0).map(([key, count]) => `${key}=${count}`).join(', ');
    lines.push(`| \`${row.key}\` | ${row.gateScore ?? 'n/a'}${row.gateGrade ? `/${row.gateGrade}` : ''} | ${row.bestReferenceScore ?? 'n/a'}${row.bestReferenceLabel ? ` (${row.bestReferenceLabel})` : ''} | ${row.highBlockedAttemptCount} | ${classes || 'none'} | ${families || 'none'} |`);
  }
  for (const row of diagnostic.rows) {
    lines.push('');
    lines.push(`### ${row.key}`);
    lines.push('');
    lines.push(`File: \`${row.file}\``);
    for (const attempt of row.attempts) {
      lines.push('');
      lines.push(`- \`${attempt.toolName}\` stage ${attempt.stage ?? 'n/a'}: \`${attempt.classification}\`, score ${attempt.scoreBefore ?? 'n/a'} -> ${attempt.scoreAfter ?? 'n/a'}, reason \`${attempt.reason ?? 'n/a'}\``);
      if (attempt.stageRegressions.length > 0) lines.push(`  - Stage regressions: ${attempt.stageRegressions.join(', ')}`);
      if (attempt.pacRuleRegressions.length > 0) {
        lines.push(`  - PAC regressions: ${attempt.pacRuleRegressions.map(item => `${item.ruleId}${item.beforeCount !== null && item.afterCount !== null ? ` ${item.beforeCount}->${item.afterCount}` : ''}`).join(', ')}`);
      }
      const categoryChanges = Object.entries(attempt.categoryDeltas).map(([key, delta]) => `${key} ${delta > 0 ? '+' : ''}${delta}`).join(', ');
      if (categoryChanges) lines.push(`  - Category deltas: ${categoryChanges}`);
      const signalChanges = Object.entries(attempt.signalDeltas)
        .slice(0, 10)
        .map(([key, delta]) => `${key} ${delta.before}->${delta.after}`)
        .join(', ');
      if (signalChanges) lines.push(`  - Signal deltas: ${signalChanges}`);
      if (attempt.matchingAcceptedReferences.length > 0) {
        lines.push(`  - Accepted reference matches: ${attempt.matchingAcceptedReferences.map(match => `${match.label}/${match.matchKind}${match.toolName ? `/${match.toolName}` : ''}`).join(', ')}`);
      }
      lines.push(`  - Recommended next: ${attempt.recommendedNext}`);
    }
  }
  lines.push('');
  lines.push('## Guardrails');
  lines.push('');
  lines.push('- This diagnostic is read-only and does not change scoring, PAC gates, planner routing, or remediation behavior.');
  lines.push('- A high score blocked by PAC/category regression is not acceptance evidence unless the side effect is prevented or proven to be analysis/acceptance-context instability with controls.');
  lines.push('- Do not reopen parked table-heavy outside lanes from this evidence alone.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function writeGuardedCandidateSideEffectDiagnostic(args: Args): Promise<GuardedCandidateDiagnostic> {
  const gate = await readJson<BaselineReport>(args.gate);
  const referenceInputs = await Promise.all(args.references.map(async reference => ({
    ...reference,
    report: await readJson<BaselineReport>(reference.path),
  })));
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const diagnostic = buildGuardedCandidateSideEffectDiagnostic({
    outDir,
    gatePath: args.gate,
    gate,
    referenceInputs,
    rows: args.rows,
    targetScore: args.targetScore,
  });
  await writeFile(join(outDir, 'original50-guarded-candidate-side-effect-diagnostic.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-guarded-candidate-side-effect-diagnostic.md'), renderGuardedCandidateSideEffectMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const diagnostic = await writeGuardedCandidateSideEffectDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-guarded-candidate-side-effect-diagnostic.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; high blocked attempts: ${diagnostic.summary.highBlockedAttemptCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-guarded-candidate-side-effect-diagnostic.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    console.error(usage());
    process.exit(1);
  });
}

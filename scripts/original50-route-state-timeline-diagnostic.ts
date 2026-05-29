#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;
const DEFAULT_TIMEOUT_MS = 300_000;

export type Original50RouteStateClass =
  | 'same_state_acceptance_divergence'
  | 'guarded_high_candidate_pac_blocked'
  | 'guarded_high_candidate_category_blocked'
  | 'post_pass_collapse_guarded'
  | 'upstream_state_variance'
  | 'runtime_near_wall'
  | 'stable_low_debt'
  | 'no_safe_route_stabilization_predicate';

export type Original50RouteStateDecision =
  | 'investigate_acceptance_determinism_first'
  | 'diagnose_guarded_high_candidate_side_effects'
  | 'diagnose_upstream_state_variance'
  | 'diagnose_runtime_tail_first'
  | 'park_stable_low_debt'
  | 'no_behavior_ready';

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
  source?: string | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  durationMs?: number | null;
  details?: unknown;
}

interface BaselineRow {
  id?: string;
  file?: string;
  filename?: string;
  beforeScore?: number | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterDeterministicScore?: number | null;
  afterDeterministicGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  durationMs?: number | null;
  wallRemediateMs?: number | null;
  error?: string | null;
  falsePositiveApplied?: number | null;
  falsePositiveAppliedCount?: number | null;
  categoryGap?: { after?: CategoryScore[] };
  categoriesAfter?: CategoryScore[];
  afterCategoryScores?: CategoryScore[];
  reanalyzedCategoryScores?: CategoryScore[];
  appliedTools?: AppliedTool[] | null;
  boundedRunner?: { errorType?: string | null };
}

interface BaselineReport {
  rows?: BaselineRow[];
  remediateResults?: BaselineRow[];
}

interface ParsedDetails {
  reason: string | null;
  targetRef: string | null;
  pacRegressions: string[];
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

export interface Original50RouteTimelineEvent extends ParsedDetails {
  index: number;
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  durationMs: number | null;
  categoryDeltas: Record<string, number>;
  majorCategoryDrops: Array<{ key: string; before: number; after: number; delta: number }>;
}

interface NormalizedRow {
  key: string;
  file: string;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  timedOut: boolean;
  nearWall: boolean;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  timeline: Original50RouteTimelineEvent[];
}

export interface Original50RouteStateRun {
  label: string;
  path: string;
  present: boolean;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  timedOut: boolean;
  nearWall: boolean;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  firstStateSignature: string | null;
  lastStateSignature: string | null;
  appliedTools: string[];
  rejectedTools: string[];
}

export interface Original50RouteStateRow {
  key: string;
  file: string;
  classification: Original50RouteStateClass;
  reasons: string[];
  recommendedNext: string;
  gate: Original50RouteStateRun;
  bestReference: Original50RouteStateRun | null;
  scoreSpread: number | null;
  firstDivergence: {
    index: number;
    gate: string | null;
    reference: string | null;
  } | null;
  sameStateDivergences: Array<{
    referenceLabel: string;
    toolName: string;
    stateSignatureBefore: string | null;
    stateSignatureAfter: string | null;
    gateOutcome: string;
    referenceOutcome: string;
    gateReason: string | null;
    referenceReason: string | null;
    gateScoreAfter: number | null;
    referenceScoreAfter: number | null;
  }>;
  rejectedHighCandidates: Array<{
    toolName: string;
    outcome: string;
    reason: string | null;
    scoreBefore: number | null;
    scoreAfter: number | null;
    stage: number | null;
    pacRegressions: string[];
    stageRegressions: string[];
    majorCategoryDrops: Array<{ key: string; before: number; after: number; delta: number }>;
  }>;
  pacFamilies: Record<string, number>;
  finalCategoryDropsFromBest: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }>;
}

export interface Original50RouteStateDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  timeoutMs: number;
  inputs: {
    gate: string;
    references: Array<{ label: string; path: string }>;
  };
  summary: {
    rowCount: number;
    byClass: Record<Original50RouteStateClass, number>;
    falsePositiveApplied: number;
    timeoutCount: number;
  };
  decision: {
    status: Original50RouteStateDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: Original50RouteStateRow[];
}

interface Args {
  gate: string;
  references: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
  timeoutMs: number;
}

const CLASSES: Original50RouteStateClass[] = [
  'same_state_acceptance_divergence',
  'guarded_high_candidate_pac_blocked',
  'guarded_high_candidate_category_blocked',
  'post_pass_collapse_guarded',
  'upstream_state_variance',
  'runtime_near_wall',
  'stable_low_debt',
  'no_safe_route_stabilization_predicate',
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-route-state-timeline-diagnostic.ts --gate <baseline_report.json> [options]

Options:
  --gate <baseline_report.json>       Failed/candidate gate report.
  --reference <label=baseline.json>   Reference/focused repeat report. Repeatable.
  --row <id-or-substring>             Row key to include. Repeatable.
  --out <dir>                         Output directory.
  --target-score <n>                  High-candidate target score. Default: ${DEFAULT_TARGET_SCORE}.
  --timeout-ms <n>                    Timeout wall used for near-wall detection. Default: ${DEFAULT_TIMEOUT_MS}.
  --help                              Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  let gate = '';
  const references: Array<{ label: string; path: string }> = [];
  const rows: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-route-state-timeline-diagnostic-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--gate') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --gate value\n${usage()}`);
      gate = resolve(value);
      continue;
    }
    if (arg === '--reference') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --reference value\n${usage()}`);
      const split = value.indexOf('=');
      if (split <= 0) throw new Error(`Invalid --reference "${value}", expected label=path\n${usage()}`);
      references.push({ label: value.slice(0, split), path: resolve(value.slice(split + 1)) });
      continue;
    }
    if (arg === '--row') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --row value\n${usage()}`);
      rows.push(value);
      continue;
    }
    if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
      continue;
    }
    if (arg === '--target-score') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value)) throw new Error(`Invalid --target-score value\n${usage()}`);
      targetScore = value;
      continue;
    }
    if (arg === '--timeout-ms') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --timeout-ms value\n${usage()}`);
      timeoutMs = value;
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (!gate) throw new Error(`--gate is required\n${usage()}`);
  return { gate, references, rows, outDir, targetScore, timeoutMs };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return record(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function firstString(input: Record<string, unknown> | null, keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key]) return input[key] as string;
  }
  return null;
}

function categoryMap(row: BaselineRow): Record<string, number> {
  const out: Record<string, number> = {};
  const categories = row.categoryGap?.after
    ?? row.categoriesAfter
    ?? row.afterCategoryScores
    ?? row.reanalyzedCategoryScores
    ?? [];
  for (const category of categories) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') out[category.key] = category.score;
  }
  return out;
}

function categoryRecord(value: unknown): Record<string, number> {
  const input = record(value);
  if (!input) return {};
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
  }
  return out;
}

function compactRecord(value: unknown): Record<string, number | boolean | string | null> {
  const input = record(value);
  if (!input) return {};
  const out: Record<string, number | boolean | string | null> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'string' || item === null) out[key] = item;
  }
  return out;
}

function rowKey(row: BaselineRow): string {
  const raw = row.id ?? row.file ?? row.filename ?? '';
  const match = String(raw).match(/\b(\d{4})\b/);
  return match?.[1] ?? basename(String(raw)).replace(/\.pdf$/i, '');
}

function detailsText(details: unknown): string {
  if (typeof details === 'string') return details;
  if (!details) return '';
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function pacRegressions(details: unknown): string[] {
  const out = new Set<string>();
  const parsed = parseJsonObject(details);
  const single = record(parsed?.pacRuleRegression);
  if (typeof single?.ruleId === 'string') out.add(single.ruleId);
  const many = Array.isArray(parsed?.pacRuleRegressions) ? parsed.pacRuleRegressions : [];
  for (const item of many) {
    const pac = record(item);
    if (typeof pac?.ruleId === 'string') out.add(pac.ruleId);
  }
  for (const match of detailsText(details).matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
    if (match[1]) out.add(match[1]);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function stageRegressions(details: unknown): string[] {
  const out = new Set<string>();
  const text = detailsText(details);
  for (const match of text.matchAll(/stage_regressed_category\(([^:)]+):([^)]+)\)/g)) {
    if (match[1] && match[2]) out.add(`${match[1]}:${match[2]}`);
  }
  for (const match of text.matchAll(/post_pass_regressed_score\(([^)]+)\)/g)) {
    if (match[1]) out.add(`post_pass_score:${match[1]}`);
  }
  for (const match of text.matchAll(/stage_regressed_score\(([^)]+)\)/g)) {
    if (match[1]) out.add(`stage_score:${match[1]}`);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function categoryDeltas(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (typeof before[key] === 'number' && typeof after[key] === 'number') out[key] = after[key] - before[key];
  }
  return out;
}

function majorCategoryDrops(before: Record<string, number>, after: Record<string, number>): Array<{ key: string; before: number; after: number; delta: number }> {
  return Object.entries(categoryDeltas(before, after))
    .filter(([, delta]) => delta <= -10)
    .map(([key, delta]) => ({ key, before: before[key]!, after: after[key]!, delta }))
    .sort((a, b) => a.delta - b.delta || a.key.localeCompare(b.key));
}

function parseDetails(details: unknown, tool: AppliedTool): ParsedDetails {
  const parsed = parseJsonObject(details);
  const debug = record(parsed?.debug);
  const replay = record(debug?.replayState);
  const invariants = record(parsed?.invariants);
  const categoryScoresBefore = categoryRecord(replay?.categoryScoresBefore);
  const categoryScoresAfter = categoryRecord(replay?.categoryScoresAfter);
  return {
    reason: firstString(parsed, ['note', 'raw', 'reason', 'outcome']),
    targetRef: stringOrNull(replay?.targetRef) ?? stringOrNull(invariants?.targetRef),
    pacRegressions: pacRegressions(details),
    stageRegressions: stageRegressions(details),
    stateSignatureBefore: stringOrNull(replay?.stateSignatureBefore),
    stateSignatureAfter: stringOrNull(replay?.stateSignatureAfter),
    scoreBefore: numberOrNull(replay?.scoreBefore) ?? numberOrNull(tool.scoreBefore),
    scoreAfter: numberOrNull(replay?.scoreAfter) ?? numberOrNull(tool.scoreAfter),
    categoryScoresBefore,
    categoryScoresAfter,
    detectionSignalsBefore: compactRecord(replay?.detectionSignalsBefore),
    detectionSignalsAfter: compactRecord(replay?.detectionSignalsAfter),
  };
}

function normalizeTimeline(tools: AppliedTool[] | null | undefined): Original50RouteTimelineEvent[] {
  return (tools ?? []).map((tool, index) => {
    const parsed = parseDetails(tool.details, tool);
    return {
      index,
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
      stage: numberOrNull(tool.stage),
      round: numberOrNull(tool.round),
      source: stringOrNull(tool.source),
      durationMs: numberOrNull(tool.durationMs),
      ...parsed,
      categoryDeltas: categoryDeltas(parsed.categoryScoresBefore, parsed.categoryScoresAfter),
      majorCategoryDrops: majorCategoryDrops(parsed.categoryScoresBefore, parsed.categoryScoresAfter),
    };
  });
}

function rowMap(report: BaselineReport, timeoutMs: number): Map<string, NormalizedRow> {
  const rows = report.rows ?? report.remediateResults ?? [];
  return new Map(rows.map(row => {
    const score = numberOrNull(row.afterScore ?? row.reanalyzedScore ?? row.afterDeterministicScore);
    const grade = stringOrNull(row.afterGrade ?? row.reanalyzedGrade ?? row.afterDeterministicGrade);
    const durationMs = numberOrNull(row.durationMs ?? row.wallRemediateMs);
    const error = stringOrNull(row.error) ?? stringOrNull(row.boundedRunner?.errorType);
    const timedOut = /timeout/i.test(error ?? '') || (score === 0 && grade === '?' && (durationMs ?? 0) >= timeoutMs - 5_000);
    const normalized: NormalizedRow = {
      key: rowKey(row),
      file: String(row.file ?? row.filename ?? row.id ?? 'unknown'),
      score,
      grade,
      durationMs,
      timedOut,
      nearWall: (durationMs ?? 0) >= timeoutMs * 0.9,
      falsePositiveApplied: numberOrNull(row.falsePositiveAppliedCount ?? row.falsePositiveApplied) ?? 0,
      categories: categoryMap(row),
      timeline: normalizeTimeline(row.appliedTools),
    };
    return [normalized.key, normalized];
  }));
}

function summarizeRun(label: string, path: string, row: NormalizedRow | null): Original50RouteStateRun {
  const first = row?.timeline.find(event => event.stateSignatureBefore || event.stateSignatureAfter);
  const last = row ? [...row.timeline].reverse().find(event => event.stateSignatureAfter || event.stateSignatureBefore) : undefined;
  return {
    label,
    path,
    present: Boolean(row),
    score: row?.score ?? null,
    grade: row?.grade ?? null,
    durationMs: row?.durationMs ?? null,
    timedOut: row?.timedOut ?? false,
    nearWall: row?.nearWall ?? false,
    falsePositiveApplied: row?.falsePositiveApplied ?? 0,
    categories: row?.categories ?? {},
    firstStateSignature: first?.stateSignatureBefore ?? first?.stateSignatureAfter ?? null,
    lastStateSignature: last?.stateSignatureAfter ?? last?.stateSignatureBefore ?? null,
    appliedTools: [...new Set((row?.timeline ?? []).filter(event => event.outcome === 'applied').map(event => event.toolName))].sort(),
    rejectedTools: [...new Set((row?.timeline ?? []).filter(event => event.outcome === 'rejected').map(event => event.toolName))].sort(),
  };
}

function eventKey(event: Original50RouteTimelineEvent): string {
  return [
    event.toolName,
    event.outcome,
    event.stage ?? '',
    event.stateSignatureBefore ?? '',
    event.stateSignatureAfter ?? '',
    event.reason ?? '',
  ].join('|');
}

function firstDivergence(
  gate: Original50RouteTimelineEvent[],
  reference: Original50RouteTimelineEvent[],
): Original50RouteStateRow['firstDivergence'] {
  const limit = Math.max(gate.length, reference.length);
  for (let index = 0; index < limit; index += 1) {
    const gateEvent = gate[index];
    const referenceEvent = reference[index];
    if (!gateEvent || !referenceEvent) {
      return {
        index,
        gate: gateEvent ? `${gateEvent.toolName}:${gateEvent.outcome}` : null,
        reference: referenceEvent ? `${referenceEvent.toolName}:${referenceEvent.outcome}` : null,
      };
    }
    if (eventKey(gateEvent) !== eventKey(referenceEvent)) {
      return {
        index,
        gate: `${gateEvent.toolName}:${gateEvent.outcome}:${gateEvent.reason ?? ''}`,
        reference: `${referenceEvent.toolName}:${referenceEvent.outcome}:${referenceEvent.reason ?? ''}`,
      };
    }
  }
  return null;
}

function scores(values: Array<number | null>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function selectBestReference(references: Array<{ label: string; path: string; row: NormalizedRow | null }>): { label: string; path: string; row: NormalizedRow } | null {
  const present = references.filter((reference): reference is { label: string; path: string; row: NormalizedRow } =>
    Boolean(reference.row) && typeof reference.row?.score === 'number');
  return [...present].sort((a, b) => (b.row.score ?? -1) - (a.row.score ?? -1))[0] ?? null;
}

function finalCategoryDrops(
  gate: Original50RouteStateRun,
  reference: Original50RouteStateRun | null,
): Array<{ key: string; referenceScore: number; gateScore: number; delta: number }> {
  if (!reference) return [];
  const out: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }> = [];
  for (const [key, referenceScore] of Object.entries(reference.categories)) {
    const gateScore = gate.categories[key];
    if (typeof gateScore !== 'number') continue;
    const delta = referenceScore - gateScore;
    if (delta >= 20) out.push({ key, referenceScore, gateScore, delta });
  }
  return out.sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key));
}

function rejectedHighCandidates(row: NormalizedRow | null, targetScore: number): Original50RouteStateRow['rejectedHighCandidates'] {
  if (!row) return [];
  const rowScore = row.score ?? 0;
  return row.timeline
    .filter(event => event.outcome === 'rejected' && (event.scoreAfter ?? -Infinity) >= Math.max(targetScore, rowScore + 8))
    .map(event => ({
      toolName: event.toolName,
      outcome: event.outcome,
      reason: event.reason,
      scoreBefore: event.scoreBefore,
      scoreAfter: event.scoreAfter,
      stage: event.stage,
      pacRegressions: event.pacRegressions,
      stageRegressions: event.stageRegressions,
      majorCategoryDrops: event.majorCategoryDrops,
    }));
}

function sameStateDivergences(
  gate: NormalizedRow | null,
  references: Array<{ label: string; row: NormalizedRow | null }>,
): Original50RouteStateRow['sameStateDivergences'] {
  if (!gate) return [];
  const out: Original50RouteStateRow['sameStateDivergences'] = [];
  for (const gateEvent of gate.timeline) {
    if (!gateEvent.stateSignatureBefore && !gateEvent.stateSignatureAfter) continue;
    for (const reference of references) {
      const referenceEvents = (reference.row?.timeline ?? []).filter(event => event.stateSignatureBefore || event.stateSignatureAfter);
      const match = referenceEvents.find(referenceEvent =>
        referenceEvent.toolName === gateEvent.toolName
        && referenceEvent.stateSignatureBefore === gateEvent.stateSignatureBefore
        && referenceEvent.stateSignatureAfter === gateEvent.stateSignatureAfter
        && referenceEvent.outcome !== gateEvent.outcome);
      if (!match) continue;
      const meaningful = (gateEvent.scoreAfter ?? -Infinity) >= DEFAULT_TARGET_SCORE
        || (match.scoreAfter ?? -Infinity) >= DEFAULT_TARGET_SCORE
        || gateEvent.pacRegressions.length > 0
        || match.pacRegressions.length > 0
        || gateEvent.stageRegressions.length > 0
        || match.stageRegressions.length > 0
        || Math.abs((gateEvent.scoreAfter ?? 0) - (match.scoreAfter ?? 0)) >= 5;
      if (!meaningful) continue;
      out.push({
        referenceLabel: reference.label,
        toolName: gateEvent.toolName,
        stateSignatureBefore: gateEvent.stateSignatureBefore,
        stateSignatureAfter: gateEvent.stateSignatureAfter,
        gateOutcome: gateEvent.outcome,
        referenceOutcome: match.outcome,
        gateReason: gateEvent.reason,
        referenceReason: match.reason,
        gateScoreAfter: gateEvent.scoreAfter,
        referenceScoreAfter: match.scoreAfter,
      });
    }
  }
  return out;
}

function pacFamilies(events: Original50RouteTimelineEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const event of events) {
    for (const rule of event.pacRegressions) {
      const family = rule.startsWith('pdfua.figure.')
        ? 'figure_alt'
        : rule.startsWith('pdfua.table.')
          ? 'table_header'
          : rule.startsWith('pdfua.content.orphan')
            ? 'orphan_mcid'
            : rule.startsWith('pdfua.annotation.')
              ? 'annotation_link'
              : 'other';
      out[family] = (out[family] ?? 0) + 1;
    }
  }
  return out;
}

function classify(input: {
  gateRow: NormalizedRow | null;
  gate: Original50RouteStateRun;
  bestReference: Original50RouteStateRun | null;
  sameState: Original50RouteStateRow['sameStateDivergences'];
  rejectedHigh: Original50RouteStateRow['rejectedHighCandidates'];
  scoreSpread: number | null;
  targetScore: number;
}): { classification: Original50RouteStateClass; reasons: string[]; recommendedNext: string } {
  const { gateRow, gate, bestReference, sameState, rejectedHigh, scoreSpread, targetScore } = input;
  const reasons: string[] = [];
  const highPac = rejectedHigh.filter(candidate => candidate.pacRegressions.length > 0);
  const highCategory = rejectedHigh.filter(candidate => candidate.stageRegressions.some(reason => reason.includes(':')));
  const highPostPass = rejectedHigh.filter(candidate => candidate.stageRegressions.some(reason => reason.startsWith('post_pass_score') || reason.startsWith('stage_score')));
  const highReference = (bestReference?.score ?? -Infinity) >= targetScore || (bestReference?.score ?? -Infinity) >= 90;

  if (!gateRow) {
    return {
      classification: 'no_safe_route_stabilization_predicate',
      reasons: ['gate row missing'],
      recommendedNext: 'rebuild_gate_artifact_before_behavior',
    };
  }
  if (sameState.length > 0) {
    reasons.push(`${sameState.length} same-state accepted/rejected divergence(s)`);
    return {
      classification: 'same_state_acceptance_divergence',
      reasons,
      recommendedNext: 'diagnose acceptance determinism and analyzer/PAC side-effect attribution before behavior',
    };
  }
  if (highPac.length > 0) {
    reasons.push(`${highPac.length} rejected high-scoring candidate(s) blocked by PAC regression`);
    return {
      classification: 'guarded_high_candidate_pac_blocked',
      reasons,
      recommendedNext: 'do not relax PAC guards; diagnose whether side effect can be prevented generally',
    };
  }
  if (highCategory.length > 0) {
    reasons.push(`${highCategory.length} rejected high-scoring candidate(s) blocked by category regression`);
    return {
      classification: 'guarded_high_candidate_category_blocked',
      reasons,
      recommendedNext: 'diagnose cleanup transaction only if dropped category can be restored without PAC regression',
    };
  }
  if (highPostPass.length > 0) {
    reasons.push(`${highPostPass.length} post-pass collapse candidate(s)`);
    return {
      classification: 'post_pass_collapse_guarded',
      reasons,
      recommendedNext: 'diagnose post-pass state preservation before route continuation',
    };
  }
  if (gate.nearWall || (bestReference?.nearWall ?? false)) {
    reasons.push(`near-wall runtime gate=${gate.durationMs ?? '?'}`);
    return {
      classification: 'runtime_near_wall',
      reasons,
      recommendedNext: 'diagnose runtime tail before adding broad route work',
    };
  }
  if (highReference && (scoreSpread ?? 0) >= 15) {
    reasons.push(`score_spread=${scoreSpread}`);
    return {
      classification: 'upstream_state_variance',
      reasons,
      recommendedNext: 'compare initial analyzer/replay states across repeats before behavior',
    };
  }
  if ((gate.score ?? -Infinity) < targetScore) {
    reasons.push(`stable low score=${gate.score ?? '?'}`);
    return {
      classification: 'stable_low_debt',
      reasons,
      recommendedNext: 'park or fix as stable debt before table lane acceptance',
    };
  }
  return {
    classification: 'no_safe_route_stabilization_predicate',
    reasons: ['no route-state stabilization predicate identified'],
    recommendedNext: 'keep diagnostic-only',
  };
}

function buildDecision(rows: Original50RouteStateRow[]): Original50RouteStateDiagnostic['decision'] {
  const counts = rows.reduce<Record<Original50RouteStateClass, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {} as Record<Original50RouteStateClass, number>);
  const reasons: string[] = [];
  if ((counts.same_state_acceptance_divergence ?? 0) > 0) {
    reasons.push(`${counts.same_state_acceptance_divergence} row(s) have same-state accepted/rejected divergence`);
    return {
      status: 'investigate_acceptance_determinism_first',
      reasons,
      nextLane: 'same_state_acceptance_or_pac_attribution_diagnostic',
    };
  }
  const guarded = (counts.guarded_high_candidate_pac_blocked ?? 0) + (counts.guarded_high_candidate_category_blocked ?? 0);
  if (guarded > 0) {
    reasons.push(`${guarded} row(s) have guarded high-scoring candidates`);
    return {
      status: 'diagnose_guarded_high_candidate_side_effects',
      reasons,
      nextLane: 'prevent_side_effects_not_guard_relaxation',
    };
  }
  if ((counts.upstream_state_variance ?? 0) > 0) {
    reasons.push(`${counts.upstream_state_variance} row(s) have upstream state variance`);
    return {
      status: 'diagnose_upstream_state_variance',
      reasons,
      nextLane: 'analysis_or_route_state_repeatability',
    };
  }
  if ((counts.runtime_near_wall ?? 0) > 0) {
    reasons.push(`${counts.runtime_near_wall} row(s) are runtime-near-wall`);
    return {
      status: 'diagnose_runtime_tail_first',
      reasons,
      nextLane: 'runtime_tail_stabilization',
    };
  }
  if ((counts.stable_low_debt ?? 0) > 0) {
    reasons.push(`${counts.stable_low_debt} row(s) are stable low debt`);
    return {
      status: 'park_stable_low_debt',
      reasons,
      nextLane: 'source_track_parking_or_targeted_fix',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: ['no behavior-ready stabilization predicate was identified'],
    nextLane: 'keep_table_lanes_parked_or_collect_more_evidence',
  };
}

function rowMatches(row: NormalizedRow, selectors: string[]): boolean {
  if (selectors.length === 0) return true;
  const text = `${row.key} ${row.file}`.toLowerCase();
  return selectors.some(selector => text.includes(selector.toLowerCase()));
}

export function buildOriginal50RouteStateTimelineDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  gatePath: string;
  gate: BaselineReport;
  referenceInputs?: Array<{ label: string; path: string; report: BaselineReport }>;
  rows?: string[];
  targetScore?: number;
  timeoutMs?: number;
}): Original50RouteStateDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gateRows = rowMap(input.gate, timeoutMs);
  const references = (input.referenceInputs ?? []).map(reference => ({
    label: reference.label,
    path: reference.path,
    rows: rowMap(reference.report, timeoutMs),
  }));
  const selectors = input.rows ?? [];
  const candidateKeys = new Set<string>();
  for (const row of gateRows.values()) {
    if (rowMatches(row, selectors) && (selectors.length > 0 || (row.score ?? -Infinity) < targetScore)) candidateKeys.add(row.key);
  }
  for (const reference of references) {
    for (const row of reference.rows.values()) {
      if (rowMatches(row, selectors)) candidateKeys.add(row.key);
    }
  }

  const rows = [...candidateKeys].sort((a, b) => a.localeCompare(b)).map(key => {
    const gateRow = gateRows.get(key) ?? null;
    const referenceRows = references.map(reference => ({
      label: reference.label,
      path: reference.path,
      row: reference.rows.get(key) ?? null,
    }));
    const best = selectBestReference(referenceRows);
    const gateRun = summarizeRun('gate', input.gatePath, gateRow);
    const bestRun = best ? summarizeRun(best.label, best.path, best.row) : null;
    const allScores = scores([gateRun.score, ...referenceRows.map(reference => reference.row?.score ?? null)]);
    const scoreSpread = allScores.length > 0 ? Math.max(...allScores) - Math.min(...allScores) : null;
    const sameState = sameStateDivergences(gateRow, referenceRows);
    const rejectedHigh = rejectedHighCandidates(gateRow, targetScore);
    const classified = classify({
      gateRow,
      gate: gateRun,
      bestReference: bestRun,
      sameState,
      rejectedHigh,
      scoreSpread,
      targetScore,
    });
    return {
      key,
      file: gateRow?.file ?? best?.row.file ?? key,
      classification: classified.classification,
      reasons: classified.reasons,
      recommendedNext: classified.recommendedNext,
      gate: gateRun,
      bestReference: bestRun,
      scoreSpread,
      firstDivergence: firstDivergence(gateRow?.timeline ?? [], best?.row.timeline ?? []),
      sameStateDivergences: sameState,
      rejectedHighCandidates: rejectedHigh,
      pacFamilies: pacFamilies(gateRow?.timeline ?? []),
      finalCategoryDropsFromBest: finalCategoryDrops(gateRun, bestRun),
    } satisfies Original50RouteStateRow;
  });

  const byClass = Object.fromEntries(CLASSES.map(rowClass => [rowClass, 0])) as Record<Original50RouteStateClass, number>;
  for (const row of rows) byClass[row.classification] += 1;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    timeoutMs,
    inputs: {
      gate: input.gatePath,
      references: (input.referenceInputs ?? []).map(reference => ({ label: reference.label, path: reference.path })),
    },
    summary: {
      rowCount: rows.length,
      byClass,
      falsePositiveApplied: rows.reduce((sum, row) => sum + row.gate.falsePositiveApplied, 0),
      timeoutCount: rows.filter(row => row.gate.timedOut).length,
    },
    decision: buildDecision(rows),
    rows,
  };
}

function mdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderOriginal50RouteStateTimelineMarkdown(report: Original50RouteStateDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Route-State Timeline Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`, '');
  lines.push('## Decision', '');
  lines.push(`- Status: \`${report.decision.status}\``);
  lines.push(`- Next lane: \`${report.decision.nextLane}\``);
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Inputs', '');
  lines.push(`- Gate: \`${report.inputs.gate}\``);
  for (const reference of report.inputs.references) lines.push(`- Reference \`${reference.label}\`: \`${reference.path}\``);
  lines.push('', '## Summary', '');
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Gate false_positive_applied: ${report.summary.falsePositiveApplied}`);
  lines.push(`- Gate timeout count: ${report.summary.timeoutCount}`);
  for (const rowClass of CLASSES) lines.push(`- \`${rowClass}\`: ${report.summary.byClass[rowClass]}`);
  lines.push('', '## Rows', '');
  lines.push('| Row | Gate | Best Reference | Class | Same-State Divergences | Rejected High Candidates | PAC Families | Next |');
  lines.push('|---|---:|---:|---|---:|---:|---|---|');
  for (const row of report.rows) {
    const gate = `${row.gate.score ?? '?'} ${row.gate.grade ?? ''}`.trim();
    const best = row.bestReference ? `${row.bestReference.label}:${row.bestReference.score ?? '?'}` : '?';
    const pac = Object.entries(row.pacFamilies).map(([key, count]) => `${key}:${count}`).join(', ') || '-';
    lines.push(`| \`${mdCell(row.key)}\` | ${mdCell(gate)} | ${mdCell(best)} | \`${row.classification}\` | ${row.sameStateDivergences.length} | ${row.rejectedHighCandidates.length} | ${mdCell(pac)} | ${mdCell(row.recommendedNext)} |`);
  }
  lines.push('', '## Details', '');
  for (const row of report.rows) {
    lines.push(`### ${row.key}`, '');
    lines.push(`- File: \`${row.file}\``);
    lines.push(`- Gate: ${row.gate.score ?? '?'} ${row.gate.grade ?? '?'}; duration ${row.gate.durationMs ?? '?'}ms`);
    lines.push(`- Best reference: ${row.bestReference ? `${row.bestReference.label} ${row.bestReference.score ?? '?'} ${row.bestReference.grade ?? '?'}` : '?'}`);
    lines.push(`- Score spread: ${row.scoreSpread ?? '?'}`);
    if (row.firstDivergence) {
      lines.push(`- First divergence: index ${row.firstDivergence.index}; gate \`${row.firstDivergence.gate ?? '-'}\`; reference \`${row.firstDivergence.reference ?? '-'}\``);
    }
    if (row.reasons.length > 0) lines.push(`- Reasons: ${row.reasons.join('; ')}`);
    if (row.finalCategoryDropsFromBest.length > 0) {
      lines.push(`- Final category drops: ${row.finalCategoryDropsFromBest.map(drop => `${drop.key} ${drop.referenceScore}->${drop.gateScore}`).join(', ')}`);
    }
    if (row.sameStateDivergences.length > 0) {
      lines.push('- Same-state divergences:');
      for (const item of row.sameStateDivergences.slice(0, 6)) {
        lines.push(`  - \`${item.toolName}\` vs \`${item.referenceLabel}\`: ${item.gateOutcome} vs ${item.referenceOutcome}; score ${item.gateScoreAfter ?? '?'} vs ${item.referenceScoreAfter ?? '?'}; gate reason: ${item.gateReason ?? '-'}`);
      }
    }
    if (row.rejectedHighCandidates.length > 0) {
      lines.push('- Rejected high candidates:');
      for (const candidate of row.rejectedHighCandidates.slice(0, 8)) {
        const pac = candidate.pacRegressions.join(',') || '-';
        const stage = candidate.stageRegressions.join(',') || '-';
        lines.push(`  - \`${candidate.toolName}\`: ${candidate.scoreBefore ?? '?'} -> ${candidate.scoreAfter ?? '?'}; pac ${pac}; stage ${stage}; reason ${candidate.reason ?? '-'}`);
      }
    }
    lines.push('');
  }
  lines.push('## Notes', '');
  lines.push('- Read-only diagnostic: no PDFs are analyzed or remediated by this script.');
  lines.push('- Rejected high candidates are not behavior approval; PAC/category side effects must be prevented or restored before any acceptance.');
  return `${lines.join('\n')}\n`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeOriginal50RouteStateTimelineDiagnostic(args: Args): Promise<Original50RouteStateDiagnostic> {
  const gate = await readJson<BaselineReport>(args.gate);
  const referenceInputs = await Promise.all(args.references.map(async reference => ({
    label: reference.label,
    path: reference.path,
    report: await readJson<BaselineReport>(reference.path),
  })));
  const report = buildOriginal50RouteStateTimelineDiagnostic({
    outDir: args.outDir,
    gatePath: args.gate,
    gate,
    referenceInputs,
    rows: args.rows,
    targetScore: args.targetScore,
    timeoutMs: args.timeoutMs,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'original50-route-state-timeline-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'original50-route-state-timeline-diagnostic.md'), renderOriginal50RouteStateTimelineMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await writeOriginal50RouteStateTimelineDiagnostic(args);
  console.log(`Wrote ${join(args.outDir, 'original50-route-state-timeline-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

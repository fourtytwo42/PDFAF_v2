#!/usr/bin/env tsx
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;

export type InitialRouteStabilityClass =
  | 'stable_low_replay_signature_drift'
  | 'unstable_initial_analysis'
  | 'early_structural_pac_guard_drift'
  | 'family_specific_after_stable_route'
  | 'gate_clear'
  | 'no_high_reference'
  | 'no_behavior_ready';

export type InitialRouteStabilityDecision =
  | 'diagnose_analyzer_or_replay_state_before_behavior'
  | 'diagnose_early_structural_pac_guard_before_behavior'
  | 'plan_family_specific_probe'
  | 'original50_route_ready_for_table_reopen'
  | 'collect_higher_reference_or_repeat'
  | 'no_behavior_ready';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AnalysisRow {
  id?: string;
  file?: string;
  filename?: string;
  score?: number | null;
  grade?: string | null;
  pdfClass?: string | null;
  pageCount?: number | null;
  categories?: CategoryScore[];
  structuralClassification?: unknown;
  failureProfile?: {
    deterministicIssues?: string[];
    semanticIssues?: string[];
    manualOnlyIssues?: string[];
    primaryFailureFamily?: string;
    secondaryFailureFamilies?: string[];
    routingHints?: string[];
  };
  detectionProfile?: Record<string, unknown>;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  stage?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  details?: unknown;
}

interface RemediateRow {
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
  falsePositiveApplied?: number | null;
  falsePositiveAppliedCount?: number | null;
  beforeCategories?: CategoryScore[];
  afterCategories?: CategoryScore[];
  reanalyzedCategories?: CategoryScore[];
  categoryGap?: { after?: CategoryScore[] };
  planningSummary?: {
    primaryRoute?: string | null;
    secondaryRoutes?: string[];
    triggeringSignals?: string[];
    residualFamilies?: string[];
    scheduledTools?: string[];
    routeSummaries?: Array<{ route?: string; status?: string; reason?: string; scheduledTools?: string[] }>;
    skippedTools?: Array<{ toolName?: string; reason?: string }>;
    semanticDeferred?: boolean;
  };
  appliedTools?: AppliedTool[] | null;
}

type BenchmarkReport = {
  rows?: RemediateRow[];
  remediateResults?: RemediateRow[];
} | RemediateRow[];

interface NormalizedTool {
  toolName: string;
  outcome: string;
  stage: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  note: string | null;
  targetRef: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  pacRegressions: string[];
  stageRegressions: string[];
}

interface NormalizedAnalysis {
  key: string;
  file: string;
  score: number | null;
  grade: string | null;
  pdfClass: string | null;
  categories: Record<string, number>;
  structuralSignature: Record<string, number | boolean | string | null>;
  profileSignals: Record<string, number | boolean | string | null>;
  failureFamily: string | null;
  deterministicIssues: string[];
  manualOnlyIssues: string[];
  routingHints: string[];
}

interface NormalizedRemediate {
  key: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  falsePositiveApplied: number;
  afterCategories: Record<string, number>;
  primaryRoute: string | null;
  routeStatuses: Record<string, string>;
  scheduledTools: string[];
  triggeringSignals: string[];
  residualFamilies: string[];
  tools: NormalizedTool[];
}

interface ObservationInput {
  label: string;
  runDir: string;
  analyzePath: string;
  remediatePath: string;
  analyze: Map<string, NormalizedAnalysis>;
  remediate: Map<string, NormalizedRemediate>;
}

interface ReferenceInput {
  label: string;
  path: string;
  rows: Map<string, NormalizedRemediate>;
}

export interface ObservationSummary {
  label: string;
  score: number | null;
  grade: string | null;
  initialScore: number | null;
  initialCategories: Record<string, number>;
  afterCategories: Record<string, number>;
  firstStateSignature: string | null;
  firstCommittedSignature: string | null;
  firstDivergenceKey: string;
  primaryRoute: string | null;
  routeStatuses: Record<string, string>;
  scheduledTools: string[];
  pacRegressions: string[];
  stageRegressions: string[];
  signalSnapshot: Record<string, number | boolean | string | null>;
}

export interface ReferenceSummary {
  label: string;
  score: number | null;
  grade: string | null;
  firstStateSignature: string | null;
  firstCommittedSignature: string | null;
  earlyRouteKey: string;
  comparableInitial: boolean;
  comparableEarlyRoute: boolean;
}

export interface InitialRouteProbeRow {
  key: string;
  file: string;
  observations: ObservationSummary[];
  references: ReferenceSummary[];
  bestReferenceLabel: string | null;
  bestReferenceScore: number | null;
  repeatScoreStable: boolean;
  analysisCategoryDeltas: Array<{ key: string; min: number; max: number; delta: number }>;
  signalDeltas: Array<{ key: string; values: Array<number | boolean | string | null> }>;
  initialSignatureCount: number;
  comparableHighReferenceCount: number;
  comparableEarlyReferenceCount: number;
  classification: InitialRouteStabilityClass;
  reasons: string[];
  recommendedNext: string;
}

export interface InitialRouteProbeDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  inputs: {
    observations: Array<{ label: string; runDir: string; analyzePath: string; remediatePath: string }>;
    references: Array<{ label: string; path: string }>;
  };
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<InitialRouteStabilityClass, number>;
  };
  decision: {
    status: InitialRouteStabilityDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: InitialRouteProbeRow[];
}

interface Args {
  observations: Array<{ label: string; path: string }>;
  references: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
}

const CLASSES: InitialRouteStabilityClass[] = [
  'stable_low_replay_signature_drift',
  'unstable_initial_analysis',
  'early_structural_pac_guard_drift',
  'family_specific_after_stable_route',
  'gate_clear',
  'no_high_reference',
  'no_behavior_ready',
];

const SIGNAL_PATHS: Array<{ key: string; path: string[] }> = [
  { key: 'heading.extractedHeadingCount', path: ['headingSignals', 'extractedHeadingCount'] },
  { key: 'heading.treeHeadingCount', path: ['headingSignals', 'treeHeadingCount'] },
  { key: 'heading.rootReachableHeadingCount', path: ['headingSignals', 'rootReachableHeadingCount'] },
  { key: 'heading.layoutHeadingCandidateCount', path: ['headingSignals', 'layoutHeadingCandidateCount'] },
  { key: 'figure.extractedFigureCount', path: ['figureSignals', 'extractedFigureCount'] },
  { key: 'figure.treeFigureCount', path: ['figureSignals', 'treeFigureCount'] },
  { key: 'figure.captionCandidateCount', path: ['figureSignals', 'captionCandidateCount'] },
  { key: 'pdfua.orphanMcidCount', path: ['pdfUaSignals', 'orphanMcidCount'] },
  { key: 'pdfua.suspectedPathPaintOutsideMc', path: ['pdfUaSignals', 'suspectedPathPaintOutsideMc'] },
  { key: 'annotation.pagesMissingTabsS', path: ['annotationSignals', 'pagesMissingTabsS'] },
  { key: 'table.irregularTableCount', path: ['tableSignals', 'irregularTableCount'] },
  { key: 'table.stronglyIrregularTableCount', path: ['tableSignals', 'stronglyIrregularTableCount'] },
  { key: 'table.layoutTableCandidateCount', path: ['tableSignals', 'layoutTableCandidateCount'] },
  { key: 'table.denseRowBandTableCandidateCount', path: ['tableSignals', 'denseRowBandTableCandidateCount'] },
  { key: 'reading.geometryOrderRiskPages', path: ['readingOrderSignals', 'geometryOrderRiskPages'] },
  { key: 'reading.suspiciousPageCount', path: ['readingOrderSignals', 'suspiciousPageCount'] },
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-initial-route-stability-probe.ts --observation <label=runDir> [options]

Options:
  --observation <label=runDir>       Run directory with analyze.results.json and remediate.results.json. Repeatable.
  --reference <label=json>           High-reference baseline/remediate report. Repeatable.
  --row <id-or-substring>            Row key to include. Repeatable. Defaults to rows in observations.
  --out <dir>                        Output directory.
  --target-score <n>                 High-reference target. Default: ${DEFAULT_TARGET_SCORE}.
  --help                             Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const observations: Array<{ label: string; path: string }> = [];
  const references: Array<{ label: string; path: string }> = [];
  const rows: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-initial-route-stability-probe-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--observation') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --observation value\n${usage()}`);
      observations.push(parseLabelPath(value, '--observation'));
      continue;
    }
    if (arg === '--reference') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --reference value\n${usage()}`);
      references.push(parseLabelPath(value, '--reference'));
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
      if (!Number.isFinite(value)) throw new Error(`Invalid --target-score\n${usage()}`);
      targetScore = value;
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (observations.length === 0) throw new Error(`At least one --observation is required\n${usage()}`);
  return { observations, references, rows, outDir, targetScore };
}

function parseLabelPath(value: string, flag: string): { label: string; path: string } {
  const split = value.indexOf('=');
  if (split <= 0) throw new Error(`Invalid ${flag} "${value}", expected label=path`);
  return { label: value.slice(0, split), path: resolve(value.slice(split + 1)) };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function resolveRunFile(path: string, filename: string): Promise<string> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  return info.isDirectory() ? join(resolved, filename) : resolved;
}

function rowsOf(report: BenchmarkReport): RemediateRow[] {
  if (Array.isArray(report)) return report;
  return Array.isArray(report.rows) ? report.rows : Array.isArray(report.remediateResults) ? report.remediateResults : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rowFile(row: { id?: string; file?: string; filename?: string }): string {
  return row.file ?? row.filename ?? row.id ?? '';
}

function rowKey(row: { id?: string; file?: string; filename?: string }): string {
  const file = rowFile(row);
  const match = file.match(/\b(\d{4})\b/);
  return match?.[1] ?? row.id ?? basename(file).replace(/\.pdf$/i, '');
}

function categoryMap(list: CategoryScore[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const category of list ?? []) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') out[category.key] = category.score;
  }
  return out;
}

function remediateCategories(row: RemediateRow): Record<string, number> {
  return categoryMap(row.categoryGap?.after ?? row.reanalyzedCategories ?? row.afterCategories ?? []);
}

function getPath(input: unknown, path: string[]): unknown {
  let current = input;
  for (const part of path) {
    const record = asObject(current);
    if (!(part in record)) return null;
    current = record[part];
  }
  return current;
}

function compactSignals(profile: Record<string, unknown> | undefined): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const item of SIGNAL_PATHS) {
    const value = getPath(profile, item.path);
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || value === null) out[item.key] = value;
  }
  return out;
}

function structuralSignature(value: unknown): Record<string, number | boolean | string | null> {
  const classification = asObject(value);
  const content = asObject(classification.contentProfile);
  const font = asObject(classification.fontRiskProfile);
  const out: Record<string, number | boolean | string | null> = {};
  for (const [key, item] of Object.entries({
    structureClass: classification.structureClass,
    confidence: classification.confidence,
    pageBucket: content.pageBucket,
    dominantContent: content.dominantContent,
    hasStructureTree: content.hasStructureTree,
    hasFigures: content.hasFigures,
    hasTables: content.hasTables,
    annotationRisk: content.annotationRisk,
    taggedContentRisk: content.taggedContentRisk,
    fontRiskLevel: font.riskLevel,
    riskyFontCount: font.riskyFontCount,
    missingUnicodeFontCount: font.missingUnicodeFontCount,
    unembeddedFontCount: font.unembeddedFontCount,
  })) {
    if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'string' || item === null) out[key] = item;
  }
  return out;
}

function parseDetails(details: unknown): Record<string, unknown> {
  if (typeof details === 'string' && details.trim().startsWith('{')) {
    try {
      return asObject(JSON.parse(details) as unknown);
    } catch {
      return {};
    }
  }
  return asObject(details);
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
  const parsed = parseDetails(details);
  const single = asObject(parsed.pacRuleRegression);
  if (typeof single.ruleId === 'string') out.add(single.ruleId);
  const many = Array.isArray(parsed.pacRuleRegressions) ? parsed.pacRuleRegressions : [];
  for (const item of many) {
    const rule = asObject(item);
    if (typeof rule.ruleId === 'string') out.add(rule.ruleId);
  }
  for (const match of detailsText(details).matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
    if (match[1]) out.add(match[1]);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function stageRegressions(details: unknown): string[] {
  const out = new Set<string>();
  for (const match of detailsText(details).matchAll(/stage_regressed_category\(([^)]+)\)/g)) {
    for (const part of match[1]?.split(',') ?? []) {
      const trimmed = part.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  for (const match of detailsText(details).matchAll(/post_pass_regressed_score\(([^)]+)\)/g)) {
    if (match[1]) out.add(`post_pass_score:${match[1]}`);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function normalizeTool(tool: AppliedTool): NormalizedTool {
  const parsed = parseDetails(tool.details);
  const debug = asObject(parsed.debug);
  const replay = asObject(debug.replayState);
  const invariants = asObject(parsed.invariants);
  return {
    toolName: tool.toolName ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: asNumber(tool.stage),
    scoreBefore: asNumber(replay.scoreBefore) ?? asNumber(tool.scoreBefore),
    scoreAfter: asNumber(replay.scoreAfter) ?? asNumber(tool.scoreAfter),
    note: asString(parsed.note) ?? asString(parsed.raw) ?? asString(parsed.reason) ?? asString(parsed.outcome),
    targetRef: asString(replay.targetRef) ?? asString(invariants.targetRef) ?? asString(invariants.structRef),
    stateSignatureBefore: asString(replay.stateSignatureBefore),
    stateSignatureAfter: asString(replay.stateSignatureAfter),
    pacRegressions: pacRegressions(tool.details),
    stageRegressions: stageRegressions(tool.details),
  };
}

function normalizeAnalysis(row: AnalysisRow): NormalizedAnalysis {
  return {
    key: rowKey(row),
    file: rowFile(row),
    score: asNumber(row.score),
    grade: asString(row.grade),
    pdfClass: asString(row.pdfClass),
    categories: categoryMap(row.categories),
    structuralSignature: structuralSignature(row.structuralClassification),
    profileSignals: compactSignals(row.detectionProfile),
    failureFamily: row.failureProfile?.primaryFailureFamily ?? null,
    deterministicIssues: [...(row.failureProfile?.deterministicIssues ?? [])].sort(),
    manualOnlyIssues: [...(row.failureProfile?.manualOnlyIssues ?? [])].sort(),
    routingHints: [...(row.failureProfile?.routingHints ?? [])].sort(),
  };
}

function normalizeRemediate(row: RemediateRow): NormalizedRemediate {
  return {
    key: rowKey(row),
    file: rowFile(row),
    beforeScore: asNumber(row.beforeScore),
    afterScore: asNumber(row.reanalyzedScore) ?? asNumber(row.afterScore) ?? asNumber(row.afterDeterministicScore),
    afterGrade: asString(row.reanalyzedGrade) ?? asString(row.afterGrade) ?? asString(row.afterDeterministicGrade),
    falsePositiveApplied: asNumber(row.falsePositiveAppliedCount) ?? asNumber(row.falsePositiveApplied) ?? 0,
    afterCategories: remediateCategories(row),
    primaryRoute: row.planningSummary?.primaryRoute ?? null,
    routeStatuses: Object.fromEntries((row.planningSummary?.routeSummaries ?? []).map(route => [
      route.route ?? 'unknown',
      route.reason ? `${route.status ?? 'unknown'}:${route.reason}` : route.status ?? 'unknown',
    ])),
    scheduledTools: [...(row.planningSummary?.scheduledTools ?? [])].sort(),
    triggeringSignals: [...(row.planningSummary?.triggeringSignals ?? [])].sort(),
    residualFamilies: [...(row.planningSummary?.residualFamilies ?? [])].sort(),
    tools: (row.appliedTools ?? []).map(normalizeTool),
  };
}

function mapRows<T extends { key: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map(row => [row.key, row]));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function firstState(tools: NormalizedTool[]): string | null {
  const tool = tools.find(item => item.stateSignatureBefore || item.stateSignatureAfter);
  return tool?.stateSignatureBefore ?? tool?.stateSignatureAfter ?? null;
}

function firstCommittedState(tools: NormalizedTool[]): string | null {
  const tool = tools.find(item => ['applied', 'no_effect'].includes(item.outcome) && (item.stateSignatureAfter || item.stateSignatureBefore));
  return tool?.stateSignatureAfter ?? tool?.stateSignatureBefore ?? null;
}

function earlyRouteKey(tools: NormalizedTool[], maxStage = 4): string {
  return tools
    .filter(tool => (tool.stage ?? 99) <= maxStage)
    .map(tool => [
      tool.stage ?? 'n/a',
      tool.toolName,
      tool.outcome,
      `${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`,
      tool.note ?? '',
      tool.pacRegressions.join(','),
      tool.stageRegressions.join(','),
    ].join(':'))
    .join(' || ');
}

function summarizeObservation(label: string, analysis: NormalizedAnalysis | null, remediate: NormalizedRemediate | null): ObservationSummary {
  return {
    label,
    score: remediate?.afterScore ?? null,
    grade: remediate?.afterGrade ?? null,
    initialScore: analysis?.score ?? remediate?.beforeScore ?? null,
    initialCategories: analysis?.categories ?? {},
    afterCategories: remediate?.afterCategories ?? {},
    firstStateSignature: firstState(remediate?.tools ?? []),
    firstCommittedSignature: firstCommittedState(remediate?.tools ?? []),
    firstDivergenceKey: earlyRouteKey(remediate?.tools ?? []),
    primaryRoute: remediate?.primaryRoute ?? null,
    routeStatuses: remediate?.routeStatuses ?? {},
    scheduledTools: remediate?.scheduledTools ?? [],
    pacRegressions: uniqueSorted((remediate?.tools ?? []).flatMap(tool => tool.pacRegressions)),
    stageRegressions: uniqueSorted((remediate?.tools ?? []).flatMap(tool => tool.stageRegressions)),
    signalSnapshot: analysis?.profileSignals ?? {},
  };
}

function summarizeReference(label: string, row: NormalizedRemediate | null, observations: ObservationSummary[]): ReferenceSummary {
  const first = firstState(row?.tools ?? []);
  const early = earlyRouteKey(row?.tools ?? []);
  return {
    label,
    score: row?.afterScore ?? null,
    grade: row?.afterGrade ?? null,
    firstStateSignature: first,
    firstCommittedSignature: firstCommittedState(row?.tools ?? []),
    earlyRouteKey: early,
    comparableInitial: first !== null && observations.some(observation => observation.firstStateSignature === first),
    comparableEarlyRoute: early.length > 0 && observations.some(observation => observation.firstDivergenceKey === early),
  };
}

function categoryDeltas(observations: ObservationSummary[]): Array<{ key: string; min: number; max: number; delta: number }> {
  const byKey = new Map<string, number[]>();
  for (const observation of observations) {
    for (const [key, value] of Object.entries(observation.initialCategories)) {
      const values = byKey.get(key) ?? [];
      values.push(value);
      byKey.set(key, values);
    }
  }
  return [...byKey.entries()]
    .map(([key, values]) => ({ key, min: Math.min(...values), max: Math.max(...values), delta: Math.max(...values) - Math.min(...values) }))
    .filter(item => item.delta >= 10)
    .sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key));
}

function signalDeltas(observations: ObservationSummary[]): Array<{ key: string; values: Array<number | boolean | string | null> }> {
  const keys = new Set(observations.flatMap(observation => Object.keys(observation.signalSnapshot)));
  const out: Array<{ key: string; values: Array<number | boolean | string | null> }> = [];
  for (const key of keys) {
    const values = observations.map(observation => observation.signalSnapshot[key] ?? null);
    const unique = new Set(values.map(value => JSON.stringify(value)));
    if (unique.size <= 1) continue;
    const numeric = values.every(value => typeof value === 'number');
    if (numeric) {
      const nums = values as number[];
      if (Math.max(...nums) - Math.min(...nums) < 2) continue;
    }
    out.push({ key, values });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

function bestReference(references: ReferenceSummary[]): ReferenceSummary | null {
  const high = references.filter(reference => reference.score !== null);
  if (high.length === 0) return null;
  return [...high].sort((a, b) => {
    const scoreDelta = (b.score ?? -1) - (a.score ?? -1);
    if (scoreDelta !== 0) return scoreDelta;
    if (a.comparableInitial !== b.comparableInitial) return Number(b.comparableInitial) - Number(a.comparableInitial);
    if (a.comparableEarlyRoute !== b.comparableEarlyRoute) return Number(b.comparableEarlyRoute) - Number(a.comparableEarlyRoute);
    return a.label.localeCompare(b.label);
  })[0] ?? null;
}

function classifyRow(input: {
  observations: ObservationSummary[];
  references: ReferenceSummary[];
  best: ReferenceSummary | null;
  categoryDelta: Array<{ key: string; min: number; max: number; delta: number }>;
  signalDelta: Array<{ key: string; values: Array<number | boolean | string | null> }>;
  initialSignatureCount: number;
  comparableHighReferenceCount: number;
  comparableEarlyReferenceCount: number;
  targetScore: number;
}): { classification: InitialRouteStabilityClass; reasons: string[]; recommendedNext: string } {
  const { observations, best, categoryDelta, signalDelta, initialSignatureCount, comparableHighReferenceCount, comparableEarlyReferenceCount, targetScore } = input;
  const lowObservations = observations.filter(observation => (observation.score ?? -Infinity) < targetScore);
  const reasons: string[] = [];
  if (lowObservations.length === 0) {
    return { classification: 'gate_clear', reasons: ['all observations are at or above target'], recommendedNext: 'use_as_control_for_future_table_validation' };
  }
  if (!best || (best.score ?? -Infinity) < targetScore) {
    return { classification: 'no_high_reference', reasons: ['no high reference at or above target'], recommendedNext: 'collect_higher_reference_or_park_low_row' };
  }

  reasons.push(`best_reference=${best.label}:${best.score}`);
  if (categoryDelta.length > 0) reasons.push(`analysis_category_deltas=${categoryDelta.map(delta => `${delta.key}:${delta.min}->${delta.max}`).join(',')}`);
  if (signalDelta.length > 0) reasons.push(`signal_deltas=${signalDelta.map(delta => delta.key).join(',')}`);
  if (initialSignatureCount > 1) reasons.push(`low_repeat_initial_signature_count=${initialSignatureCount}`);
  if (comparableHighReferenceCount > 0) reasons.push(`comparable_high_initial_refs=${comparableHighReferenceCount}`);
  if (comparableEarlyReferenceCount > 0) reasons.push(`comparable_high_early_refs=${comparableEarlyReferenceCount}`);

  const severeAnalysisDelta = categoryDelta.some(delta => delta.delta >= 20) || signalDelta.some(delta => /heading|figure|table/.test(delta.key));
  if (severeAnalysisDelta) {
    return {
      classification: 'unstable_initial_analysis',
      reasons,
      recommendedNext: 'diagnose native analyzer count/drop variance before remediation behavior',
    };
  }
  if (initialSignatureCount > 1 && categoryDelta.length === 0) {
    return {
      classification: 'stable_low_replay_signature_drift',
      reasons,
      recommendedNext: 'diagnose replay-state signature construction or hidden state drift before behavior',
    };
  }
  if (comparableHighReferenceCount > 0 && comparableEarlyReferenceCount === 0) {
    return {
      classification: 'early_structural_pac_guard_drift',
      reasons,
      recommendedNext: 'compare stage 1-4 structural/PAC guarded decisions with controls',
    };
  }
  if (comparableEarlyReferenceCount > 0) {
    return {
      classification: 'family_specific_after_stable_route',
      reasons,
      recommendedNext: 'split later figure/table side effects only after controls prove the family-specific predicate',
    };
  }
  return {
    classification: 'no_behavior_ready',
    reasons,
    recommendedNext: 'park_or_collect_more_repeat_evidence',
  };
}

function countClasses(rows: InitialRouteProbeRow[]): Record<InitialRouteStabilityClass, number> {
  const out = Object.fromEntries(CLASSES.map(item => [item, 0])) as Record<InitialRouteStabilityClass, number>;
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}

function decide(rows: InitialRouteProbeRow[]): InitialRouteProbeDiagnostic['decision'] {
  const counts = countClasses(rows);
  if (rows.length > 0 && rows.every(row => row.classification === 'gate_clear')) {
    return { status: 'original50_route_ready_for_table_reopen', reasons: ['all selected rows are clear'], nextLane: 'reopen_strict_object_backed_table_lanes' };
  }
  const analyzer = counts.unstable_initial_analysis + counts.stable_low_replay_signature_drift;
  if (analyzer > 0) {
    return {
      status: 'diagnose_analyzer_or_replay_state_before_behavior',
      reasons: [`${analyzer} selected row(s) need analyzer/replay-state stability before behavior`],
      nextLane: 'native_analyzer_or_replay_signature_stability_probe',
    };
  }
  if (counts.early_structural_pac_guard_drift > 0) {
    return {
      status: 'diagnose_early_structural_pac_guard_before_behavior',
      reasons: [`${counts.early_structural_pac_guard_drift} selected row(s) diverge in early structural/PAC-guarded routing`],
      nextLane: 'stage_1_to_4_pac_guard_attribution_probe',
    };
  }
  if (counts.family_specific_after_stable_route > 0) {
    return {
      status: 'plan_family_specific_probe',
      reasons: [`${counts.family_specific_after_stable_route} selected row(s) have comparable early high references`],
      nextLane: 'family_specific_late_side_effect_probe_with_controls',
    };
  }
  if (counts.no_high_reference > 0) {
    return {
      status: 'collect_higher_reference_or_repeat',
      reasons: [`${counts.no_high_reference} selected row(s) lack a high reference`],
      nextLane: 'focused_repeat_or_park_low_row',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: ['no selected row has behavior-ready evidence'],
    nextLane: 'park_or_collect_more_evidence',
  };
}

function rowMatches(key: string, file: string, selectors: string[]): boolean {
  if (selectors.length === 0) return true;
  const text = `${key} ${file}`.toLowerCase();
  return selectors.some(selector => text.includes(selector.toLowerCase()));
}

export async function loadObservation(input: { label: string; path: string }): Promise<ObservationInput> {
  const analyzePath = await resolveRunFile(input.path, 'analyze.results.json');
  const remediatePath = await resolveRunFile(input.path, 'remediate.results.json');
  const [analysisRows, remediateRows] = await Promise.all([
    readJson<AnalysisRow[]>(analyzePath),
    readJson<RemediateRow[]>(remediatePath),
  ]);
  return {
    label: input.label,
    runDir: resolve(input.path),
    analyzePath,
    remediatePath,
    analyze: mapRows(analysisRows.map(normalizeAnalysis)),
    remediate: mapRows(remediateRows.map(normalizeRemediate)),
  };
}

export async function loadReference(input: { label: string; path: string }): Promise<ReferenceInput> {
  const report = await readJson<BenchmarkReport>(input.path);
  return {
    label: input.label,
    path: resolve(input.path),
    rows: mapRows(rowsOf(report).map(normalizeRemediate)),
  };
}

export function buildInitialRouteProbeDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  observations: ObservationInput[];
  references?: ReferenceInput[];
  rows?: string[];
  targetScore?: number;
}): InitialRouteProbeDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const selectors = input.rows ?? [];
  const keys = new Set<string>();
  for (const observation of input.observations) {
    for (const row of observation.remediate.values()) {
      if (rowMatches(row.key, row.file, selectors)) keys.add(row.key);
    }
  }
  for (const reference of input.references ?? []) {
    for (const row of reference.rows.values()) {
      if (rowMatches(row.key, row.file, selectors)) keys.add(row.key);
    }
  }

  const rows: InitialRouteProbeRow[] = [...keys].sort((a, b) => a.localeCompare(b)).map(key => {
    const observations = input.observations.map(observation => summarizeObservation(
      observation.label,
      observation.analyze.get(key) ?? null,
      observation.remediate.get(key) ?? null,
    ));
    const references = (input.references ?? []).map(reference => summarizeReference(reference.label, reference.rows.get(key) ?? null, observations));
    const best = bestReference(references);
    const categoryDelta = categoryDeltas(observations);
    const signalDelta = signalDeltas(observations);
    const initialSignatureCount = new Set(observations.map(observation => observation.firstStateSignature).filter(Boolean)).size;
    const comparableHighReferenceCount = references.filter(reference => (reference.score ?? -Infinity) >= targetScore && reference.comparableInitial).length;
    const comparableEarlyReferenceCount = references.filter(reference => (reference.score ?? -Infinity) >= targetScore && reference.comparableEarlyRoute).length;
    const classified = classifyRow({
      observations,
      references,
      best,
      categoryDelta,
      signalDelta,
      initialSignatureCount,
      comparableHighReferenceCount,
      comparableEarlyReferenceCount,
      targetScore,
    });
    return {
      key,
      file: input.observations.find(observation => observation.remediate.get(key))?.remediate.get(key)?.file ?? key,
      observations,
      references,
      bestReferenceLabel: best?.label ?? null,
      bestReferenceScore: best?.score ?? null,
      repeatScoreStable: new Set(observations.map(observation => observation.score)).size <= 1,
      analysisCategoryDeltas: categoryDelta,
      signalDeltas: signalDelta,
      initialSignatureCount,
      comparableHighReferenceCount,
      comparableEarlyReferenceCount,
      ...classified,
    };
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    inputs: {
      observations: input.observations.map(observation => ({
        label: observation.label,
        runDir: observation.runDir,
        analyzePath: observation.analyzePath,
        remediatePath: observation.remediatePath,
      })),
      references: (input.references ?? []).map(reference => ({ label: reference.label, path: reference.path })),
    },
    summary: {
      rowCount: rows.length,
      blockerCount: rows.filter(row => row.classification !== 'gate_clear').length,
      byClass: countClasses(rows),
    },
    decision: decide(rows),
    rows,
  };
}

function formatDeltas(row: InitialRouteProbeRow): string {
  const category = row.analysisCategoryDeltas.map(delta => `${delta.key} ${delta.min}->${delta.max}`).join(', ');
  const signals = row.signalDeltas.map(delta => `${delta.key} [${delta.values.join(' / ')}]`).join(', ');
  return [category, signals].filter(Boolean).join('; ') || 'none';
}

export function renderInitialRouteProbeMarkdown(diagnostic: InitialRouteProbeDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Initial Route Stability Probe');
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
  lines.push(`Rows: ${diagnostic.summary.rowCount}`);
  lines.push(`Blockers: ${diagnostic.summary.blockerCount}`);
  lines.push('');
  lines.push('| Class | Count |');
  lines.push('| --- | ---: |');
  for (const klass of CLASSES) lines.push(`| \`${klass}\` | ${diagnostic.summary.byClass[klass]} |`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Row | Observed Scores | Best Ref | Class | Initial Sigs | Comparable High Initial | Comparable High Early | Analysis Deltas |');
  lines.push('| --- | --- | ---: | --- | ---: | ---: | ---: | --- |');
  for (const row of diagnostic.rows) {
    const scores = row.observations.map(observation => `${observation.label}:${observation.score ?? 'n/a'}`).join(', ');
    lines.push(`| \`${row.key}\` | ${scores} | ${row.bestReferenceScore ?? 'n/a'}${row.bestReferenceLabel ? ` (${row.bestReferenceLabel})` : ''} | \`${row.classification}\` | ${row.initialSignatureCount} | ${row.comparableHighReferenceCount} | ${row.comparableEarlyReferenceCount} | ${formatDeltas(row)} |`);
  }
  for (const row of diagnostic.rows) {
    lines.push('');
    lines.push(`### ${row.key}`);
    lines.push('');
    lines.push(`File: \`${row.file}\``);
    lines.push(`Classification: \`${row.classification}\``);
    lines.push(`Recommended next: \`${row.recommendedNext}\``);
    for (const reason of row.reasons) lines.push(`- ${reason}`);
    lines.push('');
    lines.push('| Observation | Score | Initial Score | First State | Primary Route | PAC/Stage Regressions |');
    lines.push('| --- | ---: | ---: | --- | --- | --- |');
    for (const observation of row.observations) {
      const regressions = [...observation.pacRegressions, ...observation.stageRegressions].join(', ') || 'none';
      lines.push(`| ${observation.label} | ${observation.score ?? 'n/a'}${observation.grade ? `/${observation.grade}` : ''} | ${observation.initialScore ?? 'n/a'} | \`${observation.firstStateSignature ?? 'none'}\` | \`${observation.primaryRoute ?? 'none'}\` | ${regressions} |`);
    }
    lines.push('');
    lines.push('| Reference | Score | First State | Comparable Initial | Comparable Early |');
    lines.push('| --- | ---: | --- | --- | --- |');
    for (const reference of row.references.filter(reference => reference.score !== null)) {
      lines.push(`| ${reference.label} | ${reference.score ?? 'n/a'}${reference.grade ? `/${reference.grade}` : ''} | \`${reference.firstStateSignature ?? 'none'}\` | ${reference.comparableInitial ? 'yes' : 'no'} | ${reference.comparableEarlyRoute ? 'yes' : 'no'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function writeInitialRouteProbeDiagnostic(args: Args): Promise<InitialRouteProbeDiagnostic> {
  const [observations, references] = await Promise.all([
    Promise.all(args.observations.map(loadObservation)),
    Promise.all(args.references.map(loadReference)),
  ]);
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const diagnostic = buildInitialRouteProbeDiagnostic({
    outDir,
    observations,
    references,
    rows: args.rows,
    targetScore: args.targetScore,
  });
  await writeFile(join(outDir, 'original50-initial-route-stability-probe.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-initial-route-stability-probe.md'), renderInitialRouteProbeMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main() {
  const args = parseArgs();
  const diagnostic = await writeInitialRouteProbeDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-initial-route-stability-probe.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; blockers: ${diagnostic.summary.blockerCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-initial-route-stability-probe.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

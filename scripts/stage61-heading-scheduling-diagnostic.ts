#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  buildEligibleHeadingBootstrapCandidates,
  type HeadingBootstrapCandidate,
} from '../src/services/headingBootstrapCandidates.js';
import { classifyZeroHeadingRecovery } from '../src/services/remediation/headingRecovery.js';
import { buildDefaultParams, planForRemediation } from '../src/services/remediation/planner.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot, RemediationPlan } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

type JsonRecord = Record<string, unknown>;

export type Stage61SchedulingBlocker =
  | 'candidate_scheduling_blocked'
  | 'no_reachable_candidates'
  | 'create_heading_already_scheduled'
  | 'hidden_export_mismatch'
  | 'hierarchy_or_not_zero_heading_tail'
  | 'parked_analyzer_debt'
  | 'missing_row_or_analysis_error';

export interface Stage61HeadingCandidateSummary {
  rank: number;
  structRef: string;
  tag: string;
  page: number;
  score: number;
  text: string;
  reasons: string[];
  penalties: string[];
}

export interface Stage61TerminalHeadingTool {
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  source: string | null;
  note: unknown;
  targetRef: unknown;
  rootReachableHeadingCountBefore: unknown;
  rootReachableHeadingCountAfter: unknown;
}

export interface Stage61HeadingSchedulingInput {
  id: string;
  role: 'focus' | 'control' | 'parked';
  analysis?: AnalysisResult | null;
  snapshot?: DocumentSnapshot | null;
  plan?: RemediationPlan | null;
  eligibleCandidates?: HeadingBootstrapCandidate[];
  terminalHeadingTools?: Stage61TerminalHeadingTool[];
  error?: string;
}

export interface Stage61HeadingSchedulingRow {
  id: string;
  role: 'focus' | 'control' | 'parked';
  blocker: Stage61SchedulingBlocker;
  reasons: string[];
  score: number | null;
  grade: string | null;
  headingStructure: number | null;
  altText: number | null;
  readingOrder: number | null;
  pdfClass: string | null;
  pageCount: number | null;
  structureTreePresent: boolean | null;
  treeDepth: number | null;
  paragraphStructElemCount: number | null;
  eligibleCandidateCount: number;
  topCandidates: Stage61HeadingCandidateSummary[];
  zeroHeadingRecovery: JsonRecord | null;
  plannerRoutes: JsonRecord | null;
  createHeadingScheduled: boolean;
  createHeadingSkippedReason: string | null;
  createHeadingParams: JsonRecord | null;
  terminalHeadingTools: Stage61TerminalHeadingTool[];
  error?: string;
}

export interface Stage61HeadingSchedulingReport {
  generatedAt: string;
  rows: Stage61HeadingSchedulingRow[];
  blockerDistribution: Record<string, number>;
  decision: {
    status: 'implement_heading_scheduling_fix' | 'diagnostic_only_move_to_table_tail' | 'diagnostic_only_inconclusive';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage61-heading-scheduling-diagnostic-2026-04-24-r1';
const DEFAULT_EDGE1_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix/manifest.json';
const DEFAULT_EDGE2_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix_2/manifest.json';
const DEFAULT_EDGE1_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage59-edge-mix-2026-04-24-r1';
const DEFAULT_EDGE2_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage59-edge-mix2-2026-04-24-r2';
const DEFAULT_EDGE1_IDS = ['v1-4567', 'v1-4139', 'v1-4122'];
const DEFAULT_EDGE2_IDS = ['v1-4758', 'v1-4700', 'v1-4699', 'v1-4722'];
const PARKED_ANALYZER_ROWS = new Set(['v1-4171', 'v1-4487', 'v1-4683']);
const HEADING_TOOLS = new Set([
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage61-heading-scheduling-diagnostic.ts [options]',
    `  --out <dir>             Default: ${DEFAULT_OUT}`,
    `  --edge1-manifest <path> Default: ${DEFAULT_EDGE1_MANIFEST}`,
    `  --edge2-manifest <path> Default: ${DEFAULT_EDGE2_MANIFEST}`,
    `  --edge1-run <dir>       Default: ${DEFAULT_EDGE1_RUN}`,
    `  --edge2-run <dir>       Default: ${DEFAULT_EDGE2_RUN}`,
    '  --id <row-id>           Override focus/control ids; repeatable. Looks in both manifests.',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function categoryScore(analysis: AnalysisResult | null | undefined, key: string): number | null {
  return analysis?.categories.find(category => category.key === key)?.score ?? null;
}

function toolName(tool: JsonRecord): string {
  return str(tool['toolName']) || str(tool['name']) || 'unknown';
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return { raw: details };
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : { raw: details };
  } catch {
    return { raw: details };
  }
}

function nestedRecord(parent: JsonRecord, key: string): JsonRecord {
  const value = parent[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function normalizeId(value: string): string {
  return value.startsWith('v1-') ? value : `v1-${value}`;
}

function candidateSummary(candidate: HeadingBootstrapCandidate, index: number): Stage61HeadingCandidateSummary {
  return {
    rank: index + 1,
    structRef: candidate.structRef,
    tag: candidate.tag,
    page: candidate.page,
    score: candidate.score,
    text: candidate.text.slice(0, 160),
    reasons: candidate.reasons,
    penalties: [],
  };
}

function terminalHeadingToolsFromRow(row: JsonRecord | undefined): Stage61TerminalHeadingTool[] {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  return tools
    .filter(tool => HEADING_TOOLS.has(toolName(tool)))
    .map(tool => {
      const details = parseDetails(tool['details']);
      const invariants = nestedRecord(details, 'invariants');
      const debug = nestedRecord(details, 'debug');
      return {
        toolName: toolName(tool),
        outcome: str(tool['outcome']) || 'unknown',
        stage: num(tool['stage']),
        round: num(tool['round']),
        scoreBefore: num(tool['scoreBefore']),
        scoreAfter: num(tool['scoreAfter']),
        source: str(tool['source']) || null,
        note: details['note'] ?? details['raw'] ?? null,
        targetRef: invariants['targetRef'] ?? debug['targetRef'] ?? null,
        rootReachableHeadingCountBefore: invariants['rootReachableHeadingCountBefore'] ?? null,
        rootReachableHeadingCountAfter: invariants['rootReachableHeadingCountAfter'] ?? null,
      };
    });
}

export function classifyStage61HeadingSchedulingRow(input: Stage61HeadingSchedulingInput): Stage61HeadingSchedulingRow {
  const analysis = input.analysis ?? null;
  const snapshot = input.snapshot ?? null;
  const plan = input.plan ?? null;
  const candidates = input.eligibleCandidates ?? [];
  const terminalHeadingTools = input.terminalHeadingTools ?? [];
  const headingStructure = categoryScore(analysis, 'heading_structure');
  const altText = categoryScore(analysis, 'alt_text');
  const readingOrder = categoryScore(analysis, 'reading_order');
  const headingSignals = snapshot?.detectionProfile?.headingSignals;
  const readingSignals = snapshot?.detectionProfile?.readingOrderSignals;
  const zeroHeadingRecovery = analysis && snapshot ? classifyZeroHeadingRecovery(analysis, snapshot) : null;
  const scheduledTools = plan?.planningSummary?.scheduledTools ?? [];
  const skipped = plan?.planningSummary?.skippedTools?.find(row => row.toolName === 'create_heading_from_candidate');
  const createHeadingScheduled = scheduledTools.includes('create_heading_from_candidate') ||
    (plan?.stages ?? []).some(stage => stage.tools.some(tool => tool.toolName === 'create_heading_from_candidate'));
  const base: Omit<Stage61HeadingSchedulingRow, 'blocker' | 'reasons'> = {
    id: input.id,
    role: input.role,
    score: analysis?.score ?? null,
    grade: analysis?.grade ?? null,
    headingStructure,
    altText,
    readingOrder,
    pdfClass: analysis?.pdfClass ?? null,
    pageCount: snapshot?.pageCount ?? null,
    structureTreePresent: snapshot ? snapshot.structureTree !== null : null,
    treeDepth: readingSignals?.structureTreeDepth ?? null,
    paragraphStructElemCount: snapshot?.paragraphStructElems?.length ?? null,
    eligibleCandidateCount: candidates.length,
    topCandidates: candidates.slice(0, 8).map(candidateSummary),
    zeroHeadingRecovery: zeroHeadingRecovery ? { kind: zeroHeadingRecovery.kind, reasons: zeroHeadingRecovery.reasons } : null,
    plannerRoutes: plan?.planningSummary
      ? {
        primaryRoute: plan.planningSummary.primaryRoute,
        secondaryRoutes: plan.planningSummary.secondaryRoutes,
        triggeringSignals: plan.planningSummary.triggeringSignals,
        scheduledTools,
        routeSummaries: plan.planningSummary.routeSummaries ?? [],
      }
      : null,
    createHeadingScheduled,
    createHeadingSkippedReason: skipped?.reason ?? null,
    createHeadingParams: analysis && snapshot ? buildDefaultParams('create_heading_from_candidate', analysis, snapshot, []) : null,
    terminalHeadingTools,
    ...(input.error ? { error: input.error } : {}),
  };

  const reasons: string[] = [];
  if (input.error || !analysis || !snapshot) {
    reasons.push(input.error ?? 'missing_analysis_or_snapshot');
    return { ...base, blocker: 'missing_row_or_analysis_error', reasons };
  }
  if (input.role === 'parked' || PARKED_ANALYZER_ROWS.has(input.id)) {
    reasons.push('row_is_parked_analyzer_volatility_debt');
    return { ...base, blocker: 'parked_analyzer_debt', reasons };
  }
  reasons.push(`heading_structure=${headingStructure ?? 'missing'}`);
  reasons.push(`extractedHeadingCount=${headingSignals?.extractedHeadingCount ?? 'missing'}`);
  reasons.push(`treeHeadingCount=${headingSignals?.treeHeadingCount ?? 'missing'}`);
  reasons.push(`treeDepth=${readingSignals?.structureTreeDepth ?? 'missing'}`);
  reasons.push(`paragraphStructElemCount=${snapshot.paragraphStructElems?.length ?? 0}`);
  reasons.push(`eligibleCandidateCount=${candidates.length}`);

  if ((headingStructure ?? 100) >= 70 || zeroHeadingRecovery?.kind === 'hierarchy_only') {
    reasons.push('row_is_not_zero_heading_tail');
    return { ...base, blocker: 'hierarchy_or_not_zero_heading_tail', reasons };
  }
  if (zeroHeadingRecovery?.kind === 'hidden_export_mismatch') {
    reasons.push('tree_heading_evidence_is_hidden_export_mismatch');
    return { ...base, blocker: 'hidden_export_mismatch', reasons };
  }
  if (createHeadingScheduled) {
    reasons.push('create_heading_from_candidate_is_scheduled');
    return { ...base, blocker: 'create_heading_already_scheduled', reasons };
  }
  if (candidates.length > 0) {
    reasons.push(`create_heading_skipped:${skipped?.reason ?? 'not_recorded'}`);
    return { ...base, blocker: 'candidate_scheduling_blocked', reasons };
  }
  reasons.push('no_ranked_heading_bootstrap_candidates');
  return { ...base, blocker: 'no_reachable_candidates', reasons };
}

export function buildStage61HeadingSchedulingReport(rows: Stage61HeadingSchedulingRow[]): Stage61HeadingSchedulingReport {
  const blockerDistribution: Record<string, number> = {};
  for (const row of rows) blockerDistribution[row.blocker] = (blockerDistribution[row.blocker] ?? 0) + 1;
  const focus = rows.find(row => row.id === 'v1-4567');
  const reasons: string[] = [];
  let status: Stage61HeadingSchedulingReport['decision']['status'] = 'diagnostic_only_inconclusive';
  let recommendedNext = 'Inspect Stage 61 diagnostic before selecting a fixer.';

  if (focus?.blocker === 'candidate_scheduling_blocked') {
    status = 'implement_heading_scheduling_fix';
    recommendedNext = 'Implement the narrow general zero-heading scheduling fix for ranked paragraph-like candidates.';
    reasons.push('v1-4567 has ranked paragraph-like candidates but create_heading_from_candidate was not scheduled.');
  } else if (focus?.blocker === 'no_reachable_candidates') {
    status = 'diagnostic_only_move_to_table_tail';
    recommendedNext = 'Keep Stage 61 diagnostic-only and move Stage 62 to Table Tail Follow-up v2 for v1-4722.';
    reasons.push('v1-4567 has no eligible ranked paragraph-like candidates, so scheduling cannot safely recover it.');
  } else if (focus) {
    reasons.push(`v1-4567 blocker=${focus.blocker}`);
  } else {
    reasons.push('v1-4567 missing from diagnostic rows.');
  }

  return {
    generatedAt: new Date().toISOString(),
    rows,
    blockerDistribution,
    decision: { status, recommendedNext, reasons },
  };
}

function markdown(report: Stage61HeadingSchedulingReport): string {
  const lines = ['# Stage 61 Heading Scheduling Diagnostic', ''];
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Decision: \`${report.decision.status}\``);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`, '');
  lines.push('Reasons:');
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Rows', '');
  lines.push('| ID | Role | Score | Heading | Candidates | Create Scheduled | Blocker |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.role} | ${row.score ?? 'err'} ${row.grade ?? ''} | ${row.headingStructure ?? 'n/a'} | ${row.eligibleCandidateCount} | ${row.createHeadingScheduled ? 'yes' : 'no'} | ${row.blocker} |`);
  }
  for (const row of report.rows) {
    lines.push('', `## ${row.id}`, '');
    lines.push(`Reasons: \`${row.reasons.join('; ')}\``);
    lines.push(`Zero-heading recovery: \`${JSON.stringify(row.zeroHeadingRecovery)}\``);
    lines.push(`Planner routes: \`${JSON.stringify(row.plannerRoutes)}\``);
    lines.push(`Create-heading skipped reason: \`${row.createHeadingSkippedReason ?? 'none'}\``);
    lines.push(`Create-heading params: \`${JSON.stringify(row.createHeadingParams)}\``);
    lines.push(`Top candidates: \`${JSON.stringify(row.topCandidates)}\``);
    lines.push(`Terminal heading tools: \`${JSON.stringify(row.terminalHeadingTools)}\``);
  }
  lines.push('');
  return lines.join('\n');
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
    const id = str(row['id']);
    const publicationId = str(row['publicationId']);
    if (id) out.set(normalizeId(id.replace(/^v1-/, '')), row);
    if (publicationId) out.set(normalizeId(publicationId), row);
  }
  return out;
}

function parseArgs(argv: string[]): {
  outDir: string;
  edge1Manifest: string;
  edge2Manifest: string;
  edge1Run: string;
  edge2Run: string;
  ids: string[] | null;
} {
  const args = {
    outDir: DEFAULT_OUT,
    edge1Manifest: DEFAULT_EDGE1_MANIFEST,
    edge2Manifest: DEFAULT_EDGE2_MANIFEST,
    edge1Run: DEFAULT_EDGE1_RUN,
    edge2Run: DEFAULT_EDGE2_RUN,
    ids: null as string[] | null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--out') args.outDir = argv[++i] ?? args.outDir;
    else if (arg === '--edge1-manifest') args.edge1Manifest = argv[++i] ?? args.edge1Manifest;
    else if (arg === '--edge2-manifest') args.edge2Manifest = argv[++i] ?? args.edge2Manifest;
    else if (arg === '--edge1-run') args.edge1Run = argv[++i] ?? args.edge1Run;
    else if (arg === '--edge2-run') args.edge2Run = argv[++i] ?? args.edge2Run;
    else if (arg === '--id') {
      if (!args.ids) args.ids = [];
      args.ids.push(normalizeId(argv[++i] ?? ''));
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

async function analyzeManifestRow(
  row: EdgeMixManifestRow,
  role: 'focus' | 'control' | 'parked',
  terminalHeadingTools: Stage61TerminalHeadingTool[],
): Promise<Stage61HeadingSchedulingRow> {
  try {
    const { result, snapshot } = await analyzePdf(row.absolutePath, row.localFile, { bypassCache: true });
    const candidates = buildEligibleHeadingBootstrapCandidates(snapshot);
    const plan = planForRemediation(result, snapshot, [] as AppliedRemediationTool[]);
    return classifyStage61HeadingSchedulingRow({
      id: row.id,
      role,
      analysis: result,
      snapshot,
      plan,
      eligibleCandidates: candidates,
      terminalHeadingTools,
    });
  } catch (error) {
    return classifyStage61HeadingSchedulingRow({
      id: row.id,
      role,
      error: error instanceof Error ? error.message : String(error),
      terminalHeadingTools,
    });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const edge1Rows = await loadEdgeMixManifest(args.edge1Manifest);
  const edge2Rows = await loadEdgeMixManifest(args.edge2Manifest);
  const edge1RunRows = await loadRunRows(args.edge1Run);
  const edge2RunRows = await loadRunRows(args.edge2Run);
  const selectedIds = args.ids ?? [...DEFAULT_EDGE1_IDS, ...DEFAULT_EDGE2_IDS];
  const rowsById = new Map<string, { row: EdgeMixManifestRow; runRow: JsonRecord | undefined }>();
  for (const row of edge1Rows) rowsById.set(row.id, { row, runRow: edge1RunRows.get(row.id) });
  for (const row of edge2Rows) rowsById.set(row.id, { row, runRow: edge2RunRows.get(row.id) });

  const reports: Stage61HeadingSchedulingRow[] = [];
  for (const id of selectedIds.map(normalizeId)) {
    const entry = rowsById.get(id);
    if (!entry) {
      reports.push(classifyStage61HeadingSchedulingRow({
        id,
        role: PARKED_ANALYZER_ROWS.has(id) ? 'parked' : id === 'v1-4567' ? 'focus' : 'control',
        error: 'row_missing_from_manifests',
      }));
      continue;
    }
    const role: 'focus' | 'control' | 'parked' = PARKED_ANALYZER_ROWS.has(id) ? 'parked' : id === 'v1-4567' ? 'focus' : 'control';
    reports.push(await analyzeManifestRow(entry.row, role, terminalHeadingToolsFromRow(entry.runRow)));
  }
  const report = buildStage61HeadingSchedulingReport(reports);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage61-heading-scheduling-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage61-heading-scheduling-diagnostic.md'), markdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'stage61-heading-scheduling-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

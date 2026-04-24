#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface CategoryRow {
  key: string;
  score: number;
}

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  details?: unknown;
  stage?: number;
  round?: number;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
}

export interface Stage52aBenchmarkRow {
  id: string;
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterCategories?: CategoryRow[];
  afterScoreCapsApplied?: unknown[];
  afterDetectionProfile?: {
    headingSignals?: Record<string, unknown>;
    readingOrderSignals?: Record<string, unknown>;
  } | null;
  appliedTools?: ToolRow[];
}

export type Stage52aHeadingBlocker =
  | 'hidden_root_reachable_heading_evidence'
  | 'create_heading_target_failed'
  | 'create_heading_not_scheduled'
  | 'true_zero_heading_no_candidate_evidence'
  | 'not_zero_heading_tail';

const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage50-target-edge-mix-2026-04-24-r3';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage52a-heading-tail-diagnostic-2026-04-24-r1';
const DEFAULT_FOCUS_IDS = ['v1-4139', 'v1-4567', 'v1-4215'];
const HEADING_TOOLS = new Set([
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
]);

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage52a-heading-tail-diagnostic.ts [run-dir] [out-dir]

Defaults:
  run-dir: ${DEFAULT_RUN}
  out-dir: ${DEFAULT_OUT}`;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toolName(tool: ToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function parseDetails(details: unknown): Record<string, unknown> {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string') return { raw: details };
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { raw: details };
  } catch {
    return { raw: details };
  }
}

function nestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function categoryScore(row: Stage52aBenchmarkRow, key: string): number | null {
  return row.afterCategories?.find(category => category.key === key)?.score ?? null;
}

function headingTools(row: Stage52aBenchmarkRow): ToolRow[] {
  return (row.appliedTools ?? []).filter(tool => HEADING_TOOLS.has(toolName(tool)));
}

function maxRootReachableHeadingEvidence(row: Stage52aBenchmarkRow): number {
  let max = 0;
  for (const tool of row.appliedTools ?? []) {
    const details = parseDetails(tool.details);
    const invariants = nestedRecord(details, 'invariants');
    max = Math.max(
      max,
      num(invariants['rootReachableHeadingCountBefore']),
      num(invariants['rootReachableHeadingCountAfter']),
    );
    const debug = nestedRecord(details, 'debug');
    max = Math.max(max, num(debug['rootReachableHeadingCount']));
    for (const key of ['beforeSnapshot', 'afterSnapshot', 'before', 'after']) {
      const nested = nestedRecord(debug, key);
      max = Math.max(max, num(nested['rootReachableHeadingCount']), num(nested['globalHeadingCount']));
    }
  }
  return max;
}

function terminalHeadingTools(row: Stage52aBenchmarkRow): Array<Record<string, unknown>> {
  return headingTools(row).map((tool, index) => {
    const details = parseDetails(tool.details);
    const invariants = nestedRecord(details, 'invariants');
    return {
      index,
      toolName: toolName(tool),
      outcome: tool.outcome ?? 'unknown',
      stage: tool.stage ?? null,
      round: tool.round ?? null,
      scoreBefore: tool.scoreBefore ?? null,
      scoreAfter: tool.scoreAfter ?? null,
      delta: tool.delta ?? null,
      note: details['note'] ?? details['raw'] ?? null,
      targetRef: invariants['targetRef'] ?? nestedRecord(details, 'debug')['targetRef'] ?? null,
      rootReachableHeadingCountBefore: invariants['rootReachableHeadingCountBefore'] ?? null,
      rootReachableHeadingCountAfter: invariants['rootReachableHeadingCountAfter'] ?? null,
      rootReachableDepthBefore: invariants['rootReachableDepthBefore'] ?? null,
      rootReachableDepthAfter: invariants['rootReachableDepthAfter'] ?? null,
      globalH1CountAfter: invariants['globalH1CountAfter'] ?? null,
    };
  });
}

export function classifyStage52aHeadingTail(row: Stage52aBenchmarkRow): {
  blocker: Stage52aHeadingBlocker;
  reasons: string[];
} {
  const headingScore = categoryScore(row, 'heading_structure') ?? 100;
  const headingSignals = row.afterDetectionProfile?.headingSignals ?? {};
  const extractedHeadingCount = num(headingSignals['extractedHeadingCount']);
  const treeHeadingCount = num(headingSignals['treeHeadingCount']);
  const hiddenRootHeadingEvidence = maxRootReachableHeadingEvidence(row);
  const tools = headingTools(row);
  const createRows = tools.filter(tool => toolName(tool) === 'create_heading_from_candidate');
  const reasons = [
    `heading_structure=${headingScore}`,
    `extractedHeadingCount=${extractedHeadingCount}`,
    `treeHeadingCount=${treeHeadingCount}`,
    `maxRootReachableHeadingEvidence=${hiddenRootHeadingEvidence}`,
  ];

  if (headingScore >= 70) {
    return { blocker: 'not_zero_heading_tail', reasons };
  }
  if (hiddenRootHeadingEvidence > 0 && treeHeadingCount === 0 && extractedHeadingCount === 0) {
    reasons.push('mutation/debug evidence proves root-reachable headings but final scorer sees none');
    return { blocker: 'hidden_root_reachable_heading_evidence', reasons };
  }
  if (createRows.some(tool => ['no_effect', 'failed', 'rejected'].includes(String(tool.outcome ?? '')))) {
    reasons.push('create_heading_from_candidate reached a terminal non-success outcome');
    return { blocker: 'create_heading_target_failed', reasons };
  }
  if (createRows.length === 0) {
    reasons.push('create_heading_from_candidate was not scheduled in this run');
    return { blocker: 'create_heading_not_scheduled', reasons };
  }
  return { blocker: 'true_zero_heading_no_candidate_evidence', reasons };
}

export function buildStage52aHeadingTailReport(
  rows: Stage52aBenchmarkRow[],
  focusIds: string[] = DEFAULT_FOCUS_IDS,
): Record<string, unknown> {
  const byId = new Map(rows.map(row => [row.id, row]));
  const rowReports = focusIds.map(id => {
    const row = byId.get(id);
    if (!row) {
      return {
        id,
        missing: true,
        blocker: 'true_zero_heading_no_candidate_evidence',
        reasons: ['row_missing_from_run'],
      };
    }
    const classification = classifyStage52aHeadingTail(row);
    return {
      id: row.id,
      file: row.file ?? null,
      score: row.afterScore ?? null,
      grade: row.afterGrade ?? null,
      headingStructure: categoryScore(row, 'heading_structure'),
      altText: categoryScore(row, 'alt_text'),
      readingOrder: categoryScore(row, 'reading_order'),
      scoreCaps: row.afterScoreCapsApplied ?? [],
      headingSignals: row.afterDetectionProfile?.headingSignals ?? null,
      readingOrderSignals: row.afterDetectionProfile?.readingOrderSignals ?? null,
      maxRootReachableHeadingEvidence: maxRootReachableHeadingEvidence(row),
      paragraphLikeCandidateCount: 'not_available_in_stage50_benchmark_row',
      terminalHeadingTools: terminalHeadingTools(row),
      ...classification,
    };
  });
  const blockerDistribution: Record<string, number> = {};
  for (const row of rowReports) {
    const blocker = String(row['blocker']);
    blockerDistribution[blocker] = (blockerDistribution[blocker] ?? 0) + 1;
  }
  const sharedBlocker = Object.entries(blockerDistribution)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'unknown';
  return {
    generatedAt: new Date().toISOString(),
    focusIds,
    rowCount: rowReports.length,
    blockerDistribution,
    sharedBlocker,
    recommendedNextFix: sharedBlocker === 'hidden_root_reachable_heading_evidence'
      ? 'repair_heading_analysis_parity_for_root_reachable_heading_evidence'
      : 'inspect_candidate_scheduling_before_mutation',
    rows: rowReports,
  };
}

function markdown(report: Record<string, unknown>): string {
  const lines = ['# Stage 52A Heading Tail Diagnostic', ''];
  lines.push(`Focus ids: \`${JSON.stringify(report['focusIds'])}\``);
  lines.push(`Blocker distribution: \`${JSON.stringify(report['blockerDistribution'])}\``);
  lines.push(`Shared blocker: **${report['sharedBlocker']}**`);
  lines.push(`Recommended next fix: **${report['recommendedNextFix']}**`, '');
  for (const row of report['rows'] as Array<Record<string, unknown>>) {
    lines.push(`## ${row['id']} (${row['score'] ?? 'n/a'} ${row['grade'] ?? 'n/a'})`);
    lines.push(`File: ${row['file'] ?? 'missing'}`);
    lines.push(`Blocker: **${row['blocker']}**`);
    lines.push(`Scores: heading=\`${row['headingStructure']}\`, alt=\`${row['altText']}\`, reading=\`${row['readingOrder']}\``);
    lines.push(`Heading signals: \`${JSON.stringify(row['headingSignals'])}\``);
    lines.push(`Max root-reachable heading evidence: \`${row['maxRootReachableHeadingEvidence']}\``);
    lines.push(`Paragraph-like candidate count: \`${row['paragraphLikeCandidateCount']}\``);
    lines.push('Reasons:');
    for (const reason of row['reasons'] as string[]) lines.push(`- ${reason}`);
    lines.push(`Terminal heading tools: \`${JSON.stringify(row['terminalHeadingTools'])}\``, '');
  }
  return lines.join('\n');
}

async function loadRows(runDir: string): Promise<Stage52aBenchmarkRow[]> {
  const raw = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)
      ? (raw as { rows: unknown[] }).rows
      : null;
  if (!rows) throw new Error(`No remediate rows found in ${runDir}`);
  return rows as Stage52aBenchmarkRow[];
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  argv = argv.filter(arg => arg !== '--');
  if (argv.includes('--help')) {
    console.log(usage());
    return;
  }
  const runDir = argv[0] ?? DEFAULT_RUN;
  const outDir = argv[1] ?? DEFAULT_OUT;
  const rows = await loadRows(runDir);
  const report = buildStage52aHeadingTailReport(rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage52a-heading-tail-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'stage52a-heading-tail-diagnostic.md'), markdown(report));
  console.log(`Wrote Stage 52A heading-tail diagnostic to ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

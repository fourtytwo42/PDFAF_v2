#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { CategoryKey } from '../src/types.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
  type ToolTimelineEvent,
} from './pac-target-route-diagnostic.js';

const DEFAULT_GOOD = 'Output/experiment-corpus-baseline/run-table-header-association-target-2026-05-08-r2';
const DEFAULT_BAD = 'Output/experiment-corpus-baseline/run-table-header-batch-target-2026-05-08-r2';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/fixture-link-recovery-diagnostic-2026-05-08-r1';
const DEFAULT_ROW = 'fixture-inaccessible';
const PAC_REASON_RE = /pac_rule_regressed\(([^)]+)\)/;

const RELEVANT_TOOLS = new Set([
  'repair_native_link_structure',
  'set_link_annotation_contents',
  'tag_unowned_annotations',
  'artifact_repeating_page_furniture',
  'mark_untagged_content_as_artifact',
  'remap_orphan_mcids_as_artifacts',
]);

export type LinkRecoveryClassification =
  | 'pac_blocked_useful_link_repair'
  | 'same_state_artifact_route_guard_candidate'
  | 'upstream_route_volatility'
  | 'planner_or_scheduling_gap'
  | 'safe_recovery_already_available'
  | 'parked_no_safe_behavior'
  | 'missing_evidence';

export type LinkRepairStatus =
  | 'applied_with_pac_recovery'
  | 'applied'
  | 'rejected_orphan_mcid_pac'
  | 'rejected_other'
  | 'missing';

export interface FixtureLinkTimelineRow {
  index: number;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  note: string | null;
  pacReason: string | null;
  pacRuleIds: string[];
  categoryScoresBefore: Partial<Record<CategoryKey, number>>;
  categoryScoresAfter: Partial<Record<CategoryKey, number>>;
}

export interface FixtureLinkRecoveryDiagnostic {
  generatedAt: string;
  goodRun: string;
  badRun: string;
  rowId: string;
  classification: LinkRecoveryClassification;
  goodScore: number | null;
  badScore: number | null;
  goodReanalyzedScore: number | null;
  badReanalyzedScore: number | null;
  goodLinkRepairStatus: LinkRepairStatus;
  badLinkRepairStatus: LinkRepairStatus;
  firstDivergence: TimelineDivergence | null;
  pacOrphanMcidRejectionCount: number;
  pacRejectionCount: number;
  noBenefitArtifactAppliedInBadRoute: boolean;
  laterLinkRecoveryMissing: boolean;
  recommendation: string;
  goodTimeline: FixtureLinkTimelineRow[];
  badTimeline: FixtureLinkTimelineRow[];
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/fixture-link-recovery-diagnostic.ts [--good <run-dir>] [--bad <run-dir>] [--row <id>] [--out <dir>]';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pacRuleIdsFromDetails(details: string | undefined, event: ToolTimelineEvent): string[] {
  const ids = new Set<string>();
  if (event.pacReason) {
    const match = event.pacReason.match(PAC_REASON_RE);
    if (match?.[1]) ids.add(match[1]);
  }
  const parsed = parseDetails(details);
  const regression = asRecord(parsed?.['pacRuleRegression']);
  const ruleId = stringOrNull(regression?.['ruleId']);
  if (ruleId) ids.add(ruleId);
  const regressions = Array.isArray(parsed?.['pacRuleRegressions']) ? parsed?.['pacRuleRegressions'] : [];
  for (const row of regressions) {
    const id = stringOrNull(asRecord(row)?.['ruleId']);
    if (id) ids.add(id);
  }
  const pacRecovery = asRecord(parsed?.['pacRecovery']);
  const recoveryRegressions = Array.isArray(pacRecovery?.['pacRuleRegressions'])
    ? pacRecovery?.['pacRuleRegressions']
    : [];
  for (const row of recoveryRegressions) {
    const id = stringOrNull(asRecord(row)?.['ruleId']);
    if (id) ids.add(id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function relevantTimeline(row: RemediateBenchmarkRow | null | undefined): FixtureLinkTimelineRow[] {
  if (!row) return [];
  const events = toolTimeline(row);
  return events
    .map((event) => {
      const source = row.appliedTools[event.index];
      return {
        index: event.index,
        toolName: event.toolName,
        outcome: event.outcome,
        scoreBefore: event.scoreBefore,
        scoreAfter: event.scoreAfter,
        stateSignatureBefore: event.stateSignatureBefore,
        stateSignatureAfter: event.stateSignatureAfter,
        note: event.note,
        pacReason: event.pacReason,
        pacRuleIds: pacRuleIdsFromDetails(source?.details, event),
        categoryScoresBefore: event.categoryScoresBefore,
        categoryScoresAfter: event.categoryScoresAfter,
      };
    })
    .filter(row => RELEVANT_TOOLS.has(row.toolName) || row.pacRuleIds.length > 0);
}

function linkRepairStatus(row: RemediateBenchmarkRow | null | undefined): LinkRepairStatus {
  const event = relevantTimeline(row).find(item => item.toolName === 'repair_native_link_structure');
  if (!event) return 'missing';
  if (event.outcome === 'applied' && event.note === 'pac_orphan_mcid_recovery(repair_native_link_structure)') {
    return 'applied_with_pac_recovery';
  }
  if (event.outcome === 'applied') return 'applied';
  if (event.pacRuleIds.every(ruleId => ruleId === 'pdfua.content.orphan_mcids_absent') && event.pacRuleIds.length > 0) {
    return 'rejected_orphan_mcid_pac';
  }
  return 'rejected_other';
}

function noBenefitArtifactApplied(timeline: FixtureLinkTimelineRow[]): boolean {
  return timeline.some(row => (
    (row.toolName === 'mark_untagged_content_as_artifact' || row.toolName === 'artifact_repeating_page_furniture') &&
    row.outcome === 'applied' &&
    row.scoreBefore === row.scoreAfter
  ));
}

function orphanMcidRejectionCount(timeline: FixtureLinkTimelineRow[]): number {
  return timeline.filter(row => row.pacRuleIds.includes('pdfua.content.orphan_mcids_absent')).length;
}

function pacRejectionCount(timeline: FixtureLinkTimelineRow[]): number {
  return timeline.filter(row => row.pacRuleIds.length > 0).length;
}

export function buildFixtureLinkRecoveryDiagnostic(input: {
  goodRun: string;
  badRun: string;
  rowId: string;
  goodRow?: RemediateBenchmarkRow | null;
  badRow?: RemediateBenchmarkRow | null;
  generatedAt?: string;
}): FixtureLinkRecoveryDiagnostic {
  const goodRow = input.goodRow ?? null;
  const badRow = input.badRow ?? null;
  const firstDivergence = goodRow && badRow
    ? firstTimelineDivergence(toolTimeline(goodRow), toolTimeline(badRow))
    : null;
  const goodTimeline = relevantTimeline(goodRow);
  const badTimeline = relevantTimeline(badRow);
  const goodLinkRepairStatus = linkRepairStatus(goodRow);
  const badLinkRepairStatus = linkRepairStatus(badRow);
  const pacOrphanMcidRejectionCount = orphanMcidRejectionCount(badTimeline);
  const pacCount = pacRejectionCount(badTimeline);
  const noBenefitArtifactAppliedInBadRoute = noBenefitArtifactApplied(badTimeline);
  const laterLinkRecoveryMissing = (
    (goodLinkRepairStatus === 'applied' || goodLinkRepairStatus === 'applied_with_pac_recovery') &&
    badLinkRepairStatus === 'missing'
  );
  const goodScore = goodRow?.afterScore ?? null;
  const badScore = badRow?.afterScore ?? null;
  const scoreDropped = goodScore != null && badScore != null && goodScore > badScore;

  let classification: LinkRecoveryClassification = 'parked_no_safe_behavior';
  let recommendation = 'No safe behavior change is proven; keep this row parked for this stage.';
  if (!goodRow || !badRow) {
    classification = 'missing_evidence';
    recommendation = 'Collect both good and bad fixture-inaccessible rows before changing behavior.';
  } else if (badLinkRepairStatus === 'rejected_orphan_mcid_pac' && scoreDropped) {
    classification = 'pac_blocked_useful_link_repair';
    recommendation = 'Native link repair reaches the PAC gate; consider only the existing orphan-MCID useful-repair recovery path.';
  } else if (
    firstDivergence?.classification === 'same_state_outcome_drift' &&
    noBenefitArtifactAppliedInBadRoute &&
    laterLinkRecoveryMissing &&
    scoreDropped
  ) {
    classification = 'same_state_artifact_route_guard_candidate';
    recommendation = 'A same-state no-benefit artifact route blocks later link recovery; a replay-state-specific guard may be considered.';
  } else if (firstDivergence?.classification === 'upstream_state_drift' && laterLinkRecoveryMissing && scoreDropped) {
    classification = 'upstream_route_volatility';
    recommendation = 'The link repair is missing after upstream state drift; do not add a behavior guard from this evidence.';
  } else if (laterLinkRecoveryMissing && scoreDropped) {
    classification = 'planner_or_scheduling_gap';
    recommendation = 'The link repair is missing without a same-state proof; inspect scheduling before changing acceptance behavior.';
  } else if (goodLinkRepairStatus === badLinkRepairStatus && !scoreDropped) {
    classification = 'safe_recovery_already_available';
    recommendation = 'No fixture link recovery loss is visible in these artifacts.';
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    goodRun: input.goodRun,
    badRun: input.badRun,
    rowId: input.rowId,
    classification,
    goodScore,
    badScore,
    goodReanalyzedScore: goodRow?.reanalyzedScore ?? null,
    badReanalyzedScore: badRow?.reanalyzedScore ?? null,
    goodLinkRepairStatus,
    badLinkRepairStatus,
    firstDivergence,
    pacOrphanMcidRejectionCount,
    pacRejectionCount: pacCount,
    noBenefitArtifactAppliedInBadRoute,
    laterLinkRecoveryMissing,
    recommendation,
    goodTimeline,
    badTimeline,
  };
}

function renderEvent(event: TimelineDivergence['left']): string {
  if (!event) return 'none';
  return `${event.toolName}:${event.outcome}:score=${event.scoreAfter ?? 'n/a'}:state=${event.stateSignatureBefore ?? 'no-state'}:note=${event.note ?? 'none'}`;
}

function renderTimeline(title: string, rows: FixtureLinkTimelineRow[]): string[] {
  const lines = [`### ${title}`, ''];
  if (rows.length === 0) {
    lines.push('No relevant tool rows found.', '');
    return lines;
  }
  lines.push('| # | Tool | Outcome | Score | State before | State after | PAC rules | Note |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| ${row.index} | \`${row.toolName}\` | \`${row.outcome}\` | \`${row.scoreBefore ?? 'n/a'} -> ${row.scoreAfter ?? 'n/a'}\` | \`${row.stateSignatureBefore ?? 'none'}\` | \`${row.stateSignatureAfter ?? 'none'}\` | ${row.pacRuleIds.map(id => `\`${id}\``).join(', ') || 'none'} | ${row.note ? `\`${row.note}\`` : 'none'} |`);
  }
  lines.push('');
  return lines;
}

export function renderFixtureLinkRecoveryMarkdown(report: FixtureLinkRecoveryDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Fixture-Inaccessible Link Recovery Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Good run: \`${report.goodRun}\``);
  lines.push(`Bad run: \`${report.badRun}\``);
  lines.push(`Row: \`${report.rowId}\``, '');
  lines.push('## Summary', '');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Scores: good \`${report.goodScore ?? 'n/a'}\` / reanalyzed \`${report.goodReanalyzedScore ?? 'n/a'}\`, bad \`${report.badScore ?? 'n/a'}\` / reanalyzed \`${report.badReanalyzedScore ?? 'n/a'}\``);
  lines.push(`- Link repair status: good \`${report.goodLinkRepairStatus}\`, bad \`${report.badLinkRepairStatus}\``);
  lines.push(`- PAC rejections in bad relevant route: \`${report.pacRejectionCount}\`; orphan-MCID: \`${report.pacOrphanMcidRejectionCount}\``);
  lines.push(`- No-benefit artifact applied in bad route: \`${report.noBenefitArtifactAppliedInBadRoute ? 'yes' : 'no'}\``);
  lines.push(`- Later link recovery missing: \`${report.laterLinkRecoveryMissing ? 'yes' : 'no'}\``);
  if (report.firstDivergence) {
    lines.push(`- First divergence: \`${report.firstDivergence.reason}\` / \`${report.firstDivergence.classification}\` at index \`${report.firstDivergence.index}\``);
    lines.push(`- Good event: \`${renderEvent(report.firstDivergence.left)}\``);
    lines.push(`- Bad event: \`${renderEvent(report.firstDivergence.right)}\``);
  } else {
    lines.push('- First divergence: `none`');
  }
  lines.push(`- Recommendation: ${report.recommendation}`, '');
  lines.push(...renderTimeline('Good Route Relevant Timeline', report.goodTimeline));
  lines.push(...renderTimeline('Bad Route Relevant Timeline', report.badTimeline));
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let goodRun = DEFAULT_GOOD;
  let badRun = DEFAULT_BAD;
  let rowId = DEFAULT_ROW;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--good') goodRun = args[++index] ?? DEFAULT_GOOD;
    else if (arg === '--bad') badRun = args[++index] ?? DEFAULT_BAD;
    else if (arg === '--row') rowId = args[++index] ?? DEFAULT_ROW;
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const [good, bad] = await Promise.all([
    loadBenchmarkRowsFromRunDir(goodRun),
    loadBenchmarkRowsFromRunDir(badRun),
  ]);
  const report = buildFixtureLinkRecoveryDiagnostic({
    goodRun,
    badRun,
    rowId,
    goodRow: good.remediateResults.find(row => row.id === rowId) ?? null,
    badRow: bad.remediateResults.find(row => row.id === rowId) ?? null,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'fixture-link-recovery-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'fixture-link-recovery-diagnostic.md'), renderFixtureLinkRecoveryMarkdown(report), 'utf8');
  console.log(`Wrote fixture link recovery diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
  console.log(`Recommendation: ${report.recommendation}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

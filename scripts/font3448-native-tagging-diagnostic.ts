#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
  type ToolTimelineEvent,
} from './pac-target-route-diagnostic.js';

const DEFAULT_STAGE42 = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STRICT = 'Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1';
const DEFAULT_CURRENT = 'Output/experiment-corpus-baseline/run-figure4702-sequence-fixed50-2026-05-08-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/font3448-native-tagging-diagnostic-2026-05-08-r1';
const DEFAULT_ROW_ID = 'font-3448';
const TARGET_TOOL = 'tag_native_text_blocks';

export type Font3448NativeTaggingClassification =
  | 'same_state_orphan_recovery_candidate'
  | 'same_state_not_safe'
  | 'upstream_route_volatility'
  | 'missing_evidence';

export interface Font3448NativeTaggingReport {
  generatedAt: string;
  stage42Run: string;
  strictRun: string;
  currentRun: string;
  rowId: string;
  classification: Font3448NativeTaggingClassification;
  reason: string;
  strictScore: number | null;
  currentScore: number | null;
  stage42Score: number | null;
  firstStage42ToCurrentDivergence: TimelineDivergence | null;
  firstStrictToCurrentDivergence: TimelineDivergence | null;
  strictNativeTagging: ToolTimelineEvent | null;
  currentNativeTagging: ToolTimelineEvent | null;
  sameReplayState: boolean;
  orphanOnlyPacRejection: boolean;
  scoreImproved: boolean;
  headingImproved: boolean;
  readingOrderImproved: boolean;
  pdfUaDelta: number | null;
  recommendation: string;
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/font3448-native-tagging-diagnostic.ts [options]',
    '  --stage42 <run-dir>',
    '  --strict <run-dir>',
    '  --current <run-dir>',
    '  --row <id>',
    '  --out <dir>',
  ].join('\n');
}

function rowById(rows: RemediateBenchmarkRow[], rowId: string): RemediateBenchmarkRow | null {
  return rows.find(row => row.id === rowId) ?? null;
}

function categoryDelta(event: ToolTimelineEvent | null, key: string): number | null {
  const before = event?.categoryScoresBefore[key];
  const after = event?.categoryScoresAfter[key];
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return after - before;
}

function isPositive(value: number | null): boolean {
  return value != null && value > 0;
}

function classify(input: {
  strictEvent: ToolTimelineEvent | null;
  currentEvent: ToolTimelineEvent | null;
  sameReplayState: boolean;
  orphanOnlyPacRejection: boolean;
  scoreImproved: boolean;
  headingImproved: boolean;
  readingOrderImproved: boolean;
}): { classification: Font3448NativeTaggingClassification; reason: string } {
  if (!input.strictEvent || !input.currentEvent) {
    return { classification: 'missing_evidence', reason: 'The strict or current native-tagging event is missing.' };
  }
  if (!input.sameReplayState) {
    return { classification: 'upstream_route_volatility', reason: 'Native tagging events do not share the same replay state.' };
  }
  if (
    input.strictEvent.outcome === 'applied' &&
    input.currentEvent.outcome === 'rejected' &&
    input.orphanOnlyPacRejection &&
    input.scoreImproved &&
    input.headingImproved &&
    input.readingOrderImproved
  ) {
    return {
      classification: 'same_state_orphan_recovery_candidate',
      reason: 'Same-state native tagging is blocked only by orphan-MCID PAC debt while score, heading, and reading order improve.',
    };
  }
  return { classification: 'same_state_not_safe', reason: 'Same-state native tagging evidence does not satisfy the narrow recovery criteria.' };
}

export function buildFont3448NativeTaggingReport(input: {
  stage42Run: string;
  strictRun: string;
  currentRun: string;
  stage42Rows: RemediateBenchmarkRow[];
  strictRows: RemediateBenchmarkRow[];
  currentRows: RemediateBenchmarkRow[];
  rowId?: string;
  generatedAt?: string;
}): Font3448NativeTaggingReport {
  const rowId = input.rowId ?? DEFAULT_ROW_ID;
  const stage42 = rowById(input.stage42Rows, rowId);
  const strict = rowById(input.strictRows, rowId);
  const current = rowById(input.currentRows, rowId);
  const strictTimeline = strict ? toolTimeline(strict) : [];
  const currentTimeline = current ? toolTimeline(current) : [];
  const strictEvent = strictTimeline.find(event => event.toolName === TARGET_TOOL) ?? null;
  const currentEvent = currentTimeline.find(event => event.toolName === TARGET_TOOL) ?? null;
  const sameReplayState = Boolean(
    strictEvent?.stateSignatureBefore &&
    strictEvent.stateSignatureBefore === currentEvent?.stateSignatureBefore,
  );
  const orphanOnlyPacRejection = Boolean(
    currentEvent?.pacReason === 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)' ||
    currentEvent?.note === 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)',
  );
  const scoreImproved = Boolean(
    (
      currentEvent &&
      typeof currentEvent.scoreAfter === 'number' &&
      typeof currentEvent.scoreBefore === 'number' &&
      currentEvent.scoreAfter > currentEvent.scoreBefore
    ) ||
    (
      sameReplayState &&
      strictEvent &&
      currentEvent &&
      typeof strictEvent.scoreAfter === 'number' &&
      typeof currentEvent.scoreBefore === 'number' &&
      strictEvent.scoreAfter > currentEvent.scoreBefore
    ),
  );
  const headingImproved = isPositive(categoryDelta(currentEvent, 'heading_structure'));
  const readingOrderImproved = isPositive(categoryDelta(currentEvent, 'reading_order'));
  const result = classify({
    strictEvent,
    currentEvent,
    sameReplayState,
    orphanOnlyPacRejection,
    scoreImproved,
    headingImproved,
    readingOrderImproved,
  });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage42Run: input.stage42Run,
    strictRun: input.strictRun,
    currentRun: input.currentRun,
    rowId,
    classification: result.classification,
    reason: result.reason,
    strictScore: strict?.reanalyzedScore ?? strict?.afterScore ?? null,
    currentScore: current?.reanalyzedScore ?? current?.afterScore ?? null,
    stage42Score: stage42?.reanalyzedScore ?? stage42?.afterScore ?? null,
    firstStage42ToCurrentDivergence: stage42 && current ? firstTimelineDivergence(toolTimeline(stage42), currentTimeline) : null,
    firstStrictToCurrentDivergence: strict && current ? firstTimelineDivergence(strictTimeline, currentTimeline) : null,
    strictNativeTagging: strictEvent,
    currentNativeTagging: currentEvent,
    sameReplayState,
    orphanOnlyPacRejection,
    scoreImproved,
    headingImproved,
    readingOrderImproved,
    pdfUaDelta: categoryDelta(currentEvent, 'pdf_ua_compliance'),
    recommendation: result.classification === 'same_state_orphan_recovery_candidate'
      ? 'Enable only the narrow tag_native_text_blocks orphan-MCID recovery path and validate targeted rows before fixed-50.'
      : 'Do not add behavior from this evidence; collect repeat or route data first.',
  };
}

function renderEvent(event: ToolTimelineEvent | null): string {
  if (!event) return 'none';
  return `${event.toolName}:${event.outcome}:${event.scoreBefore}->${event.scoreAfter}:${event.stateSignatureBefore ?? 'no-state'}`;
}

function renderDivergence(divergence: TimelineDivergence | null): string {
  if (!divergence) return 'none';
  return `${divergence.reason}/${divergence.classification} [${renderEvent(divergence.left)} vs ${renderEvent(divergence.right)}]`;
}

export function renderFont3448NativeTaggingMarkdown(report: Font3448NativeTaggingReport): string {
  const lines: string[] = [];
  lines.push('# Font-3448 Native Tagging Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Stage 42: \`${report.stage42Run}\``);
  lines.push(`Strict/table baseline: \`${report.strictRun}\``);
  lines.push(`Current: \`${report.currentRun}\``, '');
  lines.push('## Decision', '');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Reason: ${report.reason}`);
  lines.push(`- Recommendation: ${report.recommendation}`);
  lines.push(`- Stage42/strict/current scores: \`${report.stage42Score ?? 'n/a'} / ${report.strictScore ?? 'n/a'} / ${report.currentScore ?? 'n/a'}\``);
  lines.push(`- Same replay state: \`${report.sameReplayState}\``);
  lines.push(`- Orphan-only PAC rejection: \`${report.orphanOnlyPacRejection}\``);
  lines.push(`- Score improved: \`${report.scoreImproved}\``);
  lines.push(`- Heading improved: \`${report.headingImproved}\``);
  lines.push(`- Reading order improved: \`${report.readingOrderImproved}\``);
  lines.push(`- PDF/UA delta: \`${report.pdfUaDelta ?? 'n/a'}\``, '');
  lines.push('## Native Tagging Events', '');
  lines.push('| Run | Event | Heading Delta | Reading Delta | PDF/UA Delta |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const [label, event] of [['strict', report.strictNativeTagging], ['current', report.currentNativeTagging]] as const) {
    lines.push(`| ${label} | \`${renderEvent(event)}\` | \`${categoryDelta(event, 'heading_structure') ?? 'n/a'}\` | \`${categoryDelta(event, 'reading_order') ?? 'n/a'}\` | \`${categoryDelta(event, 'pdf_ua_compliance') ?? 'n/a'}\` |`);
  }
  lines.push('', '## Divergence', '');
  lines.push(`- Stage42 to current: ${renderDivergence(report.firstStage42ToCurrentDivergence)}`);
  lines.push(`- Strict to current: ${renderDivergence(report.firstStrictToCurrentDivergence)}`);
  return `${lines.join('\n')}\n`;
}

async function loadRows(runDir: string): Promise<RemediateBenchmarkRow[]> {
  return (await loadBenchmarkRowsFromRunDir(runDir)).remediateResults;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let stage42Run = DEFAULT_STAGE42;
  let strictRun = DEFAULT_STRICT;
  let currentRun = DEFAULT_CURRENT;
  let rowId = DEFAULT_ROW_ID;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--stage42') stage42Run = args[++index] ?? DEFAULT_STAGE42;
    else if (arg === '--strict') strictRun = args[++index] ?? DEFAULT_STRICT;
    else if (arg === '--current') currentRun = args[++index] ?? DEFAULT_CURRENT;
    else if (arg === '--row') rowId = args[++index] ?? DEFAULT_ROW_ID;
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const [stage42Rows, strictRows, currentRows] = await Promise.all([
    loadRows(stage42Run),
    loadRows(strictRun),
    loadRows(currentRun),
  ]);
  const report = buildFont3448NativeTaggingReport({
    stage42Run,
    strictRun,
    currentRun,
    stage42Rows,
    strictRows,
    currentRows,
    rowId,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'font3448-native-tagging-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'font3448-native-tagging-diagnostic.md'), renderFont3448NativeTaggingMarkdown(report), 'utf8');
  console.log(`Wrote font-3448 native tagging diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

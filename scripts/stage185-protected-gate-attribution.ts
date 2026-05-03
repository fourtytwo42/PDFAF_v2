#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Stage185ProtectedAttributionClass =
  | 'safe_checkpoint_available'
  | 'same_buffer_floor_safe_repeat_available'
  | 'same_buffer_analyzer_variance_floor_unsafe'
  | 'accepted_cleanup_harm'
  | 'stage184_unrelated_known_volatility'
  | 'stable_below_floor_no_safe_state';

export interface Stage185AttributionInput {
  stage182Classification: string;
  id: string;
  knownVolatility: boolean;
  targetAcceptedStage184HeadingNormalization: boolean;
  targetRejectedOrNoEffectStage184HeadingNormalization: boolean;
  targetAfterScore: number | null;
  targetReanalyzedScore: number | null;
  stage183EffectiveScore: number | null;
  stage184EffectiveScore: number | null;
  protectedFloorScore: number | null;
  acceptedCleanupHarmCount: number;
}

export interface Stage185AttributionResult {
  classification: Stage185ProtectedAttributionClass;
  reasons: string[];
}

interface TimelineRow {
  index?: number;
  toolName?: string;
  outcome?: string;
  note?: string | null;
  raw?: string | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
}

interface Stage182EvidenceRow {
  id: string;
  file?: string | null;
  classification: string;
  reasons?: string[];
  acceptedCleanupHarmCandidates?: TimelineRow[];
  baseline?: { score?: number | null; floorScore?: number | null };
  stage180?: { effectiveScore?: number | null; afterScore?: number | null; reanalyzedScore?: number | null };
  stage181?: { effectiveScore?: number | null; afterScore?: number | null; reanalyzedScore?: number | null };
  target?: {
    afterScore?: number | null;
    reanalyzedScore?: number | null;
    effectiveScore?: number | null;
    acceptedTimeline?: TimelineRow[];
    rejectedTimeline?: TimelineRow[];
    firstProtectedDrop?: TimelineRow | null;
    protectedReanalysisSelection?: unknown;
  };
  finalBuffer?: {
    externalRepeats?: Array<{ repeat?: number; score?: number | null; grade?: string | null; protectedUnsafeReason?: string | null }>;
    rawRepeats?: Array<{ repeat?: number; signature?: string | null; error?: string | null }>;
  } | null;
  checkpoints?: Array<{
    label?: string;
    externalRepeats?: Array<{ repeat?: number; score?: number | null; grade?: string | null; protectedUnsafeReason?: string | null }>;
    rawRepeats?: Array<{ repeat?: number; signature?: string | null; error?: string | null }>;
  }>;
}

interface Stage182EvidenceReport {
  baselineRun?: string;
  stage180Run?: string;
  stage181Run?: string;
  targetRun?: string;
  repeats?: number;
  rows: Stage182EvidenceRow[];
}

interface Stage185Row {
  id: string;
  file: string | null;
  role: 'primary' | 'control';
  classification: Stage185ProtectedAttributionClass;
  reasons: string[];
  stage182Classification: string;
  stage182Reasons: string[];
  baselineScore: number | null;
  protectedFloorScore: number | null;
  stage183EffectiveScore: number | null;
  stage184EffectiveScore: number | null;
  targetAfterScore: number | null;
  targetReanalyzedScore: number | null;
  finalRepeatScores: Array<number | null>;
  finalFloorSafeRepeats: number[];
  checkpointCount: number;
  safeCheckpointLabels: string[];
  acceptedCleanupHarmCount: number;
  stage184HeadingRows: string[];
  firstProtectedDrop: string | null;
}

const DEFAULT_STAGE182_REPORT = 'Output/experiment-corpus-baseline/stage185-protected-gate-attribution-evidence-2026-05-03-r1/stage182-protected-reanalysis-evidence.json';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage185-protected-gate-attribution-2026-05-03-r1';
const DEFAULT_PRIMARY_IDS = ['long-4516', 'short-4214', 'short-4176'];
const KNOWN_VOLATILITY_IDS = new Set([
  'long-4516',
  'short-4214',
  'short-4176',
  'structure-4076',
  'long-4680',
  'long-4683',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage185-protected-gate-attribution.ts [options]',
    `  --stage182-report <path>   Default: ${DEFAULT_STAGE182_REPORT}`,
    `  --out <dir>                Default: ${DEFAULT_OUT}`,
    `  --primary-ids <csv>        Default: ${DEFAULT_PRIMARY_IDS.join(',')}`,
  ].join('\n');
}

function parseArgs(argv: string[] = process.argv.slice(2)): {
  stage182Report: string;
  out: string;
  primaryIds: Set<string>;
} {
  const args = {
    stage182Report: DEFAULT_STAGE182_REPORT,
    out: DEFAULT_OUT,
    primaryIds: new Set(DEFAULT_PRIMARY_IDS),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const next = argv[index + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--stage182-report') args.stage182Report = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--primary-ids') args.primaryIds = new Set(next.split(',').map(id => id.trim()).filter(Boolean));
    else throw new Error(`Unknown argument: ${arg}`);
    index += 1;
  }
  return args;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatTool(row: TimelineRow): string {
  return `${row.toolName ?? 'unknown'}/${row.outcome ?? 'unknown'}@${row.index ?? 'n/a'}:${row.raw ?? row.note ?? 'none'}`;
}

function stage184HeadingRows(row: Stage182EvidenceRow): TimelineRow[] {
  const all = [
    ...(row.target?.acceptedTimeline ?? []),
    ...(row.target?.rejectedTimeline ?? []),
  ];
  return all.filter(tool => tool.toolName === 'normalize_heading_hierarchy' && (
    tool.note === 'heading_reachability_improved' ||
    /heading_reachability|protected_reading_order_topup|no_structural_change/.test(tool.raw ?? tool.note ?? '')
  ));
}

function hasAcceptedStage184HeadingNormalization(row: Stage182EvidenceRow): boolean {
  return stage184HeadingRows(row).some(tool => tool.outcome === 'applied' && tool.note === 'heading_reachability_improved');
}

function hasRejectedOrNoEffectStage184HeadingNormalization(row: Stage182EvidenceRow): boolean {
  return stage184HeadingRows(row).some(tool => tool.outcome === 'rejected' || tool.outcome === 'no_effect');
}

function floorSafeFinalRepeats(row: Stage182EvidenceRow): number[] {
  return (row.finalBuffer?.externalRepeats ?? [])
    .filter(repeat => repeat.protectedUnsafeReason === null)
    .map(repeat => numberOrNull(repeat.repeat))
    .filter((repeat): repeat is number => repeat != null);
}

function safeCheckpointLabels(row: Stage182EvidenceRow): string[] {
  return (row.checkpoints ?? [])
    .filter(checkpoint => (checkpoint.externalRepeats ?? []).some(repeat => repeat.protectedUnsafeReason === null))
    .map(checkpoint => checkpoint.label ?? 'checkpoint');
}

export function classifyStage185ProtectedAttribution(input: Stage185AttributionInput): Stage185AttributionResult {
  const reasons: string[] = [];
  if (input.stage182Classification === 'safe_checkpoint_available') {
    reasons.push('stage182_found_floor_safe_checkpoint');
    return { classification: 'safe_checkpoint_available', reasons };
  }
  if (input.stage182Classification === 'same_buffer_floor_safe_repeat_available') {
    reasons.push('stage182_found_floor_safe_final_repeat');
    return { classification: 'same_buffer_floor_safe_repeat_available', reasons };
  }
  if (input.stage182Classification === 'same_buffer_analyzer_variance_floor_unsafe') {
    reasons.push('stage182_found_same_buffer_analyzer_variance');
    return { classification: 'same_buffer_analyzer_variance_floor_unsafe', reasons };
  }
  if (input.stage182Classification === 'accepted_cleanup_harm' || input.acceptedCleanupHarmCount > 0) {
    reasons.push(`accepted_cleanup_harm_candidates=${input.acceptedCleanupHarmCount}`);
    return { classification: 'accepted_cleanup_harm', reasons };
  }
  if (
    input.knownVolatility &&
    !input.targetAcceptedStage184HeadingNormalization &&
    (input.targetRejectedOrNoEffectStage184HeadingNormalization || input.targetAfterScore !== input.targetReanalyzedScore)
  ) {
    reasons.push('known_protected_volatility_row');
    reasons.push(input.targetRejectedOrNoEffectStage184HeadingNormalization
      ? 'stage184_heading_normalization_rejected_or_no_effect'
      : 'stage184_heading_normalization_not_accepted');
    if (input.stage183EffectiveScore != null) reasons.push(`stage183_effective=${input.stage183EffectiveScore}`);
    if (input.stage184EffectiveScore != null) reasons.push(`stage184_effective=${input.stage184EffectiveScore}`);
    return { classification: 'stage184_unrelated_known_volatility', reasons };
  }
  if (
    input.protectedFloorScore != null &&
    input.targetAfterScore != null &&
    input.targetAfterScore >= input.protectedFloorScore &&
    input.targetReanalyzedScore != null &&
    input.targetReanalyzedScore < input.protectedFloorScore
  ) {
    reasons.push(`in_run_floor_safe_${input.targetAfterScore}_reanalyzed_below_floor_${input.targetReanalyzedScore}`);
  } else {
    reasons.push('no_safe_final_or_checkpoint_state');
  }
  return { classification: 'stable_below_floor_no_safe_state', reasons };
}

function toStage185Row(row: Stage182EvidenceRow, primaryIds: Set<string>): Stage185Row {
  const acceptedCleanupHarmCount = row.acceptedCleanupHarmCandidates?.length ?? 0;
  const input: Stage185AttributionInput = {
    id: row.id,
    stage182Classification: row.classification,
    knownVolatility: KNOWN_VOLATILITY_IDS.has(row.id),
    targetAcceptedStage184HeadingNormalization: hasAcceptedStage184HeadingNormalization(row),
    targetRejectedOrNoEffectStage184HeadingNormalization: hasRejectedOrNoEffectStage184HeadingNormalization(row),
    targetAfterScore: numberOrNull(row.target?.afterScore),
    targetReanalyzedScore: numberOrNull(row.target?.reanalyzedScore),
    stage183EffectiveScore: numberOrNull(row.stage180?.effectiveScore),
    stage184EffectiveScore: numberOrNull(row.stage181?.effectiveScore),
    protectedFloorScore: numberOrNull(row.baseline?.floorScore),
    acceptedCleanupHarmCount,
  };
  const classification = classifyStage185ProtectedAttribution(input);
  const safeCheckpoints = safeCheckpointLabels(row);
  return {
    id: row.id,
    file: row.file ?? null,
    role: primaryIds.has(row.id) ? 'primary' : 'control',
    classification: classification.classification,
    reasons: classification.reasons,
    stage182Classification: row.classification,
    stage182Reasons: row.reasons ?? [],
    baselineScore: numberOrNull(row.baseline?.score),
    protectedFloorScore: numberOrNull(row.baseline?.floorScore),
    stage183EffectiveScore: numberOrNull(row.stage180?.effectiveScore),
    stage184EffectiveScore: numberOrNull(row.stage181?.effectiveScore),
    targetAfterScore: numberOrNull(row.target?.afterScore),
    targetReanalyzedScore: numberOrNull(row.target?.reanalyzedScore),
    finalRepeatScores: (row.finalBuffer?.externalRepeats ?? []).map(repeat => numberOrNull(repeat.score)),
    finalFloorSafeRepeats: floorSafeFinalRepeats(row),
    checkpointCount: row.checkpoints?.length ?? 0,
    safeCheckpointLabels: safeCheckpoints,
    acceptedCleanupHarmCount,
    stage184HeadingRows: stage184HeadingRows(row).map(formatTool),
    firstProtectedDrop: row.target?.firstProtectedDrop ? formatTool(row.target.firstProtectedDrop) : null,
  };
}

function renderMarkdown(report: {
  generatedAt: string;
  stage182Report: string;
  evidence: Pick<Stage182EvidenceReport, 'baselineRun' | 'stage180Run' | 'stage181Run' | 'targetRun' | 'repeats'>;
  rows: Stage185Row[];
}): string {
  const distribution = report.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# Stage 185 Protected Gate Attribution',
    '',
    `Generated: ${report.generatedAt}`,
    `Stage 182 evidence: \`${report.stage182Report}\``,
    `Baseline: \`${report.evidence.baselineRun ?? 'n/a'}\``,
    `Stage 183/reference: \`${report.evidence.stage180Run ?? 'n/a'}\``,
    `Stage 184/reference: \`${report.evidence.stage181Run ?? 'n/a'}\``,
    `Target: \`${report.evidence.targetRun ?? 'n/a'}\``,
    `Repeats: ${report.evidence.repeats ?? 'n/a'}`,
    '',
    '## Classification Distribution',
    '',
    ...Object.entries(distribution).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `- ${key}: ${count}`),
    '',
    '## Rows',
    '',
    '| Row | Role | Stage 183 eff. | Stage 184 eff. | Target after/reanalysis | Final repeats | Safe checkpoints | Stage185 class | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.role} | ${row.stage183EffectiveScore ?? 'n/a'} | ${row.stage184EffectiveScore ?? 'n/a'} | ${row.targetAfterScore ?? 'n/a'} / ${row.targetReanalyzedScore ?? 'n/a'} | ${row.finalRepeatScores.join(',') || 'n/a'} | ${row.safeCheckpointLabels.join(',') || 'none'} | ${row.classification} | ${row.reasons.join('; ')} |`);
  }
  lines.push('', '## Primary Details', '');
  for (const row of report.rows.filter(row => row.role === 'primary')) {
    lines.push(`### ${row.id}`, '');
    lines.push(`- Baseline/floor: ${row.baselineScore ?? 'n/a'} / ${row.protectedFloorScore ?? 'n/a'}`);
    lines.push(`- Stage182 class: ${row.stage182Classification} (${row.stage182Reasons.join('; ') || 'no reasons'})`);
    lines.push(`- Stage184 heading rows: ${row.stage184HeadingRows.join(', ') || 'none'}`);
    lines.push(`- First protected drop: ${row.firstProtectedDrop ?? 'none'}`);
    lines.push(`- Cleanup harm candidates: ${row.acceptedCleanupHarmCount}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const stage182Path = resolve(args.stage182Report);
  const evidence = JSON.parse(await readFile(stage182Path, 'utf8')) as Stage182EvidenceReport;
  const rows = evidence.rows.map(row => toStage185Row(row, args.primaryIds));
  const report = {
    generatedAt: new Date().toISOString(),
    stage182Report: stage182Path,
    evidence: {
      baselineRun: evidence.baselineRun,
      stage180Run: evidence.stage180Run,
      stage181Run: evidence.stage181Run,
      targetRun: evidence.targetRun,
      repeats: evidence.repeats,
    },
    primaryIds: [...args.primaryIds],
    rows,
  };
  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage185-protected-gate-attribution.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage185-protected-gate-attribution.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 185 attribution to ${out}`);
  for (const row of rows.filter(row => row.role === 'primary')) {
    console.log(`${row.id}: ${row.classification} (${row.reasons.join('; ')})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

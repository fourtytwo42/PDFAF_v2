#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { CategoryKey } from '../src/types.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
} from './pac-target-route-diagnostic.js';

const DEFAULT_STAGE42 = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STRICT = 'Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1';
const DEFAULT_CURRENT = 'Output/experiment-corpus-baseline/run-figure4702-sequence-fixed50-2026-05-08-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/long4680-protected-drift-diagnostic-2026-05-08-r1';
const DEFAULT_ROW_ID = 'long-4680';
const LONG_4680_FLOOR = 80;

export type Long4680ProtectedDriftClassification =
  | 'safe_checkpoint_candidate'
  | 'analyzer_reanalysis_drift'
  | 'route_volatility'
  | 'real_pdf_regression'
  | 'no_safe_checkpoint'
  | 'missing_evidence';

export interface CategoryDrift {
  key: string;
  afterScore: number | null;
  afterApplicable: boolean | null;
  reanalyzedScore: number | null;
  reanalyzedApplicable: boolean | null;
  delta: number | null;
  stage42Score: number | null;
  strictScore: number | null;
}

export interface ReplayToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  note: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
}

export interface Long4680ProtectedSelectionSummary {
  enabled: boolean | null;
  repeatCount: number | null;
  repeatScores: Array<number | null>;
  repeatGrades: Array<string | null>;
  floorScore: number | null;
  floorSafeIndexes: number[];
  sameBuffer: boolean | null;
  selectedReason: string | null;
}

export interface Long4680EvidenceSafety {
  pageEvidencePreserved: boolean | null;
  textEvidencePreserved: boolean | null;
  tagEvidencePreserved: boolean | null;
  altApplicabilityRegressed: boolean;
  altEvidenceRegressed: boolean;
  titleEvidenceRegressed: boolean;
  harmfulPacRegressionDetected: boolean;
  falsePositiveApplied: boolean;
}

export interface Long4680ProtectedDriftReport {
  generatedAt: string;
  stage42Run: string;
  strictRun: string;
  currentRun: string;
  rowId: string;
  classification: Long4680ProtectedDriftClassification;
  reason: string;
  scoreFloor: number;
  stage42Score: number | null;
  strictScore: number | null;
  currentAfterScore: number | null;
  currentAfterGrade: string | null;
  currentReanalyzedScore: number | null;
  currentReanalyzedGrade: string | null;
  finalReanalysisDrop: number | null;
  checkpointEligibleByScore: boolean;
  checkpointSafe: boolean;
  firstStage42ToCurrentDivergence: TimelineDivergence | null;
  firstStrictToCurrentDivergence: TimelineDivergence | null;
  protectedSelection: Long4680ProtectedSelectionSummary;
  safety: Long4680EvidenceSafety;
  categoryDrift: CategoryDrift[];
  toolTimeline: ReplayToolSummary[];
  recommendation: string;
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/long4680-protected-drift-diagnostic.ts [options]',
    '  --stage42 <run-dir>',
    '  --strict <run-dir>',
    '  --current <run-dir>',
    '  --row <id>',
    '  --out <dir>',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function parseDetails(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function rowById(rows: RemediateBenchmarkRow[], rowId: string): RemediateBenchmarkRow | null {
  return rows.find(row => row.id === rowId) ?? null;
}

function categoryMap(categories: RemediateBenchmarkRow['afterCategories']): Map<string, NonNullable<RemediateBenchmarkRow['afterCategories']>[number]> {
  return new Map((categories ?? []).map(category => [category.key, category]));
}

function categoryScore(row: RemediateBenchmarkRow | null, key: CategoryKey): number | null {
  const categories = row?.reanalyzedCategories ?? row?.afterCategories ?? [];
  return categories.find(category => category.key === key)?.score ?? null;
}

function finalReanalysisDrop(row: RemediateBenchmarkRow | null): number | null {
  if (typeof row?.afterScore !== 'number' || typeof row.reanalyzedScore !== 'number') return null;
  return row.afterScore - row.reanalyzedScore;
}

function paritySignals(row: RemediateBenchmarkRow | null, phase: 'after' | 'reanalyzed'): Record<string, unknown> | null {
  const parity = phase === 'after' ? row?.afterIcjiaParity : row?.reanalyzedIcjiaParity;
  return asRecord(parity?.signals);
}

function textLength(row: RemediateBenchmarkRow | null, phase: 'after' | 'reanalyzed'): number | null {
  return numberOrNull(paritySignals(row, phase)?.['textLength']);
}

function hasStructTree(row: RemediateBenchmarkRow | null, phase: 'after' | 'reanalyzed'): boolean | null {
  return booleanOrNull(paritySignals(row, phase)?.['hasStructTree']);
}

function pageCount(row: RemediateBenchmarkRow | null, phase: 'after' | 'reanalyzed'): number | null {
  const profile = phase === 'after' ? row?.afterDetectionProfile : row?.reanalyzedDetectionProfile;
  return numberOrNull(asRecord(profile)?.['pageCount']);
}

function scoreCategoryDelta(input: {
  stage42: RemediateBenchmarkRow | null;
  strict: RemediateBenchmarkRow | null;
  current: RemediateBenchmarkRow | null;
}): CategoryDrift[] {
  const after = categoryMap(input.current?.afterCategories);
  const reanalyzed = categoryMap(input.current?.reanalyzedCategories);
  const keys = new Set<string>([...after.keys(), ...reanalyzed.keys()]);
  return [...keys].sort((a, b) => a.localeCompare(b)).map((key) => {
    const afterCategory = after.get(key);
    const reanalyzedCategory = reanalyzed.get(key);
    const afterScore = afterCategory?.score ?? null;
    const reanalyzedScore = reanalyzedCategory?.score ?? null;
    return {
      key,
      afterScore,
      afterApplicable: afterCategory?.applicable ?? null,
      reanalyzedScore,
      reanalyzedApplicable: reanalyzedCategory?.applicable ?? null,
      delta: afterScore == null || reanalyzedScore == null ? null : reanalyzedScore - afterScore,
      stage42Score: categoryScore(input.stage42, key as CategoryKey),
      strictScore: categoryScore(input.strict, key as CategoryKey),
    };
  }).sort((a, b) => {
    const aSeverity = a.delta ?? 0;
    const bSeverity = b.delta ?? 0;
    return aSeverity - bSeverity || a.key.localeCompare(b.key);
  });
}

function replayState(details: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(asRecord(details?.['debug'])?.['replayState']);
}

function noteFromDetails(details: Record<string, unknown> | null): string | null {
  return stringOrNull(details?.['raw']) ?? stringOrNull(details?.['note']);
}

function replayToolTimeline(row: RemediateBenchmarkRow | null): ReplayToolSummary[] {
  return (row?.appliedTools ?? []).map((tool) => {
    const details = parseDetails(tool.details);
    const replay = replayState(details);
    return {
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
      delta: typeof tool.delta === 'number' ? tool.delta : null,
      note: noteFromDetails(details),
      stateSignatureBefore: stringOrNull(replay?.['stateSignatureBefore']),
      stateSignatureAfter: stringOrNull(replay?.['stateSignatureAfter']),
    };
  });
}

function protectedSelection(row: RemediateBenchmarkRow | null): Long4680ProtectedSelectionSummary {
  const selection = asRecord(row?.protectedReanalysisSelection);
  return {
    enabled: booleanOrNull(selection?.['enabled']),
    repeatCount: numberOrNull(selection?.['repeatCount']),
    repeatScores: asArray(selection?.['repeatScores']).map(numberOrNull),
    repeatGrades: asArray(selection?.['repeatGrades']).map(stringOrNull),
    floorScore: numberOrNull(selection?.['floorScore']),
    floorSafeIndexes: asArray(selection?.['floorSafeIndexes']).map(numberOrNull).filter((value): value is number => value != null),
    sameBuffer: booleanOrNull(selection?.['sameBuffer']),
    selectedReason: stringOrNull(selection?.['selectedReason']),
  };
}

function containsFalsePositiveApplied(row: RemediateBenchmarkRow | null): boolean {
  return JSON.stringify(row?.remediationOutcomeSummary ?? {}).includes('false_positive_applied') ||
    JSON.stringify(row?.appliedTools ?? []).includes('false_positive_applied');
}

function hasHarmfulPacRegression(row: RemediateBenchmarkRow | null): boolean {
  return (row?.appliedTools ?? []).some((tool) => {
    if (tool.outcome !== 'rejected') return false;
    const details = parseDetails(tool.details);
    const note = noteFromDetails(details);
    return Boolean(note?.includes('pac_rule_regressed') && !note.includes('pdfua.content.orphan_mcids_absent'));
  });
}

function evidenceSafety(row: RemediateBenchmarkRow | null): Long4680EvidenceSafety {
  const afterPageCount = pageCount(row, 'after');
  const reanalyzedPageCount = pageCount(row, 'reanalyzed');
  const afterTextLength = textLength(row, 'after');
  const reanalyzedTextLength = textLength(row, 'reanalyzed');
  const afterTagged = hasStructTree(row, 'after');
  const reanalyzedTagged = hasStructTree(row, 'reanalyzed');
  const afterCategories = categoryMap(row?.afterCategories);
  const reanalyzedCategories = categoryMap(row?.reanalyzedCategories);
  const afterAlt = afterCategories.get('alt_text');
  const reanalyzedAlt = reanalyzedCategories.get('alt_text');
  const afterTitle = afterCategories.get('title_language');
  const reanalyzedTitle = reanalyzedCategories.get('title_language');
  return {
    pageEvidencePreserved: afterPageCount == null || reanalyzedPageCount == null
      ? null
      : afterPageCount === reanalyzedPageCount,
    textEvidencePreserved: afterTextLength == null || reanalyzedTextLength == null
      ? null
      : reanalyzedTextLength >= afterTextLength,
    tagEvidencePreserved: afterTagged == null || reanalyzedTagged == null
      ? null
      : !afterTagged || reanalyzedTagged,
    altApplicabilityRegressed: afterAlt?.applicable === false && reanalyzedAlt?.applicable === true && (reanalyzedAlt.score ?? 100) < (afterAlt.score ?? 100),
    altEvidenceRegressed: (reanalyzedAlt?.score ?? 100) < (afterAlt?.score ?? 100),
    titleEvidenceRegressed: (reanalyzedTitle?.score ?? 100) < (afterTitle?.score ?? 100),
    harmfulPacRegressionDetected: hasHarmfulPacRegression(row),
    falsePositiveApplied: containsFalsePositiveApplied(row),
  };
}

function classifyLong4680(input: {
  row: RemediateBenchmarkRow | null;
  safety: Long4680EvidenceSafety;
  selection: Long4680ProtectedSelectionSummary;
  stage42ToCurrent: TimelineDivergence | null;
  strictToCurrent: TimelineDivergence | null;
  floor: number;
}): { classification: Long4680ProtectedDriftClassification; reason: string; checkpointSafe: boolean } {
  const row = input.row;
  if (!row) return { classification: 'missing_evidence', reason: 'Current row was not found.', checkpointSafe: false };
  const afterScore = row.afterScore;
  const reanalyzedScore = row.reanalyzedScore;
  if (afterScore == null || afterScore < input.floor) {
    return { classification: 'no_safe_checkpoint', reason: `In-run score is below floor (${afterScore ?? 'n/a'}<${input.floor}).`, checkpointSafe: false };
  }
  const droppedBelowFloor = reanalyzedScore == null || reanalyzedScore < input.floor;
  if (!droppedBelowFloor) {
    return { classification: 'analyzer_reanalysis_drift', reason: 'Protected reanalysis did not drop below the row floor.', checkpointSafe: true };
  }
  if (
    input.safety.falsePositiveApplied ||
    input.safety.pageEvidencePreserved === false ||
    input.safety.textEvidencePreserved === false ||
    input.safety.tagEvidencePreserved === false ||
    input.safety.harmfulPacRegressionDetected
  ) {
    return { classification: 'real_pdf_regression', reason: 'Protected reanalysis safety checks found page/text/tag/PAC or false-positive risk.', checkpointSafe: false };
  }
  if (input.safety.altApplicabilityRegressed || input.safety.altEvidenceRegressed || input.safety.titleEvidenceRegressed) {
    return { classification: 'real_pdf_regression', reason: 'Protected reanalysis exposes scored title/alt evidence regression; do not preserve the in-run checkpoint.', checkpointSafe: false };
  }
  if (input.selection.repeatScores.length > 0 && input.selection.floorSafeIndexes.length === 0) {
    return { classification: 'analyzer_reanalysis_drift', reason: 'All protected repeats are below floor, but direct safety checks did not identify a real PDF regression.', checkpointSafe: false };
  }
  if (input.stage42ToCurrent || input.strictToCurrent) {
    return { classification: 'route_volatility', reason: 'Route differs from the comparison runs; collect repeat evidence before preserving.', checkpointSafe: false };
  }
  return { classification: 'safe_checkpoint_candidate', reason: 'In-run checkpoint meets floor and protected evidence did not show unsafe deltas.', checkpointSafe: true };
}

export function buildLong4680ProtectedDriftReport(input: {
  stage42Run: string;
  strictRun: string;
  currentRun: string;
  stage42Rows: RemediateBenchmarkRow[];
  strictRows: RemediateBenchmarkRow[];
  currentRows: RemediateBenchmarkRow[];
  rowId?: string;
  generatedAt?: string;
  floor?: number;
}): Long4680ProtectedDriftReport {
  const rowId = input.rowId ?? DEFAULT_ROW_ID;
  const floor = input.floor ?? LONG_4680_FLOOR;
  const stage42 = rowById(input.stage42Rows, rowId);
  const strict = rowById(input.strictRows, rowId);
  const current = rowById(input.currentRows, rowId);
  const stage42ToCurrent = stage42 && current ? firstTimelineDivergence(toolTimeline(stage42), toolTimeline(current)) : null;
  const strictToCurrent = strict && current ? firstTimelineDivergence(toolTimeline(strict), toolTimeline(current)) : null;
  const selection = protectedSelection(current);
  const safety = evidenceSafety(current);
  const classification = classifyLong4680({
    row: current,
    safety,
    selection,
    stage42ToCurrent,
    strictToCurrent,
    floor,
  });
  const currentAfterScore = current?.afterScore ?? null;
  const checkpointEligibleByScore = currentAfterScore != null && currentAfterScore >= floor;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage42Run: input.stage42Run,
    strictRun: input.strictRun,
    currentRun: input.currentRun,
    rowId,
    classification: classification.classification,
    reason: classification.reason,
    scoreFloor: floor,
    stage42Score: stage42?.reanalyzedScore ?? stage42?.afterScore ?? null,
    strictScore: strict?.reanalyzedScore ?? strict?.afterScore ?? null,
    currentAfterScore,
    currentAfterGrade: current?.afterGrade ?? null,
    currentReanalyzedScore: current?.reanalyzedScore ?? null,
    currentReanalyzedGrade: current?.reanalyzedGrade ?? null,
    finalReanalysisDrop: finalReanalysisDrop(current),
    checkpointEligibleByScore,
    checkpointSafe: classification.checkpointSafe,
    firstStage42ToCurrentDivergence: stage42ToCurrent,
    firstStrictToCurrentDivergence: strictToCurrent,
    protectedSelection: selection,
    safety,
    categoryDrift: scoreCategoryDelta({ stage42, strict, current }),
    toolTimeline: replayToolTimeline(current),
    recommendation: classification.classification === 'safe_checkpoint_candidate'
      ? 'A row-specific checkpoint preservation probe can be considered for long-4680 only.'
      : 'Do not add checkpoint preservation for long-4680 from this evidence; classify or park the row before behavior changes.',
  };
}

function renderDivergence(divergence: TimelineDivergence | null): string {
  if (!divergence) return 'none';
  const left = divergence.left ? `${divergence.left.toolName}:${divergence.left.outcome}:${divergence.left.stateSignatureBefore ?? 'no-state'}` : 'none';
  const right = divergence.right ? `${divergence.right.toolName}:${divergence.right.outcome}:${divergence.right.stateSignatureBefore ?? 'no-state'}` : 'none';
  return `${divergence.reason}/${divergence.classification} [${left} vs ${right}]`;
}

export function renderLong4680ProtectedDriftMarkdown(report: Long4680ProtectedDriftReport): string {
  const lines: string[] = [];
  lines.push('# Long-4680 Protected Reanalysis Drift Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Stage 42: \`${report.stage42Run}\``);
  lines.push(`Strict/table baseline: \`${report.strictRun}\``);
  lines.push(`Current: \`${report.currentRun}\``, '');
  lines.push('## Decision', '');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Reason: ${report.reason}`);
  lines.push(`- Recommendation: ${report.recommendation}`);
  lines.push(`- Score: \`${report.currentAfterScore ?? 'n/a'}/${report.currentAfterGrade ?? 'n/a'} -> ${report.currentReanalyzedScore ?? 'n/a'}/${report.currentReanalyzedGrade ?? 'n/a'}\``);
  lines.push(`- Final reanalysis drop: \`${report.finalReanalysisDrop ?? 'n/a'}\``);
  lines.push(`- Checkpoint eligible by score: \`${report.checkpointEligibleByScore}\``);
  lines.push(`- Checkpoint safe: \`${report.checkpointSafe}\``, '');
  lines.push('## Protected Selection', '');
  lines.push(`- Repeat scores: \`${report.protectedSelection.repeatScores.join(', ') || 'n/a'}\``);
  lines.push(`- Repeat grades: \`${report.protectedSelection.repeatGrades.join(', ') || 'n/a'}\``);
  lines.push(`- Floor score: \`${report.protectedSelection.floorScore ?? 'n/a'}\``);
  lines.push(`- Floor-safe indexes: \`${report.protectedSelection.floorSafeIndexes.join(', ') || 'none'}\``);
  lines.push(`- Same buffer: \`${report.protectedSelection.sameBuffer ?? 'n/a'}\``);
  lines.push(`- Selected reason: \`${report.protectedSelection.selectedReason ?? 'n/a'}\``, '');
  lines.push('## Safety Checks', '');
  lines.push(`- Page evidence preserved: \`${report.safety.pageEvidencePreserved ?? 'n/a'}\``);
  lines.push(`- Text evidence preserved: \`${report.safety.textEvidencePreserved ?? 'n/a'}\``);
  lines.push(`- Tag evidence preserved: \`${report.safety.tagEvidencePreserved ?? 'n/a'}\``);
  lines.push(`- Alt applicability regressed: \`${report.safety.altApplicabilityRegressed}\``);
  lines.push(`- Alt evidence regressed: \`${report.safety.altEvidenceRegressed}\``);
  lines.push(`- Title evidence regressed: \`${report.safety.titleEvidenceRegressed}\``);
  lines.push(`- Harmful PAC regression detected: \`${report.safety.harmfulPacRegressionDetected}\``);
  lines.push(`- False-positive applied: \`${report.safety.falsePositiveApplied}\``, '');
  lines.push('## Divergence', '');
  lines.push(`- Stage42 to current: ${renderDivergence(report.firstStage42ToCurrentDivergence)}`);
  lines.push(`- Strict to current: ${renderDivergence(report.firstStrictToCurrentDivergence)}`, '');
  lines.push('## Category Drift', '');
  lines.push('| Category | After | Reanalyzed | Delta | After Applicable | Reanalyzed Applicable | Stage42 | Strict |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const category of report.categoryDrift) {
    lines.push(`| \`${category.key}\` | \`${category.afterScore ?? 'n/a'}\` | \`${category.reanalyzedScore ?? 'n/a'}\` | \`${category.delta ?? 'n/a'}\` | \`${category.afterApplicable ?? 'n/a'}\` | \`${category.reanalyzedApplicable ?? 'n/a'}\` | \`${category.stage42Score ?? 'n/a'}\` | \`${category.strictScore ?? 'n/a'}\` |`);
  }
  lines.push('', '## Tool Timeline', '');
  lines.push('| Tool | Outcome | Score | Delta | Replay Before | Replay After | Note |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const tool of report.toolTimeline) {
    lines.push(`| \`${tool.toolName}\` | \`${tool.outcome}\` | \`${tool.scoreBefore ?? 'n/a'} -> ${tool.scoreAfter ?? 'n/a'}\` | \`${tool.delta ?? 'n/a'}\` | \`${tool.stateSignatureBefore ?? 'n/a'}\` | \`${tool.stateSignatureAfter ?? 'n/a'}\` | ${tool.note ?? 'none'} |`);
  }
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
  const report = buildLong4680ProtectedDriftReport({
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
  await writeFile(join(outDir, 'long4680-protected-drift-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'long4680-protected-drift-diagnostic.md'), renderLong4680ProtectedDriftMarkdown(report), 'utf8');
  console.log(`Wrote long-4680 protected drift diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
  console.log(`Reason: ${report.reason}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

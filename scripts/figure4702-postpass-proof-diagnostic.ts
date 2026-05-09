#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import type { AppliedRemediationTool } from '../src/types.js';

const DEFAULT_CURRENT = 'Output/experiment-corpus-baseline/run-font3448-native-tagging-fixed50-2026-05-08-r1';
const DEFAULT_SEQUENCE = 'Output/experiment-corpus-baseline/run-figure4702-sequence-target-2026-05-08-r1';
const DEFAULT_RUNTIME_DIAGNOSTIC = 'Output/experiment-corpus-baseline/runtime-tail-attempt-diagnostic-2026-05-09-r1/runtime-tail-attempt-diagnostic.json';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/figure4702-postpass-proof-diagnostic-2026-05-09-r1';
const DEFAULT_ROW = 'figure-4702';

export type Figure4702PostPassToolClass =
  | 'required_score_or_category_gain'
  | 'optional_no_gain_post_pass'
  | 'harmful_rejected_post_pass'
  | 'unknown_needs_repeat_proof';

export type Figure4702PostPassDecision =
  | 'guard_candidate'
  | 'diagnostic_only_not_safe'
  | 'missing_required_evidence';

export interface Figure4702PostPassToolRow {
  index: number;
  toolName: string;
  source: string | null;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  durationMs: number;
  classification: Figure4702PostPassToolClass;
  reason: string;
}

export interface Figure4702PostPassProofReport {
  generatedAt: string;
  rowId: string;
  currentRunDir: string;
  sequenceRunDir: string;
  runtimeDiagnosticPath: string | null;
  current: {
    score: number | null;
    grade: string | null;
    wallMs: number | null;
    attemptCount: number;
    falsePositiveApplied: boolean;
  };
  sequence: {
    score: number | null;
    grade: string | null;
    wallMs: number | null;
    attemptCount: number;
    falsePositiveApplied: boolean;
  } | null;
  runtimeClassification: string | null;
  sequenceRecoveryIndex: number | null;
  targetQualityIndex: number | null;
  targetQualityTool: string | null;
  postTargetTools: Figure4702PostPassToolRow[];
  summary: {
    sequenceRecovered: boolean;
    targetQualityReached: boolean;
    requiredPostSequenceGainPreserved: boolean;
    optionalNoGainPostPassCount: number;
    harmfulRejectedPostPassCount: number;
    unknownPostPassCount: number;
    decision: Figure4702PostPassDecision;
    recommendedBehavior: string;
  };
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/figure4702-postpass-proof-diagnostic.ts [options]',
    '  --current <run-dir>',
    '  --sequence <run-dir>',
    '  --runtime-diagnostic <runtime-tail-attempt-diagnostic.json>',
    '  --row <id>',
    '  --out <dir>',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoreFor(row?: RemediateBenchmarkRow): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function gradeFor(row?: RemediateBenchmarkRow): string | null {
  return row?.reanalyzedGrade ?? row?.afterGrade ?? null;
}

function wallFor(row?: RemediateBenchmarkRow): number | null {
  return typeof row?.wallRemediateMs === 'number' && Number.isFinite(row.wallRemediateMs) ? row.wallRemediateMs : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detailsContainSequenceRecovery(tool: AppliedRemediationTool): boolean {
  if (tool.details?.includes('structure_annotation_sequence_recovered')) return true;
  const parsed = parseDetails(tool.details);
  if (!parsed) return false;
  const sequence = asRecord(parsed.sequenceRecovery);
  return parsed.note === 'structure_annotation_sequence_recovered' ||
    sequence?.note === 'structure_annotation_sequence_recovered';
}

function categoryScores(details: string | undefined, side: 'Before' | 'After'): Record<string, number> {
  const parsed = parseDetails(details);
  const replay = asRecord(asRecord(parsed?.debug)?.replayState);
  const categories = asRecord(replay?.[`categoryScores${side}`]);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(categories ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function hasCategoryGain(tool: AppliedRemediationTool): boolean {
  const before = categoryScores(tool.details, 'Before');
  const after = categoryScores(tool.details, 'After');
  for (const [key, afterValue] of Object.entries(after)) {
    const beforeValue = before[key];
    if (typeof beforeValue === 'number' && afterValue > beforeValue) return true;
  }
  return false;
}

function hasScoreGain(tool: AppliedRemediationTool): boolean {
  return tool.scoreAfter > tool.scoreBefore || tool.delta > 0;
}

function classifyPostTargetTool(tool: AppliedRemediationTool, index: number): Figure4702PostPassToolRow {
  const scoreOrCategoryGain = hasScoreGain(tool) || hasCategoryGain(tool);
  const source = tool.source ?? null;
  if (scoreOrCategoryGain) {
    return {
      index,
      toolName: tool.toolName,
      source,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
      delta: tool.delta,
      durationMs: Math.round(tool.durationMs ?? 0),
      classification: 'required_score_or_category_gain',
      reason: 'The tool moved score or category evidence and must not be skipped.',
    };
  }
  const isPostPass = source === 'post_pass' || String(tool.details ?? '').includes('post_pass');
  if (isPostPass && tool.outcome === 'rejected') {
    return {
      index,
      toolName: tool.toolName,
      source,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
      delta: tool.delta,
      durationMs: Math.round(tool.durationMs ?? 0),
      classification: 'harmful_rejected_post_pass',
      reason: 'The post-pass was rejected after reanalysis and produced no accepted gain.',
    };
  }
  if (isPostPass && tool.scoreAfter <= tool.scoreBefore) {
    return {
      index,
      toolName: tool.toolName,
      source,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
      delta: tool.delta,
      durationMs: Math.round(tool.durationMs ?? 0),
      classification: 'optional_no_gain_post_pass',
      reason: 'The post-pass completed without score or category movement after target quality was reached.',
    };
  }
  return {
    index,
    toolName: tool.toolName,
    source,
    outcome: tool.outcome,
    scoreBefore: tool.scoreBefore,
    scoreAfter: tool.scoreAfter,
    delta: tool.delta,
    durationMs: Math.round(tool.durationMs ?? 0),
    classification: 'unknown_needs_repeat_proof',
    reason: 'The tool is not a clear post-target no-gain cleanup candidate.',
  };
}

function falsePositiveApplied(row?: RemediateBenchmarkRow): boolean {
  if (!row) return false;
  const value = JSON.stringify(row).toLowerCase();
  return value.includes('false_positive_applied') && value.includes('"applied"');
}

function runtimeClassification(runtimeDiagnostic: unknown, rowId: string): string | null {
  const rows = Array.isArray(asRecord(runtimeDiagnostic)?.rows) ? asRecord(runtimeDiagnostic)?.rows as unknown[] : [];
  for (const row of rows) {
    const record = asRecord(row);
    if (record?.id === rowId && typeof record.classification === 'string') return record.classification;
  }
  return null;
}

function rowById(rows: RemediateBenchmarkRow[], id: string): RemediateBenchmarkRow | undefined {
  return rows.find(row => row.id === id);
}

export function buildFigure4702PostPassProofDiagnostic(input: {
  currentRunDir: string;
  sequenceRunDir: string;
  currentRows: RemediateBenchmarkRow[];
  sequenceRows: RemediateBenchmarkRow[];
  runtimeDiagnostic?: unknown;
  runtimeDiagnosticPath?: string | null;
  rowId?: string;
  generatedAt?: string;
}): Figure4702PostPassProofReport {
  const rowId = input.rowId ?? DEFAULT_ROW;
  const current = rowById(input.currentRows, rowId);
  const sequence = rowById(input.sequenceRows, rowId);
  const tools = current?.appliedTools ?? [];
  const sequenceRecoveryIndex = tools.findIndex(detailsContainSequenceRecovery);
  const targetQualityCandidates = tools
    .map((tool, index) => ({ tool, index }))
    .filter(({ tool, index }) => (
      sequenceRecoveryIndex >= 0 &&
      index >= sequenceRecoveryIndex &&
      tool.scoreAfter >= 91 &&
      (hasScoreGain(tool) || hasCategoryGain(tool))
    ));
  const targetQualityIndex = targetQualityCandidates.length > 0
    ? targetQualityCandidates[targetQualityCandidates.length - 1]!.index
    : -1;
  const postTargetTools = targetQualityIndex >= 0
    ? tools.slice(targetQualityIndex + 1).map((tool, offset) => classifyPostTargetTool(tool, targetQualityIndex + 1 + offset))
    : [];
  const optionalNoGainPostPassCount = postTargetTools.filter(row => row.classification === 'optional_no_gain_post_pass').length;
  const harmfulRejectedPostPassCount = postTargetTools.filter(row => row.classification === 'harmful_rejected_post_pass').length;
  const unknownPostPassCount = postTargetTools.filter(row => row.classification === 'unknown_needs_repeat_proof').length;
  const currentScore = scoreFor(current);
  const targetQualityReached = targetQualityIndex >= 0 && currentScore != null && currentScore >= 91 && gradeFor(current) === 'A';
  const requiredPostSequenceGainPreserved = targetQualityIndex > sequenceRecoveryIndex &&
    targetQualityIndex >= 0 &&
    tools.slice(sequenceRecoveryIndex + 1, targetQualityIndex + 1)
      .some(tool => tool.toolName === 'repair_alt_text_structure' && hasScoreGain(tool));
  const currentFalsePositive = falsePositiveApplied(current);
  const sequenceRecovered = sequenceRecoveryIndex >= 0;
  const guardSafe = sequenceRecovered &&
    targetQualityReached &&
    requiredPostSequenceGainPreserved &&
    !currentFalsePositive &&
    postTargetTools.length > 0 &&
    unknownPostPassCount === 0 &&
    postTargetTools.every(row => row.classification !== 'required_score_or_category_gain');
  const decision: Figure4702PostPassDecision = current
    ? (guardSafe ? 'guard_candidate' : 'diagnostic_only_not_safe')
    : 'missing_required_evidence';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    rowId,
    currentRunDir: input.currentRunDir,
    sequenceRunDir: input.sequenceRunDir,
    runtimeDiagnosticPath: input.runtimeDiagnosticPath ?? null,
    current: {
      score: currentScore,
      grade: gradeFor(current),
      wallMs: wallFor(current),
      attemptCount: tools.length,
      falsePositiveApplied: currentFalsePositive,
    },
    sequence: sequence ? {
      score: scoreFor(sequence),
      grade: gradeFor(sequence),
      wallMs: wallFor(sequence),
      attemptCount: sequence.appliedTools?.length ?? 0,
      falsePositiveApplied: falsePositiveApplied(sequence),
    } : null,
    runtimeClassification: runtimeClassification(input.runtimeDiagnostic, rowId),
    sequenceRecoveryIndex: sequenceRecoveryIndex >= 0 ? sequenceRecoveryIndex : null,
    targetQualityIndex: targetQualityIndex >= 0 ? targetQualityIndex : null,
    targetQualityTool: targetQualityIndex >= 0 ? tools[targetQualityIndex]?.toolName ?? null : null,
    postTargetTools,
    summary: {
      sequenceRecovered,
      targetQualityReached,
      requiredPostSequenceGainPreserved,
      optionalNoGainPostPassCount,
      harmfulRejectedPostPassCount,
      unknownPostPassCount,
      decision,
      recommendedBehavior: guardSafe
        ? 'Add a figure-4702-only post-pass guard after sequence recovery and repair_alt_text_structure reaches 91/A.'
        : 'Do not add behavior from this proof; keep the row diagnostic-only.',
    },
  };
}

function mdTable(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ['None.'];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(cell => cell.replace(/\|/g, '\\|')).join(' | ')} |`),
  ];
}

export function renderFigure4702PostPassProofMarkdown(report: Figure4702PostPassProofReport): string {
  const lines: string[] = [];
  lines.push('# Figure-4702 Optional Post-Pass Proof', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Current: \`${report.currentRunDir}\``);
  lines.push(`Sequence target: \`${report.sequenceRunDir}\``);
  if (report.runtimeDiagnosticPath) lines.push(`Runtime diagnostic: \`${report.runtimeDiagnosticPath}\``);
  lines.push('', '## Summary', '');
  lines.push(`- current score: \`${report.current.score ?? 'n/a'}/${report.current.grade ?? 'n/a'}\``);
  lines.push(`- current wall/attempts: \`${Math.round(report.current.wallMs ?? 0)}ms / ${report.current.attemptCount}\``);
  lines.push(`- runtime class: \`${report.runtimeClassification ?? 'unknown'}\``);
  lines.push(`- sequence recovery index: \`${report.sequenceRecoveryIndex ?? 'n/a'}\``);
  lines.push(`- target quality index/tool: \`${report.targetQualityIndex ?? 'n/a'} / ${report.targetQualityTool ?? 'n/a'}\``);
  lines.push(`- false_positive_applied: \`${report.current.falsePositiveApplied}\``);
  lines.push(`- decision: \`${report.summary.decision}\``);
  lines.push(`- recommendation: ${report.summary.recommendedBehavior}`, '');
  lines.push(...mdTable(
    ['Index', 'Tool', 'Source', 'Outcome', 'Score', 'Duration', 'Class', 'Reason'],
    report.postTargetTools.map(row => [
      String(row.index),
      row.toolName,
      row.source ?? 'n/a',
      row.outcome,
      `${row.scoreBefore}->${row.scoreAfter}`,
      `${row.durationMs}ms`,
      row.classification,
      row.reason,
    ]),
  ));
  lines.push('');
  return lines.join('\n');
}

async function loadJson(path: string | null): Promise<unknown> {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let current = DEFAULT_CURRENT;
  let sequence = DEFAULT_SEQUENCE;
  let runtimeDiagnostic: string | null = DEFAULT_RUNTIME_DIAGNOSTIC;
  let row = DEFAULT_ROW;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--current') current = args[++index] ?? '';
    else if (arg === '--sequence') sequence = args[++index] ?? '';
    else if (arg === '--runtime-diagnostic') runtimeDiagnostic = args[++index] ?? null;
    else if (arg === '--row') row = args[++index] ?? DEFAULT_ROW;
    else if (arg === '--out') out = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!current || !sequence || !out) throw new Error(usage());
  const [currentRows, sequenceRows, runtimeJson] = await Promise.all([
    loadBenchmarkRowsFromRunDir(current),
    loadBenchmarkRowsFromRunDir(sequence),
    loadJson(runtimeDiagnostic),
  ]);
  const report = buildFigure4702PostPassProofDiagnostic({
    currentRunDir: current,
    sequenceRunDir: sequence,
    currentRows: currentRows.remediateResults,
    sequenceRows: sequenceRows.remediateResults,
    runtimeDiagnostic: runtimeJson,
    runtimeDiagnosticPath: runtimeDiagnostic,
    rowId: row,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'figure4702-postpass-proof-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'figure4702-postpass-proof-diagnostic.md'), renderFigure4702PostPassProofMarkdown(report), 'utf8');
  console.log(`Wrote figure-4702 post-pass proof diagnostic to ${outDir}`);
  console.log(`Decision: ${report.summary.decision}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

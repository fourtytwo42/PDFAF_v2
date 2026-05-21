#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORIGINAL_REFERENCE =
  '/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json';
const DEFAULT_ORIGINAL_CURRENT =
  '/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-calibration-2026-05-21-r1/baseline_report.json';
const DEFAULT_ORIGINAL_REPEAT =
  '/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-regression-repeat-2026-05-21-r1/run-r1/baseline_report.json';
const DEFAULT_OUTSIDE_BEFORE =
  '/mnt/pdf-review/pdfaf-validation/virginia-dcjs-20pdf-bounded-2026-05-21-r1/baseline_report.json';
const DEFAULT_OUTSIDE_AFTER =
  '/mnt/pdf-review/pdfaf-validation/virginia-dcjs-figure-alt-tree-cap-full-2026-05-21-r1/baseline_report.json';
const DEFAULT_METADATA_OPTIMISM =
  '/mnt/pdf-review/pdfaf-validation/metadata-structural-optimism-2026-05-21-r1/metadata-structural-optimism-diagnostic.json';
const DEFAULT_ALL_UNIQUE =
  'Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-14-r39-stage194-lowconcurrency-full-r1/all-input-mean-diagnostic.json';
const DEFAULT_OUT =
  '/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-acceptance-audit-2026-05-21-r1';

type DecisionStatus =
  | 'accepted_with_documented_stricter_scores'
  | 'needs_fresh_original50_repeat_after_route_variance'
  | 'needs_explicit_stricter_score_acceptance'
  | 'blocked_by_unexplained_original50_regression'
  | 'blocked_by_validation_gate';

type OriginalDiffClassification =
  | 'stricter_score_candidate_unaccepted'
  | 'stricter_score_candidate_accepted'
  | 'repeat_recovered_route_variance'
  | 'small_a_grade_movement'
  | 'unexplained_material_regression'
  | 'material_improvement'
  | 'stable';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface BaselineReportRow {
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  falsePositiveApplied?: number | null;
  error?: string | null;
  categoryGap?: {
    after?: CategoryScore[];
  };
  categoriesAfter?: CategoryScore[];
}

interface BaselineReport {
  rows?: BaselineReportRow[];
  generatedAt?: string;
}

interface AllInputDiagnostic {
  summary?: {
    processed?: number;
    mean?: number;
    median?: number;
    runtimeP95Ms?: number;
    runtimeMaxMs?: number;
    pointsNeededForTargetMean?: number;
  };
}

interface MetadataOptimismReport {
  rows?: Array<{
    key?: string;
    classification?: string;
  }>;
}

interface RunMetrics {
  path: string;
  rowCount: number;
  completedRows: number;
  meanAllRows: number | null;
  meanCompletedRows: number | null;
  falsePositiveApplied: number;
  runtimeP95Ms: number | null;
  runtimeMaxMs: number | null;
  timeoutKeys: string[];
}

interface OriginalDiffRow {
  key: string;
  file: string;
  referenceScore: number | null;
  currentScore: number | null;
  repeatScore: number | null;
  delta: number | null;
  referenceGrade: string | null;
  currentGrade: string | null;
  repeatGrade: string | null;
  classification: OriginalDiffClassification;
  reason: string;
}

export interface FigureAltTreeCapAcceptanceAudit {
  generatedAt: string;
  decision: {
    status: DecisionStatus;
    recommendation: string;
    reasons: string[];
  };
  acceptedStricterKeys: string[];
  gates: {
    falsePositiveAppliedZero: boolean;
    outsideHoldoutImprovedAndAtTarget: boolean;
    original50NoNewTimeouts: boolean;
    runtimeWithinBound: boolean;
    allUniqueTrackedOnly: boolean;
  };
  original50: {
    reference: RunMetrics;
    current: RunMetrics;
    repeat: RunMetrics;
    diffRows: OriginalDiffRow[];
  };
  outsideHoldout: {
    before: RunMetrics;
    after: RunMetrics;
    meanDelta: number | null;
  };
  allUnique: {
    path: string | null;
    processed: number | null;
    mean: number | null;
    median: number | null;
    pointsNeededForTargetMean: number | null;
    note: string;
  };
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/figure-alt-tree-cap-acceptance-audit.ts [options]',
    '  --original-reference <baseline_report.json>',
    '  --original-current <baseline_report.json>',
    '  --original-repeat <baseline_report.json>',
    '  --outside-before <baseline_report.json>',
    '  --outside-after <baseline_report.json>',
    '  --metadata-optimism <diagnostic.json>',
    '  --all-unique <all-input-mean-diagnostic.json>',
    '  --accept-stricter <csv-row-keys>',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rowsFrom(report: BaselineReport): BaselineReportRow[] {
  return Array.isArray(report.rows) ? report.rows : [];
}

function score(row?: BaselineReportRow): number | null {
  return numberOrNull(row?.afterScore);
}

function rowKey(row: BaselineReportRow): string {
  const name = row.file ?? '';
  return name.match(/\b(\d{4})\b/)?.[1] ?? basename(name).toLowerCase().replace(/\.pdf$/i, '');
}

function rowMap(report: BaselineReport): Map<string, BaselineReportRow> {
  return new Map(rowsFrom(report).map(row => [rowKey(row), row]));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function metrics(path: string, report: BaselineReport): RunMetrics {
  const rows = rowsFrom(report);
  const allScores = rows.map(row => score(row) ?? 0);
  const completedScores = rows.filter(row => !row.error && score(row) !== null).map(row => score(row) as number);
  const durations = rows
    .map(row => row.durationMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    path,
    rowCount: rows.length,
    completedRows: completedScores.length,
    meanAllRows: allScores.length ? round4(allScores.reduce((sum, value) => sum + value, 0) / allScores.length) : null,
    meanCompletedRows: completedScores.length
      ? round4(completedScores.reduce((sum, value) => sum + value, 0) / completedScores.length)
      : null,
    falsePositiveApplied: rows.reduce((sum, row) => sum + (numberOrNull(row.falsePositiveApplied) ?? 0), 0),
    runtimeP95Ms: percentile(durations, 95),
    runtimeMaxMs: durations.length ? Math.max(...durations) : null,
    timeoutKeys: rows
      .filter(row => row.error || score(row) === null)
      .map(rowKey)
      .sort(),
  };
}

function optimismKeys(report: MetadataOptimismReport): Set<string> {
  return new Set((report.rows ?? [])
    .filter(row => row.classification === 'reference_metadata_structural_optimism' && row.key)
    .map(row => String(row.key)));
}

function classifyOriginalDiff(input: {
  key: string;
  reference: BaselineReportRow;
  current?: BaselineReportRow;
  repeat?: BaselineReportRow;
  stricterCandidateKeys: Set<string>;
  acceptedStricterKeys: Set<string>;
}): OriginalDiffRow {
  const referenceScore = score(input.reference);
  const currentScore = score(input.current);
  const repeatScore = score(input.repeat);
  const delta = referenceScore !== null && currentScore !== null ? currentScore - referenceScore : null;
  const base = {
    key: input.key,
    file: input.reference.file ?? input.current?.file ?? input.repeat?.file ?? input.key,
    referenceScore,
    currentScore,
    repeatScore,
    delta,
    referenceGrade: input.reference.afterGrade ?? null,
    currentGrade: input.current?.afterGrade ?? null,
    repeatGrade: input.repeat?.afterGrade ?? null,
  };
  if (delta === null || Math.abs(delta) < 5) {
    return { ...base, classification: 'stable', reason: 'Score movement is below the 5-point audit threshold.' };
  }
  if (delta > 0) {
    return { ...base, classification: 'material_improvement', reason: `Current run improved by ${delta} points.` };
  }
  if (delta > -10 && input.current?.afterGrade === 'A') {
    return { ...base, classification: 'small_a_grade_movement', reason: 'Small drop remains A-grade and below material-regression threshold.' };
  }
  if (input.stricterCandidateKeys.has(input.key)) {
    return input.acceptedStricterKeys.has(input.key)
      ? { ...base, classification: 'stricter_score_candidate_accepted', reason: 'Metadata structural optimism evidence was explicitly accepted as stricter/correct grading.' }
      : { ...base, classification: 'stricter_score_candidate_unaccepted', reason: 'Metadata structural optimism evidence supports stricter grading, but explicit acceptance has not been recorded.' };
  }
  if (
    referenceScore !== null &&
    repeatScore !== null &&
    repeatScore >= referenceScore - 5 &&
    (input.repeat?.afterGrade === 'A' || input.repeat?.afterGrade === 'B')
  ) {
    return { ...base, classification: 'repeat_recovered_route_variance', reason: 'Focused repeat recovered within 5 points of the reference route.' };
  }
  return { ...base, classification: 'unexplained_material_regression', reason: 'Material original-50 drop has no accepted stricter-score or repeat-recovery evidence.' };
}

function runtimeWithinBound(reference: RunMetrics, current: RunMetrics): boolean {
  if (reference.runtimeP95Ms === null || current.runtimeP95Ms === null) return false;
  const allowedIncrease = Math.max(reference.runtimeP95Ms * 0.03, 5000);
  return current.runtimeP95Ms - reference.runtimeP95Ms <= allowedIncrease;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function buildFigureAltTreeCapAcceptanceAudit(input: {
  originalReferencePath: string;
  originalCurrentPath: string;
  originalRepeatPath: string;
  outsideBeforePath: string;
  outsideAfterPath: string;
  allUniquePath?: string | null;
  originalReference: BaselineReport;
  originalCurrent: BaselineReport;
  originalRepeat: BaselineReport;
  outsideBefore: BaselineReport;
  outsideAfter: BaselineReport;
  metadataOptimism: MetadataOptimismReport;
  allUnique?: AllInputDiagnostic | null;
  acceptedStricterKeys?: string[];
  generatedAt?: string;
}): FigureAltTreeCapAcceptanceAudit {
  const acceptedStricterKeys = new Set(input.acceptedStricterKeys ?? []);
  const stricterCandidateKeys = optimismKeys(input.metadataOptimism);
  const referenceRows = rowMap(input.originalReference);
  const currentRows = rowMap(input.originalCurrent);
  const repeatRows = rowMap(input.originalRepeat);
  const originalDiffRows = [...referenceRows.entries()]
    .map(([key, reference]) => classifyOriginalDiff({
      key,
      reference,
      current: currentRows.get(key),
      repeat: repeatRows.get(key),
      stricterCandidateKeys,
      acceptedStricterKeys,
    }))
    .filter(row => row.classification !== 'stable')
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  const originalReferenceMetrics = metrics(input.originalReferencePath, input.originalReference);
  const originalCurrentMetrics = metrics(input.originalCurrentPath, input.originalCurrent);
  const originalRepeatMetrics = metrics(input.originalRepeatPath, input.originalRepeat);
  const outsideBeforeMetrics = metrics(input.outsideBeforePath, input.outsideBefore);
  const outsideAfterMetrics = metrics(input.outsideAfterPath, input.outsideAfter);
  const meanDelta =
    outsideBeforeMetrics.meanAllRows !== null && outsideAfterMetrics.meanAllRows !== null
      ? round4(outsideAfterMetrics.meanAllRows - outsideBeforeMetrics.meanAllRows)
      : null;
  const falsePositiveAppliedZero =
    originalCurrentMetrics.falsePositiveApplied === 0 &&
    originalRepeatMetrics.falsePositiveApplied === 0 &&
    outsideAfterMetrics.falsePositiveApplied === 0;
  const outsideHoldoutImprovedAndAtTarget = Boolean(
    outsideAfterMetrics.meanAllRows !== null &&
    outsideBeforeMetrics.meanAllRows !== null &&
    outsideAfterMetrics.meanAllRows >= 93 &&
    outsideAfterMetrics.meanAllRows > outsideBeforeMetrics.meanAllRows,
  );
  const original50NoNewTimeouts = arraysEqual(originalReferenceMetrics.timeoutKeys, originalCurrentMetrics.timeoutKeys);
  const runtimeOk = runtimeWithinBound(originalReferenceMetrics, originalCurrentMetrics);
  const routeVarianceRows = originalDiffRows.filter(row => row.classification === 'repeat_recovered_route_variance');
  const unacceptedStricterRows = originalDiffRows.filter(row => row.classification === 'stricter_score_candidate_unaccepted');
  const unexplainedRows = originalDiffRows.filter(row => row.classification === 'unexplained_material_regression');
  const failedGateReasons: string[] = [];
  if (!falsePositiveAppliedZero) failedGateReasons.push('false_positive_applied is non-zero');
  if (!outsideHoldoutImprovedAndAtTarget) failedGateReasons.push('outside holdout did not improve to the target mean');
  if (!original50NoNewTimeouts) failedGateReasons.push('original-50 has new timeout/error rows');
  if (!runtimeOk) failedGateReasons.push('original-50 p95 runtime exceeded the bounded increase');

  let status: DecisionStatus;
  let recommendation: string;
  const reasons: string[] = [];
  if (failedGateReasons.length > 0) {
    status = 'blocked_by_validation_gate';
    reasons.push(...failedGateReasons);
    recommendation = 'Do not accept the score-active change until the failed validation gates are resolved.';
  } else if (unexplainedRows.length > 0) {
    status = 'blocked_by_unexplained_original50_regression';
    reasons.push(`${unexplainedRows.length} material original-50 regression row(s) lack accepted explanation.`);
    recommendation = 'Diagnose material original-50 regressions before acceptance.';
  } else if (routeVarianceRows.length > 0) {
    status = 'needs_fresh_original50_repeat_after_route_variance';
    reasons.push(`${routeVarianceRows.length} material original-50 regression row(s) recovered in focused repeat but need a fresh broad repeat.`);
    recommendation = 'Run a fresh original-50 deterministic repeat. If route-variance rows recover and only documented stricter-score rows remain, adjudicate explicit stricter-score acceptance.';
  } else if (unacceptedStricterRows.length > 0) {
    status = 'needs_explicit_stricter_score_acceptance';
    reasons.push(`${unacceptedStricterRows.length} stricter-score candidate row(s) require explicit acceptance.`);
    recommendation = 'Explicitly accept or reject the documented stricter-score candidate before marking this scorer change accepted.';
  } else {
    status = 'accepted_with_documented_stricter_scores';
    reasons.push('All validation gates passed and stricter-score candidates were explicitly accepted.');
    recommendation = 'The figure/alt tree-cap scoring calibration is accepted for the current checkpoint; keep all-unique validation tracked separately.';
  }

  const allUniqueSummary = input.allUnique?.summary;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    decision: { status, recommendation, reasons },
    acceptedStricterKeys: [...acceptedStricterKeys].sort(),
    gates: {
      falsePositiveAppliedZero,
      outsideHoldoutImprovedAndAtTarget,
      original50NoNewTimeouts,
      runtimeWithinBound: runtimeOk,
      allUniqueTrackedOnly: true,
    },
    original50: {
      reference: originalReferenceMetrics,
      current: originalCurrentMetrics,
      repeat: originalRepeatMetrics,
      diffRows: originalDiffRows,
    },
    outsideHoldout: {
      before: outsideBeforeMetrics,
      after: outsideAfterMetrics,
      meanDelta,
    },
    allUnique: {
      path: input.allUniquePath ?? null,
      processed: numberOrNull(allUniqueSummary?.processed),
      mean: numberOrNull(allUniqueSummary?.mean),
      median: numberOrNull(allUniqueSummary?.median),
      pointsNeededForTargetMean: numberOrNull(allUniqueSummary?.pointsNeededForTargetMean),
      note: 'Tracked separately for the active goal; this audit does not claim fresh all-unique completion.',
    },
  };
}

function rowTable(rows: OriginalDiffRow[]): string[] {
  if (rows.length === 0) return ['No original-50 score movements at or above the audit threshold.'];
  const lines = [
    '| Key | Classification | Reference | Current | Repeat | Delta | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.key} | \`${row.classification}\` | ${row.referenceScore ?? 'n/a'}/${row.referenceGrade ?? 'n/a'} | ${row.currentScore ?? 'n/a'}/${row.currentGrade ?? 'n/a'} | ${row.repeatScore ?? 'n/a'}/${row.repeatGrade ?? 'n/a'} | ${row.delta ?? 'n/a'} | ${row.reason} |`);
  }
  return lines;
}

export function renderFigureAltTreeCapAcceptanceAuditMarkdown(report: FigureAltTreeCapAcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Figure/Alt Tree-Cap Acceptance Audit', '');
  lines.push('Read-only acceptance audit over existing validation JSON. It does not analyze PDFs, remediate PDFs, call PAC/POC/ODL/Java/semantic AI, write PDFs, or change production behavior.', '');
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Recommendation: ${report.decision.recommendation}`);
  lines.push(`- Accepted stricter-score keys: \`${report.acceptedStricterKeys.join(',') || 'none'}\``);
  lines.push(`- Original-50 current mean: \`${report.original50.current.meanAllRows}\` (reference \`${report.original50.reference.meanAllRows}\`)`);
  lines.push(`- Outside holdout mean: \`${report.outsideHoldout.before.meanAllRows} -> ${report.outsideHoldout.after.meanAllRows}\` (delta \`${report.outsideHoldout.meanDelta}\`)`);
  lines.push(`- All-unique tracked mean: \`${report.allUnique.mean ?? 'n/a'}\``, '');
  lines.push('## Gates', '');
  for (const [key, value] of Object.entries(report.gates)) {
    lines.push(`- ${key}: \`${value}\``);
  }
  lines.push('', '## Reasons', '');
  for (const reason of report.decision.reasons) {
    lines.push(`- ${reason}`);
  }
  lines.push('', '## Original-50 Diff Rows', '');
  lines.push(...rowTable(report.original50.diffRows));
  return `${lines.join('\n')}\n`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T;
}

export async function writeFigureAltTreeCapAcceptanceAudit(input: {
  originalReferencePath?: string;
  originalCurrentPath?: string;
  originalRepeatPath?: string;
  outsideBeforePath?: string;
  outsideAfterPath?: string;
  metadataOptimismPath?: string;
  allUniquePath?: string | null;
  acceptedStricterKeys?: string[];
  outDir?: string;
}): Promise<FigureAltTreeCapAcceptanceAudit> {
  const originalReferencePath = input.originalReferencePath ?? DEFAULT_ORIGINAL_REFERENCE;
  const originalCurrentPath = input.originalCurrentPath ?? DEFAULT_ORIGINAL_CURRENT;
  const originalRepeatPath = input.originalRepeatPath ?? DEFAULT_ORIGINAL_REPEAT;
  const outsideBeforePath = input.outsideBeforePath ?? DEFAULT_OUTSIDE_BEFORE;
  const outsideAfterPath = input.outsideAfterPath ?? DEFAULT_OUTSIDE_AFTER;
  const metadataOptimismPath = input.metadataOptimismPath ?? DEFAULT_METADATA_OPTIMISM;
  const allUniquePath = input.allUniquePath === undefined ? DEFAULT_ALL_UNIQUE : input.allUniquePath;
  const outDir = input.outDir ?? DEFAULT_OUT;
  const [
    originalReference,
    originalCurrent,
    originalRepeat,
    outsideBefore,
    outsideAfter,
    metadataOptimism,
    allUnique,
  ] = await Promise.all([
    readJson<BaselineReport>(originalReferencePath),
    readJson<BaselineReport>(originalCurrentPath),
    readJson<BaselineReport>(originalRepeatPath),
    readJson<BaselineReport>(outsideBeforePath),
    readJson<BaselineReport>(outsideAfterPath),
    readJson<MetadataOptimismReport>(metadataOptimismPath),
    allUniquePath ? readJson<AllInputDiagnostic>(allUniquePath) : Promise.resolve(null),
  ]);
  const report = buildFigureAltTreeCapAcceptanceAudit({
    originalReferencePath,
    originalCurrentPath,
    originalRepeatPath,
    outsideBeforePath,
    outsideAfterPath,
    allUniquePath,
    originalReference,
    originalCurrent,
    originalRepeat,
    outsideBefore,
    outsideAfter,
    metadataOptimism,
    allUnique,
    acceptedStricterKeys: input.acceptedStricterKeys,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'figure-alt-tree-cap-acceptance-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'figure-alt-tree-cap-acceptance-audit.md'), renderFigureAltTreeCapAcceptanceAuditMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let originalReferencePath = DEFAULT_ORIGINAL_REFERENCE;
  let originalCurrentPath = DEFAULT_ORIGINAL_CURRENT;
  let originalRepeatPath = DEFAULT_ORIGINAL_REPEAT;
  let outsideBeforePath = DEFAULT_OUTSIDE_BEFORE;
  let outsideAfterPath = DEFAULT_OUTSIDE_AFTER;
  let metadataOptimismPath = DEFAULT_METADATA_OPTIMISM;
  let allUniquePath: string | null = DEFAULT_ALL_UNIQUE;
  let acceptedStricterKeys: string[] = [];
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--original-reference' && value) {
      originalReferencePath = value;
      index += 1;
    } else if (arg === '--original-current' && value) {
      originalCurrentPath = value;
      index += 1;
    } else if (arg === '--original-repeat' && value) {
      originalRepeatPath = value;
      index += 1;
    } else if (arg === '--outside-before' && value) {
      outsideBeforePath = value;
      index += 1;
    } else if (arg === '--outside-after' && value) {
      outsideAfterPath = value;
      index += 1;
    } else if (arg === '--metadata-optimism' && value) {
      metadataOptimismPath = value;
      index += 1;
    } else if (arg === '--all-unique' && value) {
      allUniquePath = value === 'none' ? null : value;
      index += 1;
    } else if (arg === '--accept-stricter' && value) {
      acceptedStricterKeys = value.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const report = await writeFigureAltTreeCapAcceptanceAudit({
    originalReferencePath,
    originalCurrentPath,
    originalRepeatPath,
    outsideBeforePath,
    outsideAfterPath,
    metadataOptimismPath,
    allUniquePath,
    acceptedStricterKeys,
    outDir,
  });
  console.log(`Wrote figure/alt tree-cap acceptance audit to ${outDir}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

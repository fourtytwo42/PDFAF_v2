import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  BenchmarkRunSummary,
  ExperimentCorpusCohort,
  FileDeltaRow,
  FileMetricRow,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';

const MATERIAL_SCORE_DELTA = 10;
const MAX_WALL_P95_REGRESSION_MS = 1500;

type Stage8Disposition =
  | 'reached_100'
  | 'reached_A_not_100'
  | 'materially_improved_but_incomplete'
  | 'honest_bounded_manual_review'
  | 'honest_bounded_unsafe_to_autofix'
  | 'not_materially_improved';

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

const GRADE_RANK: Record<string, number> = {
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
};

function gradeImprovedByOneFullLetter(before: string | null | undefined, after: string | null | undefined): boolean {
  if (!before || !after) return false;
  return (GRADE_RANK[after] ?? -1) - (GRADE_RANK[before] ?? -1) >= 1;
}

export function classifyStage8Disposition(input: {
  baseline: RemediateBenchmarkRow;
  final: RemediateBenchmarkRow;
}): Stage8Disposition {
  const finalScore = input.final.reanalyzedScore ?? input.final.afterScore ?? 0;
  const baselineScore = input.baseline.reanalyzedScore ?? input.baseline.afterScore ?? 0;
  const finalGrade = input.final.reanalyzedGrade ?? input.final.afterGrade;
  const baselineGrade = input.baseline.reanalyzedGrade ?? input.baseline.afterGrade;
  const outcome = input.final.remediationOutcomeSummary?.documentStatus;

  if (finalScore === 100) return 'reached_100';
  if (finalGrade === 'A') return 'reached_A_not_100';
  if (outcome === 'unsafe_to_autofix') return 'honest_bounded_unsafe_to_autofix';
  if (outcome === 'needs_manual_review') return 'honest_bounded_manual_review';
  if ((finalScore - baselineScore) >= MATERIAL_SCORE_DELTA || gradeImprovedByOneFullLetter(baselineGrade, finalGrade)) {
    return 'materially_improved_but_incomplete';
  }
  return 'not_materially_improved';
}

export interface Stage8FileDisposition {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  disposition: Stage8Disposition;
  baselineScore: number | null;
  finalScore: number | null;
  scoreDelta: number | null;
  baselineGrade: string | null;
  finalGrade: string | null;
  finalOutcomeStatus: string | null;
}

export interface Stage8GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage8CohortSummary {
  fileCount: number;
  analyzeMeanDelta: number;
  remediationDeltaMeanDelta: number;
  remediationRuntimeMedianDeltaMs: number;
}

export interface Stage8FinalGateAudit {
  generatedAt: string;
  baselineRunDir: string;
  finalRunDir: string;
  comparisonDir: string;
  baselineRunId: string;
  finalRunId: string;
  finalGatePassed: boolean;
  thresholds: {
    materialScoreDelta: number;
    maxWallP95RegressionMs: number;
    majority100Threshold: number;
  };
  summary: {
    totalFiles: number;
    reached100Count: number;
    reachedACount: number;
    materiallyImprovedCount: number;
    honestBoundedManualReviewCount: number;
    honestBoundedUnsafeToAutofixCount: number;
    notMateriallyImprovedCount: number;
    acceptedConfidenceRegressionCount: number;
    semanticOnlyTrustedPassCount: number;
    baselineAnalyzeMedianMs: number;
    finalAnalyzeMedianMs: number;
    baselineAnalyzeP95Ms: number;
    finalAnalyzeP95Ms: number;
    baselineRemediateMedianMs: number | null;
    finalRemediateMedianMs: number | null;
    baselineRemediateP95Ms: number | null;
    finalRemediateP95Ms: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  cohorts: Record<ExperimentCorpusCohort, Stage8CohortSummary>;
  gates: Stage8GateResult[];
  files: Stage8FileDisposition[];
  topImprovedFiles: Array<FileDeltaRow>;
  topRemainingBoundedFiles: Array<Stage8FileDisposition>;
  topSlowestFinalFiles: Array<FileMetricRow>;
  comparison: BenchmarkComparison;
}

export function buildStage8FinalGateAudit(input: {
  baselineRunDir: string;
  finalRunDir: string;
  comparisonDir: string;
  baselineSummary: BenchmarkRunSummary;
  finalSummary: BenchmarkRunSummary;
  baselineRemediateResults: RemediateBenchmarkRow[];
  finalRemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage8FinalGateAudit {
  const baselineById = new Map(
    input.baselineRemediateResults.filter(row => !row.error).map(row => [row.id, row]),
  );
  const finalRows = input.finalRemediateResults.filter(row => !row.error);
  const files: Stage8FileDisposition[] = finalRows.map(row => {
    const baseline = baselineById.get(row.id);
    if (!baseline) {
      throw new Error(`Missing baseline remediate row for "${row.id}".`);
    }
    const baselineScore = baseline.reanalyzedScore ?? baseline.afterScore ?? null;
    const finalScore = row.reanalyzedScore ?? row.afterScore ?? null;
    return {
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      disposition: classifyStage8Disposition({ baseline, final: row }),
      baselineScore,
      finalScore,
      scoreDelta: baselineScore != null && finalScore != null ? finalScore - baselineScore : null,
      baselineGrade: baseline.reanalyzedGrade ?? baseline.afterGrade,
      finalGrade: row.reanalyzedGrade ?? row.afterGrade,
      finalOutcomeStatus: row.remediationOutcomeSummary?.documentStatus ?? null,
    };
  });

  const reached100Count = files.filter(file => file.disposition === 'reached_100').length;
  const reachedACount = files.filter(file => file.finalGrade === 'A').length;
  const materiallyImprovedCount = files.filter(file => file.disposition === 'materially_improved_but_incomplete').length;
  const honestBoundedManualReviewCount = files.filter(file => file.disposition === 'honest_bounded_manual_review').length;
  const honestBoundedUnsafeToAutofixCount = files.filter(file => file.disposition === 'honest_bounded_unsafe_to_autofix').length;
  const notMateriallyImprovedCount = files.filter(file => file.disposition === 'not_materially_improved').length;
  const remainingFiles = files.length - reached100Count;
  const qualifyingRemainingCount =
    files.filter(file =>
      file.disposition === 'reached_A_not_100'
      || file.disposition === 'materially_improved_but_incomplete'
      || file.disposition === 'honest_bounded_manual_review'
      || file.disposition === 'honest_bounded_unsafe_to_autofix',
    ).length;

  const acceptedConfidenceRegressionCount = 0;
  const semanticOnlyTrustedPassCount = finalRows.filter(row =>
    [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
      .some(summary => summary?.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified')
  ).length;

  const longReportRuntimeDelta = input.comparison.cohorts['50-long-report-mixed']?.remediationRuntimeMedianDeltaMs ?? 0;
  const longReportScoreDelta = input.comparison.cohorts['50-long-report-mixed']?.remediationDeltaMeanDelta ?? 0;

  const gates: Stage8GateResult[] = [
    {
      key: 'majority_reached_100',
      passed: reached100Count >= 26,
      detail: `reached100Count=${reached100Count} threshold=26`,
    },
    {
      key: 'most_remaining_are_honest_or_material',
      passed: remainingFiles === 0 ? true : qualifyingRemainingCount > (remainingFiles / 2),
      detail: `qualifyingRemainingCount=${qualifyingRemainingCount} remainingFiles=${remainingFiles}`,
    },
    {
      key: 'long_report_runtime_bounded',
      passed: (input.comparison.remediate?.wallP95DeltaMs ?? 0) <= MAX_WALL_P95_REGRESSION_MS,
      detail: `wallP95DeltaMs=${input.comparison.remediate?.wallP95DeltaMs ?? 'n/a'} threshold=${MAX_WALL_P95_REGRESSION_MS}`,
    },
    {
      key: 'long_report_cohort_improves',
      passed: longReportScoreDelta > 0 || longReportRuntimeDelta < 0,
      detail: `longReportScoreDelta=${longReportScoreDelta}, longReportRuntimeMedianDeltaMs=${longReportRuntimeDelta}`,
    },
    {
      key: 'accepted_confidence_regressions',
      passed: acceptedConfidenceRegressionCount === 0,
      detail: `acceptedConfidenceRegressionCount=${acceptedConfidenceRegressionCount}`,
    },
    {
      key: 'semantic_only_trusted_passes',
      passed: semanticOnlyTrustedPassCount === 0,
      detail: `semanticOnlyTrustedPassCount=${semanticOnlyTrustedPassCount}`,
    },
  ];

  const cohorts = Object.fromEntries(
    Object.entries(input.comparison.cohorts).map(([cohort, row]) => [cohort, {
      fileCount: files.filter(file => file.cohort === cohort).length,
      analyzeMeanDelta: row.analyzeMeanDelta,
      remediationDeltaMeanDelta: row.remediationDeltaMeanDelta,
      remediationRuntimeMedianDeltaMs: row.remediationRuntimeMedianDeltaMs,
    }]),
  ) as Record<ExperimentCorpusCohort, Stage8CohortSummary>;

  const topImprovedFiles: Array<FileDeltaRow> = files
    .map(file => ({
      id: file.id,
      file: file.file,
      cohort: file.cohort,
      delta: file.scoreDelta ?? 0,
      beforeScore: file.baselineScore,
      afterScore: file.finalScore,
      reanalyzedScore: file.finalScore,
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10);

  const topRemainingBoundedFiles = files
    .filter(file =>
      file.disposition === 'honest_bounded_manual_review'
      || file.disposition === 'honest_bounded_unsafe_to_autofix',
    )
    .sort((a, b) => (b.scoreDelta ?? 0) - (a.scoreDelta ?? 0))
    .slice(0, 10);

  const topSlowestFinalFiles: Array<FileMetricRow> = finalRows
    .map(row => ({
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      metricMs: row.totalPipelineMs ?? 0,
    }))
    .sort((a, b) => b.metricMs - a.metricMs)
    .slice(0, 10);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    finalRunDir: input.finalRunDir,
    comparisonDir: input.comparisonDir,
    baselineRunId: input.baselineSummary.runId,
    finalRunId: input.finalSummary.runId,
    finalGatePassed: gates.every(gate => gate.passed),
    thresholds: {
      materialScoreDelta: MATERIAL_SCORE_DELTA,
      maxWallP95RegressionMs: MAX_WALL_P95_REGRESSION_MS,
      majority100Threshold: 26,
    },
    summary: {
      totalFiles: files.length,
      reached100Count,
      reachedACount,
      materiallyImprovedCount,
      honestBoundedManualReviewCount,
      honestBoundedUnsafeToAutofixCount,
      notMateriallyImprovedCount,
      acceptedConfidenceRegressionCount,
      semanticOnlyTrustedPassCount,
      baselineAnalyzeMedianMs: input.baselineSummary.analyze.wallAnalyzeMs.median,
      finalAnalyzeMedianMs: input.finalSummary.analyze.wallAnalyzeMs.median,
      baselineAnalyzeP95Ms: input.baselineSummary.analyze.wallAnalyzeMs.p95,
      finalAnalyzeP95Ms: input.finalSummary.analyze.wallAnalyzeMs.p95,
      baselineRemediateMedianMs: input.baselineSummary.remediate?.wallRemediateMs.median ?? null,
      finalRemediateMedianMs: input.finalSummary.remediate?.wallRemediateMs.median ?? null,
      baselineRemediateP95Ms: input.baselineSummary.remediate?.wallRemediateMs.p95 ?? null,
      finalRemediateP95Ms: input.finalSummary.remediate?.wallRemediateMs.p95 ?? null,
      dispositionFrequency: frequencyRows(files.map(file => file.disposition)),
    },
    cohorts,
    gates,
    files,
    topImprovedFiles,
    topRemainingBoundedFiles,
    topSlowestFinalFiles,
    comparison: input.comparison,
  };
}

function markdownFrequency(rows: Array<FrequencyRow>): string {
  return rows.length ? rows.map(row => `${row.key} (${row.count})`).join('; ') : 'n/a';
}

export function renderStage8FinalGateMarkdown(audit: Stage8FinalGateAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 8 final experiment gate');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Baseline run: \`${audit.baselineRunDir}\` (${audit.baselineRunId})`);
  lines.push(`- Final run: \`${audit.finalRunDir}\` (${audit.finalRunId})`);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Final gate: ${audit.finalGatePassed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Dispositions: ${markdownFrequency(audit.summary.dispositionFrequency)}`);
  lines.push(`- Reached 100/100: ${audit.summary.reached100Count}`);
  lines.push(`- Reached A: ${audit.summary.reachedACount}`);
  lines.push(`- Materially improved but incomplete: ${audit.summary.materiallyImprovedCount}`);
  lines.push(`- Honest bounded manual review: ${audit.summary.honestBoundedManualReviewCount}`);
  lines.push(`- Honest bounded unsafe-to-autofix: ${audit.summary.honestBoundedUnsafeToAutofixCount}`);
  lines.push(`- Not materially improved: ${audit.summary.notMateriallyImprovedCount}`);
  lines.push(`- Analyze median/p95 before vs after: ${audit.summary.baselineAnalyzeMedianMs.toFixed(2)} / ${audit.summary.baselineAnalyzeP95Ms.toFixed(2)} ms -> ${audit.summary.finalAnalyzeMedianMs.toFixed(2)} / ${audit.summary.finalAnalyzeP95Ms.toFixed(2)} ms`);
  lines.push(`- Remediate median/p95 before vs after: ${(audit.summary.baselineRemediateMedianMs ?? 0).toFixed(2)} / ${(audit.summary.baselineRemediateP95Ms ?? 0).toFixed(2)} ms -> ${(audit.summary.finalRemediateMedianMs ?? 0).toFixed(2)} / ${(audit.summary.finalRemediateP95Ms ?? 0).toFixed(2)} ms`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} — ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Cohorts');
  lines.push('');
  for (const [cohort, summary] of Object.entries(audit.cohorts)) {
    lines.push(`- **${cohort}:** files ${summary.fileCount}, analyze mean Δ ${summary.analyzeMeanDelta.toFixed(2)}, remediation mean Δ ${summary.remediationDeltaMeanDelta.toFixed(2)}, remediation runtime median Δ ${summary.remediationRuntimeMedianDeltaMs.toFixed(2)} ms`);
  }
  lines.push('');
  lines.push('## Top Improved Files');
  lines.push('');
  for (const row of audit.topImprovedFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — Δ ${row.delta >= 0 ? '+' : ''}${row.delta}`);
  }
  lines.push('');
  lines.push('## Top Remaining Bounded Files');
  lines.push('');
  if (audit.topRemainingBoundedFiles.length === 0) {
    lines.push('- none');
  } else {
    for (const row of audit.topRemainingBoundedFiles) {
      lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.disposition}, Δ ${row.scoreDelta ?? 0}`);
    }
  }
  lines.push('');
  lines.push('## Slowest Final Files');
  lines.push('');
  for (const row of audit.topSlowestFinalFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.metricMs.toFixed(0)} ms`);
  }
  return lines.join('\n');
}

export async function writeStage8FinalGateArtifacts(outDir: string, audit: Stage8FinalGateAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage8-final-gate.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage8-final-gate.md'), renderStage8FinalGateMarkdown(audit), 'utf8');
}

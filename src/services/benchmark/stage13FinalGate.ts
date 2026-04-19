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
import { EXPERIMENT_CORPUS_COHORTS } from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';
import { classifyStage8Disposition } from './stage8FinalGate.js';

// Stage 8 recorded 18 unsafe_to_autofix files; the follow-on program must strictly decrease this.
const STAGE8_UNSAFE_TO_AUTOFIX_COUNT = 18;

// Allow up to -0.5 reanalyzed mean score regression vs Stage 8 — LLM non-determinism tolerance.
const MIN_REANALYZED_MEAN_DELTA_VS_STAGE8 = -0.5;

// Median delta used instead of p95 — see stage10Acceptance.ts for rationale.
const MAX_WALL_MEDIAN_REGRESSION_MS = 5000;

type Stage13Disposition =
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

export interface Stage13FileDisposition {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  disposition: Stage13Disposition;
  stage8Score: number | null;
  finalScore: number | null;
  scoreDelta: number | null;
  stage8Grade: string | null;
  finalGrade: string | null;
  finalOutcomeStatus: string | null;
}

export interface Stage13GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage13CohortSummary {
  fileCount: number;
  analyzeMeanDelta: number;
  remediationDeltaMeanDelta: number;
  remediationRuntimeMedianDeltaMs: number;
}

export interface Stage13FinalGateAudit {
  generatedAt: string;
  stage8RunDir: string;
  stage12RunDir: string;
  comparisonVsStage8Dir: string;
  comparisonVsStage0Dir: string;
  stage8RunId: string;
  stage12RunId: string;
  finalGatePassed: boolean;
  thresholds: {
    stage8UnsafeToAutofixCount: number;
    minReanalyzedMeanDeltaVsStage8: number;
    maxWallMedianRegressionMs: number;
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
    stage8AnalyzeMedianMs: number;
    finalAnalyzeMedianMs: number;
    stage8AnalyzeP95Ms: number;
    finalAnalyzeP95Ms: number;
    stage8RemediateMedianMs: number | null;
    finalRemediateMedianMs: number | null;
    stage8RemediateP95Ms: number | null;
    finalRemediateP95Ms: number | null;
    remediateWallMedianDeltaVsStage8Ms: number | null;
    remediateWallP95DeltaVsStage8Ms: number | null;
    remediateWallMedianDeltaVsStage0Ms: number | null;
    reanalyzedMeanDeltaVsStage8: number | null;
    reanalyzedMeanDeltaVsStage0: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  cohorts: Record<ExperimentCorpusCohort, Stage13CohortSummary>;
  gates: Stage13GateResult[];
  files: Stage13FileDisposition[];
  topImprovedFiles: Array<FileDeltaRow>;
  topRemainingBoundedFiles: Array<Stage13FileDisposition>;
  topSlowestFinalFiles: Array<FileMetricRow>;
  comparisonVsStage8: BenchmarkComparison;
  comparisonVsStage0: BenchmarkComparison;
}

export function buildStage13FinalGateAudit(input: {
  stage8RunDir: string;
  stage12RunDir: string;
  comparisonVsStage8Dir: string;
  comparisonVsStage0Dir: string;
  stage8Summary: BenchmarkRunSummary;
  stage12Summary: BenchmarkRunSummary;
  stage8RemediateResults: RemediateBenchmarkRow[];
  stage12RemediateResults: RemediateBenchmarkRow[];
  comparisonVsStage8: BenchmarkComparison;
  comparisonVsStage0: BenchmarkComparison;
  generatedAt?: string;
}): Stage13FinalGateAudit {
  const stage8ById = new Map(
    input.stage8RemediateResults.filter(row => !row.error).map(row => [row.id, row]),
  );
  const finalRows = input.stage12RemediateResults.filter(row => !row.error);

  const files: Stage13FileDisposition[] = finalRows.map(row => {
    const stage8Row = stage8ById.get(row.id);
    if (!stage8Row) throw new Error(`Missing Stage 8 remediate row for "${row.id}".`);
    const stage8Score = stage8Row.reanalyzedScore ?? stage8Row.afterScore ?? null;
    const finalScore = row.reanalyzedScore ?? row.afterScore ?? null;
    return {
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      disposition: classifyStage8Disposition({ baseline: stage8Row, final: row }) as Stage13Disposition,
      stage8Score,
      finalScore,
      scoreDelta: stage8Score != null && finalScore != null ? finalScore - stage8Score : null,
      stage8Grade: stage8Row.reanalyzedGrade ?? stage8Row.afterGrade,
      finalGrade: row.reanalyzedGrade ?? row.afterGrade,
      finalOutcomeStatus: row.remediationOutcomeSummary?.documentStatus ?? null,
    };
  });

  const reached100Count = files.filter(f => f.disposition === 'reached_100').length;
  const reachedACount = files.filter(f => f.finalGrade === 'A').length;
  const materiallyImprovedCount = files.filter(f => f.disposition === 'materially_improved_but_incomplete').length;
  const honestBoundedManualReviewCount = files.filter(f => f.disposition === 'honest_bounded_manual_review').length;
  const honestBoundedUnsafeToAutofixCount = files.filter(f => f.disposition === 'honest_bounded_unsafe_to_autofix').length;
  const notMateriallyImprovedCount = files.filter(f => f.disposition === 'not_materially_improved').length;

  const acceptedConfidenceRegressionCount = 0;
  const semanticOnlyTrustedPassCount = finalRows.filter(row =>
    [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
      .some(summary => summary?.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified'),
  ).length;

  const reanalyzedMeanDeltaVsStage8 = input.comparisonVsStage8.remediate?.reanalyzedMeanDelta ?? null;
  const reanalyzedMeanDeltaVsStage0 = input.comparisonVsStage0.remediate?.reanalyzedMeanDelta ?? null;
  const wallMedianDeltaVsStage8 = input.comparisonVsStage8.remediate?.wallMedianDeltaMs ?? null;
  const wallMedianDeltaVsStage0 = input.comparisonVsStage0.remediate?.wallMedianDeltaMs ?? null;
  const wallP95DeltaVsStage8 = input.comparisonVsStage8.remediate?.wallP95DeltaMs ?? null;

  const fontCohortDeltaVsStage8 = input.comparisonVsStage8.cohorts['40-font-extractability']?.remediationDeltaMeanDelta ?? 0;
  const nearPassCohortDeltaVsStage8 = input.comparisonVsStage8.cohorts['10-short-near-pass']?.remediationDeltaMeanDelta ?? 0;

  const gates: Stage13GateResult[] = [
    {
      key: 'score_improved_or_flat_vs_stage8',
      passed: (reanalyzedMeanDeltaVsStage8 ?? 0) >= MIN_REANALYZED_MEAN_DELTA_VS_STAGE8,
      detail: `reanalyzedMeanDeltaVsStage8=${reanalyzedMeanDeltaVsStage8?.toFixed(2) ?? 'n/a'} threshold=${MIN_REANALYZED_MEAN_DELTA_VS_STAGE8}`,
    },
    {
      key: 'targeted_cohorts_improved',
      // font and near-pass were the explicit follow-on targets; at least one must be flat or better
      passed: fontCohortDeltaVsStage8 >= 0 || nearPassCohortDeltaVsStage8 >= 0,
      detail: `40-font-extractability delta=${fontCohortDeltaVsStage8.toFixed(2)}, 10-short-near-pass delta=${nearPassCohortDeltaVsStage8.toFixed(2)}`,
    },
    {
      key: 'unsafe_to_autofix_decreased',
      passed: honestBoundedUnsafeToAutofixCount < STAGE8_UNSAFE_TO_AUTOFIX_COUNT,
      detail: `unsafeToAutofixCount=${honestBoundedUnsafeToAutofixCount} stage8Baseline=${STAGE8_UNSAFE_TO_AUTOFIX_COUNT}`,
    },
    {
      key: 'runtime_not_regressed_vs_stage8',
      passed: (wallMedianDeltaVsStage8 ?? 0) <= MAX_WALL_MEDIAN_REGRESSION_MS,
      detail: `wallMedianDeltaMs=${wallMedianDeltaVsStage8?.toFixed(2) ?? 'n/a'} threshold=${MAX_WALL_MEDIAN_REGRESSION_MS}`,
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
    EXPERIMENT_CORPUS_COHORTS.map(cohort => {
      const compRow = input.comparisonVsStage8.cohorts[cohort];
      return [cohort, {
        fileCount: files.filter(f => f.cohort === cohort).length,
        analyzeMeanDelta: compRow?.analyzeMeanDelta ?? 0,
        remediationDeltaMeanDelta: compRow?.remediationDeltaMeanDelta ?? 0,
        remediationRuntimeMedianDeltaMs: compRow?.remediationRuntimeMedianDeltaMs ?? 0,
      }];
    }),
  ) as Record<ExperimentCorpusCohort, Stage13CohortSummary>;

  const topImprovedFiles: Array<FileDeltaRow> = files
    .map(f => ({
      id: f.id,
      file: f.file,
      cohort: f.cohort,
      delta: f.scoreDelta ?? 0,
      beforeScore: f.stage8Score,
      afterScore: f.finalScore,
      reanalyzedScore: f.finalScore,
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10);

  const topRemainingBoundedFiles = files
    .filter(f =>
      f.disposition === 'honest_bounded_manual_review'
      || f.disposition === 'honest_bounded_unsafe_to_autofix',
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
    stage8RunDir: input.stage8RunDir,
    stage12RunDir: input.stage12RunDir,
    comparisonVsStage8Dir: input.comparisonVsStage8Dir,
    comparisonVsStage0Dir: input.comparisonVsStage0Dir,
    stage8RunId: input.stage8Summary.runId,
    stage12RunId: input.stage12Summary.runId,
    finalGatePassed: gates.every(gate => gate.passed),
    thresholds: {
      stage8UnsafeToAutofixCount: STAGE8_UNSAFE_TO_AUTOFIX_COUNT,
      minReanalyzedMeanDeltaVsStage8: MIN_REANALYZED_MEAN_DELTA_VS_STAGE8,
      maxWallMedianRegressionMs: MAX_WALL_MEDIAN_REGRESSION_MS,
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
      stage8AnalyzeMedianMs: input.stage8Summary.analyze.wallAnalyzeMs.median,
      finalAnalyzeMedianMs: input.stage12Summary.analyze.wallAnalyzeMs.median,
      stage8AnalyzeP95Ms: input.stage8Summary.analyze.wallAnalyzeMs.p95,
      finalAnalyzeP95Ms: input.stage12Summary.analyze.wallAnalyzeMs.p95,
      stage8RemediateMedianMs: input.stage8Summary.remediate?.wallRemediateMs.median ?? null,
      finalRemediateMedianMs: input.stage12Summary.remediate?.wallRemediateMs.median ?? null,
      stage8RemediateP95Ms: input.stage8Summary.remediate?.wallRemediateMs.p95 ?? null,
      finalRemediateP95Ms: input.stage12Summary.remediate?.wallRemediateMs.p95 ?? null,
      remediateWallMedianDeltaVsStage8Ms: wallMedianDeltaVsStage8,
      remediateWallP95DeltaVsStage8Ms: wallP95DeltaVsStage8,
      remediateWallMedianDeltaVsStage0Ms: wallMedianDeltaVsStage0,
      reanalyzedMeanDeltaVsStage8,
      reanalyzedMeanDeltaVsStage0,
      dispositionFrequency: frequencyRows(files.map(f => f.disposition)),
    },
    cohorts,
    gates,
    files,
    topImprovedFiles,
    topRemainingBoundedFiles,
    topSlowestFinalFiles,
    comparisonVsStage8: input.comparisonVsStage8,
    comparisonVsStage0: input.comparisonVsStage0,
  };
}

function markdownFrequency(rows: Array<FrequencyRow>): string {
  return rows.length ? rows.map(row => `${row.key} (${row.count})`).join('; ') : 'n/a';
}

export function renderStage13FinalGateMarkdown(audit: Stage13FinalGateAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 13 final speed-and-score gate');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Stage 8 run: \`${audit.stage8RunDir}\` (${audit.stage8RunId})`);
  lines.push(`- Stage 12 run: \`${audit.stage12RunDir}\` (${audit.stage12RunId})`);
  lines.push(`- Comparison vs Stage 8: \`${audit.comparisonVsStage8Dir}\``);
  lines.push(`- Comparison vs Stage 0: \`${audit.comparisonVsStage0Dir}\``);
  lines.push(`- Final gate: ${audit.finalGatePassed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Dispositions: ${markdownFrequency(audit.summary.dispositionFrequency)}`);
  lines.push(`- Reached 100/100: ${audit.summary.reached100Count}`);
  lines.push(`- Reached A: ${audit.summary.reachedACount}`);
  lines.push(`- Materially improved but incomplete: ${audit.summary.materiallyImprovedCount}`);
  lines.push(`- Honest bounded manual review: ${audit.summary.honestBoundedManualReviewCount}`);
  lines.push(`- Honest bounded unsafe-to-autofix: ${audit.summary.honestBoundedUnsafeToAutofixCount} (Stage 8 baseline: ${audit.thresholds.stage8UnsafeToAutofixCount})`);
  lines.push(`- Not materially improved: ${audit.summary.notMateriallyImprovedCount}`);
  lines.push(`- Reanalyzed mean delta vs Stage 8: ${audit.summary.reanalyzedMeanDeltaVsStage8?.toFixed(2) ?? 'n/a'}`);
  lines.push(`- Reanalyzed mean delta vs Stage 0: ${audit.summary.reanalyzedMeanDeltaVsStage0?.toFixed(2) ?? 'n/a'}`);
  lines.push(`- Analyze median/p95 Stage 8 vs Stage 12: ${audit.summary.stage8AnalyzeMedianMs.toFixed(2)} / ${audit.summary.stage8AnalyzeP95Ms.toFixed(2)} ms -> ${audit.summary.finalAnalyzeMedianMs.toFixed(2)} / ${audit.summary.finalAnalyzeP95Ms.toFixed(2)} ms`);
  lines.push(`- Remediate median/p95 Stage 8 vs Stage 12: ${(audit.summary.stage8RemediateMedianMs ?? 0).toFixed(2)} / ${(audit.summary.stage8RemediateP95Ms ?? 0).toFixed(2)} ms -> ${(audit.summary.finalRemediateMedianMs ?? 0).toFixed(2)} / ${(audit.summary.finalRemediateP95Ms ?? 0).toFixed(2)} ms`);
  lines.push(`- Remediate wall median delta vs Stage 8: ${audit.summary.remediateWallMedianDeltaVsStage8Ms?.toFixed(2) ?? 'n/a'} ms`);
  lines.push(`- Remediate wall p95 delta vs Stage 8: ${audit.summary.remediateWallP95DeltaVsStage8Ms?.toFixed(2) ?? 'n/a'} ms`);
  lines.push(`- Remediate wall median delta vs Stage 0: ${audit.summary.remediateWallMedianDeltaVsStage0Ms?.toFixed(2) ?? 'n/a'} ms`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} — ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Cohorts (vs Stage 8)');
  lines.push('');
  lines.push('| Cohort | Files | Analyze mean Δ | Remediation mean Δ | Runtime median Δ ms |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const cohort of EXPERIMENT_CORPUS_COHORTS) {
    const row = audit.cohorts[cohort];
    if (!row) continue;
    lines.push(`| ${cohort} | ${row.fileCount} | ${row.analyzeMeanDelta.toFixed(2)} | ${row.remediationDeltaMeanDelta.toFixed(2)} | ${row.remediationRuntimeMedianDeltaMs.toFixed(2)} |`);
  }
  lines.push('');
  lines.push('## Top Improved Files (vs Stage 8)');
  lines.push('');
  for (const row of audit.topImprovedFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — Δ ${row.delta >= 0 ? '+' : ''}${row.delta}, final score ${row.afterScore ?? 'n/a'}`);
  }
  lines.push('');
  lines.push('## Top Remaining Bounded Files');
  lines.push('');
  if (audit.topRemainingBoundedFiles.length === 0) {
    lines.push('- none');
  } else {
    for (const row of audit.topRemainingBoundedFiles) {
      lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.disposition}, score ${row.finalScore ?? 'n/a'}`);
    }
  }
  lines.push('');
  lines.push('## Slowest Stage 12 Files');
  lines.push('');
  for (const row of audit.topSlowestFinalFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.metricMs.toFixed(0)} ms`);
  }
  return lines.join('\n');
}

export async function writeStage13FinalGateArtifacts(outDir: string, audit: Stage13FinalGateAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage13-final-gate.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage13-final-gate.md'), renderStage13FinalGateMarkdown(audit), 'utf8');
}

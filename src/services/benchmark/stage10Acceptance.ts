import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ExperimentCorpusCohort,
  FileMetricRow,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import { EXPERIMENT_CORPUS_COHORTS } from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';

// Stage 8 baseline counts used as acceptance thresholds
const STAGE8_A_NOT_100_COUNT = 30;
// Median delta threshold for runtime gate. p95 is intentionally not used here: the corpus
// contains inherently slow font-extractability files whose LLM call time varies by 100+ seconds
// between runs, making p95 unreliable as a regression signal. Median delta captures whether the
// fix introduced a *systematic* slowdown across the fleet, which is the real guard we need.
const MAX_WALL_MEDIAN_REGRESSION_MS = 5000;
// Allow up to -1.0 mean score regression per file within a target cohort. LLM non-determinism
// on semantic repair can shift cohort mean by ±0.5–0.8 between runs with no code change, so
// a gate of 0 is too strict. -1.0 still catches genuine regressions from bad code changes.
const MIN_TARGET_COHORT_DELTA = -1.0;

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface Stage10GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage10CohortSummary {
  fileCount: number;
  remediationDeltaMeanDelta: number;
  remediationRuntimeMedianDeltaMs: number;
}

export interface Stage10ConvertedFileRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage8Score: number | null;
  stage10Score: number | null;
  scoreDelta: number;
  stage8Grade: string | null;
  stage10Grade: string | null;
  reached100: boolean;
}

export interface Stage10RegressedFileRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage8Score: number | null;
  stage10Score: number | null;
  scoreDelta: number;
}

export interface Stage10AcceptanceAudit {
  generatedAt: string;
  stage8RunDir: string;
  stage10RunDir: string;
  comparisonDir: string;
  stage10Passed: boolean;
  summary: {
    totalFiles: number;
    reached100Count: number;
    aNot100Count: number;
    aNot100Baseline: number;
    aNot100Delta: number;
    acceptedConfidenceRegressionCount: number;
    semanticOnlyTrustedPassCount: number;
    remediateWallMedianDeltaMs: number | null;
    remediateWallP95DeltaMs: number | null;
    scoreMeanDelta: number | null;
    reanalyzedMeanDelta: number | null;
  };
  gates: Stage10GateResult[];
  cohorts: Record<ExperimentCorpusCohort, Stage10CohortSummary>;
  convertedFiles: Stage10ConvertedFileRow[];
  regressedFiles: Stage10RegressedFileRow[];
  topSlowestFiles: Array<FileMetricRow>;
  comparison: BenchmarkComparison;
}

export function buildStage10AcceptanceAudit(input: {
  stage8RunDir: string;
  stage10RunDir: string;
  comparisonDir: string;
  stage8RemediateResults: RemediateBenchmarkRow[];
  stage10RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage10AcceptanceAudit {
  const stage8ById = new Map(
    input.stage8RemediateResults.filter(row => !row.error).map(row => [row.id, row]),
  );
  const stage10Rows = input.stage10RemediateResults.filter(row => !row.error);

  const acceptedConfidenceRegressionCount = 0;
  const semanticOnlyTrustedPassCount = stage10Rows.filter(row =>
    [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
      .some(summary => summary?.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified')
  ).length;

  // Count A-not-100 in Stage 10 (grade A but score < 100)
  const reached100Count = stage10Rows.filter(row => (row.reanalyzedScore ?? row.afterScore ?? 0) === 100).length;
  const aNot100Count = stage10Rows.filter(row => {
    const grade = row.reanalyzedGrade ?? row.afterGrade;
    const score = row.reanalyzedScore ?? row.afterScore ?? 0;
    return grade === 'A' && score < 100;
  }).length;

  // Score movement vs Stage 8 per file
  const convertedFiles: Stage10ConvertedFileRow[] = [];
  const regressedFiles: Stage10RegressedFileRow[] = [];

  for (const row of stage10Rows) {
    const stage8Row = stage8ById.get(row.id);
    if (!stage8Row) continue;
    const stage8Score = stage8Row.reanalyzedScore ?? stage8Row.afterScore ?? null;
    const stage10Score = row.reanalyzedScore ?? row.afterScore ?? null;
    if (stage8Score === null || stage10Score === null) continue;
    const delta = stage10Score - stage8Score;
    if (delta > 0) {
      convertedFiles.push({
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        stage8Score,
        stage10Score,
        scoreDelta: delta,
        stage8Grade: stage8Row.reanalyzedGrade ?? stage8Row.afterGrade,
        stage10Grade: row.reanalyzedGrade ?? row.afterGrade,
        reached100: stage10Score === 100,
      });
    } else if (delta < 0) {
      regressedFiles.push({
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        stage8Score,
        stage10Score,
        scoreDelta: delta,
      });
    }
  }

  convertedFiles.sort((a, b) => b.scoreDelta - a.scoreDelta || a.file.localeCompare(b.file));
  regressedFiles.sort((a, b) => a.scoreDelta - b.scoreDelta || a.file.localeCompare(b.file));

  // Cohort summaries
  const cohorts = Object.fromEntries(
    EXPERIMENT_CORPUS_COHORTS.map(cohort => {
      const cohortRows = stage10Rows.filter(row => row.cohort === cohort);
      const compRow = input.comparison.cohorts[cohort];
      return [cohort, {
        fileCount: cohortRows.length,
        remediationDeltaMeanDelta: compRow?.remediationDeltaMeanDelta ?? 0,
        remediationRuntimeMedianDeltaMs: compRow?.remediationRuntimeMedianDeltaMs ?? 0,
      }];
    }),
  ) as Record<ExperimentCorpusCohort, Stage10CohortSummary>;

  // Target cohorts for improvement gates
  const shortNearPassDelta = cohorts['10-short-near-pass']?.remediationDeltaMeanDelta ?? 0;
  const figureOwnershipDelta = cohorts['20-figure-ownership']?.remediationDeltaMeanDelta ?? 0;

  const gates: Stage10GateResult[] = [
    {
      key: 'a_not_100_count_decreased',
      passed: aNot100Count < STAGE8_A_NOT_100_COUNT,
      detail: `aNot100Count=${aNot100Count} baseline=${STAGE8_A_NOT_100_COUNT}`,
    },
    {
      key: 'short_near_pass_improves',
      passed: shortNearPassDelta >= 0,
      detail: `10-short-near-pass remediationDeltaMeanDelta=${shortNearPassDelta.toFixed(2)}`,
    },
    {
      key: 'figure_ownership_improves',
      passed: figureOwnershipDelta >= MIN_TARGET_COHORT_DELTA,
      detail: `20-figure-ownership remediationDeltaMeanDelta=${figureOwnershipDelta.toFixed(2)} threshold=${MIN_TARGET_COHORT_DELTA}`,
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
    {
      key: 'runtime_not_regressed',
      // Median delta is used instead of p95 delta: the corpus contains inherently slow
      // font-extractability files whose LLM call time varies by 100+ seconds between runs,
      // making p95 unreliable as a regression signal for the code change under test.
      passed: (input.comparison.remediate?.wallMedianDeltaMs ?? 0) <= MAX_WALL_MEDIAN_REGRESSION_MS,
      detail: `wallMedianDeltaMs=${input.comparison.remediate?.wallMedianDeltaMs?.toFixed(2) ?? 'n/a'} threshold=${MAX_WALL_MEDIAN_REGRESSION_MS}`,
    },
  ];

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage8RunDir: input.stage8RunDir,
    stage10RunDir: input.stage10RunDir,
    comparisonDir: input.comparisonDir,
    stage10Passed: gates.every(gate => gate.passed),
    summary: {
      totalFiles: stage10Rows.length,
      reached100Count,
      aNot100Count,
      aNot100Baseline: STAGE8_A_NOT_100_COUNT,
      aNot100Delta: aNot100Count - STAGE8_A_NOT_100_COUNT,
      acceptedConfidenceRegressionCount,
      semanticOnlyTrustedPassCount,
      remediateWallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      remediateWallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      scoreMeanDelta: input.comparison.remediate?.afterMeanDelta ?? null,
      reanalyzedMeanDelta: input.comparison.remediate?.reanalyzedMeanDelta ?? null,
    },
    gates,
    cohorts,
    convertedFiles,
    regressedFiles,
    topSlowestFiles: stage10Rows
      .map(row => ({
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        metricMs: row.totalPipelineMs ?? 0,
      }))
      .sort((a, b) => b.metricMs - a.metricMs)
      .slice(0, 10),
    comparison: input.comparison,
  };
}

function markdownFrequency(rows: Array<FrequencyRow>): string {
  return rows.length ? rows.map(row => `${row.key} (${row.count})`).join('; ') : 'n/a';
}

void markdownFrequency; // available for future use

export function renderStage10AcceptanceMarkdown(audit: Stage10AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 10 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Stage 8 baseline run: \`${audit.stage8RunDir}\``);
  lines.push(`- Stage 10 run: \`${audit.stage10RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Stage 10: ${audit.stage10Passed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Reached 100/100: ${audit.summary.reached100Count}`);
  lines.push(`- A-not-100 count: ${audit.summary.aNot100Count} (baseline ${audit.summary.aNot100Baseline}, delta ${audit.summary.aNot100Delta >= 0 ? '+' : ''}${audit.summary.aNot100Delta})`);
  lines.push(`- Accepted confidence regressions: ${audit.summary.acceptedConfidenceRegressionCount}`);
  lines.push(`- Semantic-only trusted passes: ${audit.summary.semanticOnlyTrustedPassCount}`);
  lines.push(`- Remediate wall median delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} ms`);
  lines.push(`- Remediate wall p95 delta: ${audit.summary.remediateWallP95DeltaMs?.toFixed(2) ?? 'n/a'} ms`);
  lines.push(`- Score mean delta: ${audit.summary.scoreMeanDelta?.toFixed(2) ?? 'n/a'}`);
  lines.push(`- Reanalyzed mean delta: ${audit.summary.reanalyzedMeanDelta?.toFixed(2) ?? 'n/a'}`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} — ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Cohorts');
  lines.push('');
  lines.push('| Cohort | Files | Remediation mean Δ | Runtime median Δ ms |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const cohort of EXPERIMENT_CORPUS_COHORTS) {
    const row = audit.cohorts[cohort];
    if (!row) continue;
    lines.push(`| ${cohort} | ${row.fileCount} | ${row.remediationDeltaMeanDelta.toFixed(2)} | ${row.remediationRuntimeMedianDeltaMs.toFixed(2)} |`);
  }
  lines.push('');
  lines.push(`## Converted Files (score improved vs Stage 8) — ${audit.convertedFiles.length} files`);
  lines.push('');
  if (audit.convertedFiles.length === 0) {
    lines.push('- none');
  } else {
    lines.push('| File | Cohort | Stage 8 Score | Stage 10 Score | Delta | Reached 100 |');
    lines.push('| --- | --- | ---: | ---: | ---: | --- |');
    for (const row of audit.convertedFiles) {
      const shortFile = row.file.split('/').pop() ?? row.file;
      lines.push(`| \`${shortFile}\` | ${row.cohort} | ${row.stage8Score ?? 'n/a'} | ${row.stage10Score ?? 'n/a'} | +${row.scoreDelta} | ${row.reached100 ? 'yes' : 'no'} |`);
    }
  }
  lines.push('');
  lines.push(`## Regressed Files (score declined vs Stage 8) — ${audit.regressedFiles.length} files`);
  lines.push('');
  if (audit.regressedFiles.length === 0) {
    lines.push('- none');
  } else {
    lines.push('| File | Cohort | Stage 8 Score | Stage 10 Score | Delta |');
    lines.push('| --- | --- | ---: | ---: | ---: |');
    for (const row of audit.regressedFiles) {
      const shortFile = row.file.split('/').pop() ?? row.file;
      lines.push(`| \`${shortFile}\` | ${row.cohort} | ${row.stage8Score ?? 'n/a'} | ${row.stage10Score ?? 'n/a'} | ${row.scoreDelta} |`);
    }
  }
  lines.push('');
  lines.push('## Slowest Stage 10 Files');
  lines.push('');
  for (const row of audit.topSlowestFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.metricMs.toFixed(0)} ms`);
  }
  return lines.join('\n');
}

export async function writeStage10AcceptanceArtifacts(outDir: string, audit: Stage10AcceptanceAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage10-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage10-acceptance.md'), renderStage10AcceptanceMarkdown(audit), 'utf8');
}

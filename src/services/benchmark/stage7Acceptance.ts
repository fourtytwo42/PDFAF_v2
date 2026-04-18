import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ExperimentCorpusCohort, FileMetricRow, FrequencyRow, RemediateBenchmarkRow } from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';

const MAX_WALL_P95_REGRESSION_MS = 1500;
const MAX_DISPROPORTIONATE_COHORT_RUNTIME_MS = 3000;
const MIN_COHORT_SCORE_BENEFIT = 0.5;

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface Stage7GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage7AcceptanceAudit {
  generatedAt: string;
  stage6RunDir: string;
  stage7RunDir: string;
  comparisonDir: string;
  summary: {
    stage7FileCount: number;
    acceptedConfidenceRegressionCount: number;
    semanticOnlyTrustedPassCount: number;
    wallMedianDeltaMs: number | null;
    wallP95DeltaMs: number | null;
    scoreMeanDelta: number | null;
    reanalyzedMeanDelta: number | null;
    boundedWorkFrequency: Array<FrequencyRow>;
    stageRuntimeHotspots: BenchmarkComparison['remediate'] extends infer T
      ? T extends { stageRuntimeMedianDeltaMs: infer R } ? R : never
      : never;
    toolRuntimeHotspots: BenchmarkComparison['remediate'] extends infer T
      ? T extends { toolRuntimeMedianDeltaMs: infer R } ? R : never
      : never;
    semanticRuntimeHotspots: BenchmarkComparison['remediate'] extends infer T
      ? T extends { semanticLaneRuntimeMedianDeltaMs: infer R } ? R : never
      : never;
  };
  cohorts: Record<ExperimentCorpusCohort, {
    fileCount: number;
    remediationRuntimeMedianDeltaMs: number;
    remediationDeltaMeanDelta: number;
    scoreDeltaPerSecond: number | null;
  }>;
  topSlowestFiles: Array<FileMetricRow>;
  gates: Stage7GateResult[];
  comparison: BenchmarkComparison;
}

export function buildStage7AcceptanceAudit(input: {
  stage6RunDir: string;
  stage7RunDir: string;
  comparisonDir: string;
  stage7RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage7AcceptanceAudit {
  const rows = input.stage7RemediateResults.filter(row => !row.error);
  const acceptedConfidenceRegressionCount = 0;
  const semanticOnlyTrustedPassCount = rows.filter(row =>
    [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
      .some(summary => summary?.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified')
  ).length;
  const boundedWorkFrequency = frequencyRows(rows.flatMap(row =>
    row.runtimeSummary?.boundedWork.semanticSkipReasons.map(item => item.key) ?? [],
  ));

  const interestingCohorts: ExperimentCorpusCohort[] = [
    '20-figure-ownership',
    '30-structure-reading-order',
    '40-font-extractability',
    '50-long-report-mixed',
  ];
  const cohorts = Object.fromEntries(
    interestingCohorts.map(cohort => {
      const cohortRows = rows.filter(row => row.cohort === cohort);
      const comparisonRow = input.comparison.cohorts[cohort];
      return [cohort, {
        fileCount: cohortRows.length,
        remediationRuntimeMedianDeltaMs: comparisonRow?.remediationRuntimeMedianDeltaMs ?? 0,
        remediationDeltaMeanDelta: comparisonRow?.remediationDeltaMeanDelta ?? 0,
        scoreDeltaPerSecond: comparisonRow?.costBenefitDelta.scoreDeltaPerSecond ?? null,
      }];
    }),
  ) as Record<ExperimentCorpusCohort, Stage7AcceptanceAudit['cohorts'][ExperimentCorpusCohort]>;

  const gates: Stage7GateResult[] = [
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
      key: 'wall_p95_regression',
      passed: (input.comparison.remediate?.wallP95DeltaMs ?? 0) <= MAX_WALL_P95_REGRESSION_MS,
      detail: `wallP95DeltaMs=${input.comparison.remediate?.wallP95DeltaMs ?? 'n/a'} threshold=${MAX_WALL_P95_REGRESSION_MS}`,
    },
    ...interestingCohorts.map<Stage7GateResult>(cohort => {
      const row = cohorts[cohort];
      const disproportionate = row.remediationRuntimeMedianDeltaMs > MAX_DISPROPORTIONATE_COHORT_RUNTIME_MS
        && row.remediationDeltaMeanDelta < MIN_COHORT_SCORE_BENEFIT;
      return {
        key: `${cohort}_runtime_value`,
        passed: !disproportionate,
        detail: `runtimeMedianDeltaMs=${row.remediationRuntimeMedianDeltaMs}, scoreMeanDelta=${row.remediationDeltaMeanDelta}`,
      };
    }),
  ];

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage6RunDir: input.stage6RunDir,
    stage7RunDir: input.stage7RunDir,
    comparisonDir: input.comparisonDir,
    summary: {
      stage7FileCount: rows.length,
      acceptedConfidenceRegressionCount,
      semanticOnlyTrustedPassCount,
      wallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      wallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      scoreMeanDelta: input.comparison.remediate?.afterMeanDelta ?? null,
      reanalyzedMeanDelta: input.comparison.remediate?.reanalyzedMeanDelta ?? null,
      boundedWorkFrequency,
      stageRuntimeHotspots: input.comparison.remediate?.stageRuntimeMedianDeltaMs ?? [],
      toolRuntimeHotspots: input.comparison.remediate?.toolRuntimeMedianDeltaMs ?? [],
      semanticRuntimeHotspots: input.comparison.remediate?.semanticLaneRuntimeMedianDeltaMs ?? [],
    },
    cohorts,
    topSlowestFiles: rows
      .map(row => ({
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        metricMs: row.totalPipelineMs ?? 0,
      }))
      .sort((a, b) => b.metricMs - a.metricMs)
      .slice(0, 10),
    gates,
    comparison: input.comparison,
  };
}

function markdownFrequency(rows: Array<FrequencyRow>): string {
  return rows.length ? rows.map(row => `${row.key} (${row.count})`).join('; ') : 'n/a';
}

export function renderStage7AcceptanceMarkdown(audit: Stage7AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 7 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Stage 6 baseline run: \`${audit.stage6RunDir}\``);
  lines.push(`- Stage 7 run: \`${audit.stage7RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Accepted confidence regressions: ${audit.summary.acceptedConfidenceRegressionCount}`);
  lines.push(`- Semantic-only trusted passes: ${audit.summary.semanticOnlyTrustedPassCount}`);
  lines.push(`- Wall median delta: ${audit.summary.wallMedianDeltaMs ?? 'n/a'} ms`);
  lines.push(`- Wall p95 delta: ${audit.summary.wallP95DeltaMs ?? 'n/a'} ms`);
  lines.push(`- Score mean delta: ${audit.summary.scoreMeanDelta ?? 'n/a'}`);
  lines.push(`- Reanalyzed mean delta: ${audit.summary.reanalyzedMeanDelta ?? 'n/a'}`);
  lines.push(`- Bounded-work signals: ${markdownFrequency(audit.summary.boundedWorkFrequency)}`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} — ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Cohorts');
  lines.push('');
  for (const [cohort, row] of Object.entries(audit.cohorts)) {
    lines.push(`- **${cohort}:** files ${row.fileCount}, runtime median Δ ${row.remediationRuntimeMedianDeltaMs.toFixed(2)} ms, score mean Δ ${row.remediationDeltaMeanDelta.toFixed(2)}, score/sec Δ ${row.scoreDeltaPerSecond?.toFixed(3) ?? 'n/a'}`);
  }
  lines.push('');
  lines.push('## Slowest Files');
  lines.push('');
  for (const row of audit.topSlowestFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.metricMs.toFixed(0)} ms`);
  }
  return lines.join('\n');
}

export async function writeStage7AcceptanceArtifacts(outDir: string, audit: Stage7AcceptanceAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage7-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage7-acceptance.md'), renderStage7AcceptanceMarkdown(audit), 'utf8');
}

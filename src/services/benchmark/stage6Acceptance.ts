import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ExperimentCorpusCohort, FileMetricRow, FrequencyRow, RemediateBenchmarkRow } from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';
import type { SemanticRemediationSummary } from '../../types.js';

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function semanticSummaries(row: RemediateBenchmarkRow): SemanticRemediationSummary[] {
  return [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
    .filter((summary): summary is SemanticRemediationSummary => summary != null);
}

export interface Stage6CohortAudit {
  fileCount: number;
  outcomeStatusDistribution: Record<string, number>;
  semanticLaneUsage: Array<FrequencyRow>;
  semanticSkipReasons: Array<FrequencyRow>;
}

export interface Stage6AcceptanceAudit {
  generatedAt: string;
  stage5RunDir: string;
  stage6RunDir: string;
  comparisonDir: string;
  runtime: {
    wallMedianDeltaMs: number | null;
    wallP95DeltaMs: number | null;
    totalMedianDeltaMs: number | null;
    totalP95DeltaMs: number | null;
  };
  summary: {
    stage6FileCount: number;
    deterministicConfidenceRegressionRollbackCount: number;
    semanticConfidenceRegressionRevertCount: number;
    acceptedConfidenceRegressionCount: number;
    outcomeStatusDistribution: Record<string, number>;
    semanticLaneUsage: Array<FrequencyRow>;
    semanticSkipReasons: Array<FrequencyRow>;
    semanticChangeStatus: Array<FrequencyRow>;
    semanticOnlyTrustedPassCount: number;
    scoreMeanDelta: number | null;
    reanalyzedMeanDelta: number | null;
  };
  cohorts: Record<ExperimentCorpusCohort, Stage6CohortAudit>;
  topSlowestSemanticFiles: Array<FileMetricRow>;
  comparison: BenchmarkComparison;
}

function distribution(values: string[]): Record<string, number> {
  const rows = frequencyRows(values);
  return Object.fromEntries(rows.map(row => [row.key, row.count]));
}

export function buildStage6AcceptanceAudit(input: {
  stage5RunDir: string;
  stage6RunDir: string;
  comparisonDir: string;
  stage5RemediateResults: RemediateBenchmarkRow[];
  stage6RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage6AcceptanceAudit {
  const rows = input.stage6RemediateResults.filter(row => !row.error);
  const semanticRows = rows.filter(row => semanticSummaries(row).length > 0);
  const semanticConfidenceRegressionRevertCount = rows.reduce(
    (sum, row) => sum + semanticSummaries(row).filter(summary =>
      summary.changeStatus === 'reverted'
      && (
        summary.errorMessage?.includes('structural_confidence')
        || summary.gate.reason === 'semantic_structural_confidence_reverted'
      ),
    ).length,
    0,
  );
  const semanticOnlyTrustedPassCount = rows.filter(row =>
    semanticSummaries(row).some(summary => summary.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified')
  ).length;

  const cohorts = Object.fromEntries(
    [...new Set(rows.map(row => row.cohort))].map(cohort => {
      const cohortRows = rows.filter(row => row.cohort === cohort);
      return [cohort, {
        fileCount: cohortRows.length,
        outcomeStatusDistribution: distribution(
          cohortRows.flatMap(row => row.remediationOutcomeSummary ? [row.remediationOutcomeSummary.documentStatus] : []),
        ),
        semanticLaneUsage: frequencyRows(
          cohortRows.flatMap(row => semanticSummaries(row).map(summary => summary.lane)),
        ),
        semanticSkipReasons: frequencyRows(
          cohortRows.flatMap(row => semanticSummaries(row).map(summary => `${summary.lane}:${summary.skippedReason}`)),
        ),
      }];
    }),
  ) as Record<ExperimentCorpusCohort, Stage6CohortAudit>;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage5RunDir: input.stage5RunDir,
    stage6RunDir: input.stage6RunDir,
    comparisonDir: input.comparisonDir,
    runtime: {
      wallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      wallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      totalMedianDeltaMs: input.comparison.remediate?.totalMedianDeltaMs ?? null,
      totalP95DeltaMs: input.comparison.remediate?.totalP95DeltaMs ?? null,
    },
    summary: {
      stage6FileCount: rows.length,
      deterministicConfidenceRegressionRollbackCount: rows.reduce(
        (sum, row) => sum + (row.structuralConfidenceGuard?.rollbackCount ?? 0),
        0,
      ),
      semanticConfidenceRegressionRevertCount,
      acceptedConfidenceRegressionCount: 0,
      outcomeStatusDistribution: distribution(
        rows.flatMap(row => row.remediationOutcomeSummary ? [row.remediationOutcomeSummary.documentStatus] : []),
      ),
      semanticLaneUsage: frequencyRows(
        rows.flatMap(row => semanticSummaries(row).map(summary => summary.lane)),
      ),
      semanticSkipReasons: frequencyRows(
        rows.flatMap(row => semanticSummaries(row).map(summary => `${summary.lane}:${summary.skippedReason}`)),
      ),
      semanticChangeStatus: frequencyRows(
        rows.flatMap(row => semanticSummaries(row).map(summary => `${summary.lane}:${summary.changeStatus}`)),
      ),
      semanticOnlyTrustedPassCount,
      scoreMeanDelta: input.comparison.remediate?.afterMeanDelta ?? null,
      reanalyzedMeanDelta: input.comparison.remediate?.reanalyzedMeanDelta ?? null,
    },
    cohorts,
    topSlowestSemanticFiles: semanticRows
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

function markdownDistribution(dist: Record<string, number>): string {
  const entries = Object.entries(dist);
  return entries.length ? entries.map(([key, count]) => `${key}:${count}`).join(', ') : 'n/a';
}

function markdownFrequency(rows: Array<FrequencyRow>): string {
  return rows.length ? rows.map(row => `${row.key} (${row.count})`).join('; ') : 'n/a';
}

export function renderStage6AcceptanceMarkdown(audit: Stage6AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 6 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Stage 5 baseline run: \`${audit.stage5RunDir}\``);
  lines.push(`- Stage 6 run: \`${audit.stage6RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Stage 6 files: ${audit.summary.stage6FileCount}`);
  lines.push(`- Outcome status distribution: ${markdownDistribution(audit.summary.outcomeStatusDistribution)}`);
  lines.push(`- Semantic lane usage: ${markdownFrequency(audit.summary.semanticLaneUsage)}`);
  lines.push(`- Semantic skip reasons: ${markdownFrequency(audit.summary.semanticSkipReasons)}`);
  lines.push(`- Semantic change status: ${markdownFrequency(audit.summary.semanticChangeStatus)}`);
  lines.push(`- Semantic-only trusted passes: ${audit.summary.semanticOnlyTrustedPassCount}`);
  lines.push(`- Deterministic structural-confidence rollback count: ${audit.summary.deterministicConfidenceRegressionRollbackCount}`);
  lines.push(`- Semantic structural-confidence reverts: ${audit.summary.semanticConfidenceRegressionRevertCount}`);
  lines.push(`- Accepted confidence regressions: ${audit.summary.acceptedConfidenceRegressionCount}`);
  lines.push(`- Wall median delta vs Stage 5: ${audit.runtime.wallMedianDeltaMs ?? 'n/a'} ms`);
  lines.push(`- Wall p95 delta vs Stage 5: ${audit.runtime.wallP95DeltaMs ?? 'n/a'} ms`);
  lines.push('');
  lines.push('## Cohort Semantic Distribution');
  lines.push('');
  for (const [cohort, summary] of Object.entries(audit.cohorts)) {
    lines.push(`- **${cohort}:** outcomes ${markdownDistribution(summary.outcomeStatusDistribution)}; lanes ${markdownFrequency(summary.semanticLaneUsage)}`);
  }
  lines.push('');
  lines.push('## Slowest Semantic Files');
  lines.push('');
  for (const row of audit.topSlowestSemanticFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.metricMs.toFixed(0)} ms`);
  }
  return lines.join('\n');
}

export async function writeStage6AcceptanceArtifacts(
  outDir: string,
  audit: Stage6AcceptanceAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage6-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage6-acceptance.md'), renderStage6AcceptanceMarkdown(audit), 'utf8');
}

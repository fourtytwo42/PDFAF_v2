import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkRunSummary, FrequencyRow, SummaryStats } from './experimentCorpus.js';

export interface BenchmarkComparison {
  beforeRunId: string;
  afterRunId: string;
  generatedAt: string;
  analyze: {
    scoreMeanDelta: number;
    scoreMedianDelta: number;
    scoreP95Delta: number;
    runtimeMedianDeltaMs: number;
    runtimeP95DeltaMs: number;
    manualReviewRequiredDelta: number;
    scoreCapFrequencyDelta: Array<FrequencyDeltaRow>;
  };
  remediate: {
    beforeMeanDelta: number;
    afterMeanDelta: number;
    reanalyzedMeanDelta: number;
    deltaMeanDelta: number;
    wallMedianDeltaMs: number;
    wallP95DeltaMs: number;
    totalMedianDeltaMs: number;
    totalP95DeltaMs: number;
    beforeManualReviewRequiredDelta: number;
    afterManualReviewRequiredDelta: number;
    reanalyzedManualReviewRequiredDelta: number;
    scoreCapFrequencyDelta: Array<FrequencyDeltaRow>;
  } | null;
  cohorts: Record<string, CohortComparison>;
}

export interface CohortComparison {
  analyzeMeanDelta: number;
  analyzeRuntimeMedianDeltaMs: number;
  manualReviewRequiredDelta: number;
  scoreCapFrequencyDelta: Array<FrequencyDeltaRow>;
  remediationDeltaMeanDelta: number;
  remediationRuntimeMedianDeltaMs: number;
}

export interface FrequencyDeltaRow {
  key: string;
  before: number;
  after: number;
  delta: number;
}

function frequencyMap(rows: Array<FrequencyRow> | undefined): Map<string, number> {
  return new Map((rows ?? []).map(row => [row.key, row.count]));
}

function compareFrequencyRows(
  before: Array<FrequencyRow> | undefined,
  after: Array<FrequencyRow> | undefined,
): Array<FrequencyDeltaRow> {
  const beforeMap = frequencyMap(before);
  const afterMap = frequencyMap(after);
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort((a, b) => a.localeCompare(b));
  return keys.map(key => ({
    key,
    before: beforeMap.get(key) ?? 0,
    after: afterMap.get(key) ?? 0,
    delta: (afterMap.get(key) ?? 0) - (beforeMap.get(key) ?? 0),
  }));
}

function statDelta(before: SummaryStats, after: SummaryStats, field: keyof SummaryStats): number {
  return (after[field] as number) - (before[field] as number);
}

export function compareBenchmarkSummaries(before: BenchmarkRunSummary, after: BenchmarkRunSummary): BenchmarkComparison {
  return {
    beforeRunId: before.runId,
    afterRunId: after.runId,
    generatedAt: new Date().toISOString(),
    analyze: {
      scoreMeanDelta: statDelta(before.analyze.score, after.analyze.score, 'mean'),
      scoreMedianDelta: statDelta(before.analyze.score, after.analyze.score, 'median'),
      scoreP95Delta: statDelta(before.analyze.score, after.analyze.score, 'p95'),
      runtimeMedianDeltaMs: statDelta(before.analyze.wallAnalyzeMs, after.analyze.wallAnalyzeMs, 'median'),
      runtimeP95DeltaMs: statDelta(before.analyze.wallAnalyzeMs, after.analyze.wallAnalyzeMs, 'p95'),
      manualReviewRequiredDelta:
        (after.analyze.manualReviewRequiredCount ?? 0) - (before.analyze.manualReviewRequiredCount ?? 0),
      scoreCapFrequencyDelta: compareFrequencyRows(
        before.analyze.scoreCapsByCategory,
        after.analyze.scoreCapsByCategory,
      ),
    },
    remediate: before.remediate && after.remediate
      ? {
          beforeMeanDelta: statDelta(before.remediate.beforeScore, after.remediate.beforeScore, 'mean'),
          afterMeanDelta: statDelta(before.remediate.afterScore, after.remediate.afterScore, 'mean'),
          reanalyzedMeanDelta: statDelta(before.remediate.reanalyzedScore, after.remediate.reanalyzedScore, 'mean'),
          deltaMeanDelta: statDelta(before.remediate.delta, after.remediate.delta, 'mean'),
          wallMedianDeltaMs: statDelta(before.remediate.wallRemediateMs, after.remediate.wallRemediateMs, 'median'),
          wallP95DeltaMs: statDelta(before.remediate.wallRemediateMs, after.remediate.wallRemediateMs, 'p95'),
          totalMedianDeltaMs: statDelta(before.remediate.totalPipelineMs, after.remediate.totalPipelineMs, 'median'),
          totalP95DeltaMs: statDelta(before.remediate.totalPipelineMs, after.remediate.totalPipelineMs, 'p95'),
          beforeManualReviewRequiredDelta:
            (after.remediate.beforeManualReviewRequiredCount ?? 0) - (before.remediate.beforeManualReviewRequiredCount ?? 0),
          afterManualReviewRequiredDelta:
            (after.remediate.afterManualReviewRequiredCount ?? 0) - (before.remediate.afterManualReviewRequiredCount ?? 0),
          reanalyzedManualReviewRequiredDelta:
            (after.remediate.reanalyzedManualReviewRequiredCount ?? 0) - (before.remediate.reanalyzedManualReviewRequiredCount ?? 0),
          scoreCapFrequencyDelta: compareFrequencyRows(
            before.remediate.afterScoreCapsByCategory,
            after.remediate.afterScoreCapsByCategory,
          ),
        }
      : null,
    cohorts: Object.fromEntries(
      [...new Set([...Object.keys(before.cohorts), ...Object.keys(after.cohorts)])]
        .sort((a, b) => a.localeCompare(b))
        .map(cohort => {
          const beforeCohort = before.cohorts[cohort];
          const afterCohort = after.cohorts[cohort];
          return [cohort, {
            analyzeMeanDelta: (afterCohort?.analyzeScore.mean ?? 0) - (beforeCohort?.analyzeScore.mean ?? 0),
            analyzeRuntimeMedianDeltaMs: (afterCohort?.wallAnalyzeMs.median ?? 0) - (beforeCohort?.wallAnalyzeMs.median ?? 0),
            manualReviewRequiredDelta:
              (afterCohort?.manualReviewRequiredCount ?? 0) - (beforeCohort?.manualReviewRequiredCount ?? 0),
            scoreCapFrequencyDelta: compareFrequencyRows(
              beforeCohort?.scoreCapsByCategory ?? [],
              afterCohort?.scoreCapsByCategory ?? [],
            ),
            remediationDeltaMeanDelta:
              (afterCohort?.remediationDelta.mean ?? 0) - (beforeCohort?.remediationDelta.mean ?? 0),
            remediationRuntimeMedianDeltaMs:
              (afterCohort?.wallRemediateMs.median ?? 0) - (beforeCohort?.wallRemediateMs.median ?? 0),
          }];
        }),
    ),
  };
}

export function renderBenchmarkComparisonMarkdown(comparison: BenchmarkComparison): string {
  const lines: string[] = [];
  lines.push('# Experiment corpus benchmark comparison');
  lines.push('');
  lines.push(`- **Before run:** \`${comparison.beforeRunId}\``);
  lines.push(`- **After run:** \`${comparison.afterRunId}\``);
  lines.push(`- **Generated:** ${comparison.generatedAt}`);
  lines.push('');
  lines.push('## Overall');
  lines.push('');
  lines.push(`- **Analyze score mean delta:** ${comparison.analyze.scoreMeanDelta.toFixed(2)}`);
  lines.push(`- **Analyze score median delta:** ${comparison.analyze.scoreMedianDelta.toFixed(2)}`);
  lines.push(`- **Analyze score p95 delta:** ${comparison.analyze.scoreP95Delta.toFixed(2)}`);
  lines.push(`- **Analyze runtime median delta:** ${comparison.analyze.runtimeMedianDeltaMs.toFixed(2)} ms`);
  lines.push(`- **Analyze runtime p95 delta:** ${comparison.analyze.runtimeP95DeltaMs.toFixed(2)} ms`);
  lines.push(`- **Analyze manual-review delta:** ${comparison.analyze.manualReviewRequiredDelta}`);
  lines.push(`- **Analyze score-cap delta:** ${comparison.analyze.scoreCapFrequencyDelta.length ? comparison.analyze.scoreCapFrequencyDelta.map(row => `${row.key}:${row.delta >= 0 ? '+' : ''}${row.delta}`).join(', ') : 'none'}`);
  if (comparison.remediate) {
    lines.push(`- **Remediation after-score mean delta:** ${comparison.remediate.afterMeanDelta.toFixed(2)}`);
    lines.push(`- **Remediation reanalyzed mean delta:** ${comparison.remediate.reanalyzedMeanDelta.toFixed(2)}`);
    lines.push(`- **Remediation runtime median delta:** ${comparison.remediate.wallMedianDeltaMs.toFixed(2)} ms`);
    lines.push(`- **Remediation runtime p95 delta:** ${comparison.remediate.wallP95DeltaMs.toFixed(2)} ms`);
    lines.push(`- **Remediation manual-review delta (before/after/reanalyzed): ${comparison.remediate.beforeManualReviewRequiredDelta} / ${comparison.remediate.afterManualReviewRequiredDelta} / ${comparison.remediate.reanalyzedManualReviewRequiredDelta}`);
    lines.push(`- **Remediation score-cap delta:** ${comparison.remediate.scoreCapFrequencyDelta.length ? comparison.remediate.scoreCapFrequencyDelta.map(row => `${row.key}:${row.delta >= 0 ? '+' : ''}${row.delta}`).join(', ') : 'none'}`);
  }
  lines.push('');
  lines.push('## Per Cohort');
  lines.push('');
  lines.push('| Cohort | Analyze mean Δ | Analyze runtime median Δ ms | Manual-review Δ | Remediation delta mean Δ | Remediation runtime median Δ ms |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [cohort, row] of Object.entries(comparison.cohorts)) {
    lines.push(`| ${cohort} | ${row.analyzeMeanDelta.toFixed(2)} | ${row.analyzeRuntimeMedianDeltaMs.toFixed(2)} | ${row.manualReviewRequiredDelta} | ${row.remediationDeltaMeanDelta.toFixed(2)} | ${row.remediationRuntimeMedianDeltaMs.toFixed(2)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function loadBenchmarkSummaryFromRunDir(runDir: string): Promise<BenchmarkRunSummary> {
  const summaryPath = join(resolve(runDir), 'summary.json');
  return JSON.parse(await readFile(summaryPath, 'utf8')) as BenchmarkRunSummary;
}

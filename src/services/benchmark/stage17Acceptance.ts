import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ExperimentCorpusCohort,
  FileMetricRow,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';

const RUNTIME_MEDIAN_BUDGET_MS = 500;
const TARGET_IMPROVEMENT_DELTA = 2;
const TARGET_IMPROVED_COUNT = 3;
const TARGET_SCORE_CEILING = 95;

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function finalScore(row: RemediateBenchmarkRow): number | null {
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function finalGrade(row: RemediateBenchmarkRow): string | null {
  return row.reanalyzedGrade ?? row.afterGrade ?? null;
}

export interface Stage17GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage17TargetFileRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage16Score: number | null;
  stage17Score: number | null;
  stage16Grade: string | null;
  stage17Grade: string | null;
  scoreDelta: number | null;
}

export interface Stage17RegressionRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage16Grade: string | null;
  stage17Grade: string | null;
  stage16Score: number | null;
  stage17Score: number | null;
}

export interface Stage17AcceptanceAudit {
  generatedAt: string;
  baselineRunDir: string;
  stage17RunDir: string;
  comparisonDir: string;
  stage17Passed: boolean;
  summary: {
    targetFileCount: number;
    improvedTargetCount: number;
    regressionCount: number;
    totalNonACountBefore: number;
    totalNonACountAfter: number;
    remediateWallMedianDeltaMs: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  gates: Stage17GateResult[];
  targetFiles: Stage17TargetFileRow[];
  regressions: Stage17RegressionRow[];
  topSlowestFiles: FileMetricRow[];
  comparison: BenchmarkComparison;
}

export function buildStage17AcceptanceAudit(input: {
  baselineRunDir: string;
  stage17RunDir: string;
  comparisonDir: string;
  stage16RemediateResults: RemediateBenchmarkRow[];
  stage17RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage17AcceptanceAudit {
  const baselineRows = input.stage16RemediateResults.filter(row => !row.error);
  const baselineById = new Map(baselineRows.map(row => [row.id, row]));
  const stage17Rows = input.stage17RemediateResults.filter(row => !row.error);
  const stage17ById = new Map(stage17Rows.map(row => [row.id, row]));

  const targetIds = baselineRows
    .filter(row => (finalScore(row) ?? Infinity) <= TARGET_SCORE_CEILING)
    .map(row => row.id);

  const targetRows = targetIds
    .map(id => ({
      baseline: baselineById.get(id),
      stage17: stage17ById.get(id),
    }))
    .filter((row): row is { baseline: RemediateBenchmarkRow; stage17: RemediateBenchmarkRow } =>
      Boolean(row.baseline && row.stage17),
    );

  const targetFiles: Stage17TargetFileRow[] = targetRows.map(({ baseline, stage17 }) => ({
    id: baseline.id,
    file: baseline.file,
    cohort: baseline.cohort,
    stage16Score: finalScore(baseline),
    stage17Score: finalScore(stage17),
    stage16Grade: finalGrade(baseline),
    stage17Grade: finalGrade(stage17),
    scoreDelta: finalScore(baseline) != null && finalScore(stage17) != null
      ? (finalScore(stage17) ?? 0) - (finalScore(baseline) ?? 0)
      : null,
  })).sort((a, b) => (b.scoreDelta ?? 0) - (a.scoreDelta ?? 0));

  const improvedTargetCount = targetFiles.filter(file => (file.scoreDelta ?? 0) >= TARGET_IMPROVEMENT_DELTA).length;
  const regressions: Stage17RegressionRow[] = baselineRows
    .filter(row => finalGrade(row) === 'A')
    .map(row => {
      const stage17 = stage17ById.get(row.id);
      if (!stage17 || finalGrade(stage17) === 'A') {
        return null;
      }
      return {
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        stage16Grade: finalGrade(row),
        stage17Grade: finalGrade(stage17),
        stage16Score: finalScore(row),
        stage17Score: finalScore(stage17),
      };
    })
    .filter((row): row is Stage17RegressionRow => row !== null)
    .sort((a, b) => a.file.localeCompare(b.file));

  const totalNonACountBefore = baselineRows.filter(row => finalGrade(row) !== 'A').length;
  const totalNonACountAfter = stage17Rows.filter(row => finalGrade(row) !== 'A').length;

  const gates: Stage17GateResult[] = [
    {
      key: 'target_low_a_improved',
      passed: improvedTargetCount >= TARGET_IMPROVED_COUNT,
      detail: `improvedTargetCount=${improvedTargetCount} threshold=${TARGET_IMPROVED_COUNT} delta>=${TARGET_IMPROVEMENT_DELTA}`,
    },
    {
      key: 'no_regressions',
      passed: regressions.length === 0,
      detail: `regressionCount=${regressions.length}`,
    },
    {
      key: 'runtime_not_regressed',
      passed: (input.comparison.remediate?.wallMedianDeltaMs ?? 0) <= RUNTIME_MEDIAN_BUDGET_MS,
      detail: `wallMedianDeltaMs=${input.comparison.remediate?.wallMedianDeltaMs?.toFixed(2) ?? 'n/a'} threshold<=${RUNTIME_MEDIAN_BUDGET_MS}`,
    },
  ];

  const topSlowestFiles: FileMetricRow[] = stage17Rows
    .map(row => ({ id: row.id, file: row.file, cohort: row.cohort, metricMs: row.totalPipelineMs ?? 0 }))
    .sort((a, b) => b.metricMs - a.metricMs)
    .slice(0, 10);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    stage17RunDir: input.stage17RunDir,
    comparisonDir: input.comparisonDir,
    stage17Passed: gates.every(g => g.passed),
    summary: {
      targetFileCount: targetFiles.length,
      improvedTargetCount,
      regressionCount: regressions.length,
      totalNonACountBefore,
      totalNonACountAfter,
      remediateWallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      dispositionFrequency: frequencyRows(targetFiles.map(file =>
        (file.scoreDelta ?? 0) >= TARGET_IMPROVEMENT_DELTA ? 'improved' : 'flat_or_small_gain',
      )),
    },
    gates,
    targetFiles,
    regressions,
    topSlowestFiles,
    comparison: input.comparison,
  };
}

export function renderStage17AcceptanceMarkdown(audit: Stage17AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 17 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Baseline (Stage 16) run: \`${audit.baselineRunDir}\``);
  lines.push(`- Stage 17 run: \`${audit.stage17RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Acceptance: ${audit.stage17Passed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Target low-A files (Stage 16 score <= ${TARGET_SCORE_CEILING}): ${audit.summary.targetFileCount}`);
  lines.push(`- Improved by >= ${TARGET_IMPROVEMENT_DELTA}: ${audit.summary.improvedTargetCount}`);
  lines.push(`- Non-A before/after: ${audit.summary.totalNonACountBefore} -> ${audit.summary.totalNonACountAfter}`);
  lines.push(`- Regression count: ${audit.summary.regressionCount}`);
  lines.push(`- Remediate wall median delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} ms (budget: ${RUNTIME_MEDIAN_BUDGET_MS} ms)`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} - ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Target Files');
  lines.push('');
  lines.push('| File | Score | Grade | Delta |');
  lines.push('| --- | --- | --- | ---: |');
  for (const file of audit.targetFiles) {
    lines.push(`| ${file.file} | ${file.stage16Score ?? 'n/a'} -> ${file.stage17Score ?? 'n/a'} | ${file.stage16Grade ?? 'n/a'} -> ${file.stage17Grade ?? 'n/a'} | ${file.scoreDelta ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Regressions');
  lines.push('');
  if (audit.regressions.length === 0) {
    lines.push('None.');
  } else {
    for (const row of audit.regressions) {
      lines.push(`- \`${row.file}\` - ${row.stage16Score ?? 'n/a'} -> ${row.stage17Score ?? 'n/a'} (${row.stage16Grade ?? 'n/a'} -> ${row.stage17Grade ?? 'n/a'})`);
    }
  }
  return lines.join('\n');
}

export async function writeStage17AcceptanceArtifacts(outDir: string, audit: Stage17AcceptanceAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage17-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage17-acceptance.md'), renderStage17AcceptanceMarkdown(audit), 'utf8');
}

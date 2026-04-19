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

function lowCategoryScore(row: RemediateBenchmarkRow, key: string): number | null {
  const category = (row.reanalyzedCategories ?? row.afterCategories ?? []).find(item => item.key === key);
  return category?.score ?? null;
}

export interface Stage16GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage16TargetFileRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage15Score: number | null;
  stage16Score: number | null;
  stage15Grade: string | null;
  stage16Grade: string | null;
  scoreDelta: number | null;
  headingStructureBefore: number | null;
  headingStructureAfter: number | null;
  textExtractabilityBefore: number | null;
  textExtractabilityAfter: number | null;
}

export interface Stage16RegressionRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage15Grade: string | null;
  stage16Grade: string | null;
  stage15Score: number | null;
  stage16Score: number | null;
}

export interface Stage16AcceptanceAudit {
  generatedAt: string;
  baselineRunDir: string;
  stage16RunDir: string;
  comparisonDir: string;
  stage16Passed: boolean;
  summary: {
    targetFileCount: number;
    targetReachedACount: number;
    targetStillNonACount: number;
    regressionCount: number;
    totalNonACountBefore: number;
    totalNonACountAfter: number;
    remediateWallMedianDeltaMs: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  gates: Stage16GateResult[];
  targetFiles: Stage16TargetFileRow[];
  regressions: Stage16RegressionRow[];
  topSlowestFiles: FileMetricRow[];
  comparison: BenchmarkComparison;
}

export function buildStage16AcceptanceAudit(input: {
  baselineRunDir: string;
  stage16RunDir: string;
  comparisonDir: string;
  stage15RemediateResults: RemediateBenchmarkRow[];
  stage16RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage16AcceptanceAudit {
  const baselineRows = input.stage15RemediateResults.filter(row => !row.error);
  const baselineById = new Map(baselineRows.map(row => [row.id, row]));
  const stage16Rows = input.stage16RemediateResults.filter(row => !row.error);
  const stage16ById = new Map(stage16Rows.map(row => [row.id, row]));

  const targetIds = baselineRows
    .filter(row => finalGrade(row) !== 'A')
    .map(row => row.id);

  const targetRows = targetIds
    .map(id => ({
      baseline: baselineById.get(id),
      stage16: stage16ById.get(id),
    }))
    .filter((row): row is { baseline: RemediateBenchmarkRow; stage16: RemediateBenchmarkRow } =>
      Boolean(row.baseline && row.stage16),
    );

  const targetFiles: Stage16TargetFileRow[] = targetRows.map(({ baseline, stage16 }) => ({
    id: baseline.id,
    file: baseline.file,
    cohort: baseline.cohort,
    stage15Score: finalScore(baseline),
    stage16Score: finalScore(stage16),
    stage15Grade: finalGrade(baseline),
    stage16Grade: finalGrade(stage16),
    scoreDelta: finalScore(baseline) != null && finalScore(stage16) != null
      ? (finalScore(stage16) ?? 0) - (finalScore(baseline) ?? 0)
      : null,
    headingStructureBefore: lowCategoryScore(baseline, 'heading_structure'),
    headingStructureAfter: lowCategoryScore(stage16, 'heading_structure'),
    textExtractabilityBefore: lowCategoryScore(baseline, 'text_extractability'),
    textExtractabilityAfter: lowCategoryScore(stage16, 'text_extractability'),
  })).sort((a, b) => (b.scoreDelta ?? 0) - (a.scoreDelta ?? 0));

  const regressions: Stage16RegressionRow[] = baselineRows
    .filter(row => finalGrade(row) === 'A')
    .map(row => {
      const stage16 = stage16ById.get(row.id);
      if (!stage16 || finalGrade(stage16) === 'A') {
        return null;
      }
      return {
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        stage15Grade: finalGrade(row),
        stage16Grade: finalGrade(stage16),
        stage15Score: finalScore(row),
        stage16Score: finalScore(stage16),
      };
    })
    .filter((row): row is Stage16RegressionRow => row !== null)
    .sort((a, b) => a.file.localeCompare(b.file));

  const targetReachedACount = targetFiles.filter(file => file.stage16Grade === 'A').length;
  const totalNonACountBefore = targetFiles.length;
  const totalNonACountAfter = stage16Rows.filter(row => finalGrade(row) !== 'A').length;

  const gates: Stage16GateResult[] = [
    {
      key: 'target_non_a_reach_a',
      passed: targetReachedACount === targetFiles.length,
      detail: `targetReachedACount=${targetReachedACount} targetFileCount=${targetFiles.length}`,
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

  const topSlowestFiles: FileMetricRow[] = stage16Rows
    .map(row => ({ id: row.id, file: row.file, cohort: row.cohort, metricMs: row.totalPipelineMs ?? 0 }))
    .sort((a, b) => b.metricMs - a.metricMs)
    .slice(0, 10);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    stage16RunDir: input.stage16RunDir,
    comparisonDir: input.comparisonDir,
    stage16Passed: gates.every(g => g.passed),
    summary: {
      targetFileCount: targetFiles.length,
      targetReachedACount,
      targetStillNonACount: targetFiles.length - targetReachedACount,
      regressionCount: regressions.length,
      totalNonACountBefore,
      totalNonACountAfter,
      remediateWallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      dispositionFrequency: frequencyRows(targetFiles.map(file => file.stage16Grade === 'A' ? 'reached_A' : 'still_non_A')),
    },
    gates,
    targetFiles,
    regressions,
    topSlowestFiles,
    comparison: input.comparison,
  };
}

export function renderStage16AcceptanceMarkdown(audit: Stage16AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 16 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Baseline (Stage 15) run: \`${audit.baselineRunDir}\``);
  lines.push(`- Stage 16 run: \`${audit.stage16RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Acceptance: ${audit.stage16Passed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Target non-A files (Stage 15 residual): ${audit.summary.targetFileCount}`);
  lines.push(`- Reached A from target set: ${audit.summary.targetReachedACount}`);
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
  lines.push('| File | Score | Grade | Heading Structure | Text Extractability |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const file of audit.targetFiles) {
    lines.push(`| ${file.file} | ${file.stage15Score ?? 'n/a'} -> ${file.stage16Score ?? 'n/a'} | ${file.stage15Grade ?? 'n/a'} -> ${file.stage16Grade ?? 'n/a'} | ${file.headingStructureBefore ?? 'n/a'} -> ${file.headingStructureAfter ?? 'n/a'} | ${file.textExtractabilityBefore ?? 'n/a'} -> ${file.textExtractabilityAfter ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Regressions');
  lines.push('');
  if (audit.regressions.length === 0) {
    lines.push('None.');
  } else {
    for (const row of audit.regressions) {
      lines.push(`- \`${row.file}\` - ${row.stage15Score ?? 'n/a'} -> ${row.stage16Score ?? 'n/a'} (${row.stage15Grade ?? 'n/a'} -> ${row.stage16Grade ?? 'n/a'})`);
    }
  }
  return lines.join('\n');
}

export async function writeStage16AcceptanceArtifacts(outDir: string, audit: Stage16AcceptanceAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage16-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage16-acceptance.md'), renderStage16AcceptanceMarkdown(audit), 'utf8');
}

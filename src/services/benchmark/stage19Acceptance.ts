import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ExperimentCorpusCohort,
  FileMetricRow,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';

const CORE_RUNTIME_MEDIAN_BUDGET_MS = 500;
const STRESS_MIN_SCORE_EXCLUSIVE = 95;
const STRESS_RUNTIME_DELTA_LIMIT_RATIO = 0.15;

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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export interface Stage19GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage19StressRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  beforeScore: number | null;
  afterScore: number | null;
  beforeGrade: string | null;
  afterGrade: string | null;
  scoreDelta: number | null;
}

export interface Stage19RegressionRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  baselineGrade: string | null;
  stage19Grade: string | null;
  baselineScore: number | null;
  stage19Score: number | null;
}

export interface Stage19AcceptanceAudit {
  generatedAt: string;
  coreBaselineRunDir: string;
  coreStage19RunDir: string;
  coreComparisonDir: string;
  stressBaselineRoots: string[];
  stressStage19Roots: string[];
  stage19Passed: boolean;
  summary: {
    stressFileCount: number;
    stressAbove95Count: number;
    stressRuntimeMedianBeforeMs: number | null;
    stressRuntimeMedianAfterMs: number | null;
    stressRuntimeDeltaRatio: number | null;
    regressionCount: number;
    coreRemediateWallMedianDeltaMs: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  gates: Stage19GateResult[];
  stressFiles: Stage19StressRow[];
  regressions: Stage19RegressionRow[];
  topSlowestStressFiles: FileMetricRow[];
  comparison: BenchmarkComparison;
}

export function buildStage19AcceptanceAudit(input: {
  coreBaselineRunDir: string;
  coreStage19RunDir: string;
  coreComparisonDir: string;
  stressBaselineRoots: string[];
  stressStage19Roots: string[];
  coreBaselineRows: RemediateBenchmarkRow[];
  coreStage19Rows: RemediateBenchmarkRow[];
  stressBaselineRows: RemediateBenchmarkRow[];
  stressStage19Rows: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage19AcceptanceAudit {
  const coreBaseline = input.coreBaselineRows.filter(row => !row.error);
  const coreStage19 = input.coreStage19Rows.filter(row => !row.error);
  const stressBaseline = input.stressBaselineRows.filter(row => !row.error);
  const stressStage19 = input.stressStage19Rows.filter(row => !row.error);

  const coreStage19ById = new Map(coreStage19.map(row => [row.id, row]));
  const stressBaselineById = new Map(stressBaseline.map(row => [row.id, row]));

  const stressFiles: Stage19StressRow[] = stressStage19.map(row => {
    const baseline = stressBaselineById.get(row.id);
    const afterScore = finalScore(row);
    const beforeScore = baseline ? finalScore(baseline) : null;
    return {
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      beforeScore,
      afterScore,
      beforeGrade: baseline ? finalGrade(baseline) : null,
      afterGrade: finalGrade(row),
      scoreDelta: beforeScore != null && afterScore != null ? afterScore - beforeScore : null,
    };
  }).sort((a, b) => (a.afterScore ?? 0) - (b.afterScore ?? 0) || a.file.localeCompare(b.file));

  const regressions: Stage19RegressionRow[] = coreBaseline
    .filter(row => finalGrade(row) === 'A')
    .map(row => {
      const after = coreStage19ById.get(row.id);
      if (!after || finalGrade(after) === 'A') return null;
      return {
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        baselineGrade: finalGrade(row),
        stage19Grade: finalGrade(after),
        baselineScore: finalScore(row),
        stage19Score: finalScore(after),
      };
    })
    .filter((row): row is Stage19RegressionRow => row !== null)
    .sort((a, b) => a.file.localeCompare(b.file));

  const stressAfterScores = stressStage19.map(finalScore).filter((score): score is number => score != null);
  const stressAbove95Count = stressAfterScores.filter(score => score > STRESS_MIN_SCORE_EXCLUSIVE).length;
  const stressRuntimeMedianBeforeMs = median(stressBaseline.map(row => row.wallRemediateMs ?? 0));
  const stressRuntimeMedianAfterMs = median(stressStage19.map(row => row.wallRemediateMs ?? 0));
  const stressRuntimeDeltaRatio =
    stressRuntimeMedianBeforeMs && stressRuntimeMedianBeforeMs > 0 && stressRuntimeMedianAfterMs != null
      ? (stressRuntimeMedianAfterMs - stressRuntimeMedianBeforeMs) / stressRuntimeMedianBeforeMs
      : null;

  const gates: Stage19GateResult[] = [
    {
      key: 'all_above_95',
      passed: stressAbove95Count === stressStage19.length,
      detail: `stressAbove95=${stressAbove95Count}/${stressStage19.length}`,
    },
    {
      key: 'no_core_regressions',
      passed: regressions.length === 0,
      detail: `regressionCount=${regressions.length}`,
    },
    {
      key: 'baseline_runtime_not_regressed',
      passed: (input.comparison.remediate?.wallMedianDeltaMs ?? 0) <= CORE_RUNTIME_MEDIAN_BUDGET_MS,
      detail: `coreWallMedianDeltaMs=${input.comparison.remediate?.wallMedianDeltaMs?.toFixed(2) ?? 'n/a'} threshold<=${CORE_RUNTIME_MEDIAN_BUDGET_MS}`,
    },
    {
      key: 'stress_runtime_bounded',
      passed: (stressRuntimeDeltaRatio ?? 0) <= STRESS_RUNTIME_DELTA_LIMIT_RATIO,
      detail: `stressRuntimeDeltaRatio=${stressRuntimeDeltaRatio != null ? (stressRuntimeDeltaRatio * 100).toFixed(2) : 'n/a'}% threshold<=${(STRESS_RUNTIME_DELTA_LIMIT_RATIO * 100).toFixed(0)}%`,
    },
  ];

  const topSlowestStressFiles: FileMetricRow[] = stressStage19
    .map(row => ({ id: row.id, file: row.file, cohort: row.cohort, metricMs: row.totalPipelineMs ?? 0 }))
    .sort((a, b) => b.metricMs - a.metricMs)
    .slice(0, 10);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    coreBaselineRunDir: input.coreBaselineRunDir,
    coreStage19RunDir: input.coreStage19RunDir,
    coreComparisonDir: input.coreComparisonDir,
    stressBaselineRoots: input.stressBaselineRoots,
    stressStage19Roots: input.stressStage19Roots,
    stage19Passed: gates.every(gate => gate.passed),
    summary: {
      stressFileCount: stressStage19.length,
      stressAbove95Count,
      stressRuntimeMedianBeforeMs,
      stressRuntimeMedianAfterMs,
      stressRuntimeDeltaRatio,
      regressionCount: regressions.length,
      coreRemediateWallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      dispositionFrequency: frequencyRows(stressFiles.map(file => {
        if ((file.afterScore ?? 0) <= STRESS_MIN_SCORE_EXCLUSIVE) return 'still_at_or_below_95';
        if ((file.scoreDelta ?? 0) > 0) return 'improved_above_95';
        return 'held_above_95';
      })),
    },
    gates,
    stressFiles,
    regressions,
    topSlowestStressFiles,
    comparison: input.comparison,
  };
}

export function renderStage19AcceptanceMarkdown(audit: Stage19AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 19 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Core baseline run: \`${audit.coreBaselineRunDir}\``);
  lines.push(`- Core Stage 19 run: \`${audit.coreStage19RunDir}\``);
  lines.push(`- Core comparison: \`${audit.coreComparisonDir}\``);
  lines.push(`- Stress baseline roots: ${audit.stressBaselineRoots.map(root => `\`${root}\``).join(', ')}`);
  lines.push(`- Stress Stage 19 roots: ${audit.stressStage19Roots.map(root => `\`${root}\``).join(', ')}`);
  lines.push(`- Acceptance: ${audit.stage19Passed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Stress files above 95: ${audit.summary.stressAbove95Count}/${audit.summary.stressFileCount}`);
  lines.push(`- Core regression count: ${audit.summary.regressionCount}`);
  lines.push(`- Core remediate wall median delta: ${audit.summary.coreRemediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} ms`);
  lines.push(`- Stress wall median before/after: ${audit.summary.stressRuntimeMedianBeforeMs?.toFixed(2) ?? 'n/a'} / ${audit.summary.stressRuntimeMedianAfterMs?.toFixed(2) ?? 'n/a'} ms`);
  lines.push(`- Stress runtime delta ratio: ${audit.summary.stressRuntimeDeltaRatio != null ? (audit.summary.stressRuntimeDeltaRatio * 100).toFixed(2) : 'n/a'}%`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} - ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Stress Files');
  lines.push('');
  lines.push('| File | Score | Grade | Delta |');
  lines.push('| --- | --- | --- | ---: |');
  for (const file of audit.stressFiles) {
    lines.push(`| ${file.file} | ${file.beforeScore ?? 'n/a'} -> ${file.afterScore ?? 'n/a'} | ${file.beforeGrade ?? 'n/a'} -> ${file.afterGrade ?? 'n/a'} | ${file.scoreDelta ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Regressions');
  lines.push('');
  if (audit.regressions.length === 0) {
    lines.push('None.');
  } else {
    for (const row of audit.regressions) {
      lines.push(`- \`${row.file}\` - ${row.baselineScore ?? 'n/a'} -> ${row.stage19Score ?? 'n/a'} (${row.baselineGrade ?? 'n/a'} -> ${row.stage19Grade ?? 'n/a'})`);
    }
  }
  return lines.join('\n');
}

export async function writeStage19AcceptanceArtifacts(outDir: string, audit: Stage19AcceptanceAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage19-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage19-acceptance.md'), renderStage19AcceptanceMarkdown(audit), 'utf8');
}

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ExperimentCorpusCohort,
  FileMetricRow,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';

const CORE_MEDIAN_WALL_MS_CEILING = 7200;
const EDGE_CASE_MIN_A_COUNT = 40;
const EDGE_CASE_MIN_MEAN_SCORE = 90;

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

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface Stage20GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage20EdgeCaseRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  beforeScore: number | null;
  afterScore: number | null;
  beforeGrade: string | null;
  afterGrade: string | null;
  scoreDelta: number | null;
}

export interface Stage20RegressionRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage19Grade: string | null;
  stage20Grade: string | null;
  stage19Score: number | null;
  stage20Score: number | null;
}

export interface Stage20AcceptanceAudit {
  generatedAt: string;
  coreStage19RunDir: string;
  coreStage20RunDir: string;
  coreComparisonDir: string;
  edgeCaseRunDir: string;
  stage20Passed: boolean;
  summary: {
    coreFileCount: number;
    coreAllACount: number;
    coreMeanScore: number | null;
    coreMedianWallMs: number | null;
    coreStage19MedianWallMs: number | null;
    coreWallMedianDeltaMs: number | null;
    regressionCount: number;
    edgeCaseFileCount: number;
    edgeCaseAllACount: number;
    edgeCaseMeanScore: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  gates: Stage20GateResult[];
  edgeCaseFiles: Stage20EdgeCaseRow[];
  regressions: Stage20RegressionRow[];
  topSlowestCoreFiles: FileMetricRow[];
  comparison: BenchmarkComparison;
}

export function buildStage20AcceptanceAudit(input: {
  coreStage19RunDir: string;
  coreStage20RunDir: string;
  coreComparisonDir: string;
  edgeCaseRunDir: string;
  coreStage19Rows: RemediateBenchmarkRow[];
  coreStage20Rows: RemediateBenchmarkRow[];
  edgeCaseRows: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage20AcceptanceAudit {
  const coreStage19 = input.coreStage19Rows.filter(row => !row.error);
  const coreStage20 = input.coreStage20Rows.filter(row => !row.error);
  const edgeCase = input.edgeCaseRows.filter(row => !row.error);

  const coreStage19ById = new Map(coreStage19.map(row => [row.id, row]));

  const regressions: Stage20RegressionRow[] = coreStage19
    .filter(row => finalGrade(row) === 'A')
    .map(row => {
      const after = coreStage20.find(r => r.id === row.id);
      if (!after || finalGrade(after) === 'A') return null;
      return {
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        stage19Grade: finalGrade(row),
        stage20Grade: finalGrade(after),
        stage19Score: finalScore(row),
        stage20Score: finalScore(after),
      };
    })
    .filter((row): row is Stage20RegressionRow => row !== null)
    .sort((a, b) => a.file.localeCompare(b.file));

  const edgeCaseFiles: Stage20EdgeCaseRow[] = edgeCase.map(row => {
    const afterScore = finalScore(row);
    return {
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      beforeScore: row.beforeScore ?? null,
      afterScore,
      beforeGrade: row.beforeGrade ?? null,
      afterGrade: finalGrade(row),
      scoreDelta: row.beforeScore != null && afterScore != null ? afterScore - row.beforeScore : null,
    };
  }).sort((a, b) => (a.afterScore ?? 0) - (b.afterScore ?? 0) || a.file.localeCompare(b.file));

  const coreStage20Scores = coreStage20.map(finalScore).filter((s): s is number => s != null);
  const coreAllACount = coreStage20.filter(row => finalGrade(row) === 'A').length;
  const coreMeanScore = mean(coreStage20Scores);
  const coreMedianWallMs = median(coreStage20.map(row => row.wallRemediateMs ?? 0));
  const coreStage19MedianWallMs = median(coreStage19.map(row => row.wallRemediateMs ?? 0));
  const coreWallMedianDeltaMs = input.comparison.remediate?.wallMedianDeltaMs ?? null;

  const edgeCaseScores = edgeCase.map(finalScore).filter((s): s is number => s != null);
  const edgeCaseAllACount = edgeCase.filter(row => finalGrade(row) === 'A').length;
  const edgeCaseMeanScore = mean(edgeCaseScores);

  const gates: Stage20GateResult[] = [
    {
      key: 'core_all_a',
      passed: coreAllACount === coreStage20.length && coreStage20.length > 0,
      detail: `coreAllA=${coreAllACount}/${coreStage20.length}`,
    },
    {
      key: 'no_core_regressions',
      passed: regressions.length === 0,
      detail: `regressionCount=${regressions.length}`,
    },
    {
      key: 'core_speed_recovered',
      passed: coreMedianWallMs != null && coreMedianWallMs <= CORE_MEDIAN_WALL_MS_CEILING,
      detail: `coreMedianWallMs=${coreMedianWallMs?.toFixed(0) ?? 'n/a'} threshold<=${CORE_MEDIAN_WALL_MS_CEILING}`,
    },
    {
      key: 'edge_case_all_a',
      passed: edgeCaseAllACount >= EDGE_CASE_MIN_A_COUNT,
      detail: `edgeCaseAllA=${edgeCaseAllACount}/${edgeCase.length} threshold>=${EDGE_CASE_MIN_A_COUNT}`,
    },
    {
      key: 'edge_case_mean_above_90',
      passed: edgeCaseMeanScore != null && edgeCaseMeanScore >= EDGE_CASE_MIN_MEAN_SCORE,
      detail: `edgeCaseMean=${edgeCaseMeanScore?.toFixed(2) ?? 'n/a'} threshold>=${EDGE_CASE_MIN_MEAN_SCORE}`,
    },
  ];

  const topSlowestCoreFiles: FileMetricRow[] = coreStage20
    .map(row => ({ id: row.id, file: row.file, cohort: row.cohort, metricMs: row.totalPipelineMs ?? 0 }))
    .sort((a, b) => b.metricMs - a.metricMs)
    .slice(0, 10);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    coreStage19RunDir: input.coreStage19RunDir,
    coreStage20RunDir: input.coreStage20RunDir,
    coreComparisonDir: input.coreComparisonDir,
    edgeCaseRunDir: input.edgeCaseRunDir,
    stage20Passed: gates.every(gate => gate.passed),
    summary: {
      coreFileCount: coreStage20.length,
      coreAllACount,
      coreMeanScore,
      coreMedianWallMs,
      coreStage19MedianWallMs,
      coreWallMedianDeltaMs,
      regressionCount: regressions.length,
      edgeCaseFileCount: edgeCase.length,
      edgeCaseAllACount,
      edgeCaseMeanScore,
      dispositionFrequency: frequencyRows(coreStage20.map(row => {
        const s19 = coreStage19ById.get(row.id);
        const s19Score = s19 ? finalScore(s19) : null;
        const s20Score = finalScore(row);
        if (s19Score == null || s20Score == null) return 'unknown';
        if (s20Score > s19Score) return 'improved';
        if (s20Score < s19Score) return 'regressed';
        return 'unchanged';
      })),
    },
    gates,
    edgeCaseFiles,
    regressions,
    topSlowestCoreFiles,
    comparison: input.comparison,
  };
}

export function renderStage20AcceptanceMarkdown(audit: Stage20AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 20 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Core Stage 19 run: \`${audit.coreStage19RunDir}\``);
  lines.push(`- Core Stage 20 run: \`${audit.coreStage20RunDir}\``);
  lines.push(`- Core comparison: \`${audit.coreComparisonDir}\``);
  lines.push(`- Edge-case corpus run: \`${audit.edgeCaseRunDir}\``);
  lines.push(`- Acceptance: ${audit.stage20Passed ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Core files: ${audit.summary.coreFileCount}`);
  lines.push(`- Core all-A: ${audit.summary.coreAllACount}/${audit.summary.coreFileCount}`);
  lines.push(`- Core mean score: ${audit.summary.coreMeanScore?.toFixed(2) ?? 'n/a'}`);
  lines.push(`- Core wall median (Stage 19 → Stage 20): ${audit.summary.coreStage19MedianWallMs?.toFixed(0) ?? 'n/a'} ms → ${audit.summary.coreMedianWallMs?.toFixed(0) ?? 'n/a'} ms (delta ${audit.summary.coreWallMedianDeltaMs?.toFixed(0) ?? 'n/a'} ms)`);
  lines.push(`- Core regressions: ${audit.summary.regressionCount}`);
  lines.push(`- Edge-case files: ${audit.summary.edgeCaseFileCount}`);
  lines.push(`- Edge-case all-A: ${audit.summary.edgeCaseAllACount}/${audit.summary.edgeCaseFileCount}`);
  lines.push(`- Edge-case mean score: ${audit.summary.edgeCaseMeanScore?.toFixed(2) ?? 'n/a'}`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} — ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Edge-Case Corpus Files');
  lines.push('');
  lines.push('| File | Before | After | Delta |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const file of audit.edgeCaseFiles) {
    lines.push(`| ${file.file} | ${file.beforeScore ?? 'n/a'}/${file.beforeGrade ?? '?'} | ${file.afterScore ?? 'n/a'}/${file.afterGrade ?? '?'} | ${file.scoreDelta != null ? `+${file.scoreDelta}` : 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Core Regressions');
  lines.push('');
  if (audit.regressions.length === 0) {
    lines.push('None.');
  } else {
    for (const row of audit.regressions) {
      lines.push(`- \`${row.file}\` — ${row.stage19Score ?? 'n/a'}/${row.stage19Grade ?? '?'} → ${row.stage20Score ?? 'n/a'}/${row.stage20Grade ?? '?'}`);
    }
  }
  lines.push('');
  lines.push('## Slowest Core Files');
  lines.push('');
  for (const file of audit.topSlowestCoreFiles) {
    lines.push(`- \`${file.file}\` — ${(file.metricMs / 1000).toFixed(1)}s`);
  }
  return lines.join('\n');
}

export async function writeStage20AcceptanceArtifacts(outDir: string, audit: Stage20AcceptanceAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage20-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage20-acceptance.md'), renderStage20AcceptanceMarkdown(audit), 'utf8');
}

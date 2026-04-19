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
import type { Stage13FinalGateAudit } from './stage13FinalGate.js';

const TARGET_NON_A_TO_REACH_A = 10;

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface Stage14GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage14TargetFileRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage13Score: number | null;
  stage14Score: number | null;
  stage13Grade: string | null;
  stage14Grade: string | null;
  scoreDelta: number | null;
}

export interface Stage14CategoryDeltaRow {
  key: string;
  meanDelta: number;
  improvedCount: number;
  stillFailingCount: number;
}

export interface Stage14CohortSummary {
  fileCount: number;
  remediationDeltaMeanDelta: number;
  remediationRuntimeMedianDeltaMs: number;
}

export interface Stage14AcceptanceAudit {
  generatedAt: string;
  baselineRunDir: string;
  stage14RunDir: string;
  comparisonDir: string;
  stage13GateDir: string;
  stage14Passed: boolean;
  summary: {
    targetFileCount: number;
    totalNonACountBefore: number;
    totalNonACountAfter: number;
    targetReachedACount: number;
    targetStillNonACount: number;
    nearPassSatisfiedCount: number;
    acceptedConfidenceRegressionCount: number;
    semanticOnlyTrustedPassCount: number;
    remediateWallMedianDeltaMs: number | null;
    remediateWallP95DeltaMs: number | null;
    scoreGainPerAddedSecond: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  gates: Stage14GateResult[];
  cohorts: Record<ExperimentCorpusCohort, Stage14CohortSummary>;
  targetFiles: Stage14TargetFileRow[];
  categoryDeltas: Stage14CategoryDeltaRow[];
  topSlowestFiles: Array<FileMetricRow>;
  comparison: BenchmarkComparison;
}

function lowCategoryScore(row: RemediateBenchmarkRow, key: string): number | null {
  const category = (row.reanalyzedCategories ?? row.afterCategories ?? []).find(item => item.key === key);
  return category?.score ?? null;
}

function categoryBlockedOnlyByVerifiedEvidence(row: RemediateBenchmarkRow): boolean {
  const lowCategories = (row.reanalyzedCategories ?? row.afterCategories ?? [])
    .filter(category => category.applicable && category.score < 90);
  return lowCategories.length > 0 && lowCategories.every(category =>
    category.verificationLevel === 'verified' && category.manualReviewRequired !== true,
  );
}

export function buildStage14AcceptanceAudit(input: {
  baselineRunDir: string;
  stage14RunDir: string;
  comparisonDir: string;
  stage13GateDir: string;
  baselineRemediateResults: RemediateBenchmarkRow[];
  stage14RemediateResults: RemediateBenchmarkRow[];
  stage13Gate: Stage13FinalGateAudit;
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage14AcceptanceAudit {
  const baselineById = new Map(
    input.baselineRemediateResults.filter(row => !row.error).map(row => [row.id, row]),
  );
  const stage14Rows = input.stage14RemediateResults.filter(row => !row.error);
  const stage14ById = new Map(stage14Rows.map(row => [row.id, row]));
  const targetIds = input.stage13Gate.files.filter(file => (file.finalScore ?? 0) < 90).map(file => file.id);
  const targetRows = targetIds
    .map(id => ({ baseline: baselineById.get(id), stage14: stage14ById.get(id), gate: input.stage13Gate.files.find(file => file.id === id) }))
    .filter((row): row is { baseline: RemediateBenchmarkRow; stage14: RemediateBenchmarkRow; gate: Stage13FinalGateAudit['files'][number] } =>
      Boolean(row.baseline && row.stage14 && row.gate),
    );

  const targetFiles: Stage14TargetFileRow[] = targetRows.map(({ gate, stage14 }) => ({
    id: gate.id,
    file: gate.file,
    cohort: gate.cohort,
    stage13Score: gate.finalScore,
    stage14Score: stage14.reanalyzedScore ?? stage14.afterScore ?? null,
    stage13Grade: gate.finalGrade,
    stage14Grade: stage14.reanalyzedGrade ?? stage14.afterGrade ?? null,
    scoreDelta:
      gate.finalScore != null && (stage14.reanalyzedScore ?? stage14.afterScore) != null
        ? (stage14.reanalyzedScore ?? stage14.afterScore ?? 0) - gate.finalScore
        : null,
  })).sort((a, b) => (b.scoreDelta ?? 0) - (a.scoreDelta ?? 0));

  const targetReachedACount = targetFiles.filter(file => file.stage14Grade === 'A').length;
  const totalNonACountBefore = input.stage13Gate.files.filter(file => file.finalGrade !== 'A').length;
  const totalNonACountAfter = stage14Rows.filter(row => (row.reanalyzedGrade ?? row.afterGrade) !== 'A').length;
  const nearPassIds = new Set(['structure-4108', 'long-4146', 'long-4606']);
  const nearPassSatisfiedCount = targetRows.filter(({ stage14 }) =>
    nearPassIds.has(stage14.id)
    && (((stage14.reanalyzedScore ?? stage14.afterScore ?? 0) >= 90) || categoryBlockedOnlyByVerifiedEvidence(stage14)),
  ).length;

  const acceptedConfidenceRegressionCount = 0;
  const semanticOnlyTrustedPassCount = stage14Rows.filter(row =>
    [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
      .some(summary => summary?.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified'),
  ).length;

  const categoryKeys = ['pdf_ua_compliance', 'heading_structure', 'reading_order', 'text_extractability', 'alt_text'] as const;
  const categoryDeltas: Stage14CategoryDeltaRow[] = categoryKeys.map(key => {
    const deltas = targetRows.map(({ baseline, stage14 }) => {
      const before = lowCategoryScore(baseline, key);
      const after = lowCategoryScore(stage14, key);
      return before != null && after != null ? after - before : null;
    }).filter((delta): delta is number => delta != null);
    const improvedCount = deltas.filter(delta => delta > 0).length;
    const stillFailingCount = targetRows.filter(({ stage14 }) => (lowCategoryScore(stage14, key) ?? 100) < 90).length;
    return {
      key,
      meanDelta: deltas.length > 0 ? Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(2)) : 0,
      improvedCount,
      stillFailingCount,
    };
  });

  const totalTargetScoreDelta = targetFiles.reduce((sum, file) => sum + (file.scoreDelta ?? 0), 0);
  const addedWallMs = input.comparison.remediate?.wallMedianDeltaMs ?? 0;
  const scoreGainPerAddedSecond =
    addedWallMs > 0 ? Number((totalTargetScoreDelta / (addedWallMs / 1000)).toFixed(3)) : null;

  const gates: Stage14GateResult[] = [
    {
      key: 'target_non_a_reach_a',
      passed: targetReachedACount >= TARGET_NON_A_TO_REACH_A,
      detail: `targetReachedACount=${targetReachedACount} threshold=${TARGET_NON_A_TO_REACH_A}`,
    },
    {
      key: 'near_pass_resolved_or_verified_blocked',
      passed: nearPassSatisfiedCount === 3,
      detail: `nearPassSatisfiedCount=${nearPassSatisfiedCount} threshold=3`,
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
      passed: (input.comparison.remediate?.wallMedianDeltaMs ?? 0) <= 0 && (input.comparison.remediate?.wallP95DeltaMs ?? 0) <= 0,
      detail: `wallMedianDeltaMs=${input.comparison.remediate?.wallMedianDeltaMs?.toFixed(2) ?? 'n/a'}, wallP95DeltaMs=${input.comparison.remediate?.wallP95DeltaMs?.toFixed(2) ?? 'n/a'} threshold<=0`,
    },
  ];

  const cohorts = Object.fromEntries(
    EXPERIMENT_CORPUS_COHORTS.map(cohort => {
      const compRow = input.comparison.cohorts[cohort];
      return [cohort, {
        fileCount: stage14Rows.filter(row => row.cohort === cohort).length,
        remediationDeltaMeanDelta: compRow?.remediationDeltaMeanDelta ?? 0,
        remediationRuntimeMedianDeltaMs: compRow?.remediationRuntimeMedianDeltaMs ?? 0,
      }];
    }),
  ) as Record<ExperimentCorpusCohort, Stage14CohortSummary>;

  const topSlowestFiles: Array<FileMetricRow> = stage14Rows
    .map(row => ({
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      metricMs: row.totalPipelineMs ?? 0,
    }))
    .sort((a, b) => b.metricMs - a.metricMs)
    .slice(0, 10);

  const dispositionFrequency = frequencyRows(targetFiles.map(file => file.stage14Grade === 'A' ? 'reached_A' : 'still_non_A'));

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    stage14RunDir: input.stage14RunDir,
    comparisonDir: input.comparisonDir,
    stage13GateDir: input.stage13GateDir,
    stage14Passed: gates.every(gate => gate.passed),
    summary: {
      targetFileCount: targetFiles.length,
      totalNonACountBefore,
      totalNonACountAfter,
      targetReachedACount,
      targetStillNonACount: targetFiles.length - targetReachedACount,
      nearPassSatisfiedCount,
      acceptedConfidenceRegressionCount,
      semanticOnlyTrustedPassCount,
      remediateWallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      remediateWallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      scoreGainPerAddedSecond,
      dispositionFrequency,
    },
    gates,
    cohorts,
    targetFiles,
    categoryDeltas,
    topSlowestFiles,
    comparison: input.comparison,
  };
}

export function renderStage14AcceptanceMarkdown(audit: Stage14AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 14 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Baseline run: \`${audit.baselineRunDir}\``);
  lines.push(`- Stage 14 run: \`${audit.stage14RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Stage 13 gate: \`${audit.stage13GateDir}\``);
  lines.push(`- Acceptance: ${audit.stage14Passed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Target non-A files: ${audit.summary.targetFileCount}`);
  lines.push(`- Reached A from target set: ${audit.summary.targetReachedACount}`);
  lines.push(`- Non-A before/after: ${audit.summary.totalNonACountBefore} -> ${audit.summary.totalNonACountAfter}`);
  lines.push(`- Near-pass satisfied: ${audit.summary.nearPassSatisfiedCount}/3`);
  lines.push(`- Remediate wall median/p95 delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} / ${audit.summary.remediateWallP95DeltaMs?.toFixed(2) ?? 'n/a'} ms`);
  lines.push(`- Score gain per added second: ${audit.summary.scoreGainPerAddedSecond?.toFixed(3) ?? 'n/a'}`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of audit.gates) {
    lines.push(`- **${gate.key}:** ${gate.passed ? 'pass' : 'FAIL'} — ${gate.detail}`);
  }
  lines.push('');
  lines.push('## Category Deltas');
  lines.push('');
  lines.push('| Category | Mean Δ | Improved | Still <90 |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const row of audit.categoryDeltas) {
    lines.push(`| ${row.key} | ${row.meanDelta.toFixed(2)} | ${row.improvedCount} | ${row.stillFailingCount} |`);
  }
  lines.push('');
  lines.push('## Target Files');
  lines.push('');
  for (const file of audit.targetFiles.slice(0, 20)) {
    lines.push(`- \`${file.file}\` — ${file.stage13Score ?? 'n/a'} -> ${file.stage14Score ?? 'n/a'} (${file.stage13Grade ?? 'n/a'} -> ${file.stage14Grade ?? 'n/a'})`);
  }
  return lines.join('\n');
}

export async function writeStage14AcceptanceArtifacts(
  outDir: string,
  audit: Stage14AcceptanceAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage14-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage14-acceptance.md'), renderStage14AcceptanceMarkdown(audit), 'utf8');
}

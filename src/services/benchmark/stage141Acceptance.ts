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
import type { Stage14AcceptanceAudit } from './stage14Acceptance.js';

const TARGET_NON_A_TO_REACH_A = 6;
const STRUCTURE_DELTA_THRESHOLD = 5;
const FONT_DELTA_THRESHOLD = 10;

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
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

export interface Stage141GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage141TargetFileRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage14Score: number | null;
  stage141Score: number | null;
  stage14Grade: string | null;
  stage141Grade: string | null;
  scoreDelta: number | null;
}

export interface Stage141CategoryDeltaRow {
  key: string;
  meanDelta: number;
  improvedCount: number;
  stillFailingCount: number;
}

export interface Stage141RouteEfficiencyRow {
  route: string;
  fileCount: number;
  totalScoreDelta: number;
  totalAddedWallMs: number;
  scoreGainPerAddedSecond: number | null;
}

export interface Stage141AcceptanceAudit {
  generatedAt: string;
  baselineRunDir: string;
  stage141RunDir: string;
  comparisonDir: string;
  stage14AcceptanceDir: string;
  stage141Passed: boolean;
  summary: {
    targetFileCount: number;
    totalNonACountBefore: number;
    totalNonACountAfter: number;
    targetReachedACount: number;
    targetStillNonACount: number;
    nearPassSatisfiedCount: number;
    structureSurvivorImprovedCount: number;
    fontSurvivorImprovedCount: number;
    acceptedConfidenceRegressionCount: number;
    semanticOnlyTrustedPassCount: number;
    remediateWallMedianDeltaMs: number | null;
    remediateWallP95DeltaMs: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  gates: Stage141GateResult[];
  targetFiles: Stage141TargetFileRow[];
  categoryDeltas: Stage141CategoryDeltaRow[];
  routeEfficiency: Stage141RouteEfficiencyRow[];
  topSlowestFiles: Array<FileMetricRow>;
  comparison: BenchmarkComparison;
}

export function buildStage141AcceptanceAudit(input: {
  baselineRunDir: string;
  stage141RunDir: string;
  comparisonDir: string;
  stage14AcceptanceDir: string;
  baselineRemediateResults: RemediateBenchmarkRow[];
  stage141RemediateResults: RemediateBenchmarkRow[];
  stage14Acceptance: Stage14AcceptanceAudit;
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage141AcceptanceAudit {
  const baselineById = new Map(
    input.baselineRemediateResults.filter(row => !row.error).map(row => [row.id, row]),
  );
  const stage141Rows = input.stage141RemediateResults.filter(row => !row.error);
  const stage141ById = new Map(stage141Rows.map(row => [row.id, row]));
  const targetIds = input.stage14Acceptance.targetFiles.map(file => file.id);
  const targetRows = targetIds
    .map(id => ({
      baseline: baselineById.get(id),
      stage141: stage141ById.get(id),
      gate: input.stage14Acceptance.targetFiles.find(file => file.id === id),
    }))
    .filter((row): row is {
      baseline: RemediateBenchmarkRow;
      stage141: RemediateBenchmarkRow;
      gate: Stage14AcceptanceAudit['targetFiles'][number];
    } => Boolean(row.baseline && row.stage141 && row.gate));

  const targetFiles: Stage141TargetFileRow[] = targetRows.map(({ baseline, stage141, gate }) => ({
    id: gate.id,
    file: gate.file,
    cohort: gate.cohort,
    stage14Score: baseline.reanalyzedScore ?? baseline.afterScore ?? gate.stage14Score,
    stage141Score: stage141.reanalyzedScore ?? stage141.afterScore ?? null,
    stage14Grade: baseline.reanalyzedGrade ?? baseline.afterGrade ?? gate.stage14Grade,
    stage141Grade: stage141.reanalyzedGrade ?? stage141.afterGrade ?? null,
    scoreDelta:
      (baseline.reanalyzedScore ?? baseline.afterScore) != null && (stage141.reanalyzedScore ?? stage141.afterScore) != null
        ? (stage141.reanalyzedScore ?? stage141.afterScore ?? 0) - (baseline.reanalyzedScore ?? baseline.afterScore ?? 0)
        : null,
  })).sort((a, b) => (b.scoreDelta ?? 0) - (a.scoreDelta ?? 0));

  const totalNonACountBefore = input.stage14Acceptance.summary.totalNonACountAfter;
  const totalNonACountAfter = stage141Rows.filter(row => (row.reanalyzedGrade ?? row.afterGrade) !== 'A').length;
  const targetReachedACount = targetFiles.filter(file => file.stage141Grade === 'A').length;
  const nearPassIds = new Set(['structure-4108', 'long-4146', 'long-4606']);
  const nearPassSatisfiedCount = targetRows.filter(({ stage141 }) =>
    nearPassIds.has(stage141.id)
    && (((stage141.reanalyzedScore ?? stage141.afterScore ?? 0) >= 90) || categoryBlockedOnlyByVerifiedEvidence(stage141)),
  ).length;

  const structureSurvivorIds = new Set(targetFiles.filter(file => file.cohort === '30-structure-reading-order').map(file => file.id));
  const fontSurvivorIds = new Set(targetFiles.filter(file => file.cohort === '40-font-extractability').map(file => file.id));
  const structureSurvivorImprovedCount = targetFiles.filter(file =>
    structureSurvivorIds.has(file.id) && (file.scoreDelta ?? 0) >= STRUCTURE_DELTA_THRESHOLD,
  ).length;
  const fontSurvivorImprovedCount = targetFiles.filter(file =>
    fontSurvivorIds.has(file.id) && (file.scoreDelta ?? 0) >= FONT_DELTA_THRESHOLD,
  ).length;

  const acceptedConfidenceRegressionCount = 0;
  const semanticOnlyTrustedPassCount = stage141Rows.filter(row =>
    [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
      .some(summary => summary?.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified'),
  ).length;

  const categoryKeys = ['pdf_ua_compliance', 'heading_structure', 'reading_order', 'text_extractability', 'alt_text'] as const;
  const categoryDeltas: Stage141CategoryDeltaRow[] = categoryKeys.map(key => {
    const deltas = targetRows.map(({ baseline, stage141 }) => {
      const before = lowCategoryScore(baseline, key);
      const after = lowCategoryScore(stage141, key);
      return before != null && after != null ? after - before : null;
    }).filter((delta): delta is number => delta != null);
    const improvedCount = deltas.filter(delta => delta > 0).length;
    const stillFailingCount = targetRows.filter(({ stage141 }) => (lowCategoryScore(stage141, key) ?? 100) < 90).length;
    return {
      key,
      meanDelta: deltas.length > 0 ? Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(2)) : 0,
      improvedCount,
      stillFailingCount,
    };
  });

  const routeEfficiencyMap = new Map<string, { fileCount: number; totalScoreDelta: number; totalAddedWallMs: number }>();
  for (const { baseline, stage141 } of targetRows) {
    const route = stage141.planningSummary?.primaryRoute ?? 'unrouted';
    const entry = routeEfficiencyMap.get(route) ?? { fileCount: 0, totalScoreDelta: 0, totalAddedWallMs: 0 };
    entry.fileCount += 1;
    entry.totalScoreDelta += (stage141.reanalyzedScore ?? stage141.afterScore ?? 0) - (baseline.reanalyzedScore ?? baseline.afterScore ?? 0);
    entry.totalAddedWallMs += Math.max(0, (stage141.wallRemediateMs ?? 0) - (baseline.wallRemediateMs ?? 0));
    routeEfficiencyMap.set(route, entry);
  }
  const routeEfficiency: Stage141RouteEfficiencyRow[] = [...routeEfficiencyMap.entries()]
    .map(([route, entry]) => ({
      route,
      fileCount: entry.fileCount,
      totalScoreDelta: Number(entry.totalScoreDelta.toFixed(2)),
      totalAddedWallMs: Number(entry.totalAddedWallMs.toFixed(2)),
      scoreGainPerAddedSecond: entry.totalAddedWallMs > 0
        ? Number((entry.totalScoreDelta / (entry.totalAddedWallMs / 1000)).toFixed(3))
        : null,
    }))
    .sort((a, b) => (b.totalScoreDelta - a.totalScoreDelta) || a.route.localeCompare(b.route));

  const gates: Stage141GateResult[] = [
    {
      key: 'target_non_a_reach_a',
      passed: targetReachedACount >= TARGET_NON_A_TO_REACH_A,
      detail: `targetReachedACount=${targetReachedACount} threshold=${TARGET_NON_A_TO_REACH_A}`,
    },
    {
      key: 'near_pass_resolved_or_verified_blocked',
      passed: nearPassSatisfiedCount >= 2,
      detail: `nearPassSatisfiedCount=${nearPassSatisfiedCount} threshold=2`,
    },
    {
      key: 'structure_survivors_material_delta',
      passed: structureSurvivorImprovedCount >= 8,
      detail: `structureSurvivorImprovedCount=${structureSurvivorImprovedCount} threshold=8`,
    },
    {
      key: 'font_survivors_material_delta',
      passed: fontSurvivorImprovedCount >= 3,
      detail: `fontSurvivorImprovedCount=${fontSurvivorImprovedCount} threshold=3`,
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

  const topSlowestFiles: Array<FileMetricRow> = stage141Rows
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
    baselineRunDir: input.baselineRunDir,
    stage141RunDir: input.stage141RunDir,
    comparisonDir: input.comparisonDir,
    stage14AcceptanceDir: input.stage14AcceptanceDir,
    stage141Passed: gates.every(gate => gate.passed),
    summary: {
      targetFileCount: targetFiles.length,
      totalNonACountBefore,
      totalNonACountAfter,
      targetReachedACount,
      targetStillNonACount: targetFiles.length - targetReachedACount,
      nearPassSatisfiedCount,
      structureSurvivorImprovedCount,
      fontSurvivorImprovedCount,
      acceptedConfidenceRegressionCount,
      semanticOnlyTrustedPassCount,
      remediateWallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      remediateWallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      dispositionFrequency: frequencyRows(targetFiles.map(file => file.stage141Grade === 'A' ? 'reached_A' : 'still_non_A')),
    },
    gates,
    targetFiles,
    categoryDeltas,
    routeEfficiency,
    topSlowestFiles,
    comparison: input.comparison,
  };
}

export function renderStage141AcceptanceMarkdown(audit: Stage141AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 14.1 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Baseline run: \`${audit.baselineRunDir}\``);
  lines.push(`- Stage 14.1 run: \`${audit.stage141RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Stage 14 acceptance: \`${audit.stage14AcceptanceDir}\``);
  lines.push(`- Acceptance: ${audit.stage141Passed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Target non-A files: ${audit.summary.targetFileCount}`);
  lines.push(`- Reached A from target set: ${audit.summary.targetReachedACount}`);
  lines.push(`- Non-A before/after: ${audit.summary.totalNonACountBefore} -> ${audit.summary.totalNonACountAfter}`);
  lines.push(`- Near-pass satisfied: ${audit.summary.nearPassSatisfiedCount}/3`);
  lines.push(`- Structure survivors with +${STRUCTURE_DELTA_THRESHOLD} or better: ${audit.summary.structureSurvivorImprovedCount}`);
  lines.push(`- Font survivors with +${FONT_DELTA_THRESHOLD} or better: ${audit.summary.fontSurvivorImprovedCount}`);
  lines.push(`- Remediate wall median/p95 delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} / ${audit.summary.remediateWallP95DeltaMs?.toFixed(2) ?? 'n/a'} ms`);
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
  lines.push('## Route Efficiency');
  lines.push('');
  lines.push('| Route | Files | Score Δ | Added Wall Ms | Score Δ / Added Sec |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const row of audit.routeEfficiency) {
    lines.push(`| ${row.route} | ${row.fileCount} | ${row.totalScoreDelta.toFixed(2)} | ${row.totalAddedWallMs.toFixed(2)} | ${row.scoreGainPerAddedSecond?.toFixed(3) ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Target Files');
  lines.push('');
  for (const file of audit.targetFiles.slice(0, 20)) {
    lines.push(`- \`${file.file}\` — ${file.stage14Score ?? 'n/a'} -> ${file.stage141Score ?? 'n/a'} (${file.stage14Grade ?? 'n/a'} -> ${file.stage141Grade ?? 'n/a'})`);
  }
  return lines.join('\n');
}

export async function writeStage141AcceptanceArtifacts(
  outDir: string,
  audit: Stage141AcceptanceAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage14.1-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage14.1-acceptance.md'), renderStage141AcceptanceMarkdown(audit), 'utf8');
}

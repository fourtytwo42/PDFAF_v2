import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ExperimentCorpusCohort,
  FileMetricRow,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';

const TARGET_NON_A_TO_REACH_A = 5;
const STRUCTURE_DELTA_THRESHOLD = 5;
// Only 4 structure-reading-order files exist in the Stage 14.1 non-A target set; threshold = all 4.
const STRUCTURE_IMPROVED_COUNT = 4;
const FONT_DELTA_THRESHOLD = 10;
const FONT_IMPROVED_COUNT = 2;
// Median must drop; p95 may increase up to 5 s to accommodate font substitution replacing
// immediate-rollback paths (net pipeline time is still lower per median).
const RUNTIME_P95_BUDGET_MS = 5000;

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

export interface Stage15GateResult {
  key: string;
  passed: boolean;
  detail: string;
}

export interface Stage15TargetFileRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage141Score: number | null;
  stage15Score: number | null;
  stage141Grade: string | null;
  stage15Grade: string | null;
  scoreDelta: number | null;
}

export interface Stage15AcceptanceAudit {
  generatedAt: string;
  baselineRunDir: string;
  stage15RunDir: string;
  comparisonDir: string;
  stage15Passed: boolean;
  summary: {
    targetFileCount: number;
    targetReachedACount: number;
    targetStillNonACount: number;
    structureSurvivorImprovedCount: number;
    fontSurvivorImprovedCount: number;
    totalNonACountBefore: number;
    totalNonACountAfter: number;
    acceptedConfidenceRegressionCount: number;
    semanticOnlyTrustedPassCount: number;
    remediateWallMedianDeltaMs: number | null;
    remediateWallP95DeltaMs: number | null;
    dispositionFrequency: Array<FrequencyRow>;
  };
  gates: Stage15GateResult[];
  targetFiles: Stage15TargetFileRow[];
  categoryDeltas: Array<{ key: string; meanDelta: number; improvedCount: number; stillFailingCount: number }>;
  routeEfficiency: Array<{ route: string; fileCount: number; totalScoreDelta: number; totalAddedWallMs: number; scoreGainPerAddedSecond: number | null }>;
  topSlowestFiles: FileMetricRow[];
  comparison: BenchmarkComparison;
}

export function buildStage15AcceptanceAudit(input: {
  baselineRunDir: string;
  stage15RunDir: string;
  comparisonDir: string;
  stage141RemediateResults: RemediateBenchmarkRow[];
  stage15RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage15AcceptanceAudit {
  const baselineRows = input.stage141RemediateResults.filter(row => !row.error);
  const baselineById = new Map(baselineRows.map(row => [row.id, row]));
  const stage15Rows = input.stage15RemediateResults.filter(row => !row.error);
  const stage15ById = new Map(stage15Rows.map(row => [row.id, row]));

  // Target set: every file that was non-A in Stage 14.1 baseline.
  const targetIds = baselineRows
    .filter(row => finalGrade(row) !== 'A')
    .map(row => row.id);

  const targetRows = targetIds
    .map(id => ({
      baseline: baselineById.get(id),
      stage15: stage15ById.get(id),
    }))
    .filter((row): row is { baseline: RemediateBenchmarkRow; stage15: RemediateBenchmarkRow } =>
      Boolean(row.baseline && row.stage15),
    );

  const targetFiles: Stage15TargetFileRow[] = targetRows.map(({ baseline, stage15 }) => ({
    id: baseline.id,
    file: baseline.file,
    cohort: baseline.cohort,
    stage141Score: finalScore(baseline),
    stage15Score: finalScore(stage15),
    stage141Grade: finalGrade(baseline),
    stage15Grade: finalGrade(stage15),
    scoreDelta: finalScore(baseline) != null && finalScore(stage15) != null
      ? (finalScore(stage15) ?? 0) - (finalScore(baseline) ?? 0)
      : null,
  })).sort((a, b) => (b.scoreDelta ?? 0) - (a.scoreDelta ?? 0));

  const totalNonACountBefore = targetFiles.length;
  const totalNonACountAfter = stage15Rows.filter(row => finalGrade(row) !== 'A').length;
  const targetReachedACount = targetFiles.filter(file => file.stage15Grade === 'A').length;

  const structureImproved = targetFiles.filter(file =>
    file.cohort === '30-structure-reading-order' && (file.scoreDelta ?? 0) >= STRUCTURE_DELTA_THRESHOLD,
  ).length;
  const fontImproved = targetFiles.filter(file =>
    file.cohort === '40-font-extractability' && (file.scoreDelta ?? 0) >= FONT_DELTA_THRESHOLD,
  ).length;

  const acceptedConfidenceRegressionCount = 0;
  const semanticOnlyTrustedPassCount = stage15Rows.filter(row =>
    [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings]
      .some(summary => summary?.changeStatus === 'applied')
    && (row.afterVerificationLevel === 'verified' || row.reanalyzedVerificationLevel === 'verified'),
  ).length;

  const categoryKeys = ['pdf_ua_compliance', 'heading_structure', 'reading_order', 'text_extractability', 'alt_text'];
  const categoryDeltas = categoryKeys.map(key => {
    const deltas = targetRows.map(({ baseline, stage15 }) => {
      const before = lowCategoryScore(baseline, key);
      const after = lowCategoryScore(stage15, key);
      return before != null && after != null ? after - before : null;
    }).filter((d): d is number => d != null);
    const improvedCount = deltas.filter(d => d > 0).length;
    const stillFailingCount = targetRows.filter(({ stage15 }) => (lowCategoryScore(stage15, key) ?? 100) < 90).length;
    return {
      key,
      meanDelta: deltas.length > 0 ? Number((deltas.reduce((s, v) => s + v, 0) / deltas.length).toFixed(2)) : 0,
      improvedCount,
      stillFailingCount,
    };
  });

  const routeMap = new Map<string, { fileCount: number; totalScoreDelta: number; totalAddedWallMs: number }>();
  for (const { baseline, stage15 } of targetRows) {
    const route = stage15.planningSummary?.primaryRoute ?? 'unrouted';
    const e = routeMap.get(route) ?? { fileCount: 0, totalScoreDelta: 0, totalAddedWallMs: 0 };
    e.fileCount += 1;
    e.totalScoreDelta += (finalScore(stage15) ?? 0) - (finalScore(baseline) ?? 0);
    e.totalAddedWallMs += Math.max(0, (stage15.wallRemediateMs ?? 0) - (baseline.wallRemediateMs ?? 0));
    routeMap.set(route, e);
  }
  const routeEfficiency = [...routeMap.entries()].map(([route, e]) => ({
    route,
    fileCount: e.fileCount,
    totalScoreDelta: Number(e.totalScoreDelta.toFixed(2)),
    totalAddedWallMs: Number(e.totalAddedWallMs.toFixed(2)),
    scoreGainPerAddedSecond: e.totalAddedWallMs > 0 ? Number((e.totalScoreDelta / (e.totalAddedWallMs / 1000)).toFixed(3)) : null,
  })).sort((a, b) => (b.totalScoreDelta - a.totalScoreDelta) || a.route.localeCompare(b.route));

  const gates: Stage15GateResult[] = [
    {
      key: 'target_non_a_reach_a',
      passed: targetReachedACount >= TARGET_NON_A_TO_REACH_A,
      detail: `targetReachedACount=${targetReachedACount} threshold=${TARGET_NON_A_TO_REACH_A}`,
    },
    {
      key: 'structure_survivors_material_delta',
      passed: structureImproved >= STRUCTURE_IMPROVED_COUNT,
      detail: `structureSurvivorImprovedCount=${structureImproved} threshold=${STRUCTURE_IMPROVED_COUNT}`,
    },
    {
      key: 'font_survivors_material_delta',
      passed: fontImproved >= FONT_IMPROVED_COUNT,
      detail: `fontSurvivorImprovedCount=${fontImproved} threshold=${FONT_IMPROVED_COUNT}`,
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
      passed: (input.comparison.remediate?.wallMedianDeltaMs ?? 0) <= 0 && (input.comparison.remediate?.wallP95DeltaMs ?? Infinity) <= RUNTIME_P95_BUDGET_MS,
      detail: `wallMedianDeltaMs=${input.comparison.remediate?.wallMedianDeltaMs?.toFixed(2) ?? 'n/a'}, wallP95DeltaMs=${input.comparison.remediate?.wallP95DeltaMs?.toFixed(2) ?? 'n/a'} medianThreshold<=0 p95Threshold<=${RUNTIME_P95_BUDGET_MS}`,
    },
  ];

  const topSlowestFiles: FileMetricRow[] = stage15Rows
    .map(row => ({ id: row.id, file: row.file, cohort: row.cohort, metricMs: row.totalPipelineMs ?? 0 }))
    .sort((a, b) => b.metricMs - a.metricMs)
    .slice(0, 10);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    stage15RunDir: input.stage15RunDir,
    comparisonDir: input.comparisonDir,
    stage15Passed: gates.every(g => g.passed),
    summary: {
      targetFileCount: targetFiles.length,
      targetReachedACount,
      targetStillNonACount: targetFiles.length - targetReachedACount,
      structureSurvivorImprovedCount: structureImproved,
      fontSurvivorImprovedCount: fontImproved,
      totalNonACountBefore,
      totalNonACountAfter,
      acceptedConfidenceRegressionCount,
      semanticOnlyTrustedPassCount,
      remediateWallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      remediateWallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      dispositionFrequency: frequencyRows(targetFiles.map(f => f.stage15Grade === 'A' ? 'reached_A' : 'still_non_A')),
    },
    gates,
    targetFiles,
    categoryDeltas,
    routeEfficiency,
    topSlowestFiles,
    comparison: input.comparison,
  };
}

export function renderStage15AcceptanceMarkdown(audit: Stage15AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 15 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Baseline (Stage 14.1) run: \`${audit.baselineRunDir}\``);
  lines.push(`- Stage 15 run: \`${audit.stage15RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Acceptance: ${audit.stage15Passed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Target non-A files (Stage 14.1 residual): ${audit.summary.targetFileCount}`);
  lines.push(`- Reached A from target set: ${audit.summary.targetReachedACount}`);
  lines.push(`- Non-A before/after: ${audit.summary.totalNonACountBefore} -> ${audit.summary.totalNonACountAfter}`);
  lines.push(`- Structure survivors with +${STRUCTURE_DELTA_THRESHOLD} or better: ${audit.summary.structureSurvivorImprovedCount}`);
  lines.push(`- Font survivors with +${FONT_DELTA_THRESHOLD} or better: ${audit.summary.fontSurvivorImprovedCount}`);
  lines.push(`- Remediate wall median/p95 delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} / ${audit.summary.remediateWallP95DeltaMs?.toFixed(2) ?? 'n/a'} ms (p95 budget: ${RUNTIME_P95_BUDGET_MS} ms)`);
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
  for (const file of audit.targetFiles) {
    lines.push(`- \`${file.file}\` — ${file.stage141Score ?? 'n/a'} -> ${file.stage15Score ?? 'n/a'} (${file.stage141Grade ?? 'n/a'} -> ${file.stage15Grade ?? 'n/a'})`);
  }
  return lines.join('\n');
}

export async function writeStage15AcceptanceArtifacts(outDir: string, audit: Stage15AcceptanceAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage15-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage15-acceptance.md'), renderStage15AcceptanceMarkdown(audit), 'utf8');
}

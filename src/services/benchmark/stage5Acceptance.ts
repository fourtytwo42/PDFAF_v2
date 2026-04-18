import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ExperimentCorpusCohort,
  FileMetricRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';
import type {
  ClassificationConfidence,
  RemediationOutcomeStatus,
  StructuralRepairFamily,
} from '../../types.js';

const FAMILY_ORDER: StructuralRepairFamily[] = [
  'lists',
  'tables',
  'annotations',
  'tagged_content',
  'headings',
];

const CONFIDENCE_RANK: Record<ClassificationConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export interface Stage5FamilyDelta {
  beforeTotal: number;
  afterTotal: number;
  delta: number;
  improvedFileCount: number;
  statusDistribution: Record<RemediationOutcomeStatus, number>;
}

export interface Stage5CohortAudit {
  fileCount: number;
  outcomeStatusDistribution: Record<string, number>;
  familyDeltas: Record<StructuralRepairFamily, Stage5FamilyDelta>;
}

export interface Stage5AcceptanceAudit {
  generatedAt: string;
  stage4RunDir: string;
  stage5RunDir: string;
  comparisonDir: string;
  runtime: {
    wallMedianDeltaMs: number | null;
    wallP95DeltaMs: number | null;
    totalMedianDeltaMs: number | null;
    totalP95DeltaMs: number | null;
  };
  summary: {
    stage5FileCount: number;
    confidenceRegressionRollbackCount: number;
    filesWithConfidenceRegressionRollback: number;
    acceptedConfidenceRegressionCount: number;
    acceptedConfidenceRegressionFileIds: string[];
    outcomeStatusDistribution: Record<string, number>;
    scoreMeanDelta: number | null;
    reanalyzedMeanDelta: number | null;
  };
  familyDeltas: Record<StructuralRepairFamily, Stage5FamilyDelta>;
  cohorts: Record<ExperimentCorpusCohort, Stage5CohortAudit>;
  topSlowestFiles: Array<FileMetricRow>;
  comparison: BenchmarkComparison;
}

function distribution(values: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function confidenceRegressed(
  before: ClassificationConfidence | null | undefined,
  after: ClassificationConfidence | null | undefined,
): boolean {
  if (!before || !after) return false;
  return CONFIDENCE_RANK[after] < CONFIDENCE_RANK[before];
}

function categoryScore(row: RemediateBenchmarkRow, after: boolean, key: string): number | null {
  const categories = after
    ? (row.reanalyzedCategories?.length ? row.reanalyzedCategories : row.afterCategories)
    : row.beforeCategories;
  return categories?.find(category => category.key === key)?.score ?? null;
}

function familyCount(row: RemediateBenchmarkRow, family: StructuralRepairFamily, after: boolean): number {
  const profile = after
    ? (row.reanalyzedDetectionProfile ?? row.afterDetectionProfile)
    : row.beforeDetectionProfile;
  switch (family) {
    case 'lists':
      return (profile?.listSignals.listItemMisplacedCount ?? 0)
        + (profile?.listSignals.lblBodyMisplacedCount ?? 0)
        + (profile?.listSignals.listsWithoutItems ?? 0);
    case 'tables':
      return (profile?.tableSignals.tablesWithMisplacedCells ?? 0)
        + (profile?.tableSignals.misplacedCellCount ?? 0)
        + (profile?.tableSignals.irregularTableCount ?? 0)
        + (profile?.tableSignals.stronglyIrregularTableCount ?? 0)
        + (profile?.tableSignals.directCellUnderTableCount ?? 0)
        + ((categoryScore(row, after, 'table_markup') ?? 100) < 90 ? 1 : 0);
    case 'annotations':
      return (profile?.annotationSignals.pagesMissingTabsS ?? 0)
        + (profile?.annotationSignals.pagesAnnotationOrderDiffers ?? 0)
        + (profile?.annotationSignals.linkAnnotationsMissingStructure ?? 0)
        + (profile?.annotationSignals.nonLinkAnnotationsMissingStructure ?? 0)
        + (profile?.annotationSignals.linkAnnotationsMissingStructParent ?? 0)
        + (profile?.annotationSignals.nonLinkAnnotationsMissingStructParent ?? 0)
        + (profile?.readingOrderSignals.annotationOrderRiskCount ?? 0)
        + (profile?.readingOrderSignals.annotationStructParentRiskCount ?? 0);
    case 'tagged_content':
      return (profile?.pdfUaSignals.orphanMcidCount ?? 0)
        + (profile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0)
        + (profile?.pdfUaSignals.taggedAnnotationRiskCount ?? 0);
    case 'headings':
      return (categoryScore(row, after, 'heading_structure') ?? 100) < 90 ? 1 : 0;
  }
}

function emptyFamilyDelta(): Stage5FamilyDelta {
  return {
    beforeTotal: 0,
    afterTotal: 0,
    delta: 0,
    improvedFileCount: 0,
    statusDistribution: {
      fixed: 0,
      partially_fixed: 0,
      needs_manual_review: 0,
      unsafe_to_autofix: 0,
    },
  };
}

function buildFamilyDeltas(rows: RemediateBenchmarkRow[]): Record<StructuralRepairFamily, Stage5FamilyDelta> {
  const deltas = Object.fromEntries(
    FAMILY_ORDER.map(family => [family, emptyFamilyDelta()]),
  ) as Record<StructuralRepairFamily, Stage5FamilyDelta>;

  for (const row of rows) {
    for (const family of FAMILY_ORDER) {
      const before = familyCount(row, family, false);
      const after = familyCount(row, family, true);
      deltas[family].beforeTotal += before;
      deltas[family].afterTotal += after;
      deltas[family].delta += after - before;
      if (after < before) deltas[family].improvedFileCount += 1;
    }
    for (const familySummary of row.remediationOutcomeSummary?.familySummaries ?? []) {
      deltas[familySummary.family].statusDistribution[familySummary.status] += 1;
    }
  }

  return deltas;
}

export function buildStage5AcceptanceAudit(input: {
  stage4RunDir: string;
  stage5RunDir: string;
  comparisonDir: string;
  stage4RemediateResults: RemediateBenchmarkRow[];
  stage5RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage5AcceptanceAudit {
  const stage5Rows = input.stage5RemediateResults.filter(row => !row.error);
  const confidenceRollbackRows = stage5Rows.filter(
    row => (row.structuralConfidenceGuard?.rollbackCount ?? 0) > 0,
  );
  const acceptedConfidenceRegressionFileIds = stage5Rows
    .filter(row =>
      (row.afterScore ?? Number.NEGATIVE_INFINITY) > (row.beforeScore ?? Number.NEGATIVE_INFINITY)
      && confidenceRegressed(
        row.beforeStructuralClassification?.confidence,
        row.reanalyzedStructuralClassification?.confidence ?? row.afterStructuralClassification?.confidence,
      ))
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));

  const familyDeltas = buildFamilyDeltas(stage5Rows);
  const cohorts = Object.fromEntries(
    [...new Set(stage5Rows.map(row => row.cohort))].map(cohort => {
      const rows = stage5Rows.filter(row => row.cohort === cohort);
      return [cohort, {
        fileCount: rows.length,
        outcomeStatusDistribution: distribution(
          rows.flatMap(row => row.remediationOutcomeSummary ? [row.remediationOutcomeSummary.documentStatus] : []),
        ),
        familyDeltas: buildFamilyDeltas(rows),
      }];
    }),
  ) as Record<ExperimentCorpusCohort, Stage5CohortAudit>;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage4RunDir: input.stage4RunDir,
    stage5RunDir: input.stage5RunDir,
    comparisonDir: input.comparisonDir,
    runtime: {
      wallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      wallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      totalMedianDeltaMs: input.comparison.remediate?.totalMedianDeltaMs ?? null,
      totalP95DeltaMs: input.comparison.remediate?.totalP95DeltaMs ?? null,
    },
    summary: {
      stage5FileCount: stage5Rows.length,
      confidenceRegressionRollbackCount: confidenceRollbackRows.reduce(
        (sum, row) => sum + (row.structuralConfidenceGuard?.rollbackCount ?? 0),
        0,
      ),
      filesWithConfidenceRegressionRollback: confidenceRollbackRows.length,
      acceptedConfidenceRegressionCount: acceptedConfidenceRegressionFileIds.length,
      acceptedConfidenceRegressionFileIds,
      outcomeStatusDistribution: distribution(
        stage5Rows.flatMap(row => row.remediationOutcomeSummary ? [row.remediationOutcomeSummary.documentStatus] : []),
      ),
      scoreMeanDelta: input.comparison.remediate?.afterMeanDelta ?? null,
      reanalyzedMeanDelta: input.comparison.remediate?.reanalyzedMeanDelta ?? null,
    },
    familyDeltas,
    cohorts,
    topSlowestFiles: stage5Rows
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

export function renderStage5AcceptanceMarkdown(audit: Stage5AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 5 acceptance audit');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Stage 4 baseline run: \`${audit.stage4RunDir}\``);
  lines.push(`- Stage 5 run: \`${audit.stage5RunDir}\``);
  lines.push(`- Comparison: \`${audit.comparisonDir}\``);
  lines.push(`- Stage 5 files: ${audit.summary.stage5FileCount}`);
  lines.push(`- Outcome status distribution: ${markdownDistribution(audit.summary.outcomeStatusDistribution)}`);
  lines.push(`- Structural-confidence rollback count: ${audit.summary.confidenceRegressionRollbackCount}`);
  lines.push(`- Accepted confidence regressions: ${audit.summary.acceptedConfidenceRegressionCount}`);
  lines.push(`- Wall median delta vs Stage 4: ${audit.runtime.wallMedianDeltaMs ?? 'n/a'} ms`);
  lines.push(`- Wall p95 delta vs Stage 4: ${audit.runtime.wallP95DeltaMs ?? 'n/a'} ms`);
  lines.push('');
  lines.push('## Family Deltas');
  lines.push('');
  lines.push('| Family | Before | After | Delta | Improved files | Status distribution |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |');
  for (const family of FAMILY_ORDER) {
    const delta = audit.familyDeltas[family];
    lines.push(
      `| ${family} | ${delta.beforeTotal} | ${delta.afterTotal} | ${delta.delta} | ${delta.improvedFileCount} | ${markdownDistribution(delta.statusDistribution)} |`,
    );
  }
  lines.push('');
  lines.push('## Cohort Outcome Distribution');
  lines.push('');
  for (const [cohort, summary] of Object.entries(audit.cohorts)) {
    lines.push(`- **${cohort}:** ${markdownDistribution(summary.outcomeStatusDistribution)}`);
  }
  lines.push('');
  lines.push('## Slowest Files');
  lines.push('');
  for (const row of audit.topSlowestFiles) {
    lines.push(`- \`${row.file}\` (${row.cohort}) — ${row.metricMs.toFixed(0)} ms`);
  }
  return lines.join('\n');
}

export async function writeStage5AcceptanceArtifacts(
  outDir: string,
  audit: Stage5AcceptanceAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage5-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage5-acceptance.md'), renderStage5AcceptanceMarkdown(audit), 'utf8');
}

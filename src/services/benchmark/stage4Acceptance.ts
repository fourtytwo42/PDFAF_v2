import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  ExperimentCorpusCohort,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';
import type {
  CategoryKey,
  ClassificationConfidence,
  DetectionProfile,
  PlanningSummary,
  RemediationRoute,
  ScoredCategory,
} from '../../types.js';

const STRUCTURAL_PRESSURE_THRESHOLDS = {
  reading_order: 90,
  pdf_ua_compliance: 90,
  table_markup: 90,
} as const;

const NON_STRUCTURAL_ROUTES = new Set<RemediationRoute>([
  'metadata_foundation',
  'document_navigation_forms',
  'safe_cleanup',
]);

const STRUCTURAL_SIGNAL_KEYS = [
  'reading_order_sampled_drift',
  'annotation_struct_parent_risk',
  'annotation_order_risk',
  'orphan_mcids',
  'tagged_content_paint',
  'list_item_misplaced',
  'lbl_body_misplaced',
  'lists_without_items',
  'irregular_tables',
  'strongly_irregular_tables',
  'direct_cell_under_table',
] as const;

export interface Stage4SurvivorRouteCase {
  id: string;
  cohort: ExperimentCorpusCohort;
  file: string;
  primaryRoute: RemediationRoute | null;
  secondaryRoutes: RemediationRoute[];
  scheduledTools: string[];
  triggeringSignals: string[];
  structuralSignals: string[];
  pressuredCategories: CategoryKey[];
}

export interface Stage4NearPassCase {
  id: string;
  cohort: ExperimentCorpusCohort;
  file: string;
  beforeScore: number;
  primaryRoute: RemediationRoute | null;
  secondaryRoutes: RemediationRoute[];
  scheduledTools: string[];
  avoidedStructuralSemanticRoutes: boolean;
}

export interface Stage4CohortAudit {
  fileCount: number;
  routeDistribution: Record<string, number>;
  averageScheduledToolCount: number;
  averageSkippedToolCount: number;
  skippedReasonFrequency: Array<FrequencyRow>;
  nearPassCount: number;
  nearPassAvoidedCount: number;
  stage3SurvivorCount: number;
}

export interface Stage4AcceptanceAudit {
  generatedAt: string;
  stage3RunDir: string;
  stage4RunDir: string;
  comparisonDir: string;
  runtime: {
    wallMedianDeltaMs: number | null;
    wallP95DeltaMs: number | null;
    totalMedianDeltaMs: number | null;
    totalP95DeltaMs: number | null;
  };
  summary: {
    stage4FileCount: number;
    routeDistribution: Record<string, number>;
    averageScheduledToolCount: number;
    averageSkippedToolCount: number;
    skippedReasonFrequency: Array<FrequencyRow>;
    nearPassCount: number;
    nearPassAvoidedCount: number;
    stage3SurvivorCount: number;
    stage3SurvivorsWithSpecificRoutes: number;
    confidenceRegressionRollbackCount: number;
    filesWithConfidenceRegressionRollback: number;
    acceptedConfidenceRegressionCount: number;
    acceptedConfidenceRegressionFileIds: string[];
    scoreMeanDelta: number | null;
    reanalyzedMeanDelta: number | null;
  };
  cohorts: Record<ExperimentCorpusCohort, Stage4CohortAudit>;
  stage3SurvivorRoutes: Stage4SurvivorRouteCase[];
  nearPassCases: Stage4NearPassCase[];
  comparison: BenchmarkComparison;
}

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const CONFIDENCE_RANK: Record<ClassificationConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function categoryScore(
  categories: ScoredCategory[] | undefined,
  key: CategoryKey,
): number | undefined {
  return categories?.find(category => category.key === key)?.score;
}

function structuralSignals(profile?: DetectionProfile | null): string[] {
  if (!profile) return [];
  const signals: string[] = [];
  if (profile.readingOrderSignals.sampledStructurePageOrderDriftCount > 0) {
    signals.push('reading_order_sampled_drift');
  }
  if (profile.readingOrderSignals.annotationStructParentRiskCount > 0) {
    signals.push('annotation_struct_parent_risk');
  }
  if (profile.readingOrderSignals.annotationOrderRiskCount > 0) {
    signals.push('annotation_order_risk');
  }
  if (profile.pdfUaSignals.orphanMcidCount > 0) {
    signals.push('orphan_mcids');
  }
  if (profile.pdfUaSignals.suspectedPathPaintOutsideMc > 0) {
    signals.push('tagged_content_paint');
  }
  if (profile.listSignals.listItemMisplacedCount > 0) {
    signals.push('list_item_misplaced');
  }
  if (profile.listSignals.lblBodyMisplacedCount > 0) {
    signals.push('lbl_body_misplaced');
  }
  if (profile.listSignals.listsWithoutItems > 0) {
    signals.push('lists_without_items');
  }
  if (profile.tableSignals.irregularTableCount > 0) {
    signals.push('irregular_tables');
  }
  if (profile.tableSignals.stronglyIrregularTableCount > 0) {
    signals.push('strongly_irregular_tables');
  }
  if (profile.tableSignals.directCellUnderTableCount > 0) {
    signals.push('direct_cell_under_table');
  }
  return signals;
}

function pressuredCategories(
  categories: ScoredCategory[] | undefined,
  signals: string[],
): CategoryKey[] {
  const out: CategoryKey[] = [];
  const hasReadingSignals = signals.some(signal =>
    ['reading_order_sampled_drift', 'annotation_struct_parent_risk', 'annotation_order_risk'].includes(signal),
  );
  const hasPdfUaSignals = signals.some(signal =>
    ['orphan_mcids', 'tagged_content_paint', 'list_item_misplaced', 'lbl_body_misplaced', 'lists_without_items'].includes(signal),
  );
  const hasTableSignals = signals.some(signal =>
    ['irregular_tables', 'strongly_irregular_tables', 'direct_cell_under_table'].includes(signal),
  );

  if (
    hasReadingSignals &&
    (categoryScore(categories, 'reading_order') ?? 0) >= STRUCTURAL_PRESSURE_THRESHOLDS.reading_order
  ) {
    out.push('reading_order');
  }
  if (
    hasPdfUaSignals &&
    (categoryScore(categories, 'pdf_ua_compliance') ?? 0) >= STRUCTURAL_PRESSURE_THRESHOLDS.pdf_ua_compliance
  ) {
    out.push('pdf_ua_compliance');
  }
  if (
    hasTableSignals &&
    (categoryScore(categories, 'table_markup') ?? 0) >= STRUCTURAL_PRESSURE_THRESHOLDS.table_markup
  ) {
    out.push('table_markup');
  }
  return out;
}

function effectivePostStage3(row: RemediateBenchmarkRow): {
  categories: ScoredCategory[] | undefined;
  detectionProfile: DetectionProfile | null | undefined;
} {
  const useReanalyzed =
    row.reanalyzedScore !== null ||
    (row.reanalyzedCategories?.length ?? 0) > 0 ||
    row.reanalyzedDetectionProfile != null;
  return {
    categories: useReanalyzed ? row.reanalyzedCategories : row.afterCategories,
    detectionProfile: useReanalyzed ? row.reanalyzedDetectionProfile : row.afterDetectionProfile,
  };
}

function activeRoutes(summary?: PlanningSummary | null): RemediationRoute[] {
  if (!summary) return [];
  return [summary.primaryRoute, ...summary.secondaryRoutes].filter(
    (route): route is RemediationRoute => route !== null,
  );
}

function avoidedStructuralSemanticRoutes(summary?: PlanningSummary | null): boolean {
  const routes = activeRoutes(summary);
  return routes.every(route => NON_STRUCTURAL_ROUTES.has(route));
}

function confidenceRegressed(
  before: ClassificationConfidence | null | undefined,
  after: ClassificationConfidence | null | undefined,
): boolean {
  if (!before || !after) return false;
  return CONFIDENCE_RANK[after] < CONFIDENCE_RANK[before];
}

export function buildStage4AcceptanceAudit(input: {
  stage3RunDir: string;
  stage4RunDir: string;
  comparisonDir: string;
  stage3RemediateResults: RemediateBenchmarkRow[];
  stage4RemediateResults: RemediateBenchmarkRow[];
  comparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage4AcceptanceAudit {
  const stage4Rows = input.stage4RemediateResults.filter(row => !row.error);
  const stage4ById = new Map(stage4Rows.map(row => [row.id, row]));
  const routeDistribution = new Map<string, number>();
  const skippedReasons: string[] = [];
  const nearPassCases: Stage4NearPassCase[] = [];
  const confidenceRollbackRows = stage4Rows.filter(
    row => (row.structuralConfidenceGuard?.rollbackCount ?? 0) > 0,
  );
  const acceptedConfidenceRegressionFileIds = stage4Rows
    .filter(row =>
      (row.afterScore ?? Number.NEGATIVE_INFINITY) > (row.beforeScore ?? Number.NEGATIVE_INFINITY)
      && confidenceRegressed(
        row.beforeStructuralClassification?.confidence,
        row.reanalyzedStructuralClassification?.confidence ?? row.afterStructuralClassification?.confidence,
      ))
    .map(row => row.id)
    .sort((a, b) => a.localeCompare(b));

  for (const row of stage4Rows) {
    const summary = row.planningSummary;
    if (summary?.primaryRoute) {
      routeDistribution.set(summary.primaryRoute, (routeDistribution.get(summary.primaryRoute) ?? 0) + 1);
    }
    for (const skipped of summary?.skippedTools ?? []) {
      skippedReasons.push(skipped.reason);
    }
    if ((row.beforeScore ?? 0) >= 85) {
      nearPassCases.push({
        id: row.id,
        cohort: row.cohort,
        file: row.file,
        beforeScore: row.beforeScore ?? 0,
        primaryRoute: summary?.primaryRoute ?? null,
        secondaryRoutes: summary?.secondaryRoutes ?? [],
        scheduledTools: summary?.scheduledTools ?? [],
        avoidedStructuralSemanticRoutes: avoidedStructuralSemanticRoutes(summary),
      });
    }
  }

  const stage3SurvivorRoutes: Stage4SurvivorRouteCase[] = input.stage3RemediateResults
    .filter(row => !row.error)
    .map(row => {
      const effective = effectivePostStage3(row);
      const signals = structuralSignals(effective.detectionProfile);
      return {
        row,
        signals,
        pressuredCategories: pressuredCategories(effective.categories, signals),
      };
    })
    .filter(item => item.signals.length > 0 && item.pressuredCategories.length > 0)
    .map(item => {
      const stage4 = stage4ById.get(item.row.id);
      return {
        id: item.row.id,
        cohort: item.row.cohort,
        file: item.row.file,
        primaryRoute: stage4?.planningSummary?.primaryRoute ?? null,
        secondaryRoutes: stage4?.planningSummary?.secondaryRoutes ?? [],
        scheduledTools: stage4?.planningSummary?.scheduledTools ?? [],
        triggeringSignals: stage4?.planningSummary?.triggeringSignals ?? [],
        structuralSignals: item.signals,
        pressuredCategories: item.pressuredCategories,
      };
    })
    .sort((a, b) => a.cohort.localeCompare(b.cohort) || a.id.localeCompare(b.id));

  const cohorts = Object.fromEntries(
    [...new Set(stage4Rows.map(row => row.cohort))]
      .sort((a, b) => a.localeCompare(b))
      .map(cohort => {
        const rows = stage4Rows.filter(row => row.cohort === cohort);
        const routeMap = new Map<string, number>();
        const cohortSkipped: string[] = [];
        for (const row of rows) {
          if (row.planningSummary?.primaryRoute) {
            routeMap.set(
              row.planningSummary.primaryRoute,
              (routeMap.get(row.planningSummary.primaryRoute) ?? 0) + 1,
            );
          }
          for (const skipped of row.planningSummary?.skippedTools ?? []) {
            cohortSkipped.push(skipped.reason);
          }
        }
        const nearPass = nearPassCases.filter(row => row.cohort === cohort);
        const survivorCount = stage3SurvivorRoutes.filter(row => row.cohort === cohort).length;
        return [
          cohort,
          {
            fileCount: rows.length,
            routeDistribution: Object.fromEntries([...routeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
            averageScheduledToolCount: Number(mean(rows.map(row => row.planningSummary?.scheduledTools.length ?? 0)).toFixed(2)),
            averageSkippedToolCount: Number(mean(rows.map(row => row.planningSummary?.skippedTools.length ?? 0)).toFixed(2)),
            skippedReasonFrequency: frequencyRows(cohortSkipped),
            nearPassCount: nearPass.length,
            nearPassAvoidedCount: nearPass.filter(row => row.avoidedStructuralSemanticRoutes).length,
            stage3SurvivorCount: survivorCount,
          } satisfies Stage4CohortAudit,
        ];
      }),
  ) as Record<ExperimentCorpusCohort, Stage4CohortAudit>;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage3RunDir: input.stage3RunDir,
    stage4RunDir: input.stage4RunDir,
    comparisonDir: input.comparisonDir,
    runtime: {
      wallMedianDeltaMs: input.comparison.remediate?.wallMedianDeltaMs ?? null,
      wallP95DeltaMs: input.comparison.remediate?.wallP95DeltaMs ?? null,
      totalMedianDeltaMs: input.comparison.remediate?.totalMedianDeltaMs ?? null,
      totalP95DeltaMs: input.comparison.remediate?.totalP95DeltaMs ?? null,
    },
    summary: {
      stage4FileCount: stage4Rows.length,
      routeDistribution: Object.fromEntries([...routeDistribution.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      averageScheduledToolCount: Number(mean(stage4Rows.map(row => row.planningSummary?.scheduledTools.length ?? 0)).toFixed(2)),
      averageSkippedToolCount: Number(mean(stage4Rows.map(row => row.planningSummary?.skippedTools.length ?? 0)).toFixed(2)),
      skippedReasonFrequency: frequencyRows(skippedReasons),
      nearPassCount: nearPassCases.length,
      nearPassAvoidedCount: nearPassCases.filter(row => row.avoidedStructuralSemanticRoutes).length,
      stage3SurvivorCount: stage3SurvivorRoutes.length,
      stage3SurvivorsWithSpecificRoutes: stage3SurvivorRoutes.filter(row =>
        row.primaryRoute === 'structure_bootstrap' || row.primaryRoute === 'annotation_link_normalization',
      ).length,
      confidenceRegressionRollbackCount: confidenceRollbackRows.reduce(
        (sum, row) => sum + (row.structuralConfidenceGuard?.rollbackCount ?? 0),
        0,
      ),
      filesWithConfidenceRegressionRollback: confidenceRollbackRows.length,
      acceptedConfidenceRegressionCount: acceptedConfidenceRegressionFileIds.length,
      acceptedConfidenceRegressionFileIds,
      scoreMeanDelta: input.comparison.remediate?.afterMeanDelta ?? null,
      reanalyzedMeanDelta: input.comparison.remediate?.reanalyzedMeanDelta ?? null,
    },
    cohorts,
    stage3SurvivorRoutes,
    nearPassCases: nearPassCases.sort((a, b) => a.cohort.localeCompare(b.cohort) || a.id.localeCompare(b.id)),
    comparison: input.comparison,
  };
}

export function renderStage4AcceptanceMarkdown(audit: Stage4AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 4 acceptance audit');
  lines.push('');
  lines.push(`- **Generated:** ${audit.generatedAt}`);
  lines.push(`- **Stage 3 full run:** \`${audit.stage3RunDir}\``);
  lines.push(`- **Stage 4 full run:** \`${audit.stage4RunDir}\``);
  lines.push(`- **Comparison:** \`${audit.comparisonDir}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Stage 4 files:** ${audit.summary.stage4FileCount}`);
  lines.push(`- **Average scheduled tools:** ${audit.summary.averageScheduledToolCount.toFixed(2)}`);
  lines.push(`- **Average skipped tools:** ${audit.summary.averageSkippedToolCount.toFixed(2)}`);
  lines.push(`- **Near-pass files:** ${audit.summary.nearPassCount}`);
  lines.push(`- **Near-pass files avoiding structural/semantic routes:** ${audit.summary.nearPassAvoidedCount}`);
  lines.push(`- **Stage 3 survivor count:** ${audit.summary.stage3SurvivorCount}`);
  lines.push(`- **Stage 3 survivors routed specifically to structure/annotation:** ${audit.summary.stage3SurvivorsWithSpecificRoutes}`);
  lines.push(`- **Structural-confidence rollback count:** ${audit.summary.confidenceRegressionRollbackCount}`);
  lines.push(`- **Files with structural-confidence rollback:** ${audit.summary.filesWithConfidenceRegressionRollback}`);
  lines.push(`- **Accepted score-improving confidence regressions:** ${audit.summary.acceptedConfidenceRegressionCount}`);
  lines.push(`- **Remediation after-score mean delta vs Stage 3:** ${(audit.summary.scoreMeanDelta ?? 0).toFixed(2)}`);
  lines.push(`- **Remediation reanalyzed mean delta vs Stage 3:** ${(audit.summary.reanalyzedMeanDelta ?? 0).toFixed(2)}`);
  lines.push(`- **Remediation wall median delta vs Stage 3:** ${(audit.runtime.wallMedianDeltaMs ?? 0).toFixed(2)} ms`);
  lines.push(`- **Remediation wall p95 delta vs Stage 3:** ${(audit.runtime.wallP95DeltaMs ?? 0).toFixed(2)} ms`);
  if (audit.summary.acceptedConfidenceRegressionFileIds.length > 0) {
    lines.push(`- **Accepted confidence-regression files:** ${audit.summary.acceptedConfidenceRegressionFileIds.join(', ')}`);
  }
  lines.push('');
  lines.push('## Route Distribution');
  lines.push('');
  if (Object.keys(audit.summary.routeDistribution).length === 0) {
    lines.push('- none');
  } else {
    for (const [route, count] of Object.entries(audit.summary.routeDistribution)) {
      lines.push(`- ${route}: ${count}`);
    }
  }
  lines.push('');
  lines.push('## Skipped-Tool Reasons');
  lines.push('');
  if (audit.summary.skippedReasonFrequency.length === 0) {
    lines.push('- none');
  } else {
    for (const row of audit.summary.skippedReasonFrequency) {
      lines.push(`- ${row.key}: ${row.count}`);
    }
  }
  lines.push('');
  lines.push('## Cohorts');
  lines.push('');
  lines.push('| Cohort | Files | Avg scheduled | Avg skipped | Near-pass avoided | Stage 3 survivors | Primary routes |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const [cohort, row] of Object.entries(audit.cohorts)) {
    const routes = Object.entries(row.routeDistribution).map(([route, count]) => `${route}:${count}`).join(', ') || 'none';
    lines.push(`| ${cohort} | ${row.fileCount} | ${row.averageScheduledToolCount.toFixed(2)} | ${row.averageSkippedToolCount.toFixed(2)} | ${row.nearPassAvoidedCount}/${row.nearPassCount} | ${row.stage3SurvivorCount} | ${routes} |`);
  }
  lines.push('');
  lines.push('## Stage 3 Survivor Routes');
  lines.push('');
  lines.push('| File | Cohort | Structural signals | Pressured categories | Stage 4 route | Secondary routes | Scheduled tools |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of audit.stage3SurvivorRoutes) {
    lines.push(`| ${row.id} | ${row.cohort} | ${row.structuralSignals.join(', ') || 'none'} | ${row.pressuredCategories.join(', ') || 'none'} | ${row.primaryRoute ?? 'none'} | ${row.secondaryRoutes.join(', ') || 'none'} | ${row.scheduledTools.join(', ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Near-Pass Routing');
  lines.push('');
  lines.push('| File | Cohort | Before score | Primary route | Secondary routes | Avoided structural/semantic routes |');
  lines.push('| --- | --- | ---: | --- | --- | --- |');
  for (const row of audit.nearPassCases) {
    lines.push(`| ${row.id} | ${row.cohort} | ${row.beforeScore.toFixed(2)} | ${row.primaryRoute ?? 'none'} | ${row.secondaryRoutes.join(', ') || 'none'} | ${row.avoidedStructuralSemanticRoutes ? 'yes' : 'no'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeStage4AcceptanceArtifacts(
  outDir: string,
  audit: Stage4AcceptanceAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage4-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage4-acceptance.md'), renderStage4AcceptanceMarkdown(audit), 'utf8');
}

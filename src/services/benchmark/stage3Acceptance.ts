import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  AnalyzeBenchmarkRow,
  ExperimentCorpusCohort,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { BenchmarkComparison } from './compareRuns.js';
import type { CategoryKey, DetectionProfile, ScoredCategory } from '../../types.js';

export interface Stage3PressureSnapshot {
  available: boolean;
  pressured: boolean;
  categoryScores: Partial<Record<'reading_order' | 'pdf_ua_compliance' | 'table_markup', number>>;
  highScoreCategories: CategoryKey[];
  meaningfulHighScoreCategories: CategoryKey[];
  signalFamilies: string[];
  pressureReasons: string[];
}

export interface Stage3AcceptanceCase {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  sourceType: AnalyzeBenchmarkRow['sourceType'];
  intent: string;
  notes?: string;
  analyze: Stage3PressureSnapshot;
  postRemediation: Stage3PressureSnapshot;
  clearedByRemediation: boolean;
  stillPressuredAfterRemediation: boolean;
}

export interface Stage3CohortAudit {
  analyzePressureCount: number;
  analyzeMeaningfulPressureCount: number;
  postRemediationPressureCount: number;
  postRemediationMeaningfulPressureCount: number;
  clearedByRemediationCount: number;
  signalFamilyFrequency: Array<FrequencyRow>;
  affectedCategoryFrequency: Array<FrequencyRow>;
}

export interface Stage3AcceptanceAudit {
  generatedAt: string;
  analyzeRunDir: string;
  fullRunDir: string;
  analyzeComparisonDir: string;
  fullComparisonDir: string;
  summary: {
    analyzePressureCount: number;
    analyzeMeaningfulPressureCount: number;
    postRemediationPressureCount: number;
    postRemediationMeaningfulPressureCount: number;
    clearedByRemediationCount: number;
    stillPressuredAfterRemediationCount: number;
    calibrationNeeded: boolean;
    calibrationCandidateCount: number;
    calibrationCandidates: string[];
    cohortPressureCounts: Record<ExperimentCorpusCohort, number>;
  };
  runtime: {
    analyzeMedianDeltaMs: number;
    analyzeP95DeltaMs: number;
    fullWallMedianDeltaMs: number | null;
    fullWallP95DeltaMs: number | null;
    fullTotalMedianDeltaMs: number | null;
    fullTotalP95DeltaMs: number | null;
  };
  comparisons: {
    analyze: BenchmarkComparison;
    full: BenchmarkComparison;
  };
  cohorts: Record<ExperimentCorpusCohort, Stage3CohortAudit>;
  cases: Stage3AcceptanceCase[];
  calibrationCandidates: Stage3AcceptanceCase[];
}

const STRUCTURAL_CATEGORY_THRESHOLDS = {
  reading_order: 90,
  pdf_ua_compliance: 90,
  table_markup: 90,
} as const;

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function structuralCategoryScores(categories: ScoredCategory[] | undefined): Stage3PressureSnapshot['categoryScores'] {
  const scoreFor = (key: CategoryKey): number | undefined =>
    categories?.find(category => category.key === key)?.score;
  return {
    reading_order: scoreFor('reading_order'),
    pdf_ua_compliance: scoreFor('pdf_ua_compliance'),
    table_markup: scoreFor('table_markup'),
  };
}

function pushSignal(
  signals: string[],
  reasons: string[],
  active: boolean,
  key: string,
  reason: string,
): void {
  if (!active) return;
  signals.push(key);
  reasons.push(reason);
}

function signalFamilies(profile?: DetectionProfile): string[] {
  if (!profile) return [];
  const signals: string[] = [];
  const reasons: string[] = [];
  pushSignal(
    signals,
    reasons,
    profile.readingOrderSignals.sampledStructurePageOrderDriftCount > 0,
    'reading_order_sampled_drift',
    `${profile.readingOrderSignals.sampledStructurePageOrderDriftCount} sampled reading-order drift event(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.readingOrderSignals.annotationStructParentRiskCount > 0,
    'annotation_struct_parent_risk',
    `${profile.readingOrderSignals.annotationStructParentRiskCount} annotation /StructParent risk(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.readingOrderSignals.annotationOrderRiskCount > 0,
    'annotation_order_risk',
    `${profile.readingOrderSignals.annotationOrderRiskCount} annotation order risk page(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.pdfUaSignals.orphanMcidCount > 0,
    'orphan_mcids',
    `${profile.pdfUaSignals.orphanMcidCount} orphan MCID(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.pdfUaSignals.suspectedPathPaintOutsideMc > 0,
    'tagged_content_paint',
    `${profile.pdfUaSignals.suspectedPathPaintOutsideMc} suspected path-paint operator(s) outside marked content`,
  );
  pushSignal(
    signals,
    reasons,
    profile.listSignals.listItemMisplacedCount > 0,
    'list_item_misplaced',
    `${profile.listSignals.listItemMisplacedCount} misplaced LI element(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.listSignals.lblBodyMisplacedCount > 0,
    'lbl_body_misplaced',
    `${profile.listSignals.lblBodyMisplacedCount} misplaced Lbl/LBody element(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.listSignals.listsWithoutItems > 0,
    'lists_without_items',
    `${profile.listSignals.listsWithoutItems} list(s) without direct LI children`,
  );
  pushSignal(
    signals,
    reasons,
    profile.tableSignals.irregularTableCount > 0,
    'irregular_tables',
    `${profile.tableSignals.irregularTableCount} irregular table(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.tableSignals.stronglyIrregularTableCount > 0,
    'strongly_irregular_tables',
    `${profile.tableSignals.stronglyIrregularTableCount} strongly irregular table(s)`,
  );
  pushSignal(
    signals,
    reasons,
    profile.tableSignals.directCellUnderTableCount > 0,
    'direct_cell_under_table',
    `${profile.tableSignals.directCellUnderTableCount} table cell(s) directly under /Table`,
  );
  return [...new Set(signals)];
}

function pressureReasons(profile?: DetectionProfile): string[] {
  if (!profile) return [];
  const reasons: string[] = [];
  pushSignal(
    [],
    reasons,
    profile.readingOrderSignals.sampledStructurePageOrderDriftCount > 0,
    '',
    `${profile.readingOrderSignals.sampledStructurePageOrderDriftCount} sampled reading-order drift event(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.readingOrderSignals.annotationStructParentRiskCount > 0,
    '',
    `${profile.readingOrderSignals.annotationStructParentRiskCount} annotation /StructParent risk(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.readingOrderSignals.annotationOrderRiskCount > 0,
    '',
    `${profile.readingOrderSignals.annotationOrderRiskCount} annotation-order risk page(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.pdfUaSignals.orphanMcidCount > 0,
    '',
    `${profile.pdfUaSignals.orphanMcidCount} orphan MCID(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.pdfUaSignals.suspectedPathPaintOutsideMc > 0,
    '',
    `${profile.pdfUaSignals.suspectedPathPaintOutsideMc} suspected path-paint operator(s) outside marked content`,
  );
  pushSignal(
    [],
    reasons,
    profile.listSignals.listItemMisplacedCount > 0,
    '',
    `${profile.listSignals.listItemMisplacedCount} misplaced LI element(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.listSignals.lblBodyMisplacedCount > 0,
    '',
    `${profile.listSignals.lblBodyMisplacedCount} misplaced Lbl/LBody element(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.listSignals.listsWithoutItems > 0,
    '',
    `${profile.listSignals.listsWithoutItems} list(s) without direct LI children`,
  );
  pushSignal(
    [],
    reasons,
    profile.tableSignals.irregularTableCount > 0,
    '',
    `${profile.tableSignals.irregularTableCount} irregular table(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.tableSignals.stronglyIrregularTableCount > 0,
    '',
    `${profile.tableSignals.stronglyIrregularTableCount} strongly irregular table(s)`,
  );
  pushSignal(
    [],
    reasons,
    profile.tableSignals.directCellUnderTableCount > 0,
    '',
    `${profile.tableSignals.directCellUnderTableCount} table cell(s) directly under /Table`,
  );
  return reasons;
}

function highScoreCategories(
  scores: Stage3PressureSnapshot['categoryScores'],
  profile?: DetectionProfile,
): CategoryKey[] {
  const out: CategoryKey[] = [];
  if ((scores.reading_order ?? -1) >= STRUCTURAL_CATEGORY_THRESHOLDS.reading_order) {
    out.push('reading_order');
  }
  if ((scores.pdf_ua_compliance ?? -1) >= STRUCTURAL_CATEGORY_THRESHOLDS.pdf_ua_compliance) {
    out.push('pdf_ua_compliance');
  }
  const tableSignalsPresent =
    (profile?.tableSignals.irregularTableCount ?? 0) > 0 ||
    (profile?.tableSignals.stronglyIrregularTableCount ?? 0) > 0 ||
    (profile?.tableSignals.directCellUnderTableCount ?? 0) > 0;
  if (
    tableSignalsPresent &&
    (scores.table_markup ?? -1) >= STRUCTURAL_CATEGORY_THRESHOLDS.table_markup
  ) {
    out.push('table_markup');
  }
  return out;
}

function meaningfulHighScoreCategories(
  scores: Stage3PressureSnapshot['categoryScores'],
  profile?: DetectionProfile,
): CategoryKey[] {
  if (!profile) return [];
  const out: CategoryKey[] = [];
  const roSignals =
    profile.readingOrderSignals.missingStructureTree ||
    profile.readingOrderSignals.annotationOrderRiskCount > 0 ||
    profile.readingOrderSignals.annotationStructParentRiskCount > 0 ||
    profile.readingOrderSignals.sampledStructurePageOrderDriftCount > 0 ||
    profile.readingOrderSignals.multiColumnOrderRiskPages > 0 ||
    profile.readingOrderSignals.headerFooterPollutionRisk;
  if (roSignals && (scores.reading_order ?? -1) >= STRUCTURAL_CATEGORY_THRESHOLDS.reading_order) {
    out.push('reading_order');
  }
  const pdfUaSignals =
    profile.pdfUaSignals.orphanMcidCount > 0 ||
    profile.pdfUaSignals.suspectedPathPaintOutsideMc > 0 ||
    profile.listSignals.listItemMisplacedCount > 0 ||
    profile.listSignals.lblBodyMisplacedCount > 0 ||
    profile.listSignals.listsWithoutItems > 0 ||
    profile.annotationSignals.linkAnnotationsMissingStructure > 0 ||
    profile.annotationSignals.nonLinkAnnotationsMissingStructure > 0;
  if (
    pdfUaSignals &&
    (scores.pdf_ua_compliance ?? -1) >= STRUCTURAL_CATEGORY_THRESHOLDS.pdf_ua_compliance
  ) {
    out.push('pdf_ua_compliance');
  }
  const tableSignals =
    profile.tableSignals.irregularTableCount > 0 ||
    profile.tableSignals.stronglyIrregularTableCount > 0 ||
    profile.tableSignals.directCellUnderTableCount > 0;
  if (
    tableSignals &&
    (scores.table_markup ?? -1) >= STRUCTURAL_CATEGORY_THRESHOLDS.table_markup
  ) {
    out.push('table_markup');
  }
  return out;
}

function makePressureSnapshot(input: {
  categories?: ScoredCategory[];
  detectionProfile?: DetectionProfile | null;
}): Stage3PressureSnapshot {
  const scores = structuralCategoryScores(input.categories);
  const signals = signalFamilies(input.detectionProfile ?? undefined);
  const high = highScoreCategories(scores, input.detectionProfile ?? undefined);
  const meaningful = meaningfulHighScoreCategories(scores, input.detectionProfile ?? undefined);
  return {
    available: Boolean(input.categories),
    pressured: signals.length > 0 && high.length > 0,
    categoryScores: scores,
    highScoreCategories: high,
    meaningfulHighScoreCategories: meaningful,
    signalFamilies: signals,
    pressureReasons: pressureReasons(input.detectionProfile ?? undefined),
  };
}

function effectivePostRemediationSnapshot(
  row: RemediateBenchmarkRow | undefined,
): Stage3PressureSnapshot {
  if (!row) {
    return {
      available: false,
      pressured: false,
      categoryScores: {},
      highScoreCategories: [],
      meaningfulHighScoreCategories: [],
      signalFamilies: [],
      pressureReasons: [],
    };
  }
  const useReanalyzed = (row.reanalyzedCategories?.length ?? 0) > 0;
  return makePressureSnapshot({
    categories: useReanalyzed ? row.reanalyzedCategories : row.afterCategories,
    detectionProfile: useReanalyzed
      ? row.reanalyzedDetectionProfile ?? row.afterDetectionProfile
      : row.afterDetectionProfile,
  });
}

function casesByCohort(cases: Stage3AcceptanceCase[], cohort: ExperimentCorpusCohort): Stage3CohortAudit {
  const cohortCases = cases.filter(auditCase => auditCase.cohort === cohort);
  return {
    analyzePressureCount: cohortCases.filter(auditCase => auditCase.analyze.pressured).length,
    analyzeMeaningfulPressureCount: cohortCases.filter(
      auditCase => auditCase.analyze.meaningfulHighScoreCategories.length > 0,
    ).length,
    postRemediationPressureCount: cohortCases.filter(
      auditCase => auditCase.postRemediation.pressured,
    ).length,
    postRemediationMeaningfulPressureCount: cohortCases.filter(
      auditCase => auditCase.postRemediation.meaningfulHighScoreCategories.length > 0,
    ).length,
    clearedByRemediationCount: cohortCases.filter(auditCase => auditCase.clearedByRemediation).length,
    signalFamilyFrequency: frequencyRows(
      cohortCases.flatMap(auditCase => auditCase.analyze.signalFamilies),
    ),
    affectedCategoryFrequency: frequencyRows(
      cohortCases.flatMap(auditCase => auditCase.analyze.meaningfulHighScoreCategories),
    ),
  };
}

export function buildStage3AcceptanceAudit(input: {
  analyzeRunDir: string;
  fullRunDir: string;
  analyzeComparisonDir: string;
  fullComparisonDir: string;
  analyzeResults: AnalyzeBenchmarkRow[];
  remediateResults: RemediateBenchmarkRow[];
  analyzeComparison: BenchmarkComparison;
  fullComparison: BenchmarkComparison;
  generatedAt?: string;
}): Stage3AcceptanceAudit {
  const remediationById = new Map(input.remediateResults.map(row => [row.id, row]));
  const cases = input.analyzeResults
    .filter(row => !row.error)
    .map((row): Stage3AcceptanceCase => {
      const remediationRow = remediationById.get(row.id);
      const analyze = makePressureSnapshot({
        categories: row.categories,
        detectionProfile: row.detectionProfile,
      });
      const postRemediation = effectivePostRemediationSnapshot(remediationRow);
      return {
        id: row.id,
        file: row.file,
        cohort: row.cohort,
        sourceType: row.sourceType,
        intent: row.intent,
        ...(row.notes ? { notes: row.notes } : {}),
        analyze,
        postRemediation,
        clearedByRemediation: analyze.pressured && !postRemediation.pressured,
        stillPressuredAfterRemediation: analyze.pressured && postRemediation.pressured,
      };
    })
    .sort((a, b) => a.cohort.localeCompare(b.cohort) || a.id.localeCompare(b.id));

  const calibrationCandidates = cases.filter(
    auditCase =>
      auditCase.postRemediation.meaningfulHighScoreCategories.length > 0 ||
      (!auditCase.postRemediation.available &&
        auditCase.analyze.meaningfulHighScoreCategories.length > 0),
  );

  const cohorts = Object.fromEntries(
    ([
      '00-fixtures',
      '10-short-near-pass',
      '20-figure-ownership',
      '30-structure-reading-order',
      '40-font-extractability',
      '50-long-report-mixed',
    ] satisfies ExperimentCorpusCohort[]).map(cohort => [cohort, casesByCohort(cases, cohort)]),
  ) as Record<ExperimentCorpusCohort, Stage3CohortAudit>;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    analyzeRunDir: input.analyzeRunDir,
    fullRunDir: input.fullRunDir,
    analyzeComparisonDir: input.analyzeComparisonDir,
    fullComparisonDir: input.fullComparisonDir,
    summary: {
      analyzePressureCount: cases.filter(auditCase => auditCase.analyze.pressured).length,
      analyzeMeaningfulPressureCount: cases.filter(
        auditCase => auditCase.analyze.meaningfulHighScoreCategories.length > 0,
      ).length,
      postRemediationPressureCount: cases.filter(
        auditCase => auditCase.postRemediation.pressured,
      ).length,
      postRemediationMeaningfulPressureCount: cases.filter(
        auditCase => auditCase.postRemediation.meaningfulHighScoreCategories.length > 0,
      ).length,
      clearedByRemediationCount: cases.filter(auditCase => auditCase.clearedByRemediation).length,
      stillPressuredAfterRemediationCount: cases.filter(
        auditCase => auditCase.stillPressuredAfterRemediation,
      ).length,
      calibrationNeeded: calibrationCandidates.length > 0,
      calibrationCandidateCount: calibrationCandidates.length,
      calibrationCandidates: calibrationCandidates.map(auditCase => auditCase.id),
      cohortPressureCounts: Object.fromEntries(
        Object.entries(cohorts).map(([cohort, audit]) => [cohort, audit.analyzePressureCount]),
      ) as Record<ExperimentCorpusCohort, number>,
    },
    runtime: {
      analyzeMedianDeltaMs: input.analyzeComparison.analyze.runtimeMedianDeltaMs,
      analyzeP95DeltaMs: input.analyzeComparison.analyze.runtimeP95DeltaMs,
      fullWallMedianDeltaMs: input.fullComparison.remediate?.wallMedianDeltaMs ?? null,
      fullWallP95DeltaMs: input.fullComparison.remediate?.wallP95DeltaMs ?? null,
      fullTotalMedianDeltaMs: input.fullComparison.remediate?.totalMedianDeltaMs ?? null,
      fullTotalP95DeltaMs: input.fullComparison.remediate?.totalP95DeltaMs ?? null,
    },
    comparisons: {
      analyze: input.analyzeComparison,
      full: input.fullComparison,
    },
    cohorts,
    cases,
    calibrationCandidates,
  };
}

function markdownList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

export function renderStage3AcceptanceMarkdown(audit: Stage3AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 3 acceptance audit');
  lines.push('');
  lines.push(`- **Generated:** ${audit.generatedAt}`);
  lines.push(`- **Analyze run:** \`${audit.analyzeRunDir}\``);
  lines.push(`- **Full run:** \`${audit.fullRunDir}\``);
  lines.push(`- **Analyze comparison:** \`${audit.analyzeComparisonDir}\``);
  lines.push(`- **Full comparison:** \`${audit.fullComparisonDir}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Analyze false-clean pressure count:** ${audit.summary.analyzePressureCount}`);
  lines.push(`- **Analyze meaningful survivors:** ${audit.summary.analyzeMeaningfulPressureCount}`);
  lines.push(`- **Post-remediation false-clean pressure count:** ${audit.summary.postRemediationPressureCount}`);
  lines.push(`- **Post-remediation meaningful survivors:** ${audit.summary.postRemediationMeaningfulPressureCount}`);
  lines.push(`- **Cleared by remediation:** ${audit.summary.clearedByRemediationCount}`);
  lines.push(`- **Still pressured after remediation:** ${audit.summary.stillPressuredAfterRemediationCount}`);
  lines.push(`- **Calibration needed:** ${audit.summary.calibrationNeeded ? 'yes' : 'no'}`);
  lines.push(`- **Calibration candidates:** ${markdownList(audit.summary.calibrationCandidates)}`);
  lines.push(`- **Analyze runtime delta:** median ${audit.runtime.analyzeMedianDeltaMs.toFixed(2)} ms, p95 ${audit.runtime.analyzeP95DeltaMs.toFixed(2)} ms`);
  if (audit.runtime.fullWallMedianDeltaMs !== null && audit.runtime.fullWallP95DeltaMs !== null) {
    lines.push(`- **Full remediation runtime delta:** wall median ${audit.runtime.fullWallMedianDeltaMs.toFixed(2)} ms, wall p95 ${audit.runtime.fullWallP95DeltaMs.toFixed(2)} ms`);
  }
  lines.push('');
  lines.push('## Cohorts');
  lines.push('');
  lines.push('| Cohort | Analyze pressure | Meaningful survivors | Post pressure | Cleared | Signals | Affected categories |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const [cohort, summary] of Object.entries(audit.cohorts)) {
    lines.push(
      `| ${cohort} | ${summary.analyzePressureCount} | ${summary.analyzeMeaningfulPressureCount} | ${summary.postRemediationPressureCount} | ${summary.clearedByRemediationCount} | ${summary.signalFamilyFrequency.map(row => `${row.key}:${row.count}`).join('; ') || 'none'} | ${summary.affectedCategoryFrequency.map(row => `${row.key}:${row.count}`).join('; ') || 'none'} |`,
    );
  }
  lines.push('');
  lines.push('## Calibration Candidates');
  lines.push('');
  if (audit.calibrationCandidates.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| File | Cohort | Analyze high-score categories | Post-remediation high-score categories | Signals | Reasons |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const auditCase of audit.calibrationCandidates) {
      lines.push(
        `| ${auditCase.id} | ${auditCase.cohort} | ${markdownList(auditCase.analyze.meaningfulHighScoreCategories)} | ${markdownList(auditCase.postRemediation.meaningfulHighScoreCategories)} | ${markdownList(auditCase.analyze.signalFamilies)} | ${markdownList(auditCase.analyze.pressureReasons)} |`,
      );
    }
  }
  lines.push('');
  lines.push('## File-Level Cases');
  lines.push('');
  lines.push('| File | Cohort | Analyze pressure | Analyze categories | Post-remediation pressure | Post categories | Cleared |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const auditCase of audit.cases) {
    lines.push(
      `| ${auditCase.id} | ${auditCase.cohort} | ${auditCase.analyze.pressured ? 'yes' : 'no'} | ${markdownList(auditCase.analyze.highScoreCategories)} | ${auditCase.postRemediation.pressured ? 'yes' : 'no'} | ${markdownList(auditCase.postRemediation.highScoreCategories)} | ${auditCase.clearedByRemediation ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeStage3AcceptanceArtifacts(
  outDir: string,
  audit: Stage3AcceptanceAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage3-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage3-acceptance.md'), renderStage3AcceptanceMarkdown(audit), 'utf8');
}

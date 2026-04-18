import { access, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  DetectionProfile,
  FailureProfile,
  OcrPipelineSummary,
  PlanningSummary,
  RemediationRuntimeSummary,
  RemediationOutcomeSummary,
  RemediationRoundSummary,
  ScoreCapApplied,
  SemanticRemediationSummary,
  SemanticLaneRuntimeSummary,
  StructuralConfidenceGuardSummary,
  StructuralClassification,
  VerificationLevel,
} from '../../types.js';

export const EXPERIMENT_CORPUS_COHORTS = [
  '00-fixtures',
  '10-short-near-pass',
  '20-figure-ownership',
  '30-structure-reading-order',
  '40-font-extractability',
  '50-long-report-mixed',
] as const;

export type ExperimentCorpusCohort = (typeof EXPERIMENT_CORPUS_COHORTS)[number];
export type ExperimentCorpusSourceType = 'fixture' | 'original' | 'remediated_checkpoint';

export interface ExperimentCorpusManifestEntry {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  sourceType: ExperimentCorpusSourceType;
  intent: string;
  notes?: string;
}

export interface ExperimentCorpusEntry extends ExperimentCorpusManifestEntry {
  absolutePath: string;
  filename: string;
}

export interface AnalyzeBenchmarkRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  sourceType: ExperimentCorpusSourceType;
  intent: string;
  notes?: string;
  score: number | null;
  grade: string | null;
  pdfClass: string | null;
  pageCount: number | null;
  categories: AnalysisResult['categories'];
  findings: AnalysisResult['findings'];
  analysisDurationMs: number | null;
  wallAnalyzeMs: number | null;
  verificationLevel?: VerificationLevel;
  manualReviewRequired?: boolean;
  manualReviewReasons?: string[];
  scoreCapsApplied?: ScoreCapApplied[];
  structuralClassification?: StructuralClassification;
  failureProfile?: FailureProfile;
  detectionProfile?: DetectionProfile;
  error?: string;
}

export interface RemediateBenchmarkRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  sourceType: ExperimentCorpusSourceType;
  intent: string;
  notes?: string;
  beforeScore: number | null;
  beforeGrade: string | null;
  beforePdfClass: string | null;
  beforeCategories?: AnalysisResult['categories'];
  beforeVerificationLevel?: VerificationLevel | null;
  beforeManualReviewRequired?: boolean | null;
  beforeManualReviewReasons?: string[];
  beforeScoreCapsApplied?: ScoreCapApplied[];
  beforeStructuralClassification?: StructuralClassification | null;
  beforeFailureProfile?: FailureProfile | null;
  beforeDetectionProfile?: DetectionProfile | null;
  afterScore: number | null;
  afterGrade: string | null;
  afterPdfClass: string | null;
  afterCategories?: AnalysisResult['categories'];
  afterVerificationLevel?: VerificationLevel | null;
  afterManualReviewRequired?: boolean | null;
  afterManualReviewReasons?: string[];
  afterScoreCapsApplied?: ScoreCapApplied[];
  afterStructuralClassification?: StructuralClassification | null;
  afterFailureProfile?: FailureProfile | null;
  afterDetectionProfile?: DetectionProfile | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  reanalyzedPdfClass: string | null;
  reanalyzedCategories?: AnalysisResult['categories'];
  reanalyzedVerificationLevel?: VerificationLevel | null;
  reanalyzedManualReviewRequired?: boolean | null;
  reanalyzedManualReviewReasons?: string[];
  reanalyzedScoreCapsApplied?: ScoreCapApplied[];
  reanalyzedStructuralClassification?: StructuralClassification | null;
  reanalyzedFailureProfile?: FailureProfile | null;
  reanalyzedDetectionProfile?: DetectionProfile | null;
  planningSummary?: PlanningSummary | null;
  delta: number | null;
  appliedTools: AppliedRemediationTool[];
  rounds: RemediationRoundSummary[];
  ocrPipeline?: OcrPipelineSummary;
  structuralConfidenceGuard?: StructuralConfidenceGuardSummary;
  remediationOutcomeSummary?: RemediationOutcomeSummary;
  runtimeSummary?: RemediationRuntimeSummary;
  semantic?: SemanticRemediationSummary;
  semanticHeadings?: SemanticRemediationSummary;
  semanticPromoteHeadings?: SemanticRemediationSummary;
  semanticUntaggedHeadings?: SemanticRemediationSummary;
  analysisBeforeMs: number | null;
  remediationDurationMs: number | null;
  wallRemediateMs: number | null;
  analysisAfterMs: number | null;
  totalPipelineMs: number | null;
  error?: string;
}

export interface BenchmarkRunSummary {
  runId: string;
  generatedAt: string;
  mode: 'analyze' | 'remediate' | 'full';
  semanticEnabled: boolean;
  writePdfs: boolean;
  selectedFileIds: string[];
  counts: {
    manifestEntries: number;
    selectedEntries: number;
    analyzeSuccess: number;
    analyzeErrors: number;
    remediateSuccess: number;
    remediateErrors: number;
  };
  analyze: {
    score: SummaryStats;
    analysisDurationMs: SummaryStats;
    wallAnalyzeMs: SummaryStats;
    gradeDistribution: Record<string, number>;
    pdfClassDistribution: Record<string, number>;
    structureClassDistribution: Record<string, number>;
    primaryFailureFamilyDistribution: Record<string, number>;
    weakestCategories: Array<FrequencyRow>;
    topFindingMessages: Array<FrequencyRow>;
    manualReviewReasonFrequency: Array<FrequencyRow>;
    categoryManualReviewFrequency: Array<FrequencyRow>;
    categoryVerificationLevels: Record<string, Record<string, number>>;
    deterministicIssueFrequency: Array<FrequencyRow>;
    semanticIssueFrequency: Array<FrequencyRow>;
    manualOnlyIssueFrequency: Array<FrequencyRow>;
    readingOrderSignalFrequency: Array<FrequencyRow>;
    annotationSignalFrequency: Array<FrequencyRow>;
    taggedContentSignalFrequency: Array<FrequencyRow>;
    listTableSignalFrequency: Array<FrequencyRow>;
    manualReviewRequiredCount: number;
    scoreCapsByCategory: Array<FrequencyRow>;
    topSlowestAnalyzeFiles: Array<FileMetricRow>;
  };
  remediate: {
    beforeScore: SummaryStats;
    afterScore: SummaryStats;
    reanalyzedScore: SummaryStats;
    delta: SummaryStats;
    remediationDurationMs: SummaryStats;
    wallRemediateMs: SummaryStats;
    analysisAfterMs: SummaryStats;
    totalPipelineMs: SummaryStats;
    gradeDistributionBefore: Record<string, number>;
    gradeDistributionAfter: Record<string, number>;
    gradeDistributionReanalyzed: Record<string, number>;
    pdfClassDistributionBefore: Record<string, number>;
    pdfClassDistributionAfter: Record<string, number>;
    pdfClassDistributionReanalyzed: Record<string, number>;
    beforeManualReviewRequiredCount: number;
    afterManualReviewRequiredCount: number;
    reanalyzedManualReviewRequiredCount: number;
    afterManualReviewReasonFrequency: Array<FrequencyRow>;
    afterCategoryManualReviewFrequency: Array<FrequencyRow>;
    afterCategoryVerificationLevels: Record<string, Record<string, number>>;
    afterScoreCapsByCategory: Array<FrequencyRow>;
    primaryRouteDistribution: Record<string, number>;
    skippedToolReasonFrequency: Array<FrequencyRow>;
    scheduledToolFrequency: Array<FrequencyRow>;
    outcomeStatusDistribution: Record<string, number>;
    outcomeFamilyStatusFrequency: Array<FrequencyRow>;
    semanticLaneUsageFrequency: Array<FrequencyRow>;
    semanticLaneSkipReasonFrequency: Array<FrequencyRow>;
    semanticLaneChangeStatusFrequency: Array<FrequencyRow>;
    stageRuntimeFrequency: Array<RuntimeAggregateRow>;
    toolRuntimeFrequency: Array<RuntimeAggregateRow>;
    semanticLaneRuntimeFrequency: Array<RuntimeAggregateRow>;
    semanticOutcomeRuntimeFrequency: Array<RuntimeAggregateRow>;
    boundedWorkFrequency: Array<FrequencyRow>;
    costBenefit: CostBenefitSummary;
    topSlowestRemediateFiles: Array<FileMetricRow>;
    topHighestDeltaFiles: Array<FileDeltaRow>;
    topLowestDeltaFiles: Array<FileDeltaRow>;
  } | null;
  cohorts: Record<string, CohortSummary>;
}

export interface SummaryStats {
  count: number;
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

export interface RuntimeAggregateRow {
  key: string;
  count: number;
  totalMs: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface CostBenefitSummary {
  scoreDeltaPerSecond: number | null;
  confidenceDeltaPerSecond: number | null;
}

export interface FrequencyRow {
  key: string;
  count: number;
}

export interface FileMetricRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  metricMs: number;
}

export interface FileDeltaRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  delta: number;
  beforeScore: number | null;
  afterScore: number | null;
  reanalyzedScore: number | null;
}

export interface CohortSummary {
  fileCount: number;
  analyzeSuccess: number;
  analyzeErrors: number;
  remediateSuccess: number;
  remediateErrors: number;
  analyzeScore: SummaryStats;
  analyzeDurationMs: SummaryStats;
  wallAnalyzeMs: SummaryStats;
  remediationDelta: SummaryStats;
  remediationDurationMs: SummaryStats;
  wallRemediateMs: SummaryStats;
  totalPipelineMs: SummaryStats;
  costBenefit: CostBenefitSummary;
  weakestCategories: Array<FrequencyRow>;
  topFindingMessages: Array<FrequencyRow>;
  manualReviewReasonFrequency: Array<FrequencyRow>;
  categoryManualReviewFrequency: Array<FrequencyRow>;
  categoryVerificationLevels: Record<string, Record<string, number>>;
  structureClassDistribution: Record<string, number>;
  primaryFailureFamilyDistribution: Record<string, number>;
  deterministicIssueFrequency: Array<FrequencyRow>;
  semanticIssueFrequency: Array<FrequencyRow>;
  manualOnlyIssueFrequency: Array<FrequencyRow>;
  readingOrderSignalFrequency: Array<FrequencyRow>;
  annotationSignalFrequency: Array<FrequencyRow>;
  taggedContentSignalFrequency: Array<FrequencyRow>;
  listTableSignalFrequency: Array<FrequencyRow>;
  manualReviewRequiredCount: number;
  scoreCapsByCategory: Array<FrequencyRow>;
}

export interface ManifestSnapshot {
  runId: string;
  generatedAt: string;
  manifestPath: string;
  corpusRoot: string;
  mode: 'analyze' | 'remediate' | 'full';
  semanticEnabled: boolean;
  writePdfs: boolean;
  selectedEntries: ExperimentCorpusManifestEntry[];
}

export interface BenchmarkArtifactBundle {
  manifest: ManifestSnapshot;
  analyzeResults: AnalyzeBenchmarkRow[];
  remediateResults: RemediateBenchmarkRow[];
  summary: BenchmarkRunSummary;
}

export interface BenchmarkValidationResult {
  ok: boolean;
  errors: string[];
}

const KNOWN_COHORT_SET = new Set<string>(EXPERIMENT_CORPUS_COHORTS);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function loadExperimentCorpusManifest(
  manifestPath: string,
  options?: { checkFiles?: boolean },
): Promise<ExperimentCorpusEntry[]> {
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  return validateExperimentCorpusManifest(raw, {
    corpusRoot: dirname(manifestPath),
    checkFiles: options?.checkFiles ?? true,
  });
}

export async function validateExperimentCorpusManifest(
  raw: unknown,
  options: { corpusRoot: string; checkFiles?: boolean },
): Promise<ExperimentCorpusEntry[]> {
  if (!Array.isArray(raw)) {
    throw new Error('Experiment corpus manifest must be a JSON array.');
  }

  const entries: ExperimentCorpusEntry[] = [];
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  const checkFiles = options.checkFiles ?? true;

  for (const [index, item] of raw.entries()) {
    const obj = asObject(item);
    if (!obj) throw new Error(`Manifest entry ${index} must be an object.`);

    const id = String(obj['id'] ?? '').trim();
    const file = String(obj['file'] ?? '').trim();
    const cohort = String(obj['cohort'] ?? '').trim();
    const sourceType = String(obj['sourceType'] ?? '').trim();
    const intent = String(obj['intent'] ?? '').trim();
    const notesRaw = obj['notes'];
    const notes = typeof notesRaw === 'string' && notesRaw.trim() ? notesRaw.trim() : undefined;

    if (!id) throw new Error(`Manifest entry ${index} is missing id.`);
    if (!file) throw new Error(`Manifest entry ${id} is missing file.`);
    if (!KNOWN_COHORT_SET.has(cohort)) {
      throw new Error(`Manifest entry ${id} has unknown cohort "${cohort}".`);
    }
    if (!['fixture', 'original', 'remediated_checkpoint'].includes(sourceType)) {
      throw new Error(`Manifest entry ${id} has unknown sourceType "${sourceType}".`);
    }
    if (!intent) throw new Error(`Manifest entry ${id} is missing intent.`);
    if (seenIds.has(id)) throw new Error(`Manifest contains duplicate id "${id}".`);
    if (seenFiles.has(file)) throw new Error(`Manifest contains duplicate file "${file}".`);
    seenIds.add(id);
    seenFiles.add(file);

    const absolutePath = resolve(options.corpusRoot, file);
    if (checkFiles) {
      try {
        await access(absolutePath);
      } catch {
        throw new Error(`Manifest entry ${id} points to missing file "${absolutePath}".`);
      }
    }
    entries.push({
      id,
      file,
      cohort: cohort as ExperimentCorpusCohort,
      sourceType: sourceType as ExperimentCorpusSourceType,
      intent,
      ...(notes ? { notes } : {}),
      absolutePath,
      filename: file.split('/').pop() ?? file,
    });
  }

  if (entries.length !== 50) {
    throw new Error(`Experiment corpus manifest must resolve exactly 50 entries, got ${entries.length}.`);
  }

  return entries;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}

export function summarizeStats(values: number[]): SummaryStats {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: mean(sorted),
    median: median(sorted),
    p95: percentile(sorted, 95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function frequencyRows(values: string[], limit = 10): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function distribution(values: Array<string | null | undefined>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function weakestCategoryKeys(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  const applicable = row.categories.filter(category => category.applicable);
  if (applicable.length === 0) return [];
  const minScore = Math.min(...applicable.map(category => category.score));
  return applicable
    .filter(category => category.score === minScore)
    .map(category => category.key);
}

function topFindingMessages(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.findings.map(finding => finding.message);
}

function manualReviewReasons(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.manualReviewReasons ?? [];
}

function categoryManualReviewKeys(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.categories
    .filter(category => category.manualReviewRequired)
    .map(category => category.key);
}

function categoryVerificationCounts(
  rows: AnalyzeBenchmarkRow[],
): Record<string, Record<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.error) continue;
    for (const category of row.categories) {
      const categoryKey = category.key;
      const verification = category.verificationLevel ?? 'verified';
      const bucket = out.get(categoryKey) ?? new Map<string, number>();
      bucket.set(verification, (bucket.get(verification) ?? 0) + 1);
      out.set(categoryKey, bucket);
    }
  }
  return Object.fromEntries(
    [...out.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, buckets]) => [
        category,
        Object.fromEntries([...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      ]),
  );
}

function structureClassValues(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.structuralClassification ? [row.structuralClassification.structureClass] : [];
}

function primaryFailureFamilyValues(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.failureProfile ? [row.failureProfile.primaryFailureFamily] : [];
}

function deterministicIssues(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.failureProfile?.deterministicIssues ?? [];
}

function semanticIssues(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.failureProfile?.semanticIssues ?? [];
}

function manualOnlyIssues(row: AnalyzeBenchmarkRow): string[] {
  if (row.error) return [];
  return row.failureProfile?.manualOnlyIssues ?? [];
}

function readingOrderSignals(row: AnalyzeBenchmarkRow): string[] {
  if (row.error || !row.detectionProfile) return [];
  const signals: string[] = [];
  const ro = row.detectionProfile.readingOrderSignals;
  if (ro.missingStructureTree) signals.push('missing_structure_tree');
  if (ro.annotationOrderRiskCount > 0) signals.push('annotation_order_risk');
  if (ro.annotationStructParentRiskCount > 0) signals.push('annotation_struct_parent_risk');
  if (ro.headerFooterPollutionRisk) signals.push('header_footer_pollution_risk');
  if (ro.sampledStructurePageOrderDriftCount > 0) signals.push('sampled_structure_page_order_drift');
  if (ro.multiColumnOrderRiskPages > 0) signals.push('multi_column_order_risk');
  return signals;
}

function annotationSignals(row: AnalyzeBenchmarkRow): string[] {
  if (row.error || !row.detectionProfile) return [];
  const signals: string[] = [];
  const ann = row.detectionProfile.annotationSignals;
  if (ann.pagesMissingTabsS > 0) signals.push('pages_missing_tabs_s');
  if (ann.pagesAnnotationOrderDiffers > 0) signals.push('pages_annotation_order_differs');
  if (ann.linkAnnotationsMissingStructure > 0) signals.push('link_annotations_missing_structure');
  if (ann.nonLinkAnnotationsMissingStructure > 0) signals.push('nonlink_annotations_missing_structure');
  if (ann.linkAnnotationsMissingStructParent > 0) signals.push('link_annotations_missing_struct_parent');
  if (ann.nonLinkAnnotationsMissingStructParent > 0) signals.push('nonlink_annotations_missing_struct_parent');
  return signals;
}

function taggedContentSignals(row: AnalyzeBenchmarkRow): string[] {
  if (row.error || !row.detectionProfile) return [];
  const signals: string[] = [];
  const pdfUa = row.detectionProfile.pdfUaSignals;
  if (pdfUa.orphanMcidCount > 0) signals.push('orphan_mcids');
  if (pdfUa.suspectedPathPaintOutsideMc > 0) signals.push('path_paint_outside_mc');
  if (pdfUa.taggedAnnotationRiskCount > 0) signals.push('tagged_annotation_risk');
  return signals;
}

function listTableSignals(row: AnalyzeBenchmarkRow): string[] {
  if (row.error || !row.detectionProfile) return [];
  const signals: string[] = [];
  const list = row.detectionProfile.listSignals;
  const table = row.detectionProfile.tableSignals;
  if (list.listItemMisplacedCount > 0) signals.push('list_item_misplaced');
  if (list.lblBodyMisplacedCount > 0) signals.push('lbl_body_misplaced');
  if (list.listsWithoutItems > 0) signals.push('lists_without_items');
  if (table.directCellUnderTableCount > 0) signals.push('direct_cell_under_table');
  if (table.irregularTableCount > 0) signals.push('irregular_tables');
  if (table.stronglyIrregularTableCount > 0) signals.push('strongly_irregular_tables');
  return signals;
}

function scoreCapCategoryKeys(caps?: ScoreCapApplied[]): string[] {
  return (caps ?? []).map(cap => cap.category);
}

function primaryRouteValues(row: RemediateBenchmarkRow): string[] {
  return row.error || !row.planningSummary?.primaryRoute ? [] : [row.planningSummary.primaryRoute];
}

function skippedToolReasons(row: RemediateBenchmarkRow): string[] {
  return row.error ? [] : (row.planningSummary?.skippedTools ?? []).map(item => item.reason);
}

function scheduledToolNames(row: RemediateBenchmarkRow): string[] {
  return row.error ? [] : row.planningSummary?.scheduledTools ?? [];
}

function remediationOutcomeStatuses(row: RemediateBenchmarkRow): string[] {
  return row.error || !row.remediationOutcomeSummary ? [] : [row.remediationOutcomeSummary.documentStatus];
}

function remediationOutcomeFamilyStatuses(row: RemediateBenchmarkRow): string[] {
  return row.error || !row.remediationOutcomeSummary
    ? []
    : row.remediationOutcomeSummary.familySummaries.map(summary => `${summary.family}:${summary.status}`);
}

function semanticLaneUsage(row: RemediateBenchmarkRow): string[] {
  if (row.error) return [];
  const summaries = [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings];
  return summaries.filter((summary): summary is SemanticRemediationSummary => summary != null).map(summary => summary.lane);
}

function semanticLaneSkipReasons(row: RemediateBenchmarkRow): string[] {
  if (row.error) return [];
  const summaries = [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings];
  return summaries
    .filter((summary): summary is SemanticRemediationSummary => summary != null)
    .map(summary => `${summary.lane}:${summary.skippedReason}`);
}

function semanticLaneChangeStatuses(row: RemediateBenchmarkRow): string[] {
  if (row.error) return [];
  const summaries = [row.semantic, row.semanticHeadings, row.semanticPromoteHeadings, row.semanticUntaggedHeadings];
  return summaries
    .filter((summary): summary is SemanticRemediationSummary => summary != null)
    .map(summary => `${summary.lane}:${summary.changeStatus}`);
}

function confidenceRank(value: string | null | undefined): number {
  switch (value) {
    case 'high': return 2;
    case 'medium': return 1;
    case 'low': return 0;
    default: return 0;
  }
}

function costBenefit(rows: RemediateBenchmarkRow[]): CostBenefitSummary {
  const valid = rows.filter(row => !row.error && (row.wallRemediateMs ?? 0) > 0);
  const totalWallMs = valid.reduce((sum, row) => sum + (row.wallRemediateMs ?? 0), 0);
  if (totalWallMs <= 0) {
    return { scoreDeltaPerSecond: null, confidenceDeltaPerSecond: null };
  }
  const totalScoreDelta = valid.reduce((sum, row) => sum + (row.delta ?? 0), 0);
  const totalConfidenceDelta = valid.reduce(
    (sum, row) => sum + (
      confidenceRank(row.afterStructuralClassification?.confidence)
      - confidenceRank(row.beforeStructuralClassification?.confidence)
    ),
    0,
  );
  return {
    scoreDeltaPerSecond: (totalScoreDelta / totalWallMs) * 1000,
    confidenceDeltaPerSecond: (totalConfidenceDelta / totalWallMs) * 1000,
  };
}

function aggregateRuntime(rows: Array<{ key: string; durationMs: number }>): Array<RuntimeAggregateRow> {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    if (!(row.durationMs > 0)) continue;
    const list = buckets.get(row.key) ?? [];
    list.push(row.durationMs);
    buckets.set(row.key, list);
  }
  return [...buckets.entries()]
    .map(([key, values]) => ({
      key,
      count: values.length,
      totalMs: values.reduce((sum, value) => sum + value, 0),
      meanMs: mean(values),
      medianMs: median(values),
      p95Ms: percentile(values, 95),
      maxMs: Math.max(...values),
    }))
    .sort((a, b) => b.totalMs - a.totalMs || a.key.localeCompare(b.key))
    .slice(0, 20);
}

function stageRuntimeRows(row: RemediateBenchmarkRow): Array<{ key: string; durationMs: number }> {
  return row.runtimeSummary?.stageTimings.map(item => ({ key: item.key, durationMs: item.totalMs })) ?? [];
}

function toolRuntimeRows(row: RemediateBenchmarkRow): Array<{ key: string; durationMs: number }> {
  return row.runtimeSummary?.toolTimings.map(item => ({ key: item.toolName, durationMs: item.durationMs })) ?? [];
}

function semanticRuntimeRows(row: RemediateBenchmarkRow): Array<{ key: string; durationMs: number }> {
  return row.runtimeSummary?.semanticLaneTimings.map(item => ({ key: item.lane, durationMs: item.totalMs })) ?? [];
}

function semanticOutcomeRuntimeRows(row: RemediateBenchmarkRow): Array<{ key: string; durationMs: number }> {
  return row.runtimeSummary?.semanticLaneTimings.map(item => ({
    key: `${item.lane}:${item.changeStatus}`,
    durationMs: item.totalMs,
  })) ?? [];
}

function boundedWorkValues(row: RemediateBenchmarkRow): string[] {
  if (!row.runtimeSummary) return [];
  const values: string[] = [];
  if (row.runtimeSummary.boundedWork.semanticCandidateCapsHit > 0) {
    values.push(`semantic_candidate_cap_hit:${row.runtimeSummary.boundedWork.semanticCandidateCapsHit}`);
  }
  values.push(...row.runtimeSummary.boundedWork.deterministicEarlyExitReasons.map(item => `deterministic_early_exit:${item.key}`));
  values.push(...row.runtimeSummary.boundedWork.semanticSkipReasons.map(item => `semantic_skip:${item.key}`));
  return values;
}

export function buildBenchmarkSummary(input: {
  runId: string;
  generatedAt: string;
  mode: 'analyze' | 'remediate' | 'full';
  semanticEnabled: boolean;
  writePdfs: boolean;
  selectedFileIds: string[];
  manifestEntries: number;
  analyzeRows: AnalyzeBenchmarkRow[];
  remediateRows: RemediateBenchmarkRow[];
}): BenchmarkRunSummary {
  const analyzeSuccessRows = input.analyzeRows.filter(row => !row.error && row.score !== null);
  const analyzeErrorRows = input.analyzeRows.filter(row => row.error);
  const remediateSuccessRows = input.remediateRows.filter(row => !row.error && row.beforeScore !== null);
  const remediateErrorRows = input.remediateRows.filter(row => row.error);

  const cohortSummaries = Object.fromEntries(
    EXPERIMENT_CORPUS_COHORTS.map(cohort => {
      const analyzeRows = input.analyzeRows.filter(row => row.cohort === cohort);
      const remediateRows = input.remediateRows.filter(row => row.cohort === cohort);
      return [cohort, buildCohortSummary(analyzeRows, remediateRows)];
    }),
  );

  return {
    runId: input.runId,
    generatedAt: input.generatedAt,
    mode: input.mode,
    semanticEnabled: input.semanticEnabled,
    writePdfs: input.writePdfs,
    selectedFileIds: input.selectedFileIds,
    counts: {
      manifestEntries: input.manifestEntries,
      selectedEntries: input.selectedFileIds.length,
      analyzeSuccess: analyzeSuccessRows.length,
      analyzeErrors: analyzeErrorRows.length,
      remediateSuccess: remediateSuccessRows.length,
      remediateErrors: remediateErrorRows.length,
    },
    analyze: {
      score: summarizeStats(analyzeSuccessRows.map(row => row.score ?? 0)),
      analysisDurationMs: summarizeStats(analyzeSuccessRows.map(row => row.analysisDurationMs ?? 0)),
      wallAnalyzeMs: summarizeStats(analyzeSuccessRows.map(row => row.wallAnalyzeMs ?? 0)),
      gradeDistribution: distribution(analyzeSuccessRows.map(row => row.grade)),
      pdfClassDistribution: distribution(analyzeSuccessRows.map(row => row.pdfClass)),
      structureClassDistribution: distribution(analyzeSuccessRows.flatMap(structureClassValues)),
      primaryFailureFamilyDistribution: distribution(analyzeSuccessRows.flatMap(primaryFailureFamilyValues)),
      weakestCategories: frequencyRows(analyzeSuccessRows.flatMap(weakestCategoryKeys)),
      topFindingMessages: frequencyRows(analyzeSuccessRows.flatMap(topFindingMessages)),
      manualReviewReasonFrequency: frequencyRows(analyzeSuccessRows.flatMap(manualReviewReasons)),
      categoryManualReviewFrequency: frequencyRows(analyzeSuccessRows.flatMap(categoryManualReviewKeys)),
      categoryVerificationLevels: categoryVerificationCounts(analyzeSuccessRows),
      deterministicIssueFrequency: frequencyRows(analyzeSuccessRows.flatMap(deterministicIssues)),
      semanticIssueFrequency: frequencyRows(analyzeSuccessRows.flatMap(semanticIssues)),
      manualOnlyIssueFrequency: frequencyRows(analyzeSuccessRows.flatMap(manualOnlyIssues)),
      readingOrderSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(readingOrderSignals)),
      annotationSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(annotationSignals)),
      taggedContentSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(taggedContentSignals)),
      listTableSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(listTableSignals)),
      manualReviewRequiredCount: analyzeSuccessRows.filter(row => row.manualReviewRequired === true).length,
      scoreCapsByCategory: frequencyRows(analyzeSuccessRows.flatMap(row => scoreCapCategoryKeys(row.scoreCapsApplied))),
      topSlowestAnalyzeFiles: analyzeSuccessRows
        .map(row => ({
          id: row.id,
          file: row.file,
          cohort: row.cohort,
          metricMs: row.wallAnalyzeMs ?? 0,
        }))
        .sort((a, b) => b.metricMs - a.metricMs)
        .slice(0, 10),
    },
    remediate: input.remediateRows.length > 0
      ? {
          beforeScore: summarizeStats(remediateSuccessRows.map(row => row.beforeScore ?? 0)),
          afterScore: summarizeStats(remediateSuccessRows.map(row => row.afterScore ?? 0)),
          reanalyzedScore: summarizeStats(remediateSuccessRows.map(row => row.reanalyzedScore ?? 0).filter(value => value > 0)),
          delta: summarizeStats(remediateSuccessRows.map(row => row.delta ?? 0)),
          remediationDurationMs: summarizeStats(remediateSuccessRows.map(row => row.remediationDurationMs ?? 0)),
          wallRemediateMs: summarizeStats(remediateSuccessRows.map(row => row.wallRemediateMs ?? 0)),
          analysisAfterMs: summarizeStats(remediateSuccessRows.map(row => row.analysisAfterMs ?? 0).filter(value => value > 0)),
          totalPipelineMs: summarizeStats(remediateSuccessRows.map(row => row.totalPipelineMs ?? 0)),
          gradeDistributionBefore: distribution(remediateSuccessRows.map(row => row.beforeGrade)),
          gradeDistributionAfter: distribution(remediateSuccessRows.map(row => row.afterGrade)),
          gradeDistributionReanalyzed: distribution(remediateSuccessRows.map(row => row.reanalyzedGrade)),
          pdfClassDistributionBefore: distribution(remediateSuccessRows.map(row => row.beforePdfClass)),
          pdfClassDistributionAfter: distribution(remediateSuccessRows.map(row => row.afterPdfClass)),
          pdfClassDistributionReanalyzed: distribution(remediateSuccessRows.map(row => row.reanalyzedPdfClass)),
          beforeManualReviewRequiredCount: remediateSuccessRows.filter(row => row.beforeManualReviewRequired === true).length,
          afterManualReviewRequiredCount: remediateSuccessRows.filter(row => row.afterManualReviewRequired === true).length,
          reanalyzedManualReviewRequiredCount: remediateSuccessRows.filter(row => row.reanalyzedManualReviewRequired === true).length,
          afterManualReviewReasonFrequency: frequencyRows(
            remediateSuccessRows.flatMap(row => row.afterManualReviewReasons ?? []),
          ),
          afterCategoryManualReviewFrequency: frequencyRows(
            remediateSuccessRows.flatMap(row =>
              (row.afterCategories ?? [])
                .filter(category => category.manualReviewRequired)
                .map(category => category.key),
            ),
          ),
          afterCategoryVerificationLevels: categoryVerificationCounts(
            remediateSuccessRows.map(row => ({
              id: row.id,
              file: row.file,
              cohort: row.cohort,
              sourceType: row.sourceType,
              intent: row.intent,
              ...(row.notes ? { notes: row.notes } : {}),
              score: row.afterScore,
              grade: row.afterGrade,
              pdfClass: row.afterPdfClass,
              pageCount: null,
              categories: row.afterCategories ?? [],
              findings: [],
              analysisDurationMs: row.analysisAfterMs,
              wallAnalyzeMs: row.analysisAfterMs,
              verificationLevel: row.afterVerificationLevel ?? undefined,
              manualReviewRequired: row.afterManualReviewRequired ?? undefined,
              manualReviewReasons: row.afterManualReviewReasons ?? [],
              scoreCapsApplied: row.afterScoreCapsApplied ?? [],
            })),
          ),
          afterScoreCapsByCategory: frequencyRows(
            remediateSuccessRows.flatMap(row => scoreCapCategoryKeys(row.afterScoreCapsApplied)),
          ),
          primaryRouteDistribution: distribution(
            remediateSuccessRows.flatMap(primaryRouteValues),
          ),
          skippedToolReasonFrequency: frequencyRows(
            remediateSuccessRows.flatMap(skippedToolReasons),
          ),
          scheduledToolFrequency: frequencyRows(
            remediateSuccessRows.flatMap(scheduledToolNames),
          ),
          outcomeStatusDistribution: distribution(
            remediateSuccessRows.flatMap(remediationOutcomeStatuses),
          ),
          outcomeFamilyStatusFrequency: frequencyRows(
            remediateSuccessRows.flatMap(remediationOutcomeFamilyStatuses),
          ),
          semanticLaneUsageFrequency: frequencyRows(
            remediateSuccessRows.flatMap(semanticLaneUsage),
          ),
          semanticLaneSkipReasonFrequency: frequencyRows(
            remediateSuccessRows.flatMap(semanticLaneSkipReasons),
          ),
          semanticLaneChangeStatusFrequency: frequencyRows(
            remediateSuccessRows.flatMap(semanticLaneChangeStatuses),
          ),
          stageRuntimeFrequency: aggregateRuntime(
            remediateSuccessRows.flatMap(stageRuntimeRows),
          ),
          toolRuntimeFrequency: aggregateRuntime(
            remediateSuccessRows.flatMap(toolRuntimeRows),
          ),
          semanticLaneRuntimeFrequency: aggregateRuntime(
            remediateSuccessRows.flatMap(semanticRuntimeRows),
          ),
          semanticOutcomeRuntimeFrequency: aggregateRuntime(
            remediateSuccessRows.flatMap(semanticOutcomeRuntimeRows),
          ),
          boundedWorkFrequency: frequencyRows(
            remediateSuccessRows.flatMap(boundedWorkValues),
          ),
          costBenefit: costBenefit(remediateSuccessRows),
          topSlowestRemediateFiles: remediateSuccessRows
            .map(row => ({
              id: row.id,
              file: row.file,
              cohort: row.cohort,
              metricMs: row.totalPipelineMs ?? 0,
            }))
            .sort((a, b) => b.metricMs - a.metricMs)
            .slice(0, 10),
          topHighestDeltaFiles: remediateSuccessRows
            .map(row => ({
              id: row.id,
              file: row.file,
              cohort: row.cohort,
              delta: row.delta ?? 0,
              beforeScore: row.beforeScore,
              afterScore: row.afterScore,
              reanalyzedScore: row.reanalyzedScore,
            }))
            .sort((a, b) => b.delta - a.delta)
            .slice(0, 10),
          topLowestDeltaFiles: remediateSuccessRows
            .map(row => ({
              id: row.id,
              file: row.file,
              cohort: row.cohort,
              delta: row.delta ?? 0,
              beforeScore: row.beforeScore,
              afterScore: row.afterScore,
              reanalyzedScore: row.reanalyzedScore,
            }))
            .sort((a, b) => a.delta - b.delta)
            .slice(0, 10),
        }
      : null,
    cohorts: cohortSummaries,
  };
}

function buildCohortSummary(analyzeRows: AnalyzeBenchmarkRow[], remediateRows: RemediateBenchmarkRow[]): CohortSummary {
  const analyzeSuccessRows = analyzeRows.filter(row => !row.error && row.score !== null);
  const remediateSuccessRows = remediateRows.filter(row => !row.error && row.beforeScore !== null);
  return {
    fileCount: analyzeRows.length,
    analyzeSuccess: analyzeSuccessRows.length,
    analyzeErrors: analyzeRows.length - analyzeSuccessRows.length,
    remediateSuccess: remediateSuccessRows.length,
    remediateErrors: remediateRows.length - remediateSuccessRows.length,
    analyzeScore: summarizeStats(analyzeSuccessRows.map(row => row.score ?? 0)),
    analyzeDurationMs: summarizeStats(analyzeSuccessRows.map(row => row.analysisDurationMs ?? 0)),
    wallAnalyzeMs: summarizeStats(analyzeSuccessRows.map(row => row.wallAnalyzeMs ?? 0)),
    remediationDelta: summarizeStats(remediateSuccessRows.map(row => row.delta ?? 0)),
    remediationDurationMs: summarizeStats(remediateSuccessRows.map(row => row.remediationDurationMs ?? 0)),
    wallRemediateMs: summarizeStats(remediateSuccessRows.map(row => row.wallRemediateMs ?? 0)),
    totalPipelineMs: summarizeStats(remediateSuccessRows.map(row => row.totalPipelineMs ?? 0)),
    costBenefit: costBenefit(remediateSuccessRows),
    structureClassDistribution: distribution(analyzeSuccessRows.flatMap(structureClassValues)),
    primaryFailureFamilyDistribution: distribution(analyzeSuccessRows.flatMap(primaryFailureFamilyValues)),
    weakestCategories: frequencyRows(analyzeSuccessRows.flatMap(weakestCategoryKeys)),
    topFindingMessages: frequencyRows(analyzeSuccessRows.flatMap(topFindingMessages)),
    manualReviewReasonFrequency: frequencyRows(analyzeSuccessRows.flatMap(manualReviewReasons)),
    categoryManualReviewFrequency: frequencyRows(analyzeSuccessRows.flatMap(categoryManualReviewKeys)),
    categoryVerificationLevels: categoryVerificationCounts(analyzeSuccessRows),
    deterministicIssueFrequency: frequencyRows(analyzeSuccessRows.flatMap(deterministicIssues)),
    semanticIssueFrequency: frequencyRows(analyzeSuccessRows.flatMap(semanticIssues)),
    manualOnlyIssueFrequency: frequencyRows(analyzeSuccessRows.flatMap(manualOnlyIssues)),
    readingOrderSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(readingOrderSignals)),
    annotationSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(annotationSignals)),
    taggedContentSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(taggedContentSignals)),
    listTableSignalFrequency: frequencyRows(analyzeSuccessRows.flatMap(listTableSignals)),
    manualReviewRequiredCount: analyzeSuccessRows.filter(row => row.manualReviewRequired === true).length,
    scoreCapsByCategory: frequencyRows(analyzeSuccessRows.flatMap(row => scoreCapCategoryKeys(row.scoreCapsApplied))),
  };
}

function markdownVerificationLevels(levels: Record<string, Record<string, number>>): string {
  const entries = Object.entries(levels);
  if (entries.length === 0) return 'n/a';
  return entries
    .map(([category, counts]) => `${category}: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`)
    .join('; ');
}

function formatStats(stats: SummaryStats): string {
  if (stats.count === 0) return 'n/a';
  return `mean ${stats.mean.toFixed(1)} · median ${stats.median.toFixed(1)} · p95 ${stats.p95.toFixed(1)}`;
}

function markdownDistribution(dist: Record<string, number>): string {
  const entries = Object.entries(dist);
  if (entries.length === 0) return 'n/a';
  return entries.map(([key, count]) => `${key}:${count}`).join(', ');
}

function markdownFrequency(rows: Array<FrequencyRow>): string {
  if (rows.length === 0) return 'n/a';
  return rows.map(row => `${row.key} (${row.count})`).join('; ');
}

function markdownTopFileMetrics(rows: Array<FileMetricRow>): string[] {
  return rows.length
    ? rows.map(row => `- \`${row.file}\` (${row.cohort}) — ${row.metricMs.toFixed(0)} ms`)
    : ['- none'];
}

function markdownTopDeltas(rows: Array<FileDeltaRow>): string[] {
  return rows.length
    ? rows.map(row => `- \`${row.file}\` (${row.cohort}) — Δ ${row.delta >= 0 ? '+' : ''}${row.delta}`)
    : ['- none'];
}

export function renderBenchmarkSummaryMarkdown(summary: BenchmarkRunSummary): string {
  const lines: string[] = [];
  lines.push('# Experiment corpus benchmark summary');
  lines.push('');
  lines.push(`- **Run ID:** \`${summary.runId}\``);
  lines.push(`- **Generated:** ${summary.generatedAt}`);
  lines.push(`- **Mode:** \`${summary.mode}\``);
  lines.push(`- **Semantic enabled:** ${summary.semanticEnabled ? 'yes' : 'no'}`);
  lines.push(`- **Write PDFs:** ${summary.writePdfs ? 'yes' : 'no'}`);
  lines.push(`- **Selected files:** ${summary.counts.selectedEntries} / ${summary.counts.manifestEntries}`);
  lines.push('');
  lines.push('## Overall');
  lines.push('');
  lines.push(`- **Analyze success/errors:** ${summary.counts.analyzeSuccess} / ${summary.counts.analyzeErrors}`);
  lines.push(`- **Remediate success/errors:** ${summary.counts.remediateSuccess} / ${summary.counts.remediateErrors}`);
  lines.push(`- **Analyze scores:** ${formatStats(summary.analyze.score)}`);
  lines.push(`- **Analyze runtime (` + '`analysisDurationMs`' + `):** ${formatStats(summary.analyze.analysisDurationMs)}`);
  lines.push(`- **Analyze runtime (wall):** ${formatStats(summary.analyze.wallAnalyzeMs)}`);
  lines.push(`- **Analyze grades:** ${markdownDistribution(summary.analyze.gradeDistribution)}`);
  lines.push(`- **Analyze pdfClass:** ${markdownDistribution(summary.analyze.pdfClassDistribution)}`);
  lines.push(`- **Analyze structure class:** ${markdownDistribution(summary.analyze.structureClassDistribution)}`);
  lines.push(`- **Analyze primary failure family:** ${markdownDistribution(summary.analyze.primaryFailureFamilyDistribution)}`);
  lines.push(`- **Weakest categories:** ${markdownFrequency(summary.analyze.weakestCategories)}`);
  lines.push(`- **Top findings:** ${markdownFrequency(summary.analyze.topFindingMessages)}`);
  lines.push(`- **Analyze manual-review count:** ${summary.analyze.manualReviewRequiredCount}`);
  lines.push(`- **Analyze manual-review reasons:** ${markdownFrequency(summary.analyze.manualReviewReasonFrequency)}`);
  lines.push(`- **Analyze category manual review:** ${markdownFrequency(summary.analyze.categoryManualReviewFrequency)}`);
  lines.push(`- **Analyze category verification:** ${markdownVerificationLevels(summary.analyze.categoryVerificationLevels)}`);
  lines.push(`- **Analyze deterministic issues:** ${markdownFrequency(summary.analyze.deterministicIssueFrequency)}`);
  lines.push(`- **Analyze semantic issues:** ${markdownFrequency(summary.analyze.semanticIssueFrequency)}`);
  lines.push(`- **Analyze manual-only issues:** ${markdownFrequency(summary.analyze.manualOnlyIssueFrequency)}`);
  lines.push(`- **Reading-order signals:** ${markdownFrequency(summary.analyze.readingOrderSignalFrequency)}`);
  lines.push(`- **Annotation signals:** ${markdownFrequency(summary.analyze.annotationSignalFrequency)}`);
  lines.push(`- **Tagged-content signals:** ${markdownFrequency(summary.analyze.taggedContentSignalFrequency)}`);
  lines.push(`- **List/table legality signals:** ${markdownFrequency(summary.analyze.listTableSignalFrequency)}`);
  lines.push(`- **Analyze score caps:** ${markdownFrequency(summary.analyze.scoreCapsByCategory)}`);
  if (summary.remediate) {
    lines.push(`- **Remediation before scores:** ${formatStats(summary.remediate.beforeScore)}`);
    lines.push(`- **Remediation after scores:** ${formatStats(summary.remediate.afterScore)}`);
    lines.push(`- **Reanalyzed scores:** ${formatStats(summary.remediate.reanalyzedScore)}`);
    lines.push(`- **Score delta:** ${formatStats(summary.remediate.delta)}`);
    lines.push(`- **Remediation runtime (` + '`remediationDurationMs`' + `):** ${formatStats(summary.remediate.remediationDurationMs)}`);
    lines.push(`- **Remediation runtime (wall):** ${formatStats(summary.remediate.wallRemediateMs)}`);
    lines.push(`- **Post-write analyze runtime:** ${formatStats(summary.remediate.analysisAfterMs)}`);
    lines.push(`- **Total pipeline runtime:** ${formatStats(summary.remediate.totalPipelineMs)}`);
    lines.push(`- **Remediation manual review (before/after/reanalyzed):** ${summary.remediate.beforeManualReviewRequiredCount} / ${summary.remediate.afterManualReviewRequiredCount} / ${summary.remediate.reanalyzedManualReviewRequiredCount}`);
    lines.push(`- **Remediation manual-review reasons:** ${markdownFrequency(summary.remediate.afterManualReviewReasonFrequency)}`);
    lines.push(`- **Remediation category manual review:** ${markdownFrequency(summary.remediate.afterCategoryManualReviewFrequency)}`);
    lines.push(`- **Remediation category verification:** ${markdownVerificationLevels(summary.remediate.afterCategoryVerificationLevels)}`);
    lines.push(`- **Remediation score caps:** ${markdownFrequency(summary.remediate.afterScoreCapsByCategory)}`);
    lines.push(`- **Remediation primary routes:** ${markdownDistribution(summary.remediate.primaryRouteDistribution)}`);
    lines.push(`- **Remediation skipped-tool reasons:** ${markdownFrequency(summary.remediate.skippedToolReasonFrequency)}`);
    lines.push(`- **Remediation scheduled tools:** ${markdownFrequency(summary.remediate.scheduledToolFrequency)}`);
    lines.push(`- **Remediation outcome status:** ${markdownDistribution(summary.remediate.outcomeStatusDistribution)}`);
    lines.push(`- **Remediation outcome families:** ${markdownFrequency(summary.remediate.outcomeFamilyStatusFrequency)}`);
    lines.push(`- **Semantic lanes used:** ${markdownFrequency(summary.remediate.semanticLaneUsageFrequency)}`);
    lines.push(`- **Semantic lane skip reasons:** ${markdownFrequency(summary.remediate.semanticLaneSkipReasonFrequency)}`);
    lines.push(`- **Semantic lane change status:** ${markdownFrequency(summary.remediate.semanticLaneChangeStatusFrequency)}`);
    lines.push(`- **Stage runtime hotspots:** ${summary.remediate.stageRuntimeFrequency.map(row => `${row.key} (${row.totalMs.toFixed(0)} ms)`).join('; ') || 'n/a'}`);
    lines.push(`- **Tool runtime hotspots:** ${summary.remediate.toolRuntimeFrequency.map(row => `${row.key} (${row.totalMs.toFixed(0)} ms)`).join('; ') || 'n/a'}`);
    lines.push(`- **Semantic runtime hotspots:** ${summary.remediate.semanticLaneRuntimeFrequency.map(row => `${row.key} (${row.totalMs.toFixed(0)} ms)`).join('; ') || 'n/a'}`);
    lines.push(`- **Bounded-work signals:** ${markdownFrequency(summary.remediate.boundedWorkFrequency)}`);
    lines.push(`- **Score per second:** ${summary.remediate.costBenefit.scoreDeltaPerSecond?.toFixed(3) ?? 'n/a'}`);
    lines.push(`- **Confidence per second:** ${summary.remediate.costBenefit.confidenceDeltaPerSecond?.toFixed(3) ?? 'n/a'}`);
  }
  lines.push('');
  lines.push('## Per Cohort');
  lines.push('');
  lines.push('| Cohort | Files | Analyze score | Analyze p95 wall ms | Primary families | Remediate delta | Remediate p95 total ms |');
  lines.push('| --- | ---: | --- | ---: | --- | --- | ---: |');
  for (const cohort of EXPERIMENT_CORPUS_COHORTS) {
    const row = summary.cohorts[cohort] ?? {
      fileCount: 0,
      analyzeSuccess: 0,
      analyzeErrors: 0,
      remediateSuccess: 0,
      remediateErrors: 0,
      analyzeScore: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      analyzeDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      wallAnalyzeMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      remediationDelta: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      remediationDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      wallRemediateMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      totalPipelineMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      costBenefit: { scoreDeltaPerSecond: null, confidenceDeltaPerSecond: null },
      structureClassDistribution: {},
      primaryFailureFamilyDistribution: {},
      weakestCategories: [],
      topFindingMessages: [],
      manualReviewReasonFrequency: [],
      categoryManualReviewFrequency: [],
      categoryVerificationLevels: {},
      deterministicIssueFrequency: [],
      semanticIssueFrequency: [],
      manualOnlyIssueFrequency: [],
      readingOrderSignalFrequency: [],
      annotationSignalFrequency: [],
      taggedContentSignalFrequency: [],
      listTableSignalFrequency: [],
      manualReviewRequiredCount: 0,
      scoreCapsByCategory: [],
    };
    lines.push(
      `| ${cohort} | ${row.fileCount} | ${row.analyzeScore.count ? row.analyzeScore.mean.toFixed(1) : 'n/a'} | ${row.wallAnalyzeMs.p95.toFixed(0)} | ${markdownDistribution(row.primaryFailureFamilyDistribution)} | ${row.remediationDelta.count ? row.remediationDelta.mean.toFixed(1) : 'n/a'} | ${row.totalPipelineMs.p95.toFixed(0)} |`,
    );
  }
  lines.push('');
  lines.push('## Failure Family Stability');
  lines.push('');
  for (const cohort of EXPERIMENT_CORPUS_COHORTS) {
    const row = summary.cohorts[cohort];
    lines.push(`- **${cohort}:** ${markdownDistribution(row?.primaryFailureFamilyDistribution ?? {})}`);
  }
  const falseCleanRows = Object.values(summary.cohorts)
    .flatMap(() => []);
  void falseCleanRows;
  lines.push('');
  lines.push('## False-Clean Pressure');
  lines.push('');
  lines.push('- Files with strong structural signals but unexpectedly high category scores should be reviewed in the JSON artifacts using `detectionProfile` alongside category outputs.');
  lines.push(`- Reading-order signal frequency: ${markdownFrequency(summary.analyze.readingOrderSignalFrequency)}`);
  lines.push(`- Annotation signal frequency: ${markdownFrequency(summary.analyze.annotationSignalFrequency)}`);
  lines.push(`- Tagged-content signal frequency: ${markdownFrequency(summary.analyze.taggedContentSignalFrequency)}`);
  lines.push(`- List/table signal frequency: ${markdownFrequency(summary.analyze.listTableSignalFrequency)}`);
  lines.push('');
  lines.push('## Slowest Analyze Files');
  lines.push('');
  lines.push(...markdownTopFileMetrics(summary.analyze.topSlowestAnalyzeFiles));
  lines.push('');
  if (summary.remediate) {
    lines.push('## Slowest Remediate Files');
    lines.push('');
    lines.push(...markdownTopFileMetrics(summary.remediate.topSlowestRemediateFiles));
    lines.push('');
    lines.push('## Highest Delta Files');
    lines.push('');
    lines.push(...markdownTopDeltas(summary.remediate.topHighestDeltaFiles));
    lines.push('');
    lines.push('## Lowest Delta Files');
    lines.push('');
    lines.push(...markdownTopDeltas(summary.remediate.topLowestDeltaFiles));
    lines.push('');
  }
  return lines.join('\n');
}

export function validateBenchmarkArtifacts(bundle: BenchmarkArtifactBundle): BenchmarkValidationResult {
  const errors: string[] = [];
  const selectedIds = bundle.manifest.selectedEntries.map(entry => entry.id);
  if (selectedIds.length !== bundle.summary.counts.selectedEntries) {
    errors.push('Selected entry count does not match summary.selectedEntries.');
  }

  const analyzeRowIds = new Set(bundle.analyzeResults.map(row => row.id));
  for (const id of selectedIds) {
    if (!analyzeRowIds.has(id)) errors.push(`Missing analyze row for manifest entry "${id}".`);
  }

  if (bundle.summary.counts.analyzeSuccess + bundle.summary.counts.analyzeErrors !== bundle.analyzeResults.length) {
    errors.push('Analyze summary counts do not match analyze result rows.');
  }

  if (bundle.remediateResults.length > 0) {
    const remediateRowIds = new Set(bundle.remediateResults.map(row => row.id));
    for (const id of selectedIds) {
      if (!remediateRowIds.has(id)) errors.push(`Missing remediate row for manifest entry "${id}".`);
    }
    if (!bundle.summary.remediate) {
      errors.push('Remediate results exist but summary.remediate is null.');
    }
    if (bundle.summary.counts.remediateSuccess + bundle.summary.counts.remediateErrors !== bundle.remediateResults.length) {
      errors.push('Remediate summary counts do not match remediate result rows.');
    }
  } else if (bundle.summary.remediate !== null) {
    errors.push('Summary.remediate must be null when there are no remediate rows.');
  }

  return { ok: errors.length === 0, errors };
}

export function makeManifestSnapshot(input: {
  runId: string;
  generatedAt: string;
  manifestPath: string;
  corpusRoot: string;
  mode: 'analyze' | 'remediate' | 'full';
  semanticEnabled: boolean;
  writePdfs: boolean;
  selectedEntries: ExperimentCorpusEntry[];
}): ManifestSnapshot {
  return {
    runId: input.runId,
    generatedAt: input.generatedAt,
    manifestPath: input.manifestPath,
    corpusRoot: input.corpusRoot,
    mode: input.mode,
    semanticEnabled: input.semanticEnabled,
    writePdfs: input.writePdfs,
    selectedEntries: input.selectedEntries.map(({ absolutePath, filename, ...entry }) => entry),
  };
}

export function defaultExperimentCorpusPaths(): {
  manifestPath: string;
  corpusRoot: string;
} {
  const corpusRoot = join(process.cwd(), 'Input', 'experiment-corpus');
  return {
    corpusRoot,
    manifestPath: join(corpusRoot, 'manifest.json'),
  };
}

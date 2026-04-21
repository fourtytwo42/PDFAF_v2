import type {
  AnalysisResult,
  AppliedRemediationTool,
  DocumentSnapshot,
  PlannedRemediationTool,
  PythonMutationDetailPayload,
} from '../../types.js';

export type BatchEquivalenceClassification = 'safe' | 'unsafe' | 'inconclusive';

export type BatchEquivalenceReason =
  | 'score_regression'
  | 'category_regression'
  | 'op_outcome_mismatch'
  | 'invariant_regression'
  | 'benefit_missing'
  | 'snapshot_signal_regression'
  | 'live_param_divergence'
  | 'downstream_route_divergence'
  | 'missing_diagnostic_field';

export interface BatchEquivalencePathResult {
  score: number;
  categories: Record<string, number>;
  manualReviewReasons: string[];
  scoreCaps: string[];
  structuralConfidence?: string | null;
  opRows: Array<{
    toolName: string;
    outcome: AppliedRemediationTool['outcome'];
    details?: string;
  }>;
  snapshotSignals?: BatchEquivalenceSnapshotSignals;
  nextScheduledTools?: string[];
}

export interface BatchEquivalenceSnapshotSignals {
  headingCount: number;
  headingDepth: number;
  readingOrderDepth: number;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureMissingAlt: number;
  tableHeaderCount: number;
  malformedTableCount: number;
  annotationMissingStructure: number;
  annotationMissingStructParent: number;
}

export interface BatchEquivalenceInput {
  fileId: string;
  file?: string;
  bundleRole: string;
  tools: PlannedRemediationTool[];
  sequential: BatchEquivalencePathResult;
  batch: BatchEquivalencePathResult;
}

export interface BatchEquivalenceResult extends BatchEquivalenceInput {
  classification: BatchEquivalenceClassification;
  reasons: BatchEquivalenceReason[];
  categoryDeltas: Record<string, number>;
  opOutcomeComparison: Array<{
    toolName: string;
    sequential: AppliedRemediationTool['outcome'] | null;
    batch: AppliedRemediationTool['outcome'] | null;
  }>;
}

export function categoryScoreMap(analysis: AnalysisResult): Record<string, number> {
  return Object.fromEntries(analysis.categories.map(category => [category.key, category.score]));
}

export function extractSnapshotSignals(snapshot: DocumentSnapshot): BatchEquivalenceSnapshotSignals {
  const headingSignals = snapshot.detectionProfile?.headingSignals;
  const readingOrderSignals = snapshot.detectionProfile?.readingOrderSignals;
  const tableSignals = snapshot.detectionProfile?.tableSignals;
  const annotationSignals = snapshot.detectionProfile?.annotationSignals ?? snapshot.annotationAccessibility;
  const checkerFigures = snapshot.checkerFigureTargets ?? [];
  return {
    headingCount: headingSignals?.treeHeadingCount ?? snapshot.headings.length,
    headingDepth: headingSignals?.headingTreeDepth ?? 0,
    readingOrderDepth: readingOrderSignals?.structureTreeDepth ?? 0,
    checkerVisibleFigureCount: checkerFigures.filter(figure => figure.reachable && !figure.isArtifact).length,
    checkerVisibleFigureMissingAlt: checkerFigures.filter(figure => figure.reachable && !figure.isArtifact && !figure.hasAlt).length,
    tableHeaderCount: snapshot.tables.reduce((sum, table) => sum + table.headerCount, 0),
    malformedTableCount: (tableSignals?.directCellUnderTableCount ?? 0) + (tableSignals?.misplacedCellCount ?? 0),
    annotationMissingStructure: annotationSignals?.linkAnnotationsMissingStructure ?? 0,
    annotationMissingStructParent: annotationSignals?.linkAnnotationsMissingStructParent ?? 0,
  };
}

function parseDetails(details: string | undefined): PythonMutationDetailPayload | null {
  if (!details?.startsWith('{')) return null;
  try {
    return JSON.parse(details) as PythonMutationDetailPayload;
  } catch {
    return null;
  }
}

function structuralBenefitKeys(details: string | undefined): string[] {
  const benefits = parseDetails(details)?.structuralBenefits;
  if (!benefits) return [];
  return Object.entries(benefits).filter(([, value]) => value === true).map(([key]) => key).sort();
}

function invariantRegression(seqDetails: string | undefined, batchDetails: string | undefined): boolean {
  const seq = parseDetails(seqDetails)?.invariants;
  const batch = parseDetails(batchDetails)?.invariants;
  if (!seq && !batch) return false;
  if (!batch) return true;
  if (seq?.targetResolved !== false && batch.targetResolved === false) return true;
  if (seq?.targetReachable !== false && batch.targetReachable === false) return true;
  if (seq?.ownershipPreserved !== false && batch.ownershipPreserved === false) return true;
  if (seq?.tableTreeValidAfter !== false && batch.tableTreeValidAfter === false) return true;
  if ((seq?.rootReachableHeadingCountAfter ?? 0) > (batch.rootReachableHeadingCountAfter ?? 0)) return true;
  if ((seq?.rootReachableFigureCountAfter ?? 0) > (batch.rootReachableFigureCountAfter ?? 0)) return true;
  if ((seq?.headerCellCountAfter ?? 0) > (batch.headerCellCountAfter ?? 0)) return true;
  return false;
}

function snapshotSignalRegression(seq: BatchEquivalenceSnapshotSignals, batch: BatchEquivalenceSnapshotSignals): boolean {
  return batch.headingCount < seq.headingCount ||
    batch.headingDepth < seq.headingDepth ||
    batch.readingOrderDepth < seq.readingOrderDepth ||
    batch.checkerVisibleFigureCount < seq.checkerVisibleFigureCount ||
    batch.checkerVisibleFigureMissingAlt > seq.checkerVisibleFigureMissingAlt ||
    batch.tableHeaderCount < seq.tableHeaderCount ||
    batch.malformedTableCount > seq.malformedTableCount ||
    batch.annotationMissingStructure > seq.annotationMissingStructure ||
    batch.annotationMissingStructParent > seq.annotationMissingStructParent;
}

export function classifyBatchEquivalence(input: BatchEquivalenceInput): BatchEquivalenceResult {
  const reasons = new Set<BatchEquivalenceReason>();
  const categoryDeltas: Record<string, number> = {};
  const allCategoryKeys = new Set([...Object.keys(input.sequential.categories), ...Object.keys(input.batch.categories)]);
  for (const key of allCategoryKeys) {
    const seq = input.sequential.categories[key];
    const batch = input.batch.categories[key];
    if (typeof seq !== 'number' || typeof batch !== 'number') {
      reasons.add('missing_diagnostic_field');
      continue;
    }
    categoryDeltas[key] = batch - seq;
    if (batch < seq) reasons.add('category_regression');
  }

  if (input.batch.score < input.sequential.score) reasons.add('score_regression');
  if (input.batch.structuralConfidence && input.sequential.structuralConfidence && input.batch.structuralConfidence !== input.sequential.structuralConfidence) {
    const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    if ((rank[input.batch.structuralConfidence] ?? -1) < (rank[input.sequential.structuralConfidence] ?? -1)) {
      reasons.add('snapshot_signal_regression');
    }
  }
  if (input.batch.manualReviewReasons.length > input.sequential.manualReviewReasons.length) reasons.add('snapshot_signal_regression');
  if (input.batch.scoreCaps.length > input.sequential.scoreCaps.length) reasons.add('snapshot_signal_regression');

  const opOutcomeComparison = input.tools.map((tool, index) => {
    const sequential = input.sequential.opRows[index]?.outcome ?? null;
    const batch = input.batch.opRows[index]?.outcome ?? null;
    if (sequential !== batch) reasons.add('op_outcome_mismatch');
    if (invariantRegression(input.sequential.opRows[index]?.details, input.batch.opRows[index]?.details)) {
      reasons.add('invariant_regression');
    }
    const seqBenefits = structuralBenefitKeys(input.sequential.opRows[index]?.details);
    const batchBenefits = structuralBenefitKeys(input.batch.opRows[index]?.details);
    if (seqBenefits.some(key => !batchBenefits.includes(key))) reasons.add('benefit_missing');
    return { toolName: tool.toolName, sequential, batch };
  });

  if (!input.sequential.snapshotSignals || !input.batch.snapshotSignals) {
    reasons.add('missing_diagnostic_field');
  } else if (snapshotSignalRegression(input.sequential.snapshotSignals, input.batch.snapshotSignals)) {
    reasons.add('snapshot_signal_regression');
  }

  if (!input.sequential.nextScheduledTools || !input.batch.nextScheduledTools) {
    reasons.add('missing_diagnostic_field');
  } else if (input.sequential.nextScheduledTools.join('|') !== input.batch.nextScheduledTools.join('|')) {
    reasons.add('downstream_route_divergence');
  }

  let classification: BatchEquivalenceClassification = 'safe';
  if (reasons.has('missing_diagnostic_field') || reasons.has('live_param_divergence')) {
    classification = 'inconclusive';
  }
  if ([...reasons].some(reason => reason !== 'missing_diagnostic_field' && reason !== 'live_param_divergence')) {
    classification = 'unsafe';
  }

  return {
    ...input,
    classification,
    reasons: [...reasons].sort(),
    categoryDeltas,
    opOutcomeComparison,
  };
}

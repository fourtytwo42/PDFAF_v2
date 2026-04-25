import { performance } from 'node:perf_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BOOKMARKS_PAGE_OUTLINE_MAX_PAGES,
  BOOKMARKS_PAGE_THRESHOLD,
  PLAYBOOK_LEARN_MIN_SCORE_DELTA,
  REMEDIATION_CATEGORY_THRESHOLD,
  REMEDIATION_IMPLEMENTED_TOOLS,
  REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN,
  REMEDIATION_MAX_BASE64_MB,
  REMEDIATION_MAX_ROUNDS,
  REMEDIATION_MIN_ROUND_IMPROVEMENT,
  REMEDIATION_TARGET_SCORE,
  ZERO_HEADING_CONFORMANCE_TIMEOUT_MS,
} from '../../config.js';
import { getDb } from '../../db/client.js';
import { buildFailureSignature } from '../learning/failureSignature.js';
import { createPlaybookStore, type PlaybookStore } from '../learning/playbookStore.js';
import { createToolOutcomeStore, type ToolOutcomeStore } from '../learning/toolOutcomes.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  ClassificationConfidence,
  DocumentSnapshot,
  OcrPipelineSummary,
  PlanningSummary,
  PlannedRemediationTool,
  Playbook,
  RemediationBoundedWorkSummary,
  RemediationPlan,
  RemediationResult,
  RemediationRoundSummary,
  RemediationRuntimeSummary,
  RemediationStageRuntimeSummary,
  RemediationStagePlan,
  RemediationToolRuntimeSummary,
  RemediatePdfOutcome,
  ScoreCapApplied,
  StructuralConfidenceGuardSummary,
  PythonMutationDetailPayload,
} from '../../types.js';
import { analyzePdf } from '../pdfAnalyzer.js';
import {
  buildDefaultParams,
  deriveFallbackDocumentTitle,
  isProtectedZeroHeadingConvergence,
  isToolAllowedByRouteContract,
  planForRemediation,
} from './planner.js';
import { buildRemediationOutcomeSummary } from './outcomeSummary.js';
import { runPythonMutationBatch, type PythonMutation } from '../../python/bridge.js';
import * as metadataTools from './tools/metadata.js';
import { applyPostRemediationAltRepair } from './altStructureRepair.js';
import { embedFontsWithGhostscript, shouldTryLocalFontSubstitution, shouldTryUrwType1Embed } from './fontEmbed.js';
import { hasExternalReadinessDebt } from './externalReadiness.js';
import { buildEligibleHeadingBootstrapCandidates } from '../headingBootstrapCandidates.js';
import { buildIcjiaParity, isFilenameLikeTitle } from '../compliance/icjiaParity.js';
import { isGenericLinkText, isRawUrlLinkText } from '../scorer/linkTextHeuristics.js';

export { applyPostRemediationAltRepair } from './altStructureRepair.js';

const implemented = new Set<string>(REMEDIATION_IMPLEMENTED_TOOLS);

export function mergePlanningSummaries(
  prior: PlanningSummary | undefined,
  next: PlanningSummary | undefined,
): PlanningSummary | undefined {
  if (!next) return prior;
  if (!prior) return next;
  const skipped = new Map<string, { toolName: string; reason: PlanningSummary['skippedTools'][number]['reason'] }>();
  for (const row of [...prior.skippedTools, ...next.skippedTools]) {
    skipped.set(`${row.toolName}:${row.reason}`, row);
  }
  const routeSummaries = new Map<string, NonNullable<PlanningSummary['routeSummaries']>[number]>();
  for (const row of [...(prior.routeSummaries ?? []), ...(next.routeSummaries ?? [])]) {
    const existing = routeSummaries.get(row.route);
    if (!existing) {
      routeSummaries.set(row.route, {
        ...row,
        scheduledTools: [...new Set(row.scheduledTools)],
      });
      continue;
    }
    const stopped = existing.status === 'stopped' || row.status === 'stopped';
    routeSummaries.set(row.route, {
      route: row.route,
      status: stopped ? 'stopped' : 'active',
      ...(row.reason || existing.reason ? { reason: row.reason ?? existing.reason } : {}),
      scheduledTools: [...new Set([...existing.scheduledTools, ...row.scheduledTools])],
    });
  }
  return {
    primaryRoute: prior.primaryRoute ?? next.primaryRoute,
    secondaryRoutes: [...new Set([...prior.secondaryRoutes, ...next.secondaryRoutes])],
    triggeringSignals: [...new Set([...prior.triggeringSignals, ...next.triggeringSignals])],
    scheduledTools: [...new Set([...prior.scheduledTools, ...next.scheduledTools])],
    routeSummaries: [...routeSummaries.values()],
    skippedTools: [...skipped.values()],
    semanticDeferred: prior.semanticDeferred || next.semanticDeferred,
  };
}

function filterPlan(plan: RemediationPlan): RemediationPlan {
  return {
    ...(plan.planningSummary ? { planningSummary: plan.planningSummary } : {}),
    stages: plan.stages
      .map(s => ({
        ...s,
        tools: s.tools.filter(t => implemented.has(t.toolName)),
      }))
      .filter(s => s.tools.length > 0),
  };
}

/** OCR can lower the aggregate score while still adding a needed text layer — do not revert that stage. */
function keepOcrStageDespiteScoreDrop(
  stage: RemediationStagePlan,
  stageApplied: AppliedRemediationTool[],
): boolean {
  if (stage.tools.length !== 1 || stage.tools[0]!.toolName !== 'ocr_scanned_pdf') return false;
  const ocr = stageApplied[0];
  return ocr?.toolName === 'ocr_scanned_pdf' && ocr.outcome === 'applied';
}

const STRUCTURAL_CONFIDENCE_RANK: Record<ClassificationConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function compareStructuralConfidence(
  before: AnalysisResult,
  after: AnalysisResult,
): { regressed: boolean; reason: string | null } {
  const beforeConfidence = before.structuralClassification?.confidence;
  const afterConfidence = after.structuralClassification?.confidence;
  if (!beforeConfidence || !afterConfidence) {
    return { regressed: false, reason: null };
  }
  if (STRUCTURAL_CONFIDENCE_RANK[afterConfidence] >= STRUCTURAL_CONFIDENCE_RANK[beforeConfidence]) {
    return { regressed: false, reason: null };
  }
  // Untagged/partially-tagged starting states legitimately drop from high→medium as nascent
  // structure appears (e.g. MarkInfo.Marked flips untagged_digital→partially_tagged). Score-up
  // progression out of these states is expected; do not roll back.
  const beforeClass = before.structuralClassification?.structureClass;
  if (beforeClass === 'untagged_digital' || beforeClass === 'partially_tagged') {
    return { regressed: false, reason: null };
  }
  return {
    regressed: true,
    reason: `stage_regressed_structural_confidence(${beforeConfidence}->${afterConfidence})`,
  };
}

export function parseMutationDetails(details: string | undefined): PythonMutationDetailPayload | null {
  if (!details?.startsWith('{')) return null;
  try {
    return JSON.parse(details) as PythonMutationDetailPayload;
  } catch {
    return null;
  }
}

const REPLAY_CATEGORY_KEYS = [
  'heading_structure',
  'alt_text',
  'table_markup',
  'reading_order',
  'title_language',
  'pdf_ua_compliance',
] as const;

type ReplayCategoryKey = typeof REPLAY_CATEGORY_KEYS[number];

interface ReplayStateInstrumentationInput {
  beforeAnalysis: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  afterAnalysis?: AnalysisResult;
  afterSnapshot?: DocumentSnapshot;
  params?: Record<string, unknown>;
  targetRef?: unknown;
}

function stableReplayStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableReplayStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableReplayStringify(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildReplayStateSignature(value: unknown): string {
  return createHash('sha256').update(stableReplayStringify(value)).digest('hex').slice(0, 24);
}

function replayCategoryScores(analysis: AnalysisResult): Partial<Record<ReplayCategoryKey, number>> {
  const out: Partial<Record<ReplayCategoryKey, number>> = {};
  for (const key of REPLAY_CATEGORY_KEYS) {
    const score = categoryScore(analysis, key);
    if (typeof score === 'number') out[key] = score;
  }
  return out;
}

function replayDetectionSignals(snapshot: DocumentSnapshot): Record<string, unknown> {
  const headingSignals = snapshot.detectionProfile?.headingSignals;
  const figureSignals = snapshot.detectionProfile?.figureSignals;
  const tableSignals = snapshot.detectionProfile?.tableSignals;
  const readingOrderSignals = snapshot.detectionProfile?.readingOrderSignals;
  const annotationSignals = snapshot.detectionProfile?.annotationSignals;
  const checkerFigures = snapshot.checkerFigureTargets ?? [];
  const out: Record<string, unknown> = {
    extractedHeadingCount: headingSignals?.extractedHeadingCount ?? snapshot.headings.length,
    treeHeadingCount: headingSignals?.treeHeadingCount,
    headingTreeDepth: headingSignals?.headingTreeDepth,
    extractedHeadingsMissingFromTree: headingSignals?.extractedHeadingsMissingFromTree,
    checkerVisibleFigureCount: checkerFigures.filter(figure => figure.reachable).length,
    checkerVisibleFigureAltCount: checkerFigures.filter(figure => figure.reachable && figure.hasAlt).length,
    extractedFigureCount: figureSignals?.extractedFigureCount ?? snapshot.figures.length,
    treeFigureCount: figureSignals?.treeFigureCount,
    treeFigureMissingForExtractedFigures: figureSignals?.treeFigureMissingForExtractedFigures,
    directCellUnderTableCount: tableSignals?.directCellUnderTableCount,
    malformedTableCount: tableSignals?.tablesWithMisplacedCells,
    misplacedCellCount: tableSignals?.misplacedCellCount,
    structureTreeDepth: readingOrderSignals?.structureTreeDepth,
    annotationOrderRiskCount: readingOrderSignals?.annotationOrderRiskCount,
    annotationStructParentRiskCount: readingOrderSignals?.annotationStructParentRiskCount,
    orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? snapshot.orphanMcids?.length ?? 0,
    linkAnnotationsMissingStructure: annotationSignals?.linkAnnotationsMissingStructure
      ?? snapshot.annotationAccessibility?.linkAnnotationsMissingStructure,
    linkAnnotationsMissingStructParent: annotationSignals?.linkAnnotationsMissingStructParent
      ?? snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent,
  };
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined));
}

function replayTargetRef(details: Record<string, unknown>, explicitTargetRef?: unknown): string | undefined {
  if (typeof explicitTargetRef === 'string' && explicitTargetRef.length > 0) return explicitTargetRef;
  const invariants = details['invariants'];
  if (invariants && typeof invariants === 'object' && !Array.isArray(invariants)) {
    const value = (invariants as Record<string, unknown>)['targetRef'];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  const debug = details['debug'];
  if (debug && typeof debug === 'object' && !Array.isArray(debug)) {
    const value = (debug as Record<string, unknown>)['targetRef'];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function buildReplayState(input: ReplayStateInstrumentationInput, details: Record<string, unknown>): Record<string, unknown> {
  const categoryScoresBefore = replayCategoryScores(input.beforeAnalysis);
  const detectionSignalsBefore = replayDetectionSignals(input.beforeSnapshot);
  const targetRef = replayTargetRef(details, input.targetRef);
  const params = input.params && Object.keys(input.params).length > 0
    ? Object.fromEntries(Object.entries(input.params).filter(([, value]) => value !== undefined))
    : undefined;
  const signatureBeforePayload: Record<string, unknown> = {
    score: input.beforeAnalysis.score,
    categories: categoryScoresBefore,
    signals: detectionSignalsBefore,
  };
  if (targetRef) signatureBeforePayload['targetRef'] = targetRef;
  if (params) signatureBeforePayload['params'] = params;

  const replayState: Record<string, unknown> = {
    stateSignatureBefore: buildReplayStateSignature(signatureBeforePayload),
    scoreBefore: input.beforeAnalysis.score,
    categoryScoresBefore,
    detectionSignalsBefore,
  };

  if (input.afterAnalysis && input.afterSnapshot) {
    const categoryScoresAfter = replayCategoryScores(input.afterAnalysis);
    const detectionSignalsAfter = replayDetectionSignals(input.afterSnapshot);
    const signatureAfterPayload: Record<string, unknown> = {
      score: input.afterAnalysis.score,
      categories: categoryScoresAfter,
      signals: detectionSignalsAfter,
    };
    if (targetRef) signatureAfterPayload['targetRef'] = targetRef;
    if (params) signatureAfterPayload['params'] = params;
    replayState['stateSignatureAfter'] = buildReplayStateSignature(signatureAfterPayload);
    replayState['scoreAfter'] = input.afterAnalysis.score;
    replayState['categoryScoresAfter'] = categoryScoresAfter;
    replayState['detectionSignalsAfter'] = detectionSignalsAfter;
  }

  if (targetRef) replayState['targetRef'] = targetRef;
  if (params) replayState['params'] = params;
  return replayState;
}

function buildCurrentReplayStateSignature(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  params?: Record<string, unknown>;
}): string {
  const payload: Record<string, unknown> = {
    score: input.analysis.score,
    categories: replayCategoryScores(input.analysis),
    signals: replayDetectionSignals(input.snapshot),
  };
  const params = input.params && Object.keys(input.params).length > 0
    ? Object.fromEntries(Object.entries(input.params).filter(([, value]) => value !== undefined))
    : undefined;
  if (params) payload['params'] = params;
  return buildReplayStateSignature(payload);
}

function parseDetailsObject(details: string | undefined): Record<string, unknown> | null {
  if (!details?.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function replayStateSignatureBeforeFromDetails(details: string | undefined): string | null {
  const parsed = parseDetailsObject(details);
  const debug = parsed?.['debug'];
  if (!debug || typeof debug !== 'object' || Array.isArray(debug)) return null;
  const replayState = (debug as Record<string, unknown>)['replayState'];
  if (!replayState || typeof replayState !== 'object' || Array.isArray(replayState)) return null;
  const signature = (replayState as Record<string, unknown>)['stateSignatureBefore'];
  return typeof signature === 'string' && signature.length > 0 ? signature : null;
}

export function enrichDetailsWithReplayState(
  details: string | undefined,
  input: ReplayStateInstrumentationInput,
): string {
  const parsed = parseDetailsObject(details);
  const base: Record<string, unknown> = parsed ? { ...parsed } : {};
  if (!parsed && details) base['raw'] = details;
  const debug = base['debug'] && typeof base['debug'] === 'object' && !Array.isArray(base['debug'])
    ? { ...(base['debug'] as Record<string, unknown>) }
    : {};
  debug['replayState'] = buildReplayState(input, base);
  base['debug'] = debug;
  return JSON.stringify(base);
}

function enrichRowDetailsWithReplayState(
  row: AppliedRemediationTool,
  input: ReplayStateInstrumentationInput,
): void {
  row.details = enrichDetailsWithReplayState(row.details, input);
}

export function withHeadingTargetRef(
  details: string | undefined,
  targetRef: unknown,
  outcome: AppliedRemediationTool['outcome'] = 'no_effect',
): string | undefined {
  if (typeof targetRef !== 'string' || targetRef.length === 0) return details;
  const parsed = parseMutationDetails(details);
  if (!parsed) {
    return JSON.stringify({
      outcome,
      note: details || 'heading_mutation_detail',
      invariants: { targetRef },
      debug: { targetRef },
    });
  }
  return JSON.stringify({
    ...parsed,
    invariants: {
      ...(parsed.invariants ?? {}),
      targetRef: parsed.invariants?.targetRef ?? targetRef,
    },
    debug: {
      ...(parsed.debug ?? {}),
      targetRef: parsed.debug?.['targetRef'] ?? targetRef,
    },
  });
}

const HEADING_STRUCTURE_TOOLS = new Set([
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
]);

const TABLE_STRUCTURE_TOOLS = new Set([
  'normalize_table_structure',
  'repair_native_table_headers',
  'set_table_header_cells',
]);

const FIGURE_STRUCTURE_TOOLS = new Set([
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
  'retag_as_figure',
]);

const FIGURE_OWNERSHIP_REFRESH_TOOLS = new Set([
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
  'retag_as_figure',
]);

const MAX_STAGE64_FIGURE_ALT_TARGETS_PER_RUN = Math.min(REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN, 3);

const LINK_STRUCTURE_TOOLS = new Set([
  'set_link_annotation_contents',
  'repair_native_link_structure',
  'normalize_annotation_tab_order',
  'tag_unowned_annotations',
]);

function countWeakLinkTexts(snapshot: DocumentSnapshot): number {
  let bad = 0;
  for (const link of snapshot.links) {
    const raw = link.text.trim();
    if (!raw || isGenericLinkText(raw) || isRawUrlLinkText(raw)) bad += 1;
  }
  return bad;
}

function hasAcrobatAltOwnershipRisk(snapshot: DocumentSnapshot): boolean {
  const risks = snapshot.acrobatStyleAltRisks;
  return ((risks?.nonFigureWithAltCount ?? 0)
    + (risks?.nestedFigureAltCount ?? 0)
    + (risks?.orphanedAltEmptyElementCount ?? 0)) > 0;
}

function mutationInvariantsPassForStructuralBenefit(detail: PythonMutationDetailPayload): boolean {
  const inv = detail.invariants;
  if (!inv) return true;
  if (inv.targetResolved === false) return false;
  if (inv.targetReachable === false) return false;
  if (inv.ownershipPreserved === false) return false;
  if (inv.tableTreeValidAfter === false) return false;
  if (detail.structuralBenefits?.figureAltAttachedToReachableFigure && inv.targetHasAltAfter !== true) return false;
  if (
    (detail.structuralBenefits?.figureOwnershipImproved || detail.structuralBenefits?.figureAltAttachedToReachableFigure) &&
    inv.targetIsFigureAfter === false
  ) {
    return false;
  }
  return true;
}

function appliedContradictsMutationTruth(detail: PythonMutationDetailPayload | null): boolean {
  if (!detail) return false;
  if (detail.outcome === 'no_effect' || detail.outcome === 'failed') return true;
  const inv = detail.invariants;
  return inv?.targetReachable === false ||
    inv?.targetIsFigureAfter === false ||
    inv?.tableTreeValidAfter === false ||
    inv?.ownershipPreserved === false;
}

function normalizeRecordedOutcomeForMutationTruth(
  outcome: AppliedRemediationTool['outcome'],
  details: string | undefined,
): AppliedRemediationTool['outcome'] {
  if (outcome !== 'applied') return outcome;
  return appliedContradictsMutationTruth(parseMutationDetails(details)) ? 'no_effect' : outcome;
}

function stageHasCheckerFacingStructuralBenefit(input: {
  beforeSnapshot?: DocumentSnapshot;
  afterSnapshot?: DocumentSnapshot;
  stageApplied: AppliedRemediationTool[];
}): boolean {
  const { beforeSnapshot, afterSnapshot, stageApplied } = input;
  const toolNames = new Set(stageApplied.map(tool => tool.toolName));
  const details = stageApplied.map(tool => parseMutationDetails(tool.details)).filter(Boolean);
  if (details.some(detail =>
    detail?.structuralBenefits &&
    Object.values(detail.structuralBenefits).some(Boolean) &&
    mutationInvariantsPassForStructuralBenefit(detail)
  )) {
    return true;
  }
  if (!beforeSnapshot || !afterSnapshot) return false;

  if ([...toolNames].some(name => HEADING_STRUCTURE_TOOLS.has(name))) {
    const beforeParity = buildIcjiaParity(beforeSnapshot);
    const afterParity = buildIcjiaParity(afterSnapshot);
    const beforeTreeHeadings = beforeSnapshot.detectionProfile?.headingSignals.treeHeadingCount ?? beforeSnapshot.headings.length;
    const afterTreeHeadings = afterSnapshot.detectionProfile?.headingSignals.treeHeadingCount ?? afterSnapshot.headings.length;
    const beforeDepth = beforeSnapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? 0;
    const afterDepth = afterSnapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? 0;
    if (
      afterParity.categories.heading_structure.score > beforeParity.categories.heading_structure.score ||
      afterTreeHeadings > beforeTreeHeadings ||
      afterSnapshot.headings.length > beforeSnapshot.headings.length ||
      afterDepth > beforeDepth
    ) {
      return true;
    }
  }

  if ([...toolNames].some(name => TABLE_STRUCTURE_TOOLS.has(name))) {
    const beforeHeaders = beforeSnapshot.tables.filter(table => table.hasHeaders).length;
    const afterHeaders = afterSnapshot.tables.filter(table => table.hasHeaders).length;
    const beforeSignals = beforeSnapshot.detectionProfile?.tableSignals;
    const afterSignals = afterSnapshot.detectionProfile?.tableSignals;
    const beforeBroken = (beforeSignals?.misplacedCellCount ?? 0) + (beforeSignals?.directCellUnderTableCount ?? 0);
    const afterBroken = (afterSignals?.misplacedCellCount ?? 0) + (afterSignals?.directCellUnderTableCount ?? 0);
    if (afterHeaders > beforeHeaders || afterBroken < beforeBroken) {
      return true;
    }
  }

  if ([...toolNames].some(name => FIGURE_STRUCTURE_TOOLS.has(name))) {
    const beforeFigureSignals = beforeSnapshot.detectionProfile?.figureSignals;
    const afterFigureSignals = afterSnapshot.detectionProfile?.figureSignals;
    const beforeTreeFigures = beforeFigureSignals?.treeFigureCount ?? 0;
    const afterTreeFigures = afterFigureSignals?.treeFigureCount ?? 0;
    const beforeNonFigureRoles = beforeFigureSignals?.nonFigureRoleCount ?? 0;
    const afterNonFigureRoles = afterFigureSignals?.nonFigureRoleCount ?? 0;
    if (afterTreeFigures > beforeTreeFigures || afterNonFigureRoles < beforeNonFigureRoles) {
      return true;
    }
  }

  if ([...toolNames].some(name => LINK_STRUCTURE_TOOLS.has(name))) {
    const beforeAnnotationSignals = beforeSnapshot.detectionProfile?.annotationSignals ?? beforeSnapshot.annotationAccessibility;
    const afterAnnotationSignals = afterSnapshot.detectionProfile?.annotationSignals ?? afterSnapshot.annotationAccessibility;
    const beforeWeakLinks = countWeakLinkTexts(beforeSnapshot);
    const afterWeakLinks = countWeakLinkTexts(afterSnapshot);
    const beforeMissingStructure = beforeAnnotationSignals?.linkAnnotationsMissingStructure ?? 0;
    const afterMissingStructure = afterAnnotationSignals?.linkAnnotationsMissingStructure ?? 0;
    const beforeMissingStructParent = beforeAnnotationSignals?.linkAnnotationsMissingStructParent ?? 0;
    const afterMissingStructParent = afterAnnotationSignals?.linkAnnotationsMissingStructParent ?? 0;
    if (
      afterWeakLinks < beforeWeakLinks ||
      afterMissingStructure < beforeMissingStructure ||
      afterMissingStructParent < beforeMissingStructParent
    ) {
      return true;
    }
  }

  return false;
}

function stageHasExternalStructureDebt(stageApplied: AppliedRemediationTool[]): boolean {
  const structuralTools = new Set([
    'repair_structure_conformance',
    'synthesize_basic_structure_from_layout',
    'tag_native_text_blocks',
    'normalize_heading_hierarchy',
  ]);
  for (const row of stageApplied) {
    if (row.outcome !== 'applied' || !structuralTools.has(row.toolName)) continue;
    const parsed = parseMutationDetails(row.details);
    // Prefer qpdf-verified depth (identical to ICJIA's algorithm) when available.
    const qpdfDepth = parsed?.debug?.qpdfVerifiedDepth;
    const pikepdfDepth = parsed?.debug?.rootReachableDepth;
    const depth =
      typeof qpdfDepth === 'number' && qpdfDepth >= 0
        ? qpdfDepth
        : pikepdfDepth;
    if (typeof depth === 'number' && depth <= 1) return true;
  }
  return false;
}

const PROTECTED_STAGE_CATEGORY_REGRESSION_TOLERANCE = 2;
const PROTECTED_BASELINE_FLOOR_TOLERANCE = 2;
const PROTECTED_RUN_ALT_CATEGORY_FLOOR = 80;
const STAGE_CATEGORY_REGRESSION_FLOORS: Partial<Record<CategoryKey, number>> = {
  title_language: 90,
  heading_structure: 70,
  alt_text: 70,
  table_markup: 70,
  reading_order: 40,
  form_accessibility: 90,
} as const;

function categoryScoresByKey(analysis: AnalysisResult): Map<CategoryKey, number> {
  const out = new Map<CategoryKey, number>();
  for (const category of analysis.categories) {
    if (!category.applicable) continue;
    out.set(category.key, category.score);
  }
  return out;
}

function stageHasTypedBenefitForCategory(stageApplied: AppliedRemediationTool[], key: CategoryKey): boolean {
  for (const row of stageApplied) {
    if (row.outcome !== 'applied') continue;
    const details = parseMutationDetails(row.details);
    if (!details?.structuralBenefits || !mutationInvariantsPassForStructuralBenefit(details)) continue;
    const benefits = details.structuralBenefits;
    if (key === 'heading_structure' && (benefits.headingReachabilityImproved || benefits.headingHierarchyImproved)) return true;
    if (key === 'reading_order' && (benefits.readingOrderDepthImproved || benefits.annotationOwnershipImproved)) return true;
    if (key === 'alt_text' && (benefits.figureOwnershipImproved || benefits.figureAltAttachedToReachableFigure)) return true;
    if (key === 'table_markup' && benefits.tableValidityImproved) return true;
    if (key === 'link_quality' && benefits.annotationOwnershipImproved) return true;
  }
  return false;
}

function noGainOrphanArtifactMutation(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  beforeSnapshot?: DocumentSnapshot;
  afterSnapshot?: DocumentSnapshot;
  stageApplied: AppliedRemediationTool[];
}): boolean {
  if (input.after.score !== input.before.score) return false;
  if (!input.stageApplied.some(row => row.toolName === 'remap_orphan_mcids_as_artifacts' && row.outcome === 'applied')) return false;
  return !stageHasCheckerFacingStructuralBenefit(input);
}

function stageTargetsCategory(stageApplied: AppliedRemediationTool[], key: CategoryKey): boolean {
  const tools = new Set(stageApplied.map(row => row.toolName));
  if (key === 'title_language') return tools.has('set_document_title') || tools.has('set_document_language');
  if (key === 'heading_structure') {
    return tools.has('create_heading_from_candidate') ||
      tools.has('normalize_heading_hierarchy') ||
      tools.has('repair_structure_conformance') ||
      tools.has('synthesize_basic_structure_from_layout');
  }
  if (key === 'alt_text') {
    return tools.has('normalize_nested_figure_containers') ||
      tools.has('canonicalize_figure_alt_ownership') ||
      tools.has('retag_as_figure') ||
      tools.has('set_figure_alt_text') ||
      tools.has('mark_figure_decorative') ||
      tools.has('repair_alt_text_structure');
  }
  if (key === 'table_markup') {
    return tools.has('normalize_table_structure') ||
      tools.has('repair_native_table_headers') ||
      tools.has('set_table_header_cells');
  }
  if (key === 'link_quality') {
    return tools.has('repair_native_link_structure') ||
      tools.has('tag_unowned_annotations') ||
      tools.has('set_link_annotation_contents') ||
      tools.has('normalize_annotation_tab_order');
  }
  if (key === 'reading_order') {
    return tools.has('repair_native_reading_order') ||
      tools.has('normalize_annotation_tab_order') ||
      tools.has('artifact_repeating_page_furniture') ||
      tools.has('synthesize_basic_structure_from_layout');
  }
  if (key === 'form_accessibility') return tools.has('fill_form_field_tooltips');
  if (key === 'text_extractability') {
    return tools.has('ocr_scanned_pdf') ||
      tools.has('tag_native_text_blocks') ||
      tools.has('tag_ocr_text_blocks') ||
      tools.has('embed_local_font_substitutes') ||
      tools.has('embed_urw_type1_substitutes') ||
      tools.has('embed_fonts_ghostscript') ||
      tools.has('substitute_legacy_fonts_in_place') ||
      tools.has('finalize_substituted_font_conformance');
  }
  return false;
}

function unexplainedProtectedCategoryRegression(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  stageApplied: AppliedRemediationTool[];
}): string | null {
  const beforeScores = categoryScoresByKey(input.before);
  const afterScores = categoryScoresByKey(input.after);
  for (const [key, floor] of Object.entries(STAGE_CATEGORY_REGRESSION_FLOORS) as Array<[CategoryKey, number]>) {
    const before = beforeScores.get(key);
    const after = afterScores.get(key);
    if (before == null || after == null) continue;
    if (before < floor) continue;
    if (before - after <= PROTECTED_STAGE_CATEGORY_REGRESSION_TOLERANCE) continue;
    if (stageTargetsCategory(input.stageApplied, key)) continue;
    if (stageHasTypedBenefitForCategory(input.stageApplied, key)) continue;
    return `stage_regressed_category(${key}:${before}->${after})`;
  }
  return null;
}

export interface ProtectedBaselineFloor {
  score: number;
  tolerance?: number;
  scoreCapsApplied?: ScoreCapApplied[];
  categories?: Partial<Record<CategoryKey, number>>;
}

function capIdentity(cap: ScoreCapApplied): string {
  return `${cap.category}:${cap.cap}:${cap.reason}`;
}

function hasNewStricterCap(input: {
  baselineCaps?: ScoreCapApplied[];
  candidateCaps?: ScoreCapApplied[];
}): boolean {
  const baseline = new Set((input.baselineCaps ?? []).map(capIdentity));
  return (input.candidateCaps ?? []).some(cap => !baseline.has(capIdentity(cap)));
}

function protectedBaselineFloorDetails(input: {
  baseline: ProtectedBaselineFloor;
  candidate: AnalysisResult;
}): { reason: string; details: string } | null {
  const tolerance = input.baseline.tolerance ?? PROTECTED_BASELINE_FLOOR_TOLERANCE;
  const floor = input.baseline.score - tolerance;
  if (input.candidate.score >= floor) return null;
  if (hasNewStricterCap({
    baselineCaps: input.baseline.scoreCapsApplied,
    candidateCaps: input.candidate.scoreCapsApplied,
  })) {
    return null;
  }
  const reason = `protected_baseline_floor(${input.candidate.score}<${floor})`;
  return {
    reason,
    details: JSON.stringify({
      outcome: 'rejected',
      note: reason,
      protectedBaselineScore: input.baseline.score,
      protectedCandidateScore: input.candidate.score,
      protectedFloorReason: reason,
    }),
  };
}

export function protectedBaselineFloorViolation(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
}): { reject: boolean; reason: string | null; details?: string } {
  if (!input.baseline || !Number.isFinite(input.baseline.score)) {
    return { reject: false, reason: null };
  }
  const tolerance = input.baseline.tolerance ?? PROTECTED_BASELINE_FLOOR_TOLERANCE;
  const floor = input.baseline.score - tolerance;
  if (input.before.score < floor) {
    return { reject: false, reason: null };
  }
  const violation = protectedBaselineFloorDetails({
    baseline: input.baseline,
    candidate: input.after,
  });
  if (!violation) return { reject: false, reason: null };
  return {
    reject: true,
    reason: violation.reason,
    details: violation.details,
  };
}

function protectedBaselineFloorScore(baseline: ProtectedBaselineFloor): number {
  return baseline.score - (baseline.tolerance ?? PROTECTED_BASELINE_FLOOR_TOLERANCE);
}

export function protectedBaselineStateIsSafe(input: {
  baseline?: ProtectedBaselineFloor;
  analysis: AnalysisResult;
}): boolean {
  if (!input.baseline || !Number.isFinite(input.baseline.score)) return false;
  if (input.analysis.score < protectedBaselineFloorScore(input.baseline)) return false;
  return !hasNewStricterCap({
    baselineCaps: input.baseline.scoreCapsApplied,
    candidateCaps: input.analysis.scoreCapsApplied,
  });
}

function protectedRunCategoryRegression(input: {
  baseline?: ProtectedBaselineFloor;
  after: AnalysisResult;
}): string | null {
  if (!input.baseline?.categories) return null;
  for (const [key, baselineScore] of Object.entries(input.baseline.categories) as Array<[CategoryKey, number]>) {
    if (baselineScore == null) continue;
    const requiredBaseline = key === 'alt_text' ? PROTECTED_RUN_ALT_CATEGORY_FLOOR : 90;
    if (baselineScore < requiredBaseline) continue;
    const afterScore = categoryScore(input.after, key);
    if (afterScore == null) continue;
    const floor = baselineScore - PROTECTED_BASELINE_FLOOR_TOLERANCE;
    if (afterScore < floor) {
      return `protected_run_category_regressed(${key}:${baselineScore}->${afterScore})`;
    }
  }
  return null;
}

export function protectedBaselineRunStateUnsafeReason(input: {
  baseline?: ProtectedBaselineFloor;
  analysis: AnalysisResult;
}): string | null {
  if (!input.baseline || !Number.isFinite(input.baseline.score)) return 'protected_baseline_missing';
  const floorViolation = protectedBaselineFloorDetails({
    baseline: input.baseline,
    candidate: input.analysis,
  });
  if (floorViolation) return floorViolation.reason;
  return protectedRunCategoryRegression({ baseline: input.baseline, after: input.analysis });
}

export function protectedBaselineRunStateIsSafe(input: {
  baseline?: ProtectedBaselineFloor;
  analysis: AnalysisResult;
}): boolean {
  return protectedBaselineRunStateUnsafeReason(input) === null;
}

export function protectedBaselineRunCheckpointDecision(input: {
  baseline?: ProtectedBaselineFloor;
  final: AnalysisResult;
  best?: { analysis: AnalysisResult } | null;
}): 'commit_final' | 'commit_best' | 'none' {
  if (!input.baseline || !Number.isFinite(input.baseline.score)) return 'commit_final';
  if (protectedBaselineRunStateIsSafe({ baseline: input.baseline, analysis: input.final })) {
    return 'commit_final';
  }
  if (input.best && protectedBaselineRunStateIsSafe({ baseline: input.baseline, analysis: input.best.analysis })) {
    return 'commit_best';
  }
  return 'none';
}

export function shouldReplaceProtectedSafeCheckpoint(input: {
  baseline?: ProtectedBaselineFloor;
  current?: { analysis: AnalysisResult; appliedToolCount?: number; sequence?: number } | null;
  candidate: { analysis: AnalysisResult; appliedToolCount?: number; sequence?: number };
}): boolean {
  if (!protectedBaselineRunStateIsSafe({ baseline: input.baseline, analysis: input.candidate.analysis })) {
    return false;
  }
  const current = input.current ?? null;
  if (!current) return true;
  if (input.candidate.analysis.score > current.analysis.score) return true;
  if (input.candidate.analysis.score < current.analysis.score) return false;
  const candidateApplied = input.candidate.appliedToolCount ?? Number.POSITIVE_INFINITY;
  const currentApplied = current.appliedToolCount ?? Number.POSITIVE_INFINITY;
  if (candidateApplied < currentApplied) return true;
  if (candidateApplied > currentApplied) return false;
  const candidateSequence = input.candidate.sequence ?? Number.POSITIVE_INFINITY;
  const currentSequence = current.sequence ?? Number.POSITIVE_INFINITY;
  return candidateSequence < currentSequence;
}

export function protectedBaselineReanalysisDecision(input: {
  baseline?: ProtectedBaselineFloor;
  finalReanalysis: AnalysisResult;
  bestReanalysis?: AnalysisResult | null;
}): 'commit_final' | 'commit_best' | 'none' {
  if (!input.baseline || !Number.isFinite(input.baseline.score)) return 'commit_final';
  if (protectedBaselineRunStateIsSafe({ baseline: input.baseline, analysis: input.finalReanalysis })) {
    return 'commit_final';
  }
  if (
    input.bestReanalysis &&
    protectedBaselineRunStateIsSafe({ baseline: input.baseline, analysis: input.bestReanalysis })
  ) {
    return 'commit_best';
  }
  return 'none';
}

export function protectedFinalReanalysisPolicyDecision(input: {
  baseline?: ProtectedBaselineFloor;
  final: AnalysisResult;
  best?: { analysis: AnalysisResult; appliedToolCount?: number } | null;
  appliedToolCount?: number;
  env?: NodeJS.ProcessEnv;
}): 'run' | 'skip_no_baseline' | 'skip_disabled' | 'skip_no_restore_candidate' {
  if (!input.baseline || !Number.isFinite(input.baseline.score)) return 'skip_no_baseline';
  const env = input.env ?? process.env;
  const configured = env['PDFAF_PROTECTED_FINAL_REANALYSIS']?.trim();
  if (configured === '0') return 'skip_disabled';
  if (configured === '1') return 'run';

  const best = input.best ?? null;
  if (!best || !protectedBaselineRunStateIsSafe({ baseline: input.baseline, analysis: best.analysis })) {
    return 'skip_no_restore_candidate';
  }

  const finalSafe = protectedBaselineRunStateIsSafe({ baseline: input.baseline, analysis: input.final });
  const bestIsEarlierState =
    best.appliedToolCount != null &&
    input.appliedToolCount != null &&
    best.appliedToolCount < input.appliedToolCount;
  const bestHasHigherScore = best.analysis.score > input.final.score;
  if (!finalSafe || bestIsEarlierState || bestHasHigherScore) return 'run';
  return 'skip_no_restore_candidate';
}

function protectedStrongCategoryRegression(input: {
  baseline?: ProtectedBaselineFloor;
  after: AnalysisResult;
}): string | null {
  if (!input.baseline?.categories) return null;
  for (const [key, baselineScore] of Object.entries(input.baseline.categories) as Array<[CategoryKey, number]>) {
    if (baselineScore == null || baselineScore < 90) continue;
    const afterScore = categoryScore(input.after, key);
    if (afterScore == null) continue;
    const floor = baselineScore - PROTECTED_BASELINE_FLOOR_TOLERANCE;
    if (afterScore < floor) {
      return `protected_strong_category_regressed(${key}:${baselineScore}->${afterScore})`;
    }
  }
  return null;
}

const PROTECTED_ROUTE_HIGH_RISK_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'mark_untagged_content_as_artifact',
  'artifact_repeating_page_furniture',
]);

export function protectedRouteCategoryRegressionDecision(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
  toolName: string;
}): { reject: boolean; reason: string | null; details?: string } {
  const baseline = input.baseline;
  if (!baseline?.categories || !PROTECTED_ROUTE_HIGH_RISK_TOOLS.has(input.toolName)) {
    return { reject: false, reason: null };
  }
  for (const [key, baselineScore] of Object.entries(baseline.categories) as Array<[CategoryKey, number]>) {
    if (baselineScore == null) continue;
    const requiredBaseline = key === 'alt_text' ? PROTECTED_RUN_ALT_CATEGORY_FLOOR : 90;
    if (baselineScore < requiredBaseline) continue;
    const beforeScore = categoryScore(input.before, key);
    const afterScore = categoryScore(input.after, key);
    if (beforeScore == null || afterScore == null) continue;
    const floor = baselineScore - PROTECTED_BASELINE_FLOOR_TOLERANCE;
    if (beforeScore >= floor && afterScore < floor) {
      const reason = `protected_route_category_regressed(${key}:${baselineScore}:${beforeScore}->${afterScore})`;
      return {
        reject: true,
        reason,
        details: JSON.stringify({
          outcome: 'rejected',
          note: reason,
          protectedBaselineScore: baseline.score,
          protectedBeforeScore: input.before.score,
          protectedCandidateScore: input.after.score,
          protectedBaselineCategory: key,
          protectedBaselineCategoryScore: baselineScore,
          protectedBeforeCategoryScore: beforeScore,
          protectedCandidateCategoryScore: afterScore,
          protectedFloorReason: reason,
          categoryDeltas: categoryDeltaDetails(input.before, input.after),
        }),
      };
    }
  }
  return { reject: false, reason: null };
}

export function protectedStrongAltPreservationViolation(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
}): { reject: boolean; reason: string | null; details?: string } {
  const baseline = input.baseline;
  const baselineAlt = baseline?.categories?.alt_text;
  if (!baseline || baselineAlt == null || baselineAlt < 80) {
    return { reject: false, reason: null };
  }
  if (input.after.score >= protectedBaselineFloorScore(baseline)) {
    return { reject: false, reason: null };
  }
  const beforeAlt = categoryScore(input.before, 'alt_text');
  const afterAlt = categoryScore(input.after, 'alt_text');
  if (beforeAlt == null || afterAlt == null) return { reject: false, reason: null };
  const altFloor = baselineAlt - PROTECTED_BASELINE_FLOOR_TOLERANCE;
  if (beforeAlt < altFloor || afterAlt >= altFloor) {
    return { reject: false, reason: null };
  }
  const reason = `protected_strong_alt_regressed(${baselineAlt}:${beforeAlt}->${afterAlt})`;
  return {
    reject: true,
    reason,
    details: JSON.stringify({
      outcome: 'rejected',
      note: reason,
      protectedBaselineScore: baseline.score,
      protectedCandidateScore: input.after.score,
      protectedBeforeScore: input.before.score,
      protectedBaselineAltScore: baselineAlt,
      protectedBeforeAltScore: beforeAlt,
      protectedCandidateAltScore: afterAlt,
      protectedFloorReason: reason,
    }),
  };
}

function stageHasFigureAltMutation(stageApplied: AppliedRemediationTool[]): boolean {
  return stageApplied.some(row =>
    row.toolName === 'set_figure_alt_text' ||
    row.toolName === 'retag_as_figure' ||
    row.toolName === 'canonicalize_figure_alt_ownership' ||
    row.toolName === 'normalize_nested_figure_containers'
  );
}

const FIGURE_ALT_ACCEPTANCE_TOOLS = new Set([
  'canonicalize_figure_alt_ownership',
  'retag_as_figure',
  'set_figure_alt_text',
]);

function checkerVisibleFigureCounts(snapshot?: DocumentSnapshot): { figures: number; figuresWithAlt: number } {
  const targets = snapshot?.checkerFigureTargets ?? [];
  return {
    figures: targets.filter(target => target.reachable).length,
    figuresWithAlt: targets.filter(target => target.reachable && target.hasAlt).length,
  };
}

function figureAltAcceptanceInvariantFailure(stageApplied: AppliedRemediationTool[]): boolean {
  for (const row of stageApplied) {
    if (!FIGURE_ALT_ACCEPTANCE_TOOLS.has(row.toolName) || row.outcome !== 'applied') continue;
    if (appliedContradictsMutationTruth(parseMutationDetails(row.details))) return true;
  }
  return false;
}

function stageHasDeterministicFigureAltImprovement(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  beforeSnapshot?: DocumentSnapshot;
  afterSnapshot?: DocumentSnapshot;
  stageApplied: AppliedRemediationTool[];
}): boolean {
  if (!input.stageApplied.some(row => FIGURE_ALT_ACCEPTANCE_TOOLS.has(row.toolName))) return false;
  if (figureAltAcceptanceInvariantFailure(input.stageApplied)) return false;
  const beforeAlt = categoryScore(input.before, 'alt_text');
  const afterAlt = categoryScore(input.after, 'alt_text');
  if (beforeAlt == null || afterAlt == null || afterAlt <= beforeAlt) return false;
  const beforeReadingOrder = categoryScore(input.before, 'reading_order');
  const afterReadingOrder = categoryScore(input.after, 'reading_order');
  if (
    beforeReadingOrder != null &&
    afterReadingOrder != null &&
    beforeReadingOrder - afterReadingOrder > PROTECTED_STAGE_CATEGORY_REGRESSION_TOLERANCE
  ) {
    return false;
  }
  const beforeFigures = checkerVisibleFigureCounts(input.beforeSnapshot);
  const afterFigures = checkerVisibleFigureCounts(input.afterSnapshot);
  if (
    afterFigures.figures <= beforeFigures.figures &&
    afterFigures.figuresWithAlt <= beforeFigures.figuresWithAlt
  ) {
    return false;
  }
  if (hasNewStricterCap({
    baselineCaps: input.before.scoreCapsApplied,
    candidateCaps: input.after.scoreCapsApplied,
  })) {
    return false;
  }
  return true;
}

export function shouldSkipCanonicalizeFigureAltBeforeRetag(input: {
  stageTools: PlannedRemediationTool[];
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
}): boolean {
  if (!input.stageTools.some(tool => tool.toolName === 'retag_as_figure')) return false;
  if ((categoryScore(input.analysis, 'alt_text') ?? 100) >= REMEDIATION_CATEGORY_THRESHOLD) return false;
  if (checkerVisibleFigureCounts(input.snapshot).figures > 0) return false;
  const extractedFigureCount =
    input.snapshot.detectionProfile?.figureSignals.extractedFigureCount ??
    input.snapshot.figures.length;
  if (extractedFigureCount <= 0) return false;
  return true;
}

function nonFigureStructuralCategoryCollapsed(input: {
  before: AnalysisResult;
  after: AnalysisResult;
}): boolean {
  for (const key of ['heading_structure', 'table_markup', 'reading_order'] as const) {
    const beforeScore = categoryScore(input.before, key);
    const afterScore = categoryScore(input.after, key);
    if (
      beforeScore != null &&
      afterScore != null &&
      beforeScore - afterScore > PROTECTED_STAGE_CATEGORY_REGRESSION_TOLERANCE
    ) {
      return true;
    }
  }
  return false;
}

export function hasCheckerVisibleFigureAltProgressDespiteScoreShape(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  beforeSnapshot?: DocumentSnapshot;
  afterSnapshot?: DocumentSnapshot;
  stageApplied: AppliedRemediationTool[];
}): boolean {
  if (input.after.score < input.before.score - 2) return false;
  if (figureAltAcceptanceInvariantFailure(input.stageApplied)) return false;
  if (!input.stageApplied.some(row =>
    row.toolName === 'set_figure_alt_text' &&
    row.outcome === 'applied' &&
    parseMutationDetails(row.details)?.structuralBenefits?.figureAltAttachedToReachableFigure === true
  )) {
    return false;
  }
  const beforeFigures = checkerVisibleFigureCounts(input.beforeSnapshot);
  const afterFigures = checkerVisibleFigureCounts(input.afterSnapshot);
  if (afterFigures.figures < beforeFigures.figures) return false;
  if (afterFigures.figuresWithAlt <= beforeFigures.figuresWithAlt) return false;
  if (nonFigureStructuralCategoryCollapsed(input)) return false;
  if (hasNewStricterCap({
    baselineCaps: input.before.scoreCapsApplied,
    candidateCaps: input.after.scoreCapsApplied,
  })) {
    return false;
  }
  return true;
}

function figureStageRegressedWithoutAltImprovement(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  beforeSnapshot?: DocumentSnapshot;
  afterSnapshot?: DocumentSnapshot;
  stageApplied: AppliedRemediationTool[];
}): boolean {
  if (!stageHasFigureAltMutation(input.stageApplied)) return false;
  if (input.after.score >= input.before.score) return false;
  if (hasCheckerVisibleFigureAltProgressDespiteScoreShape(input)) return false;
  const beforeAlt = categoryScore(input.before, 'alt_text');
  const afterAlt = categoryScore(input.after, 'alt_text');
  if (beforeAlt == null || afterAlt == null) return false;
  return afterAlt <= beforeAlt;
}

export function protectedStrongAltFigureStageViolation(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
  stageApplied: AppliedRemediationTool[];
}): { reject: boolean; reason: string | null } {
  const baselineAlt = input.baseline?.categories?.alt_text;
  if (baselineAlt == null || baselineAlt < 90) return { reject: false, reason: null };
  if (!stageHasFigureAltMutation(input.stageApplied)) return { reject: false, reason: null };
  if (input.after.score >= input.before.score) return { reject: false, reason: null };
  if (
    input.before.score <= 59 &&
    stageHasTypedBenefitForCategory(input.stageApplied, 'alt_text')
  ) {
    return { reject: false, reason: null };
  }
  const beforeAlt = categoryScore(input.before, 'alt_text');
  const afterAlt = categoryScore(input.after, 'alt_text');
  if (beforeAlt == null || afterAlt == null || afterAlt > beforeAlt) {
    return { reject: false, reason: null };
  }
  return {
    reject: true,
    reason: `protected_strong_alt_figure_stage_regressed(${beforeAlt}->${afterAlt})`,
  };
}

function protectedWeakAltRecoveryAllowsHeadingDrift(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
  stageApplied: AppliedRemediationTool[];
  regressionReason: string;
}): boolean {
  if (!protectedBaselineRecoveryActive(input.baseline, input.before)) return false;
  if ((input.baseline?.categories?.alt_text ?? 100) >= 90) return false;
  const m = input.regressionReason.match(
    /(?:stage_regressed_category|protected_strong_category_regressed)\((heading_structure|reading_order):(\d+(?:\.\d+)?)->(\d+(?:\.\d+)?)\)/,
  );
  if (!m) return false;
  const category = m[1];
  const afterCategoryScore = Number(m[3]);
  if (category === 'heading_structure' && afterCategoryScore < 60) return false;
  if (category === 'reading_order' && afterCategoryScore < 90) return false;
  const beforeAlt = categoryScore(input.before, 'alt_text') ?? 100;
  const afterAlt = categoryScore(input.after, 'alt_text') ?? beforeAlt;
  if (afterAlt <= beforeAlt) return false;
  return input.stageApplied.some(row =>
    row.toolName === 'set_figure_alt_text' ||
    row.toolName === 'retag_as_figure' ||
    row.toolName === 'canonicalize_figure_alt_ownership' ||
    row.toolName === 'normalize_nested_figure_containers'
  );
}

function protectedWeakAltFigureStageAllowsCategoryDrift(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
  stageApplied: AppliedRemediationTool[];
  regressionReason: string;
}): boolean {
  if (!protectedBaselineRecoveryActive(input.baseline, input.before)) return false;
  if ((input.baseline?.categories?.alt_text ?? 100) >= 90) return false;
  if (!stageHasTypedBenefitForCategory(input.stageApplied, 'alt_text')) return false;
  const m = input.regressionReason.match(
    /stage_regressed_category\((heading_structure|reading_order):(\d+(?:\.\d+)?)->(\d+(?:\.\d+)?)\)/,
  );
  if (!m) return false;
  const category = m[1];
  const afterCategoryScore = Number(m[3]);
  if (category === 'heading_structure' && afterCategoryScore < 60) return false;
  if (category === 'reading_order' && afterCategoryScore < 90) return false;
  const beforeAlt = categoryScore(input.before, 'alt_text') ?? 100;
  const afterAlt = categoryScore(input.after, 'alt_text') ?? beforeAlt;
  return afterAlt >= beforeAlt;
}

function protectedBaselineRecoveryActive(
  baseline: ProtectedBaselineFloor | undefined,
  analysis: AnalysisResult,
): boolean {
  if (!baseline || !Number.isFinite(baseline.score)) return false;
  const floor = baseline.score - (baseline.tolerance ?? PROTECTED_BASELINE_FLOOR_TOLERANCE);
  return analysis.score < floor;
}

export function shouldSkipProtectedFigureAlt(input: {
  baseline?: ProtectedBaselineFloor;
  currentAltScore?: number | null;
  inProtectedTransaction?: boolean;
}): boolean {
  const baseline = input.baseline;
  if (!baseline || input.inProtectedTransaction) return false;
  const baselineAlt = baseline.categories?.alt_text;
  const currentAlt = input.currentAltScore ?? null;
  if (baseline.score >= 98) return true;
  if (baselineAlt != null && baselineAlt >= 90 && currentAlt != null && currentAlt >= 70) {
    return true;
  }
  return false;
}

export function protectedTransactionDecision(input: {
  baseline?: ProtectedBaselineFloor;
  final: AnalysisResult;
  best?: { analysis: AnalysisResult } | null;
}): 'commit_final' | 'commit_best' | 'rollback' {
  if (input.baseline && Number.isFinite(input.baseline.score) && input.final.score >= protectedBaselineFloorScore(input.baseline)) {
    return 'commit_final';
  }
  if (protectedBaselineStateIsSafe({ baseline: input.baseline, analysis: input.final })) {
    return 'commit_final';
  }
  if (
    input.baseline &&
    input.best &&
    Number.isFinite(input.baseline.score) &&
    input.best.analysis.score >= protectedBaselineFloorScore(input.baseline)
  ) {
    return 'commit_best';
  }
  if (input.best && protectedBaselineStateIsSafe({ baseline: input.baseline, analysis: input.best.analysis })) {
    return 'commit_best';
  }
  return 'rollback';
}

function isMutationTimeout(outcome: AppliedRemediationTool['outcome'], details?: string): boolean {
  return outcome === 'failed' && typeof details === 'string' && /timeout\s+\d+ms/i.test(details);
}

function protectedBaselineNeedsTransaction(input: {
  baseline?: ProtectedBaselineFloor;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
}): boolean {
  const baseline = input.baseline;
  if (!protectedBaselineRecoveryActive(baseline, input.analysis) || !baseline) return false;
  const baselineAlt = baseline.categories?.alt_text;
  const currentAlt = categoryScore(input.analysis, 'alt_text');
  if (hasAcrobatAltOwnershipRisk(input.snapshot)) return true;
  if (
    baselineAlt != null &&
    currentAlt != null &&
    (
      (baselineAlt >= 90 && currentAlt < baselineAlt - PROTECTED_BASELINE_FLOOR_TOLERANCE) ||
      (baselineAlt < 90 && currentAlt < Math.max(70, baselineAlt))
    )
  ) {
    return true;
  }
  const baselineHeading = baseline.categories?.heading_structure;
  const currentHeading = categoryScore(input.analysis, 'heading_structure');
  if (baselineHeading != null && baselineHeading >= 90 && currentHeading != null && currentHeading < baselineHeading - PROTECTED_BASELINE_FLOOR_TOLERANCE) {
    return true;
  }
  return false;
}

export function shouldRejectStageResult(input: {
  filename?: string;
  before: AnalysisResult;
  after: AnalysisResult;
  beforeSnapshot?: DocumentSnapshot;
  afterSnapshot?: DocumentSnapshot;
  stage: RemediationStagePlan;
  stageApplied: AppliedRemediationTool[];
  protectedBaseline?: ProtectedBaselineFloor;
}): { reject: boolean; reason: string | null } {
  const ocrBypass = keepOcrStageDespiteScoreDrop(input.stage, input.stageApplied);
  if (noGainOrphanArtifactMutation(input)) {
    return {
      reject: true,
      reason: 'stage_no_gain_orphan_artifact_mutation',
    };
  }
  if (input.after.score < input.before.score && ocrBypass && protectedBaselineRecoveryActive(input.protectedBaseline, input.before)) {
    return {
      reject: true,
      reason: `stage_regressed_protected_ocr(${input.after.score})`,
    };
  }
  if (input.after.score < input.before.score && !ocrBypass) {
    const strongAltFigureRegression = protectedStrongAltFigureStageViolation({
      baseline: input.protectedBaseline,
      before: input.before,
      after: input.after,
      stageApplied: input.stageApplied,
    });
    if (strongAltFigureRegression.reject) {
      return {
        reject: true,
        reason: strongAltFigureRegression.reason,
      };
    }
    if (figureStageRegressedWithoutAltImprovement(input)) {
      return {
        reject: true,
        reason: `figure_stage_regressed_without_alt_improvement(${input.after.score})`,
      };
    }
    if (
      input.before.score - input.after.score <= 10 &&
      stageHasCheckerFacingStructuralBenefit(input)
    ) {
      return {
        reject: false,
        reason: null,
      };
    }
    return {
      reject: true,
      reason: `stage_regressed_score(${input.after.score})`,
    };
  }
  if (input.after.score > input.before.score) {
    const categoryRegression = unexplainedProtectedCategoryRegression(input);
    if (categoryRegression) {
      if (protectedWeakAltRecoveryAllowsHeadingDrift({
        baseline: input.protectedBaseline,
        before: input.before,
        after: input.after,
        stageApplied: input.stageApplied,
        regressionReason: categoryRegression,
      }) || protectedWeakAltFigureStageAllowsCategoryDrift({
        baseline: input.protectedBaseline,
        before: input.before,
        after: input.after,
        stageApplied: input.stageApplied,
        regressionReason: categoryRegression,
      })) {
        return {
          reject: false,
          reason: null,
        };
      }
      return {
        reject: true,
        reason: categoryRegression,
      };
    }
    const confidence = compareStructuralConfidence(input.before, input.after);
    if (confidence.regressed) {
      if (hasCheckerVisibleFigureAltProgressDespiteScoreShape(input)) {
        return {
          reject: false,
          reason: null,
        };
      }
      return {
        reject: true,
        reason: confidence.reason,
      };
    }
    if (stageHasExternalStructureDebt(input.stageApplied)) {
      return {
        reject: true,
        reason: 'stage_externally_incomplete(rootReachableDepth<=1)',
      };
    }
    if (input.beforeSnapshot && input.afterSnapshot && input.stageApplied.some(row => isStage35StructuralTool(row.toolName))) {
      const beforeParity = buildIcjiaParity(input.beforeSnapshot);
      const afterParity = buildIcjiaParity(input.afterSnapshot);
      if (
        afterParity.categories.reading_order.score <= 30 &&
        afterParity.signals.structTreeDepth <= 1 &&
        afterParity.categories.reading_order.score <= beforeParity.categories.reading_order.score
      ) {
        return {
          reject: true,
          reason: 'stage_externally_incomplete(parityReadingOrder=30)',
        };
      }
    }
  }
  return {
    reject: false,
    reason: null,
  };
}

function summarizeStructuralConfidenceGuard(
  tools: AppliedRemediationTool[],
): StructuralConfidenceGuardSummary | undefined {
  const rollbackRows = tools.filter(
    tool => tool.details?.startsWith('stage_regressed_structural_confidence(') === true,
  );
  if (rollbackRows.length === 0) return undefined;
  return {
    rollbackCount: rollbackRows.length,
    lastRollbackReason: rollbackRows[rollbackRows.length - 1]?.details ?? null,
  };
}

function buildOcrPipelineSummary(tools: AppliedRemediationTool[]): OcrPipelineSummary | undefined {
  const ocrRows = tools.filter(t => t.toolName === 'ocr_scanned_pdf');
  if (ocrRows.length === 0) return undefined;
  const applied = ocrRows.some(t => t.outcome === 'applied');
  const guidanceApplied =
    'OCR (searchable text) was added via OCRmyPDF/Tesseract. Headline scores here do not measure OCR accuracy, visual fidelity, or Adobe/PAC PDF/UA conformance — schedule human review before publication.';
  const guidanceIncomplete =
    'OCR was attempted but not completed as an applied pass (failed, reverted, or no-op). Text may still be partially image-based; verify with assistive technology.';
  return {
    applied,
    attempted: true,
    humanReviewRecommended: true,
    guidance: applied ? guidanceApplied : guidanceIncomplete,
  };
}

function frequencyRows(values: string[]): Array<RemediationBoundedWorkSummary['deterministicEarlyExitReasons'][number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function emptyRuntimeSummary(before: AnalysisResult): RemediationRuntimeSummary {
  return {
    analysisBefore: before.runtimeSummary ?? null,
    analysisAfter: null,
    deterministicTotalMs: 0,
    stageTimings: [],
    toolTimings: [],
    semanticLaneTimings: [],
    boundedWork: {
      semanticCandidateCapsHit: 0,
      deterministicEarlyExitCount: 0,
      deterministicEarlyExitReasons: [],
      semanticSkipReasons: [],
      zeroHeadingLaneActivations: 0,
      headingConvergenceAttemptCount: 0,
      headingConvergenceSuccessCount: 0,
      headingConvergenceFailureCount: 0,
      headingConvergenceTimeoutCount: 0,
      structureConformanceTimeoutCount: 0,
    },
  };
}

function pushStageTiming(
  runtimeSummary: RemediationRuntimeSummary,
  input: Omit<RemediationStageRuntimeSummary, 'key'>,
): void {
  runtimeSummary.stageTimings.push({
    ...input,
    key: `${input.source}:stage${input.stageNumber}`,
  });
}

function noteEarlyExit(runtimeSummary: RemediationRuntimeSummary, reason: string): void {
  const reasons = [
    ...runtimeSummary.boundedWork.deterministicEarlyExitReasons.flatMap(row => Array(row.count).fill(row.key)),
    reason,
  ];
  runtimeSummary.boundedWork.deterministicEarlyExitCount = reasons.length;
  runtimeSummary.boundedWork.deterministicEarlyExitReasons = frequencyRows(reasons);
}

function hasRemainingHeadingBootstrapAttempts(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  appliedTools: AppliedRemediationTool[],
): boolean {
  const heading = analysis.categories.find(category => category.key === 'heading_structure');
  if (!heading?.applicable || heading.score >= REMEDIATION_CATEGORY_THRESHOLD) return false;
  if (analysis.pdfClass === 'scanned') return false;
  if (snapshot.structureTree == null || (snapshot.paragraphStructElems?.length ?? 0) === 0) return false;
  if (
    snapshot.headings.length > 0 &&
    snapshot.detectionProfile?.headingSignals.extractedHeadingsMissingFromTree !== true
  ) {
    return false;
  }
  const candidates = buildEligibleHeadingBootstrapCandidates(snapshot);
  if (candidates.length === 0) return false;
  const attempts = appliedTools.filter(tool => tool.toolName === 'create_heading_from_candidate').length;
  return attempts < candidates.length;
}

function headingCreationConverged(snapshot: DocumentSnapshot): boolean {
  const headingSignals = snapshot.detectionProfile?.headingSignals;
  const readingOrderSignals = snapshot.detectionProfile?.readingOrderSignals;
  return (
    snapshot.headings.length > 0 &&
    headingSignals?.extractedHeadingsMissingFromTree !== true &&
    (headingSignals?.treeHeadingCount ?? snapshot.headings.length) > 0 &&
    (readingOrderSignals?.structureTreeDepth ?? 0) > 1
  );
}

function protectedZeroHeadingBundleActive(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  stage: RemediationStagePlan,
): boolean {
  const toolNames = new Set(stage.tools.map(tool => tool.toolName));
  return isProtectedZeroHeadingConvergence(analysis, snapshot)
    && toolNames.has('create_heading_from_candidate')
    && toolNames.has('normalize_heading_hierarchy')
    && toolNames.has('repair_structure_conformance');
}

async function bufferSha256(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex');
}

function pythonMutationDetails(
  result: Awaited<ReturnType<typeof runPythonMutationBatch>>['result'],
  toolName: string,
): string | undefined {
  const op = result.opResults?.find(row => row.op === toolName);
  if (!op) return undefined;
  return pythonMutationDetailsFromOpResult(op);
}

type PythonMutationOpResult = NonNullable<Awaited<ReturnType<typeof runPythonMutationBatch>>['result']['opResults']>[number];

function pythonMutationDetailsFromOpResult(op: PythonMutationOpResult): string {
  const payload: PythonMutationDetailPayload = { outcome: op.outcome };
  if (op.note) payload['note'] = op.note;
  if (op.error) payload['error'] = op.error;
  if (op.invariants) payload['invariants'] = op.invariants;
  if (op.structuralBenefits) payload['structuralBenefits'] = op.structuralBenefits;
  if (op.debug) payload['debug'] = op.debug;
  return JSON.stringify(payload);
}

export function withBatchMetadata(
  details: string | undefined,
  meta: { batchId: string; batchRole: string; batchIndex: number; batchSize: number },
): string {
  const parsed = parseMutationDetails(details);
  const payload: Record<string, unknown> = parsed
    ? { ...parsed }
    : { outcome: 'no_effect', note: details ?? 'batch_mutation_detail' };
  payload['batchId'] = meta.batchId;
  payload['batchRole'] = meta.batchRole;
  payload['batchIndex'] = meta.batchIndex;
  payload['batchSize'] = meta.batchSize;
  return JSON.stringify(payload);
}

const STAGE39_BATCH_DEFINITIONS = [
  {
    role: 'figure_ownership_alt',
    tools: ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'set_figure_alt_text'],
  },
  {
    role: 'figure_ownership_alt',
    tools: ['canonicalize_figure_alt_ownership', 'set_figure_alt_text'],
  },
  {
    role: 'table_headers',
    tools: ['repair_native_table_headers', 'set_table_header_cells'],
  },
  {
    role: 'annotation_link_ownership',
    tools: ['repair_native_link_structure', 'tag_unowned_annotations', 'set_link_annotation_contents', 'normalize_annotation_tab_order'],
  },
  {
    role: 'annotation_link_ownership',
    tools: ['repair_native_link_structure', 'set_link_annotation_contents', 'tag_unowned_annotations'],
  },
] as const;

type Stage39BatchRole = typeof STAGE39_BATCH_DEFINITIONS[number]['role'];

interface Stage39BatchCandidate {
  role: Stage39BatchRole;
  tools: PlannedRemediationTool[];
}

function sameRouteForBatch(tools: PlannedRemediationTool[]): boolean {
  const firstRoute = tools[0]?.route;
  return firstRoute != null && tools.every(tool => tool.route === firstRoute);
}

export function selectStage39Batch(
  tools: PlannedRemediationTool[],
  startIndex: number,
  options?: { enabled?: boolean },
): Stage39BatchCandidate | null {
  const enabled = options?.enabled ?? process.env['PDFAF_STAGE39_BATCHING'] === '1';
  if (!enabled) return null;
  for (const def of STAGE39_BATCH_DEFINITIONS) {
    const slice = tools.slice(startIndex, startIndex + def.tools.length);
    if (slice.length !== def.tools.length) continue;
    if (!def.tools.every((name, index) => slice[index]?.toolName === name)) continue;
    if (!sameRouteForBatch(slice)) continue;
    if (!slice.every(tool => isToolAllowedByRouteContract(tool.route, tool.toolName))) continue;
    return { role: def.role, tools: slice };
  }
  return null;
}

function hasRequiredBatchParams(tool: PlannedRemediationTool): boolean {
  if (
    tool.toolName === 'normalize_nested_figure_containers' ||
    tool.toolName === 'canonicalize_figure_alt_ownership' ||
    tool.toolName === 'set_figure_alt_text' ||
    tool.toolName === 'repair_native_table_headers' ||
    tool.toolName === 'set_table_header_cells'
  ) {
    const ref = tool.params['structRef'] ?? tool.params['targetRef'];
    return typeof ref === 'string' && ref.length > 0;
  }
  return true;
}

function invalidatingBatchInvariant(details: PythonMutationDetailPayload | null): boolean {
  const inv = details?.invariants;
  return inv?.targetResolved === false ||
    inv?.targetReachable === false ||
    inv?.ownershipPreserved === false ||
    inv?.tableTreeValidAfter === false;
}

export function batchHasValidStructuralBenefit(rows: Array<{ outcome: AppliedRemediationTool['outcome']; details?: string }>): boolean {
  return rows.some(row => {
    if (row.outcome !== 'applied') return false;
    const details = parseMutationDetails(row.details);
    return Boolean(
      details?.structuralBenefits &&
      Object.values(details.structuralBenefits).some(Boolean) &&
      mutationInvariantsPassForStructuralBenefit(details) &&
      !invalidatingBatchInvariant(details),
    );
  });
}

export async function runStage39Batch(
  buffer: Buffer,
  batch: Stage39BatchCandidate,
): Promise<{
  buffer: Buffer;
  rows: Array<{
    tool: PlannedRemediationTool;
    outcome: AppliedRemediationTool['outcome'];
    details?: string;
    durationMs: number;
  }>;
}> {
  const started = performance.now();
  const batchId = `stage39-${randomUUID()}`;
  if (!batch.tools.every(hasRequiredBatchParams)) {
    const durationMs = performance.now() - started;
    return {
      buffer,
      rows: batch.tools.map((tool, index) => ({
        tool,
        outcome: 'rejected',
        details: withBatchMetadata(JSON.stringify({
          outcome: 'rejected',
          note: 'batch_missing_required_params',
        }), {
          batchId,
          batchRole: batch.role,
          batchIndex: index,
          batchSize: batch.tools.length,
        }),
        durationMs: index === 0 ? durationMs : 0,
      })),
    };
  }

  const { buffer: next, result } = await runPythonMutationBatch(
    buffer,
    batch.tools.map(tool => ({ op: tool.toolName, params: tool.params })),
    { abortOnFailedOp: true, reopenBetweenOps: true },
  );
  const totalMs = performance.now() - started;
  const perToolMs = totalMs / Math.max(1, batch.tools.length);
  const opRows = result.opResults ?? [];
  const firstFailureIndex = batch.tools.findIndex(tool =>
    opRows.some(row => row.op === tool.toolName && row.outcome === 'failed')
    || result.failed.some(row => row.op === tool.toolName)
  );
  const hardFailed = !result.success || firstFailureIndex >= 0;

  const rows = batch.tools.map((tool, index) => {
    const op = opRows.find(row => row.op === tool.toolName);
    let outcome: AppliedRemediationTool['outcome'] = 'no_effect';
    let details = op ? pythonMutationDetailsFromOpResult(op) : undefined;
    if (hardFailed) {
      if (index > firstFailureIndex && firstFailureIndex >= 0) {
        outcome = 'rejected';
        details = JSON.stringify({ outcome: 'rejected', note: 'batch_aborted_after_failure' });
      } else if (op?.outcome === 'failed' || result.failed.some(row => row.op === tool.toolName)) {
        outcome = 'failed';
        details = details ?? JSON.stringify({ outcome: 'failed', note: 'batch_failed' });
      } else {
        outcome = 'rejected';
        details = JSON.stringify({ outcome: 'rejected', note: 'batch_aborted_after_failure' });
      }
    } else if (op?.outcome === 'failed') {
      outcome = 'failed';
    } else if (op?.outcome === 'applied') {
      outcome = 'applied';
    } else if (op?.outcome === 'no_effect' || isStage35StructuralTool(tool.toolName)) {
      outcome = 'no_effect';
    } else if (result.applied.includes(tool.toolName)) {
      outcome = 'applied';
    }

    return {
      tool,
      outcome,
      details: withBatchMetadata(details, {
        batchId,
        batchRole: batch.role,
        batchIndex: index,
        batchSize: batch.tools.length,
      }),
      durationMs: perToolMs,
    };
  });

  return {
    buffer: hardFailed ? buffer : next,
    rows,
  };
}

interface RemediationState {
  buffer: Buffer;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
}

const STAGE35_STRUCTURAL_TOOLS = new Set([
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
  'retag_as_figure',
  'set_figure_alt_text',
  'mark_figure_decorative',
  'repair_alt_text_structure',
  'normalize_table_structure',
  'repair_native_table_headers',
  'set_table_header_cells',
  'tag_unowned_annotations',
  'repair_native_link_structure',
  'set_link_annotation_contents',
  'normalize_annotation_tab_order',
  'repair_annotation_alt_text',
]);

export function isStage35StructuralTool(toolName: string): boolean {
  return STAGE35_STRUCTURAL_TOOLS.has(toolName);
}

const SAME_STATE_NO_GAIN_RUNTIME_CAP_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'mark_untagged_content_as_artifact',
  'artifact_repeating_page_furniture',
  'normalize_heading_hierarchy',
  'normalize_annotation_tab_order',
  'repair_structure_conformance',
]);

function sameStateNoGainRuntimeKey(toolName: string, stateSignatureBefore: string): string | null {
  if (!SAME_STATE_NO_GAIN_RUNTIME_CAP_TOOLS.has(toolName)) return null;
  if (!stateSignatureBefore) return null;
  return `${toolName}:${stateSignatureBefore}`;
}

export function shouldSkipSameStateNoGainRuntimeAttempt(input: {
  toolName: string;
  stateSignatureBefore: string;
  noGainAttempts: ReadonlySet<string>;
}): boolean {
  const key = sameStateNoGainRuntimeKey(input.toolName, input.stateSignatureBefore);
  return key ? input.noGainAttempts.has(key) : false;
}

export function shouldRecordSameStateNoGainRuntimeAttempt(input: {
  toolName: string;
  stateSignatureBefore: string | null;
  outcome: AppliedRemediationTool['outcome'];
  scoreBefore: number;
  scoreAfter: number;
}): boolean {
  if (!input.stateSignatureBefore) return false;
  if (input.outcome !== 'rejected' && input.outcome !== 'no_effect') return false;
  if (input.scoreAfter > input.scoreBefore) return false;
  return sameStateNoGainRuntimeKey(input.toolName, input.stateSignatureBefore) !== null;
}

function recordSameStateNoGainRuntimeAttempt(
  row: AppliedRemediationTool,
  noGainAttempts: Set<string>,
  fallbackStateSignatureBefore?: string,
): void {
  const stateSignatureBefore = replayStateSignatureBeforeFromDetails(row.details) ?? fallbackStateSignatureBefore ?? null;
  if (!shouldRecordSameStateNoGainRuntimeAttempt({
    toolName: row.toolName,
    stateSignatureBefore,
    outcome: row.outcome,
    scoreBefore: row.scoreBefore,
    scoreAfter: row.scoreAfter,
  })) {
    return;
  }
  const key = sameStateNoGainRuntimeKey(row.toolName, stateSignatureBefore!);
  if (key) noGainAttempts.add(key);
}

async function reanalyzeBufferForMutation(
  buf: Buffer,
  filename: string,
  prefix: string,
): Promise<Awaited<ReturnType<typeof analyzePdf>>> {
  const tmpPath = join(tmpdir(), `${prefix}-${randomUUID()}.pdf`);
  await writeFile(tmpPath, buf);
  try {
    return await analyzePdf(tmpPath, filename);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

function fontEvidenceImproved(input: {
  beforeAnalysis: AnalysisResult;
  afterAnalysis: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
}): boolean {
  const beforeRisk = input.beforeSnapshot.fonts.filter(font => Boolean(font.encodingRisk)).length;
  const afterRisk = input.afterSnapshot.fonts.filter(font => Boolean(font.encodingRisk)).length;
  if (afterRisk < beforeRisk) return true;
  const beforeEmbedded = input.beforeSnapshot.fonts.filter(font => font.isEmbedded).length;
  const afterEmbedded = input.afterSnapshot.fonts.filter(font => font.isEmbedded).length;
  if (afterEmbedded > beforeEmbedded) return true;
  const beforeUnicode = input.beforeSnapshot.fonts.filter(font => font.hasUnicode).length;
  const afterUnicode = input.afterSnapshot.fonts.filter(font => font.hasUnicode).length;
  if (afterUnicode > beforeUnicode) return true;
  const beforeText = categoryScore(input.beforeAnalysis, 'text_extractability');
  const afterText = categoryScore(input.afterAnalysis, 'text_extractability');
  return beforeText !== null && afterText !== null && afterText > beforeText;
}

function figureAltMutationAttemptCount(rows: AppliedRemediationTool[]): number {
  return rows.filter(row => row.toolName === 'set_figure_alt_text').length;
}

function altRepairBenefitOverridesConfidenceGuard(
  toolName: string,
  before: AnalysisResult,
  after: AnalysisResult,
): boolean {
  if (toolName !== 'repair_alt_text_structure') return false;
  if (after.score <= before.score) return false;
  const beforeAlt = categoryScore(before, 'alt_text');
  const afterAlt = categoryScore(after, 'alt_text');
  return beforeAlt !== null && afterAlt !== null && afterAlt >= beforeAlt;
}

function postPassCategoryBenefitAllowsSmallScoreRegression(
  toolName: string,
  before: AnalysisResult,
  after: AnalysisResult,
): boolean {
  const categoryByTool: Record<string, string> = {
    set_pdfua_identification: 'pdf_ua_compliance',
    set_document_title: 'title_language',
    set_document_language: 'title_language',
    post_pass_bookmarks: 'bookmarks',
    embed_local_font_substitutes: 'text_extractability',
    embed_urw_type1_substitutes: 'text_extractability',
    embed_fonts_ghostscript: 'text_extractability',
  };
  const category = categoryByTool[toolName];
  if (!category) return false;
  if (after.score < before.score - 1) return false;
  const beforeCategory = categoryScore(before, category);
  const afterCategory = categoryScore(after, category);
  return beforeCategory !== null && afterCategory !== null && afterCategory > beforeCategory;
}

function isTeamsProtectedReadingRow(filename: string): boolean {
  return /microsoft_teams_quickstart/i.test(filename)
    && (/remediated/i.test(filename) || /targeted-wave1|targeted-figures-wave1/i.test(filename));
}

function protectedStructuralCategoryRegression(input: {
  before: AnalysisResult;
  after: AnalysisResult;
}): string | null {
  const structuralKeys: CategoryKey[] = [
    'heading_structure',
    'alt_text',
    'table_markup',
    'reading_order',
    'link_quality',
    'form_accessibility',
  ];
  for (const key of structuralKeys) {
    const before = categoryScore(input.before, key);
    const after = categoryScore(input.after, key);
    if (before == null || after == null) continue;
    if (before - after > PROTECTED_STAGE_CATEGORY_REGRESSION_TOLERANCE) {
      return `protected_metadata_topup_structural_regression(${key}:${before}->${after})`;
    }
  }
  return null;
}

function categoryDeltaDetails(before: AnalysisResult, after: AnalysisResult): Record<string, { before: number | null; after: number | null }> {
  return {
    title_language: {
      before: categoryScore(before, 'title_language'),
      after: categoryScore(after, 'title_language'),
    },
    pdf_ua_compliance: {
      before: categoryScore(before, 'pdf_ua_compliance'),
      after: categoryScore(after, 'pdf_ua_compliance'),
    },
    heading_structure: {
      before: categoryScore(before, 'heading_structure'),
      after: categoryScore(after, 'heading_structure'),
    },
    alt_text: {
      before: categoryScore(before, 'alt_text'),
      after: categoryScore(after, 'alt_text'),
    },
    table_markup: {
      before: categoryScore(before, 'table_markup'),
      after: categoryScore(after, 'table_markup'),
    },
    reading_order: {
      before: categoryScore(before, 'reading_order'),
      after: categoryScore(after, 'reading_order'),
    },
  };
}

export function protectedMetadataTopupDecision(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
}): { accept: boolean; reason: string | null; details?: string } {
  if (!protectedBaselineRecoveryActive(input.baseline, input.before)) {
    return { accept: false, reason: 'protected_metadata_topup_not_needed' };
  }
  const baseline = input.baseline!;
  const beforeTitle = categoryScore(input.before, 'title_language') ?? 0;
  const afterTitle = categoryScore(input.after, 'title_language') ?? beforeTitle;
  const beforePdfUa = categoryScore(input.before, 'pdf_ua_compliance') ?? 0;
  const afterPdfUa = categoryScore(input.after, 'pdf_ua_compliance') ?? beforePdfUa;
  const titleImproved = afterTitle > beforeTitle;
  const pdfUaImproved = afterPdfUa > beforePdfUa;
  const structuralRegression = protectedStructuralCategoryRegression({
    before: input.before,
    after: input.after,
  });
  const newCap = hasNewStricterCap({
    baselineCaps: baseline.scoreCapsApplied,
    candidateCaps: input.after.scoreCapsApplied,
  });
  const floor = protectedBaselineFloorScore(baseline);
  const regressionReduced = input.after.score > input.before.score;
  const reachesFloor = input.after.score >= floor;
  const accept = (titleImproved || pdfUaImproved) &&
    !structuralRegression &&
    !newCap &&
    (reachesFloor || regressionReduced);
  const note = accept ? 'protected_metadata_topup' : 'protected_metadata_topup_rejected';
  const reason = accept
    ? null
    : structuralRegression
      ?? (newCap ? 'protected_metadata_topup_new_stricter_cap' : null)
      ?? (!titleImproved && !pdfUaImproved ? 'protected_metadata_topup_no_metadata_improvement' : null)
      ?? (!reachesFloor && !regressionReduced ? `protected_metadata_topup_no_floor_progress(${input.after.score}<=${input.before.score})` : null)
      ?? 'protected_metadata_topup_rejected';
  return {
    accept,
    reason,
    details: JSON.stringify({
      outcome: accept ? 'applied' : 'rejected',
      note,
      protectedBaselineScore: baseline.score,
      protectedCandidateScore: input.after.score,
      protectedBeforeScore: input.before.score,
      protectedFloorScore: floor,
      protectedFloorReason: reason,
      categoryDeltas: categoryDeltaDetails(input.before, input.after),
    }),
  };
}

async function applyProtectedMetadataTopup(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  currentBuffer: Buffer;
  currentAnalysis: AnalysisResult;
  currentSnapshot: DocumentSnapshot;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot; accepted: boolean }> {
  const {
    filename,
    signal,
    round,
    currentBuffer,
    currentAnalysis,
    currentSnapshot,
    appliedTools,
    runtimeSummary,
    protectedBaseline,
  } = args;
  if (!protectedBaselineRecoveryActive(protectedBaseline, currentAnalysis)) {
    return { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot, accepted: false };
  }
  const baselineTitle = protectedBaseline?.categories?.title_language ?? 100;
  const baselinePdfUa = protectedBaseline?.categories?.pdf_ua_compliance ?? 100;
  const currentTitle = categoryScore(currentAnalysis, 'title_language') ?? 0;
  const currentPdfUa = categoryScore(currentAnalysis, 'pdf_ua_compliance') ?? 0;
  if (currentTitle >= Math.min(90, baselineTitle) && currentPdfUa >= Math.min(83, baselinePdfUa)) {
    return { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot, accepted: false };
  }

  let liveBuffer = currentBuffer;
  let liveAnalysis = currentAnalysis;
  let liveSnapshot = currentSnapshot;
  let acceptedAny = false;
  let sawRejectedCandidate = false;

  const attempt = async (
    toolName: 'set_document_title' | 'set_document_language' | 'set_pdfua_identification',
  ): Promise<void> => {
    if (sawRejectedCandidate) return;
    const started = performance.now();
    let candidateBuffer = liveBuffer;
    if (toolName === 'set_document_title') {
      const title = deriveFallbackDocumentTitle(liveSnapshot, filename);
      candidateBuffer = await metadataTools.setDocumentTitle(liveBuffer, title);
    } else if (toolName === 'set_document_language') {
      const lang = (liveSnapshot.lang || liveSnapshot.metadata.language || 'en-US').trim() || 'en-US';
      candidateBuffer = await metadataTools.setDocumentLanguage(liveBuffer, lang);
    } else {
      const lang = String(liveSnapshot.lang || liveSnapshot.metadata.language || 'en-US').slice(0, 32);
      const ua = await runPythonMutationBatch(
        liveBuffer,
        [{ op: 'set_pdfua_identification', params: { language: lang } }],
        { signal },
      );
      if (!ua.result.success || !ua.result.applied.includes('set_pdfua_identification')) {
        return;
      }
      candidateBuffer = ua.buffer;
    }
    const durationMs = performance.now() - started;
    if (candidateBuffer.equals(liveBuffer)) {
      return;
    }
    const analyzed = await reanalyzeBufferForMutation(candidateBuffer, filename, 'pdfaf-protected-metadata');
    const decision = protectedMetadataTopupDecision({
      baseline: protectedBaseline,
      before: liveAnalysis,
      after: analyzed.result,
    });
    const details = decision.details ?? JSON.stringify({
      outcome: decision.accept ? 'applied' : 'rejected',
      note: decision.accept ? 'protected_metadata_topup' : 'protected_metadata_topup_rejected',
      protectedBaselineScore: protectedBaseline?.score,
      protectedCandidateScore: analyzed.result.score,
      protectedBeforeScore: liveAnalysis.score,
      protectedFloorReason: decision.reason,
    });
    appliedTools.push({
      toolName,
      stage: 14,
      round,
      scoreBefore: liveAnalysis.score,
      scoreAfter: decision.accept ? analyzed.result.score : liveAnalysis.score,
      delta: (decision.accept ? analyzed.result.score : liveAnalysis.score) - liveAnalysis.score,
      outcome: decision.accept ? 'applied' : 'rejected',
      details: enrichDetailsWithReplayState(details, {
        beforeAnalysis: liveAnalysis,
        beforeSnapshot: liveSnapshot,
        afterAnalysis: analyzed.result,
        afterSnapshot: analyzed.snapshot,
      }),
      durationMs,
      source: 'post_pass',
    });
    runtimeSummary?.toolTimings.push({
      toolName,
      stage: 14,
      round,
      source: 'post_pass',
      durationMs,
      outcome: decision.accept ? 'applied' : 'rejected',
    });
    if (!decision.accept) {
      sawRejectedCandidate = true;
      return;
    }
    acceptedAny = true;
    liveBuffer = candidateBuffer;
    liveAnalysis = analyzed.result;
    liveSnapshot = analyzed.snapshot;
  };

  const existingTitle = liveSnapshot.metadata.title?.trim();
  if (currentTitle < Math.min(90, baselineTitle) || isFilenameLikeTitle(existingTitle)) {
    await attempt('set_document_title');
  }

  const existingLanguage = (liveSnapshot.lang || liveSnapshot.metadata.language || '').trim();
  if (!sawRejectedCandidate && (currentTitle < Math.min(90, baselineTitle) || !existingLanguage)) {
    await attempt('set_document_language');
  }

  if (!sawRejectedCandidate && (categoryScore(liveAnalysis, 'pdf_ua_compliance') ?? 0) < Math.min(83, baselinePdfUa)) {
    await attempt('set_pdfua_identification');
  }

  if (!acceptedAny) {
    return { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot, accepted: false };
  }
  return {
    buffer: liveBuffer,
    analysis: liveAnalysis,
    snapshot: liveSnapshot,
    accepted: true,
  };
}

async function applyGuardedPostPass(args: {
  filename: string;
  toolName: string;
  stage: number;
  round: number;
  details: string;
  currentBuffer: Buffer;
  currentAnalysis: AnalysisResult;
  currentSnapshot: DocumentSnapshot;
  nextBuffer: Buffer;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  tempPrefix: string;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot; accepted: boolean }> {
  const {
    filename,
    toolName,
    stage,
    round,
    details,
    currentBuffer,
    currentAnalysis,
    currentSnapshot,
    nextBuffer,
    appliedTools,
    runtimeSummary,
    tempPrefix,
    protectedBaseline,
  } = args;
  const started = performance.now();
  if (nextBuffer.equals(currentBuffer)) {
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      accepted: false,
    };
  }

  const analyzed = await reanalyzeBufferForMutation(nextBuffer, filename, tempPrefix);
  const durationMs = performance.now() - started;
  const localFontScoreLoss = toolName === 'embed_local_font_substitutes' && analyzed.result.score < currentAnalysis.score;
  if (
    analyzed.result.score < currentAnalysis.score
    && (localFontScoreLoss || !postPassCategoryBenefitAllowsSmallScoreRegression(toolName, currentAnalysis, analyzed.result))
  ) {
    appliedTools.push({
      toolName,
      stage,
      round,
      scoreBefore: currentAnalysis.score,
      scoreAfter: currentAnalysis.score,
      delta: 0,
      outcome: 'rejected',
      details: enrichDetailsWithReplayState(`post_pass_regressed_score(${analyzed.result.score})`, {
        beforeAnalysis: currentAnalysis,
        beforeSnapshot: currentSnapshot,
        afterAnalysis: analyzed.result,
        afterSnapshot: analyzed.snapshot,
      }),
      durationMs,
      source: 'post_pass',
    });
    runtimeSummary?.toolTimings.push({
      toolName,
      stage,
      round,
      source: 'post_pass',
      durationMs,
      outcome: 'rejected',
    });
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      accepted: false,
    };
  }
  const protectedFloor = protectedBaselineFloorViolation({
    baseline: protectedBaseline,
    before: currentAnalysis,
    after: analyzed.result,
  });
  if (protectedFloor.reject) {
    appliedTools.push({
      toolName,
      stage,
      round,
      scoreBefore: currentAnalysis.score,
      scoreAfter: currentAnalysis.score,
      delta: 0,
      outcome: 'rejected',
      details: enrichDetailsWithReplayState(protectedFloor.details ?? protectedFloor.reason ?? 'protected_baseline_floor', {
        beforeAnalysis: currentAnalysis,
        beforeSnapshot: currentSnapshot,
        afterAnalysis: analyzed.result,
        afterSnapshot: analyzed.snapshot,
      }),
      durationMs,
      source: 'post_pass',
    });
    runtimeSummary?.toolTimings.push({
      toolName,
      stage,
      round,
      source: 'post_pass',
      durationMs,
      outcome: 'rejected',
    });
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      accepted: false,
    };
  }
  const protectedRoute = protectedRouteCategoryRegressionDecision({
    baseline: protectedBaseline,
    before: currentAnalysis,
    after: analyzed.result,
    toolName,
  });
  if (protectedRoute.reject) {
    appliedTools.push({
      toolName,
      stage,
      round,
      scoreBefore: currentAnalysis.score,
      scoreAfter: currentAnalysis.score,
      delta: 0,
      outcome: 'rejected',
      details: enrichDetailsWithReplayState(protectedRoute.details ?? protectedRoute.reason ?? 'protected_route_category_regressed', {
        beforeAnalysis: currentAnalysis,
        beforeSnapshot: currentSnapshot,
        afterAnalysis: analyzed.result,
        afterSnapshot: analyzed.snapshot,
      }),
      durationMs,
      source: 'post_pass',
    });
    runtimeSummary?.toolTimings.push({
      toolName,
      stage,
      round,
      source: 'post_pass',
      durationMs,
      outcome: 'rejected',
    });
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      accepted: false,
    };
  }
  if (toolName === 'embed_local_font_substitutes') {
    const textDropLimit = Math.max(20, Math.round((currentSnapshot.textCharCount ?? 0) * 0.01));
    const textDropped = (currentSnapshot.textCharCount ?? 0) - (analyzed.snapshot.textCharCount ?? 0);
    const structureLost = currentSnapshot.structureTree !== null && analyzed.snapshot.structureTree === null;
    const beforeText = categoryScore(currentAnalysis, 'text_extractability');
    const afterText = categoryScore(analyzed.result, 'text_extractability');
    const textCategoryImproved = beforeText !== null && afterText !== null && afterText > beforeText;
    const scoreImproved = analyzed.result.score > currentAnalysis.score;
    const noMaterialScoreBenefit = !scoreImproved;
    const invalidRewrite =
      analyzed.snapshot.pageCount !== currentSnapshot.pageCount ||
      textDropped > textDropLimit ||
      structureLost ||
      noMaterialScoreBenefit ||
      !fontEvidenceImproved({
        beforeAnalysis: currentAnalysis,
        afterAnalysis: analyzed.result,
        beforeSnapshot: currentSnapshot,
        afterSnapshot: analyzed.snapshot,
      });
    if (invalidRewrite) {
      appliedTools.push({
        toolName,
        stage,
        round,
        scoreBefore: currentAnalysis.score,
        scoreAfter: currentAnalysis.score,
        delta: 0,
        outcome: 'rejected',
        details: enrichDetailsWithReplayState(
          `local_font_substitution_no_safe_benefit(pageCount:${currentSnapshot.pageCount}->${analyzed.snapshot.pageCount},text:${currentSnapshot.textCharCount}->${analyzed.snapshot.textCharCount},structureLost:${structureLost},scoreImproved:${scoreImproved},textCategoryImproved:${textCategoryImproved})`,
          {
            beforeAnalysis: currentAnalysis,
            beforeSnapshot: currentSnapshot,
            afterAnalysis: analyzed.result,
            afterSnapshot: analyzed.snapshot,
          },
        ),
        durationMs,
        source: 'post_pass',
      });
      runtimeSummary?.toolTimings.push({
        toolName,
        stage,
        round,
        source: 'post_pass',
        durationMs,
        outcome: 'rejected',
      });
      return {
        buffer: currentBuffer,
        analysis: currentAnalysis,
        snapshot: currentSnapshot,
        accepted: false,
      };
    }
  }
  const strongAlt = protectedStrongAltPreservationViolation({
    baseline: protectedBaseline,
    before: currentAnalysis,
    after: analyzed.result,
  });
  if (strongAlt.reject) {
    appliedTools.push({
      toolName,
      stage,
      round,
      scoreBefore: currentAnalysis.score,
      scoreAfter: currentAnalysis.score,
      delta: 0,
      outcome: 'rejected',
      details: enrichDetailsWithReplayState(strongAlt.details ?? strongAlt.reason ?? 'protected_strong_alt_regressed', {
        beforeAnalysis: currentAnalysis,
        beforeSnapshot: currentSnapshot,
        afterAnalysis: analyzed.result,
        afterSnapshot: analyzed.snapshot,
      }),
      durationMs,
      source: 'post_pass',
    });
    runtimeSummary?.toolTimings.push({
      toolName,
      stage,
      round,
      source: 'post_pass',
      durationMs,
      outcome: 'rejected',
    });
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      accepted: false,
    };
  }
  const confidenceGuard = compareStructuralConfidence(currentAnalysis, analyzed.result);
  if (
    analyzed.result.score > currentAnalysis.score
    && confidenceGuard.regressed
    && !altRepairBenefitOverridesConfidenceGuard(toolName, currentAnalysis, analyzed.result)
  ) {
    appliedTools.push({
      toolName,
      stage,
      round,
      scoreBefore: currentAnalysis.score,
      scoreAfter: currentAnalysis.score,
      delta: 0,
      outcome: 'rejected',
      details: enrichDetailsWithReplayState(confidenceGuard.reason ?? 'stage_regressed_structural_confidence', {
        beforeAnalysis: currentAnalysis,
        beforeSnapshot: currentSnapshot,
        afterAnalysis: analyzed.result,
        afterSnapshot: analyzed.snapshot,
      }),
      durationMs,
      source: 'post_pass',
    });
    runtimeSummary?.toolTimings.push({
      toolName,
      stage,
      round,
      source: 'post_pass',
      durationMs,
      outcome: 'rejected',
    });
    return {
      buffer: currentBuffer,
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      accepted: false,
    };
  }

  appliedTools.push({
    toolName,
    stage,
    round,
    scoreBefore: currentAnalysis.score,
    scoreAfter: analyzed.result.score,
    delta: analyzed.result.score - currentAnalysis.score,
    outcome: 'applied',
    details: enrichDetailsWithReplayState(details, {
      beforeAnalysis: currentAnalysis,
      beforeSnapshot: currentSnapshot,
      afterAnalysis: analyzed.result,
      afterSnapshot: analyzed.snapshot,
    }),
    durationMs,
    source: 'post_pass',
  });
  runtimeSummary?.toolTimings.push({
    toolName,
    stage,
    round,
    source: 'post_pass',
    durationMs,
    outcome: 'applied',
  });
  return {
    buffer: nextBuffer,
    analysis: analyzed.result,
    snapshot: analyzed.snapshot,
    accepted: true,
  };
}

function resolveStageRejectionDecision(input: {
  filename: string;
  before: AnalysisResult;
  after: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
  stage: RemediationStagePlan;
  stageApplied: AppliedRemediationTool[];
  protectedBaseline?: ProtectedBaselineFloor;
}): { reject: boolean; reason: string | null; details?: string } {
  const stageDecision = shouldRejectStageResult({
    filename: input.filename,
    before: input.before,
    after: input.after,
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    stage: input.stage,
    stageApplied: input.stageApplied,
    protectedBaseline: input.protectedBaseline,
  });
  if (stageDecision.reject) {
    return stageDecision;
  }
  return protectedBaselineFloorViolation({
    baseline: input.protectedBaseline,
    before: input.before,
    after: input.after,
  });
}

async function finalizeAnalyzedStage(args: {
  filename: string;
  stateBeforeStage: RemediationState;
  analyzedState: RemediationState;
  stage: RemediationStagePlan;
  stageApplied: AppliedRemediationTool[];
  stageStartScore: number;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<RemediationState> {
  const {
    filename,
    stateBeforeStage,
    analyzedState,
    stage,
    stageApplied,
    stageStartScore,
    protectedBaseline,
  } = args;
  const rejectionDecision = resolveStageRejectionDecision({
    filename,
    before: stateBeforeStage.analysis,
    after: analyzedState.analysis,
    beforeSnapshot: stateBeforeStage.snapshot,
    afterSnapshot: analyzedState.snapshot,
    stage,
    stageApplied,
    protectedBaseline,
  });

  if (rejectionDecision.reject) {
    const restorePath = join(tmpdir(), `pdfaf-rem-restore-${randomUUID()}.pdf`);
    await writeFile(restorePath, stateBeforeStage.buffer);
    let restoredState: RemediationState;
    try {
      const restored = await analyzePdf(restorePath, filename);
      restoredState = {
        buffer: stateBeforeStage.buffer,
        analysis: restored.result,
        snapshot: restored.snapshot,
      };
    } finally {
      await unlink(restorePath).catch(() => {});
    }
    for (const row of stageApplied) {
      row.outcome = 'rejected';
      row.details = rejectionDecision.details ?? rejectionDecision.reason ?? 'stage_rejected';
      row.scoreAfter = restoredState.analysis.score;
      row.delta = restoredState.analysis.score - stageStartScore;
      enrichRowDetailsWithReplayState(row, {
        beforeAnalysis: stateBeforeStage.analysis,
        beforeSnapshot: stateBeforeStage.snapshot,
        afterAnalysis: analyzedState.analysis,
        afterSnapshot: analyzedState.snapshot,
      });
    }
    return restoredState;
  }

  const headingConverged = headingCreationConverged(analyzedState.snapshot);
  for (const row of stageApplied) {
    if (
      row.toolName === 'create_heading_from_candidate' &&
      row.outcome === 'applied' &&
      !headingConverged
    ) {
      row.outcome = 'no_effect';
      row.details = 'applied_without_exported_heading_convergence';
    }
    row.scoreAfter = analyzedState.analysis.score;
    row.delta = analyzedState.analysis.score - stageStartScore;
    enrichRowDetailsWithReplayState(row, {
      beforeAnalysis: stateBeforeStage.analysis,
      beforeSnapshot: stateBeforeStage.snapshot,
      afterAnalysis: analyzedState.analysis,
      afterSnapshot: analyzedState.snapshot,
    });
  }
  return analyzedState;
}

async function applyProtectedBaselineTransaction(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  currentBuffer: Buffer;
  currentAnalysis: AnalysisResult;
  currentSnapshot: DocumentSnapshot;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot; committed: boolean }> {
  const {
    filename,
    signal,
    round,
    appliedTools,
    runtimeSummary,
    protectedBaseline,
  } = args;
  if (!protectedBaselineRecoveryActive(protectedBaseline, args.currentAnalysis)) {
    return {
      buffer: args.currentBuffer,
      analysis: args.currentAnalysis,
      snapshot: args.currentSnapshot,
      committed: false,
    };
  }
  const baseline = protectedBaseline!;

  let txBuffer = args.currentBuffer;
  let txAnalysis = args.currentAnalysis;
  let txSnapshot = args.currentSnapshot;
  const txRows: AppliedRemediationTool[] = [];
  const bestState: {
    current?: {
      buffer: Buffer;
      analysis: AnalysisResult;
      snapshot: DocumentSnapshot;
      appliedToolCount: number;
      txRowCount: number;
      reason: string;
    };
  } = {};
  const rememberBest = (reason: string): void => {
    const candidate = {
      buffer: Buffer.from(txBuffer),
      analysis: txAnalysis,
      snapshot: txSnapshot,
      appliedToolCount: appliedTools.length,
      txRowCount: txRows.length,
      reason,
    };
    if (!shouldReplaceProtectedSafeCheckpoint({
      baseline,
      current: bestState.current,
      candidate,
    })) return;
    bestState.current = candidate;
  };

  const runTxTool = async (tool: PlannedRemediationTool): Promise<boolean> => {
    const before = txAnalysis;
    const started = performance.now();
    const result = await runSingleTool(txBuffer, tool, txSnapshot);
    const durationMs = result.durationMs || (performance.now() - started);
    const parsedDetails = parseMutationDetails(result.details);
    const effectiveOutcome: AppliedRemediationTool['outcome'] =
      result.outcome === 'applied' && appliedContradictsMutationTruth(parsedDetails)
        ? 'no_effect'
        : result.outcome;
    let nextAnalysis = txAnalysis;
    let nextSnapshot = txSnapshot;
    let nextBuffer = txBuffer;
    if (effectiveOutcome === 'applied' && !result.buffer.equals(txBuffer)) {
      const analyzed = await reanalyzeBufferForMutation(result.buffer, filename, 'pdfaf-protected-tx');
      nextAnalysis = analyzed.result;
      nextSnapshot = analyzed.snapshot;
      nextBuffer = result.buffer;
    }
    const row: AppliedRemediationTool = {
      toolName: tool.toolName,
      stage: 13,
      round,
      scoreBefore: before.score,
      scoreAfter: nextAnalysis.score,
      delta: nextAnalysis.score - before.score,
      outcome: effectiveOutcome,
      details: enrichDetailsWithReplayState(result.details ?? JSON.stringify({ outcome: result.outcome, note: 'protected_transaction' }), {
        beforeAnalysis: before,
        beforeSnapshot: txSnapshot,
        afterAnalysis: nextAnalysis,
        afterSnapshot: nextSnapshot,
        params: tool.params,
      }),
      durationMs,
      source: 'post_pass',
    };
    txRows.push(row);
    const protectedRoute = protectedRouteCategoryRegressionDecision({
      baseline,
      before,
      after: nextAnalysis,
      toolName: tool.toolName,
    });
    if (effectiveOutcome === 'applied' && protectedRoute.reject) {
      row.outcome = 'rejected';
      row.scoreAfter = before.score;
      row.delta = 0;
      row.details = enrichDetailsWithReplayState(protectedRoute.details ?? protectedRoute.reason ?? 'protected_route_category_regressed', {
        beforeAnalysis: before,
        beforeSnapshot: txSnapshot,
        afterAnalysis: nextAnalysis,
        afterSnapshot: nextSnapshot,
        params: tool.params,
      });
    }
    runtimeSummary?.toolTimings.push({
      toolName: tool.toolName,
      stage: 13,
      round,
      source: 'post_pass',
      durationMs,
      outcome: row.outcome,
    });
    if (row.outcome !== 'applied') return false;
    if (effectiveOutcome !== 'applied') return false;
    txBuffer = nextBuffer;
    txAnalysis = nextAnalysis;
    txSnapshot = nextSnapshot;
    rememberBest(`protected_transaction_${tool.toolName}`);
    return true;
  };

  const alreadyApplied = () => [...appliedTools, ...txRows];
  const currentAlt = categoryScore(txAnalysis, 'alt_text');
  const baselineAlt = baseline.categories?.alt_text;
  if (protectedBaselineRecoveryActive(baseline, txAnalysis)) {
    await runTxTool({
      toolName: 'mark_untagged_content_as_artifact',
      params: {},
      rationale: 'Protected transaction: isolate artifact cleanup.',
    });
  }

  if (
    (currentAlt ?? 0) < 90 &&
    !shouldSkipProtectedFigureAlt({
      baseline: protectedBaseline,
      currentAltScore: currentAlt,
      inProtectedTransaction: (currentAlt ?? 100) < 70,
    })
  ) {
    const params = buildDefaultParams('set_figure_alt_text', txAnalysis, txSnapshot, alreadyApplied());
    if (Object.keys(params).length > 0) {
      await runTxTool({
        toolName: 'set_figure_alt_text',
        params,
        rationale: 'Protected transaction: recover figure alt only if the row reaches its baseline floor.',
      });
    }
  }

  if (hasAcrobatAltOwnershipRisk(txSnapshot) || (baselineAlt != null && (categoryScore(txAnalysis, 'alt_text') ?? 0) < baselineAlt)) {
    await runTxTool({
      toolName: 'repair_alt_text_structure',
      params: {},
      rationale: 'Protected transaction: isolate alt ownership cleanup.',
    });
  }

  for (let pass = 0; pass < 3; pass++) {
    if (!protectedBaselineRecoveryActive(baseline, txAnalysis)) break;
    if ((txSnapshot.taggedContentAudit?.orphanMcidCount ?? 0) <= 0) break;
    const applied = await runTxTool({
      toolName: 'remap_orphan_mcids_as_artifacts',
      params: {},
      rationale: 'Protected transaction: bounded orphan MCID drain.',
    });
    if (!applied) break;
  }

  const titleLanguageScore = categoryScore(txAnalysis, 'title_language');
  if ((titleLanguageScore ?? 100) < 90) {
    const existingTitle = txSnapshot.metadata.title?.trim();
    if (isFilenameLikeTitle(existingTitle)) {
      await runTxTool({
        toolName: 'set_document_title',
        params: { title: deriveFallbackDocumentTitle(txSnapshot, filename) },
        rationale: 'Protected transaction: restore document title/language without structural side effects.',
      });
    }
    const existingLanguage = (txSnapshot.lang || txSnapshot.metadata.language || '').trim();
    if (!existingLanguage) {
      await runTxTool({
        toolName: 'set_document_language',
        params: { language: 'en-US' },
        rationale: 'Protected transaction: restore document language without structural side effects.',
      });
    }
  }

  const baselineHeading = baseline.categories?.heading_structure;
  const currentHeading = categoryScore(txAnalysis, 'heading_structure');
  if (
    protectedBaselineRecoveryActive(baseline, txAnalysis) &&
    baselineHeading != null &&
    baselineHeading >= 90 &&
    (currentHeading ?? 100) < 90
  ) {
    await runTxTool({
      toolName: 'normalize_heading_hierarchy',
      params: {},
      rationale: 'Protected transaction: recover heading hierarchy only if the row reaches its baseline floor.',
    });
    if (protectedBaselineRecoveryActive(baseline, txAnalysis)) {
      await runTxTool({
        toolName: 'repair_structure_conformance',
        params: {},
        rationale: 'Protected transaction: repair structure conformance only if the row reaches its baseline floor.',
      });
    }
  }

  if (txRows.length === 0) {
    return {
      buffer: args.currentBuffer,
      analysis: args.currentAnalysis,
      snapshot: args.currentSnapshot,
      committed: false,
    };
  }

  const decision = protectedTransactionDecision({
    baseline,
    final: txAnalysis,
    best: bestState.current,
  });
  const rejectDetails = (note: string, candidate: AnalysisResult, restored?: AnalysisResult): string => JSON.stringify({
    outcome: 'rejected',
    note,
    protectedBaselineScore: baseline.score,
    protectedCandidateScore: candidate.score,
    protectedRestoredScore: restored?.score,
    protectedFloorReason: note,
  });

  if (decision === 'commit_final') {
    appliedTools.push(...txRows);
    return { buffer: txBuffer, analysis: txAnalysis, snapshot: txSnapshot, committed: true };
  }

  if (decision === 'commit_best' && bestState.current) {
    const best = bestState.current;
    const details = rejectDetails('protected_transaction_best_state_restore', txAnalysis, best.analysis);
    for (let i = best.txRowCount; i < txRows.length; i++) {
      const row = txRows[i]!;
      row.outcome = 'rejected';
      row.details = details;
      row.scoreAfter = best.analysis.score;
      row.delta = best.analysis.score - row.scoreBefore;
      enrichRowDetailsWithReplayState(row, {
        beforeAnalysis: args.currentAnalysis,
        beforeSnapshot: args.currentSnapshot,
        afterAnalysis: best.analysis,
        afterSnapshot: best.snapshot,
      });
    }
    appliedTools.push(...txRows);
    return {
      buffer: Buffer.from(best.buffer),
      analysis: best.analysis,
      snapshot: best.snapshot,
      committed: true,
    };
  }

  const details = rejectDetails('protected_transaction_no_floor_recovery', txAnalysis, args.currentAnalysis);
  for (const row of txRows) {
    row.outcome = 'rejected';
    row.details = details;
    row.scoreAfter = args.currentAnalysis.score;
    row.delta = args.currentAnalysis.score - row.scoreBefore;
    enrichRowDetailsWithReplayState(row, {
      beforeAnalysis: args.currentAnalysis,
      beforeSnapshot: args.currentSnapshot,
      afterAnalysis: txAnalysis,
      afterSnapshot: txSnapshot,
    });
  }
  appliedTools.push(...txRows);
  return {
    buffer: args.currentBuffer,
    analysis: args.currentAnalysis,
    snapshot: args.currentSnapshot,
    committed: false,
  };
}

function protectedReadingOrderStrongCategoryRegression(input: {
  baseline: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
}): string | null {
  if (!input.baseline.categories) return null;
  for (const [key, baselineScore] of Object.entries(input.baseline.categories) as Array<[CategoryKey, number]>) {
    if (key === 'reading_order') continue;
    if (baselineScore == null || baselineScore < 90) continue;
    const beforeScore = categoryScore(input.before, key);
    const afterScore = categoryScore(input.after, key);
    if (beforeScore == null || afterScore == null) continue;
    if (afterScore < beforeScore - PROTECTED_BASELINE_FLOOR_TOLERANCE) {
      return `protected_reading_order_topup_category_regressed(${key}:${beforeScore}->${afterScore})`;
    }
  }
  return null;
}

export function protectedReadingOrderTopupDecision(input: {
  baseline?: ProtectedBaselineFloor;
  before: AnalysisResult;
  after: AnalysisResult;
}): { accept: boolean; reason: string | null; details?: string } {
  const baseline = input.baseline;
  if (!baseline || !Number.isFinite(baseline.score)) {
    return { accept: false, reason: 'protected_reading_order_topup_no_baseline' };
  }
  const baselineReadingOrder = baseline.categories?.reading_order;
  if (baselineReadingOrder == null || baselineReadingOrder < 90) {
    return { accept: false, reason: 'protected_reading_order_topup_not_needed' };
  }
  const beforeReadingOrder = categoryScore(input.before, 'reading_order') ?? 0;
  const afterReadingOrder = categoryScore(input.after, 'reading_order') ?? beforeReadingOrder;
  const floor = protectedBaselineFloorScore(baseline);
  const reachesFloor = input.after.score >= floor;
  const readingOrderImproved = afterReadingOrder > beforeReadingOrder;
  const newCap = hasNewStricterCap({
    baselineCaps: baseline.scoreCapsApplied,
    candidateCaps: input.after.scoreCapsApplied,
  });
  const structuralRegression = protectedReadingOrderStrongCategoryRegression({
    baseline,
    before: input.before,
    after: input.after,
  });
  const accept = (readingOrderImproved || reachesFloor) && !newCap && !structuralRegression;
  const note = accept ? 'protected_reading_order_topup' : 'protected_reading_order_topup_rejected';
  const reason = accept
    ? null
    : structuralRegression
      ?? (newCap ? 'protected_reading_order_topup_new_stricter_cap' : null)
      ?? (!readingOrderImproved && !reachesFloor ? 'protected_reading_order_topup_no_improvement' : null)
      ?? 'protected_reading_order_topup_rejected';
  return {
    accept,
    reason,
    details: JSON.stringify({
      outcome: accept ? 'applied' : 'rejected',
      note,
      protectedBaselineScore: baseline.score,
      protectedBeforeScore: input.before.score,
      protectedCandidateScore: input.after.score,
      protectedFloorScore: floor,
      protectedBaselineReadingOrderScore: baselineReadingOrder,
      protectedBeforeReadingOrderScore: beforeReadingOrder,
      protectedCandidateReadingOrderScore: afterReadingOrder,
      protectedFloorReason: reason,
      categoryDeltas: categoryDeltaDetails(input.before, input.after),
    }),
  };
}

async function applyProtectedReadingOrderTopup(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  currentBuffer: Buffer;
  currentAnalysis: AnalysisResult;
  currentSnapshot: DocumentSnapshot;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
  maxOrphanRemaps?: number;
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot; accepted: boolean }> {
  const {
    filename,
    signal,
    round,
    currentBuffer,
    currentAnalysis,
    currentSnapshot,
    appliedTools,
    runtimeSummary,
    protectedBaseline,
    maxOrphanRemaps,
  } = args;
  const baselineReadingOrder = protectedBaseline?.categories?.reading_order;
  if (
    !protectedBaseline ||
    baselineReadingOrder == null ||
    baselineReadingOrder < 90 ||
    currentAnalysis.score >= protectedBaselineFloorScore(protectedBaseline) ||
    (categoryScore(currentAnalysis, 'reading_order') ?? 100) >= baselineReadingOrder - PROTECTED_BASELINE_FLOOR_TOLERANCE
  ) {
    return { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot, accepted: false };
  }

  const tryTool = async (toolName: 'normalize_heading_hierarchy' | 'normalize_annotation_tab_order' | 'remap_orphan_mcids_as_artifacts') => {
    const started = performance.now();
    const result = await runSingleTool(
      currentBuffer,
      {
        toolName,
        params: {},
        rationale: 'Protected reading-order top-up.',
      },
      currentSnapshot,
    );
    const durationMs = result.durationMs || (performance.now() - started);
    let candidateAnalysis = currentAnalysis;
    let candidateSnapshot = currentSnapshot;
    let effectiveOutcome = result.outcome;
    if (result.outcome === 'applied' && !result.buffer.equals(currentBuffer)) {
      const analyzed = await reanalyzeBufferForMutation(result.buffer, filename, 'pdfaf-protected-ro');
      candidateAnalysis = analyzed.result;
      candidateSnapshot = analyzed.snapshot;
    } else if (result.outcome === 'applied') {
      effectiveOutcome = 'no_effect';
    }
    const decision = effectiveOutcome === 'applied'
      ? protectedReadingOrderTopupDecision({
          baseline: protectedBaseline,
          before: currentAnalysis,
          after: candidateAnalysis,
        })
      : {
          accept: false,
          reason: 'protected_reading_order_topup_no_effect',
          details: JSON.stringify({
            outcome: 'rejected',
            note: 'protected_reading_order_topup_rejected',
            protectedBaselineScore: protectedBaseline?.score,
            protectedBeforeScore: currentAnalysis.score,
            protectedCandidateScore: currentAnalysis.score,
            protectedFloorReason: 'protected_reading_order_topup_no_effect',
          }),
        };
    appliedTools.push({
      toolName,
      stage: 13,
      round,
      scoreBefore: currentAnalysis.score,
      scoreAfter: decision.accept ? candidateAnalysis.score : currentAnalysis.score,
      delta: (decision.accept ? candidateAnalysis.score : currentAnalysis.score) - currentAnalysis.score,
      outcome: decision.accept ? 'applied' : 'rejected',
      details: enrichDetailsWithReplayState(decision.details ?? decision.reason ?? 'protected_reading_order_topup_rejected', {
        beforeAnalysis: currentAnalysis,
        beforeSnapshot: currentSnapshot,
        afterAnalysis: candidateAnalysis,
        afterSnapshot: candidateSnapshot,
      }),
      durationMs,
      source: 'post_pass',
    });
    runtimeSummary?.toolTimings.push({
      toolName,
      stage: 13,
      round,
      source: 'post_pass',
      durationMs,
      outcome: decision.accept ? 'applied' : 'rejected',
    });
    return decision.accept
      ? { buffer: result.buffer, analysis: candidateAnalysis, snapshot: candidateSnapshot, accepted: true }
      : { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot, accepted: false };
  };

  const headingNormalized = await tryTool('normalize_heading_hierarchy');
  if (headingNormalized.accepted) return headingNormalized;
  const normalized = await tryTool('normalize_annotation_tab_order');
  if (normalized.accepted) return normalized;
  if ((currentSnapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0) {
    for (let pass = 0; pass < (maxOrphanRemaps ?? 1); pass++) {
      const remapped = await tryTool('remap_orphan_mcids_as_artifacts');
      if (remapped.accepted) return remapped;
    }
  }
  return { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot, accepted: false };
}

export async function runSingleTool(
  buffer: Buffer,
  tool: PlannedRemediationTool,
  _snapshot: DocumentSnapshot,
  options?: { timeoutMs?: number },
): Promise<{ buffer: Buffer; outcome: AppliedRemediationTool['outcome']; details?: string; durationMs: number }> {
  const { toolName, params } = tool;
  const beforeHash = await bufferSha256(buffer);
  const started = performance.now();
  if (!isToolAllowedByRouteContract(tool.route, toolName)) {
    return {
      buffer,
      outcome: 'rejected',
      details: `route_contract_prohibited(${tool.route}:${toolName})`,
      durationMs: performance.now() - started,
    };
  }

  try {
    switch (toolName) {
      case 'set_document_title': {
        const title = String(params['title'] ?? '').trim();
        if (!title) return { buffer, outcome: 'no_effect', details: 'empty_title', durationMs: performance.now() - started };
        const next = await metadataTools.setDocumentTitle(buffer, title);
        return {
          buffer: next,
          outcome: (await bufferSha256(next)) !== beforeHash ? 'applied' : 'no_effect',
          durationMs: performance.now() - started,
        };
      }
      case 'set_document_language': {
        const lang = String(params['language'] ?? '').trim();
        if (!lang) return { buffer, outcome: 'no_effect', details: 'empty_language', durationMs: performance.now() - started };
        const next = await metadataTools.setDocumentLanguage(buffer, lang);
        return {
          buffer: next,
          outcome: (await bufferSha256(next)) !== beforeHash ? 'applied' : 'no_effect',
          durationMs: performance.now() - started,
        };
      }
      case 'set_pdfua_identification': {
        const lang = String(params['language'] ?? 'en-US').trim();
        const { buffer: next, result } = await runPythonMutationBatch(buffer, [
          { op: 'set_pdfua_identification', params: { language: lang } },
        ]);
        if (!result.success) {
          return { buffer, outcome: 'failed', details: JSON.stringify(result.failed), durationMs: performance.now() - started };
        }
        if (result.applied.length === 0) {
          return {
            buffer,
            outcome: 'no_effect',
            details: pythonMutationDetails(result, 'set_pdfua_identification'),
            durationMs: performance.now() - started,
          };
        }
        return {
          buffer: next,
          outcome: 'applied',
          details: pythonMutationDetails(result, 'set_pdfua_identification'),
          durationMs: performance.now() - started,
        };
      }
      case 'ocr_scanned_pdf': {
        const mutations: PythonMutation[] = [{ op: toolName, params }];
        const { buffer: next, result } = await runPythonMutationBatch(buffer, mutations, { timeoutMs: options?.timeoutMs });
        if (!result.success) {
          return { buffer, outcome: 'failed', details: JSON.stringify(result.failed), durationMs: performance.now() - started };
        }
        if (result.applied.length === 0) {
          return {
            buffer,
            outcome: 'no_effect',
            details: pythonMutationDetails(result, toolName),
            durationMs: performance.now() - started,
          };
        }
        return {
          buffer: next,
          outcome: 'applied',
          details: pythonMutationDetails(result, toolName),
          durationMs: performance.now() - started,
        };
      }
      case 'bootstrap_struct_tree':
      case 'synthesize_basic_structure_from_layout':
      case 'repair_structure_conformance':
      case 'substitute_legacy_fonts_in_place':
      case 'finalize_substituted_font_conformance':
      case 'wrap_singleton_orphan_mcid':
      case 'remap_orphan_mcids_as_artifacts':
      case 'artifact_repeating_page_furniture':
      case 'mark_untagged_content_as_artifact':
      case 'tag_ocr_text_blocks':
      case 'tag_native_text_blocks':
      case 'tag_unowned_annotations':
      case 'set_link_annotation_contents':
      case 'repair_native_link_structure':
      case 'normalize_annotation_tab_order':
      case 'create_heading_from_candidate':
      case 'normalize_heading_hierarchy':
      case 'normalize_nested_figure_containers':
      case 'canonicalize_figure_alt_ownership':
      case 'retag_as_figure':
      case 'repair_annotation_alt_text':
      case 'set_figure_alt_text':
      case 'mark_figure_decorative':
      case 'repair_alt_text_structure':
      case 'replace_bookmarks_from_headings':
      case 'add_page_outline_bookmarks':
      case 'normalize_table_structure':
      case 'set_table_header_cells':
      case 'repair_list_li_wrong_parent':
      case 'fill_form_field_tooltips':
      case 'repair_native_table_headers': {
        const mutations: PythonMutation[] = [{ op: toolName, params }];
        const { buffer: next, result } = await runPythonMutationBatch(buffer, mutations);
        const details = pythonMutationDetails(result, toolName);
        const parsed = parseMutationDetails(details);
        if (!result.success) {
          return { buffer, outcome: 'failed', details: JSON.stringify(result.failed), durationMs: performance.now() - started };
        }
        if (parsed?.outcome === 'failed') {
          return {
            buffer,
            outcome: 'failed',
            details,
            durationMs: performance.now() - started,
          };
        }
        if (parsed?.outcome === 'no_effect' || (isStage35StructuralTool(toolName) && parsed?.outcome !== 'applied')) {
          return {
            buffer,
            outcome: 'no_effect',
            details,
            durationMs: performance.now() - started,
          };
        }
        if (result.applied.length === 0) {
          return {
            buffer,
            outcome: 'no_effect',
            details,
            durationMs: performance.now() - started,
          };
        }
        return {
          buffer: next,
          outcome: 'applied',
          details,
          durationMs: performance.now() - started,
        };
      }
      default:
        return { buffer, outcome: 'rejected', details: 'not_implemented', durationMs: performance.now() - started };
    }
  } catch (e) {
    return { buffer, outcome: 'failed', details: (e as Error).message, durationMs: performance.now() - started };
  }
}

function groupPlaybookStepsByStage(playbook: Playbook): RemediationPlan['stages'] {
  const byStage = new Map<number, PlannedRemediationTool[]>();
  for (const step of playbook.toolSequence) {
    if (!implemented.has(step.toolName)) continue;
    const list = byStage.get(step.stage) ?? [];
    list.push({
      toolName: step.toolName,
      params: step.params,
      rationale: 'Replayed from learned playbook.',
    });
    byStage.set(step.stage, list);
  }
  const stageNumbers = [...byStage.keys()].sort((a, b) => a - b);
  return stageNumbers.map(stageNumber => ({
    stageNumber,
    tools: byStage.get(stageNumber)!,
    reanalyzeAfter: true,
  }));
}

function recordToolOutcomes(
  store: ToolOutcomeStore,
  pdfClass: AnalysisResult['pdfClass'],
  tools: AppliedRemediationTool[],
): void {
  for (const t of tools) {
    store.record({
      toolName: t.toolName,
      pdfClass,
      outcome: t.outcome,
      scoreBefore: t.scoreBefore,
      scoreAfter: t.scoreAfter,
    });
  }
}

/** StructTreeRoot + native/OCR text MCID tagging — run before alt repair and PAC-style checks. */
async function applyAccessibilityStructureEnsure(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  currentBuffer: Buffer;
  currentAnalysis: AnalysisResult;
  currentSnapshot: DocumentSnapshot;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot }> {
  let { currentBuffer, currentAnalysis, currentSnapshot, appliedTools, runtimeSummary } = args;
  const { filename, signal, round, protectedBaseline } = args;
  const stageStarted = performance.now();
  const { buffer: fb, result: fr } = await runPythonMutationBatch(
    currentBuffer,
    [{ op: 'ensure_accessibility_tagging', params: { pdfClass: currentSnapshot.pdfClass } }],
    { signal },
  );
  if (fr.success && fr.applied.length > 0) {
    const accepted = await applyGuardedPostPass({
      filename,
      toolName: 'ensure_accessibility_tagging',
      stage: 11,
      round,
      details: 'post_pass_icija_structure',
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      nextBuffer: fb,
      appliedTools,
      runtimeSummary,
      tempPrefix: 'pdfaf-struct',
      protectedBaseline,
    });
    currentBuffer = accepted.buffer;
    currentAnalysis = accepted.analysis;
    currentSnapshot = accepted.snapshot;
  }

  if (runtimeSummary) {
    pushStageTiming(runtimeSummary, {
      stageNumber: 11,
      round,
      source: 'post_pass',
      toolCount: 1,
      totalMs: performance.now() - stageStarted,
      reanalyzeMs: currentAnalysis.runtimeSummary?.totalMs ?? currentAnalysis.analysisDurationMs,
    });
  }

  return { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot };
}

/** Metadata, bookmarks, optional font embed — shared by main remediate and playbook replay. */
async function applyIcjiaDocumentFinalization(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  currentBuffer: Buffer;
  currentAnalysis: AnalysisResult;
  currentSnapshot: DocumentSnapshot;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot }> {
  let { currentBuffer, currentAnalysis, currentSnapshot, appliedTools, runtimeSummary } = args;
  const { filename, signal, round, protectedBaseline } = args;
  const stageStarted = performance.now();

  const existingTitle = currentSnapshot.metadata.title?.trim();
  if (isFilenameLikeTitle(existingTitle)) {
    const title = deriveFallbackDocumentTitle(currentSnapshot, filename);
    const next = await metadataTools.setDocumentTitle(currentBuffer, title);
    const accepted = await applyGuardedPostPass({
      filename,
      toolName: 'set_document_title',
      stage: 11,
      round,
      details: 'post_pass_missing_metadata_title',
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      nextBuffer: next,
      appliedTools,
      runtimeSummary,
      tempPrefix: 'pdfaf-fin',
      protectedBaseline,
    });
    currentBuffer = accepted.buffer;
    currentAnalysis = accepted.analysis;
    currentSnapshot = accepted.snapshot;
  }
  const titleLanguageScore = categoryScore(currentAnalysis, 'title_language');
  const existingLanguage = (currentSnapshot.lang || currentSnapshot.metadata.language || '').trim();
  if ((titleLanguageScore ?? 100) < 90 && !existingLanguage) {
    const next = await metadataTools.setDocumentLanguage(currentBuffer, 'en-US');
    const accepted = await applyGuardedPostPass({
      filename,
      toolName: 'set_document_language',
      stage: 11,
      round,
      details: 'post_pass_missing_metadata_language',
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      nextBuffer: next,
      appliedTools,
      runtimeSummary,
      tempPrefix: 'pdfaf-fin',
      protectedBaseline,
    });
    currentBuffer = accepted.buffer;
    currentAnalysis = accepted.analysis;
    currentSnapshot = accepted.snapshot;
  }

  if (
    currentSnapshot.pdfClass !== 'scanned' &&
    currentSnapshot.pageCount >= BOOKMARKS_PAGE_THRESHOLD &&
    currentSnapshot.bookmarks.length === 0
  ) {
    const br1 = await runPythonMutationBatch(
      currentBuffer,
      [{ op: 'replace_bookmarks_from_headings', params: { force: true } }],
      { signal },
    );
    let bmBuf = currentBuffer;
    let bmApplied = false;
    if (br1.result.success && br1.result.applied.includes('replace_bookmarks_from_headings')) {
      bmBuf = br1.buffer;
      bmApplied = true;
    } else {
      const br2 = await runPythonMutationBatch(
        currentBuffer,
        [{ op: 'add_page_outline_bookmarks', params: { maxPages: BOOKMARKS_PAGE_OUTLINE_MAX_PAGES } }],
        { signal },
      );
      if (br2.result.success && br2.result.applied.includes('add_page_outline_bookmarks')) {
        bmBuf = br2.buffer;
        bmApplied = true;
      }
    }
    if (bmApplied) {
      const accepted = await applyGuardedPostPass({
        filename,
        toolName: 'post_pass_bookmarks',
        stage: 11,
        round,
        details: 'outline_or_headings_bookmarks',
        currentBuffer,
        currentAnalysis,
        currentSnapshot,
        nextBuffer: bmBuf,
        appliedTools,
        runtimeSummary,
        tempPrefix: 'pdfaf-fin',
        protectedBaseline,
      });
      currentBuffer = accepted.buffer;
      currentAnalysis = accepted.analysis;
      currentSnapshot = accepted.snapshot;
    }
  }

  if (shouldTryUrwType1Embed(currentSnapshot)) {
    const urw = await runPythonMutationBatch(
      currentBuffer,
      [{ op: 'embed_urw_type1_substitutes', params: {} }],
      { signal },
    );
    if (urw.result.success && urw.result.applied.includes('embed_urw_type1_substitutes')) {
      const accepted = await applyGuardedPostPass({
        filename,
        toolName: 'embed_urw_type1_substitutes',
        stage: 11,
        round,
        details: 'urw_base35_embed_legacy_type1',
        currentBuffer,
        currentAnalysis,
        currentSnapshot,
        nextBuffer: urw.buffer,
        appliedTools,
        tempPrefix: 'pdfaf-fin',
        protectedBaseline,
      });
      currentBuffer = accepted.buffer;
      currentAnalysis = accepted.analysis;
      currentSnapshot = accepted.snapshot;
    }
  }

  if (shouldTryLocalFontSubstitution(currentSnapshot, currentAnalysis)) {
    const localFonts = await runPythonMutationBatch(
      currentBuffer,
      [{ op: 'embed_local_font_substitutes', params: { maxWidthDrift: 0.12, heuristicMaxWidthDrift: 0.35 } }],
      { signal },
    );
    if (localFonts.result.success && localFonts.result.applied.includes('embed_local_font_substitutes')) {
      const accepted = await applyGuardedPostPass({
        filename,
        toolName: 'embed_local_font_substitutes',
        stage: 11,
        round,
        details: 'stage75_local_font_substitution',
        currentBuffer,
        currentAnalysis,
        currentSnapshot,
        nextBuffer: localFonts.buffer,
        appliedTools,
        runtimeSummary,
        tempPrefix: 'pdfaf-fin',
        protectedBaseline,
      });
      currentBuffer = accepted.buffer;
      currentAnalysis = accepted.analysis;
      currentSnapshot = accepted.snapshot;
    }
  }

  const gsBuf = await embedFontsWithGhostscript(currentBuffer, currentSnapshot);
  if (gsBuf) {
    const accepted = await applyGuardedPostPass({
      filename,
      toolName: 'embed_fonts_ghostscript',
      stage: 12,
      round,
      details: 'optional_gs_font_embed',
      currentBuffer,
      currentAnalysis,
        currentSnapshot,
        nextBuffer: gsBuf,
        appliedTools,
        runtimeSummary,
        tempPrefix: 'pdfaf-fin',
        protectedBaseline,
      });
    currentBuffer = accepted.buffer;
    currentAnalysis = accepted.analysis;
    currentSnapshot = accepted.snapshot;
  }

  if (runtimeSummary) {
    pushStageTiming(runtimeSummary, {
      stageNumber: 12,
      round,
      source: 'post_pass',
      toolCount: appliedTools.filter(tool => tool.source === 'post_pass' && tool.round === round && (tool.stage === 11 || tool.stage === 12)).length,
      totalMs: performance.now() - stageStarted,
      reanalyzeMs: currentAnalysis.runtimeSummary?.totalMs ?? currentAnalysis.analysisDurationMs,
    });
  }

  return { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot };
}

async function applyAltCleanupPostPass(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  state: RemediationState;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<RemediationState> {
  const { filename, signal, round, appliedTools, runtimeSummary, protectedBaseline } = args;
  let { buffer, analysis, snapshot } = args.state;
  if (!(snapshot.isTagged || snapshot.structureTree !== null) || !hasAcrobatAltOwnershipRisk(snapshot)) {
    return args.state;
  }
  const alt = await applyPostRemediationAltRepair(buffer, filename, analysis, snapshot, { signal });
  const accepted = await applyGuardedPostPass({
    filename,
    toolName: 'repair_alt_text_structure',
    stage: 9,
    round,
    details: 'nested_alt_cleanup',
    currentBuffer: buffer,
    currentAnalysis: analysis,
    currentSnapshot: snapshot,
    nextBuffer: alt.buffer,
    appliedTools,
    runtimeSummary,
    tempPrefix: 'pdfaf-alt',
    protectedBaseline,
  });
  return {
    buffer: accepted.buffer,
    analysis: accepted.analysis,
    snapshot: accepted.snapshot,
  };
}

async function applyTaggedCleanupPostPasses(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  state: RemediationState;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<RemediationState> {
  const { filename, signal, round, appliedTools, runtimeSummary, protectedBaseline } = args;
  let { buffer, analysis, snapshot } = args.state;
  if (!snapshot.isTagged) {
    return args.state;
  }

  const ocrRewrotePdf = appliedTools.some(
    tool => tool.toolName === 'ocr_scanned_pdf' && tool.outcome === 'applied',
  );
  if (!(snapshot.pdfUaVersion ?? '').trim() || ocrRewrotePdf) {
    const lang = String(snapshot.lang || snapshot.metadata.language || 'en-US').slice(0, 32);
    const { buffer: stamped, result: uaRes } = await runPythonMutationBatch(
      buffer,
      [{ op: 'set_pdfua_identification', params: { language: lang } }],
      { signal },
    );
    if (uaRes.success && uaRes.applied.includes('set_pdfua_identification')) {
      const accepted = await applyGuardedPostPass({
        filename,
        toolName: 'set_pdfua_identification',
        stage: 10,
        round,
        details: 'post_pass_pdfua_xmp',
        currentBuffer: buffer,
        currentAnalysis: analysis,
        currentSnapshot: snapshot,
        nextBuffer: stamped,
        appliedTools,
        runtimeSummary,
        tempPrefix: 'pdfaf-post',
        protectedBaseline,
      });
      buffer = accepted.buffer;
      analysis = accepted.analysis;
      snapshot = accepted.snapshot;
    }
  }

  for (let pass = 0; pass < 8; pass++) {
    const orphanN = snapshot.taggedContentAudit?.orphanMcidCount ?? 0;
    if (!orphanN) break;
    const beforeOrphanN = orphanN;
    const beforeSignature = JSON.stringify({
      score: analysis.score,
      title: categoryScore(analysis, 'title_language'),
      alt: categoryScore(analysis, 'alt_text'),
      table: categoryScore(analysis, 'table_markup'),
      reading: categoryScore(analysis, 'reading_order'),
      heading: categoryScore(analysis, 'heading_structure'),
    });
    const { buffer: drained, result: drRes } = await runPythonMutationBatch(
      buffer,
      [{ op: 'remap_orphan_mcids_as_artifacts', params: {} }],
      { signal },
    );
    if (!drRes.success || !drRes.applied.includes('remap_orphan_mcids_as_artifacts')) break;
    const accepted = await applyGuardedPostPass({
      filename,
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 10,
      round,
      details: `post_pass_orphan_drain_${pass + 1}`,
      currentBuffer: buffer,
      currentAnalysis: analysis,
      currentSnapshot: snapshot,
      nextBuffer: drained,
      appliedTools,
      runtimeSummary,
      tempPrefix: 'pdfaf-post',
      protectedBaseline,
    });
    buffer = accepted.buffer;
    analysis = accepted.analysis;
    snapshot = accepted.snapshot;
    if (!accepted.accepted) break;
    const afterSignature = JSON.stringify({
      score: analysis.score,
      title: categoryScore(analysis, 'title_language'),
      alt: categoryScore(analysis, 'alt_text'),
      table: categoryScore(analysis, 'table_markup'),
      reading: categoryScore(analysis, 'reading_order'),
      heading: categoryScore(analysis, 'heading_structure'),
    });
    const afterOrphanN = snapshot.taggedContentAudit?.orphanMcidCount ?? 0;
    if (afterSignature === beforeSignature && afterOrphanN >= beforeOrphanN) break;
  }

  return { buffer, analysis, snapshot };
}

async function applyProtectedRecoveryPostPasses(args: {
  filename: string;
  signal?: AbortSignal;
  round: number;
  state: RemediationState;
  appliedTools: AppliedRemediationTool[];
  runtimeSummary?: RemediationRuntimeSummary;
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<RemediationState> {
  const { filename, signal, round, appliedTools, runtimeSummary, protectedBaseline } = args;
  let state = args.state;
  if (!protectedBaselineRecoveryActive(protectedBaseline, state.analysis)) {
    return state;
  }

  const ro = await applyProtectedReadingOrderTopup({
    filename,
    signal,
    round,
    currentBuffer: state.buffer,
    currentAnalysis: state.analysis,
    currentSnapshot: state.snapshot,
    appliedTools,
    runtimeSummary,
    protectedBaseline,
  });
  state = { buffer: ro.buffer, analysis: ro.analysis, snapshot: ro.snapshot };

  if (protectedBaselineNeedsTransaction({
    baseline: protectedBaseline,
    analysis: state.analysis,
    snapshot: state.snapshot,
  })) {
    const tx = await applyProtectedBaselineTransaction({
      filename,
      signal,
      round,
      currentBuffer: state.buffer,
      currentAnalysis: state.analysis,
      currentSnapshot: state.snapshot,
      appliedTools,
      runtimeSummary,
      protectedBaseline,
    });
    state = { buffer: tx.buffer, analysis: tx.analysis, snapshot: tx.snapshot };
  }

  const topup = await applyProtectedMetadataTopup({
    filename,
    signal,
    round,
    currentBuffer: state.buffer,
    currentAnalysis: state.analysis,
    currentSnapshot: state.snapshot,
    appliedTools,
    runtimeSummary,
    protectedBaseline,
  });
  return { buffer: topup.buffer, analysis: topup.analysis, snapshot: topup.snapshot };
}

async function applyProtectedFinalReanalysisConfirmation(args: {
  filename: string;
  round: number;
  state: RemediationState;
  bestState?: (RemediationState & { appliedToolCount: number; reason: string }) | null;
  appliedTools: AppliedRemediationTool[];
  protectedBaseline?: ProtectedBaselineFloor;
}): Promise<RemediationState> {
  const { filename, round, appliedTools, protectedBaseline } = args;
  if (!protectedBaseline || !Number.isFinite(protectedBaseline.score)) {
    return args.state;
  }

  const confirmProtectedState = async (
    state: RemediationState,
    prefix: string,
  ): Promise<{ state: RemediationState; unsafeReason: string | null; passCount: number }> => {
    let confirmedState: RemediationState = state;
    for (let pass = 1; pass <= 2; pass++) {
      const confirmed = await reanalyzeBufferForMutation(
        state.buffer,
        filename,
        `${prefix}-${pass}`,
      );
      confirmedState = {
        buffer: state.buffer,
        analysis: confirmed.result,
        snapshot: confirmed.snapshot,
      };
      const unsafeReason = protectedBaselineRunStateUnsafeReason({
        baseline: protectedBaseline,
        analysis: confirmedState.analysis,
      });
      if (unsafeReason) {
        return { state: confirmedState, unsafeReason, passCount: pass };
      }
    }
    return { state: confirmedState, unsafeReason: null, passCount: 2 };
  };

  const confirmedFinal = await confirmProtectedState(args.state, 'pdfaf-protected-final');
  const confirmedState = confirmedFinal.state;
  const finalUnsafeReason = confirmedFinal.unsafeReason;
  if (!finalUnsafeReason) {
    return confirmedState;
  }

  let restoredState: RemediationState | null = null;
  let restoredReason: string | null = null;
  let restoredPassCount: number | null = null;
  const best = args.bestState ?? null;
  if (best) {
    const bestConfirmed = await confirmProtectedState(best, 'pdfaf-protected-best');
    if (!bestConfirmed.unsafeReason) {
      restoredState = bestConfirmed.state;
      restoredState = { ...restoredState, buffer: Buffer.from(best.buffer) };
      restoredReason = best.reason;
      restoredPassCount = bestConfirmed.passCount;
    }
  }

  if (!restoredState) {
    return args.state;
  }

  appliedTools.push({
    toolName: 'protected_reanalysis_restore',
    stage: 14,
    round,
    scoreBefore: confirmedState.analysis.score,
    scoreAfter: restoredState.analysis.score,
    delta: restoredState.analysis.score - confirmedState.analysis.score,
    outcome: 'applied',
    details: enrichDetailsWithReplayState(JSON.stringify({
      outcome: 'applied',
      note: 'protected_reanalysis_restore',
      protectedBaselineScore: protectedBaseline.score,
      protectedFinalScore: args.state.analysis.score,
      protectedFinalReanalyzedScore: confirmedState.analysis.score,
      protectedFinalReanalysisPasses: confirmedFinal.passCount,
      protectedRestoredScore: restoredState.analysis.score,
      protectedRestoredReason: restoredReason,
      protectedRestoredReanalysisPasses: restoredPassCount,
      protectedRestoredAppliedToolCount: best?.appliedToolCount,
      protectedFloorReason: finalUnsafeReason,
    }), {
      beforeAnalysis: confirmedState.analysis,
      beforeSnapshot: confirmedState.snapshot,
      afterAnalysis: restoredState.analysis,
      afterSnapshot: restoredState.snapshot,
    }),
    durationMs: 0,
    source: 'post_pass',
  });

  return restoredState;
}

/**
 * Replays a stored playbook using the same per-tool execution and stage reanalyze / regression rules as the main loop.
 */
export async function executePlaybook(
  buffer: Buffer,
  filename: string,
  initialAnalysis: AnalysisResult,
  initialSnapshot: DocumentSnapshot,
  playbook: Playbook,
): Promise<RemediatePdfOutcome> {
  const started = Date.now();
  const before = initialAnalysis;
  const runtimeSummary = emptyRuntimeSummary(before);
  let currentBuffer = buffer;
  let currentAnalysis = initialAnalysis;
  let currentSnapshot = initialSnapshot;
  const appliedTools: AppliedRemediationTool[] = [];
  const stages = groupPlaybookStepsByStage(playbook);
  if (stages.length === 0) {
    const st0 = await applyAccessibilityStructureEnsure({
      filename,
      round: 1,
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      appliedTools,
      runtimeSummary,
    });
    currentBuffer = st0.buffer;
    currentAnalysis = st0.analysis;
    currentSnapshot = st0.snapshot;
    if (hasAcrobatAltOwnershipRisk(currentSnapshot)) {
      const alt0 = await applyPostRemediationAltRepair(
        currentBuffer,
        filename,
        currentAnalysis,
        currentSnapshot,
      );
      const altAccepted = await applyGuardedPostPass({
        filename,
        toolName: 'repair_alt_text_structure',
        stage: 9,
        round: 1,
        details: 'nested_alt_cleanup',
        currentBuffer,
        currentAnalysis,
        currentSnapshot,
        nextBuffer: alt0.buffer,
        appliedTools,
        runtimeSummary,
        tempPrefix: 'pdfaf-alt',
      });
      currentBuffer = altAccepted.buffer;
      currentAnalysis = altAccepted.analysis;
      currentSnapshot = altAccepted.snapshot;
    }
    const fin0 = await applyIcjiaDocumentFinalization({
      filename,
      round: 1,
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      appliedTools,
      runtimeSummary,
    });
    currentBuffer = fin0.buffer;
    currentAnalysis = fin0.analysis;
    currentSnapshot = fin0.snapshot;
    const maxBytes = REMEDIATION_MAX_BASE64_MB * 1024 * 1024;
    const tooLarge = currentBuffer.length > maxBytes;
    const ocrPipeline = buildOcrPipelineSummary(appliedTools);
    const remediationOutcomeSummary = buildRemediationOutcomeSummary({
      before,
      after: currentAnalysis,
      appliedTools,
    });
    const remediation: RemediationResult = {
      before,
      after: currentAnalysis,
      remediatedPdfBase64: tooLarge ? null : currentBuffer.toString('base64'),
      remediatedPdfTooLarge: tooLarge,
      appliedTools,
      rounds: [
        {
          round: 1,
          scoreAfter: currentAnalysis.score,
          improved: false,
          source: 'playbook',
        },
      ],
      remediationDurationMs: Date.now() - started,
      improved: false,
      runtimeSummary: {
        ...runtimeSummary,
        analysisAfter: currentAnalysis.runtimeSummary ?? null,
        deterministicTotalMs: Date.now() - started,
      },
      ...(ocrPipeline ? { ocrPipeline } : {}),
      ...(remediationOutcomeSummary ? { remediationOutcomeSummary } : {}),
    };
    return { remediation, buffer: currentBuffer, snapshot: currentSnapshot };
  }

  for (const stage of stages) {
    const stageStartBuffer = currentBuffer;
    const stageStartAnalysis = currentAnalysis;
    const stageStartSnapshot = currentSnapshot;
    const stageStartScore = currentAnalysis.score;
    const stageApplied: AppliedRemediationTool[] = [];
    const stageStarted = performance.now();

    let buf = currentBuffer;
    for (const step of stage.tools) {
      const params = {
        ...buildDefaultParams(step.toolName, currentAnalysis, currentSnapshot),
        ...step.params,
      };
      const tool: PlannedRemediationTool = { ...step, params };
      const { buffer: next, outcome, details, durationMs } = await runSingleTool(buf, tool, currentSnapshot);
      buf = next;
      stageApplied.push({
        toolName: tool.toolName,
        stage: stage.stageNumber,
        round: 1,
        scoreBefore: stageStartScore,
        scoreAfter: stageStartScore,
        delta: 0,
        outcome,
        details,
        durationMs,
        source: 'playbook',
      });
      runtimeSummary.toolTimings.push({
        toolName: tool.toolName,
        stage: stage.stageNumber,
        round: 1,
        source: 'playbook',
        durationMs,
        outcome,
      });
    }

    const tmp = join(tmpdir(), `pdfaf-pb-${randomUUID()}.pdf`);
    await writeFile(tmp, buf);
    let analyzed: Awaited<ReturnType<typeof analyzePdf>>;
    try {
      analyzed = await analyzePdf(tmp, filename);
    } finally {
      await unlink(tmp).catch(() => {});
    }

    const finalizedState = await finalizeAnalyzedStage({
      filename,
      stateBeforeStage: {
        buffer: stageStartBuffer,
        analysis: stageStartAnalysis,
        snapshot: stageStartSnapshot,
      },
      analyzedState: {
        buffer: buf,
        analysis: analyzed.result,
        snapshot: analyzed.snapshot,
      },
      stage,
      stageApplied,
      stageStartScore,
    });
    currentBuffer = finalizedState.buffer;
    currentAnalysis = finalizedState.analysis;
    currentSnapshot = finalizedState.snapshot;
    pushStageTiming(runtimeSummary, {
      stageNumber: stage.stageNumber,
      round: 1,
      source: 'playbook',
      toolCount: stage.tools.length,
      totalMs: performance.now() - stageStarted,
      reanalyzeMs: analyzed.result.runtimeSummary?.totalMs ?? analyzed.result.analysisDurationMs,
    });
    appliedTools.push(...stageApplied);
  }

  {
    const st = await applyAccessibilityStructureEnsure({
      filename,
      round: 1,
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      appliedTools,
      runtimeSummary,
    });
    currentBuffer = st.buffer;
    currentAnalysis = st.analysis;
    currentSnapshot = st.snapshot;
  }

  {
    const state = await applyAltCleanupPostPass({
      filename,
      round: 1,
      state: { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot },
      appliedTools,
      runtimeSummary,
    });
    currentBuffer = state.buffer;
    currentAnalysis = state.analysis;
    currentSnapshot = state.snapshot;
  }

  const finPb = await applyIcjiaDocumentFinalization({
    filename,
    round: 1,
    currentBuffer,
    currentAnalysis,
    currentSnapshot,
    appliedTools,
    runtimeSummary,
  });
  currentBuffer = finPb.buffer;
  currentAnalysis = finPb.analysis;
  currentSnapshot = finPb.snapshot;

  const improved = currentAnalysis.score > before.score;
  const roundDelta = currentAnalysis.score - before.score;
  const rounds: RemediationRoundSummary[] = [
    {
      round: 1,
      scoreAfter: currentAnalysis.score,
      improved: roundDelta >= REMEDIATION_MIN_ROUND_IMPROVEMENT,
      source: 'playbook',
    },
  ];

  const maxBytes = REMEDIATION_MAX_BASE64_MB * 1024 * 1024;
  let remediatedPdfBase64: string | null = null;
  let remediatedPdfTooLarge = false;
  if (currentBuffer.length <= maxBytes) {
    remediatedPdfBase64 = currentBuffer.toString('base64');
  } else {
    remediatedPdfTooLarge = true;
  }

  const ocrPb = buildOcrPipelineSummary(appliedTools);
  const remediationOutcomeSummary = buildRemediationOutcomeSummary({
    before,
    after: currentAnalysis,
    appliedTools,
  });
  const remediation: RemediationResult = {
    before,
    after: currentAnalysis,
    remediatedPdfBase64,
    remediatedPdfTooLarge,
    appliedTools,
    rounds,
    remediationDurationMs: Date.now() - started,
    improved,
    runtimeSummary: {
      ...runtimeSummary,
      analysisAfter: currentAnalysis.runtimeSummary ?? null,
      deterministicTotalMs: Date.now() - started,
    },
    ...(summarizeStructuralConfidenceGuard(appliedTools)
      ? { structuralConfidenceGuard: summarizeStructuralConfidenceGuard(appliedTools) }
      : {}),
    ...(ocrPb ? { ocrPipeline: ocrPb } : {}),
    ...(remediationOutcomeSummary ? { remediationOutcomeSummary } : {}),
  };

  return { remediation, buffer: currentBuffer, snapshot: currentSnapshot };
}

export interface RemediatePdfOptions {
  targetScore?: number;
  maxRounds?: number;
  includeOptionalRemediation?: boolean;
  protectedBaseline?: ProtectedBaselineFloor;
  signal?: AbortSignal;
  playbookStore?: PlaybookStore;
  toolOutcomeStore?: ToolOutcomeStore;
  onProgress?: (update: { percent: number; stage: string; detail?: string }) => void | Promise<void>;
}

export async function remediatePdf(
  buffer: Buffer,
  filename: string,
  initialAnalysis: AnalysisResult,
  initialSnapshot: DocumentSnapshot,
  options?: RemediatePdfOptions,
): Promise<RemediatePdfOutcome> {
  const reportProgress = async (percent: number, stage: string, detail?: string) => {
    await options?.onProgress?.({ percent, stage, detail });
  };

  const started = Date.now();
  const targetScore = options?.targetScore ?? REMEDIATION_TARGET_SCORE;
  const maxRounds = options?.maxRounds ?? REMEDIATION_MAX_ROUNDS;

  const playbookStore = options?.playbookStore ?? createPlaybookStore(getDb());
  const toolOutcomeStore = options?.toolOutcomeStore ?? createToolOutcomeStore(getDb());

  const before = initialAnalysis;
  const runtimeSummary = emptyRuntimeSummary(before);
  let currentBuffer = buffer;
  let currentAnalysis = initialAnalysis;
  let currentSnapshot = initialSnapshot;
  const appliedTools: AppliedRemediationTool[] = [];
  const rounds: RemediationRoundSummary[] = [];
  const sameStateNoGainRuntimeAttempts = new Set<string>();
  const protectedRunBestState: { current?: RemediationState & { appliedToolCount: number; reason: string } } = {};
  const rememberProtectedRunBestState = (reason: string): void => {
    const candidate = {
      buffer: Buffer.from(currentBuffer),
      analysis: currentAnalysis,
      snapshot: currentSnapshot,
      appliedToolCount: appliedTools.length,
      reason,
    };
    if (!shouldReplaceProtectedSafeCheckpoint({
      baseline: options?.protectedBaseline,
      current: protectedRunBestState.current,
      candidate,
    })) return;
    protectedRunBestState.current = candidate;
  };
  rememberProtectedRunBestState('initial_state');
  let planningSummary: PlanningSummary | undefined;
  const signature = buildFailureSignature(initialAnalysis, initialSnapshot);
  const activePlaybook = playbookStore.findActive(signature);
  if (activePlaybook) {
    await reportProgress(24, 'Using a known fix plan', activePlaybook.id);
    const pb = await executePlaybook(
      buffer,
      filename,
      initialAnalysis,
      initialSnapshot,
      activePlaybook,
    );
    recordToolOutcomes(toolOutcomeStore, before.pdfClass, pb.remediation.appliedTools);
      if (pb.remediation.improved) {
      playbookStore.recordResult(
        activePlaybook.id,
        true,
        pb.remediation.after.score - before.score,
      );
      return pb;
    }
    playbookStore.recordResult(activePlaybook.id, false, 0);
  }

  for (let round = 1; round <= maxRounds; round++) {
    if (currentAnalysis.score >= targetScore && !hasExternalReadinessDebt(currentAnalysis, currentSnapshot)) {
      noteEarlyExit(runtimeSummary, 'target_score_reached');
      break;
    }

    const roundStartScore = currentAnalysis.score;
    let rawPlan = planForRemediation(
      currentAnalysis,
      currentSnapshot,
      appliedTools,
      toolOutcomeStore,
      options?.includeOptionalRemediation ?? false,
    );
    planningSummary = mergePlanningSummaries(planningSummary, rawPlan.planningSummary);
    const plan = filterPlan(rawPlan);
    if (plan.stages.length === 0) {
      noteEarlyExit(runtimeSummary, 'no_planned_stages');
      break;
    }
    const roundBase = 24 + ((round - 1) / Math.max(1, maxRounds)) * 42;
    const roundSpan = 42 / Math.max(1, maxRounds);
    let roundHeadingAttempted = false;
    await reportProgress(roundBase, 'Choosing fixes', `Pass ${round} of ${maxRounds}`);

    for (let stageIndex = 0; stageIndex < plan.stages.length; stageIndex++) {
      const stage = plan.stages[stageIndex]!;
      const stagePercent = roundBase + (((stageIndex + 0.35) / Math.max(1, plan.stages.length)) * roundSpan);
      await reportProgress(
        stagePercent,
        'Applying improvements',
        `Pass ${round}, step ${stage.stageNumber}`,
      );
      const stageStartBuffer = currentBuffer;
      const stageStartAnalysis = currentAnalysis;
      const stageStartSnapshot = currentSnapshot;
      const stageStartScore = currentAnalysis.score;
      const stageApplied: AppliedRemediationTool[] = [];
      const stageStarted = performance.now();
      const protectedZeroHeading = protectedZeroHeadingBundleActive(currentAnalysis, currentSnapshot, stage);
      const handledInProtectedBundle = new Set<string>();
      const deferredProtectedTools: PlannedRemediationTool[] = [];
      let workingAnalysis = currentAnalysis;
      let workingSnapshot = currentSnapshot;
      let lastStageAnalysis: Awaited<ReturnType<typeof analyzePdf>> | null = null;
      let lastAnalyzedBuffer = currentBuffer;
      let structureConformanceTimedOutInStage = false;

      if (protectedZeroHeading) {
        runtimeSummary.boundedWork.zeroHeadingLaneActivations += 1;
      }

      let buf = currentBuffer;
      for (let toolIndex = 0; toolIndex < stage.tools.length; toolIndex++) {
        const tool = stage.tools[toolIndex]!;
        if (handledInProtectedBundle.has(tool.toolName)) continue;
        if (protectedZeroHeading && tool.toolName === 'artifact_repeating_page_furniture') {
          deferredProtectedTools.push(tool);
          continue;
        }
        const batchCandidate = selectStage39Batch(stage.tools, toolIndex);
        if (batchCandidate) {
          const liveBatch: Stage39BatchCandidate = {
            role: batchCandidate.role,
            tools: batchCandidate.tools.map(batchTool => {
              if (
                batchTool.toolName === 'set_table_header_cells' ||
                batchTool.toolName === 'set_figure_alt_text' ||
                batchTool.toolName === 'mark_figure_decorative'
              ) {
                const params = buildDefaultParams(
                  batchTool.toolName,
                  workingAnalysis,
                  workingSnapshot,
                  [...appliedTools, ...stageApplied],
                );
                return {
                  ...batchTool,
                  params: Object.keys(params).length > 0 ? { ...batchTool.params, ...params } : batchTool.params,
                };
              }
              return batchTool;
            }),
          };
          if (liveBatch.tools.every(hasRequiredBatchParams)) {
            const batchResult = await runStage39Batch(buf, liveBatch);
            buf = batchResult.buffer;
            for (const row of batchResult.rows) {
              stageApplied.push({
                toolName: row.tool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome: row.outcome,
                details: row.details,
                durationMs: row.durationMs,
                source: 'planner',
              });
              runtimeSummary.toolTimings.push({
                toolName: row.tool.toolName,
                stage: stage.stageNumber,
                round,
                source: 'planner',
                durationMs: row.durationMs,
                outcome: row.outcome,
              });
            }
            toolIndex += batchCandidate.tools.length - 1;
            continue;
          }
        }
        if (tool.toolName === 'create_heading_from_candidate') {
          if (
            workingSnapshot.headings.length > 0 &&
            workingSnapshot.detectionProfile?.headingSignals.extractedHeadingsMissingFromTree !== true
          ) {
            continue;
          }
          roundHeadingAttempted = true;
          if (protectedZeroHeading) {
            handledInProtectedBundle.add('normalize_heading_hierarchy');
            handledInProtectedBundle.add('repair_structure_conformance');
            const protectedHeadingAttemptedRefs = new Set<string>();
            while (true) {
              const headingParams = buildDefaultParams(
                tool.toolName,
                workingAnalysis,
                workingSnapshot,
                [...appliedTools, ...stageApplied],
              );
              const targetRef = headingParams['targetRef'];
              if (typeof targetRef !== 'string' || targetRef.length === 0) break;
              if (protectedHeadingAttemptedRefs.has(targetRef)) {
                noteEarlyExit(runtimeSummary, 'protected_zero_heading_repeated_target');
                break;
              }
              protectedHeadingAttemptedRefs.add(targetRef);

              runtimeSummary.boundedWork.headingConvergenceAttemptCount += 1;
              const headingTool: PlannedRemediationTool = { ...tool, params: headingParams };
              const headingResult = await runSingleTool(buf, headingTool, workingSnapshot);
              const headingDetails = withHeadingTargetRef(headingResult.details, targetRef, headingResult.outcome);
              const headingOutcome = normalizeRecordedOutcomeForMutationTruth(headingResult.outcome, headingDetails);
              buf = headingResult.buffer;
              const headingRow: AppliedRemediationTool = {
                toolName: headingTool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome: headingOutcome,
                details: headingDetails,
                durationMs: headingResult.durationMs,
                source: 'planner',
              };
              stageApplied.push(headingRow);
              runtimeSummary.toolTimings.push({
                toolName: headingTool.toolName,
                stage: stage.stageNumber,
                round,
                source: 'planner',
                durationMs: headingResult.durationMs,
                outcome: headingOutcome,
              });
              if (headingOutcome !== 'applied') {
                if (headingOutcome !== 'no_effect') {
                  runtimeSummary.boundedWork.headingConvergenceFailureCount += 1;
                  break;
                }
                continue;
              }

              const normalizeTool: PlannedRemediationTool = {
                toolName: 'normalize_heading_hierarchy',
                params: buildDefaultParams('normalize_heading_hierarchy', workingAnalysis, workingSnapshot, [...appliedTools, ...stageApplied]),
                rationale: 'Protected zero-heading convergence bundle.',
              };
              const normalizeResult = await runSingleTool(buf, normalizeTool, workingSnapshot);
              buf = normalizeResult.buffer;
              stageApplied.push({
                toolName: normalizeTool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome: normalizeResult.outcome,
                details: normalizeResult.details,
                durationMs: normalizeResult.durationMs,
                source: 'planner',
              });
              runtimeSummary.toolTimings.push({
                toolName: normalizeTool.toolName,
                stage: stage.stageNumber,
                round,
                source: 'planner',
                durationMs: normalizeResult.durationMs,
                outcome: normalizeResult.outcome,
              });

              const conformanceTool: PlannedRemediationTool = {
                toolName: 'repair_structure_conformance',
                params: buildDefaultParams('repair_structure_conformance', workingAnalysis, workingSnapshot, [...appliedTools, ...stageApplied]),
                rationale: 'Protected zero-heading convergence bundle.',
              };
              const conformanceResult = await runSingleTool(
                buf,
                conformanceTool,
                workingSnapshot,
                { timeoutMs: ZERO_HEADING_CONFORMANCE_TIMEOUT_MS },
              );
              buf = conformanceResult.buffer;
              stageApplied.push({
                toolName: conformanceTool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome: conformanceResult.outcome,
                details: conformanceResult.details,
                durationMs: conformanceResult.durationMs,
                source: 'planner',
              });
              runtimeSummary.toolTimings.push({
                toolName: conformanceTool.toolName,
                stage: stage.stageNumber,
                round,
                source: 'planner',
                durationMs: conformanceResult.durationMs,
                outcome: conformanceResult.outcome,
              });
              if (isMutationTimeout(conformanceResult.outcome, conformanceResult.details)) {
                runtimeSummary.boundedWork.structureConformanceTimeoutCount += 1;
                runtimeSummary.boundedWork.headingConvergenceTimeoutCount += 1;
                runtimeSummary.boundedWork.headingConvergenceFailureCount += 1;
                structureConformanceTimedOutInStage = true;
                break;
              }

              lastStageAnalysis = await reanalyzeBufferForMutation(buf, filename, 'pdfaf-zero-heading');
              lastAnalyzedBuffer = buf;
              workingAnalysis = lastStageAnalysis.result;
              workingSnapshot = lastStageAnalysis.snapshot;
              if (headingCreationConverged(workingSnapshot)) {
                runtimeSummary.boundedWork.headingConvergenceSuccessCount += 1;
                break;
              }

              runtimeSummary.boundedWork.headingConvergenceFailureCount += 1;
              for (let idx = stageApplied.length - 1; idx >= 0; idx--) {
                const row = stageApplied[idx]!;
                if (
                  row.stage === stage.stageNumber &&
                  row.round === round &&
                  (row.toolName === 'create_heading_from_candidate'
                    || row.toolName === 'normalize_heading_hierarchy'
                    || row.toolName === 'repair_structure_conformance')
                  && row.outcome === 'applied'
                ) {
                  row.outcome = 'no_effect';
                  row.details = row.toolName === 'create_heading_from_candidate'
                    ? withHeadingTargetRef(JSON.stringify({ outcome: 'no_effect', note: 'protected_zero_heading_no_convergence' }), targetRef, 'no_effect')
                    : 'protected_zero_heading_no_convergence';
                }
                if (row.toolName === 'create_heading_from_candidate') break;
              }
              if (structureConformanceTimedOutInStage) break;
            }
            for (const deferredTool of deferredProtectedTools) {
              const deferredResult = await runSingleTool(buf, deferredTool, workingSnapshot);
              buf = deferredResult.buffer;
              stageApplied.push({
                toolName: deferredTool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome: deferredResult.outcome,
                details: deferredResult.details,
                durationMs: deferredResult.durationMs,
                source: 'planner',
              });
              runtimeSummary.toolTimings.push({
                toolName: deferredTool.toolName,
                stage: stage.stageNumber,
                round,
                source: 'planner',
                durationMs: deferredResult.durationMs,
                outcome: deferredResult.outcome,
              });
            }
          } else {
            const initialParams = buildDefaultParams(
              tool.toolName,
              workingAnalysis,
              workingSnapshot,
              [...appliedTools, ...stageApplied],
            );
            let activeTool: PlannedRemediationTool | null = {
              ...tool,
              params: Object.keys(initialParams).length > 0 ? initialParams : tool.params,
            };
            const attemptedRefs = new Set<string>();
            while (activeTool) {
              const activeRef = activeTool.params['targetRef'];
              if (typeof activeRef === 'string') {
                if (attemptedRefs.has(activeRef)) {
                  noteEarlyExit(runtimeSummary, 'heading_repeated_target');
                  break;
                }
                attemptedRefs.add(activeRef);
              }
              const { buffer: next, outcome, details, durationMs } = await runSingleTool(buf, activeTool, workingSnapshot);
              const activeDetails = activeTool.toolName === 'create_heading_from_candidate'
                ? withHeadingTargetRef(details, activeRef, outcome)
                : details;
              const activeOutcome = normalizeRecordedOutcomeForMutationTruth(outcome, activeDetails);
              buf = next;
              stageApplied.push({
                toolName: activeTool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome: activeOutcome,
                details: activeDetails,
                durationMs,
                source: 'planner',
              });
              runtimeSummary.toolTimings.push({
                toolName: activeTool.toolName,
                stage: stage.stageNumber,
                round,
                source: 'planner',
                durationMs,
                outcome: activeOutcome,
              });
              if (activeOutcome !== 'no_effect') break;
              const nextParams = buildDefaultParams(
                activeTool.toolName,
                workingAnalysis,
                workingSnapshot,
                [...appliedTools, ...stageApplied],
              );
              if (typeof nextParams['targetRef'] !== 'string' || nextParams['targetRef'].length === 0) {
                activeTool = null;
              } else {
                activeTool = { ...activeTool, params: nextParams };
              }
            }
          }
          continue;
        }
        let skipLiveToolForMissingTarget = false;
        if (
          (tool.toolName === 'set_figure_alt_text' || tool.toolName === 'mark_figure_decorative' || tool.toolName === 'retag_as_figure')
          && !buf.equals(lastAnalyzedBuffer)
        ) {
          const tmp = join(tmpdir(), `pdfaf-rem-live-${randomUUID()}.pdf`);
          await writeFile(tmp, buf);
          try {
            const liveAnalysis = await analyzePdf(tmp, filename);
            if (tool.toolName === 'retag_as_figure') {
              const liveParams = buildDefaultParams(
                tool.toolName,
                liveAnalysis.result,
                liveAnalysis.snapshot,
                [...appliedTools, ...stageApplied],
              );
              if (typeof liveParams['structRef'] !== 'string') {
                skipLiveToolForMissingTarget = true;
              } else {
                lastStageAnalysis = liveAnalysis;
                lastAnalyzedBuffer = buf;
                workingAnalysis = liveAnalysis.result;
                workingSnapshot = liveAnalysis.snapshot;
              }
            } else {
              lastStageAnalysis = liveAnalysis;
              lastAnalyzedBuffer = buf;
              workingAnalysis = lastStageAnalysis.result;
              workingSnapshot = lastStageAnalysis.snapshot;
            }
          } finally {
            await unlink(tmp).catch(() => {});
          }
        }
        if (skipLiveToolForMissingTarget) continue;
        const liveTool = tool.toolName === 'normalize_table_structure'
          || tool.toolName === 'set_table_header_cells'
          || tool.toolName === 'retag_as_figure'
          || tool.toolName === 'set_figure_alt_text'
          || tool.toolName === 'mark_figure_decorative'
          ? {
            ...tool,
            params: (() => {
              const params = buildDefaultParams(tool.toolName, workingAnalysis, workingSnapshot, [...appliedTools, ...stageApplied]);
              return Object.keys(params).length > 0 ? params : tool.params;
            })(),
          }
          : tool;
        if (
          liveTool.toolName === 'set_figure_alt_text' &&
          shouldSkipProtectedFigureAlt({
            baseline: options?.protectedBaseline,
            currentAltScore: categoryScore(workingAnalysis, 'alt_text'),
          })
        ) {
          continue;
        }
        if (
          liveTool.toolName === 'canonicalize_figure_alt_ownership' &&
          shouldSkipCanonicalizeFigureAltBeforeRetag({
            stageTools: stage.tools,
            analysis: workingAnalysis,
            snapshot: workingSnapshot,
          })
        ) {
          continue;
        }
        if (
          liveTool.toolName === 'retag_as_figure' &&
          typeof liveTool.params['structRef'] !== 'string'
        ) {
          continue;
        }
        if (
          (
            liveTool.toolName === 'normalize_table_structure' ||
            liveTool.toolName === 'repair_native_table_headers' ||
            liveTool.toolName === 'set_table_header_cells'
          ) &&
          (categoryScore(workingAnalysis, 'table_markup') ?? 0) >= REMEDIATION_CATEGORY_THRESHOLD
        ) {
          continue;
        }
        const sameStateRuntimeSignature = buildCurrentReplayStateSignature({
          analysis: workingAnalysis,
          snapshot: workingSnapshot,
          params: liveTool.params,
        });
        if (shouldSkipSameStateNoGainRuntimeAttempt({
          toolName: liveTool.toolName,
          stateSignatureBefore: sameStateRuntimeSignature,
          noGainAttempts: sameStateNoGainRuntimeAttempts,
        })) {
          noteEarlyExit(runtimeSummary, `same_state_no_gain_runtime_cap:${liveTool.toolName}`);
          continue;
        }
        if (liveTool.toolName === 'set_figure_alt_text') {
          let activeFigureTool: PlannedRemediationTool | null = liveTool;
          const attemptedRefs = new Set<string>();
          while (
            activeFigureTool &&
            figureAltMutationAttemptCount([...appliedTools, ...stageApplied]) < MAX_STAGE64_FIGURE_ALT_TARGETS_PER_RUN
          ) {
            const activeRef = typeof activeFigureTool.params['structRef'] === 'string'
              ? activeFigureTool.params['structRef']
              : typeof activeFigureTool.params['targetRef'] === 'string'
                ? activeFigureTool.params['targetRef']
                : null;
            if (!activeRef) break;
            if (attemptedRefs.has(activeRef)) {
              noteEarlyExit(runtimeSummary, 'figure_alt_repeated_target');
              break;
            }
            attemptedRefs.add(activeRef);

            const { buffer: next, outcome, details, durationMs } = await runSingleTool(buf, activeFigureTool, workingSnapshot);
            const effectiveOutcome = normalizeRecordedOutcomeForMutationTruth(outcome, details);
            buf = next;
            stageApplied.push({
              toolName: activeFigureTool.toolName,
              stage: stage.stageNumber,
              round,
              scoreBefore: stageStartScore,
              scoreAfter: stageStartScore,
              delta: 0,
              outcome: effectiveOutcome,
              details,
              durationMs,
              source: 'planner',
            });
            runtimeSummary.toolTimings.push({
              toolName: activeFigureTool.toolName,
              stage: stage.stageNumber,
              round,
              source: 'planner',
              durationMs,
              outcome: effectiveOutcome,
            });

            if (effectiveOutcome !== 'applied') {
              activeFigureTool = null;
              break;
            }

            lastStageAnalysis = await reanalyzeBufferForMutation(buf, filename, 'pdfaf-figure-alt');
            lastAnalyzedBuffer = buf;
            workingAnalysis = lastStageAnalysis.result;
            workingSnapshot = lastStageAnalysis.snapshot;

            const nextParams = buildDefaultParams(
              'set_figure_alt_text',
              workingAnalysis,
              workingSnapshot,
              [...appliedTools, ...stageApplied],
            );
            activeFigureTool = typeof nextParams['structRef'] === 'string' && nextParams['structRef'].length > 0
              ? { ...activeFigureTool, params: nextParams }
              : null;
          }
          continue;
        }
        const { buffer: next, outcome, details, durationMs } = await runSingleTool(buf, liveTool, workingSnapshot);
        let effectiveNext = next;
        let effectiveOutcome = normalizeRecordedOutcomeForMutationTruth(outcome, details);
        let effectiveDetails = details;
        buf = effectiveNext;
        stageApplied.push({
          toolName: liveTool.toolName,
          stage: stage.stageNumber,
          round,
          scoreBefore: stageStartScore,
          scoreAfter: stageStartScore,
          delta: 0,
          outcome: effectiveOutcome,
          details: effectiveDetails,
          durationMs,
          source: 'planner',
        });
        runtimeSummary.toolTimings.push({
          toolName: liveTool.toolName,
          stage: stage.stageNumber,
          round,
          source: 'planner',
          durationMs,
          outcome: effectiveOutcome,
        });
        recordSameStateNoGainRuntimeAttempt(
          stageApplied[stageApplied.length - 1]!,
          sameStateNoGainRuntimeAttempts,
          sameStateRuntimeSignature,
        );
        if (effectiveOutcome === 'applied' && FIGURE_OWNERSHIP_REFRESH_TOOLS.has(liveTool.toolName)) {
          const tmp = join(tmpdir(), `pdfaf-rem-live-${randomUUID()}.pdf`);
          await writeFile(tmp, buf);
          try {
            lastStageAnalysis = await analyzePdf(tmp, filename);
            lastAnalyzedBuffer = buf;
            workingAnalysis = lastStageAnalysis.result;
            workingSnapshot = lastStageAnalysis.snapshot;
          } finally {
            await unlink(tmp).catch(() => {});
          }
        }
      }

      const stageHadEffect = stageApplied.some(a => a.outcome === 'applied');
      let analyzed: Awaited<ReturnType<typeof analyzePdf>>;
      if (stageHadEffect) {
        if (lastStageAnalysis && buf.equals(lastAnalyzedBuffer)) {
          analyzed = lastStageAnalysis;
        } else {
          const tmp = join(tmpdir(), `pdfaf-rem-${randomUUID()}.pdf`);
          await writeFile(tmp, buf);
          try {
            analyzed = await analyzePdf(tmp, filename);
          } finally {
            await unlink(tmp).catch(() => {});
          }
        }
      } else {
        analyzed = { result: currentAnalysis, snapshot: currentSnapshot };
      }

      const finalizedState = await finalizeAnalyzedStage({
        filename,
        stateBeforeStage: {
          buffer: stageStartBuffer,
          analysis: stageStartAnalysis,
          snapshot: stageStartSnapshot,
        },
        analyzedState: {
          buffer: buf,
          analysis: analyzed.result,
          snapshot: analyzed.snapshot,
        },
        stage,
        stageApplied,
        stageStartScore,
        protectedBaseline: options?.protectedBaseline,
      });
      currentBuffer = finalizedState.buffer;
      currentAnalysis = finalizedState.analysis;
      currentSnapshot = finalizedState.snapshot;
      for (const row of stageApplied) {
        recordSameStateNoGainRuntimeAttempt(row, sameStateNoGainRuntimeAttempts);
      }
      rememberProtectedRunBestState(`stage_${stage.stageNumber}`);
      pushStageTiming(runtimeSummary, {
        stageNumber: stage.stageNumber,
        round,
        source: 'planner',
        toolCount: stage.tools.length,
        totalMs: performance.now() - stageStarted,
        reanalyzeMs: stageHadEffect
          ? (analyzed.result.runtimeSummary?.totalMs ?? analyzed.result.analysisDurationMs)
          : 0,
      });
      appliedTools.push(...stageApplied);
      recordToolOutcomes(toolOutcomeStore, before.pdfClass, stageApplied);
      const completedStagePercent =
        roundBase + (((stageIndex + 1) / Math.max(1, plan.stages.length)) * roundSpan);
      await reportProgress(
        completedStagePercent,
        'Checking results',
        `Pass ${round}, step ${stage.stageNumber}`,
      );
    }

    const roundDelta = currentAnalysis.score - roundStartScore;
    // Any strictly positive weighted gain keeps the loop alive (integer scores can move +1 after many tools).
    const improvedThisRound = roundDelta > 0;
    rounds.push({
      round,
      scoreAfter: currentAnalysis.score,
      improved: improvedThisRound,
      source: 'planner',
    });

    if (currentAnalysis.score >= targetScore && !hasExternalReadinessDebt(currentAnalysis, currentSnapshot)) break;
    if (!improvedThisRound) {
      if (
        roundHeadingAttempted &&
        hasRemainingHeadingBootstrapAttempts(currentAnalysis, currentSnapshot, appliedTools)
      ) {
        continue;
      }
      noteEarlyExit(runtimeSummary, 'round_no_improvement');
      break;
    }
  }

  {
    await reportProgress(70, 'Tidying document structure');
    const st = await applyAccessibilityStructureEnsure({
      filename,
      signal: options?.signal,
      round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      appliedTools,
      runtimeSummary,
    });
    currentBuffer = st.buffer;
    currentAnalysis = st.analysis;
    currentSnapshot = st.snapshot;
    rememberProtectedRunBestState('ensure_accessibility_tagging');
  }

  // Always run alt/annotation repair for tagged PDFs regardless of score — our internal scorer
  // doesn't capture all Adobe checks (FigAltText, NestedAltText, OtherAltText, AltTextNoContent).
  if ((currentSnapshot.isTagged || currentSnapshot.structureTree !== null) && hasAcrobatAltOwnershipRisk(currentSnapshot)) {
    await reportProgress(78, 'Cleaning up alt text');
    const state = await applyAltCleanupPostPass({
      filename,
      signal: options?.signal,
      round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
      state: { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot },
      appliedTools,
      runtimeSummary,
      protectedBaseline: options?.protectedBaseline,
    });
    currentBuffer = state.buffer;
    currentAnalysis = state.analysis;
    currentSnapshot = state.snapshot;
    rememberProtectedRunBestState('alt_cleanup_post_pass');
  }

  // Post-passes: stage-1 regression checks can reject `set_pdfua_identification` when bundled with
  // other tools; drain orphan MCIDs beyond the first successful remap in the planner loop.
  if (currentSnapshot.isTagged) {
    await reportProgress(84, 'Running final cleanup');
    const state = await applyTaggedCleanupPostPasses({
      filename,
      signal: options?.signal,
      round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
      state: { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot },
      appliedTools,
      runtimeSummary,
      protectedBaseline: options?.protectedBaseline,
    });
    currentBuffer = state.buffer;
    currentAnalysis = state.analysis;
    currentSnapshot = state.snapshot;
    rememberProtectedRunBestState('tagged_cleanup_post_pass');
  }

  {
    await reportProgress(90, 'Wrapping things up');
    const finRound = rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1;
    const fin = await applyIcjiaDocumentFinalization({
      filename,
      signal: options?.signal,
      round: finRound,
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      appliedTools,
      runtimeSummary,
      protectedBaseline: options?.protectedBaseline,
    });
    currentBuffer = fin.buffer;
    currentAnalysis = fin.analysis;
    currentSnapshot = fin.snapshot;
    rememberProtectedRunBestState('document_finalization');
  }

  if (protectedBaselineRecoveryActive(options?.protectedBaseline, currentAnalysis)) {
    await reportProgress(92, 'Restoring protected state');
    const state = await applyProtectedRecoveryPostPasses({
      filename,
      signal: options?.signal,
      round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
      state: { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot },
      appliedTools,
      runtimeSummary,
      protectedBaseline: options?.protectedBaseline,
    });
    currentBuffer = state.buffer;
    currentAnalysis = state.analysis;
    currentSnapshot = state.snapshot;
    rememberProtectedRunBestState('protected_recovery_post_pass');
  }

  const protectedRunDecision = protectedBaselineRunCheckpointDecision({
    baseline: options?.protectedBaseline,
    final: currentAnalysis,
    best: protectedRunBestState.current,
  });
  if (protectedRunDecision === 'commit_best' && protectedRunBestState.current) {
    const restored = protectedRunBestState.current;
    appliedTools.push({
      toolName: 'protected_best_state_restore',
      stage: 14,
      round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
      scoreBefore: currentAnalysis.score,
      scoreAfter: restored.analysis.score,
      delta: restored.analysis.score - currentAnalysis.score,
      outcome: 'applied',
      details: enrichDetailsWithReplayState(JSON.stringify({
        outcome: 'applied',
        note: 'protected_run_best_state_restore',
        protectedRestoredReason: restored.reason,
        protectedRestoredAppliedToolCount: restored.appliedToolCount,
      }), {
        beforeAnalysis: currentAnalysis,
        beforeSnapshot: currentSnapshot,
        afterAnalysis: restored.analysis,
        afterSnapshot: restored.snapshot,
      }),
      durationMs: 0,
      source: 'post_pass',
    });
    currentBuffer = Buffer.from(restored.buffer);
    currentAnalysis = restored.analysis;
    currentSnapshot = restored.snapshot;
  }

  {
    const finalReanalysisPolicy = protectedFinalReanalysisPolicyDecision({
      baseline: options?.protectedBaseline,
      final: currentAnalysis,
      best: protectedRunBestState.current ?? null,
      appliedToolCount: appliedTools.length,
    });
    if (finalReanalysisPolicy === 'run') {
      const confirmed = await applyProtectedFinalReanalysisConfirmation({
        filename,
        round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
        state: { buffer: currentBuffer, analysis: currentAnalysis, snapshot: currentSnapshot },
        bestState: protectedRunBestState.current ?? null,
        appliedTools,
        protectedBaseline: options?.protectedBaseline,
      });
      currentBuffer = confirmed.buffer;
      currentAnalysis = confirmed.analysis;
      currentSnapshot = confirmed.snapshot;
    }
  }

  const scoreDelta = currentAnalysis.score - before.score;
  if (
    currentAnalysis.score > before.score &&
    scoreDelta >= PLAYBOOK_LEARN_MIN_SCORE_DELTA
  ) {
    playbookStore.learnFromSuccess(before, initialSnapshot, appliedTools, scoreDelta);
  }

  const maxBytes = REMEDIATION_MAX_BASE64_MB * 1024 * 1024;
  let remediatedPdfBase64: string | null = null;
  let remediatedPdfTooLarge = false;
  if (currentBuffer.length <= maxBytes) {
    remediatedPdfBase64 = currentBuffer.toString('base64');
  } else {
    remediatedPdfTooLarge = true;
  }

  const ocrMain = buildOcrPipelineSummary(appliedTools);
  const remediationOutcomeSummary = buildRemediationOutcomeSummary({
    before,
    after: currentAnalysis,
    appliedTools,
    planningSummary,
  });
  const remediation: RemediationResult = {
    before,
    after: currentAnalysis,
    remediatedPdfBase64,
    remediatedPdfTooLarge,
    appliedTools,
    rounds,
    remediationDurationMs: Date.now() - started,
    improved: currentAnalysis.score > before.score,
    runtimeSummary: {
      ...runtimeSummary,
      analysisAfter: currentAnalysis.runtimeSummary ?? null,
      deterministicTotalMs: Date.now() - started,
    },
    ...(planningSummary ? { planningSummary } : {}),
    ...(summarizeStructuralConfidenceGuard(appliedTools)
      ? { structuralConfidenceGuard: summarizeStructuralConfidenceGuard(appliedTools) }
      : {}),
    ...(ocrMain ? { ocrPipeline: ocrMain } : {}),
    ...(remediationOutcomeSummary ? { remediationOutcomeSummary } : {}),
  };

  return { remediation, buffer: currentBuffer, snapshot: currentSnapshot };
}

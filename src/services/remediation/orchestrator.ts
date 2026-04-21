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
import { embedFontsWithGhostscript, shouldTryUrwType1Embed } from './fontEmbed.js';
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

const HEADING_STRUCTURE_TOOLS = new Set([
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
]);

const TABLE_STRUCTURE_TOOLS = new Set([
  'repair_native_table_headers',
  'set_table_header_cells',
]);

const FIGURE_STRUCTURE_TOOLS = new Set([
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
]);

const FIGURE_OWNERSHIP_REFRESH_TOOLS = new Set([
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
]);

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

function isMutationTimeout(outcome: AppliedRemediationTool['outcome'], details?: string): boolean {
  return outcome === 'failed' && typeof details === 'string' && /timeout\s+\d+ms/i.test(details);
}

export function shouldRejectStageResult(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  beforeSnapshot?: DocumentSnapshot;
  afterSnapshot?: DocumentSnapshot;
  stage: RemediationStagePlan;
  stageApplied: AppliedRemediationTool[];
}): { reject: boolean; reason: string | null } {
  if (input.after.score < input.before.score && !keepOcrStageDespiteScoreDrop(input.stage, input.stageApplied)) {
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
    const confidence = compareStructuralConfidence(input.before, input.after);
    if (confidence.regressed) {
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
    if (input.beforeSnapshot && input.afterSnapshot) {
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
  const payload: PythonMutationDetailPayload = { outcome: op.outcome };
  if (op.note) payload['note'] = op.note;
  if (op.error) payload['error'] = op.error;
  if (op.invariants) payload['invariants'] = op.invariants;
  if (op.structuralBenefits) payload['structuralBenefits'] = op.structuralBenefits;
  if (op.debug) payload['debug'] = op.debug;
  return JSON.stringify(payload);
}

const STAGE35_STRUCTURAL_TOOLS = new Set([
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
  'set_figure_alt_text',
  'mark_figure_decorative',
  'repair_alt_text_structure',
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
  const confidenceGuard = compareStructuralConfidence(currentAnalysis, analyzed.result);
  if (analyzed.result.score > currentAnalysis.score && confidenceGuard.regressed) {
    appliedTools.push({
      toolName,
      stage,
      round,
      scoreBefore: currentAnalysis.score,
      scoreAfter: currentAnalysis.score,
      delta: 0,
      outcome: 'rejected',
      details: confidenceGuard.reason ?? 'stage_regressed_structural_confidence',
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
    details,
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
      case 'repair_annotation_alt_text':
      case 'set_figure_alt_text':
      case 'mark_figure_decorative':
      case 'repair_alt_text_structure':
      case 'replace_bookmarks_from_headings':
      case 'add_page_outline_bookmarks':
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
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot }> {
  let { currentBuffer, currentAnalysis, currentSnapshot, appliedTools, runtimeSummary } = args;
  const { filename, signal, round } = args;
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
}): Promise<{ buffer: Buffer; analysis: AnalysisResult; snapshot: DocumentSnapshot }> {
  let { currentBuffer, currentAnalysis, currentSnapshot, appliedTools, runtimeSummary } = args;
  const { filename, signal, round } = args;
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

    const stageDecision = shouldRejectStageResult({
      before: stageStartAnalysis,
      after: analyzed.result,
      beforeSnapshot: stageStartSnapshot,
      afterSnapshot: analyzed.snapshot,
      stage,
      stageApplied,
    });

    if (stageDecision.reject) {
      currentBuffer = stageStartBuffer;
      const restorePath = join(tmpdir(), `pdfaf-pb-restore-${randomUUID()}.pdf`);
      await writeFile(restorePath, stageStartBuffer);
      try {
        const restored = await analyzePdf(restorePath, filename);
        currentAnalysis = restored.result;
        currentSnapshot = restored.snapshot;
      } finally {
        await unlink(restorePath).catch(() => {});
      }
      for (const a of stageApplied) {
        a.outcome = 'rejected';
        a.details = stageDecision.reason ?? 'stage_rejected';
        a.scoreAfter = currentAnalysis.score;
        a.delta = currentAnalysis.score - stageStartScore;
      }
    } else {
      currentBuffer = buf;
      currentAnalysis = analyzed.result;
      currentSnapshot = analyzed.snapshot;
      for (const a of stageApplied) {
        a.scoreAfter = analyzed.result.score;
        a.delta = analyzed.result.score - stageStartScore;
      }
    }
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
    if (hasAcrobatAltOwnershipRisk(currentSnapshot)) {
      const scoreBefore = currentAnalysis.score;
      const alt = await applyPostRemediationAltRepair(currentBuffer, filename, currentAnalysis, currentSnapshot);
      if (!alt.buffer.equals(currentBuffer)) {
        const durationMs = 0;
        currentBuffer = alt.buffer;
        currentAnalysis = alt.analysis;
        currentSnapshot = alt.snapshot;
        appliedTools.push({
          toolName: 'repair_alt_text_structure',
          stage: 9,
          round: 1,
          scoreBefore,
          scoreAfter: currentAnalysis.score,
          delta: currentAnalysis.score - scoreBefore,
          outcome: 'applied',
          details: 'nested_alt_cleanup',
          durationMs,
          source: 'post_pass',
        });
      }
    }
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
      for (const tool of stage.tools) {
        if (handledInProtectedBundle.has(tool.toolName)) continue;
        if (protectedZeroHeading && tool.toolName === 'artifact_repeating_page_furniture') {
          deferredProtectedTools.push(tool);
          continue;
        }
        if (tool.toolName === 'create_heading_from_candidate') {
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
              buf = headingResult.buffer;
              const headingRow: AppliedRemediationTool = {
                toolName: headingTool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome: headingResult.outcome,
                details: headingResult.details,
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
                outcome: headingResult.outcome,
              });
              if (headingResult.outcome !== 'applied') {
                if (headingResult.outcome !== 'no_effect') {
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
                  row.details = 'protected_zero_heading_no_convergence';
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
              buf = next;
              stageApplied.push({
                toolName: activeTool.toolName,
                stage: stage.stageNumber,
                round,
                scoreBefore: stageStartScore,
                scoreAfter: stageStartScore,
                delta: 0,
                outcome,
                details,
                durationMs,
                source: 'planner',
              });
              runtimeSummary.toolTimings.push({
                toolName: activeTool.toolName,
                stage: stage.stageNumber,
                round,
                source: 'planner',
                durationMs,
                outcome,
              });
              if (outcome !== 'no_effect') break;
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
        if (
          (tool.toolName === 'set_figure_alt_text' || tool.toolName === 'mark_figure_decorative')
          && !buf.equals(lastAnalyzedBuffer)
        ) {
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
        const liveTool = tool.toolName === 'set_table_header_cells'
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
        const { buffer: next, outcome, details, durationMs } = await runSingleTool(buf, liveTool, workingSnapshot);
        buf = next;
        stageApplied.push({
          toolName: liveTool.toolName,
          stage: stage.stageNumber,
          round,
          scoreBefore: stageStartScore,
          scoreAfter: stageStartScore,
          delta: 0,
          outcome,
          details,
          durationMs,
          source: 'planner',
        });
        runtimeSummary.toolTimings.push({
          toolName: liveTool.toolName,
          stage: stage.stageNumber,
          round,
          source: 'planner',
          durationMs,
          outcome,
        });
        if (outcome === 'applied' && FIGURE_OWNERSHIP_REFRESH_TOOLS.has(liveTool.toolName)) {
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

      const stageDecision = shouldRejectStageResult({
        before: stageStartAnalysis,
        after: analyzed.result,
        beforeSnapshot: stageStartSnapshot,
        afterSnapshot: analyzed.snapshot,
        stage,
        stageApplied,
      });

      if (stageDecision.reject) {
        currentBuffer = stageStartBuffer;
        const restorePath = join(tmpdir(), `pdfaf-rem-restore-${randomUUID()}.pdf`);
        await writeFile(restorePath, stageStartBuffer);
        try {
          const restored = await analyzePdf(restorePath, filename);
          currentAnalysis = restored.result;
          currentSnapshot = restored.snapshot;
        } finally {
          await unlink(restorePath).catch(() => {});
        }
        for (const a of stageApplied) {
          a.outcome = 'rejected';
          a.details = stageDecision.reason ?? 'stage_rejected';
          a.scoreAfter = currentAnalysis.score;
          a.delta = currentAnalysis.score - stageStartScore;
        }
      } else {
        currentBuffer = buf;
        currentAnalysis = analyzed.result;
        currentSnapshot = analyzed.snapshot;
        const headingConverged = headingCreationConverged(analyzed.snapshot);
        for (const a of stageApplied) {
          if (
            a.toolName === 'create_heading_from_candidate' &&
            a.outcome === 'applied' &&
            !headingConverged
          ) {
            a.outcome = 'no_effect';
            a.details = 'applied_without_exported_heading_convergence';
          }
          a.scoreAfter = analyzed.result.score;
          a.delta = analyzed.result.score - stageStartScore;
        }
      }
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
  }

  // Always run alt/annotation repair for tagged PDFs regardless of score — our internal scorer
  // doesn't capture all Adobe checks (FigAltText, NestedAltText, OtherAltText, AltTextNoContent).
  if ((currentSnapshot.isTagged || currentSnapshot.structureTree !== null) && hasAcrobatAltOwnershipRisk(currentSnapshot)) {
    await reportProgress(78, 'Cleaning up alt text');
    const alt = await applyPostRemediationAltRepair(
      currentBuffer,
      filename,
      currentAnalysis,
      currentSnapshot,
      { signal: options?.signal },
    );
    const altAccepted = await applyGuardedPostPass({
      filename,
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
      details: 'nested_alt_cleanup',
      currentBuffer,
      currentAnalysis,
      currentSnapshot,
      nextBuffer: alt.buffer,
      appliedTools,
      runtimeSummary,
      tempPrefix: 'pdfaf-alt',
    });
    currentBuffer = altAccepted.buffer;
    currentAnalysis = altAccepted.analysis;
    currentSnapshot = altAccepted.snapshot;
  }

  // Post-passes: stage-1 regression checks can reject `set_pdfua_identification` when bundled with
  // other tools; drain orphan MCIDs beyond the first successful remap in the planner loop.
  if (currentSnapshot.isTagged) {
    await reportProgress(84, 'Running final cleanup');
    // OCRmyPDF often preserves PDF/UA XMP but strips /ViewerPreferences; Acrobat then fails DocTitle.
    // Re-run identification whenever UA metadata is missing *or* OCR rewrote the file.
    const ocrRewrotePdf = appliedTools.some(
      t => t.toolName === 'ocr_scanned_pdf' && t.outcome === 'applied',
    );
    if (!(currentSnapshot.pdfUaVersion ?? '').trim() || ocrRewrotePdf) {
      const lang = String(
        currentSnapshot.lang || currentSnapshot.metadata.language || 'en-US',
      ).slice(0, 32);
      const { buffer: stamped, result: uaRes } = await runPythonMutationBatch(
        currentBuffer,
        [{ op: 'set_pdfua_identification', params: { language: lang } }],
        { signal: options?.signal },
      );
      if (uaRes.success && uaRes.applied.includes('set_pdfua_identification')) {
        const accepted = await applyGuardedPostPass({
          filename,
          toolName: 'set_pdfua_identification',
          stage: 10,
          round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
          details: 'post_pass_pdfua_xmp',
          currentBuffer,
          currentAnalysis,
          currentSnapshot,
          nextBuffer: stamped,
          appliedTools,
          runtimeSummary,
          tempPrefix: 'pdfaf-post',
        });
        currentBuffer = accepted.buffer;
        currentAnalysis = accepted.analysis;
        currentSnapshot = accepted.snapshot;
      }
    }

    for (let pass = 0; pass < 8; pass++) {
      const orphanN = currentSnapshot.taggedContentAudit?.orphanMcidCount ?? 0;
      if (!orphanN) break;
      const { buffer: drained, result: drRes } = await runPythonMutationBatch(
        currentBuffer,
        [{ op: 'remap_orphan_mcids_as_artifacts', params: {} }],
        { signal: options?.signal },
      );
      if (!drRes.success || !drRes.applied.includes('remap_orphan_mcids_as_artifacts')) break;
      const accepted = await applyGuardedPostPass({
        filename,
        toolName: 'remap_orphan_mcids_as_artifacts',
        stage: 10,
        round: rounds.length > 0 ? rounds[rounds.length - 1]!.round : 1,
        details: `post_pass_orphan_drain_${pass + 1}`,
        currentBuffer,
        currentAnalysis,
        currentSnapshot,
        nextBuffer: drained,
        appliedTools,
        runtimeSummary,
        tempPrefix: 'pdfaf-post',
      });
      currentBuffer = accepted.buffer;
      currentAnalysis = accepted.analysis;
      currentSnapshot = accepted.snapshot;
      if (!accepted.accepted) break;
    }
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
    });
    currentBuffer = fin.buffer;
    currentAnalysis = fin.analysis;
    currentSnapshot = fin.snapshot;
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

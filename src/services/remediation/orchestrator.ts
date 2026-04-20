import { performance } from 'node:perf_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BOOKMARKS_PAGE_OUTLINE_MAX_PAGES,
  BOOKMARKS_PAGE_THRESHOLD,
  PLAYBOOK_LEARN_MIN_SCORE_DELTA,
  REMEDIATION_IMPLEMENTED_TOOLS,
  REMEDIATION_MAX_BASE64_MB,
  REMEDIATION_MAX_ROUNDS,
  REMEDIATION_MIN_ROUND_IMPROVEMENT,
  REMEDIATION_TARGET_SCORE,
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
} from '../../types.js';
import { analyzePdf } from '../pdfAnalyzer.js';
import { buildDefaultParams, deriveFallbackDocumentTitle, planForRemediation } from './planner.js';
import { buildRemediationOutcomeSummary } from './outcomeSummary.js';
import { runPythonMutationBatch, type PythonMutation } from '../../python/bridge.js';
import * as metadataTools from './tools/metadata.js';
import { applyPostRemediationAltRepair } from './altStructureRepair.js';
import { embedFontsWithGhostscript, shouldTryUrwType1Embed } from './fontEmbed.js';
import { hasExternalReadinessDebt } from './externalReadiness.js';

export { applyPostRemediationAltRepair } from './altStructureRepair.js';

const implemented = new Set<string>(REMEDIATION_IMPLEMENTED_TOOLS);

function mergePlanningSummaries(
  prior: PlanningSummary | undefined,
  next: PlanningSummary | undefined,
): PlanningSummary | undefined {
  if (!next) return prior;
  if (!prior) return next;
  const skipped = new Map<string, { toolName: string; reason: PlanningSummary['skippedTools'][number]['reason'] }>();
  for (const row of [...prior.skippedTools, ...next.skippedTools]) {
    skipped.set(`${row.toolName}:${row.reason}`, row);
  }
  return {
    primaryRoute: prior.primaryRoute ?? next.primaryRoute,
    secondaryRoutes: [...new Set([...prior.secondaryRoutes, ...next.secondaryRoutes])],
    triggeringSignals: [...new Set([...prior.triggeringSignals, ...next.triggeringSignals])],
    scheduledTools: [...new Set([...prior.scheduledTools, ...next.scheduledTools])],
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

function parseMutationDetails(details: string | undefined): { debug?: { rootReachableDepth?: number } } | null {
  if (!details?.startsWith('{')) return null;
  try {
    return JSON.parse(details) as { debug?: { rootReachableDepth?: number } };
  } catch {
    return null;
  }
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
    const depth = parsed?.debug?.rootReachableDepth;
    if (typeof depth === 'number' && depth <= 1) return true;
  }
  return false;
}

function titleLooksFilenameLike(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.docx') || /^[a-z0-9._-]+$/i.test(v);
}

export function shouldRejectStageResult(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  stage: RemediationStagePlan;
  stageApplied: AppliedRemediationTool[];
}): { reject: boolean; reason: string | null } {
  if (input.after.score < input.before.score && !keepOcrStageDespiteScoreDrop(input.stage, input.stageApplied)) {
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

async function bufferSha256(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex');
}

function pythonMutationDetails(
  result: Awaited<ReturnType<typeof runPythonMutationBatch>>['result'],
  toolName: string,
): string | undefined {
  const op = result.opResults?.find(row => row.op === toolName);
  if (!op) return undefined;
  const payload: Record<string, unknown> = { outcome: op.outcome };
  if (op.note) payload['note'] = op.note;
  if (op.error) payload['error'] = op.error;
  if (op.debug) payload['debug'] = op.debug;
  return JSON.stringify(payload);
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
): Promise<{ buffer: Buffer; outcome: AppliedRemediationTool['outcome']; details?: string; durationMs: number }> {
  const { toolName, params } = tool;
  const beforeHash = await bufferSha256(buffer);
  const started = performance.now();

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
        const { buffer: next, result } = await runPythonMutationBatch(buffer, mutations);
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
  if (titleLooksFilenameLike(existingTitle)) {
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
    let rawPlan = planForRemediation(currentAnalysis, currentSnapshot, appliedTools, toolOutcomeStore);
    planningSummary = mergePlanningSummaries(planningSummary, rawPlan.planningSummary);
    const plan = filterPlan(rawPlan);
    if (plan.stages.length === 0) {
      noteEarlyExit(runtimeSummary, 'no_planned_stages');
      break;
    }
    const roundBase = 24 + ((round - 1) / Math.max(1, maxRounds)) * 42;
    const roundSpan = 42 / Math.max(1, maxRounds);
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
      const stageStartScore = currentAnalysis.score;
      const stageApplied: AppliedRemediationTool[] = [];
      const stageStarted = performance.now();

      let buf = currentBuffer;
      for (const tool of stage.tools) {
        const { buffer: next, outcome, details, durationMs } = await runSingleTool(buf, tool, currentSnapshot);
        buf = next;
        stageApplied.push({
          toolName: tool.toolName,
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
          toolName: tool.toolName,
          stage: stage.stageNumber,
          round,
          source: 'planner',
          durationMs,
          outcome,
        });
      }

      const stageHadEffect = stageApplied.some(a => a.outcome === 'applied');
      let analyzed: Awaited<ReturnType<typeof analyzePdf>>;
      if (stageHadEffect) {
        const tmp = join(tmpdir(), `pdfaf-rem-${randomUUID()}.pdf`);
        await writeFile(tmp, buf);
        try {
          analyzed = await analyzePdf(tmp, filename);
        } finally {
          await unlink(tmp).catch(() => {});
        }
      } else {
        analyzed = { result: currentAnalysis, snapshot: currentSnapshot };
      }

      const stageDecision = shouldRejectStageResult({
        before: stageStartAnalysis,
        after: analyzed.result,
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
        for (const a of stageApplied) {
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
  if (currentSnapshot.isTagged || currentSnapshot.structureTree !== null) {
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

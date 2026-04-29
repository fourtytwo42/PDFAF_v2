import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import { buildEligibleHeadingBootstrapCandidates } from '../headingBootstrapCandidates.js';
import {
  classifyPartialHeadingReachability,
  classifyStage127ZeroHeadingAnchor,
  classifyTaggedZeroHeadingAnchor,
  isOcrPageShell,
  selectTaggedVisibleHeadingAnchorCandidate,
  selectVisibleHeadingAnchorCandidate,
  type VisibleHeadingAnchorCandidate,
} from './visibleHeadingAnchor.js';
import {
  classifyStage129OcrPageShell,
  selectOcrPageShellHeadingCandidate,
  type OcrPageShellHeadingCandidate,
} from './ocrPageShellHeading.js';
import {
  classifyStage131DegenerateNative,
  type DegenerateNativeAnchorCandidate,
} from './degenerateNativeStructure.js';

export type Stage153HeadingZeroClass =
  | 'safe_visible_heading_anchor'
  | 'safe_ocr_heading_anchor'
  | 'content_owner_missing'
  | 'structure_bootstrap_required'
  | 'analyzer_or_route_volatility'
  | 'manual_no_safe_heading'
  | 'already_fixed_control';

export interface Stage153HeadingZeroDisposition {
  classification: Stage153HeadingZeroClass;
  candidate: VisibleHeadingAnchorCandidate | OcrPageShellHeadingCandidate | DegenerateNativeAnchorCandidate | null;
  reasons: string[];
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function headingScore(analysis: AnalysisResult): number {
  return categoryScore(analysis, 'heading_structure') ?? 100;
}

function textExtractabilityScore(analysis: AnalysisResult): number {
  return categoryScore(analysis, 'text_extractability') ?? 0;
}

function hasTreeHeadingEvidence(snapshot: DocumentSnapshot): boolean {
  return snapshot.headings.length > 0 || (snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? 0) > 0;
}

function contentOwnerCount(snapshot: DocumentSnapshot): number {
  return (snapshot.mcidTextSpans?.length ?? 0) +
    (snapshot.paragraphStructElems?.length ?? 0) +
    snapshot.headings.length +
    snapshot.figures.length +
    snapshot.tables.length;
}

function hasPreviousHeadingMutationVolatility(analysis: AnalysisResult, snapshot: DocumentSnapshot): boolean {
  const headingSignals = snapshot.detectionProfile?.headingSignals;
  return headingScore(analysis) <= 0 &&
    ((headingSignals?.extractedHeadingCount ?? 0) > 0 || headingSignals?.extractedHeadingsMissingFromTree === true);
}

export function classifyStage153HeadingZeroResidual(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage153HeadingZeroDisposition {
  const heading = headingScore(analysis);
  if (heading > 0 || hasTreeHeadingEvidence(snapshot)) {
    return { classification: 'already_fixed_control', candidate: null, reasons: [`heading_structure:${heading}`] };
  }
  if (snapshot.textCharCount <= 0 || textExtractabilityScore(analysis) < 60) {
    return { classification: 'manual_no_safe_heading', candidate: null, reasons: ['no_extractable_text_for_heading_anchor'] };
  }

  if (isOcrPageShell(snapshot, analysis)) {
    const candidate = selectOcrPageShellHeadingCandidate(analysis, snapshot);
    if (candidate) {
      return { classification: 'safe_ocr_heading_anchor', candidate, reasons: ['ocr_content_backed_heading_anchor', ...candidate.reasons] };
    }
    const ocrDisposition = classifyStage129OcrPageShell(analysis, snapshot);
    if (contentOwnerCount(snapshot) <= 0) {
      return { classification: 'content_owner_missing', candidate: null, reasons: ['ocr_text_without_mcid_or_struct_owner', ...ocrDisposition.reasons] };
    }
    return { classification: 'manual_no_safe_heading', candidate: null, reasons: ['ocr_text_without_safe_heading_anchor', ...ocrDisposition.reasons] };
  }

  const depth = snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? (snapshot.structureTree ? 2 : 0);
  const ownerCount = contentOwnerCount(snapshot);
  if (snapshot.structureTree === null || (depth <= 1 && ownerCount <= 0)) {
    return {
      classification: 'structure_bootstrap_required',
      candidate: null,
      reasons: [`structure_depth:${depth}`, `content_owner_count:${ownerCount}`],
    };
  }

  const taggedDisposition = classifyTaggedZeroHeadingAnchor(analysis, snapshot);
  if (taggedDisposition.candidate && taggedDisposition.classification === 'tagged_zero_heading_anchor_candidate') {
    return { classification: 'safe_visible_heading_anchor', candidate: taggedDisposition.candidate, reasons: taggedDisposition.reasons };
  }

  const partialDisposition = classifyPartialHeadingReachability(analysis, snapshot);
  if (
    partialDisposition.candidate &&
    (partialDisposition.classification === 'safe_partial_heading_anchor_candidate' ||
      partialDisposition.classification === 'split_mcid_heading_anchor_candidate')
  ) {
    return { classification: 'safe_visible_heading_anchor', candidate: partialDisposition.candidate, reasons: partialDisposition.reasons };
  }

  const visibleDisposition = classifyStage127ZeroHeadingAnchor(analysis, snapshot);
  if (visibleDisposition.candidate && visibleDisposition.classification === 'visible_anchor_candidate') {
    return { classification: 'safe_visible_heading_anchor', candidate: visibleDisposition.candidate, reasons: visibleDisposition.reasons };
  }

  const degenerateDisposition = classifyStage131DegenerateNative(analysis, snapshot);
  if (
    degenerateDisposition.candidate &&
    (
      degenerateDisposition.classification === 'degenerate_native_title_anchor_candidate' ||
      degenerateDisposition.classification === 'degenerate_native_text_block_candidate' ||
      degenerateDisposition.classification === 'native_marked_content_shell_candidate'
    )
  ) {
    return { classification: 'safe_visible_heading_anchor', candidate: degenerateDisposition.candidate, reasons: degenerateDisposition.reasons };
  }

  const paragraphCandidate = buildEligibleHeadingBootstrapCandidates(snapshot)[0];
  const visibleCandidate = selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot)
    ?? selectVisibleHeadingAnchorCandidate(analysis, snapshot)
    ?? (paragraphCandidate
      ? {
        page: paragraphCandidate.page,
        targetRef: paragraphCandidate.structRef,
        text: paragraphCandidate.text,
        source: 'paragraph_candidate' as const,
        score: paragraphCandidate.score,
        reasons: paragraphCandidate.reasons,
      }
      : null);
  if (visibleCandidate && ownerCount > 0) {
    return {
      classification: 'manual_no_safe_heading',
      candidate: visibleCandidate,
      reasons: ['candidate_below_safe_planner_threshold', ...('reasons' in visibleCandidate ? visibleCandidate.reasons : [])],
    };
  }
  if (hasPreviousHeadingMutationVolatility(analysis, snapshot)) {
    return { classification: 'analyzer_or_route_volatility', candidate: null, reasons: ['heading_evidence_unstable_or_missing_from_tree'] };
  }
  if (ownerCount <= 0) {
    return { classification: 'content_owner_missing', candidate: null, reasons: [`content_owner_count:${ownerCount}`] };
  }
  return { classification: 'manual_no_safe_heading', candidate: null, reasons: ['no_content_backed_safe_heading_anchor'] };
}

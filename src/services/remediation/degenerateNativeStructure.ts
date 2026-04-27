import {
  HEADING_BOOTSTRAP_MIN_SCORE,
} from '../../config.js';
import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import {
  extractFirstPageVisibleHeadingText,
  isOcrPageShell,
  isWeakVisibleHeadingAnchorText,
} from './visibleHeadingAnchor.js';

export type Stage131DegenerateNativeClass =
  | 'degenerate_native_title_anchor_candidate'
  | 'degenerate_native_text_block_candidate'
  | 'marked_content_without_safe_anchor'
  | 'native_link_only_no_structure_candidate'
  | 'ocr_shell_defer'
  | 'already_fixed_control';

export interface DegenerateNativeAnchorCandidate {
  page: number;
  text: string;
  source: 'metadata_visible_match' | 'first_page_visible_line';
  score: number;
  reasons: string[];
}

export interface Stage131DegenerateNativeDisposition {
  classification: Stage131DegenerateNativeClass;
  candidate: DegenerateNativeAnchorCandidate | null;
  reasons: string[];
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable ? category.score : null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function fingerprint(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsMeaningfulTitleMatch(a: string, b: string): boolean {
  const af = fingerprint(a);
  const bf = fingerprint(b);
  if (!af || !bf) return false;
  const shorter = af.length <= bf.length ? af : bf;
  const longer = af.length > bf.length ? af : bf;
  return shorter.length >= 18 && longer.includes(shorter);
}

function titleScore(text: string, metadataMatched: boolean): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = metadataMatched ? 42 : 24;
  if (metadataMatched) reasons.push('metadata_visible_match');
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length >= 4 && words.length <= 16) {
    score += 18;
    reasons.push('compact_title');
  }
  if (text.length >= 20 && text.length <= 120) {
    score += 14;
    reasons.push('title_length');
  }
  const alpha = words.filter(word => /[A-Za-z]/.test(word));
  const titleish = alpha.filter(word => /^[A-Z][A-Za-z0-9'/-]*$/.test(word)).length;
  if (alpha.length > 0 && titleish / alpha.length >= 0.45) {
    score += 12;
    reasons.push('title_case_like');
  }
  if (!/[!?]$/.test(text)) {
    score += 6;
    reasons.push('not_question_or_exclamation');
  }
  return { score, reasons };
}

export function selectDegenerateNativeAnchorCandidate(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): DegenerateNativeAnchorCandidate | null {
  const visible = extractFirstPageVisibleHeadingText(snapshot, analysis.filename);
  if (!visible || isWeakVisibleHeadingAnchorText(visible, analysis.filename)) return null;
  const metadataTitle = normalizeText(snapshot.metadata.title ?? snapshot.structTitle);
  const metadataMatched = containsMeaningfulTitleMatch(metadataTitle, visible);
  const scored = titleScore(visible, metadataMatched);
  if (!metadataMatched && scored.score < HEADING_BOOTSTRAP_MIN_SCORE + 8) return null;
  return {
    page: 0,
    text: visible,
    source: metadataMatched ? 'metadata_visible_match' : 'first_page_visible_line',
    score: scored.score,
    reasons: scored.reasons,
  };
}

export function classifyStage131DegenerateNative(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage131DegenerateNativeDisposition {
  const heading = categoryScore(analysis, 'heading_structure');
  const reading = categoryScore(analysis, 'reading_order');
  const depth = snapshot.detectionProfile?.readingOrderSignals?.structureTreeDepth ?? (snapshot.structureTree ? 2 : 0);
  const treeHeadingCount = snapshot.detectionProfile?.headingSignals?.treeHeadingCount ?? snapshot.headings.length;

  if (analysis.pdfClass === 'scanned' || isOcrPageShell(snapshot, analysis)) {
    return { classification: 'ocr_shell_defer', candidate: null, reasons: ['ocr_or_scanned_shell'] };
  }
  if (
    (heading == null || heading >= 70) ||
    treeHeadingCount > 0 ||
    snapshot.headings.length > 0 ||
    (reading != null && reading >= 70 && depth > 1)
  ) {
    return { classification: 'already_fixed_control', candidate: null, reasons: ['not_degenerate_zero_heading_tail'] };
  }
  if (snapshot.textCharCount <= 0 || (categoryScore(analysis, 'text_extractability') ?? 0) < 60) {
    return { classification: 'marked_content_without_safe_anchor', candidate: null, reasons: ['not_extractable_native_text'] };
  }
  const annotationSignals = snapshot.detectionProfile?.annotationSignals;
  const linkOrAnnotationRisk =
    (annotationSignals?.linkAnnotationsMissingStructure ?? 0) +
    (annotationSignals?.nonLinkAnnotationsMissingStructure ?? 0) +
    (annotationSignals?.linkAnnotationsMissingStructParent ?? 0) +
    (annotationSignals?.nonLinkAnnotationsMissingStructParent ?? 0) +
    (snapshot.detectionProfile?.readingOrderSignals?.annotationStructParentRiskCount ?? 0);
  if (linkOrAnnotationRisk > 0) {
    return {
      classification: 'native_link_only_no_structure_candidate',
      candidate: null,
      reasons: [`annotation_or_link_structure_risk:${linkOrAnnotationRisk}`],
    };
  }
  if (depth > 1) {
    if (
      (snapshot.links.length > 0 || (snapshot.annotationAccessibility?.linkAnnotationsMissingStructure ?? 0) > 0) &&
      !snapshot.paragraphStructElems?.length
    ) {
      return { classification: 'native_link_only_no_structure_candidate', candidate: null, reasons: ['link_structure_without_text_block_anchor'] };
    }
    return { classification: 'marked_content_without_safe_anchor', candidate: null, reasons: [`structure_depth:${depth}`] };
  }

  const candidate = selectDegenerateNativeAnchorCandidate(analysis, snapshot);
  if (!candidate) {
    return { classification: 'marked_content_without_safe_anchor', candidate: null, reasons: ['no_safe_visible_native_anchor'] };
  }
  if (candidate.source === 'metadata_visible_match' && candidate.score >= HEADING_BOOTSTRAP_MIN_SCORE) {
    return { classification: 'degenerate_native_title_anchor_candidate', candidate, reasons: ['high_confidence_native_title_anchor', ...candidate.reasons] };
  }
  if (candidate.score >= HEADING_BOOTSTRAP_MIN_SCORE + 8) {
    return { classification: 'degenerate_native_text_block_candidate', candidate, reasons: ['high_confidence_native_text_block_anchor', ...candidate.reasons] };
  }
  return { classification: 'marked_content_without_safe_anchor', candidate: null, reasons: ['native_anchor_below_threshold'] };
}

export function shouldTryDegenerateNativeStructureRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  if (analysis.score >= 70) return false;
  if (analysis.pdfClass === 'scanned') return false;
  const disposition = classifyStage131DegenerateNative(analysis, snapshot);
  return disposition.classification === 'degenerate_native_title_anchor_candidate'
    && disposition.candidate?.source === 'metadata_visible_match';
}

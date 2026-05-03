import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import { classifyStage170NativeTitleOwnerBridge, type NativeTitleOwnerBridgeCandidate } from './nativeTitleOwnerBridge.js';
import {
  classifyStage129OcrPageShell,
  classifyStage175OcrCollectionCover,
  type OcrPageShellHeadingCandidate,
} from './ocrPageShellHeading.js';
import {
  classifyPartialHeadingReachability,
  classifyTaggedZeroHeadingAnchor,
  isOcrPageShell,
  isWeakVisibleHeadingAnchorText,
  selectTaggedVisibleHeadingAnchorCandidate,
  type VisibleHeadingAnchorCandidate,
} from './visibleHeadingAnchor.js';
import { classifyStage131DegenerateNative, type DegenerateNativeAnchorCandidate } from './degenerateNativeStructure.js';
import { HEADING_BOOTSTRAP_MIN_SCORE } from '../../config.js';

export type Stage187HeadingReadingClass =
  | 'native_shell_title_owner_bridge_candidate'
  | 'native_partial_heading_reachability_candidate'
  | 'ocr_page1_safe_title_candidate'
  | 'ocr_collection_title_candidate'
  | 'ocr_visible_title_without_owner'
  | 'mixed_alt_table_not_heading_first'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_heading_anchor';

export type Stage187HeadingReadingCandidate =
  | NativeTitleOwnerBridgeCandidate
  | VisibleHeadingAnchorCandidate
  | OcrPageShellHeadingCandidate
  | DegenerateNativeAnchorCandidate;

export interface Stage187HeadingReadingDisposition {
  classification: Stage187HeadingReadingClass;
  candidate: Stage187HeadingReadingCandidate | null;
  toolName: string | null;
  implementable: boolean;
  reasons: string[];
}

export interface Stage187HeadingReadingOptions {
  knownVolatile?: boolean;
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function scoreOr(analysis: AnalysisResult, key: string, fallback: number): number {
  return categoryScore(analysis, key) ?? fallback;
}

function treeHeadingCount(snapshot: DocumentSnapshot): number {
  return snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? snapshot.headings.length;
}

function ownerCount(snapshot: DocumentSnapshot): number {
  return (snapshot.mcidTextSpans?.length ?? 0) +
    (snapshot.paragraphStructElems?.length ?? 0) +
    snapshot.headings.length +
    snapshot.figures.length +
    snapshot.tables.length;
}

function hasSevereMixedStructuralDebt(analysis: AnalysisResult): boolean {
  const alt = scoreOr(analysis, 'alt_text', 100);
  const table = scoreOr(analysis, 'table_markup', 100);
  const form = scoreOr(analysis, 'form_accessibility', 100);
  const pdfua = scoreOr(analysis, 'pdf_ua_compliance', 100);
  return table < 50 || alt < 40 || form < 80 || (alt < 80 && table < 80) || (pdfua < 65 && (alt < 80 || table < 80));
}

function hasHeadingReadingTail(analysis: AnalysisResult): boolean {
  return scoreOr(analysis, 'heading_structure', 100) < 80 || scoreOr(analysis, 'reading_order', 100) < 80;
}

function strongAlphaTokens(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[a-z]{4,}/g)?.filter(token => !new Set(['with', 'from', 'that', 'this', 'they', 'their', 'will', 'have', 'illinois']).has(token)) ?? [];
}

function looksLikeBylineOrFooter(value: string): boolean {
  return /\b(research analyst|senior research|prepared by|submitted by|executive director|acting executive|governor|authority|center for justice|state of illinois|citation suggestion)\b/i.test(value);
}

export function selectStage187TaggedHeadingTopupCandidate(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): VisibleHeadingAnchorCandidate | null {
  const heading = scoreOr(analysis, 'heading_structure', 100);
  if (analysis.score >= 90) return null;
  if (heading <= 0 || heading >= 80) return null;
  if (analysis.pdfClass !== 'native_tagged' || snapshot.structureTree === null || snapshot.isTagged !== true) return null;
  if (isOcrPageShell(snapshot, analysis)) return null;
  if ((scoreOr(analysis, 'text_extractability', 0)) < 90 || snapshot.textCharCount <= 0) return null;
  if (treeHeadingCount(snapshot) > 0 || snapshot.headings.length > 0) return null;
  if (hasSevereMixedStructuralDebt(analysis)) return null;

  const candidate = selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot);
  if (!candidate || candidate.page !== 0 || candidate.source === 'paragraph_candidate') return null;
  if (typeof candidate.mcid !== 'number' && (!Array.isArray(candidate.mcids) || candidate.mcids.length <= 0)) return null;
  if (candidate.score < HEADING_BOOTSTRAP_MIN_SCORE + 8) return null;
  if (isWeakVisibleHeadingAnchorText(candidate.text, analysis.filename)) return null;
  if (looksLikeBylineOrFooter(candidate.text)) return null;
  if (strongAlphaTokens(candidate.text).length < 4) return null;
  return candidate;
}

export function shouldTryStage187TaggedHeadingTopupRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  return selectStage187TaggedHeadingTopupCandidate(analysis, snapshot) !== null;
}

function withReason(
  classification: Stage187HeadingReadingClass,
  reasons: string[],
  candidate: Stage187HeadingReadingCandidate | null = null,
  toolName: string | null = null,
  implementable = false,
): Stage187HeadingReadingDisposition {
  return { classification, candidate, toolName, implementable, reasons };
}

export function classifyStage187HeadingReadingTail(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  options: Stage187HeadingReadingOptions = {},
): Stage187HeadingReadingDisposition {
  if (options.knownVolatile) {
    return withReason('protected_or_analyzer_volatility', ['known_repeat_or_protected_volatility']);
  }

  const heading = scoreOr(analysis, 'heading_structure', 100);
  const reading = scoreOr(analysis, 'reading_order', 100);
  if (!hasHeadingReadingTail(analysis)) {
    return withReason('no_safe_heading_anchor', [`heading_structure:${heading}`, `reading_order:${reading}`]);
  }
  if (scoreOr(analysis, 'text_extractability', 0) < 60 || snapshot.textCharCount <= 0) {
    return withReason('no_safe_heading_anchor', ['text_not_extractable_enough_for_content_backed_heading']);
  }

  if (isOcrPageShell(snapshot, analysis)) {
    const page1 = classifyStage129OcrPageShell(analysis, snapshot);
    if (page1.classification === 'ocr_page_shell_heading_candidate' && page1.candidate) {
      return withReason(
        'ocr_page1_safe_title_candidate',
        ['existing_ocr_page1_heading_tool_safe', ...page1.reasons],
        page1.candidate,
        'create_heading_from_ocr_page_shell_anchor',
        true,
      );
    }
    const collection = classifyStage175OcrCollectionCover(analysis, snapshot);
    if (collection.classification === 'ocr_collection_cover_title_candidate' && collection.candidate) {
      return withReason(
        'ocr_collection_title_candidate',
        ['existing_ocr_collection_heading_tool_safe', ...collection.reasons],
        collection.candidate,
        'create_heading_from_ocr_collection_title_anchor',
        true,
      );
    }
    if (heading <= 0 && ownerCount(snapshot) > 0) {
      return withReason('ocr_visible_title_without_owner', ['ocr_text_owned_but_no_strict_safe_title_anchor', ...page1.reasons]);
    }
    return withReason('no_safe_heading_anchor', ['ocr_shell_without_safe_title_owner', ...page1.reasons]);
  }

  if (hasSevereMixedStructuralDebt(analysis) && heading > 0) {
    return withReason('mixed_alt_table_not_heading_first', ['severe_alt_table_form_or_pdfua_debt_blocks_heading_first']);
  }

  const ownerBridge = classifyStage170NativeTitleOwnerBridge(analysis, snapshot);
  if (ownerBridge.classification === 'native_title_bt_owner_bridge_candidate' && ownerBridge.candidate) {
    return withReason(
      'native_shell_title_owner_bridge_candidate',
      ['existing_native_title_owner_bridge_safe', ...ownerBridge.reasons],
      ownerBridge.candidate,
      'bridge_native_title_text_owner',
      true,
    );
  }

  const partial = classifyPartialHeadingReachability(analysis, snapshot);
  if (
    partial.candidate &&
    (partial.classification === 'safe_partial_heading_anchor_candidate' ||
      partial.classification === 'split_mcid_heading_anchor_candidate')
  ) {
    return withReason(
      'native_partial_heading_reachability_candidate',
      ['existing_tagged_partial_heading_tool_safe', ...partial.reasons],
      partial.candidate,
      'create_heading_from_tagged_visible_anchor',
      true,
    );
  }

  const topup = selectStage187TaggedHeadingTopupCandidate(analysis, snapshot);
  if (topup) {
    return withReason(
      'native_partial_heading_reachability_candidate',
      ['stage187_tagged_heading_topup_safe', ...topup.reasons],
      topup,
      'create_heading_from_tagged_visible_anchor',
      true,
    );
  }

  const tagged = classifyTaggedZeroHeadingAnchor(analysis, snapshot);
  if (tagged.classification === 'tagged_zero_heading_anchor_candidate' && tagged.candidate) {
    return withReason(
      'native_partial_heading_reachability_candidate',
      ['existing_tagged_zero_heading_tool_safe', ...tagged.reasons],
      tagged.candidate,
      'create_heading_from_tagged_visible_anchor',
      true,
    );
  }

  const degenerate = classifyStage131DegenerateNative(analysis, snapshot);
  if (
    degenerate.candidate &&
    (
      degenerate.classification === 'degenerate_native_title_anchor_candidate' ||
      degenerate.classification === 'degenerate_native_text_block_candidate' ||
      degenerate.classification === 'native_marked_content_shell_candidate'
    )
  ) {
    return withReason(
      'native_shell_title_owner_bridge_candidate',
      ['existing_degenerate_native_structure_tool_safe', ...degenerate.reasons],
      degenerate.candidate,
      'create_structure_from_degenerate_native_anchor',
      true,
    );
  }

  if (
    snapshot.detectionProfile?.headingSignals.extractedHeadingsMissingFromTree === true &&
    (snapshot.detectionProfile?.headingSignals.extractedHeadingCount ?? 0) > 0 &&
    treeHeadingCount(snapshot) === 0
  ) {
    return withReason('protected_or_analyzer_volatility', ['exported_heading_evidence_missing_from_tree_without_safe_anchor']);
  }

  if (hasSevereMixedStructuralDebt(analysis)) {
    return withReason('mixed_alt_table_not_heading_first', ['mixed_alt_table_form_or_pdfua_debt_present']);
  }

  return withReason('no_safe_heading_anchor', [
    `heading_structure:${heading}`,
    `reading_order:${reading}`,
    `owner_count:${ownerCount(snapshot)}`,
    'no_existing_safe_heading_owner_tool_candidate',
  ]);
}

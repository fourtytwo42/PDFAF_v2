import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import {
  isOcrPageShell,
} from './visibleHeadingAnchor.js';
import {
  selectOcrPageShellHeadingCandidate,
} from './ocrPageShellHeading.js';

export type Stage154OcrTextOwnershipClass =
  | 'ocr_text_owner_recovery_candidate'
  | 'ocr_existing_bdc_rewrap_candidate'
  | 'ocr_no_bt_et_text_groups'
  | 'ocr_no_safe_title_anchor_after_owner_recovery'
  | 'manual_scanned_policy_defer'
  | 'already_fixed_control';

export interface Stage154OcrTextOwnershipDisposition {
  classification: Stage154OcrTextOwnershipClass;
  reasons: string[];
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

function isOcrProduced(snapshot: DocumentSnapshot, analysis: AnalysisResult): boolean {
  const creator = (snapshot.metadata.creator ?? '').toLowerCase();
  const producer = (snapshot.metadata.producer ?? '').toLowerCase();
  return snapshot.remediationProvenance?.engineAppliedOcr === true
    || creator.includes('ocrmypdf')
    || producer.includes('ocrmypdf')
    || isOcrPageShell(snapshot, analysis);
}

function hasOwnership(snapshot: DocumentSnapshot): boolean {
  return (snapshot.mcidTextSpans?.length ?? 0) > 0
    && (snapshot.paragraphStructElems?.length ?? 0) > 0
    && snapshot.remediationProvenance?.engineTaggedOcrText === true;
}

export function classifyStage154OcrTextOwnership(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage154OcrTextOwnershipDisposition {
  if (!isOcrProduced(snapshot, analysis)) {
    return { classification: 'already_fixed_control', reasons: ['not_ocr_produced_pdf'] };
  }
  if (snapshot.textCharCount <= 0 || (categoryScore(analysis, 'text_extractability') ?? 0) < 60) {
    return { classification: 'manual_scanned_policy_defer', reasons: ['no_extractable_ocr_text'] };
  }
  if ((categoryScore(analysis, 'heading_structure') ?? 100) > 0) {
    return { classification: 'already_fixed_control', reasons: ['heading_not_zero'] };
  }
  if (snapshot.headings.length > 0 || (snapshot.detectionProfile?.headingSignals.treeHeadingCount ?? 0) > 0) {
    return { classification: 'already_fixed_control', reasons: ['existing_heading_evidence'] };
  }
  if (selectOcrPageShellHeadingCandidate(analysis, snapshot)) {
    return { classification: 'already_fixed_control', reasons: ['safe_ocr_heading_anchor_already_available'] };
  }
  if (hasOwnership(snapshot)) {
    return {
      classification: 'ocr_no_safe_title_anchor_after_owner_recovery',
      reasons: ['ocr_text_already_owned', 'no_safe_ocr_heading_anchor'],
    };
  }

  const hasMarkedContent =
    (snapshot.taggedContentAudit?.mcidTextSpanCount ?? 0) > 0 ||
    (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? 0) > 0;
  const hasLikelyTextGroups = snapshot.textByPage.some(page => page.trim().length >= 20);
  if (!hasLikelyTextGroups) {
    return { classification: 'ocr_no_bt_et_text_groups', reasons: ['no_visible_ocr_text_groups'] };
  }
  if (hasMarkedContent) {
    return {
      classification: 'ocr_existing_bdc_rewrap_candidate',
      reasons: ['ocr_text_extractable', 'existing_marked_content_without_heading_owner'],
    };
  }
  return {
    classification: 'ocr_text_owner_recovery_candidate',
    reasons: ['ocr_text_extractable', 'missing_mcid_or_paragraph_owner'],
  };
}

export function shouldTryOcrTextOwnershipRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  const classification = classifyStage154OcrTextOwnership(analysis, snapshot).classification;
  return classification === 'ocr_text_owner_recovery_candidate'
    || classification === 'ocr_existing_bdc_rewrap_candidate';
}

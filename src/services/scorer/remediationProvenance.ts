import {
  ENGINE_OCR_TEXT_CHARS_MIN,
  ENGINE_OCR_TEXT_CHARS_PER_PAGE_MIN,
} from '../../config.js';
import type { DocumentSnapshot } from '../../types.js';

function hasEncodingRisk(snap: DocumentSnapshot): boolean {
  return snap.fonts.some(font => Boolean(font.encodingRisk || !font.hasUnicode));
}

function hasOnlyAdvisoryEngineOcrFontRisk(snap: DocumentSnapshot): boolean {
  const risky = snap.fonts.filter(font => Boolean(font.encodingRisk || !font.hasUnicode));
  if (risky.length === 0) return false;
  if (risky.length > 2) return false;
  return risky.every(font =>
    font.hasUnicode === true
    && (font.subtype ?? '').toLowerCase() === 'type0'
    && (font.encodingName ?? '').toLowerCase() === 'identity-h'
    && (font.name ?? '').toLowerCase().includes('glyphlessfont'),
  );
}

export function isEngineOwnedOcrDocument(snap: DocumentSnapshot): boolean {
  return snap.remediationProvenance?.engineAppliedOcr === true;
}

export function hasEngineTaggedOcrText(snap: DocumentSnapshot): boolean {
  return snap.remediationProvenance?.engineTaggedOcrText === true;
}

export function qualifiesForEngineOwnedOcrExtractabilityCredit(snap: DocumentSnapshot): boolean {
  if (!isEngineOwnedOcrDocument(snap)) return false;
  if (snap.pdfClass !== 'native_tagged') return false;
  if (snap.imageOnlyPageCount !== 0) return false;
  if (hasEncodingRisk(snap) && !hasOnlyAdvisoryEngineOcrFontRisk(snap)) return false;
  const textChars = snap.textCharCount ?? 0;
  const perPage = textChars / Math.max(snap.pageCount, 1);
  return textChars >= ENGINE_OCR_TEXT_CHARS_MIN && perPage >= ENGINE_OCR_TEXT_CHARS_PER_PAGE_MIN;
}

export function qualifiesForEngineOwnedOcrReadingOrderCredit(snap: DocumentSnapshot): boolean {
  if (!qualifiesForEngineOwnedOcrExtractabilityCredit(snap)) return false;
  if (!hasEngineTaggedOcrText(snap)) return false;
  if (!snap.structureTree) return false;
  const reading = snap.detectionProfile?.readingOrderSignals;
  const annotations = snap.annotationAccessibility;
  return (
    (annotations?.pagesMissingTabsS ?? 0) === 0 &&
    (annotations?.pagesAnnotationOrderDiffers ?? 0) === 0 &&
    (annotations?.linkAnnotationsMissingStructParent ?? 0) === 0 &&
    (annotations?.nonLinkAnnotationsMissingStructParent ?? 0) === 0 &&
    (reading?.annotationOrderRiskCount ?? 0) === 0 &&
    (reading?.annotationStructParentRiskCount ?? 0) === 0 &&
    (reading?.sampledStructurePageOrderDriftCount ?? 0) === 0 &&
    (reading?.multiColumnOrderRiskPages ?? 0) === 0
  );
}

export function engineBookmarkStrategy(snap: DocumentSnapshot): 'none' | 'page_outlines' | 'heading_outlines' {
  return snap.remediationProvenance?.bookmarkStrategy ?? 'none';
}

export function enginePageOutlineCoverageSufficient(snap: DocumentSnapshot): boolean {
  if (engineBookmarkStrategy(snap) !== 'page_outlines') return false;
  const bookmarkCount = snap.bookmarks.length;
  const expected = Math.min(snap.pageCount, snap.remediationProvenance?.pageOutlineCount ?? 0);
  return expected > 0 && bookmarkCount >= expected;
}

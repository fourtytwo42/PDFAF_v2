import type { DocumentSnapshot, Finding } from '../../types.js';

export type ReplacementCharacterTextRiskLevel = 'minor' | 'moderate' | 'critical';

export interface ReplacementCharacterTextRisk {
  level: ReplacementCharacterTextRiskLevel;
  scoreCap: number;
  replacementCharacterCount: number;
  replacementCharacterRatio: number;
  highReplacementCharacterPageCount: number;
  highReplacementCharacterPageRatio: number;
  textCharCount: number;
}

const MIN_TEXT_CHARS_FOR_REPLACEMENT_RISK = 100;
const MIN_REPLACEMENT_RATIO_FOR_RISK = 0.01;
const MODERATE_REPLACEMENT_RATIO = 0.05;
const SEVERE_REPLACEMENT_RATIO = 0.2;
const SEVERE_HIGH_REPLACEMENT_PAGE_RATIO = 0.25;

export function replacementCharacterTextRisk(snap: DocumentSnapshot): ReplacementCharacterTextRisk | null {
  const audit = snap.fontSyntaxAudit;
  const textCharCount = snap.textCharCount ?? 0;
  const replacementCharacterRatio = audit?.replacementCharacterRatio ?? 0;
  const replacementCharacterCount = audit?.replacementCharacterCount ?? 0;
  const highReplacementCharacterPageCount = audit?.highReplacementCharacterPageCount ?? 0;
  const highReplacementCharacterPageRatio = snap.pageCount > 0
    ? highReplacementCharacterPageCount / snap.pageCount
    : 0;

  if (textCharCount < MIN_TEXT_CHARS_FOR_REPLACEMENT_RISK) return null;
  if (replacementCharacterRatio < MIN_REPLACEMENT_RATIO_FOR_RISK) return null;

  if (
    replacementCharacterRatio >= SEVERE_REPLACEMENT_RATIO ||
    highReplacementCharacterPageRatio >= SEVERE_HIGH_REPLACEMENT_PAGE_RATIO
  ) {
    return {
      level: 'critical',
      scoreCap: 40,
      replacementCharacterCount,
      replacementCharacterRatio,
      highReplacementCharacterPageCount,
      highReplacementCharacterPageRatio,
      textCharCount,
    };
  }
  if (replacementCharacterRatio >= MODERATE_REPLACEMENT_RATIO) {
    return {
      level: 'moderate',
      scoreCap: 70,
      replacementCharacterCount,
      replacementCharacterRatio,
      highReplacementCharacterPageCount,
      highReplacementCharacterPageRatio,
      textCharCount,
    };
  }
  return {
    level: 'minor',
    scoreCap: 90,
    replacementCharacterCount,
    replacementCharacterRatio,
    highReplacementCharacterPageCount,
    highReplacementCharacterPageRatio,
    textCharCount,
  };
}

export function replacementCharacterTextRiskFinding(risk: ReplacementCharacterTextRisk): Finding {
  const percent = (risk.replacementCharacterRatio * 100).toFixed(2);
  const pagePercent = (risk.highReplacementCharacterPageRatio * 100).toFixed(1);
  return {
    category: 'text_extractability',
    severity: risk.level,
    wcag: '1.3.1',
    message:
      `Extracted text contains ${risk.replacementCharacterCount} U+FFFD replacement character(s) ` +
      `(${percent}% of ${risk.textCharCount} extracted characters; ` +
      `${risk.highReplacementCharacterPageCount} high-replacement page(s), ${pagePercent}% of pages). ` +
      'Characters may not be Unicode-mappable for assistive technology.',
    count: risk.replacementCharacterCount,
  };
}

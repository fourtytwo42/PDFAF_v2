import { describe, expect, it } from 'vitest';
import { shouldKeepPostRemediationAltRepair } from '../../src/services/remediation/altStructureRepair.js';
import type { AnalysisResult, CategoryKey } from '../../src/types.js';

function analysis(score: number, categories: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  return {
    score,
    scoreProfile: { overallScore: score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F' },
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    pdfClass: 'native_tagged',
    categories: Object.entries(categories).map(([key, value]) => ({
      key: key as CategoryKey,
      score: value,
      applicable: true,
      weight: 1,
    })),
    issues: [],
    warnings: [],
    recommendations: [],
    evidence: {},
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

describe('post-remediation alt cleanup safety', () => {
  it('rejects cleanup that lowers the total score', () => {
    expect(shouldKeepPostRemediationAltRepair(
      analysis(51, { alt_text: 89, table_markup: 100 }),
      analysis(45, { alt_text: 20, table_markup: 0 }),
    )).toBe(false);
  });

  it('rejects cleanup that lowers core non-alt categories even when total score is flat', () => {
    expect(shouldKeepPostRemediationAltRepair(
      analysis(90, { alt_text: 80, table_markup: 100, pdf_ua_compliance: 90 }),
      analysis(90, { alt_text: 100, table_markup: 79, pdf_ua_compliance: 90 }),
    )).toBe(false);
  });

  it('keeps cleanup that improves alt without core category loss', () => {
    expect(shouldKeepPostRemediationAltRepair(
      analysis(88, { alt_text: 80, table_markup: 100, pdf_ua_compliance: 90 }),
      analysis(92, { alt_text: 100, table_markup: 100, pdf_ua_compliance: 90 }),
    )).toBe(true);
  });
});

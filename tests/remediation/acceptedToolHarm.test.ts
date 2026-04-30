import { describe, expect, it } from 'vitest';
import { acceptedToolHarmDecisionForAnalysis } from '../../src/services/remediation/acceptedToolHarm.js';
import type { AnalysisResult, CategoryKey } from '../../src/types.js';

function analysis(score: number, categories: Partial<Record<CategoryKey, number>>): AnalysisResult {
  return {
    id: `a-${score}`,
    timestamp: '2026-04-30T00:00:00.000Z',
    filename: 'fixture.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score,
    grade: 'B',
    categories: Object.entries(categories).map(([key, value]) => ({
      key: key as CategoryKey,
      score: value ?? 100,
      weight: 1,
      applicable: true,
      severity: 'pass' as const,
      findings: [],
    })),
    findings: [],
    analysisDurationMs: 1,
  };
}

describe('accepted tool harm stabilization', () => {
  it('rejects no-target-gain structural cleanup with a strong core category drop', () => {
    const decision = acceptedToolHarmDecisionForAnalysis({
      toolName: 'repair_alt_text_structure',
      before: analysis(78, { alt_text: 70, table_markup: 100, reading_order: 95 }),
      after: analysis(80, { alt_text: 70, table_markup: 70, reading_order: 95 }),
    });

    expect(decision.reject).toBe(true);
    expect(decision.reason).toContain('stage159_targetless_core_category_regression');
    expect(decision.droppedCategory).toBe('table_markup');
  });

  it('allows a guarded tool when its target category improves', () => {
    const decision = acceptedToolHarmDecisionForAnalysis({
      toolName: 'repair_alt_text_structure',
      before: analysis(70, { alt_text: 20, table_markup: 100, reading_order: 95 }),
      after: analysis(82, { alt_text: 60, table_markup: 70, reading_order: 95 }),
    });

    expect(decision.reject).toBe(false);
  });

  it('allows harmless no-target-gain tools without a material core drop', () => {
    const decision = acceptedToolHarmDecisionForAnalysis({
      toolName: 'remap_orphan_mcids_as_artifacts',
      before: analysis(80, { reading_order: 90, pdf_ua_compliance: 70, alt_text: 100 }),
      after: analysis(80, { reading_order: 90, pdf_ua_compliance: 70, alt_text: 90 }),
    });

    expect(decision.reject).toBe(false);
  });

  it('does not apply to OCR, font, or metadata tools', () => {
    for (const toolName of ['ocr_scanned_pdf', 'embed_local_font_substitutes', 'set_document_title']) {
      const decision = acceptedToolHarmDecisionForAnalysis({
        toolName,
        before: analysis(80, { alt_text: 100, table_markup: 100, reading_order: 100 }),
        after: analysis(82, { alt_text: 50, table_markup: 50, reading_order: 50 }),
      });
      expect(decision.reject).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPocStrongAreaSummary,
  classifyPocStrongAreaRule,
  isPocStrongAreaRule,
  type PocStrongAreaFileRow,
} from '../../scripts/poc-strong-areas-diagnostic.js';
import type { PacRuleEvidence } from '../../src/services/compliance/pacRuleEvidence.js';

function rule(overrides: Partial<PacRuleEvidence>): PacRuleEvidence {
  return {
    ruleId: 'pdfua.parent_tree.present',
    status: 'pass',
    severity: 'pass',
    category: 'pdf_ua_compliance',
    message: 'ok',
    confidence: 'verified',
    ...overrides,
  };
}

describe('poc strong areas diagnostic helpers', () => {
  it('selects only POC strong-area PAC rules', () => {
    expect(isPocStrongAreaRule('pdfua.parent_tree.present')).toBe(true);
    expect(isPocStrongAreaRule('pdfua.font.to_unicode_cmap_present')).toBe(true);
    expect(isPocStrongAreaRule('wcag.contrast.text_contrast_measured')).toBe(true);
    expect(isPocStrongAreaRule('pdfua.metadata.title_present')).toBe(false);
  });

  it('classifies verified fails against passing categories as scoring candidates', () => {
    const categories = [{ key: 'pdf_ua_compliance' as const, score: 95, applicable: true }];

    expect(classifyPocStrongAreaRule(rule({ status: 'fail' }), categories)).toBe('ready_for_scoring_candidate');
    expect(classifyPocStrongAreaRule(rule({ status: 'fail', confidence: 'heuristic' }), categories)).toBe('needs_more_evidence');
    expect(classifyPocStrongAreaRule(rule({ status: 'warn' }), categories)).toBe('needs_more_evidence');
  });

  it('classifies verified structural fails below category threshold as gate candidates', () => {
    const categories = [{ key: 'pdf_ua_compliance' as const, score: 60, applicable: true }];

    expect(classifyPocStrongAreaRule(rule({ status: 'fail' }), categories)).toBe('ready_for_gate_candidate');
    expect(classifyPocStrongAreaRule(rule({
      ruleId: 'pdfua.font.to_unicode_cmap_present',
      status: 'fail',
      category: 'text_extractability',
    }), [{ key: 'text_extractability' as const, score: 60, applicable: true }])).toBe('needs_more_evidence');
  });

  it('builds deterministic gap, noisy, and promotion summaries', () => {
    const rows: PocStrongAreaFileRow[] = [
      {
        id: 'b-file',
        file: '/tmp/b.pdf',
        score: 90,
        grade: 'A',
        categories: [
          { key: 'pdf_ua_compliance', score: 95, applicable: true },
          { key: 'text_extractability', score: 80, applicable: true },
        ],
        rules: [
          rule({ ruleId: 'pdfua.parent_tree.present', status: 'fail', message: 'missing' }),
          rule({
            ruleId: 'pdfua.font.cid_to_gidmap_valid',
            status: 'warn',
            severity: 'warning',
            category: 'text_extractability',
            confidence: 'heuristic',
            message: 'risk',
          }),
        ],
      },
      {
        id: 'a-file',
        file: '/tmp/a.pdf',
        score: 80,
        grade: 'B',
        categories: [{ key: 'reading_order', score: 60, applicable: true }],
        rules: [
          rule({
            ruleId: 'pdfua.content.text_tagged_or_artifacted',
            status: 'fail',
            category: 'reading_order',
            message: 'text debt',
          }),
        ],
      },
    ];

    const summary = buildPocStrongAreaSummary(rows);

    expect(summary.statusDistribution).toMatchObject({ fail: 2, warn: 1, pass: 0, not_applicable: 0 });
    expect(summary.categoryPassPacFailGaps.map(row => row.ruleId)).toEqual(['pdfua.parent_tree.present']);
    expect(summary.noisyEvidence.map(row => row.ruleId)).toEqual(['pdfua.font.cid_to_gidmap_valid']);
    expect(summary.familySummaries.map(row => `${row.family}:${row.fail}:${row.warn}`)).toEqual([
      'content_tagging:1:0',
      'fonts_cmap:0:1',
      'parent_tree:1:0',
    ]);
    expect(summary.promotionCandidates.map(row => `${row.classification}:${row.ruleId}`)).toEqual([
      'ready_for_scoring_candidate:pdfua.parent_tree.present',
      'ready_for_gate_candidate:pdfua.content.text_tagged_or_artifacted',
    ]);
  });
});

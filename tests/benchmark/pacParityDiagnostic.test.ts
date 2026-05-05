import { describe, expect, it } from 'vitest';
import {
  buildPacParitySummary,
  isCategoryPassPacFailGap,
  renderPacParityMarkdown,
  type PacParityFileRow,
} from '../../scripts/pac-parity-diagnostic.js';
import type { PacRuleEvidence } from '../../src/services/compliance/pacRuleEvidence.js';

function rule(overrides: Partial<PacRuleEvidence> & Pick<PacRuleEvidence, 'ruleId' | 'status' | 'category'>): PacRuleEvidence {
  return {
    severity: overrides.status === 'fail' ? 'failure' : overrides.status === 'warn' ? 'warning' : 'pass',
    message: `${overrides.ruleId} message`,
    confidence: 'verified',
    ...overrides,
  };
}

describe('pac parity diagnostic helpers', () => {
  it('detects category-pass / PAC-fail gaps at the remediation threshold', () => {
    const pacFail = rule({
      ruleId: 'pdfua.figure.alt_present',
      status: 'fail',
      category: 'alt_text',
    });

    expect(isCategoryPassPacFailGap(pacFail, [
      { key: 'alt_text', score: 95, applicable: true },
    ])).toBe(true);
    expect(isCategoryPassPacFailGap(pacFail, [
      { key: 'alt_text', score: 79, applicable: true },
    ])).toBe(false);
    expect(isCategoryPassPacFailGap(pacFail, [
      { key: 'alt_text', score: 95, applicable: false },
    ])).toBe(false);
    expect(isCategoryPassPacFailGap({ ...pacFail, status: 'warn', severity: 'warning' }, [
      { key: 'alt_text', score: 95, applicable: true },
    ])).toBe(false);
  });

  it('summarizes status, noisy rules, gaps, and deterministic rule ordering', () => {
    const rows: PacParityFileRow[] = [
      {
        id: 'b',
        file: '/tmp/b.pdf',
        score: 95,
        grade: 'A',
        pdfClass: 'native_tagged',
        pageCount: 2,
        categories: [
          { key: 'pdf_ua_compliance', score: 92, applicable: true },
          { key: 'alt_text', score: 95, applicable: true },
        ],
        rules: [
          rule({
            ruleId: 'pdfua.metadata.xmp_present',
            status: 'warn',
            category: 'pdf_ua_compliance',
            confidence: 'heuristic',
          }),
          rule({
            ruleId: 'pdfua.figure.alt_present',
            status: 'fail',
            category: 'alt_text',
          }),
        ],
      },
      {
        id: 'a',
        file: '/tmp/a.pdf',
        score: 75,
        grade: 'C',
        pdfClass: 'native_tagged',
        pageCount: 1,
        categories: [
          { key: 'pdf_ua_compliance', score: 70, applicable: true },
          { key: 'alt_text', score: 100, applicable: true },
        ],
        rules: [
          rule({
            ruleId: 'pdfua.figure.alt_present',
            status: 'pass',
            category: 'alt_text',
          }),
          rule({
            ruleId: 'pdfua.table.headers_present',
            status: 'not_applicable',
            category: 'table_markup',
          }),
        ],
      },
    ];

    const summary = buildPacParitySummary(rows);

    expect(summary.statusDistribution).toEqual({
      pass: 1,
      warn: 1,
      fail: 1,
      not_applicable: 1,
    });
    expect(summary.categoryPassPacFailGaps).toEqual([
      expect.objectContaining({
        fileId: 'b',
        category: 'alt_text',
        categoryScore: 95,
        ruleId: 'pdfua.figure.alt_present',
      }),
    ]);
    expect(summary.noisyRules.map(row => row.ruleId)).toEqual(['pdfua.metadata.xmp_present']);
    expect(summary.ruleSummaries.map(row => row.ruleId)).toEqual([
      'pdfua.figure.alt_present',
      'pdfua.metadata.xmp_present',
      'pdfua.table.headers_present',
    ]);

    const markdown = renderPacParityMarkdown(summary);
    expect(markdown).toContain('Category Pass / PAC Fail Gaps');
    expect(markdown).toContain('pdfua.figure.alt_present');
    expect(markdown).toContain('Noisy Or Incomplete Rules');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildStrictCapTargetDiagnostic,
  extractFiveReviewRuleLinks,
  strictCapFamily,
} from '../../scripts/pac-strict-cap-target-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { CategoryKey, ScoreCapApplied, ScoredCategory } from '../../src/types.js';

function pacCap(ruleId: string, category: CategoryKey, cap = 79): ScoreCapApplied {
  return {
    category,
    cap,
    rawScore: 100,
    finalScore: cap,
    reason: `PAC rule failure: ${ruleId}`,
  };
}

function category(key: CategoryKey, score: number, applicable = true): ScoredCategory {
  return {
    key,
    score,
    applicable,
    weight: 1,
    severity: score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'failure',
    findings: [],
  };
}

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file ?? `/tmp/${input.id}.pdf`,
    cohort: input.cohort ?? '20-figure-ownership',
    sourceType: input.sourceType ?? 'original',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 60,
    beforeGrade: input.beforeGrade ?? 'D',
    beforePdfClass: input.beforePdfClass ?? 'tagged',
    afterScore: input.afterScore ?? 80,
    afterGrade: input.afterGrade ?? 'C',
    afterPdfClass: input.afterPdfClass ?? 'tagged',
    afterCategories: input.afterCategories ?? [category('table_markup', 60)],
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedGrade ?? null,
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? null,
    reanalyzedCategories: input.reanalyzedCategories,
    reanalyzedScoreCapsApplied: input.reanalyzedScoreCapsApplied ?? [],
    delta: input.delta ?? 20,
    appliedTools: input.appliedTools ?? [],
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    error: input.error,
  } as RemediateBenchmarkRow;
}

function diagnostic(rows: RemediateBenchmarkRow[], fiveReview?: unknown) {
  return buildStrictCapTargetDiagnostic({
    runDirs: ['run-a'],
    rowsByRun: [{ runDir: 'run-a', rows }],
    fiveReview,
    generatedAt: '2026-05-08T00:00:00.000Z',
  });
}

describe('PAC strict-cap target diagnostic helpers', () => {
  it('groups and ranks score-moving table caps ahead of frequent high-grade structure caps', () => {
    const report = diagnostic([
      row({
        id: 'a-high-1',
        afterScore: 97,
        afterGrade: 'A',
        afterCategories: [category('reading_order', 79)],
        afterScoreCapsApplied: [pacCap('pdfua.structure.parent_links_valid', 'reading_order')],
      }),
      row({
        id: 'a-high-2',
        afterScore: 96,
        afterGrade: 'A',
        afterCategories: [category('reading_order', 79)],
        afterScoreCapsApplied: [pacCap('pdfua.structure.parent_links_valid', 'reading_order')],
      }),
      row({
        id: 'table-low-1',
        afterScore: 78,
        afterGrade: 'C',
        afterCategories: [category('table_markup', 40)],
        afterScoreCapsApplied: [pacCap('pdfua.table.header_association_present', 'table_markup')],
      }),
      row({
        id: 'table-low-2',
        afterScore: 88,
        afterGrade: 'B',
        afterCategories: [category('table_markup', 60)],
        afterScoreCapsApplied: [pacCap('pdfua.table.header_cells_associated', 'table_markup')],
      }),
    ]);

    expect(report.summary.selectedFamily).toBe('table_header_structure');
    expect(report.summary.selectedTargetFiles).toEqual(['table-low-1', 'table-low-2']);
    expect(report.familySummaries[0]).toEqual(expect.objectContaining({
      family: 'table_header_structure',
      recommendation: 'select_next',
      repairCandidateCount: 2,
    }));
    expect(report.familySummaries.find(item => item.family === 'structure_syntax')).toEqual(expect.objectContaining({
      recommendation: 'track',
      alreadyHighGradeCount: 2,
    }));
  });

  it('classifies parked runtime rows and analyzer-volatility rows out of repair selection', () => {
    const report = diagnostic([
      row({
        id: 'structure-4438',
        afterScore: null,
        afterGrade: null,
        error: 'per_pdf_timeout',
        afterCategories: [category('table_markup', 0)],
        afterScoreCapsApplied: [pacCap('pdfua.table.header_association_present', 'table_markup')],
      }),
      row({
        id: 'structure-4076',
        afterScore: 48,
        afterGrade: 'F',
        afterCategories: [category('table_markup', 0)],
        afterScoreCapsApplied: [pacCap('pdfua.table.header_association_present', 'table_markup')],
      }),
    ]);

    expect(report.rows.map(item => `${item.fileId}:${item.classification}`).sort()).toEqual([
      'structure-4076:analyzer_volatility',
      'structure-4438:runtime_or_parked_debt',
    ]);
    expect(report.summary.repairCandidateCount).toBe(0);
  });

  it('keeps conservative 89 PAC caps diagnostic-only for target selection', () => {
    const report = diagnostic([
      row({
        id: 'baseline-cap',
        afterScore: 89,
        afterGrade: 'B',
        afterCategories: [category('title_language', 89)],
        afterScoreCapsApplied: [pacCap('pdfua.metadata.pdfua_identifier_present', 'title_language', 89)],
      }),
    ]);

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'diagnostic_only',
      classificationReason: expect.stringContaining('baseline/conservative'),
    }));
    expect(report.summary.selectedFamily).toBeNull();
  });

  it('uses reanalyzed score caps before after caps when both are present', () => {
    const report = diagnostic([
      row({
        id: 'reanalyzed-row',
        afterScore: 95,
        afterGrade: 'A',
        afterCategories: [category('reading_order', 79)],
        afterScoreCapsApplied: [pacCap('pdfua.structure.parent_links_valid', 'reading_order')],
        reanalyzedScore: 78,
        reanalyzedGrade: 'C',
        reanalyzedCategories: [category('table_markup', 35)],
        reanalyzedScoreCapsApplied: [pacCap('pdfua.table.header_association_present', 'table_markup')],
      }),
    ]);

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toEqual(expect.objectContaining({
      ruleId: 'pdfua.table.header_association_present',
      phase: 'reanalyzed',
      score: 78,
      categoryScore: 35,
      classification: 'repair_candidate',
    }));
  });

  it('links five-PDF PAC buckets to internal strict-cap rules', () => {
    const fiveReview = {
      files: [
        {
          id: 'review-a',
          leafCoverage: [
            {
              bucket: 'Structure elements',
              family: 'Table header association',
              scoreInfluencingRuleIds: [
                'pdfua.table.header_association_present',
                'pdfua.table.header_cells_associated',
              ],
            },
          ],
        },
      ],
    };

    expect(extractFiveReviewRuleLinks(fiveReview)).toEqual([
      {
        ruleId: 'pdfua.table.header_association_present',
        files: ['review-a'],
        buckets: ['Structure elements'],
        leafFamilies: ['Table header association'],
      },
      {
        ruleId: 'pdfua.table.header_cells_associated',
        files: ['review-a'],
        buckets: ['Structure elements'],
        leafFamilies: ['Table header association'],
      },
    ]);

    const report = diagnostic([
      row({
        id: 'table-low',
        afterScore: 78,
        afterGrade: 'C',
        afterCategories: [category('table_markup', 40)],
        afterScoreCapsApplied: [pacCap('pdfua.table.header_association_present', 'table_markup')],
      }),
    ], fiveReview);

    expect(report.rows[0]).toEqual(expect.objectContaining({
      fiveReviewFiles: ['review-a'],
      fiveReviewBuckets: ['Structure elements'],
      fiveReviewLeafFamilies: ['Table header association'],
    }));
    expect(report.ruleSummaries[0]).toEqual(expect.objectContaining({ fiveReviewFileCount: 1 }));
  });

  it('maps PAC rules to stable repair families', () => {
    expect(strictCapFamily('pdfua.table.header_association_present', 'table_markup')).toBe('table_header_structure');
    expect(strictCapFamily('pdfua.parent_tree.mcid_entries_valid', 'pdf_ua_compliance')).toBe('parent_tree_structure');
    expect(strictCapFamily('pdfua.content.text_tagged_or_artifacted', 'pdf_ua_compliance')).toBe('content_tagging');
  });
});

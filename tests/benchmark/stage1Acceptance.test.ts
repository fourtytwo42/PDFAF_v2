import { describe, expect, it } from 'vitest';
import {
  buildStage1AcceptanceAudit,
  renderStage1AcceptanceMarkdown,
  type Stage1CaseClassification,
} from '../../src/services/benchmark/stage1Acceptance.js';
import type { AnalyzeBenchmarkRow, RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { ScoredCategory } from '../../src/types.js';

function category(input: {
  key: ScoredCategory['key'];
  applicable?: boolean;
  manualReviewRequired?: boolean;
  manualReviewReasons?: string[];
  verificationLevel?: ScoredCategory['verificationLevel'];
}): ScoredCategory {
  return {
    key: input.key,
    score: 80,
    weight: 1,
    applicable: input.applicable ?? true,
    severity: input.manualReviewRequired ? 'moderate' : 'pass',
    findings: [],
    evidence: input.manualReviewRequired ? 'manual_review_required' : 'verified',
    verificationLevel: input.verificationLevel ?? (input.manualReviewRequired ? 'manual_review_required' : 'verified'),
    manualReviewRequired: input.manualReviewRequired ?? false,
    manualReviewReasons: input.manualReviewReasons ?? [],
  };
}

function analyzeRow(input: {
  id: string;
  cohort?: AnalyzeBenchmarkRow['cohort'];
  categories: ScoredCategory[];
}): AnalyzeBenchmarkRow {
  return {
    id: input.id,
    file: `00-fixtures/${input.id}.pdf`,
    cohort: input.cohort ?? '00-fixtures',
    sourceType: 'fixture',
    intent: 'test',
    score: 80,
    grade: 'B',
    pdfClass: 'native_tagged',
    pageCount: 5,
    categories: input.categories,
    findings: [],
    analysisDurationMs: 100,
    wallAnalyzeMs: 110,
    verificationLevel: 'manual_review_required',
    manualReviewRequired: true,
    manualReviewReasons: [],
    scoreCapsApplied: [],
  };
}

function remediateRow(input: {
  id: string;
  afterCategories?: ScoredCategory[];
  reanalyzedCategories?: ScoredCategory[];
  afterManualReviewRequired?: boolean;
  reanalyzedManualReviewRequired?: boolean | null;
}): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: `00-fixtures/${input.id}.pdf`,
    cohort: '00-fixtures',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 80,
    beforeGrade: 'B',
    beforePdfClass: 'native_tagged',
    beforeCategories: [],
    beforeVerificationLevel: 'manual_review_required',
    beforeManualReviewRequired: true,
    beforeManualReviewReasons: [],
    beforeScoreCapsApplied: [],
    afterScore: 95,
    afterGrade: 'A',
    afterPdfClass: 'native_tagged',
    afterCategories: input.afterCategories ?? [],
    afterVerificationLevel: input.afterManualReviewRequired ? 'manual_review_required' : 'verified',
    afterManualReviewRequired: input.afterManualReviewRequired ?? false,
    afterManualReviewReasons: [],
    afterScoreCapsApplied: [],
    reanalyzedScore: input.reanalyzedManualReviewRequired === null ? null : 95,
    reanalyzedGrade: input.reanalyzedManualReviewRequired === null ? null : 'A',
    reanalyzedPdfClass: input.reanalyzedManualReviewRequired === null ? null : 'native_tagged',
    reanalyzedCategories: input.reanalyzedCategories ?? [],
    reanalyzedVerificationLevel:
      input.reanalyzedManualReviewRequired === null
        ? null
        : input.reanalyzedManualReviewRequired
          ? 'manual_review_required'
          : 'verified',
    reanalyzedManualReviewRequired: input.reanalyzedManualReviewRequired ?? false,
    reanalyzedManualReviewReasons: [],
    reanalyzedScoreCapsApplied: [],
    delta: 15,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 100,
    remediationDurationMs: 200,
    wallRemediateMs: 220,
    analysisAfterMs: 90,
    totalPipelineMs: 310,
  };
}

function classificationOf(id: string, cases: Array<{ id: string; remainingClassification: Stage1CaseClassification | null }>) {
  return cases.find(auditCase => auditCase.id === id)?.remainingClassification;
}

describe('stage1 acceptance audit', () => {
  it('classifies remaining cases into the approved rubric buckets', () => {
    const analyzeResults: AnalyzeBenchmarkRow[] = [
      analyzeRow({
        id: 'structural',
        categories: [category({
          key: 'reading_order',
          manualReviewRequired: true,
          manualReviewReasons: ['Reading order fell back to heading/paragraph heuristics because no structure tree was available.'],
        })],
      }),
      analyzeRow({
        id: 'ocr',
        categories: [category({
          key: 'text_extractability',
          manualReviewRequired: true,
          manualReviewReasons: ['OCR metadata indicates a machine-generated text layer that was not verified for recognition accuracy, logical order, or assistive-technology usability.'],
        })],
      }),
      analyzeRow({
        id: 'alt',
        categories: [category({
          key: 'alt_text',
          manualReviewRequired: true,
          manualReviewReasons: ['Alt text ownership or nested/orphaned alternate text risks were detected and need manual verification.'],
        })],
      }),
      analyzeRow({
        id: 'pdfua',
        categories: [category({
          key: 'pdf_ua_compliance',
          manualReviewRequired: true,
          manualReviewReasons: ['PDF/UA compliance includes heuristic proxy signals and should be confirmed with external/manual review before treating as a high-confidence pass.'],
        })],
      }),
      analyzeRow({
        id: 'suspicious',
        categories: [category({
          key: 'heading_structure',
          manualReviewRequired: true,
          manualReviewReasons: ['Unexpected manual review reason.'],
        })],
      }),
    ];

    const remediateResults: RemediateBenchmarkRow[] = [
      remediateRow({
        id: 'structural',
        reanalyzedCategories: [category({
          key: 'reading_order',
          manualReviewRequired: true,
          manualReviewReasons: ['Reading order fell back to heading/paragraph heuristics because no structure tree was available.'],
        })],
        reanalyzedManualReviewRequired: true,
      }),
      remediateRow({
        id: 'ocr',
        reanalyzedCategories: [category({
          key: 'text_extractability',
          manualReviewRequired: true,
          manualReviewReasons: ['OCR metadata indicates a machine-generated text layer that was not verified for recognition accuracy, logical order, or assistive-technology usability.'],
        })],
        reanalyzedManualReviewRequired: true,
      }),
      remediateRow({
        id: 'alt',
        reanalyzedCategories: [category({
          key: 'alt_text',
          manualReviewRequired: true,
          manualReviewReasons: ['Alt text ownership or nested/orphaned alternate text risks were detected and need manual verification.'],
        })],
        reanalyzedManualReviewRequired: true,
      }),
      remediateRow({
        id: 'pdfua',
        reanalyzedCategories: [category({
          key: 'pdf_ua_compliance',
          manualReviewRequired: true,
          manualReviewReasons: ['PDF/UA compliance includes heuristic proxy signals and should be confirmed with external/manual review before treating as a high-confidence pass.'],
        })],
        reanalyzedManualReviewRequired: true,
      }),
      remediateRow({
        id: 'suspicious',
        reanalyzedCategories: [category({
          key: 'heading_structure',
          manualReviewRequired: true,
          manualReviewReasons: ['Unexpected manual review reason.'],
        })],
        reanalyzedManualReviewRequired: true,
      }),
    ];

    const audit = buildStage1AcceptanceAudit({
      analyzeRunDir: 'analyze',
      fullRunDir: 'full',
      analyzeResults,
      remediateResults,
      generatedAt: '2026-04-18T00:00:00.000Z',
    });

    expect(classificationOf('structural', audit.cases)).toBe('justified-structural');
    expect(classificationOf('ocr', audit.cases)).toBe('justified-ocr');
    expect(classificationOf('alt', audit.cases)).toBe('justified-alt-ownership');
    expect(classificationOf('pdfua', audit.cases)).toBe('justified-pdfua-proxy-high-pass');
    expect(classificationOf('suspicious', audit.cases)).toBe('suspicious-overbroad');
    expect(audit.summary.suspiciousOverbroadCount).toBe(1);
  });

  it('tracks cleared cases and ignores non-applicable category-level manual review', () => {
    const analyzeResults: AnalyzeBenchmarkRow[] = [
      analyzeRow({
        id: 'cleared',
        categories: [
          category({
            key: 'reading_order',
            manualReviewRequired: true,
            manualReviewReasons: ['Annotation tab order or /StructParent issues mean reading order should be checked manually with assistive technology.'],
          }),
          category({
            key: 'color_contrast',
            applicable: false,
            manualReviewRequired: true,
            manualReviewReasons: ['Color contrast was not machine-verified because this build does not perform rendered pixel contrast analysis.'],
          }),
        ],
      }),
    ];
    const remediateResults: RemediateBenchmarkRow[] = [
      remediateRow({
        id: 'cleared',
        reanalyzedCategories: [
          category({
            key: 'color_contrast',
            applicable: false,
            manualReviewRequired: true,
            manualReviewReasons: ['Color contrast was not machine-verified because this build does not perform rendered pixel contrast analysis.'],
          }),
        ],
        reanalyzedManualReviewRequired: false,
      }),
    ];

    const audit = buildStage1AcceptanceAudit({
      analyzeRunDir: 'analyze',
      fullRunDir: 'full',
      analyzeResults,
      remediateResults,
    });

    expect(audit.summary.clearedByRemediationCount).toBe(1);
    expect(audit.summary.postRemediationManualReviewCount).toBe(0);
    expect(audit.cases[0]?.analyze.triggeringCategories).toEqual(['reading_order']);
    expect(audit.cases[0]?.postRemediation.triggeringCategories).toEqual([]);
    const markdown = renderStage1AcceptanceMarkdown(audit);
    expect(markdown).toContain('Stage 1 Acceptance Audit');
    expect(markdown).toContain('None.');
  });
});

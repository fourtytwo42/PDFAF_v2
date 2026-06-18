import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewRemediatedReadability, shouldRunReadabilityAutoRepair } from '../../src/services/semantic/readabilityReview.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

function minimalAnalysis(): AnalysisResult {
  return {
    filename: 'readable.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    scoreProfile: { overallScore: 94, grade: 'A' },
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    categories: [
      {
        key: 'reading_order',
        label: 'Reading order',
        score: 92,
        applicable: true,
        severity: 'pass',
        findings: [],
      },
      {
        key: 'alt_text',
        label: 'Alt text',
        score: 100,
        applicable: true,
        severity: 'pass',
        findings: [],
      },
    ],
    findings: [],
  } as unknown as AnalysisResult;
}

function minimalSnapshot(): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Annual report title Executive summary Revenue increased during the year.'],
    textCharCount: 68,
    metadata: { title: 'Annual report', language: 'en' },
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    structTitle: 'Annual report',
    headings: [{ level: 1, text: 'Annual report title', page: 0 }],
    figures: [{ page: 0, hasAlt: true, altText: 'Line chart showing annual revenue growth', isArtifact: false }],
    tables: [],
    links: [],
    formFields: [],
    formFieldsFromPdfjs: [],
  } as unknown as DocumentSnapshot;
}

describe('reviewRemediatedReadability', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...prev,
      OPENAI_COMPAT_BASE_URL: 'http://llm.example/v1',
      OPENAI_COMPAT_MODEL: 'review-model',
      OPENAI_COMPAT_API_KEY: 'secret',
    };
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.unstubAllGlobals();
  });

  it('returns structured AI readability grades from tool-call output', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'grade_pdf_readability',
                    arguments: JSON.stringify({
                      score: 82,
                      status: 'warn',
                      confidence: 'medium',
                      summary: 'Mostly readable, but one reading-order item should be checked.',
                      strengths: ['Tagged structure is present', 'Figure alt text is meaningful'],
                      findings: [
                        {
                          area: 'reading_order',
                          severity: 'minor',
                          message: 'Confirm the title is first in screen-reader order.',
                          evidence: 'Heading and page sample both include the title.',
                          page: 1,
                        },
                      ],
                      manualReviewRecommended: true,
                      manualReviewReasons: ['Screen-reader smoke test recommended for title order.'],
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const review = await reviewRemediatedReadability({
      filename: 'readable.pdf',
      analysis: minimalAnalysis(),
      snapshot: minimalSnapshot(),
    });

    expect(review.status).toBe('warn');
    expect(review.score).toBe(82);
    expect(review.grade).toBe('B');
    expect(review.confidence).toBe('medium');
    expect(review.endpoint).toBe('primary');
    expect(review.model).toBe('review-model');
    expect(review.findings[0]?.area).toBe('reading_order');
    expect(review.manualReviewRecommended).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gates auto-repair to warn/failed readability reviews with budget', () => {
    const review = {
      status: 'warn',
      score: 82,
      grade: 'B',
      confidence: 'medium',
      durationMs: 1,
      summary: 'Review recommended.',
      strengths: [],
      findings: [],
      manualReviewRecommended: true,
      manualReviewReasons: [],
    } as const;

    expect(shouldRunReadabilityAutoRepair({
      reviewRequested: true,
      autoRepairEnabled: true,
      hasBudget: true,
      review,
    })).toEqual({ shouldRun: true, reason: 'readability_issue_detected' });

    expect(shouldRunReadabilityAutoRepair({
      reviewRequested: true,
      autoRepairEnabled: true,
      hasBudget: true,
      review: { ...review, status: 'passed', score: 94, grade: 'A' },
    })).toEqual({ shouldRun: false, reason: 'readability_passed' });

    expect(shouldRunReadabilityAutoRepair({
      reviewRequested: true,
      autoRepairEnabled: true,
      hasBudget: false,
      review,
    })).toEqual({ shouldRun: false, reason: 'no_budget' });
  });

});

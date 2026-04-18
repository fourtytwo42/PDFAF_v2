import { describe, expect, it } from 'vitest';
import { enforceSemanticTrust, evaluateSemanticMutation } from '../../src/services/semantic/semanticPolicy.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../src/types.js';

function makeSnapshot(): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Hello world'],
    textCharCount: 11,
    imageOnlyPageCount: 0,
    metadata: { title: 'Doc', language: 'en', author: '', subject: '' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    pdfUaVersion: '1',
    structTitle: 'Doc',
    headings: [{ level: 1, text: 'Doc', page: 0, structRef: '10_0' }],
    figures: [{ hasAlt: false, isArtifact: false, page: 0, structRef: '20_0' }],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
  };
}

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    id: 'a1',
    filename: 'doc.pdf',
    timestamp: '2026-04-18T00:00:00.000Z',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: 80,
    grade: 'B',
    findings: [],
    analysisDurationMs: 1,
    verificationLevel: 'verified',
    categories: [
      {
        key: 'alt_text',
        applicable: true,
        score: 80,
        weight: 0.13,
        severity: 'moderate',
        evidence: 'verified',
        verificationLevel: 'verified',
        findings: [],
      },
      {
        key: 'heading_structure',
        applicable: true,
        score: 88,
        weight: 0.13,
        severity: 'minor',
        evidence: 'verified',
        verificationLevel: 'verified',
        findings: [],
      },
    ],
    structuralClassification: {
      structureClass: 'native_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: true,
        hasTables: false,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low',
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'high',
    },
    ...overrides,
  };
}

function withCategoryScore(analysis: AnalysisResult, key: CategoryKey, score: number): AnalysisResult {
  return {
    ...analysis,
    categories: analysis.categories.map(category =>
      category.key === key ? { ...category, score } : category,
    ),
  };
}

describe('semanticPolicy', () => {
  it('reverts semantic mutations when structural confidence regresses', () => {
    const before = makeAnalysis();
    const after = makeAnalysis({
      score: 83,
      structuralClassification: {
        ...before.structuralClassification!,
        confidence: 'medium',
      },
    });

    const result = evaluateSemanticMutation({
      lane: 'figures',
      beforeAnalysis: before,
      afterAnalysis: after,
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot(),
      targetCategoryKey: 'alt_text',
      candidateCountBefore: 2,
      candidateCountAfter: 1,
      proposalsAccepted: 1,
      proposalsRejected: 0,
      batches: [],
      durationMs: 10,
      regressionTolerance: 1,
    });

    expect(result.accepted).toBe(false);
    expect(result.skippedReason).toBe('regression_reverted');
    expect(result.errorMessage).toContain('structural_confidence');
  });

  it('reverts semantic mutations when target evidence does not improve', () => {
    const before = makeAnalysis();
    const after = makeAnalysis({ score: before.score });

    const result = evaluateSemanticMutation({
      lane: 'headings',
      beforeAnalysis: before,
      afterAnalysis: after,
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot(),
      targetCategoryKey: 'heading_structure',
      candidateCountBefore: 2,
      candidateCountAfter: 2,
      proposalsAccepted: 1,
      proposalsRejected: 0,
      batches: [],
      durationMs: 12,
      regressionTolerance: 1,
    });

    expect(result.accepted).toBe(false);
    expect(result.skippedReason).toBe('no_target_improvement');
    expect(result.changeStatus).toBe('reverted');
  });

  it('keeps semantic mutations when the target category improves', () => {
    const before = makeAnalysis();
    const after = withCategoryScore(makeAnalysis({ score: 84 }), 'alt_text', 91);

    const result = evaluateSemanticMutation({
      lane: 'figures',
      beforeAnalysis: before,
      afterAnalysis: after,
      beforeSnapshot: makeSnapshot(),
      afterSnapshot: makeSnapshot(),
      targetCategoryKey: 'alt_text',
      candidateCountBefore: 2,
      candidateCountAfter: 2,
      proposalsAccepted: 1,
      proposalsRejected: 0,
      batches: [],
      durationMs: 10,
      regressionTolerance: 1,
    });

    expect(result.accepted).toBe(true);
    expect(result.skippedReason).toBe('completed');
    expect(result.changeStatus).toBe('applied');
  });

  it('downgrades semantic-only verified categories to mixed trust', () => {
    const before = makeAnalysis();
    const after = withCategoryScore(makeAnalysis({ score: 85 }), 'alt_text', 90);

    const result = enforceSemanticTrust({
      before,
      after,
      summaries: [
        {
          lane: 'figures',
          skippedReason: 'completed',
          durationMs: 20,
          proposalsAccepted: 1,
          proposalsRejected: 0,
          scoreBefore: 80,
          scoreAfter: 85,
          batches: [],
          gate: {
            passed: true,
            reason: 'gate_passed',
            details: ['category:80->90'],
            candidateCountBefore: 2,
            candidateCountAfter: 1,
            targetCategoryKey: 'alt_text',
            targetCategoryScoreBefore: 80,
            targetCategoryScoreAfter: 90,
          },
          changeStatus: 'applied',
        },
      ],
    });

    expect(result.trustDowngraded).toBe(true);
    expect(result.analysis.verificationLevel).toBe('mixed');
    expect(result.analysis.categories.find(category => category.key === 'alt_text')?.verificationLevel).toBe('mixed');
    expect(result.analysis.categories.find(category => category.key === 'alt_text')?.evidence).toBe('inferred_after_fix');
    expect(result.analysis.manualReviewReasons).toContain(
      'Semantic improvements require corroborating deterministic evidence.',
    );
  });
});

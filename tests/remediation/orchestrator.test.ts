import { describe, expect, it } from 'vitest';
import { compareStructuralConfidence, shouldRejectStageResult } from '../../src/services/remediation/orchestrator.js';
import type { AnalysisResult, AppliedRemediationTool, RemediationStagePlan } from '../../src/types.js';

function makeAnalysis(input: {
  score: number;
  confidence?: 'high' | 'medium' | 'low';
}): AnalysisResult {
  return {
    id: `analysis-${input.score}-${input.confidence ?? 'none'}`,
    timestamp: '2026-04-18T00:00:00.000Z',
    filename: 'fixture.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: input.score,
    grade: 'B',
    categories: [],
    findings: [],
    analysisDurationMs: 1,
    ...(input.confidence
      ? {
          structuralClassification: {
            structureClass: 'native_tagged',
            contentProfile: {
              pageBucket: '1-5',
              dominantContent: 'text',
              hasStructureTree: true,
              hasBookmarks: false,
              hasFigures: false,
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
            confidence: input.confidence,
          },
        }
      : {}),
  };
}

function makeStage(toolName = 'bootstrap_struct_tree'): RemediationStagePlan {
  return {
    stageNumber: 1,
    reanalyzeAfter: true,
    tools: [{ toolName, params: {}, rationale: 'test' }],
  };
}

function makeApplied(toolName = 'bootstrap_struct_tree'): AppliedRemediationTool[] {
  return [{
    toolName,
    stage: 1,
    round: 1,
    scoreBefore: 80,
    scoreAfter: 80,
    delta: 0,
    outcome: 'applied',
  }];
}

describe('compareStructuralConfidence', () => {
  it('detects a confidence regression', () => {
    const result = compareStructuralConfidence(
      makeAnalysis({ score: 80, confidence: 'high' }),
      makeAnalysis({ score: 85, confidence: 'medium' }),
    );
    expect(result).toEqual({
      regressed: true,
      reason: 'stage_regressed_structural_confidence(high->medium)',
    });
  });

  it('ignores missing structural classifications', () => {
    const result = compareStructuralConfidence(
      makeAnalysis({ score: 80, confidence: 'high' }),
      makeAnalysis({ score: 85 }),
    );
    expect(result).toEqual({
      regressed: false,
      reason: null,
    });
  });
});

describe('shouldRejectStageResult', () => {
  it('rejects score-improving stages that lower structural confidence', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'high' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_structural_confidence(high->medium)',
    });
  });

  it('accepts score-improving stages when confidence stays the same', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('keeps existing score-regression rollback behavior', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 75, confidence: 'high' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_score(75)',
    });
  });

  it('does not reject score-improving stages when confidence is missing on either side', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80 }),
      after: makeAnalysis({ score: 85, confidence: 'low' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('rejects score-improving structural stages when ICJIA-parity debug says the root tree is still shallow', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage('synthesize_basic_structure_from_layout'),
      stageApplied: [{
        toolName: 'synthesize_basic_structure_from_layout',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 80,
        delta: 0,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          debug: {
            rootReachableDepth: 1,
          },
        }),
      }],
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_externally_incomplete(rootReachableDepth<=1)',
    });
  });
});

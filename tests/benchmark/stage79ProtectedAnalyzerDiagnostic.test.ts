import { describe, expect, it } from 'vitest';
import { classifyStage79AnalyzerRow } from '../../scripts/stage79-protected-analyzer-diagnostic.js';

function repeat(input: {
  score: number;
  python?: string;
  detection?: string;
  merged?: string;
  scoreSig?: string;
}) {
  const scoreSig = input.scoreSig ?? `score-${input.score}`;
  return {
    repeat: 1,
    score: input.score,
    grade: input.score >= 90 ? 'A' : 'F',
    pdfClass: 'native_tagged',
    categoryScores: { reading_order: input.score },
    scoreCaps: [],
    detectionSignals: {},
    snapshotCounts: {},
    signatures: {
      score: scoreSig,
      detection: input.detection ?? 'detection-a',
      pdfjs: 'pdfjs-a',
      pythonStructure: input.python ?? 'python-a',
      mergedSnapshot: input.merged ?? 'merged-a',
    },
    runtimeMs: 1,
  };
}

describe('classifyStage79AnalyzerRow', () => {
  it('classifies same-buffer Python structural variance first', () => {
    const result = classifyStage79AnalyzerRow({
      baselineScore: 90,
      repeats: [
        repeat({ score: 80, python: 'python-a' }),
        repeat({ score: 80, python: 'python-b' }),
      ],
    });

    expect(result.classification).toBe('same_buffer_python_structural_variance');
    expect(result.changedFields).toContain('pythonStructure');
  });

  it('classifies scoring variance when Python signature is stable but score changes', () => {
    const result = classifyStage79AnalyzerRow({
      baselineScore: 90,
      repeats: [
        repeat({ score: 80, scoreSig: 'score-a', python: 'python-a' }),
        repeat({ score: 95, scoreSig: 'score-b', python: 'python-a' }),
      ],
    });

    expect(result.classification).toBe('same_buffer_scoring_variance');
  });

  it('classifies stable below-floor repeats', () => {
    const result = classifyStage79AnalyzerRow({
      baselineScore: 90,
      repeats: [
        repeat({ score: 80, scoreSig: 'score-a' }),
        repeat({ score: 80, scoreSig: 'score-a' }),
      ],
    });

    expect(result.classification).toBe('stable_below_floor');
  });
});

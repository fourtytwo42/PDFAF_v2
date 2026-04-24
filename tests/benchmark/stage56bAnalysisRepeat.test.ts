import { describe, expect, it } from 'vitest';
import {
  buildStage56bReport,
  classifyStage56bAnalysisVariance,
  type Stage56bRepeatSummary,
  type Stage56bRowReport,
} from '../../scripts/stage56b-analysis-repeat.js';

function repeat(input: Partial<Stage56bRepeatSummary> = {}): Stage56bRepeatSummary {
  return {
    repeat: input.repeat ?? 1,
    score: input.score ?? 90,
    grade: input.grade ?? 'A',
    pdfClass: input.pdfClass ?? 'native_tagged',
    categoryScores: input.categoryScores ?? { alt_text: 100, table_markup: 100 },
    scoreCaps: input.scoreCaps ?? [],
    detectionSignals: input.detectionSignals ?? { extractedFigureCount: 2 },
    snapshotCounts: input.snapshotCounts ?? { figureCount: 2 },
    signatures: input.signatures ?? {
      score: 'score-a',
      detection: 'detection-a',
      pdfjs: 'pdfjs-a',
      pythonStructure: 'python-a',
      mergedSnapshot: 'merged-a',
    },
    runtimeMs: input.runtimeMs ?? 10,
    error: input.error,
  };
}

function row(input: Partial<Stage56bRowReport> & { rowId: string }): Stage56bRowReport {
  const repeats = input.repeats ?? [repeat()];
  const classified = classifyStage56bAnalysisVariance(repeats);
  const scores = repeats.map(item => item.score).filter((score): score is number => typeof score === 'number');
  return {
    rowId: input.rowId,
    publicationId: input.publicationId ?? input.rowId.replace(/^v1-/, ''),
    file: input.file ?? `${input.rowId}.pdf`,
    role: input.role ?? 'focus',
    classification: input.classification ?? classified.classification,
    reason: input.reason ?? classified.reason,
    repeats,
    changedFields: input.changedFields ?? classified.changedFields,
    scoreRange: input.scoreRange ?? {
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
      delta: scores.length ? Math.max(...scores) - Math.min(...scores) : null,
    },
  };
}

describe('Stage 56B analysis repeat diagnostic', () => {
  it('classifies identical repeat signatures as stable analysis', () => {
    expect(classifyStage56bAnalysisVariance([repeat({ repeat: 1 }), repeat({ repeat: 2 })])).toEqual({
      classification: 'stable_analysis',
      reason: 'all_repeat_signatures_match',
      changedFields: [],
    });
  });

  it('classifies changed pdfjs signatures as pdfjs variance', () => {
    const result = classifyStage56bAnalysisVariance([
      repeat({ repeat: 1 }),
      repeat({ repeat: 2, signatures: { score: 'score-b', detection: 'detection-b', pdfjs: 'pdfjs-b', pythonStructure: 'python-a', mergedSnapshot: 'merged-b' } }),
    ]);
    expect(result.classification).toBe('pdfjs_variance');
    expect(result.changedFields).toContain('pdfjs');
  });

  it('classifies changed structure signatures as Python structure variance', () => {
    const result = classifyStage56bAnalysisVariance([
      repeat({ repeat: 1 }),
      repeat({ repeat: 2, signatures: { score: 'score-b', detection: 'detection-b', pdfjs: 'pdfjs-a', pythonStructure: 'python-b', mergedSnapshot: 'merged-b' } }),
    ]);
    expect(result.classification).toBe('python_structure_variance');
    expect(result.changedFields).toContain('pythonStructure');
  });

  it('classifies changed detection with stable extractor signatures as merge/detection variance', () => {
    const result = classifyStage56bAnalysisVariance([
      repeat({ repeat: 1 }),
      repeat({ repeat: 2, signatures: { score: 'score-b', detection: 'detection-b', pdfjs: 'pdfjs-a', pythonStructure: 'python-a', mergedSnapshot: 'merged-a' } }),
    ]);
    expect(result).toEqual({
      classification: 'merge_or_detection_variance',
      reason: 'score_or_detection_changed_with_stable_extractor_signatures',
      changedFields: ['score', 'detection'],
    });
  });

  it('fails closed when snapshot signatures are missing', () => {
    const result = classifyStage56bAnalysisVariance([
      repeat({ signatures: { score: 'score-a', detection: 'detection-a', pdfjs: null, pythonStructure: 'python-a', mergedSnapshot: null } }),
    ]);
    expect(result.classification).toBe('inconclusive_missing_snapshot_detail');
  });

  it('recommends determinism work only when focus variance is score-harmful', () => {
    const report = buildStage56bReport({
      manifestPath: 'manifest.json',
      repeatCount: 2,
      focusIds: ['v1-4683'],
      controlIds: ['v1-4139'],
      rows: [
        row({
          rowId: 'v1-4683',
          repeats: [
            repeat({ repeat: 1, score: 59 }),
            repeat({ repeat: 2, score: 92, signatures: { score: 'score-b', detection: 'detection-b', pdfjs: 'pdfjs-a', pythonStructure: 'python-b', mergedSnapshot: 'merged-b' } }),
          ],
        }),
        row({
          rowId: 'v1-4139',
          role: 'control',
          repeats: [
            repeat({ repeat: 1, score: 88 }),
            repeat({ repeat: 2, score: 88, signatures: { score: 'score-a', detection: 'detection-a', pdfjs: 'pdfjs-a', pythonStructure: 'python-b', mergedSnapshot: 'merged-b' } }),
          ],
        }),
      ],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });
    expect(report.decision.status).toBe('analysis_determinism_candidate');
    expect(report.decision.reasons).toContain('1 harmful focus row(s) with score delta > 2');
  });
});

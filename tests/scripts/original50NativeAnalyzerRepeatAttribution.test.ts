import { describe, expect, it } from 'vitest';
import {
  buildNativeAnalyzerRepeatAttributionDiagnostic,
  type AnalyzerRepeatSummary,
} from '../../scripts/original50-native-analyzer-repeat-attribution.js';

function repeat(index: number, input: {
  score: number;
  categories?: Record<string, number>;
  detection?: Record<string, number>;
  snapshot?: Record<string, number | boolean | string | null>;
}): AnalyzerRepeatSummary {
  return {
    index,
    ok: true,
    error: null,
    score: input.score,
    grade: input.score >= 90 ? 'A' : 'F',
    wallMs: 100,
    analysisDurationMs: 90,
    categories: input.categories ?? { heading_structure: 60, table_markup: 100, reading_order: 96 },
    detectionSignals: input.detection ?? { 'heading.extractedHeadingCount': 2, 'figure.extractedFigureCount': 4 },
    snapshotSignals: input.snapshot ?? { headingCount: 2, figureCount: 4, tableCount: 0 },
  };
}

describe('original50 native analyzer repeat attribution', () => {
  it('classifies stable low analyzer repeats', () => {
    const diagnostic = buildNativeAnalyzerRepeatAttributionDiagnostic({
      outDir: '/tmp/out',
      repeatCount: 2,
      targetScore: 93,
      rows: [{
        key: '4680',
        pdfPath: '/tmp/4680.pdf',
        filename: '4680.pdf',
        repeats: [repeat(1, { score: 59 }), repeat(2, { score: 59 })],
      }],
    });

    expect(diagnostic.rows[0]?.classification).toBe('native_analyzer_stable_low');
    expect(diagnostic.decision.status).toBe('move_to_row_failure_shape_or_park');
  });

  it('classifies score volatility before profile-only volatility', () => {
    const diagnostic = buildNativeAnalyzerRepeatAttributionDiagnostic({
      outDir: '/tmp/out',
      repeatCount: 2,
      targetScore: 93,
      rows: [{
        key: '4683',
        pdfPath: '/tmp/4683.pdf',
        filename: '4683.pdf',
        repeats: [
          repeat(1, { score: 59, categories: { heading_structure: 43, table_markup: 6 } }),
          repeat(2, { score: 94, categories: { heading_structure: 99, table_markup: 100 } }),
        ],
      }],
    });

    expect(diagnostic.rows[0]?.classification).toBe('native_analyzer_score_volatile');
    expect(diagnostic.rows[0]?.scoreDelta).toBe(35);
    expect(diagnostic.decision.status).toBe('fix_or_park_native_analyzer_variance_before_behavior');
  });

  it('classifies stable-score profile volatility', () => {
    const diagnostic = buildNativeAnalyzerRepeatAttributionDiagnostic({
      outDir: '/tmp/out',
      repeatCount: 2,
      targetScore: 93,
      rows: [{
        key: '4754',
        pdfPath: '/tmp/4754.pdf',
        filename: '4754.pdf',
        repeats: [
          repeat(1, { score: 59, detection: { 'heading.extractedHeadingCount': 44 } }),
          repeat(2, { score: 59, detection: { 'heading.extractedHeadingCount': 46 } }),
        ],
      }],
    });

    expect(diagnostic.rows[0]?.classification).toBe('native_analyzer_profile_volatile');
    expect(diagnostic.rows[0]?.detectionDeltas.map(delta => delta.key)).toContain('heading.extractedHeadingCount');
  });
});

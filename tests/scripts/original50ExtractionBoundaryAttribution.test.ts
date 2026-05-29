import { describe, expect, it } from 'vitest';
import {
  buildExtractionBoundaryDiagnostic,
  type BoundaryRepeatSummary,
} from '../../scripts/original50-extraction-boundary-attribution.js';

function phase(signals: Record<string, number | boolean | string | null> = {}) {
  return {
    ok: true,
    error: null,
    wallMs: 100,
    signals,
  };
}

function repeat(index: number, input: {
  score: number;
  pdfjs?: Record<string, number | boolean | string | null>;
  structure?: Record<string, number | boolean | string | null>;
  categories?: Record<string, number>;
  detection?: Record<string, number | boolean | string | null>;
  snapshot?: Record<string, number | boolean | string | null>;
}): BoundaryRepeatSummary {
  return {
    index,
    pdfjs: phase(input.pdfjs ?? { pageCount: 10, textCharCount: 1000 }),
    structure: phase(input.structure ?? { headingCount: 2, tableCount: 0 }),
    analyze: {
      ok: true,
      error: null,
      wallMs: 120,
      signals: {},
      score: input.score,
      grade: input.score >= 90 ? 'A' : 'F',
      categories: input.categories ?? { heading_structure: 60, table_markup: 100 },
      detectionSignals: input.detection ?? { 'heading.extractedHeadingCount': 2 },
      snapshotSignals: input.snapshot ?? { headingCount: 2, tableCount: 0 },
    },
  };
}

describe('original50 extraction boundary attribution', () => {
  it('classifies pdf.js boundary variance first', () => {
    const diagnostic = buildExtractionBoundaryDiagnostic({
      outDir: '/tmp/out',
      repeatCount: 2,
      targetScore: 93,
      rows: [{
        key: 'pdfjs-row',
        pdfPath: '/tmp/a.pdf',
        filename: 'a.pdf',
        repeats: [
          repeat(1, { score: 59, pdfjs: { textCharCount: 1000 } }),
          repeat(2, { score: 59, pdfjs: { textCharCount: 1200 } }),
        ],
      }],
    });

    expect(diagnostic.rows[0]?.classification).toBe('pdfjs_extraction_volatile');
    expect(diagnostic.decision.status).toBe('fix_or_park_pdfjs_extraction_before_behavior');
  });

  it('classifies Python structure boundary variance before full analyzer variance', () => {
    const diagnostic = buildExtractionBoundaryDiagnostic({
      outDir: '/tmp/out',
      repeatCount: 2,
      targetScore: 93,
      rows: [{
        key: '4516',
        pdfPath: '/tmp/4516.pdf',
        filename: '4516.pdf',
        repeats: [
          repeat(1, {
            score: 76,
            structure: { headingCount: 34, tableCount: 17 },
            categories: { heading_structure: 78, table_markup: 100 },
          }),
          repeat(2, {
            score: 43,
            structure: { headingCount: 0, tableCount: 0 },
            categories: { heading_structure: 44, table_markup: 0 },
          }),
        ],
      }],
    });

    expect(diagnostic.rows[0]?.classification).toBe('python_structure_extraction_volatile');
    expect(diagnostic.rows[0]?.structureDeltas.map(delta => delta.key)).toContain('headingCount');
    expect(diagnostic.decision.status).toBe('fix_or_park_python_structure_extraction_before_behavior');
  });

  it('classifies merge or scorer variance when extractors are stable', () => {
    const diagnostic = buildExtractionBoundaryDiagnostic({
      outDir: '/tmp/out',
      repeatCount: 2,
      targetScore: 93,
      rows: [{
        key: 'merge-row',
        pdfPath: '/tmp/merge.pdf',
        filename: 'merge.pdf',
        repeats: [
          repeat(1, { score: 59, categories: { heading_structure: 60, table_markup: 100 } }),
          repeat(2, { score: 59, categories: { heading_structure: 95, table_markup: 100 } }),
        ],
      }],
    });

    expect(diagnostic.rows[0]?.classification).toBe('merge_or_scorer_volatile');
    expect(diagnostic.decision.status).toBe('fix_or_park_merge_or_scorer_before_behavior');
  });

  it('classifies stable low rows', () => {
    const diagnostic = buildExtractionBoundaryDiagnostic({
      outDir: '/tmp/out',
      repeatCount: 2,
      targetScore: 93,
      rows: [{
        key: '4438',
        pdfPath: '/tmp/4438.pdf',
        filename: '4438.pdf',
        repeats: [repeat(1, { score: 59 }), repeat(2, { score: 59 })],
      }],
    });

    expect(diagnostic.rows[0]?.classification).toBe('full_analyzer_stable_low');
    expect(diagnostic.decision.status).toBe('move_to_row_failure_shape_or_park');
  });
});

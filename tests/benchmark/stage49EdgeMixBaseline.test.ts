import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildEdgeMixSummary,
  chooseStage50Fixer,
  classifyEdgeMixResidual,
  countFalsePositiveApplied,
  loadEdgeMixManifest,
  type EdgeMixBenchmarkRow,
} from '../../scripts/stage49-edge-mix-baseline.js';

function row(input: Partial<EdgeMixBenchmarkRow> = {}): EdgeMixBenchmarkRow {
  return {
    id: input.id ?? 'v1-1',
    publicationId: input.publicationId ?? '1',
    title: input.title ?? 'Test',
    file: input.file ?? 'test.pdf',
    localFile: input.localFile ?? 'test.pdf',
    v1Score: input.v1Score ?? 30,
    v1Grade: input.v1Grade ?? 'F',
    pageCount: input.pageCount ?? 1,
    problemMix: input.problemMix ?? [],
    beforeScore: input.beforeScore ?? 30,
    beforeGrade: input.beforeGrade ?? 'F',
    beforeCategories: input.beforeCategories ?? [],
    beforePdfClass: input.beforePdfClass ?? 'native_tagged',
    afterScore: input.afterScore ?? 59,
    afterGrade: input.afterGrade ?? 'F',
    afterCategories: input.afterCategories ?? [],
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    afterDetectionProfile: input.afterDetectionProfile ?? {},
    delta: input.delta ?? 29,
    appliedTools: input.appliedTools ?? [],
    falsePositiveAppliedCount: input.falsePositiveAppliedCount ?? 0,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisBeforeMs: input.analysisBeforeMs ?? 100,
    analysisAfterMs: input.analysisAfterMs ?? 100,
    totalPipelineMs: input.totalPipelineMs ?? 1200,
    ...(input.error ? { error: input.error } : {}),
  };
}

describe('Stage 49 edge-mix baseline helpers', () => {
  it('resolves manifest local files and rejects missing PDFs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage49-'));
    await mkdir(join(dir, 'docs'));
    await writeFile(join(dir, 'docs', 'sample.pdf'), 'not a real pdf');
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({
      rows: [{ publicationId: '100', title: 'Sample', localFile: 'docs/sample.pdf', v1Score: 31, v1Grade: 'F', problemMix: ['figure_alt'] }],
    }));
    const rows = await loadEdgeMixManifest(join(dir, 'manifest.json'));
    expect(rows).toMatchObject([{ id: 'v1-100', publicationId: '100', localFile: 'docs/sample.pdf', v1Score: 31, v1Grade: 'F' }]);

    await writeFile(join(dir, 'missing.json'), JSON.stringify({ rows: [{ publicationId: '101', localFile: 'docs/missing.pdf' }] }));
    await expect(loadEdgeMixManifest(join(dir, 'missing.json'))).rejects.toThrow(/missing file/);
  });

  it('computes grade distribution and mean/median summary', () => {
    const summary = buildEdgeMixSummary([
      row({ beforeScore: 10, beforeGrade: 'F', afterScore: 90, afterGrade: 'A', appliedTools: [{ toolName: 'set_document_title', stage: 1, round: 1, scoreBefore: 10, scoreAfter: 90, delta: 80, outcome: 'applied' }] }),
      row({ publicationId: '2', beforeScore: 50, beforeGrade: 'F', afterScore: 70, afterGrade: 'C' }),
      row({ publicationId: '3', beforeScore: 70, beforeGrade: 'C', afterScore: 80, afterGrade: 'B' }),
    ]);
    expect(summary.meanBefore).toBeCloseTo(43.33, 1);
    expect(summary.medianBefore).toBe(50);
    expect(summary.medianAfter).toBe(80);
    expect(summary.gradeDistributionAfter).toMatchObject({ A: 1, B: 1, C: 1, D: 0, F: 0 });
    expect(summary.totalToolAttempts).toBe(1);
    expect(summary.selectedNextFixerFamily).toBe('Next deterministic structural family from edge-mix residuals');
  });

  it('counts invariant-backed false-positive applied rows', () => {
    expect(countFalsePositiveApplied([
      { toolName: 'set_figure_alt_text', stage: 1, round: 1, scoreBefore: 1, scoreAfter: 1, delta: 0, outcome: 'applied', details: JSON.stringify({ outcome: 'no_effect', invariants: { targetReachable: false } }) },
      { toolName: 'set_document_title', stage: 1, round: 1, scoreBefore: 1, scoreAfter: 2, delta: 1, outcome: 'applied', details: 'legacy text' },
    ])).toBe(1);
  });

  it('classifies residual families', () => {
    expect(classifyEdgeMixResidual(row({
      afterCategories: [{ key: 'alt_text', score: 0 }],
      afterDetectionProfile: { figureSignals: { extractedFigureCount: 2, treeFigureCount: 0 } },
      appliedTools: [{ toolName: 'set_figure_alt_text', stage: 1, round: 1, scoreBefore: 59, scoreAfter: 59, delta: 0, outcome: 'no_effect' }],
    }))).toMatchObject({ recommendedFamily: 'figure_alt_tail' });

    expect(classifyEdgeMixResidual(row({
      afterCategories: [{ key: 'heading_structure', score: 0 }],
      afterDetectionProfile: { headingSignals: { treeHeadingCount: 0 } },
    }))).toMatchObject({ recommendedFamily: 'zero_heading_tail' });

    expect(classifyEdgeMixResidual(row({
      afterCategories: [{ key: 'table_markup', score: 35 }],
      afterDetectionProfile: { tableSignals: { directCellUnderTableCount: 2 } },
    }))).toMatchObject({ recommendedFamily: 'table_tail' });

    expect(classifyEdgeMixResidual(row({
      afterCategories: [{ key: 'reading_order', score: 35 }],
      afterDetectionProfile: { headingSignals: { treeHeadingCount: 2 }, readingOrderSignals: { structureTreeDepth: 4 } },
    }))).toMatchObject({ recommendedFamily: 'reading_order_tail' });

    expect(classifyEdgeMixResidual(row({
      afterCategories: [{ key: 'text_extractability', score: 40 }],
      afterDetectionProfile: { headingSignals: { treeHeadingCount: 2 }, pdfUaSignals: { fontUnicodeCount: 3 } },
    }))).toMatchObject({ recommendedFamily: 'font_text_tail' });

    expect(classifyEdgeMixResidual(row({
      afterCategories: [{ key: 'link_quality', score: 40 }],
      afterDetectionProfile: { headingSignals: { treeHeadingCount: 2 }, annotationSignals: { visibleAnnotationsMissingStructParent: 2 } },
    }))).toMatchObject({ recommendedFamily: 'annotation_link_tail' });
  });

  it('selects figure/alt recovery only with terminal proof on at least three rows', () => {
    const figureRows = [1, 2, 3].map(index => row({
      publicationId: String(index),
      afterScore: 59,
      afterCategories: [{ key: 'alt_text', score: 0 }],
      afterDetectionProfile: { figureSignals: { extractedFigureCount: 2, treeFigureCount: 0 } },
      appliedTools: [{ toolName: 'canonicalize_figure_alt_ownership', stage: 1, round: 1, scoreBefore: 59, scoreAfter: 59, delta: 0, outcome: 'no_effect' }],
    }));
    expect(chooseStage50Fixer(figureRows)).toBe('Figure/Alt Recovery v3');
  });
});

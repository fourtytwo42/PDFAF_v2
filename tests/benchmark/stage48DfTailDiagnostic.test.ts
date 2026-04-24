import { describe, expect, it } from 'vitest';
import { buildDfTailReport, classifyDfTailRow, type DfTailBenchmarkRow } from '../../scripts/stage48-df-tail-diagnostic.js';

function row(input: {
  id?: string;
  score?: number;
  grade?: string;
  categories?: Record<string, number>;
  heading?: Record<string, unknown>;
  figure?: Record<string, unknown>;
  table?: Record<string, unknown>;
  reading?: Record<string, unknown>;
  pdfUa?: Record<string, unknown>;
  tools?: DfTailBenchmarkRow['appliedTools'];
}): DfTailBenchmarkRow {
  return {
    id: input.id ?? 'row-1',
    file: `${input.id ?? 'row-1'}.pdf`,
    afterScore: input.score ?? 59,
    afterGrade: input.grade ?? 'F',
    afterCategories: Object.entries(input.categories ?? {}).map(([key, score]) => ({ key, score })),
    afterDetectionProfile: {
      headingSignals: input.heading ?? {},
      figureSignals: input.figure ?? {},
      tableSignals: input.table ?? {},
      readingOrderSignals: input.reading ?? {},
      pdfUaSignals: input.pdfUa ?? {},
      annotationSignals: {},
    },
    appliedTools: input.tools ?? [],
  };
}

describe('Stage 48 D/F tail diagnostic', () => {
  it('classifies zero-heading tails', () => {
    const result = classifyDfTailRow(row({
      categories: { heading_structure: 0, alt_text: 100, table_markup: 100, reading_order: 96 },
      heading: { treeHeadingCount: 0, extractedHeadingsMissingFromTree: false },
    }));
    expect(result.recommendedFamily).toBe('zero_heading_tail');
    expect(result.blockerFamilies).toContain('zero_heading_tail');
  });

  it('classifies figure/alt tails', () => {
    const result = classifyDfTailRow(row({
      categories: { heading_structure: 100, alt_text: 0, table_markup: 100, reading_order: 96 },
      figure: { extractedFigureCount: 4, treeFigureCount: 0, treeFigureMissingForExtractedFigures: true },
    }));
    expect(result.recommendedFamily).toBe('figure_alt_tail');
    expect(result.blockerFamilies).toContain('figure_alt_tail');
  });

  it('classifies table tails', () => {
    const result = classifyDfTailRow(row({
      categories: { heading_structure: 100, alt_text: 100, table_markup: 0, reading_order: 96 },
      table: { directCellUnderTableCount: 0, stronglyIrregularTableCount: 3, misplacedCellCount: 0 },
    }));
    expect(result.recommendedFamily).toBe('table_tail');
    expect(result.blockerFamilies).toContain('table_tail');
  });

  it('classifies reading-order tails', () => {
    const result = classifyDfTailRow(row({
      categories: { heading_structure: 100, alt_text: 100, table_markup: 100, reading_order: 35 },
      reading: { structureTreeDepth: 4, annotationOrderRiskCount: 0 },
      pdfUa: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0 },
    }));
    expect(result.recommendedFamily).toBe('reading_order_tail');
    expect(result.blockerFamilies).toContain('reading_order_tail');
  });

  it('prefers figure/alt for mixed rows with collapsed alt and extracted figures', () => {
    const result = classifyDfTailRow(row({
      categories: { heading_structure: 0, alt_text: 0, table_markup: 100, reading_order: 96 },
      heading: { treeHeadingCount: 0 },
      figure: { extractedFigureCount: 10, treeFigureCount: 0, treeFigureMissingForExtractedFigures: true },
    }));
    expect(result.recommendedFamily).toBe('figure_alt_tail');
    expect(result.blockerFamilies).toEqual(expect.arrayContaining(['zero_heading_tail', 'figure_alt_tail']));
  });

  it('reports terminal no-effect and rejected tools without treating them as success', () => {
    const report = buildDfTailReport([
      row({
        id: 'font-4172',
        categories: { heading_structure: 80, alt_text: 0, table_markup: 100, reading_order: 96 },
        figure: { extractedFigureCount: 2, treeFigureCount: 0, treeFigureMissingForExtractedFigures: true },
        tools: [
          { toolName: 'canonicalize_figure_alt_ownership', outcome: 'no_effect', scoreBefore: 59, scoreAfter: 59 },
          { toolName: 'set_figure_alt_text', outcome: 'no_effect', scoreBefore: 59, scoreAfter: 59 },
        ],
      }),
    ]);
    const rows = report['rows'] as Array<Record<string, unknown>>;
    expect(report['tailCount']).toBe(1);
    expect(rows[0]?.['recommendedFamily']).toBe('figure_alt_tail');
    const terminal = rows[0]?.['terminalOutcomesByFamily'] as Record<string, Array<Record<string, unknown>>>;
    expect(terminal['figureAlt']?.map(tool => tool['outcome'])).toEqual(['no_effect', 'no_effect']);
  });
});

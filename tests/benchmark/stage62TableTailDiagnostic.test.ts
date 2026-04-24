import { describe, expect, it } from 'vitest';
import {
  buildStage62TableTailReport,
  classifyStage62TableTailRow,
  type Stage62TableTailInput,
} from '../../scripts/stage62-table-tail-diagnostic.js';

function input(overrides: Partial<Stage62TableTailInput> = {}): Stage62TableTailInput {
  const analysis = overrides.analysis ?? {
    score: 69,
    grade: 'D',
    pdfClass: 'native_tagged',
    categories: [
      { key: 'table_markup', score: 0, applicable: true },
      { key: 'heading_structure', score: 95, applicable: true },
      { key: 'alt_text', score: 100, applicable: true },
      { key: 'reading_order', score: 96, applicable: true },
      { key: 'pdf_ua_compliance', score: 71, applicable: true },
    ],
  } as never;
  const snapshot = overrides.snapshot ?? {
    tables: [
      {
        hasHeaders: true,
        headerCount: 2,
        totalCells: 12,
        page: 0,
        structRef: '21_0',
        rowCount: 5,
        cellsMisplacedCount: 0,
        irregularRows: 3,
        rowCellCounts: [3, 3, 2, 1, 3],
        dominantColumnCount: 3,
      },
    ],
    detectionProfile: {
      tableSignals: {
        tablesWithMisplacedCells: 0,
        misplacedCellCount: 0,
        irregularTableCount: 1,
        stronglyIrregularTableCount: 1,
        directCellUnderTableCount: 0,
      },
    },
  } as never;
  return {
    id: 'v1-4722',
    role: 'focus',
    analysis,
    snapshot,
    plan: {
      stages: [],
      planningSummary: {
        primaryRoute: 'native_structure_repair',
        secondaryRoutes: [],
        triggeringSignals: [],
        scheduledTools: [],
        skippedTools: [{ toolName: 'normalize_table_structure', reason: 'missing_precondition' }],
        semanticDeferred: false,
      },
    },
    terminalTableTools: [],
    ...overrides,
  };
}

describe('Stage 62 table-tail diagnostic', () => {
  it('classifies strongly irregular low-table rows', () => {
    const row = classifyStage62TableTailRow(input());
    expect(row.classification).toBe('strongly_irregular_rows');
    expect(row.tableSummaries[0]?.irregularRows).toBe(3);
  });

  it('keeps direct-cell and rowless dense table failures distinct', () => {
    const direct = classifyStage62TableTailRow(input({
      snapshot: {
        tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, page: 0, structRef: '1_0', rowCount: 2, cellsMisplacedCount: 4 }],
        detectionProfile: { tableSignals: { directCellUnderTableCount: 4, misplacedCellCount: 4, irregularTableCount: 0, stronglyIrregularTableCount: 0 } },
      } as never,
    }));
    expect(direct.classification).toBe('direct_cells');

    const rowless = classifyStage62TableTailRow(input({
      snapshot: {
        tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, page: 0, structRef: '1_0', rowCount: 1, cellsMisplacedCount: 0 }],
        detectionProfile: { tableSignals: { directCellUnderTableCount: 0, misplacedCellCount: 0, irregularTableCount: 0, stronglyIrregularTableCount: 0 } },
      } as never,
    }));
    expect(rowless.classification).toBe('rowless_dense');
  });

  it('classifies missing-header-only rows when rows are otherwise valid', () => {
    const row = classifyStage62TableTailRow(input({
      snapshot: {
        tables: [{ hasHeaders: false, headerCount: 0, totalCells: 8, page: 0, structRef: '1_0', rowCount: 2, cellsMisplacedCount: 0, irregularRows: 0 }],
        detectionProfile: { tableSignals: { directCellUnderTableCount: 0, misplacedCellCount: 0, irregularTableCount: 0, stronglyIrregularTableCount: 0 } },
      } as never,
    }));
    expect(row.classification).toBe('missing_headers_only');
  });

  it('reports terminal table tool failures without treating them as success', () => {
    const row = classifyStage62TableTailRow(input({
      terminalTableTools: [
        {
          toolName: 'set_table_header_cells',
          outcome: 'no_effect',
          stage: 4,
          round: 1,
          scoreBefore: 59,
          scoreAfter: 59,
          source: 'planner',
          note: 'no_structural_change',
          targetRef: null,
          directCellsUnderTableBefore: 0,
          directCellsUnderTableAfter: 0,
          headerCellCountBefore: 2,
          headerCellCountAfter: 2,
          tableTreeValidAfter: true,
          tableValidityImproved: null,
        },
      ],
    }));
    expect(row.terminalTableTools).toHaveLength(1);
    expect(row.classification).toBe('strongly_irregular_rows');
  });

  it('excludes parked analyzer rows from fixer acceptance', () => {
    const row = classifyStage62TableTailRow(input({ id: 'v1-4683', role: 'parked' }));
    expect(row.classification).toBe('parked_analyzer_debt');
  });

  it('selects strongly irregular table fix only when v1-4722 proves that blocker', () => {
    const report = buildStage62TableTailReport([classifyStage62TableTailRow(input())]);
    expect(report.decision.status).toBe('implement_strongly_irregular_table_fix');

    const noSafe = buildStage62TableTailReport([
      classifyStage62TableTailRow(input({
        analysis: {
          score: 95,
          grade: 'A',
          pdfClass: 'native_tagged',
          categories: [{ key: 'table_markup', score: 100, applicable: false }],
        } as never,
        snapshot: { tables: [], detectionProfile: { tableSignals: {} } } as never,
      })),
    ]);
    expect(noSafe.decision.status).toBe('diagnostic_only_no_safe_table_fix');
  });
});

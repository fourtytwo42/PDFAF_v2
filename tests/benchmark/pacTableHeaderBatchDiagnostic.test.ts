import { describe, expect, it } from 'vitest';
import {
  buildTableHeaderBatchDiagnostic,
  classifyBatchAssociationRow,
  rankAssociationTables,
} from '../../scripts/pac-table-header-batch-diagnostic.js';
import type { PacTableHeaderDiagnosticRow, PacTableHeaderTargetDiagnostic } from '../../scripts/pac-table-header-target-diagnostic.js';

function row(over: Partial<PacTableHeaderDiagnosticRow> & { fileId: string }): PacTableHeaderDiagnosticRow {
  return {
    fileId: over.fileId,
    file: `${over.fileId}.pdf`,
    role: over.role ?? 'target',
    score: over.score ?? 78,
    grade: over.grade ?? 'C',
    tableMarkupScore: over.tableMarkupScore ?? 79,
    tableMarkupApplicable: true,
    strictTableCaps: over.strictTableCaps ?? [
      { ruleId: 'pdfua.table.header_association_present', cap: 79, rawScore: 100, finalScore: 79 },
    ],
    tableSignals: over.tableSignals ?? {
      directCellUnderTableCount: 0,
      misplacedCellCount: 0,
      irregularTableCount: 0,
      stronglyIrregularTableCount: 0,
    },
    tableHeaderAudit: over.tableHeaderAudit ?? {
      tablesChecked: 10,
      headerAssociationMissingCount: 10,
      orphanHeaderCellCount: 240,
      dataCellsWithoutHeaderCount: 220,
      headerCellsWithScopeCount: 0,
      headerCellsWithIdCount: 0,
      dataCellsWithHeadersCount: 0,
    },
    tables: over.tables ?? [
      { structRef: 'a', page: 0, rowCount: 20, totalCells: 40, headerCount: 20, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 },
      { structRef: 'b', page: 0, rowCount: 12, totalCells: 24, headerCount: 12, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 },
    ],
    tableTools: [],
    fiveReviewBuckets: [],
    fiveReviewLeafFamilies: [],
    classification: 'safe_existing_table_repair_candidate',
    classificationReason: 'candidate',
    ...over,
  };
}

function report(rows: PacTableHeaderDiagnosticRow[]): PacTableHeaderTargetDiagnostic {
  return {
    generatedAt: '2026-05-08T00:00:00.000Z',
    runDir: 'run',
    fiveReviewSource: null,
    targets: rows.filter(item => item.role === 'target').map(item => item.fileId),
    controls: rows.filter(item => item.role === 'control').map(item => item.fileId),
    summary: {
      rowCount: rows.length,
      targetCount: rows.filter(item => item.role === 'target').length,
      controlCount: rows.filter(item => item.role === 'control').length,
      selectedBehavior: 'diagnose_set_table_header_cells',
      candidateFiles: rows.map(item => item.fileId),
      noSafeRepairFiles: [],
    },
    rows,
  };
}

describe('PAC table header batch diagnostic helpers', () => {
  it('ranks stable table refs by estimated TD debt and identity', () => {
    expect(rankAssociationTables([
      { structRef: 'small', page: 0, rowCount: 3, totalCells: 6, headerCount: 4, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 },
      { structRef: 'large-b', page: 0, rowCount: 9, totalCells: 20, headerCount: 10, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 },
      { structRef: 'large-a', page: 0, rowCount: 9, totalCells: 20, headerCount: 10, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 },
      { structRef: 'unsafe', page: 0, rowCount: 9, totalCells: 20, headerCount: 10, hasHeaders: true, cellsMisplacedCount: 1, irregularRows: 0 },
    ]).map(item => item.structRef)).toEqual(['large-a', 'large-b', 'small']);
  });

  it('classifies many-table association debt as a batch candidate', () => {
    const classified = classifyBatchAssociationRow(row({ fileId: 'long-4700' }));
    expect(classified.classification).toBe('batch_association_candidate');
    expect(classified.selectedStructRefs).toEqual(['a', 'b']);
    expect(classified.estimatedBatchTdDebt).toBe(32);
  });

  it('classifies unsafe table shape separately from batchable association debt', () => {
    const classified = classifyBatchAssociationRow(row({
      fileId: 'unsafe',
      tableSignals: {
        directCellUnderTableCount: 0,
        misplacedCellCount: 0,
        irregularTableCount: 1,
        stronglyIrregularTableCount: 0,
      },
    }));
    expect(classified.classification).toBe('unsafe_table_shape');
  });

  it('does not select rows without many-table debt', () => {
    const classified = classifyBatchAssociationRow(row({
      fileId: 'font-4699',
      tableHeaderAudit: {
        tablesChecked: 2,
        headerAssociationMissingCount: 2,
        orphanHeaderCellCount: 12,
        dataCellsWithoutHeaderCount: 10,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
      },
    }));
    expect(classified.classification).toBe('not_table_first');
  });

  it('builds deterministic candidate summaries', () => {
    const diagnostic = buildTableHeaderBatchDiagnostic({
      source: 'source.json',
      report: report([
        row({ fileId: 'long-4700' }),
        row({
          fileId: 'figure-4754',
          tableHeaderAudit: {
            tablesChecked: 42,
            headerAssociationMissingCount: 2,
            orphanHeaderCellCount: 242,
            dataCellsWithoutHeaderCount: 22,
            headerCellsWithScopeCount: 0,
            headerCellsWithIdCount: 0,
            dataCellsWithHeadersCount: 0,
          },
        }),
        row({ fileId: 'font-4699', tableHeaderAudit: {
          tablesChecked: 2,
          headerAssociationMissingCount: 2,
          orphanHeaderCellCount: 12,
          dataCellsWithoutHeaderCount: 10,
          headerCellsWithScopeCount: 0,
          headerCellsWithIdCount: 0,
          dataCellsWithHeadersCount: 0,
        } }),
      ]),
      targets: ['figure-4754', 'font-4699', 'long-4700'],
      generatedAt: '2026-05-08T00:00:00.000Z',
    });
    expect(diagnostic.summary).toEqual({
      candidateFiles: ['long-4700'],
      noCandidateFiles: ['figure-4754', 'font-4699'],
    });
  });
});

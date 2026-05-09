import { describe, expect, it } from 'vitest';
import {
  buildAllInputTableHeaderObjectDiagnostic,
  classifyAllInputTableHeaderRow,
} from '../../scripts/all-input-table-header-object-diagnostic.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

function analysis(score = 69): AnalysisResult {
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    pdfClass: 'native_tagged',
    categories: [
      { key: 'table_markup', score: 0, applicable: true, weight: 1 },
    ],
    issues: [],
    warnings: [],
    recommendations: [],
    evidence: {},
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 1,
    isTagged: true,
    lang: 'en',
    pdfUaVersion: '1',
    headings: [],
    figures: [],
    tables: [
      { structRef: '10_0', page: 0, rowCount: 4, totalCells: 16, headerCount: 4, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 },
      { structRef: '11_0', page: 0, rowCount: 4, totalCells: 16, headerCount: 4, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 },
    ],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: null,
    detectionProfile: {
      tableSignals: {
        directCellUnderTableCount: 0,
        misplacedCellCount: 0,
        tablesWithMisplacedCells: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
      },
    },
    tableHeaderAudit: {
      tablesChecked: 2,
      headerAssociationMissingCount: 8,
      orphanHeaderCellCount: 4,
      dataCellsWithoutHeaderCount: 24,
      headerCellsWithScopeCount: 0,
      headerCellsWithIdCount: 0,
      dataCellsWithHeadersCount: 0,
    },
    ...overrides,
  } as unknown as DocumentSnapshot;
}

function tableFail() {
  return [
    { ruleId: 'pdfua.table.header_association_present', count: 24, message: '24 table header-association issue(s) were detected.' },
  ];
}

describe('all input table/header object diagnostic helpers', () => {
  it('classifies bounded stable association debt as a current-bound candidate', () => {
    const row = classifyAllInputTableHeaderRow({
      fileId: 'bounded',
      file: 'bounded.pdf',
      result: analysis(),
      snapshot: snapshot(),
      pocTableFailures: tableFail(),
    });

    expect(row.classification).toBe('association_candidate_current_bound');
    expect(row.selectedStructRefs).toEqual(['10_0', '11_0']);
    expect(row.estimatedBatchTdDebt).toBe(24);
  });

  it('classifies association debt beyond current batch coverage separately', () => {
    const row = classifyAllInputTableHeaderRow({
      fileId: 'large',
      file: 'large.pdf',
      result: analysis(),
      snapshot: snapshot({
        tableHeaderAudit: {
          tablesChecked: 2,
          headerAssociationMissingCount: 80,
          orphanHeaderCellCount: 4,
          dataCellsWithoutHeaderCount: 500,
          headerCellsWithScopeCount: 0,
          headerCellsWithIdCount: 0,
          dataCellsWithHeadersCount: 0,
        },
      }),
      pocTableFailures: tableFail(),
    });

    expect(row.classification).toBe('association_candidate_exceeds_current_batch');
    expect(row.estimatedBatchTdDebt).toBe(24);
  });

  it('parks rows with irregular or direct table shape before association metadata', () => {
    const row = classifyAllInputTableHeaderRow({
      fileId: 'unsafe',
      file: 'unsafe.pdf',
      result: analysis(),
      snapshot: snapshot({
        detectionProfile: {
          tableSignals: {
            directCellUnderTableCount: 0,
            misplacedCellCount: 0,
            tablesWithMisplacedCells: 0,
            irregularTableCount: 1,
            stronglyIrregularTableCount: 0,
          },
        } as DocumentSnapshot['detectionProfile'],
      }),
      pocTableFailures: tableFail(),
    });

    expect(row.classification).toBe('irregular_or_direct_table_shape');
    expect(row.selectedStructRefs).toEqual([]);
  });

  it('classifies missing TH cells before association metadata', () => {
    const row = classifyAllInputTableHeaderRow({
      fileId: 'missing-headers',
      file: 'missing-headers.pdf',
      result: analysis(),
      snapshot: snapshot({
        tables: [
          { structRef: '12_0', page: 0, rowCount: 3, totalCells: 9, headerCount: 0, hasHeaders: false, cellsMisplacedCount: 0, irregularRows: 0 },
        ],
      }),
      pocTableFailures: tableFail(),
    });

    expect(row.classification).toBe('missing_header_creation_first');
  });

  it('builds deterministic summaries', () => {
    const a = classifyAllInputTableHeaderRow({
      fileId: 'b',
      file: 'b.pdf',
      result: analysis(),
      snapshot: snapshot(),
      pocTableFailures: tableFail(),
    });
    const b = classifyAllInputTableHeaderRow({
      fileId: 'a',
      file: 'a.pdf',
      result: analysis(),
      snapshot: snapshot({ tables: [] }),
      pocTableFailures: tableFail(),
    });

    const report = buildAllInputTableHeaderObjectDiagnostic({
      generatedAt: '2026-05-09T00:00:00.000Z',
      pdfDir: 'pdfs',
      pocSource: 'poc.json',
      rows: [a, b],
    });

    expect(report.rows.map(row => row.fileId)).toEqual(['a', 'b']);
    expect(report.summary.candidateFiles).toEqual(['b']);
    expect(report.summary.parkedFiles).toEqual(['a']);
  });
});

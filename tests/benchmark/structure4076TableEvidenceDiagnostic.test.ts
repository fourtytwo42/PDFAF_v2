import { describe, expect, it } from 'vitest';
import {
  classifyStructure4076TableEvidence,
  selectStructure4076StableTableCandidate,
  type TableObservation,
} from '../../scripts/structure4076-table-evidence-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function observation(input: Partial<TableObservation> = {}): TableObservation {
  return {
    pass: input.pass ?? 1,
    score: input.score ?? 53,
    grade: input.grade ?? 'F',
    tableScore: input.tableScore ?? 0,
    tableApplicable: input.tableApplicable ?? true,
    signals: input.signals ?? {
      irregularTableCount: 1,
      stronglyIrregularTableCount: 1,
      directCellUnderTableCount: 0,
      misplacedCellCount: 0,
    },
    tables: input.tables ?? [{
      structRef: '81311_0',
      page: 0,
      hasHeaders: false,
      headerCount: 0,
      totalCells: 382,
      rowCount: 118,
      irregularRows: 17,
      dominantColumnCount: 6,
      cellsMisplacedCount: 0,
      reachable: true,
      parentPath: ['Table@81311_0'],
    }],
    pacTableFailures: input.pacTableFailures ?? [
      'pdfua.table.headers_present',
      'pdfua.table.rows_regular',
      'pdfua.table.strong_regular_structure',
    ],
  };
}

function category(key: string, score: number, applicable: boolean) {
  return {
    key,
    score,
    weight: 1,
    applicable,
    severity: score >= 90 ? 'pass' : 'critical',
    findings: [],
    evidence: 'verified',
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    countsTowardGrade: true,
    diagnosticOnly: false,
    measurementStatus: 'measured',
  } as RemediateBenchmarkRow['afterCategories'][number];
}

function row(input: Partial<RemediateBenchmarkRow> = {}): RemediateBenchmarkRow {
  return {
    id: 'structure-4076',
    file: 'structure-4076.pdf',
    cohort: 'test',
    sourceType: 'original',
    intent: 'reading_order',
    beforeScore: 53,
    beforeGrade: 'F',
    beforePdfClass: 'native_tagged',
    afterScore: input.afterScore ?? 70,
    afterGrade: input.afterGrade ?? 'C',
    afterPdfClass: 'native_tagged',
    afterCategories: input.afterCategories ?? [category('table_markup', 100, false)],
    afterDetectionProfile: input.afterDetectionProfile,
    reanalyzedScore: input.reanalyzedScore ?? 56,
    reanalyzedGrade: input.reanalyzedGrade ?? 'F',
    reanalyzedPdfClass: 'native_tagged',
    reanalyzedCategories: input.reanalyzedCategories ?? [category('table_markup', 0, true)],
    reanalyzedDetectionProfile: input.reanalyzedDetectionProfile,
    delta: 17,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: 1,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
  } as RemediateBenchmarkRow;
}

const emptyProbe = {
  attempted: false,
  applied: false,
  targetRef: null,
  invariants: null,
  observations: [],
};

describe('structure 4076 table evidence diagnostic helpers', () => {
  it('selects a stable table target deterministically from repeated debt observations', () => {
    const candidate = selectStructure4076StableTableCandidate([
      observation({ pass: 2 }),
      observation({ pass: 1 }),
      observation({
        pass: 3,
        tableApplicable: false,
        tableScore: 100,
        signals: {
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
        },
        tables: [],
        pacTableFailures: [],
      }),
    ]);
    expect(candidate).toMatchObject({
      structRef: '81311_0',
      totalCells: 382,
      irregularRows: 17,
      dominantColumnCount: 6,
    });
  });

  it('classifies repeated missing table identity as analyzer applicability volatility', () => {
    const result = classifyStructure4076TableEvidence({
      row: row(),
      observations: [observation({
        tableApplicable: false,
        tableScore: 100,
        signals: {
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
        },
        tables: [],
        pacTableFailures: [],
      })],
      candidate: null,
      mutationProbe: emptyProbe,
    });
    expect(result.classification).toBe('analyzer_table_applicability_volatility');
  });

  it('classifies reproduced table debt without a stable struct ref as insufficient identity evidence', () => {
    const debt = observation({ tables: [{ ...observation().tables[0]!, structRef: null }] });
    const result = classifyStructure4076TableEvidence({
      row: row(),
      observations: [debt, { ...debt, pass: 2 }],
      candidate: null,
      mutationProbe: emptyProbe,
    });
    expect(result.classification).toBe('insufficient_table_identity_evidence');
  });

  it('classifies a successful existing repair probe as a safe candidate', () => {
    const target = observation().tables[0]!;
    const result = classifyStructure4076TableEvidence({
      row: row(),
      observations: [observation({ pass: 1 }), observation({ pass: 2 })],
      candidate: target,
      mutationProbe: {
        attempted: true,
        applied: true,
        targetRef: target.structRef,
        invariants: {
          targetResolved: true,
          headerCellCountBefore: 0,
          headerCellCountAfter: 1,
          irregularRowsBefore: 17,
          irregularRowsAfter: 2,
        },
        observations: [
          observation({ score: 70, grade: 'C', tableScore: 72, tableApplicable: true }),
          observation({ score: 70, grade: 'C', tableScore: 100, tableApplicable: false, tables: [], pacTableFailures: [] }),
        ],
      },
    });
    expect(result).toEqual({
      classification: 'safe_existing_table_repair_candidate',
      reason: 'Stable table target has a successful existing normalize_table_structure probe at the row floor.',
    });
  });

  it('rejects a repair probe that stays below the structure-4076 floor', () => {
    const target = observation().tables[0]!;
    const result = classifyStructure4076TableEvidence({
      row: row(),
      observations: [observation({ pass: 1 }), observation({ pass: 2 })],
      candidate: target,
      mutationProbe: {
        attempted: true,
        applied: true,
        targetRef: target.structRef,
        invariants: {},
        observations: [observation({ score: 69, grade: 'D', tableScore: 72, tableApplicable: true })],
      },
    });
    expect(result.classification).toBe('real_table_debt_no_safe_repair');
  });
});

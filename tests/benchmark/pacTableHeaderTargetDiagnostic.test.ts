import { describe, expect, it } from 'vitest';
import {
  buildPacTableHeaderTargetDiagnostic,
  classifyTableHeaderRow,
  strictTableCaps,
  tableToolRows,
} from '../../scripts/pac-table-header-target-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { AppliedRemediationTool, CategoryKey, DocumentSnapshot, ScoreCapApplied, ScoredCategory } from '../../src/types.js';

function pacCap(ruleId: string, category: CategoryKey = 'table_markup'): ScoreCapApplied {
  return {
    category,
    cap: 79,
    rawScore: 100,
    finalScore: 79,
    reason: `PAC rule failure: ${ruleId}`,
  };
}

function category(key: CategoryKey, score: number, applicable = true): ScoredCategory {
  return {
    key,
    score,
    applicable,
    weight: 1,
    severity: score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'failure',
    findings: [],
  };
}

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file ?? `/tmp/${input.id}.pdf`,
    cohort: input.cohort ?? '20-figure-ownership',
    sourceType: input.sourceType ?? 'original',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 60,
    beforeGrade: input.beforeGrade ?? 'D',
    beforePdfClass: input.beforePdfClass ?? 'tagged',
    afterScore: input.afterScore ?? 80,
    afterGrade: input.afterGrade ?? 'C',
    afterPdfClass: input.afterPdfClass ?? 'tagged',
    afterCategories: input.afterCategories ?? [category('table_markup', 79)],
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [
      pacCap('pdfua.table.header_association_present'),
      pacCap('pdfua.table.header_cells_associated'),
    ],
    afterDetectionProfile: input.afterDetectionProfile ?? {
      readingOrderSignals: {} as never,
      headingSignals: {} as never,
      figureSignals: {} as never,
      pdfUaSignals: {} as never,
      annotationSignals: {} as never,
      listSignals: {} as never,
      tableSignals: {
        tablesWithMisplacedCells: 0,
        misplacedCellCount: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
        directCellUnderTableCount: 0,
      },
      sampledPages: [],
      confidence: 'high',
    },
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedGrade ?? null,
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? null,
    reanalyzedCategories: input.reanalyzedCategories,
    reanalyzedScoreCapsApplied: input.reanalyzedScoreCapsApplied ?? [],
    delta: input.delta ?? 20,
    appliedTools: input.appliedTools ?? [],
    error: input.error,
  } as RemediateBenchmarkRow;
}

function snapshot(input: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: [''],
    textCharCount: 0,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...input,
  } as DocumentSnapshot;
}

function tool(details: Record<string, unknown>): AppliedRemediationTool {
  return {
    toolName: 'set_table_header_cells',
    stage: 4,
    round: 1,
    scoreBefore: 78,
    scoreAfter: 78,
    delta: 0,
    outcome: 'no_effect',
    details: JSON.stringify(details),
  };
}

describe('PAC table/header target diagnostic', () => {
  it('extracts strict table caps deterministically', () => {
    expect(strictTableCaps(row({
      id: 'target',
      afterScoreCapsApplied: [
        pacCap('pdfua.table.header_cells_associated'),
        pacCap('pdfua.structure.parent_links_valid', 'reading_order'),
        pacCap('pdfua.table.header_association_present'),
      ],
    })).map(cap => cap.ruleId)).toEqual([
      'pdfua.table.header_association_present',
      'pdfua.table.header_cells_associated',
    ]);
  });

  it('classifies missing header associations with stable table identity as repair candidates', () => {
    const decision = classifyTableHeaderRow({
      role: 'target',
      score: 78,
      grade: 'C',
      caps: [{ ruleId: 'pdfua.table.header_association_present', cap: 79, rawScore: 100, finalScore: 79 }],
      tableSignals: {},
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 2,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 8,
        headerCellsWithScopeCount: 1,
        headerCellsWithIdCount: 1,
        dataCellsWithHeadersCount: 0,
      },
      tables: [{ structRef: '21_0', page: 0, rowCount: 3, totalCells: 12, headerCount: 2, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 }],
      tableTools: [],
    });

    expect(decision.classification).toBe('safe_existing_table_repair_candidate');
  });

  it('classifies irregular rows before header association fixes', () => {
    const decision = classifyTableHeaderRow({
      role: 'target',
      score: 78,
      grade: 'C',
      caps: [{ ruleId: 'pdfua.table.header_association_present', cap: 79, rawScore: 100, finalScore: 79 }],
      tableSignals: { irregularTableCount: 1, stronglyIrregularTableCount: 1 },
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 0,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 0,
      },
      tables: [{ structRef: '30_0', page: 0, rowCount: 2, totalCells: 8, headerCount: 1, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 2 }],
      tableTools: [],
    });

    expect(decision.classification).toBe('irregular_rows_first');
  });

  it('classifies missing struct refs as needing stable table identity', () => {
    const decision = classifyTableHeaderRow({
      role: 'target',
      score: 78,
      grade: 'C',
      caps: [{ ruleId: 'pdfua.table.header_association_present', cap: 79, rawScore: 100, finalScore: 79 }],
      tableSignals: {},
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 1,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 2,
      },
      tables: [{ structRef: null, page: 0, rowCount: 1, totalCells: 2, headerCount: 1, hasHeaders: true, cellsMisplacedCount: 0, irregularRows: 0 }],
      tableTools: [],
    });

    expect(decision.classification).toBe('needs_stable_table_identity');
  });

  it('classifies A-grade controls with residual caps separately', () => {
    const report = buildPacTableHeaderTargetDiagnostic({
      runDir: 'run',
      rows: [row({ id: 'control', afterScore: 96, afterGrade: 'A' })],
      targets: [],
      controls: ['control'],
      snapshotsById: new Map([
        ['control', snapshot({
          tables: [{ structRef: '10_0', page: 0, rowCount: 2, totalCells: 8, headerCount: 1, hasHeaders: true, cellsMisplacedCount: 0 }],
        })],
      ]),
    });

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'control_high_grade_with_residual_cap',
    }));
  });

  it('parses table tool invariants deterministically', () => {
    const parsed = tableToolRows([
      tool({
        note: 'no_structural_change',
        invariants: {
          targetRef: '21_0',
          targetResolved: true,
          resolvedRole: 'Table',
          headerCellCountBefore: 1,
          headerCellCountAfter: 3,
          irregularRowsBefore: 2,
          irregularRowsAfter: 0,
        },
      }),
    ]);

    expect(parsed).toEqual([
      expect.objectContaining({
        toolName: 'set_table_header_cells',
        targetRef: '21_0',
        targetResolved: true,
        resolvedRole: 'Table',
        headerCellCountBefore: 1,
        headerCellCountAfter: 3,
        irregularRowsBefore: 2,
        irregularRowsAfter: 0,
        note: 'no_structural_change',
      }),
    ]);
  });
});

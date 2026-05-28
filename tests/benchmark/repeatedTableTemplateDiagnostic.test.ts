import { describe, expect, it } from 'vitest';
import {
  buildRepeatedTableTemplateReport,
  buildTemplateGroups,
  classifyRepeatedTableTemplateRow,
  parseArgs,
  tableTemplateSignature,
  type RepeatedTableTemplateFeatures,
  type RepeatedTableTemplateInputRow,
  type RepeatedTableTemplateRow,
} from '../../scripts/repeated-table-template-diagnostic.js';
import type { DocumentSnapshot } from '../../src/types.js';

type SnapshotTable = DocumentSnapshot['tables'][number];

function table(overrides: Partial<SnapshotTable> = {}): SnapshotTable {
  return {
    hasHeaders: true,
    headerCount: 1,
    totalCells: 6,
    page: 0,
    structRef: '10_0',
    rawRole: 'Table',
    resolvedRole: 'Table',
    rowCount: 2,
    rowCellCounts: [2, 4],
    dominantColumnCount: 4,
    maxRowSpan: 1,
    maxColSpan: 1,
    cellsMisplacedCount: 0,
    irregularRows: 1,
    removableEmptyRowCount: 0,
    reachable: true,
    subtreeMcidCount: 6,
    parentPath: ['Document', 'Table'],
    ...overrides,
  };
}

function row(role: 'focus' | 'control' = 'focus'): RepeatedTableTemplateInputRow {
  return {
    id: role === 'focus' ? 'wv-low' : 'same-source-control',
    pdfPath: `/tmp/${role}.pdf`,
    role,
  };
}

function features(overrides: Partial<RepeatedTableTemplateFeatures> = {}): RepeatedTableTemplateFeatures {
  return {
    score: 69,
    grade: 'D',
    pageCount: 32,
    tableMarkup: 5,
    pdfUaCompliance: 71,
    headingStructure: 100,
    readingOrder: 100,
    realReachableTableCount: 16,
    nonRealTableCount: 0,
    repeatedGroupCount: 1,
    largestRepeatedGroupCount: 16,
    largestRepeatedGroupDebt: 160,
    repeatedTemplateDebt: 160,
    repeatedTemplateTableCount: 16,
    tableHeaderAudit: {
      tablesChecked: 16,
      headerAssociationMissingCount: 16,
      orphanHeaderCellCount: 0,
      dataCellsWithoutHeaderCount: 480,
      headerCellsWithScopeCount: 0,
      headerCellsWithIdCount: 0,
      dataCellsWithHeadersCount: 0,
    },
    tableSignals: {
      directCellUnderTableCount: 0,
      misplacedCellCount: 0,
      irregularTableCount: 16,
      stronglyIrregularTableCount: 16,
      layoutTableCandidateCount: 0,
      denseRowBandTableCandidateCount: 0,
    },
    strictTablePacRules: ['pdfua.table.header_association_present'],
    ...overrides,
  };
}

function diagnosticRow(input: Partial<RepeatedTableTemplateRow> = {}): RepeatedTableTemplateRow {
  const baseFeatures = input.features ?? features();
  const classified = classifyRepeatedTableTemplateRow({
    row: { id: input.id ?? 'wv-low', role: input.role ?? 'focus' },
    features: baseFeatures,
    groups: [],
  });
  return {
    id: input.id ?? 'wv-low',
    pdfPath: input.pdfPath ?? '/tmp/wv-low.pdf',
    role: input.role ?? 'focus',
    ...classified,
    features: baseFeatures,
    topTemplateGroups: input.topTemplateGroups ?? [],
    ...input,
  };
}

describe('repeated table template diagnostic', () => {
  it('builds stable signatures from object-backed row-count templates', () => {
    const a = table({ structRef: '10_0', page: 0 });
    const b = table({ structRef: '11_0', page: 1 });
    expect(tableTemplateSignature(a)).toBe(tableTemplateSignature(b));

    const c = table({ structRef: '12_0', rowCellCounts: [1, 5], totalCells: 6 });
    expect(tableTemplateSignature(c)).not.toBe(tableTemplateSignature(a));
  });

  it('clusters only real root-reachable table targets', () => {
    const groups = buildTemplateGroups([
      table({ structRef: '10_0', page: 0 }),
      table({ structRef: '11_0', page: 1 }),
      table({ structRef: '12_0', rawRole: 'Span', resolvedRole: 'Span' }),
      table({ structRef: '13_0', reachable: false }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tableCount).toBe(2);
    expect(groups[0]?.sampleRefs).toEqual(['10_0', '11_0']);
  });

  it('classifies high-volume low-score repeated table debt as behavior-proof evidence', () => {
    const result = classifyRepeatedTableTemplateRow({
      row: row('focus'),
      features: features(),
      groups: [],
    });

    expect(result.classification).toBe('repeated_template_finalization_candidate');
    expect(result.promotionSupported).toBe(true);
    expect(result.reasons).toContain('low_table_score_with_high_volume_repeated_real_table_template');
  });

  it('blocks controls that match the same repeated-template predicate', () => {
    const result = classifyRepeatedTableTemplateRow({
      row: row('control'),
      features: features(),
      groups: [],
    });

    expect(result.classification).toBe('repeated_template_control_triggered');
    expect(result.promotionSupported).toBe(false);
    expect(result.wouldPromoteIfFocus).toBe(true);
  });

  it('keeps high-grade table-like controls out of the promotion lane', () => {
    const result = classifyRepeatedTableTemplateRow({
      row: row('control'),
      features: features({
        score: 96,
        grade: 'A',
        tableMarkup: 96,
        largestRepeatedGroupDebt: 20,
        repeatedTemplateDebt: 20,
        tableHeaderAudit: {
          tablesChecked: 3,
          headerAssociationMissingCount: 0,
          orphanHeaderCellCount: 0,
          dataCellsWithoutHeaderCount: 0,
        },
        strictTablePacRules: [],
      }),
      groups: [],
    });

    expect(result.classification).toBe('control_or_high_grade_template_noise');
    expect(result.wouldPromoteIfFocus).toBe(false);
  });

  it('separates real table debt without a repeated template from layout-only table evidence', () => {
    const noTemplate = classifyRepeatedTableTemplateRow({
      row: row('focus'),
      features: features({
        largestRepeatedGroupCount: 2,
        largestRepeatedGroupDebt: 20,
        repeatedTemplateTableCount: 2,
        repeatedTemplateDebt: 20,
      }),
      groups: [],
    });
    expect(noTemplate.classification).toBe('real_table_debt_without_repeated_template');

    const layoutOnly = classifyRepeatedTableTemplateRow({
      row: row('focus'),
      features: features({
        tableMarkup: 0,
        realReachableTableCount: 0,
        largestRepeatedGroupCount: 0,
        largestRepeatedGroupDebt: 0,
        repeatedTemplateTableCount: 0,
        repeatedTemplateDebt: 0,
        tableHeaderAudit: null,
        strictTablePacRules: [],
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          layoutTableCandidateCount: 4,
          denseRowBandTableCandidateCount: 3,
        },
      }),
      groups: [],
    });
    expect(layoutOnly.classification).toBe('layout_or_non_table_only');
  });

  it('plans a behavior proof only when focus candidates repeat and controls do not trigger', () => {
    const report = buildRepeatedTableTemplateReport({
      outDir: '/tmp/out',
      rows: [
        diagnosticRow({ id: 'wv-02' }),
        diagnosticRow({ id: 'wv-04' }),
        diagnosticRow({
          id: 'wv-control',
          role: 'control',
          features: features({
            score: 96,
            grade: 'A',
            tableMarkup: 96,
            largestRepeatedGroupDebt: 20,
            repeatedTemplateDebt: 20,
            tableHeaderAudit: null,
            strictTablePacRules: [],
          }),
        }),
      ],
      generatedAt: '2026-05-28T00:00:00Z',
    });

    expect(report.decision.status).toBe('plan_repeated_template_behavior_proof');
    expect(report.summary.focusCandidates).toEqual(['wv-02', 'wv-04']);
    expect(report.summary.unsafeControlCandidates).toEqual([]);
  });

  it('keeps diagnostic-only when a control matches the predicate', () => {
    const report = buildRepeatedTableTemplateReport({
      outDir: '/tmp/out',
      rows: [
        diagnosticRow({ id: 'wv-02' }),
        diagnosticRow({ id: 'wv-04' }),
        diagnosticRow({ id: 'orig-table-control', role: 'control' }),
      ],
    });

    expect(report.decision.status).toBe('keep_repeated_template_diagnostic_only');
    expect(report.summary.unsafeControlCandidates).toEqual(['orig-table-control']);
  });

  it('keeps diagnostic-only when any row has an analysis error', () => {
    const report = buildRepeatedTableTemplateReport({
      outDir: '/tmp/out',
      rows: [
        diagnosticRow({ id: 'wv-02' }),
        diagnosticRow({ id: 'wv-04' }),
        diagnosticRow({
          id: 'missing-control',
          role: 'control',
          classification: 'analysis_error',
          promotionSupported: false,
          wouldPromoteIfFocus: false,
          reasons: ['PDF not found'],
          error: 'PDF not found',
          features: features({
            score: null,
            grade: null,
            tableMarkup: null,
            largestRepeatedGroupCount: 0,
            largestRepeatedGroupDebt: 0,
            repeatedTemplateDebt: 0,
            repeatedTemplateTableCount: 0,
            tableHeaderAudit: null,
            strictTablePacRules: [],
          }),
        }),
      ],
    });

    expect(report.decision.status).toBe('keep_repeated_template_diagnostic_only');
    expect(report.decision.reasons).toContain('one_or_more_analysis_errors');
  });

  it('parses inline pdf, control, manifest, limit, and output arguments', () => {
    const args = parseArgs([
      '--pdf', 'wv-02=/tmp/wv-02.pdf',
      '--control', '/tmp/control.pdf',
      '--manifest', '/tmp/manifest.json',
      '--limit', '3',
      '--out', '/tmp/out',
    ], new Date('2026-05-28T00:00:00Z'));

    expect(args.rows).toEqual([
      { id: 'wv-02', pdfPath: '/tmp/wv-02.pdf', role: 'focus' },
      { id: 'control', pdfPath: '/tmp/control.pdf', role: 'control' },
    ]);
    expect(args.manifest).toBe('/tmp/manifest.json');
    expect(args.limit).toBe(3);
    expect(args.outDir).toBe('/tmp/out');
  });
});

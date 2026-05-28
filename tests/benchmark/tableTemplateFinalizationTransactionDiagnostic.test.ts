import { describe, expect, it } from 'vitest';
import {
  buildDelta,
  buildReport,
  buildTableTemplateFinalizationMutations,
  classifyTransactionRow,
  parseArgs,
  renderMarkdown,
  type TableTemplateTransactionMetrics,
  type TableTemplateTransactionRow,
} from '../../scripts/table-template-finalization-transaction-diagnostic.js';

function metrics(overrides: Partial<TableTemplateTransactionMetrics> = {}): TableTemplateTransactionMetrics {
  return {
    score: 69,
    grade: 'D',
    tableMarkup: 0,
    pdfUaCompliance: 71,
    headingStructure: 58,
    altText: 100,
    linkQuality: 100,
    readingOrder: 100,
    tableHeaderAudit: {
      tablesChecked: 248,
      headerAssociationMissingCount: 246,
      orphanHeaderCellCount: 512,
      dataCellsWithoutHeaderCount: 1477,
      headerCellsWithScopeCount: 0,
      headerCellsWithIdCount: 0,
      dataCellsWithHeadersCount: 0,
    },
    tableSignals: {
      tablesWithMisplacedCells: 0,
      misplacedCellCount: 0,
      irregularTableCount: 239,
      stronglyIrregularTableCount: 129,
      directCellUnderTableCount: 0,
    },
    pdfUaSignals: {
      orphanMcidCount: 64,
      suspectedPathPaintOutsideMc: 0,
      taggedAnnotationRiskCount: 0,
    },
    ...overrides,
  };
}

function cleared(overrides: Partial<TableTemplateTransactionMetrics> = {}): TableTemplateTransactionMetrics {
  return metrics({
    score: 89,
    grade: 'B',
    tableMarkup: 100,
    pdfUaCompliance: 79,
    tableHeaderAudit: {
      tablesChecked: 247,
      headerAssociationMissingCount: 0,
      orphanHeaderCellCount: 0,
      dataCellsWithoutHeaderCount: 0,
      headerCellsWithScopeCount: 716,
      headerCellsWithIdCount: 716,
      dataCellsWithHeadersCount: 1562,
    },
    tableSignals: {
      tablesWithMisplacedCells: 0,
      misplacedCellCount: 0,
      irregularTableCount: 0,
      stronglyIrregularTableCount: 0,
      directCellUnderTableCount: 0,
    },
    ...overrides,
  });
}

function row(overrides: Partial<TableTemplateTransactionRow> = {}): TableTemplateTransactionRow {
  const before = overrides.before ?? metrics();
  const after = overrides.after ?? cleared();
  const delta = overrides.delta ?? buildDelta(before, after);
  const classified = classifyTransactionRow({
    role: overrides.role ?? 'focus',
    before,
    after,
    delta,
    mutationSuccess: true,
    appliedCount: 12,
    failedCount: 0,
  });
  return {
    id: 'wv-low',
    pdfPath: '/tmp/wv-low.pdf',
    role: 'focus',
    ...classified,
    before,
    after,
    delta,
    mutation: {
      success: true,
      appliedCount: 12,
      failed: [],
      appliedRows: [],
    },
    durationMs: 1000,
    ...overrides,
  };
}

describe('table template finalization transaction diagnostic', () => {
  it('builds the explicit transaction in the intended bounded order', () => {
    const mutations = buildTableTemplateFinalizationMutations();
    expect(mutations).toHaveLength(22);
    expect(mutations.slice(0, 8).every(mutation => mutation.params.tableFailureClass === 'short_header_row_template')).toBe(true);
    expect(mutations.slice(8, 14).every(mutation => mutation.params.tableFailureClass === 'strongly_irregular_rows')).toBe(true);
    expect(mutations.slice(14, 16).every(mutation => mutation.params.tableFailureClass === 'single_column_variance_template')).toBe(true);
    expect(mutations.slice(16, 18).every(mutation => mutation.params.tableFailureClass === 'empty_table_shell')).toBe(true);
    expect(mutations[18]?.op).toBe('set_table_header_cells');
    expect(mutations[18]?.params.includeHeaderOnlyTables).toBe(true);
    expect(mutations.slice(19, 21).every(mutation => mutation.params.tableFailureClass === 'empty_corner_header_cell')).toBe(true);
    expect(mutations[21]?.op).toBe('set_table_header_cells');
  });

  it('classifies full table cleanup below 93 as mixed non-table debt remaining', () => {
    const before = metrics();
    const after = cleared();
    const delta = buildDelta(before, after);
    const classified = classifyTransactionRow({
      role: 'focus',
      before,
      after,
      delta,
      mutationSuccess: true,
      appliedCount: 12,
      failedCount: 0,
    });

    expect(classified.classification).toBe('table_family_cleared_mixed_non_table_debt_remaining');
    expect(classified.promotionSupported).toBe(true);
    expect(classified.reasons).toContain('table_family_cleared_but_non_table_debt_remains');
  });

  it('classifies full table cleanup at target as table-family cleared', () => {
    const before = metrics();
    const after = cleared({ score: 94, grade: 'A' });
    const classified = classifyTransactionRow({
      role: 'focus',
      before,
      after,
      delta: buildDelta(before, after),
      mutationSuccess: true,
      appliedCount: 12,
      failedCount: 0,
    });

    expect(classified.classification).toBe('table_family_cleared');
    expect(classified.promotionSupported).toBe(true);
  });

  it('blocks non-table PAC side effects even when table score improves', () => {
    const before = metrics();
    const after = cleared({
      pdfUaSignals: {
        orphanMcidCount: 70,
        suspectedPathPaintOutsideMc: 0,
        taggedAnnotationRiskCount: 0,
      },
    });
    const classified = classifyTransactionRow({
      role: 'focus',
      before,
      after,
      delta: buildDelta(before, after),
      mutationSuccess: true,
      appliedCount: 12,
      failedCount: 0,
    });

    expect(classified.classification).toBe('unsafe_non_table_side_effect');
    expect(classified.promotionSupported).toBe(false);
    expect(classified.reasons).toContain('orphan_mcid_increased');
  });

  it('flags controls that move under the diagnostic transaction', () => {
    const before = metrics({ score: 96, grade: 'A', tableMarkup: 96 });
    const after = cleared({ score: 97, grade: 'A', tableMarkup: 100 });
    const classified = classifyTransactionRow({
      role: 'control',
      before,
      after,
      delta: buildDelta(before, after),
      mutationSuccess: true,
      appliedCount: 1,
      failedCount: 0,
    });

    expect(classified.classification).toBe('control_changed');
    expect(classified.promotionSupported).toBe(false);
  });

  it('plans a routed proof only when at least two focus rows support and controls stay stable', () => {
    const report = buildReport('/tmp/out', [
      row({ id: 'wv-02' }),
      row({ id: 'wv-07' }),
      row({
        id: 'control',
        role: 'control',
        before: metrics({ score: 96, grade: 'A', tableMarkup: 96 }),
        after: metrics({ score: 96, grade: 'A', tableMarkup: 96 }),
        delta: buildDelta(metrics({ score: 96, grade: 'A', tableMarkup: 96 }), metrics({ score: 96, grade: 'A', tableMarkup: 96 })),
        classification: 'control_stable',
        promotionSupported: false,
        reasons: ['control_stable'],
        mutation: { success: true, appliedCount: 0, failed: [], appliedRows: [] },
      }),
    ]);

    expect(report.decision.status).toBe('plan_routed_behavior_proof');
    expect(renderMarkdown(report)).toContain('table_family_cleared_mixed_non_table_debt_remaining');
  });

  it('parses directory and explicit row arguments', () => {
    const parsed = parseArgs([
      '--input-dir', '/tmp/pdfs',
      '--pdf', 'focus=/tmp/a.pdf',
      '--control', '/tmp/b.pdf',
      '--limit', '4',
      '--out', '/tmp/out',
      '--start-from-deterministic',
    ], new Date('2026-05-28T00:00:00Z'));

    expect(parsed.inputDir).toBe('/tmp/pdfs');
    expect(parsed.outDir).toBe('/tmp/out');
    expect(parsed.limit).toBe(4);
    expect(parsed.startFromDeterministic).toBe(true);
    expect(parsed.rows).toEqual([
      { id: 'focus', pdfPath: '/tmp/a.pdf', role: 'focus' },
      { id: 'b', pdfPath: '/tmp/b.pdf', role: 'control' },
    ]);
  });
});

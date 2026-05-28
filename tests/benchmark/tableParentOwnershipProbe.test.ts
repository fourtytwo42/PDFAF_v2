import { describe, expect, it } from 'vitest';
import {
  classifyTableParentOwnershipStep,
  parseArgs,
  strictSameRefHeaderParams,
  strictTableProbeParams,
  type TableParentOwnershipStepClassification,
} from '../../scripts/table-parent-ownership-probe.js';

const baseMetrics = {
  score: 69,
  grade: 'D',
  tableMarkup: 16,
  pdfUaCompliance: 83,
  orphanMcidCount: 0,
  parentTreeDebt: 0,
  tableHeaderDebt: 10,
  tableRegularityDebt: 4,
  textCharCount: 1200,
};

function classify(input: {
  params?: Record<string, unknown>;
  tableAfter?: number | null;
  orphanAfter?: number;
  parentAfter?: number;
  wrongRefs?: string[];
  pacRegressions?: string[];
  outcome?: string;
}): TableParentOwnershipStepClassification {
  return classifyTableParentOwnershipStep({
    outcome: input.outcome ?? 'applied',
    params: input.params ?? { structRef: '10_0' },
    before: baseMetrics,
    after: {
      ...baseMetrics,
      tableMarkup: input.tableAfter ?? 44,
      orphanMcidCount: input.orphanAfter ?? 0,
      parentTreeDebt: input.parentAfter ?? 0,
    },
    wrongRefs: input.wrongRefs ?? [],
    pacRegressions: input.pacRegressions ?? [],
  }).classification;
}

describe('table parent ownership probe classification', () => {
  it('flags table progress that creates orphan MCID debt', () => {
    expect(classify({ tableAfter: 100, orphanAfter: 3 })).toBe('orphan_mcid_side_effect');
  });

  it('flags table progress that increases ParentTree debt', () => {
    expect(classify({ tableAfter: 100, parentAfter: 2 })).toBe('parent_tree_side_effect');
  });

  it('keeps non-table PAC side effects separate from table/header and orphan debt', () => {
    expect(classify({
      tableAfter: 100,
      pacRegressions: ['pdfua.figure.alt_present'],
    })).toBe('non_table_pac_side_effect');
    expect(classify({
      tableAfter: 100,
      pacRegressions: ['pdfua.table.header_association_present'],
    })).toBe('table_progress_clean');
  });

  it('separates wrong refs and empty planner params from ownership side effects', () => {
    expect(classify({ wrongRefs: ['12_0'], orphanAfter: 2 })).toBe('wrong_ref_precondition');
    expect(classify({ params: {}, tableAfter: 100, orphanAfter: 2 })).toBe('skipped_no_params');
  });

  it('detects clean table progress and table regressions', () => {
    expect(classify({ tableAfter: 72 })).toBe('table_progress_clean');
    expect(classify({ tableAfter: 0 })).toBe('table_regression');
    expect(classify({ tableAfter: 16, outcome: 'no_effect' })).toBe('no_effect_or_no_table_progress');
  });

  it('parses repeatable pdf and control arguments', () => {
    const args = parseArgs([
      '--pdf', '/tmp/a.pdf',
      '--pdf', '/tmp/b.pdf',
      '--out', '/tmp/out',
      '--control', 'b.pdf',
      '--strict-table-refs',
      '--same-ref-transaction',
      '--batch-transaction',
    ], new Date('2026-05-27T00:00:00Z'));

    expect(args.pdfs).toEqual(['/tmp/a.pdf', '/tmp/b.pdf']);
    expect(args.outDir).toBe('/tmp/out');
    expect(args.controls.has('b')).toBe(true);
    expect(args.strictTableRefs).toBe(true);
    expect(args.sameRefTransaction).toBe(true);
    expect(args.batchTransaction).toBe(true);
  });

  it('defaults strict table refs off', () => {
    const args = parseArgs(['--pdf', '/tmp/a.pdf'], new Date('2026-05-27T00:00:00Z'));

    expect(args.strictTableRefs).toBe(false);
    expect(args.sameRefTransaction).toBe(false);
    expect(args.batchTransaction).toBe(false);
  });

  it('same-ref transaction implies strict table refs', () => {
    const args = parseArgs(['--pdf', '/tmp/a.pdf', '--same-ref-transaction'], new Date('2026-05-27T00:00:00Z'));

    expect(args.strictTableRefs).toBe(true);
    expect(args.sameRefTransaction).toBe(true);
  });

  it('batch transaction implies strict table refs', () => {
    const args = parseArgs(['--pdf', '/tmp/a.pdf', '--batch-transaction'], new Date('2026-05-27T00:00:00Z'));

    expect(args.strictTableRefs).toBe(true);
    expect(args.batchTransaction).toBe(true);
  });

  it('adds strict validation to object-backed table params', () => {
    expect(strictTableProbeParams('normalize_table_structure', { structRef: '10_0' }, true)).toEqual({
      structRef: '10_0',
      strictTableTargetRef: true,
    });
    expect(strictTableProbeParams('set_table_header_cells', { structRefs: ['10_0', '11_0'] }, true)).toEqual({
      structRefs: ['10_0', '11_0'],
      strictTableTargetRef: true,
    });
  });

  it('skips broad no-ref table params in strict mode', () => {
    expect(strictTableProbeParams('repair_native_table_headers', { maxTables: 2 }, true)).toEqual({});
  });

  it('leaves table params unchanged when strict mode is off', () => {
    expect(strictTableProbeParams('normalize_table_structure', { maxTables: 2 }, false)).toEqual({ maxTables: 2 });
  });

  it('builds strict same-ref header params from normalized table refs', () => {
    expect(strictSameRefHeaderParams(['10_0'])).toEqual({
      structRef: '10_0',
      tableHeaderAssociation: true,
      strictTableTargetRef: true,
      stage: 'diagnostic_same_ref_table_transaction',
    });
    expect(strictSameRefHeaderParams(['10_0', '10_0', '11_0'])).toEqual({
      structRefs: ['10_0', '11_0'],
      tableHeaderAssociation: true,
      strictTableTargetRef: true,
      maxTableHeaderAssociationTargets: 2,
      stage: 'diagnostic_same_ref_table_transaction',
    });
    expect(strictSameRefHeaderParams([])).toEqual({});
  });
});

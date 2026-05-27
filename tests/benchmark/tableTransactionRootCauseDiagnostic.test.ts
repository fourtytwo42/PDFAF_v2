import { describe, expect, it } from 'vitest';
import {
  classifyTableTransactionRow,
  pacRegressionFamily,
  parseArgs,
  type TableTargetRefDetail,
  type TableTransactionAttempt,
  type TableTransactionRowInput,
} from '../../scripts/table-transaction-root-cause-diagnostic.js';

function refDetail(input: Partial<TableTargetRefDetail> = {}): TableTargetRefDetail {
  const role = input.rawRole ?? input.resolvedRole ?? 'Table';
  return {
    ref: input.ref ?? '10_0',
    targetResolved: input.targetResolved ?? true,
    rawRole: input.rawRole ?? role,
    resolvedRole: input.resolvedRole ?? role,
    targetReachable: input.targetReachable ?? true,
    isTable: input.isTable ?? role.toUpperCase() === 'TABLE',
    resolvedIsTable: input.resolvedIsTable ?? role.toUpperCase() === 'TABLE',
    skipReason: input.skipReason ?? null,
  };
}

function attempt(input: Partial<TableTransactionAttempt> = {}): TableTransactionAttempt {
  const targetRefDetails = input.targetRefDetails ?? [refDetail()];
  return {
    toolName: input.toolName ?? 'normalize_table_structure',
    outcome: input.outcome ?? 'rejected',
    scoreBefore: input.scoreBefore ?? 69,
    scoreAfter: input.scoreAfter ?? 79,
    targetRefs: input.targetRefs ?? ['10_0'],
    requestedTargetRefs: input.requestedTargetRefs ?? input.targetRefs ?? ['10_0'],
    changedTargetRefs: input.changedTargetRefs ?? [],
    skippedTargetRefs: input.skippedTargetRefs ?? [],
    targetRefDetails,
    targetRefDetailsBefore: input.targetRefDetailsBefore ?? targetRefDetails,
    targetRefDetailsAfter: input.targetRefDetailsAfter ?? targetRefDetails,
    targetResolved: input.targetResolved ?? true,
    resolvedRole: input.resolvedRole ?? 'Table',
    tableTreeValidAfter: input.tableTreeValidAfter ?? true,
    headerAssociationMissingBefore: input.headerAssociationMissingBefore ?? 3,
    headerAssociationMissingAfter: input.headerAssociationMissingAfter ?? 1,
    dataCellsWithoutHeaderBefore: input.dataCellsWithoutHeaderBefore ?? 120,
    dataCellsWithoutHeaderAfter: input.dataCellsWithoutHeaderAfter ?? 24,
    directCellsUnderTableBefore: input.directCellsUnderTableBefore ?? 0,
    directCellsUnderTableAfter: input.directCellsUnderTableAfter ?? 0,
    irregularRowsBefore: input.irregularRowsBefore ?? 4,
    irregularRowsAfter: input.irregularRowsAfter ?? 1,
    tablePacRegressions: input.tablePacRegressions ?? ['pdfua.table.header_association_present'],
    nonTablePacRegressions: input.nonTablePacRegressions ?? [],
    pacRegressionFamilies: input.pacRegressionFamilies ?? {
      table_header: input.tablePacRegressions ?? ['pdfua.table.header_association_present'],
      figure_alt: [],
      orphan_mcid: [],
      link_annotation: [],
      reading_order: [],
      unknown: [],
    },
    note: input.note ?? null,
  };
}

function row(input: Partial<TableTransactionRowInput> = {}): TableTransactionRowInput {
  return {
    id: input.id ?? 'row-01',
    role: input.role ?? 'focus',
    score: input.score ?? 69,
    grade: input.grade ?? 'D',
    tableMarkup: input.tableMarkup ?? 0,
    pdfUaCompliance: input.pdfUaCompliance ?? 71,
    error: input.error ?? null,
    timedOut: input.timedOut ?? false,
    attempts: input.attempts ?? [attempt()],
    analysisError: input.analysisError ?? null,
  };
}

describe('table transaction root-cause diagnostic classifier', () => {
  it('classifies clean table-only regression with table movement as valid cleanup candidate', () => {
    const result = classifyTableTransactionRow(row());
    expect(result.classification).toBe('valid_table_no_final_cleanup');
    expect(result.promotionSupported).toBe(true);
    expect(result.laterStrictTransactionSafe).toBe(true);
    expect(result.reasons).toContain('table_evidence_improved_before_rejection');
  });

  it('blocks planner wrong refs before behavior promotion', () => {
    const result = classifyTableTransactionRow(row({
      attempts: [attempt({
        resolvedRole: 'P',
        targetRefDetails: [refDetail({ rawRole: 'P', resolvedRole: 'P', isTable: false, resolvedIsTable: false, skipReason: 'not_table' })],
      })],
    }));
    expect(result.classification).toBe('planner_wrong_ref');
    expect(result.promotionSupported).toBe(false);
    expect(result.reasons[0]).toContain(':P');
  });

  it('separates mixed batch refs from single wrong refs', () => {
    const result = classifyTableTransactionRow(row({
      attempts: [attempt({
        requestedTargetRefs: ['10_0', '11_0'],
        targetRefs: ['10_0'],
        targetRefDetails: [
          refDetail({ ref: '10_0', rawRole: 'Table', resolvedRole: 'Table' }),
          refDetail({ ref: '11_0', rawRole: 'Span', resolvedRole: 'Span', isTable: false, resolvedIsTable: false, skipReason: 'not_table' }),
        ],
      })],
    }));
    expect(result.classification).toBe('mixed_batch_refs');
    expect(result.promotionSupported).toBe(false);
  });

  it('separates non-target PAC regression from table-only PAC debt', () => {
    const result = classifyTableTransactionRow(row({
      attempts: [attempt({
        tablePacRegressions: ['pdfua.table.header_association_present'],
        nonTablePacRegressions: ['pdfua.content.orphan_mcids_absent'],
        pacRegressionFamilies: {
          table_header: ['pdfua.table.header_association_present'],
          figure_alt: [],
          orphan_mcid: ['pdfua.content.orphan_mcids_absent'],
          link_annotation: [],
          reading_order: [],
          unknown: [],
        },
      })],
    }));
    expect(result.classification).toBe('non_table_pac_side_effect');
    expect(result.promotionSupported).toBe(false);
    expect(result.reasons[0]).toContain('orphan_mcid');
  });

  it('keeps table-only PAC rejection without movement diagnostic-only', () => {
    const result = classifyTableTransactionRow(row({
      attempts: [attempt({
        headerAssociationMissingBefore: 3,
        headerAssociationMissingAfter: 3,
        dataCellsWithoutHeaderBefore: 120,
        dataCellsWithoutHeaderAfter: 120,
        directCellsUnderTableBefore: 0,
        directCellsUnderTableAfter: 0,
        irregularRowsBefore: 4,
        irregularRowsAfter: 4,
        tableTreeValidAfter: false,
      })],
    }));
    expect(result.classification).toBe('table_header_pac_only');
    expect(result.promotionSupported).toBe(false);
  });

  it('marks same-source controls as unsafe when table attempts occur', () => {
    const result = classifyTableTransactionRow(row({
      role: 'control',
      score: 95,
      grade: 'A',
    }));
    expect(result.classification).toBe('control_table_side_effect');
    expect(result.promotionSupported).toBe(false);
  });

  it('parks timeouts and analyzer errors as runtime debt', () => {
    const timeout = classifyTableTransactionRow(row({ timedOut: true }));
    expect(timeout.classification).toBe('runtime_or_analyzer_debt');
    const analysisError = classifyTableTransactionRow(row({ analysisError: 'parse failed' }));
    expect(analysisError.classification).toBe('runtime_or_analyzer_debt');
  });

  it('parses repeatable pdf and control arguments', () => {
    const args = parseArgs([
      '--run', '/tmp/run.json',
      '--pdf', 'focus=/tmp/focus.pdf',
      '--control', 'control=/tmp/control.pdf',
      '--no-analyze',
    ], new Date('2026-05-27T00:00:00Z'));
    expect(args.run).toBe('/tmp/run.json');
    expect(args.pdfs.get('focus')).toBe('/tmp/focus.pdf');
    expect(args.pdfs.get('control')).toBe('/tmp/control.pdf');
    expect(args.controls.has('control')).toBe(true);
    expect(args.analyzePdfs).toBe(false);
  });

  it('maps PAC regressions to side-effect families', () => {
    expect(pacRegressionFamily('pdfua.table.header_association_present')).toBe('table_header');
    expect(pacRegressionFamily('pdfua.figure.alt_present')).toBe('figure_alt');
    expect(pacRegressionFamily('pdfua.content.orphan_mcids_absent')).toBe('orphan_mcid');
    expect(pacRegressionFamily('pdfua.annotations.link_contents_present')).toBe('link_annotation');
    expect(pacRegressionFamily('pdfua.reading_order.logical_order')).toBe('reading_order');
  });
});

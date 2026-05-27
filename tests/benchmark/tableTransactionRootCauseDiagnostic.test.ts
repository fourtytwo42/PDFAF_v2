import { describe, expect, it } from 'vitest';
import {
  classifyTableTransactionRow,
  parseArgs,
  type TableTransactionAttempt,
  type TableTransactionRowInput,
} from '../../scripts/table-transaction-root-cause-diagnostic.js';

function attempt(input: Partial<TableTransactionAttempt> = {}): TableTransactionAttempt {
  return {
    toolName: input.toolName ?? 'normalize_table_structure',
    outcome: input.outcome ?? 'rejected',
    scoreBefore: input.scoreBefore ?? 69,
    scoreAfter: input.scoreAfter ?? 79,
    targetRefs: input.targetRefs ?? ['10_0'],
    requestedTargetRefs: input.requestedTargetRefs ?? input.targetRefs ?? ['10_0'],
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
  it('classifies clean table-only regression with table movement as strict transaction candidate', () => {
    const result = classifyTableTransactionRow(row());
    expect(result.classification).toBe('strict_transaction_candidate');
    expect(result.promotionSupported).toBe(true);
    expect(result.reasons).toContain('table_evidence_improved_before_rejection');
  });

  it('blocks non-table target resolution before behavior promotion', () => {
    const result = classifyTableTransactionRow(row({
      attempts: [attempt({ resolvedRole: 'P' })],
    }));
    expect(result.classification).toBe('non_table_target_blocked');
    expect(result.promotionSupported).toBe(false);
    expect(result.reasons[0]).toContain(':P');
  });

  it('separates non-target PAC regression from table-only PAC debt', () => {
    const result = classifyTableTransactionRow(row({
      attempts: [attempt({
        tablePacRegressions: ['pdfua.table.header_association_present'],
        nonTablePacRegressions: ['pdfua.content.orphan_mcids_absent'],
      })],
    }));
    expect(result.classification).toBe('non_target_pac_regression');
    expect(result.promotionSupported).toBe(false);
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
    expect(result.classification).toBe('pac_table_regression_only');
    expect(result.promotionSupported).toBe(false);
  });

  it('marks same-source controls as unsafe when table attempts occur', () => {
    const result = classifyTableTransactionRow(row({
      role: 'control',
      score: 95,
      grade: 'A',
    }));
    expect(result.classification).toBe('control_triggered');
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
});

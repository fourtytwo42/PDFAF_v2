import { describe, expect, it } from 'vitest';
import {
  classifyTablePacSideEffectRow,
  extractTableSideEffectAttempt,
  pacSideEffectFamily,
  parseArgs,
  type TablePacSideEffectAttempt,
} from '../../scripts/table-pac-side-effect-diagnostic.js';

function attempt(input: Partial<TablePacSideEffectAttempt> = {}): TablePacSideEffectAttempt {
  return {
    toolName: input.toolName ?? 'normalize_table_structure',
    outcome: input.outcome ?? 'rejected',
    note: input.note ?? null,
    scoreBefore: input.scoreBefore ?? 69,
    scoreAfter: input.scoreAfter ?? 69,
    requestedRefs: input.requestedRefs ?? ['10_0'],
    changedRefs: input.changedRefs ?? ['10_0'],
    wrongRefs: input.wrongRefs ?? [],
    tablePacRegressions: input.tablePacRegressions ?? [],
    nonTablePacRegressions: input.nonTablePacRegressions ?? [],
    nonTableFamilies: input.nonTableFamilies ?? [],
    tableEvidenceImproved: input.tableEvidenceImproved ?? true,
  };
}

describe('table PAC side-effect diagnostic', () => {
  it('classifies focus rows with table movement and non-table PAC debt as cleanup candidates', () => {
    const result = classifyTablePacSideEffectRow({
      id: 'focus-01',
      role: 'focus',
      score: 69,
      error: null,
      timedOut: false,
      attempts: [attempt({
        nonTablePacRegressions: ['pdfua.content.orphan_mcids_absent'],
        nonTableFamilies: ['orphan_mcid'],
      })],
    });

    expect(result.classification).toBe('side_effect_cleanup_candidate');
    expect(result.promotionSupported).toBe(true);
    expect(result.reasons).toContain('table_evidence_improved_before_side_effect');
  });

  it('blocks controls with the same side-effect family', () => {
    const result = classifyTablePacSideEffectRow({
      id: 'control-01',
      role: 'control',
      score: 99,
      error: null,
      timedOut: false,
      attempts: [attempt({
        nonTablePacRegressions: ['pdfua.figure.alt_present'],
        nonTableFamilies: ['figure_alt'],
      })],
    });

    expect(result.classification).toBe('control_side_effect_blocker');
    expect(result.promotionSupported).toBe(false);
    expect(result.sideEffectFamilies).toEqual(['figure_alt']);
  });

  it('separates wrong-ref preconditions from side-effect cleanup', () => {
    const result = classifyTablePacSideEffectRow({
      id: 'focus-02',
      role: 'focus',
      score: 69,
      error: null,
      timedOut: false,
      attempts: [attempt({ wrongRefs: ['11_0'], nonTableFamilies: ['orphan_mcid'] })],
    });

    expect(result.classification).toBe('wrong_ref_precondition');
    expect(result.promotionSupported).toBe(false);
  });

  it('keeps table-only PAC debt separate from non-table side effects', () => {
    const result = classifyTablePacSideEffectRow({
      id: 'focus-03',
      role: 'focus',
      score: 69,
      error: null,
      timedOut: false,
      attempts: [attempt({ tablePacRegressions: ['pdfua.table.header_association_present'] })],
    });

    expect(result.classification).toBe('table_only_cleanup_candidate');
    expect(result.promotionSupported).toBe(true);
  });

  it('parks timeouts as runtime or analyzer debt', () => {
    const result = classifyTablePacSideEffectRow({
      id: 'focus-04',
      role: 'focus',
      score: null,
      error: null,
      timedOut: true,
      attempts: [attempt()],
    });

    expect(result.classification).toBe('runtime_or_analyzer_debt');
    expect(result.promotionSupported).toBe(false);
  });

  it('extracts table attempt regressions and wrong refs from mutation details', () => {
    const extracted = extractTableSideEffectAttempt({
      toolName: 'set_table_header_cells',
      outcome: 'rejected',
      scoreBefore: 69,
      scoreAfter: 69,
      details: JSON.stringify({
        outcome: 'rejected',
        note: 'pac_rule_regressed(pdfua.figure.alt_present)',
        pacRuleRegression: { ruleId: 'pdfua.figure.alt_present' },
        invariants: {
          requestedTargetRefs: ['12_0'],
          targetRefDetails: [
            {
              ref: '12_0',
              targetResolved: true,
              rawRole: 'Span',
              resolvedRole: 'Span',
              targetReachable: true,
              isTable: false,
              resolvedIsTable: false,
              skipReason: 'not_table',
            },
          ],
          irregularRowsBefore: 4,
          irregularRowsAfter: 1,
        },
      }),
    });

    expect(extracted?.nonTableFamilies).toEqual(['figure_alt']);
    expect(extracted?.wrongRefs).toEqual(['12_0']);
    expect(extracted?.tableEvidenceImproved).toBe(true);
  });

  it('maps PAC rule IDs to side-effect families', () => {
    expect(pacSideEffectFamily('pdfua.table.header_association_present')).toBe('table_header');
    expect(pacSideEffectFamily('pdfua.figure.alt_present')).toBe('figure_alt');
    expect(pacSideEffectFamily('pdfua.content.orphan_mcids_absent')).toBe('orphan_mcid');
    expect(pacSideEffectFamily('pdfua.annotations.tagged_annotations_present')).toBe('link_annotation');
    expect(pacSideEffectFamily('pdfua.reading_order.logical_order')).toBe('reading_order');
  });

  it('parses controls and output options', () => {
    const args = parseArgs([
      '--run', '/tmp/run.json',
      '--out', '/tmp/out',
      '--control', 'control-01.pdf',
    ], new Date('2026-05-27T00:00:00Z'));

    expect(args.run).toBe('/tmp/run.json');
    expect(args.outDir).toBe('/tmp/out');
    expect(args.controls.has('control-01')).toBe(true);
  });
});

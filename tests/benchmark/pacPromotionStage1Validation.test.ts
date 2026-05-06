import { describe, expect, it } from 'vitest';
import {
  buildPacPromotionStage1Validation,
  type Stage41GateAuditLike,
} from '../../scripts/pac-promotion-stage1-validation.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { ScoreCapApplied } from '../../src/types.js';

function pacCap(ruleId: string, category: ScoreCapApplied['category'] = 'table_markup'): ScoreCapApplied {
  return {
    category,
    cap: 89,
    rawScore: 100,
    finalScore: 89,
    reason: `PAC rule failure: ${ruleId}`,
  };
}

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file ?? `/tmp/${input.id}.pdf`,
    cohort: input.cohort ?? '10-short-near-pass',
    sourceType: input.sourceType ?? 'original',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 90,
    beforeGrade: input.beforeGrade ?? 'A',
    beforePdfClass: input.beforePdfClass ?? 'tagged',
    afterScore: input.afterScore ?? 90,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: input.afterPdfClass ?? 'tagged',
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedGrade ?? null,
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? null,
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    reanalyzedScoreCapsApplied: input.reanalyzedScoreCapsApplied ?? [],
    delta: input.delta ?? 0,
    appliedTools: input.appliedTools ?? [],
    runtimeSummary: input.runtimeSummary ?? { wallMs: 1000 },
    error: input.error,
  } as RemediateBenchmarkRow;
}

function report(input: {
  beforeRows: RemediateBenchmarkRow[];
  afterRows: RemediateBenchmarkRow[];
  gateAudit?: Stage41GateAuditLike;
}) {
  return buildPacPromotionStage1Validation({
    beforeRunDir: 'before',
    afterRunDir: 'after',
    beforeRows: input.beforeRows,
    afterRows: input.afterRows,
    gateAudit: input.gateAudit,
    generatedAt: '2026-05-05T00:00:00.000Z',
  });
}

describe('PAC Promotion Stage 1 validation helpers', () => {
  it('detects newly added PAC score caps by rule, category, and file', () => {
    const validation = report({
      beforeRows: [row({ id: 'file-a', afterScore: 95 })],
      afterRows: [
        row({
          id: 'file-a',
          afterScore: 89,
          afterScoreCapsApplied: [pacCap('pdfua.table.header_association_present', 'table_markup')],
        }),
      ],
    });

    expect(validation.newPacScoreCaps).toEqual([
      expect.objectContaining({
        fileId: 'file-a',
        ruleId: 'pdfua.table.header_association_present',
        category: 'table_markup',
        phase: 'after',
      }),
    ]);
    expect(validation.capFrequency).toEqual([
      expect.objectContaining({
        ruleId: 'pdfua.table.header_association_present',
        category: 'table_markup',
        count: 1,
        files: ['file-a'],
      }),
    ]);
  });

  it('ignores PAC caps already present in the baseline row', () => {
    const cap = pacCap('pdfua.font.to_unicode_cmap_present', 'text_extractability');
    const validation = report({
      beforeRows: [row({ id: 'file-a', afterScoreCapsApplied: [cap] })],
      afterRows: [row({ id: 'file-a', afterScoreCapsApplied: [cap] })],
    });

    expect(validation.newPacScoreCaps).toEqual([]);
    expect(validation.summary.newPacScoreCapCount).toBe(0);
  });

  it('detects new pac_rule_regressed rejection reasons from tool details', () => {
    const validation = report({
      beforeRows: [row({ id: 'file-a', afterScore: 90 })],
      afterRows: [
        row({
          id: 'file-a',
          afterScore: 92,
          appliedTools: [
            {
              toolName: 'normalize_table_structure',
              stage: 4,
              round: 1,
              scoreBefore: 90,
              scoreAfter: 90,
              delta: 0,
              outcome: 'rejected',
              details: JSON.stringify({ reason: 'pac_rule_regressed(pdfua.table.header_association_present)' }),
            },
          ],
        }),
      ],
    });

    expect(validation.pacGateRejections).toEqual([
      expect.objectContaining({
        fileId: 'file-a',
        ruleId: 'pdfua.table.header_association_present',
        reason: 'pac_rule_regressed(pdfua.table.header_association_present)',
        toolName: 'normalize_table_structure',
      }),
    ]);
    expect(validation.pacGateStableOrImprovedRows).toEqual([
      expect.objectContaining({ fileId: 'file-a', delta: 2, rejectedRules: ['pdfua.table.header_association_present'] }),
    ]);
  });

  it('classifies score drops caused by new PAC caps separately from path regressions', () => {
    const validation = report({
      beforeRows: [
        row({ id: 'cap-row', afterScore: 96, afterGrade: 'A' }),
        row({ id: 'path-row', afterScore: 96, afterGrade: 'A' }),
      ],
      afterRows: [
        row({
          id: 'cap-row',
          afterScore: 89,
          afterGrade: 'B',
          afterScoreCapsApplied: [pacCap('pdfua.font.to_unicode_cmap_valid', 'text_extractability')],
        }),
        row({ id: 'path-row', afterScore: 80, afterGrade: 'B' }),
      ],
    });

    expect(validation.scoreDrops.map(item => `${item.fileId}:${item.classification}`)).toEqual([
      'path-row:remediation_or_analyzer_path',
      'cap-row:cap_attributable',
    ]);
    expect(validation.summary.capAttributableScoreDropCount).toBe(1);
  });

  it('sorts cap and gate rows deterministically by rule and file id', () => {
    const validation = report({
      beforeRows: [row({ id: 'b' }), row({ id: 'a' })],
      afterRows: [
        row({
          id: 'b',
          afterScoreCapsApplied: [pacCap('pdfua.table.header_association_present', 'table_markup')],
          appliedTools: [
            {
              toolName: 'normalize_table_structure',
              stage: 3,
              round: 1,
              scoreBefore: 90,
              scoreAfter: 90,
              delta: 0,
              outcome: 'rejected',
              details: 'pac_rule_regressed(pdfua.structure.rolemap_valid)',
            },
          ],
        }),
        row({
          id: 'a',
          afterScoreCapsApplied: [pacCap('pdfua.font.to_unicode_cmap_present', 'text_extractability')],
          appliedTools: [
            {
              toolName: 'repair_native_link_structure',
              stage: 2,
              round: 1,
              scoreBefore: 90,
              scoreAfter: 90,
              delta: 0,
              outcome: 'rejected',
              details: 'pac_rule_regressed(pdfua.parent_tree.mcid_entries_valid)',
            },
          ],
        }),
      ],
    });

    expect(validation.newPacScoreCaps.map(item => `${item.ruleId}:${item.fileId}`)).toEqual([
      'pdfua.font.to_unicode_cmap_present:a',
      'pdfua.table.header_association_present:b',
    ]);
    expect(validation.pacGateRejections.map(item => `${item.ruleId}:${item.fileId}`)).toEqual([
      'pdfua.parent_tree.mcid_entries_valid:a',
      'pdfua.structure.rolemap_valid:b',
    ]);
  });

  it('handles missing pre and post rows without crashing', () => {
    const validation = report({
      beforeRows: [row({ id: 'missing-after' })],
      afterRows: [row({ id: 'missing-before', afterScoreCapsApplied: [pacCap('pdfua.table.header_association_present')] })],
      gateAudit: {
        passed: false,
        gates: [{ key: 'runtime_p95_wall', passed: false, severity: 'hard' }],
        summary: { candidateP95WallMs: 120000, candidateAttemptCount: 10, falsePositiveAppliedCount: 0 },
      },
    });

    expect(validation.missingInBefore).toEqual(['missing-before']);
    expect(validation.missingInAfter).toEqual(['missing-after']);
    expect(validation.summary.failedGateKeys).toEqual(['runtime_p95_wall']);
    expect(validation.summary.recommendation).toBe('keep_as_is');
  });
});

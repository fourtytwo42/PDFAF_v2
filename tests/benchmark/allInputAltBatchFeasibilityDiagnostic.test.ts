import { describe, expect, it } from 'vitest';
import {
  buildAltBatchFeasibilityDiagnostic,
  type AltBatchSecondPassEvidence,
} from '../../scripts/all-input-alt-batch-feasibility-diagnostic.js';
import type { AltObjectDiagnostic, AltObjectDiagnosticRow } from '../../scripts/all-input-alt-object-diagnostic.js';

function altRow(overrides: Partial<AltObjectDiagnosticRow> = {}): AltObjectDiagnosticRow {
  return {
    file: '0136-sample.pdf',
    runScore: 59,
    runGrade: 'F',
    score: 59,
    grade: 'F',
    altTextScore: 0,
    pdfUaScore: 57,
    tableMarkupScore: 72,
    checkerFigureCount: 102,
    checkerMissingAltCount: 102,
    rawReachableFigureCount: 102,
    rawReachableMissingAltCount: 102,
    nonFigureWithAltCount: 0,
    nestedFigureAltCount: 0,
    orphanedAltEmptyElementCount: 0,
    figureToolAttempts: [],
    classification: 'direct_checker_alt_candidate',
    recommendedNextAction: 'inspect',
    topMissingCheckerRefs: [],
    topRawMissingRefs: [],
    ...overrides,
  };
}

function diagnostic(rows: AltObjectDiagnosticRow[]): AltObjectDiagnostic {
  return {
    generatedAt: '2026-05-11T00:00:00.000Z',
    runDir: 'run',
    summary: {
      rowCount: rows.length,
      byClassification: {
        direct_checker_alt_candidate: rows.filter(row => row.classification === 'direct_checker_alt_candidate').length,
        role_visibility_or_ownership_gap: 0,
        alt_not_primary_blocker: rows.filter(row => row.classification === 'alt_not_primary_blocker').length,
        recovered_or_high: rows.filter(row => row.classification === 'recovered_or_high').length,
        protected_reanalysis_drift: rows.filter(row => row.classification === 'protected_reanalysis_drift').length,
        runtime_or_analysis_blocked: 0,
      },
      candidateFiles: [],
      recoveredFiles: [],
    },
    rows,
  };
}

function secondPass(overrides: Partial<AltBatchSecondPassEvidence> = {}): AltBatchSecondPassEvidence {
  return {
    scoreBefore: 36,
    scoreAfter: 80,
    gradeAfter: 'B',
    altTextAfter: 20,
    durationMs: 225_000,
    falsePositiveApplied: 0,
    figureAltApplications: 5,
    figureAltToolAttempts: 5,
    ...overrides,
  };
}

describe('all-input alt batch feasibility diagnostic', () => {
  it('selects direct high-volume missing-alt rows with clean second-pass movement', async () => {
    const report = await buildAltBatchFeasibilityDiagnostic({
      altDiagnostic: diagnostic([altRow()]),
      secondPassByFile: new Map([['0136-sample.pdf', secondPass()]]),
      generatedAt: 'fixed',
    });

    expect(report.summary.selectedCandidates).toEqual(['0136-sample.pdf']);
    expect(report.rows[0].classification).toBe('many_alt_batch_candidate');
    expect(report.rows[0].runtimeRisk).toBe('high');
    expect(report.rows[0].projections.map(item => [item.threshold, item.additionalNeeded])).toEqual([
      ['LOW', 2],
      ['MODERATE', 51],
      ['HIGH', 82],
      ['FULL', 102],
    ]);
  });

  it('blocks protected/analyzer drift even when direct alt debt is present', async () => {
    const report = await buildAltBatchFeasibilityDiagnostic({
      altDiagnostic: diagnostic([altRow({
        file: 'long-4683.pdf',
        runScore: 92,
        score: 59,
        checkerFigureCount: 5,
        checkerMissingAltCount: 5,
      })]),
      secondPassByFile: new Map([['long-4683.pdf', secondPass({ scoreAfter: 92, altTextAfter: 100 })]]),
    });

    expect(report.rows[0].classification).toBe('protected_drift_blocked');
  });

  it('treats current A-grade rows as controls', async () => {
    const report = await buildAltBatchFeasibilityDiagnostic({
      altDiagnostic: diagnostic([altRow({
        file: '0149.pdf',
        score: 94,
        grade: 'A',
        altTextScore: 100,
        checkerFigureCount: 19,
        checkerMissingAltCount: 0,
        classification: 'recovered_or_high',
      })]),
      secondPassByFile: new Map(),
    });

    expect(report.rows[0].classification).toBe('current_recovery_control');
  });

  it('does not select rows where alt is not the first blocker', async () => {
    const report = await buildAltBatchFeasibilityDiagnostic({
      altDiagnostic: diagnostic([altRow({
        file: '0200.pdf',
        score: 59,
        altTextScore: 100,
        checkerFigureCount: 2,
        checkerMissingAltCount: 0,
        classification: 'alt_not_primary_blocker',
      })]),
      secondPassByFile: new Map(),
    });

    expect(report.rows[0].classification).toBe('not_alt_first');
  });

  it('requires clean score and alt movement from second-pass evidence', async () => {
    const report = await buildAltBatchFeasibilityDiagnostic({
      altDiagnostic: diagnostic([altRow()]),
      secondPassByFile: new Map([['0136-sample.pdf', secondPass({ scoreAfter: 59, altTextAfter: 0 })]]),
    });

    expect(report.rows[0].classification).toBe('insufficient_second_pass_proof');
    expect(report.summary.selectedCandidates).toEqual([]);
  });
});

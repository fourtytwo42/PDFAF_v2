import { describe, expect, it } from 'vitest';
import {
  buildLowCheckpointTimeoutReport,
  parseRuntimeTimeoutTrace,
  type AllInputBaselineRow,
  type RuntimeTimeoutTrace,
} from '../../scripts/all-input-low-checkpoint-timeout-diagnostic.js';

function timeoutRow(file: string, beforeScore = 25): AllInputBaselineRow {
  return {
    file,
    beforeScore,
    beforeGrade: 'F',
    afterScore: 0,
    afterGrade: '?',
    durationMs: 300_000,
    falsePositiveApplied: 0,
    error: 'per_pdf_timeout_300000ms',
  };
}

function trace(input: {
  rowId?: string;
  file?: string;
  checkpoints?: Array<{
    reason?: string;
    score: number;
    eligible?: boolean;
    eligibilityReason?: string;
    appliedToolCount?: number;
    elapsedMs?: number;
  }>;
}): RuntimeTimeoutTrace {
  const rowId = input.rowId ?? 'row-a';
  return parseRuntimeTimeoutTrace({
    file: input.file ?? `${rowId}.pdf`,
    rowId,
    error: 'per_pdf_timeout_300000ms',
    elapsedMs: 300_000,
    lastVerifiedCheckpointEligibilityReason: input.checkpoints?.at(-1)?.eligibilityReason,
    verifiedCheckpointHistory: (input.checkpoints ?? []).map((checkpoint, index) => ({
      reason: checkpoint.reason ?? `stage_${index + 1}`,
      score: checkpoint.score,
      grade: checkpoint.score >= 90 ? 'A' : checkpoint.score >= 80 ? 'B' : checkpoint.score >= 70 ? 'C' : 'F',
      appliedToolCount: checkpoint.appliedToolCount ?? index + 1,
      eligible: checkpoint.eligible ?? false,
      eligibilityReason: checkpoint.eligibilityReason ?? `checkpoint_below_floor(${checkpoint.score}<85)`,
      returned: false,
      elapsedMs: checkpoint.elapsedMs ?? (index + 1) * 10_000,
    })),
  })!;
}

describe('all-input low checkpoint timeout diagnostic', () => {
  it('classifies below-floor useful checkpoints as needing safety replay', () => {
    const row = timeoutRow('row-a.pdf', 25);
    const report = buildLowCheckpointTimeoutReport({
      generatedAt: '2026-05-10T00:00:00.000Z',
      runDir: 'Output/run',
      rows: [row],
      traces: new Map([['row-a', trace({
        rowId: 'row-a',
        checkpoints: [
          { score: 25, eligibilityReason: 'checkpoint_below_floor(25<85)' },
          { score: 59, eligibilityReason: 'checkpoint_below_floor(59<85)' },
        ],
      })]]),
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'below_floor_needs_safety_replay',
      bestCheckpointScore: 59,
      projectedPointGainVsTimeout: 59,
    });
    expect(report.summary.projectedRecoverablePointsIfSafe).toBe(59);
  });

  it('keeps very low checkpoints parked instead of recommending behavior', () => {
    const report = buildLowCheckpointTimeoutReport({
      generatedAt: '2026-05-10T00:00:00.000Z',
      runDir: 'Output/run',
      rows: [timeoutRow('row-a.pdf', 25)],
      traces: new Map([['row-a', trace({
        rowId: 'row-a',
        checkpoints: [
          { score: 42, eligibilityReason: 'checkpoint_below_floor(42<85)' },
        ],
      })]]),
    });

    expect(report.rows[0].classification).toBe('low_checkpoint_too_poor');
    expect(report.summary.projectedRecoverablePointsIfSafe).toBe(0);
  });

  it('separates eligible checkpoint terminal bugs from floor-blocked candidates', () => {
    const report = buildLowCheckpointTimeoutReport({
      generatedAt: '2026-05-10T00:00:00.000Z',
      runDir: 'Output/run',
      rows: [timeoutRow('row-a.pdf', 25)],
      traces: new Map([['row-a', trace({
        rowId: 'row-a',
        checkpoints: [
          { score: 86, eligible: true, eligibilityReason: 'eligible' },
        ],
      })]]),
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'eligible_checkpoint_terminal_bug',
      bestCheckpointScore: 86,
    });
  });

  it('does not include non-timeout rows in timeout classifications', () => {
    const report = buildLowCheckpointTimeoutReport({
      generatedAt: '2026-05-10T00:00:00.000Z',
      runDir: 'Output/run',
      rows: [{
        file: 'row-a.pdf',
        beforeScore: 25,
        afterScore: 91,
        afterGrade: 'A',
        durationMs: 20_000,
        falsePositiveApplied: 0,
      }],
      traces: new Map(),
    });

    expect(report.summary.hardTimeoutRows).toBe(0);
    expect(report.rows).toHaveLength(0);
  });
});

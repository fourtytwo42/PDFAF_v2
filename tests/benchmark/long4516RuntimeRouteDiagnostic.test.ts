import { describe, expect, it } from 'vitest';
import {
  buildLong4516RuntimeRouteDiagnostic,
  type Long4516RunSummary,
  type Long4516TimeoutTraceSummary,
} from '../../scripts/long4516-runtime-route-diagnostic.js';

function run(input: Partial<Long4516RunSummary>): Long4516RunSummary {
  return {
    runDir: input.runDir ?? 'run',
    present: input.present ?? true,
    score: 'score' in input ? input.score ?? null : 92,
    grade: 'grade' in input ? input.grade ?? null : 'A',
    hardTimeout: input.hardTimeout ?? false,
    wallMs: input.wallMs ?? 1000,
    attemptCount: input.attemptCount ?? 2,
    metadataStage: input.metadataStage ?? {
      outcomes: [],
      allMetadataApplied: false,
      anyMetadataRejected: false,
      firstStateSignature: null,
      finalTitleLanguageScore: null,
    },
  };
}

function trace(input: Partial<Long4516TimeoutTraceSummary>): Long4516TimeoutTraceSummary {
  return {
    path: input.path ?? 'trace.json',
    present: input.present ?? true,
    elapsedMs: input.elapsedMs ?? 300000,
    lastPhase: input.lastPhase ?? 'verified_checkpoint',
    lastStageNumber: input.lastStageNumber ?? 9,
    lastToolName: input.lastToolName ?? 'mark_untagged_content_as_artifact',
    lastToolOutcome: input.lastToolOutcome ?? 'applied',
    lastVerifiedCheckpointScore: input.lastVerifiedCheckpointScore ?? 78,
    lastVerifiedCheckpointGrade: input.lastVerifiedCheckpointGrade ?? 'C',
    lastVerifiedCheckpointEligible: input.lastVerifiedCheckpointEligible ?? false,
    lastVerifiedCheckpointEligibilityReason: input.lastVerifiedCheckpointEligibilityReason ?? 'checkpoint_below_floor(78<80)',
    completedStageReanalysisMs: input.completedStageReanalysisMs ?? 117000,
    checkpointHistory: input.checkpointHistory ?? [],
  };
}

const appliedMetadata = {
  outcomes: [
    {
      toolName: 'set_document_language',
      outcome: 'applied',
      scoreBefore: 76,
      scoreAfter: 85,
      stateSignatureBefore: 'same',
      stateSignatureAfter: 'metadata',
      categoryScoresAfter: { title_language: 100 },
      rawReason: null,
    },
    {
      toolName: 'set_document_title',
      outcome: 'applied',
      scoreBefore: 76,
      scoreAfter: 85,
      stateSignatureBefore: 'same',
      stateSignatureAfter: 'metadata',
      categoryScoresAfter: { title_language: 100 },
      rawReason: null,
    },
  ],
  allMetadataApplied: true,
  anyMetadataRejected: false,
  firstStateSignature: 'same',
  finalTitleLanguageScore: 100,
};

const rejectedMetadata = {
  outcomes: [
    {
      toolName: 'set_document_language',
      outcome: 'rejected',
      scoreBefore: 76,
      scoreAfter: 76,
      stateSignatureBefore: 'same',
      stateSignatureAfter: 'bad',
      categoryScoresAfter: { title_language: 100, alt_text: 0 },
      rawReason: 'stage_regressed_score(51)',
    },
  ],
  allMetadataApplied: false,
  anyMetadataRejected: true,
  firstStateSignature: 'same',
  finalTitleLanguageScore: 100,
};

describe('long4516 runtime route diagnostic', () => {
  it('classifies same-state metadata apply/reject split as metadata acceptance volatility', () => {
    const report = buildLong4516RuntimeRouteDiagnostic({
      generatedAt: '2026-05-09T00:00:00.000Z',
      goodRun: run({ metadataStage: appliedMetadata }),
      lowRun: run({ score: 84, grade: 'B', metadataStage: rejectedMetadata }),
      timeoutRun: run({ hardTimeout: true, score: null, grade: null }),
      timeoutTrace: trace({ checkpointHistory: [{ reason: 'stage_9', score: 78, grade: 'C', eligible: false, eligibilityReason: 'checkpoint_below_floor(78<80)', elapsedMs: 163000 }] }),
    });

    expect(report.classification).toBe('metadata_acceptance_volatility');
    expect(report.evidence.sameInitialMetadataState).toBe(true);
    expect(report.evidence.timeoutCheckpointBelowFloor).toBe(true);
  });

  it('does not treat below-floor timeout checkpoint as a safe return candidate', () => {
    const report = buildLong4516RuntimeRouteDiagnostic({
      goodRun: run({ metadataStage: { ...appliedMetadata, firstStateSignature: 'good' } }),
      lowRun: run({ metadataStage: { ...rejectedMetadata, firstStateSignature: 'low' } }),
      timeoutRun: run({ hardTimeout: true, score: null, grade: null }),
      timeoutTrace: trace({ lastVerifiedCheckpointEligible: false }),
    });

    expect(report.classification).toBe('below_floor_timeout_no_safe_return');
    expect(report.recommendation).toContain('Do not lower the checkpoint floor');
  });

  it('classifies an eligible unreturned checkpoint separately', () => {
    const report = buildLong4516RuntimeRouteDiagnostic({
      goodRun: run({}),
      lowRun: run({ score: 84, grade: 'B' }),
      timeoutRun: run({ hardTimeout: true, score: null, grade: null }),
      timeoutTrace: trace({
        lastVerifiedCheckpointScore: 84,
        lastVerifiedCheckpointGrade: 'B',
        lastVerifiedCheckpointEligible: true,
        lastVerifiedCheckpointEligibilityReason: null,
      }),
    });

    expect(report.classification).toBe('safe_checkpoint_return_candidate');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildRuntimeTraceArtifact,
  mergeBenchmarkRuntimeSummaries,
  remediationBenchmarkInitialAnalysisOptions,
  shouldRunSecondDeterministicPass,
} from '../../scripts/baseline-corpus-batch.js';

describe('baseline corpus deterministic pass admission', () => {
  it('does not start a second pass for already A-grade rows below the global 95 target', () => {
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 93,
      hasBudget: true,
    })).toBe(false);
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 93,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(false);
  });

  it('still runs a second pass for below-A rows when budget remains', () => {
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 92,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(true);
  });

  it('does not run after checkpoint return, target reached, or budget exhaustion', () => {
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: true,
      score: 91,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(false);
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 95,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(false);
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 80,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: false,
    })).toBe(false);
  });

  it('uses the remediation analysis budget for benchmark remediation input analysis', () => {
    const controller = new AbortController();
    expect(remediationBenchmarkInitialAnalysisOptions({
      remediationAnalysisTimeoutMs: 45_000,
      signal: controller.signal,
    })).toEqual({
      timeoutMs: 45_000,
      signal: controller.signal,
      bypassCache: true,
    });
  });

  it('merges deterministic runtime summaries into one benchmark row summary', () => {
    const summary = mergeBenchmarkRuntimeSummaries({
      analysisBefore: {
        totalMs: 100,
        cacheHit: false,
        pdfjsMs: 20,
        structureMs: 70,
        mergeMs: 2,
        structuralAuditMs: 2,
        scoringMs: 4,
        classificationMs: 2,
        finalizeEvidenceMs: 0,
        scorerCategoryMs: {},
      },
      analysisAfter: {
        totalMs: 200,
        cacheHit: true,
        pdfjsMs: 0,
        structureMs: 0,
        mergeMs: 0,
        structuralAuditMs: 0,
        scoringMs: 0,
        classificationMs: 0,
        finalizeEvidenceMs: 0,
        scorerCategoryMs: {},
      },
      summaries: [
        {
          analysisBefore: null,
          analysisAfter: null,
          deterministicTotalMs: 1000,
          stageTimings: [{
            key: 'planner:stage1',
            stageNumber: 1,
            round: 1,
            source: 'planner',
            toolCount: 1,
            totalMs: 700,
            reanalyzeMs: 500,
          }],
          toolTimings: [{
            toolName: 'set_document_title',
            stage: 1,
            round: 1,
            source: 'planner',
            durationMs: 10,
            outcome: 'applied',
          }],
          liveAnalysisTimings: [{
            key: 'planner:stage1:figure_alt_target_reanalysis:set_figure_alt_text',
            context: 'figure_alt_target_reanalysis',
            stage: 1,
            round: 1,
            source: 'planner',
            toolName: 'set_figure_alt_text',
            targetRef: '10_0',
            durationMs: 300,
            scoreBefore: 80,
            scoreAfter: 82,
          }],
          semanticLaneTimings: [],
          boundedWork: {
            semanticCandidateCapsHit: 0,
            deterministicEarlyExitCount: 1,
            deterministicEarlyExitReasons: [{ key: 'soft_deadline_before_stage', count: 1 }],
            semanticSkipReasons: [],
            zeroHeadingLaneActivations: 0,
            headingConvergenceAttemptCount: 0,
            headingConvergenceSuccessCount: 0,
            headingConvergenceFailureCount: 0,
            headingConvergenceTimeoutCount: 0,
            structureConformanceTimeoutCount: 0,
          },
        },
        {
          analysisBefore: null,
          analysisAfter: null,
          deterministicTotalMs: 2000,
          stageTimings: [],
          toolTimings: [],
          liveAnalysisTimings: [],
          semanticLaneTimings: [],
          boundedWork: {
            semanticCandidateCapsHit: 0,
            deterministicEarlyExitCount: 2,
            deterministicEarlyExitReasons: [{ key: 'soft_deadline_before_stage', count: 2 }],
            semanticSkipReasons: [{ key: 'figure:no_llm_config', count: 1 }],
            zeroHeadingLaneActivations: 1,
            headingConvergenceAttemptCount: 2,
            headingConvergenceSuccessCount: 1,
            headingConvergenceFailureCount: 1,
            headingConvergenceTimeoutCount: 0,
            structureConformanceTimeoutCount: 0,
          },
        },
      ],
    });

    expect(summary?.deterministicTotalMs).toBe(3000);
    expect(summary?.analysisBefore?.totalMs).toBe(100);
    expect(summary?.analysisAfter?.totalMs).toBe(200);
    expect(summary?.stageTimings).toHaveLength(1);
    expect(summary?.toolTimings).toHaveLength(1);
    expect(summary?.liveAnalysisTimings).toHaveLength(1);
    expect(summary?.liveAnalysisTimings?.[0]?.durationMs).toBe(300);
    expect(summary?.boundedWork.deterministicEarlyExitCount).toBe(3);
    expect(summary?.boundedWork.deterministicEarlyExitReasons).toEqual([
      { key: 'soft_deadline_before_stage', count: 3 },
    ]);
    expect(summary?.boundedWork.semanticSkipReasons).toEqual([
      { key: 'figure:no_llm_config', count: 1 },
    ]);
    expect(summary?.boundedWork.zeroHeadingLaneActivations).toBe(1);
    expect(summary?.boundedWork.headingConvergenceAttemptCount).toBe(2);
  });

  it('builds compact runtime trace artifacts for completed checkpoint-return rows', () => {
    const artifact = buildRuntimeTraceArtifact({
      outRoot: '/out',
      base: '4683-report',
      file: '4683-report.pdf',
      error: undefined,
      durationMs: 231_000,
      events: [
        {
          kind: 'tool_finish',
          round: 1,
          stageNumber: 4,
          toolName: 'normalize_table_structure',
          outcome: 'applied',
          durationMs: 200,
          stateSignatureBefore: 'abc',
          elapsedMs: 100_000,
        },
        {
          kind: 'live_analysis_finish',
          round: 1,
          stageNumber: 4,
          context: 'figure_alt_target_reanalysis',
          toolName: 'set_figure_alt_text',
          targetRef: '12_0',
          durationMs: 1250,
          scoreBefore: 59,
          scoreAfter: 59,
          gradeAfter: 'F',
          elapsedMs: 122_000,
        },
        {
          kind: 'verified_checkpoint',
          reason: 'stage_4',
          score: 59,
          grade: 'F',
          appliedToolCount: 8,
          eligible: false,
          eligibilityReason: 'checkpoint_below_floor(59<85)',
          elapsedMs: 120_000,
        },
        {
          kind: 'verified_checkpoint',
          reason: 'return:before_final_reanalysis_low_score',
          score: 59,
          grade: 'F',
          appliedToolCount: 8,
          eligible: true,
          eligibilityReason: 'low_score_timeout_checkpoint_eligible',
          returned: true,
          elapsedMs: 205_000,
        },
      ],
    });

    expect(artifact.lastVerifiedCheckpointReturned).toBe(true);
    expect(artifact.lastVerifiedCheckpointEligibilityReason).toBe('low_score_timeout_checkpoint_eligible');
    expect(artifact.verifiedCheckpointHistory).toHaveLength(2);
    expect(artifact.liveAnalysisSummary).toMatchObject({
      count: 1,
      totalMs: 1250,
      byContext: [{ key: 'figure_alt_target_reanalysis', count: 1, totalMs: 1250 }],
    });
    expect(artifact.recentEvents).toHaveLength(4);
  });
});

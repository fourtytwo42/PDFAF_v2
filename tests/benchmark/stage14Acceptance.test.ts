import { describe, expect, it } from 'vitest';
import {
  buildStage14AcceptanceAudit,
  renderStage14AcceptanceMarkdown,
} from '../../src/services/benchmark/stage14Acceptance.js';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { Stage13FinalGateAudit } from '../../src/services/benchmark/stage13FinalGate.js';

function makeComparison(): BenchmarkComparison {
  return {
    beforeRunId: 'run-stage12-full',
    afterRunId: 'run-stage14-full',
    generatedAt: '2026-04-19T00:00:00.000Z',
    analyze: {
      scoreMeanDelta: 0,
      scoreMedianDelta: 0,
      scoreP95Delta: 0,
      runtimeMedianDeltaMs: 0,
      runtimeP95DeltaMs: 0,
      manualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    remediate: {
      beforeMeanDelta: 0,
      afterMeanDelta: 2,
      reanalyzedMeanDelta: 2,
      deltaMeanDelta: 2,
      wallMedianDeltaMs: -100,
      wallP95DeltaMs: -50,
      totalMedianDeltaMs: -100,
      totalP95DeltaMs: -50,
      beforeManualReviewRequiredDelta: 0,
      afterManualReviewRequiredDelta: 0,
      reanalyzedManualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
      stageRuntimeMedianDeltaMs: [],
      toolRuntimeMedianDeltaMs: [],
      semanticLaneRuntimeMedianDeltaMs: [],
      costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 },
    },
    cohorts: {
      '00-fixtures': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0, costBenefitDelta: { scoreDeltaPerSecond: 0, confidenceDeltaPerSecond: 0 } },
      '10-short-near-pass': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 3, remediationRuntimeMedianDeltaMs: -10, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
      '20-figure-ownership': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 2, remediationRuntimeMedianDeltaMs: -10, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
      '30-structure-reading-order': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 4, remediationRuntimeMedianDeltaMs: -10, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
      '40-font-extractability': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 1, remediationRuntimeMedianDeltaMs: -10, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
      '50-long-report-mixed': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 2, remediationRuntimeMedianDeltaMs: -10, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
    },
  };
}

function makeRow(input: {
  id: string;
  file: string;
  cohort: RemediateBenchmarkRow['cohort'];
  score: number;
  grade: string;
  pdfUa?: number;
  heading?: number;
  reading?: number;
  extract?: number;
  alt?: number;
}): RemediateBenchmarkRow {
  const category = (key: string, score: number) => ({
    key,
    score,
    weight: 1,
    applicable: true,
    severity: score >= 90 ? 'pass' : 'moderate',
    findings: [],
    verificationLevel: 'verified' as const,
  });
  return {
    id: input.id,
    file: input.file,
    cohort: input.cohort,
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: input.score,
    beforeGrade: input.grade as never,
    beforePdfClass: 'native_untagged',
    afterScore: input.score,
    afterGrade: input.grade as never,
    afterPdfClass: 'native_untagged',
    reanalyzedScore: input.score,
    reanalyzedGrade: input.grade as never,
    reanalyzedPdfClass: 'native_untagged',
    afterCategories: [
      category('pdf_ua_compliance', input.pdfUa ?? 83),
      category('heading_structure', input.heading ?? 92),
      category('reading_order', input.reading ?? 92),
      category('text_extractability', input.extract ?? 96),
      category('alt_text', input.alt ?? 100),
    ] as never,
    reanalyzedCategories: [
      category('pdf_ua_compliance', input.pdfUa ?? 83),
      category('heading_structure', input.heading ?? 92),
      category('reading_order', input.reading ?? 92),
      category('text_extractability', input.extract ?? 96),
      category('alt_text', input.alt ?? 100),
    ] as never,
    afterVerificationLevel: 'verified',
    reanalyzedVerificationLevel: 'verified',
    delta: 0,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 10,
    remediationDurationMs: 100,
    wallRemediateMs: 100,
    analysisAfterMs: 20,
    totalPipelineMs: 120,
  };
}

function makeStage13Gate(): Stage13FinalGateAudit {
  const files = Array.from({ length: 20 }, (_, index) => ({
    id: index === 0 ? 'structure-4108' : index === 1 ? 'long-4146' : index === 2 ? 'long-4606' : `doc-${index + 1}`,
    file: `file-${index + 1}.pdf`,
    cohort: (index % 2 === 0 ? '30-structure-reading-order' : '50-long-report-mixed') as const,
    disposition: 'honest_bounded_manual_review' as const,
    stage8Score: 50,
    finalScore: 88,
    scoreDelta: 0,
    stage8Grade: 'B',
    finalGrade: 'B',
    finalOutcomeStatus: 'needs_manual_review',
  }));
  return {
    generatedAt: '2026-04-19T00:00:00.000Z',
    stage8RunDir: '',
    stage12RunDir: '',
    comparisonVsStage8Dir: '',
    comparisonVsStage0Dir: '',
    stage8RunId: 'baseline',
    stage12RunId: 'final',
    finalGatePassed: true,
    thresholds: {
      stage8UnsafeToAutofixCount: 18,
      minReanalyzedMeanDeltaVsStage8: -0.5,
      maxWallMedianRegressionMs: 5000,
    },
    summary: {
      totalFiles: 50,
      reached100Count: 0,
      reachedACount: 30,
      materiallyImprovedCount: 0,
      honestBoundedManualReviewCount: 20,
      honestBoundedUnsafeToAutofixCount: 0,
      notMateriallyImprovedCount: 0,
      acceptedConfidenceRegressionCount: 0,
      semanticOnlyTrustedPassCount: 0,
      stage8AnalyzeMedianMs: 0,
      finalAnalyzeMedianMs: 0,
      stage8AnalyzeP95Ms: 0,
      finalAnalyzeP95Ms: 0,
      stage8RemediateMedianMs: 0,
      finalRemediateMedianMs: 0,
      stage8RemediateP95Ms: 0,
      finalRemediateP95Ms: 0,
      remediateWallMedianDeltaVsStage8Ms: 0,
      remediateWallP95DeltaVsStage8Ms: 0,
      remediateWallMedianDeltaVsStage0Ms: 0,
      reanalyzedMeanDeltaVsStage8: 0,
      reanalyzedMeanDeltaVsStage0: 0,
      dispositionFrequency: [],
    },
    cohorts: {
      '00-fixtures': { fileCount: 0, analyzeMeanDelta: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '10-short-near-pass': { fileCount: 0, analyzeMeanDelta: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '20-figure-ownership': { fileCount: 0, analyzeMeanDelta: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '30-structure-reading-order': { fileCount: 10, analyzeMeanDelta: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '40-font-extractability': { fileCount: 0, analyzeMeanDelta: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '50-long-report-mixed': { fileCount: 10, analyzeMeanDelta: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
    },
    gates: [],
    files,
    topImprovedFiles: [],
    topRemainingBoundedFiles: [],
    topSlowestFinalFiles: [],
    comparisonVsStage8: makeComparison(),
    comparisonVsStage0: makeComparison(),
  };
}

describe('stage14 acceptance audit', () => {
  it('reports target recovery, near-pass satisfaction, and runtime gates', () => {
    const stage13Gate = makeStage13Gate();
    const baselineRows = stage13Gate.files.map(file => makeRow({
      id: file.id,
      file: file.file,
      cohort: file.cohort,
      score: file.finalScore ?? 88,
      grade: file.finalGrade ?? 'B',
      pdfUa: file.id.startsWith('long') || file.id === 'structure-4108' ? 83 : 40,
      heading: file.id.startsWith('long') || file.id === 'structure-4108' ? 92 : 0,
      reading: file.id.startsWith('long') || file.id === 'structure-4108' ? 92 : 30,
      extract: 96,
      alt: file.id.startsWith('long') || file.id === 'structure-4108' ? 50 : 100,
    }));
    const stage14Rows = stage13Gate.files.map((file, index) => makeRow({
      id: file.id,
      file: file.file,
      cohort: file.cohort,
      score: index < 12 ? 92 : 88,
      grade: index < 12 ? 'A' : 'B',
      pdfUa: index < 12 ? 92 : 83,
      heading: index < 12 ? 96 : 92,
      reading: index < 12 ? 96 : 92,
      extract: 96,
      alt: file.id.startsWith('long') || file.id === 'structure-4108' ? (index < 12 ? 92 : 88) : 100,
    }));

    const audit = buildStage14AcceptanceAudit({
      baselineRunDir: 'Output/experiment-corpus-baseline/run-stage12-full',
      stage14RunDir: 'Output/experiment-corpus-baseline/run-stage14-full',
      comparisonDir: 'Output/experiment-corpus-baseline/comparison-stage14-full-vs-stage12',
      stage13GateDir: 'Output/experiment-corpus-baseline/stage13-final-speed-and-score-gate',
      baselineRemediateResults: baselineRows,
      stage14RemediateResults: stage14Rows,
      stage13Gate,
      comparison: makeComparison(),
    });

    expect(audit.summary.targetFileCount).toBe(20);
    expect(audit.summary.targetReachedACount).toBe(12);
    expect(audit.summary.nearPassSatisfiedCount).toBe(3);
    expect(audit.stage14Passed).toBe(true);
    const markdown = renderStage14AcceptanceMarkdown(audit);
    expect(markdown).toContain('# Stage 14 acceptance audit');
    expect(markdown).toContain('Acceptance: PASS');
  });
});

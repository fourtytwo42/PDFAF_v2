import { describe, expect, it } from 'vitest';
import {
  buildStage141AcceptanceAudit,
  renderStage141AcceptanceMarkdown,
} from '../../src/services/benchmark/stage141Acceptance.js';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { Stage14AcceptanceAudit } from '../../src/services/benchmark/stage14Acceptance.js';

function makeComparison(): BenchmarkComparison {
  return {
    beforeRunId: 'run-stage14-full',
    afterRunId: 'run-stage14.1-full',
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
      afterMeanDelta: 3,
      reanalyzedMeanDelta: 3,
      deltaMeanDelta: 3,
      wallMedianDeltaMs: -25,
      wallP95DeltaMs: -10,
      totalMedianDeltaMs: -30,
      totalP95DeltaMs: -15,
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
      '10-short-near-pass': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 2, remediationRuntimeMedianDeltaMs: -5, costBenefitDelta: { scoreDeltaPerSecond: 0.4, confidenceDeltaPerSecond: 0.1 } },
      '20-figure-ownership': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 3, remediationRuntimeMedianDeltaMs: -5, costBenefitDelta: { scoreDeltaPerSecond: 0.4, confidenceDeltaPerSecond: 0.1 } },
      '30-structure-reading-order': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 6, remediationRuntimeMedianDeltaMs: -10, costBenefitDelta: { scoreDeltaPerSecond: 0.7, confidenceDeltaPerSecond: 0.1 } },
      '40-font-extractability': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 11, remediationRuntimeMedianDeltaMs: -8, costBenefitDelta: { scoreDeltaPerSecond: 1.1, confidenceDeltaPerSecond: 0.1 } },
      '50-long-report-mixed': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 3, remediationRuntimeMedianDeltaMs: -4, costBenefitDelta: { scoreDeltaPerSecond: 0.4, confidenceDeltaPerSecond: 0.1 } },
    },
  };
}

function makeRow(input: {
  id: string;
  file: string;
  cohort: RemediateBenchmarkRow['cohort'];
  score: number;
  grade: string;
  route?: string;
  wallMs?: number;
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
    planningSummary: {
      primaryRoute: (input.route ?? 'structure_bootstrap_and_conformance') as never,
      secondaryRoutes: [],
      triggeringSignals: [],
      residualFamilies: [],
      scheduledTools: [],
      skippedTools: [],
      semanticDeferred: false,
    },
    delta: 0,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 10,
    remediationDurationMs: 100,
    wallRemediateMs: input.wallMs ?? 100,
    analysisAfterMs: 20,
    totalPipelineMs: 120,
  };
}

function makeStage14Acceptance(): Stage14AcceptanceAudit {
  const targetFiles = [
    { id: 'structure-4108', file: '4108.pdf', cohort: '30-structure-reading-order' as const, stage13Score: 89, stage14Score: 89, stage13Grade: 'B', stage14Grade: 'B', scoreDelta: 0 },
    { id: 'long-4146', file: '4146.pdf', cohort: '50-long-report-mixed' as const, stage13Score: 89, stage14Score: 91, stage13Grade: 'B', stage14Grade: 'A', scoreDelta: 2 },
    { id: 'long-4606', file: '4606.pdf', cohort: '50-long-report-mixed' as const, stage13Score: 88, stage14Score: 88, stage13Grade: 'B', stage14Grade: 'B', scoreDelta: 0 },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `structure-${i}`, file: `s-${i}.pdf`, cohort: '30-structure-reading-order' as const, stage13Score: 42, stage14Score: 42, stage13Grade: 'F', stage14Grade: 'F', scoreDelta: 0 })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `font-${i}`, file: `f-${i}.pdf`, cohort: '40-font-extractability' as const, stage13Score: 55, stage14Score: 55, stage13Grade: 'F', stage14Grade: 'F', scoreDelta: 0 })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `other-${i}`, file: `o-${i}.pdf`, cohort: '10-short-near-pass' as const, stage13Score: 33, stage14Score: 33, stage13Grade: 'F', stage14Grade: 'F', scoreDelta: 0 })),
  ];
  return {
    generatedAt: '2026-04-19T00:00:00.000Z',
    baselineRunDir: 'run-stage12-full',
    stage14RunDir: 'run-stage14-full',
    comparisonDir: 'comparison-stage14',
    stage13GateDir: 'stage13-gate',
    stage14Passed: false,
    summary: {
      targetFileCount: 20,
      totalNonACountBefore: 20,
      totalNonACountAfter: 20,
      targetReachedACount: 1,
      targetStillNonACount: 19,
      nearPassSatisfiedCount: 1,
      acceptedConfidenceRegressionCount: 0,
      semanticOnlyTrustedPassCount: 0,
      remediateWallMedianDeltaMs: 523.74,
      remediateWallP95DeltaMs: -103.7,
      scoreGainPerAddedSecond: 3.2,
      dispositionFrequency: [],
    },
    gates: [],
    cohorts: {
      '00-fixtures': { fileCount: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '10-short-near-pass': { fileCount: 4, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '20-figure-ownership': { fileCount: 0, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '30-structure-reading-order': { fileCount: 9, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '40-font-extractability': { fileCount: 5, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
      '50-long-report-mixed': { fileCount: 2, remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0 },
    },
    targetFiles,
    categoryDeltas: [],
    topSlowestFiles: [],
    comparison: makeComparison(),
  };
}

describe('stage14.1 acceptance audit', () => {
  it('reports survivor movement, near-pass satisfaction, and route efficiency', () => {
    const stage14Acceptance = makeStage14Acceptance();
    const baselineRows = stage14Acceptance.targetFiles.map(file => makeRow({
      id: file.id,
      file: file.file,
      cohort: file.cohort,
      score: file.stage14Score ?? 55,
      grade: file.stage14Grade ?? 'F',
      route: file.cohort === '40-font-extractability' ? 'font_unicode_tail_recovery' : 'structure_bootstrap_and_conformance',
      wallMs: 100,
      pdfUa: file.cohort === '30-structure-reading-order' ? 40 : 83,
      heading: file.cohort === '30-structure-reading-order' ? 40 : 92,
      reading: file.cohort === '30-structure-reading-order' ? 40 : 92,
      extract: file.cohort === '40-font-extractability' ? 55 : 96,
      alt: file.id === 'structure-4108' || file.id === 'long-4606' ? 50 : 100,
    }));
    const stage141Rows = stage14Acceptance.targetFiles.map((file, index) => {
      const structureBoost = file.cohort === '30-structure-reading-order' ? 7 : 0;
      const fontBoost = file.cohort === '40-font-extractability' ? 12 : 0;
      const nearPassBoost = file.id === 'structure-4108' ? 2 : file.id === 'long-4606' ? 3 : 0;
      const promotionBoost =
        file.id === 'structure-0' || file.id === 'structure-1' || file.id === 'structure-2'
          ? 41
          : file.id === 'font-0' || file.id === 'font-1' || file.id === 'font-2'
            ? 23
            : index < 2
              ? 3
              : 0;
      const score = (file.stage14Score ?? 55) + structureBoost + fontBoost + nearPassBoost + promotionBoost;
      return makeRow({
        id: file.id,
        file: file.file,
        cohort: file.cohort,
        score,
        grade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
        route: file.cohort === '40-font-extractability' ? 'font_unicode_tail_recovery' : file.id.startsWith('long-') || file.id === 'structure-4108' ? 'near_pass_figure_recovery' : 'post_bootstrap_heading_convergence',
        wallMs: 90,
        pdfUa: file.cohort === '30-structure-reading-order' ? 92 : 83,
        heading: file.cohort === '30-structure-reading-order' ? 92 : 92,
        reading: file.cohort === '30-structure-reading-order' ? 92 : 92,
        extract: file.cohort === '40-font-extractability' ? 92 : 96,
        alt: file.id === 'structure-4108' || file.id === 'long-4606' || file.id === 'long-4146' ? 92 : 100,
      });
    });

    const audit = buildStage141AcceptanceAudit({
      baselineRunDir: 'Output/experiment-corpus-baseline/run-stage14-full',
      stage141RunDir: 'Output/experiment-corpus-baseline/run-stage14.1-full',
      comparisonDir: 'Output/experiment-corpus-baseline/comparison-stage14.1-full-vs-stage14',
      stage14AcceptanceDir: 'Output/experiment-corpus-baseline/stage14-acceptance',
      baselineRemediateResults: baselineRows,
      stage141RemediateResults: stage141Rows,
      stage14Acceptance,
      comparison: makeComparison(),
    });

    expect(audit.summary.targetFileCount).toBe(20);
    expect(audit.summary.targetReachedACount).toBeGreaterThanOrEqual(6);
    expect(audit.summary.nearPassSatisfiedCount).toBeGreaterThanOrEqual(2);
    expect(audit.summary.structureSurvivorImprovedCount).toBeGreaterThanOrEqual(8);
    expect(audit.summary.fontSurvivorImprovedCount).toBeGreaterThanOrEqual(3);
    expect(audit.routeEfficiency.length).toBeGreaterThan(0);
    expect(audit.stage141Passed).toBe(true);
    const markdown = renderStage141AcceptanceMarkdown(audit);
    expect(markdown).toContain('# Stage 14.1 acceptance audit');
    expect(markdown).toContain('Route Efficiency');
  });
});

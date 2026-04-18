import { describe, expect, it } from 'vitest';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type {
  AnalyzeBenchmarkRow,
  RemediateBenchmarkRow,
} from '../../src/services/benchmark/experimentCorpus.js';
import {
  buildStage3AcceptanceAudit,
  renderStage3AcceptanceMarkdown,
} from '../../src/services/benchmark/stage3Acceptance.js';
import type { DetectionProfile, ScoredCategory } from '../../src/types.js';

function category(key: ScoredCategory['key'], score: number): ScoredCategory {
  return {
    key,
    score,
    weight: 1,
    applicable: true,
    severity: score >= 90 ? 'pass' : 'moderate',
    findings: [],
  };
}

function detectionProfile(overrides: Partial<DetectionProfile> = {}): DetectionProfile {
  return {
    readingOrderSignals: {
      missingStructureTree: false,
      annotationOrderRiskCount: 0,
      annotationStructParentRiskCount: 0,
      headerFooterPollutionRisk: false,
      sampledStructurePageOrderDriftCount: 0,
      multiColumnOrderRiskPages: 0,
      suspiciousPageCount: 2,
    },
    pdfUaSignals: {
      orphanMcidCount: 0,
      suspectedPathPaintOutsideMc: 0,
      taggedAnnotationRiskCount: 0,
    },
    annotationSignals: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingStructure: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
    },
    listSignals: {
      listItemMisplacedCount: 0,
      lblBodyMisplacedCount: 0,
      listsWithoutItems: 0,
    },
    tableSignals: {
      tablesWithMisplacedCells: 0,
      misplacedCellCount: 0,
      irregularTableCount: 0,
      stronglyIrregularTableCount: 0,
      directCellUnderTableCount: 0,
    },
    sampledPages: [0, 1],
    confidence: 'high',
    ...overrides,
  };
}

function analyzeRow(input: {
  id: string;
  cohort: AnalyzeBenchmarkRow['cohort'];
  profile: DetectionProfile;
  readingOrderScore: number;
  pdfUaScore?: number;
  tableScore?: number;
}): AnalyzeBenchmarkRow {
  return {
    id: input.id,
    file: `${input.cohort}/${input.id}.pdf`,
    cohort: input.cohort,
    sourceType: 'fixture',
    intent: 'test',
    score: 80,
    grade: 'B',
    pdfClass: 'native_tagged',
    pageCount: 5,
    categories: [
      category('reading_order', input.readingOrderScore),
      category('pdf_ua_compliance', input.pdfUaScore ?? 80),
      category('table_markup', input.tableScore ?? 100),
    ],
    findings: [],
    analysisDurationMs: 120,
    wallAnalyzeMs: 140,
    detectionProfile: input.profile,
  };
}

function remediateRow(input: {
  id: string;
  cohort: RemediateBenchmarkRow['cohort'];
  afterProfile?: DetectionProfile;
  reanalyzedProfile?: DetectionProfile;
  afterReadingOrderScore: number;
  reanalyzedReadingOrderScore?: number;
}): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: `${input.cohort}/${input.id}.pdf`,
    cohort: input.cohort,
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 80,
    beforeGrade: 'B',
    beforePdfClass: 'native_tagged',
    beforeCategories: [],
    beforeVerificationLevel: null,
    beforeManualReviewRequired: false,
    beforeManualReviewReasons: [],
    beforeScoreCapsApplied: [],
    beforeStructuralClassification: null,
    beforeFailureProfile: null,
    beforeDetectionProfile: null,
    afterScore: 92,
    afterGrade: 'A',
    afterPdfClass: 'native_tagged',
    afterCategories: [
      category('reading_order', input.afterReadingOrderScore),
      category('pdf_ua_compliance', 85),
      category('table_markup', 100),
    ],
    afterVerificationLevel: null,
    afterManualReviewRequired: false,
    afterManualReviewReasons: [],
    afterScoreCapsApplied: [],
    afterStructuralClassification: null,
    afterFailureProfile: null,
    afterDetectionProfile: input.afterProfile ?? null,
    reanalyzedScore: input.reanalyzedProfile ? 93 : null,
    reanalyzedGrade: input.reanalyzedProfile ? 'A' : null,
    reanalyzedPdfClass: input.reanalyzedProfile ? 'native_tagged' : null,
    reanalyzedCategories: input.reanalyzedProfile
      ? [
          category('reading_order', input.reanalyzedReadingOrderScore ?? input.afterReadingOrderScore),
          category('pdf_ua_compliance', 85),
          category('table_markup', 100),
        ]
      : [],
    reanalyzedVerificationLevel: null,
    reanalyzedManualReviewRequired: null,
    reanalyzedManualReviewReasons: [],
    reanalyzedScoreCapsApplied: [],
    reanalyzedStructuralClassification: null,
    reanalyzedFailureProfile: null,
    reanalyzedDetectionProfile: input.reanalyzedProfile ?? null,
    delta: 12,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 100,
    remediationDurationMs: 200,
    wallRemediateMs: 210,
    analysisAfterMs: 90,
    totalPipelineMs: 300,
  };
}

function comparison(): BenchmarkComparison {
  return {
    beforeRunId: 'before',
    afterRunId: 'after',
    generatedAt: '2026-04-18T00:00:00.000Z',
    analyze: {
      scoreMeanDelta: -0.5,
      scoreMedianDelta: 0,
      scoreP95Delta: -1,
      runtimeMedianDeltaMs: 4,
      runtimeP95DeltaMs: 30,
      manualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    remediate: {
      beforeMeanDelta: 0,
      afterMeanDelta: 0.2,
      reanalyzedMeanDelta: 0.1,
      deltaMeanDelta: 0.1,
      wallMedianDeltaMs: 10,
      wallP95DeltaMs: 100,
      totalMedianDeltaMs: 20,
      totalP95DeltaMs: 200,
      beforeManualReviewRequiredDelta: 0,
      afterManualReviewRequiredDelta: 0,
      reanalyzedManualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    cohorts: {},
  };
}

describe('stage3 acceptance audit', () => {
  it('detects meaningful false-clean pressure and cleared cases', () => {
    const pressured = detectionProfile({
      readingOrderSignals: {
        missingStructureTree: false,
        annotationOrderRiskCount: 4,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 10,
      },
    });
    const cleared = detectionProfile({
      tableSignals: {
        tablesWithMisplacedCells: 1,
        misplacedCellCount: 3,
        irregularTableCount: 1,
        stronglyIrregularTableCount: 1,
        directCellUnderTableCount: 3,
      },
    });

    const audit = buildStage3AcceptanceAudit({
      analyzeRunDir: 'analyze',
      fullRunDir: 'full',
      analyzeComparisonDir: 'analyze-compare',
      fullComparisonDir: 'full-compare',
      analyzeResults: [
        analyzeRow({
          id: 'meaningful',
          cohort: '20-figure-ownership',
          profile: pressured,
          readingOrderScore: 98,
        }),
        analyzeRow({
          id: 'cleared',
          cohort: '30-structure-reading-order',
          profile: cleared,
          readingOrderScore: 75,
          tableScore: 96,
        }),
      ],
      remediateResults: [
        remediateRow({
          id: 'meaningful',
          cohort: '20-figure-ownership',
          reanalyzedProfile: pressured,
          afterReadingOrderScore: 96,
          reanalyzedReadingOrderScore: 96,
        }),
        remediateRow({
          id: 'cleared',
          cohort: '30-structure-reading-order',
          reanalyzedProfile: detectionProfile(),
          afterReadingOrderScore: 80,
          reanalyzedReadingOrderScore: 80,
        }),
      ],
      analyzeComparison: comparison(),
      fullComparison: comparison(),
      generatedAt: '2026-04-18T00:00:00.000Z',
    });

    expect(audit.summary.analyzePressureCount).toBe(2);
    expect(audit.summary.analyzeMeaningfulPressureCount).toBe(2);
    expect(audit.summary.postRemediationPressureCount).toBe(1);
    expect(audit.summary.clearedByRemediationCount).toBe(1);
    expect(audit.summary.calibrationNeeded).toBe(true);
    expect(audit.summary.calibrationCandidates).toContain('meaningful');
    expect(audit.summary.calibrationCandidates).not.toContain('cleared');
  });

  it('renders markdown with calibration candidates and runtime deltas', () => {
    const audit = buildStage3AcceptanceAudit({
      analyzeRunDir: 'analyze',
      fullRunDir: 'full',
      analyzeComparisonDir: 'analyze-compare',
      fullComparisonDir: 'full-compare',
      analyzeResults: [
        analyzeRow({
          id: 'meaningful',
          cohort: '20-figure-ownership',
          profile: detectionProfile({
            readingOrderSignals: {
              missingStructureTree: false,
              annotationOrderRiskCount: 2,
              annotationStructParentRiskCount: 0,
              headerFooterPollutionRisk: false,
              sampledStructurePageOrderDriftCount: 0,
              multiColumnOrderRiskPages: 0,
              suspiciousPageCount: 4,
            },
          }),
          readingOrderScore: 95,
        }),
      ],
      remediateResults: [],
      analyzeComparison: comparison(),
      fullComparison: comparison(),
      generatedAt: '2026-04-18T00:00:00.000Z',
    });

    const markdown = renderStage3AcceptanceMarkdown(audit);
    expect(markdown).toContain('Stage 3 acceptance audit');
    expect(markdown).toContain('Calibration candidates');
    expect(markdown).toContain('meaningful');
    expect(markdown).toContain('Analyze runtime delta');
  });
});

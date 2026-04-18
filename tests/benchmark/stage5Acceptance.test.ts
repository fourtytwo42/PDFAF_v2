import { describe, expect, it } from 'vitest';
import { buildStage5AcceptanceAudit, renderStage5AcceptanceMarkdown } from '../../src/services/benchmark/stage5Acceptance.js';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function makeComparison(): BenchmarkComparison {
  return {
    beforeRunId: 'run-stage4-full',
    afterRunId: 'run-stage5-full',
    generatedAt: '2026-04-18T00:00:00.000Z',
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
      reanalyzedMeanDelta: 1.5,
      deltaMeanDelta: 2,
      wallMedianDeltaMs: -150,
      wallP95DeltaMs: 250,
      totalMedianDeltaMs: -100,
      totalP95DeltaMs: 300,
      beforeManualReviewRequiredDelta: 0,
      afterManualReviewRequiredDelta: 0,
      reanalyzedManualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    cohorts: {},
  };
}

function makeRow(id: string, cohort: RemediateBenchmarkRow['cohort']): RemediateBenchmarkRow {
  return {
    id,
    file: `${cohort}/${id}.pdf`,
    cohort,
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 80,
    beforeGrade: 'B',
    beforePdfClass: 'native_tagged',
    beforeCategories: [
      { key: 'table_markup', score: 50, weight: 1, applicable: true, severity: 'moderate', findings: [] },
      { key: 'heading_structure', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
    ],
    beforeStructuralClassification: {
      structureClass: 'native_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: false,
        hasTables: true,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low',
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'high',
    },
    beforeDetectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 0,
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
        irregularTableCount: 2,
        stronglyIrregularTableCount: 0,
        directCellUnderTableCount: 0,
      },
      sampledPages: [0],
      confidence: 'high',
    },
    afterScore: 86,
    afterGrade: 'B',
    afterPdfClass: 'native_tagged',
    afterCategories: [
      { key: 'table_markup', score: 92, weight: 1, applicable: true, severity: 'minor', findings: [] },
      { key: 'heading_structure', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
    ],
    afterStructuralClassification: {
      structureClass: 'native_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: false,
        hasTables: true,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low',
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'high',
    },
    afterDetectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 0,
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
      sampledPages: [0],
      confidence: 'high',
    },
    reanalyzedScore: 86,
    reanalyzedGrade: 'B',
    reanalyzedPdfClass: 'native_tagged',
    reanalyzedCategories: [
      { key: 'table_markup', score: 92, weight: 1, applicable: true, severity: 'minor', findings: [] },
      { key: 'heading_structure', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
    ],
    reanalyzedStructuralClassification: {
      structureClass: 'native_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: false,
        hasTables: true,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low',
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'high',
    },
    reanalyzedDetectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 0,
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
      sampledPages: [0],
      confidence: 'high',
    },
    planningSummary: {
      primaryRoute: 'native_structure_repair',
      secondaryRoutes: [],
      triggeringSignals: ['table_debt'],
      scheduledTools: ['repair_native_table_headers'],
      skippedTools: [],
      semanticDeferred: false,
    },
    remediationOutcomeSummary: {
      documentStatus: 'fixed',
      targetedFamilies: ['tables'],
      familySummaries: [
        {
          family: 'tables',
          targeted: true,
          status: 'fixed',
          beforeSignalCount: 3,
          afterSignalCount: 0,
          appliedTools: ['repair_native_table_headers'],
          skippedTools: [],
          residualSignals: [],
        },
      ],
    },
    delta: 6,
    appliedTools: [],
    rounds: [],
    structuralConfidenceGuard: {
      rollbackCount: 1,
      lastRollbackReason: 'stage_regressed_structural_confidence(high->medium)',
    },
    analysisBeforeMs: 10,
    remediationDurationMs: 100,
    wallRemediateMs: 105,
    analysisAfterMs: 12,
    totalPipelineMs: 117,
  };
}

describe('stage5 acceptance audit', () => {
  it('aggregates family deltas and outcome status distribution', () => {
    const audit = buildStage5AcceptanceAudit({
      stage4RunDir: 'Output/experiment-corpus-baseline/run-stage4-full',
      stage5RunDir: 'Output/experiment-corpus-baseline/run-stage5-full',
      comparisonDir: 'Output/experiment-corpus-baseline/comparison-stage5-full-vs-stage4',
      stage4RemediateResults: [makeRow('doc-1', '30-structure-reading-order')],
      stage5RemediateResults: [makeRow('doc-1', '30-structure-reading-order')],
      comparison: makeComparison(),
    });

    expect(audit.summary.stage5FileCount).toBe(1);
    expect(audit.summary.outcomeStatusDistribution.fixed).toBe(1);
    expect(audit.familyDeltas.tables.beforeTotal).toBeGreaterThan(audit.familyDeltas.tables.afterTotal);
    expect(audit.summary.confidenceRegressionRollbackCount).toBe(1);

    const markdown = renderStage5AcceptanceMarkdown(audit);
    expect(markdown).toContain('# Stage 5 acceptance audit');
    expect(markdown).toContain('Family Deltas');
    expect(markdown).toContain('Outcome status distribution');
  });
});

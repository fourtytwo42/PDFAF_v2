import { describe, expect, it } from 'vitest';
import { buildStage4AcceptanceAudit, renderStage4AcceptanceMarkdown } from '../../src/services/benchmark/stage4Acceptance.js';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function makeComparison(): BenchmarkComparison {
  return {
    beforeRunId: 'run-stage3-full',
    afterRunId: 'run-stage4-full',
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
      afterMeanDelta: 1.5,
      reanalyzedMeanDelta: 1.2,
      deltaMeanDelta: 1.5,
      wallMedianDeltaMs: -120,
      wallP95DeltaMs: 80,
      totalMedianDeltaMs: -90,
      totalP95DeltaMs: 110,
      beforeManualReviewRequiredDelta: 0,
      afterManualReviewRequiredDelta: 0,
      reanalyzedManualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    cohorts: {},
  };
}

function makeStage3Row(id: string, cohort: RemediateBenchmarkRow['cohort']): RemediateBenchmarkRow {
  return {
    id,
    file: `${cohort}/${id}.pdf`,
    cohort,
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 86,
    beforeGrade: 'B',
    beforePdfClass: 'native_tagged',
    afterScore: 92,
    afterGrade: 'A',
    afterPdfClass: 'native_tagged',
    afterCategories: [
      { key: 'reading_order', score: 94, weight: 1, applicable: true, severity: 'minor', findings: [] },
      { key: 'pdf_ua_compliance', score: 95, weight: 1, applicable: true, severity: 'minor', findings: [] },
      { key: 'table_markup', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
    ],
    afterDetectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        annotationOrderRiskCount: 1,
        annotationStructParentRiskCount: 1,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 1,
      },
      pdfUaSignals: {
        orphanMcidCount: 1,
        suspectedPathPaintOutsideMc: 3,
        taggedAnnotationRiskCount: 1,
      },
      annotationSignals: {
        pagesMissingTabsS: 1,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 1,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 1,
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
    reanalyzedScore: 92,
    reanalyzedGrade: 'A',
    reanalyzedPdfClass: 'native_tagged',
    reanalyzedCategories: [
      { key: 'reading_order', score: 94, weight: 1, applicable: true, severity: 'minor', findings: [] },
      { key: 'pdf_ua_compliance', score: 95, weight: 1, applicable: true, severity: 'minor', findings: [] },
      { key: 'table_markup', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
    ],
    reanalyzedDetectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        annotationOrderRiskCount: 1,
        annotationStructParentRiskCount: 1,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 1,
      },
      pdfUaSignals: {
        orphanMcidCount: 1,
        suspectedPathPaintOutsideMc: 3,
        taggedAnnotationRiskCount: 1,
      },
      annotationSignals: {
        pagesMissingTabsS: 1,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 1,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 1,
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
    delta: 6,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 10,
    remediationDurationMs: 100,
    wallRemediateMs: 110,
    analysisAfterMs: 11,
    totalPipelineMs: 121,
  };
}

function makeStage4Row(
  id: string,
  cohort: RemediateBenchmarkRow['cohort'],
  primaryRoute: NonNullable<RemediateBenchmarkRow['planningSummary']>['primaryRoute'],
): RemediateBenchmarkRow {
  return {
    ...makeStage3Row(id, cohort),
    planningSummary: {
      primaryRoute,
      secondaryRoutes: primaryRoute === 'metadata_foundation' ? [] : ['annotation_link_normalization'],
      triggeringSignals:
        primaryRoute === 'metadata_foundation'
          ? ['title_language_debt']
          : ['missing_structure_tree', 'annotation_debt'],
      scheduledTools:
        primaryRoute === 'metadata_foundation'
          ? ['set_document_title', 'set_document_language']
          : ['bootstrap_struct_tree', 'normalize_annotation_tab_order'],
      skippedTools:
        primaryRoute === 'metadata_foundation'
          ? [{ toolName: 'bootstrap_struct_tree', reason: 'route_not_active' }]
          : [{ toolName: 'set_figure_alt_text', reason: 'semantic_deferred' }],
      semanticDeferred: primaryRoute !== 'metadata_foundation',
    },
  };
}

describe('stage4 acceptance audit', () => {
  it('builds routing acceptance metrics from stage3 and stage4 runs', () => {
    const audit = buildStage4AcceptanceAudit({
      stage3RunDir: 'Output/experiment-corpus-baseline/run-stage3-full',
      stage4RunDir: 'Output/experiment-corpus-baseline/run-stage4-full',
      comparisonDir: 'Output/experiment-corpus-baseline/comparison-stage4-full-vs-stage3',
      stage3RemediateResults: [
        makeStage3Row('doc-1', '30-structure-reading-order'),
        makeStage3Row('doc-2', '10-short-near-pass'),
      ],
      stage4RemediateResults: [
        makeStage4Row('doc-1', '30-structure-reading-order', 'structure_bootstrap'),
        makeStage4Row('doc-2', '10-short-near-pass', 'metadata_foundation'),
      ],
      comparison: makeComparison(),
    });

    expect(audit.summary.stage4FileCount).toBe(2);
    expect(audit.summary.routeDistribution.metadata_foundation).toBe(1);
    expect(audit.summary.routeDistribution.structure_bootstrap).toBe(1);
    expect(audit.summary.stage3SurvivorCount).toBe(2);
    expect(audit.summary.stage3SurvivorsWithSpecificRoutes).toBe(1);
    expect(audit.summary.nearPassCount).toBe(2);
    expect(audit.summary.nearPassAvoidedCount).toBe(1);
    expect(audit.cohorts['10-short-near-pass']?.nearPassAvoidedCount).toBe(1);
    expect(audit.stage3SurvivorRoutes[0]?.primaryRoute).toBeDefined();

    const markdown = renderStage4AcceptanceMarkdown(audit);
    expect(markdown).toContain('# Stage 4 acceptance audit');
    expect(markdown).toContain('Route Distribution');
    expect(markdown).toContain('Stage 3 Survivor Routes');
    expect(markdown).toContain('Near-Pass Routing');
  });
});

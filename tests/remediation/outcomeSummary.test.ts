import { describe, expect, it } from 'vitest';
import { buildRemediationOutcomeSummary } from '../../src/services/remediation/outcomeSummary.js';
import type { AnalysisResult, AppliedRemediationTool } from '../../src/types.js';

function makeAnalysis(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    id: 'doc',
    timestamp: '2026-04-18T00:00:00.000Z',
    filename: 'doc.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: 80,
    grade: 'B',
    analysisDurationMs: 1,
    categories: [
      { key: 'pdf_ua_compliance', score: 70, weight: 1, applicable: true, severity: 'moderate', findings: [] },
      { key: 'table_markup', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
      { key: 'link_quality', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
      { key: 'reading_order', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
      { key: 'heading_structure', score: 100, weight: 1, applicable: true, severity: 'pass', findings: [] },
    ],
    findings: [],
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    structuralClassification: {
      structureClass: 'native_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: false,
        hasTables: false,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: true,
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
    failureProfile: {
      deterministicIssues: [],
      semanticIssues: [],
      manualOnlyIssues: [],
      primaryFailureFamily: 'mixed_structural',
      secondaryFailureFamilies: [],
      routingHints: [],
    },
    detectionProfile: {
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
    ...overrides,
  };
}

describe('buildRemediationOutcomeSummary', () => {
  it('marks a targeted family fixed when residual signals are cleared', () => {
    const before = makeAnalysis({
      detectionProfile: {
        ...makeAnalysis().detectionProfile!,
        listSignals: {
          listItemMisplacedCount: 2,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
      },
    });
    const after = makeAnalysis();
    const appliedTools: AppliedRemediationTool[] = [
      {
        toolName: 'repair_list_li_wrong_parent',
        stage: 4,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 84,
        delta: 4,
        outcome: 'applied',
      },
    ];

    const summary = buildRemediationOutcomeSummary({ before, after, appliedTools });
    expect(summary?.documentStatus).toBe('fixed');
    expect(summary?.familySummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: 'lists',
          status: 'fixed',
          beforeSignalCount: 2,
          afterSignalCount: 0,
        }),
      ]),
    );
  });

  it('marks residual debt unsafe_to_autofix when the family was withheld by preconditions', () => {
    const before = makeAnalysis({
      detectionProfile: {
        ...makeAnalysis().detectionProfile!,
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 1,
          stronglyIrregularTableCount: 1,
          directCellUnderTableCount: 0,
        },
      },
      categories: makeAnalysis().categories.map(category =>
        category.key === 'table_markup' ? { ...category, score: 40, severity: 'moderate' } : category,
      ),
    });
    const after = before;

    const summary = buildRemediationOutcomeSummary({
      before,
      after,
      appliedTools: [],
      planningSummary: {
        primaryRoute: 'native_structure_repair',
        secondaryRoutes: [],
        triggeringSignals: ['table_debt'],
        scheduledTools: [],
        skippedTools: [{ toolName: 'repair_native_table_headers', reason: 'missing_precondition' }],
        semanticDeferred: false,
      },
    });

    expect(summary?.documentStatus).toBe('unsafe_to_autofix');
    expect(summary?.familySummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: 'tables',
          status: 'unsafe_to_autofix',
        }),
      ]),
    );
  });
});

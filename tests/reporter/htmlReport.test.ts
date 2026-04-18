import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../../src/services/reporter/htmlReport.js';
import type { AnalysisResult, AppliedRemediationTool } from '../../src/types.js';

const baseAnalysis = (over: Partial<AnalysisResult> = {}): AnalysisResult =>
  ({
    id: 'a',
    filename: 'report-test.pdf',
    timestamp: new Date().toISOString(),
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: 72,
    grade: 'C',
    findings: [
      {
        category: 'alt_text',
        severity: 'moderate',
        wcag: '1.1.1',
        message: 'Figure <img> needs alt',
        page: 1,
      },
    ],
    categories: [
      {
        key: 'alt_text',
        applicable: true,
        score: 60,
        weight: 0.13,
        severity: 'moderate',
        evidence: 'manual_review_required',
        verificationLevel: 'manual_review_required',
        manualReviewRequired: true,
        manualReviewReasons: ['Alt text ownership risk detected.'],
        findings: [],
      },
      {
        key: 'title_language',
        applicable: true,
        score: 95,
        weight: 0.13,
        severity: 'minor',
        evidence: 'verified',
        verificationLevel: 'verified',
        findings: [],
      },
    ],
    analysisDurationMs: 10,
    verificationLevel: 'manual_review_required',
    manualReviewRequired: true,
    manualReviewReasons: ['Alt text ownership risk detected.'],
    scoreCapsApplied: [
      {
        category: 'alt_text',
        cap: 89,
        rawScore: 100,
        finalScore: 89,
        reason: 'Alt text quality or ownership evidence is not fully machine-verifiable.',
      },
    ],
    structuralClassification: {
      structureClass: 'partially_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: true,
        hasTables: false,
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
      confidence: 'medium',
    },
    failureProfile: {
      deterministicIssues: ['reading_order'],
      semanticIssues: ['alt_text'],
      manualOnlyIssues: ['alt_text'],
      primaryFailureFamily: 'figure_alt_ownership_heavy',
      secondaryFailureFamilies: ['structure_reading_order_heavy'],
      routingHints: ['manual_review_likely_after_fix'],
    },
    detectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        annotationOrderRiskCount: 1,
        annotationStructParentRiskCount: 2,
        headerFooterPollutionRisk: true,
        sampledStructurePageOrderDriftCount: 1,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 3,
      },
      pdfUaSignals: {
        orphanMcidCount: 1,
        suspectedPathPaintOutsideMc: 0,
        taggedAnnotationRiskCount: 2,
      },
      annotationSignals: {
        pagesMissingTabsS: 1,
        pagesAnnotationOrderDiffers: 1,
        linkAnnotationsMissingStructure: 1,
        nonLinkAnnotationsMissingStructure: 1,
        linkAnnotationsMissingStructParent: 1,
        nonLinkAnnotationsMissingStructParent: 1,
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
      sampledPages: [0, 1, 2],
      confidence: 'high',
    },
    ...over,
  }) as AnalysisResult;

describe('generateHtmlReport', () => {
  it('includes grade and escapes filename-derived content', () => {
    const before = baseAnalysis({ filename: 'evil<script>.pdf' });
    const after = baseAnalysis({ score: 88, grade: 'B', filename: 'evil<script>.pdf' });
    const html = generateHtmlReport(before, after, [], {});
    expect(html).toContain('evil&lt;script&gt;');
    expect(html).toContain('>B<');
    expect(html).toContain('1.1.1');
    expect(html).toContain('Verification summary');
    expect(html).toContain('Structural classification');
    expect(html).toContain('Detection signals');
    expect(html).toContain('Planner routing');
    expect(html).toContain('figure_alt_ownership_heavy');
    expect(html).toContain('manual_review_required');
    expect(html.length).toBeLessThan(100_000);
  });

  it('includes planner routing summary when present', () => {
    const a = baseAnalysis();
    const html = generateHtmlReport(a, a, [], {
      planningSummary: {
        primaryRoute: 'structure_bootstrap',
        secondaryRoutes: ['annotation_link_normalization', 'safe_cleanup'],
        triggeringSignals: ['missing_structure_tree', 'annotation_debt'],
        scheduledTools: ['bootstrap_struct_tree', 'normalize_annotation_tab_order'],
        skippedTools: [{ toolName: 'set_figure_alt_text', reason: 'semantic_deferred' }],
        semanticDeferred: true,
      },
      structuralConfidenceGuard: {
        rollbackCount: 1,
        lastRollbackReason: 'stage_regressed_structural_confidence(high->medium)',
      },
      remediationOutcomeSummary: {
        documentStatus: 'partially_fixed',
        targetedFamilies: ['annotations', 'tagged_content'],
        familySummaries: [
          {
            family: 'annotations',
            targeted: true,
            status: 'fixed',
            beforeSignalCount: 4,
            afterSignalCount: 0,
            appliedTools: ['tag_unowned_annotations'],
            skippedTools: [],
            residualSignals: [],
          },
          {
            family: 'tagged_content',
            targeted: true,
            status: 'partially_fixed',
            beforeSignalCount: 3,
            afterSignalCount: 1,
            appliedTools: ['remap_orphan_mcids_as_artifacts'],
            skippedTools: [],
            residualSignals: ['orphan_mcids'],
          },
        ],
      },
    });
    expect(html).toContain('structure_bootstrap');
    expect(html).toContain('annotation_link_normalization');
    expect(html).toContain('bootstrap_struct_tree');
    expect(html).toContain('set_figure_alt_text:semantic_deferred');
    expect(html).toContain('Structural-confidence rollbacks');
    expect(html).toContain('stage_regressed_structural_confidence(high-&gt;medium)');
    expect(html).toContain('Remediation outcomes');
    expect(html).toContain('partially_fixed');
    expect(html).toContain('tagged_content residuals');
  });

  it('includes applied tools when requested', () => {
    const a = baseAnalysis();
    const tools: AppliedRemediationTool[] = [
      {
        toolName: 'set_document_title',
        stage: 1,
        round: 1,
        scoreBefore: 70,
        scoreAfter: 72,
        delta: 2,
        outcome: 'applied',
      },
    ];
    const html = generateHtmlReport(a, a, tools, { includeAppliedTools: true });
    expect(html).toContain('set_document_title');
  });

  it('includes OCR human-review notice when ocrPipeline is set', () => {
    const a = baseAnalysis();
    const html = generateHtmlReport(a, a, [], {
      ocrPipeline: {
        applied: true,
        attempted: true,
        humanReviewRecommended: true,
        guidance: 'Test OCR guidance <script>.',
      },
    });
    expect(html).toContain('OCR notice');
    expect(html).toContain('Test OCR guidance');
    expect(html).toContain('&lt;script&gt;');
  });
});

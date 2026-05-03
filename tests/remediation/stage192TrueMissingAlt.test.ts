import { describe, expect, it } from 'vitest';
import { classifyStage192TrueMissingAlt } from '../../src/services/remediation/stage192TrueMissingAlt.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../src/types.js';

function analysis(overrides: Partial<Record<CategoryKey, number>> = {}, score = 82): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 100,
    reading_order: 100,
    alt_text: 20,
    table_markup: 100,
    link_quality: 100,
    pdf_ua_compliance: 71,
    ...overrides,
  };
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    pdfClass: 'native_tagged',
    categories: Object.entries(categories).map(([key, value]) => ({
      key: key as CategoryKey,
      score: value ?? 0,
      applicable: true,
    })),
    issues: [],
    suggestions: [],
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 4,
    textByPage: ['Title', 'Page text', 'Page text', 'Page text'],
    textCharCount: 2400,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Title', page: 0, structRef: '10_0' }],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    detectionProfile: {
      pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      readingOrderSignals: {
        missingStructureTree: false,
        structureTreeDepth: 4,
        degenerateStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 0,
      },
      headingSignals: {
        extractedHeadingCount: 1,
        treeHeadingCount: 1,
        headingTreeDepth: 2,
        extractedHeadingsMissingFromTree: false,
      },
      figureSignals: {
        extractedFigureCount: 0,
        treeFigureCount: 0,
        nonFigureRoleCount: 0,
        treeFigureMissingForExtractedFigures: false,
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
  } as unknown as DocumentSnapshot;
}

function rawFigure(ref: string, page: number, bbox?: [number, number, number, number], hasAlt = false) {
  return {
    structRef: ref,
    page,
    rawRole: 'Figure',
    role: 'Figure',
    hasAlt,
    altText: hasAlt ? 'Illustration' : undefined,
    isArtifact: false,
    reachable: true,
    directContent: true,
    subtreeMcidCount: 1,
    subtreeMcids: [page + 1],
    parentPath: ['Document@1_0', `Figure@${ref}`],
    bbox,
  };
}

function checkerTarget(ref: string, page: number, bbox?: [number, number, number, number]) {
  return {
    structRef: ref,
    page,
    role: 'Figure',
    resolvedRole: 'Figure',
    hasAlt: false,
    isArtifact: false,
    reachable: true,
    directContent: true,
    subtreeMcids: [page + 1],
    parentPath: ['Document@1_0', `Figure@${ref}`],
    bbox,
  };
}

describe('Stage 192 true missing-alt classifier', () => {
  it('classifies content-backed raw Figures without Alt as semantic alt debt', () => {
    const decision = classifyStage192TrueMissingAlt({
      analysis: analysis({ alt_text: 20 }),
      snapshot: snapshot({
        figures: [rawFigure('100_0', 0)],
        checkerFigureTargets: [checkerTarget('100_0', 0)],
      }),
    });

    expect(decision.rowClassification).toBe('meaningful_needs_semantic_alt');
    expect(decision.behaviorCandidate).toBe(false);
    expect(decision.missingAltTargets[0]?.classification).toBe('meaningful_needs_semantic_alt');
  });

  it('classifies reachable role-map figure-like nodes separately from raw Figure alt debt', () => {
    const decision = classifyStage192TrueMissingAlt({
      analysis: analysis({ alt_text: 20 }),
      snapshot: snapshot({
        figures: [{
          structRef: 'shape_0',
          page: 0,
          rawRole: 'InlineShape',
          role: 'Figure',
          hasAlt: false,
          isArtifact: false,
          reachable: true,
          directContent: true,
          subtreeMcidCount: 2,
          subtreeMcids: [11, 12],
          parentPath: ['Document@1_0', 'InlineShape@shape_0'],
        }],
        checkerFigureTargets: [],
      }),
    });

    expect(decision.rowClassification).toBe('rolemap_retag_then_alt_candidate');
    expect(decision.behaviorCandidate).toBe(false);
    expect(decision.targetClassCounts.rolemap_retag_then_alt_candidate).toBe(1);
  });

  it('parks alt targets when heading, reading order, or table blockers dominate the row', () => {
    const decision = classifyStage192TrueMissingAlt({
      analysis: analysis({ heading_structure: 45, reading_order: 45, table_markup: 0, alt_text: 20 }, 59),
      snapshot: snapshot({
        figures: [rawFigure('100_0', 0)],
        checkerFigureTargets: [checkerTarget('100_0', 0)],
      }),
    });

    expect(decision.rowClassification).toBe('table_or_heading_blocked_not_alt_first');
    expect(decision.behaviorCandidate).toBe(false);
  });

  it('does not treat repeated template cleanup as behavior when projected alt score would not improve', () => {
    const figures = [
      rawFigure('alt_0', 0, [0, 0, 100, 100], true),
      rawFigure('alt_1', 1, [0, 0, 100, 100], true),
      rawFigure('miss_0', 0, [0, 0, 10, 30]),
      rawFigure('miss_1', 1, [0, 0, 10, 30]),
      rawFigure('miss_2', 2, [0, 0, 10, 30]),
      rawFigure('miss_3', 3, [0, 0, 10, 30]),
      rawFigure('miss_4', 0, [0, 0, 10, 30]),
      rawFigure('miss_5', 1, [0, 0, 10, 30]),
      rawFigure('miss_6', 2, [0, 0, 10, 30]),
      rawFigure('body_0', 3, [0, 0, 300, 300]),
    ];
    const decision = classifyStage192TrueMissingAlt({
      analysis: analysis({ alt_text: 60 }),
      snapshot: snapshot({
        figures,
        checkerFigureTargets: figures
          .filter(figure => !figure.hasAlt)
          .map(figure => checkerTarget(figure.structRef!, figure.page, figure.bbox)),
      }),
    });

    expect(decision.targetClassCounts.repeated_template_artifact_candidate +
      decision.targetClassCounts.safe_decorative_artifact_candidate).toBe(7);
    expect(decision.projectedAltAfterDeterministicCleanup).toBe(60);
    expect(decision.behaviorCandidate).toBe(false);
  });

  it('allows deterministic cleanup as a behavior candidate only when projected alt score improves', () => {
    const figures = [
      rawFigure('alt_0', 0, [0, 0, 100, 100], true),
      rawFigure('alt_1', 1, [0, 0, 100, 100], true),
      rawFigure('miss_0', 0, [0, 0, 10, 30]),
      rawFigure('miss_1', 1, [0, 0, 10, 30]),
      rawFigure('miss_2', 2, [0, 0, 10, 30]),
      rawFigure('miss_3', 3, [0, 0, 10, 30]),
      rawFigure('miss_4', 0, [0, 0, 10, 30]),
      rawFigure('miss_5', 1, [0, 0, 10, 30]),
    ];
    const decision = classifyStage192TrueMissingAlt({
      analysis: analysis({ alt_text: 20 }),
      snapshot: snapshot({
        figures,
        checkerFigureTargets: figures
          .filter(figure => !figure.hasAlt)
          .map(figure => checkerTarget(figure.structRef!, figure.page, figure.bbox)),
      }),
    });

    expect(decision.projectedAltAfterDeterministicCleanup).toBe(100);
    expect(decision.behaviorCandidate).toBe(true);
  });
});

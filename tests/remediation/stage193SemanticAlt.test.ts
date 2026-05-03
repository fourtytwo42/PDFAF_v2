import { describe, expect, it } from 'vitest';
import { classifyStage193SemanticAlt, stage193SemanticAltCandidateStructRefs } from '../../src/services/remediation/stage193SemanticAlt.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../src/types.js';

function analysis(overrides: Partial<Record<CategoryKey, number>> = {}, score = 82): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 100,
    reading_order: 100,
    alt_text: 20,
    table_markup: 100,
    link_quality: 100,
    pdf_ua_compliance: 83,
    ...overrides,
  };
  return {
    id: 'stage193-test',
    filename: 'stage193-test.pdf',
    timestamp: new Date().toISOString(),
    pdfClass: 'native_tagged',
    pageCount: 4,
    durationMs: 1,
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    categories: Object.entries(categories).map(([key, value]) => ({
      key: key as CategoryKey,
      score: value ?? 0,
      applicable: true,
      weight: 0,
      severity: 'pass' as const,
      findings: [],
    })),
    findings: [],
    recommendations: [],
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 4,
    textByPage: ['Title', 'The chart compares program outcomes by year.', 'Body', 'Body'],
    textCharCount: 2400,
    imageOnlyPageCount: 0,
    metadata: { title: 'Program Evaluation' },
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

function rawFigure(ref = '100_0') {
  return {
    structRef: ref,
    page: 1,
    rawRole: 'Figure',
    role: 'Figure',
    hasAlt: false,
    isArtifact: false,
    reachable: true,
    directContent: true,
    subtreeMcidCount: 1,
    subtreeMcids: [9],
    parentPath: ['Document@1_0', `Figure@${ref}`],
    bbox: [72, 200, 420, 500] as [number, number, number, number],
  };
}

function checkerTarget(ref = '100_0') {
  return {
    structRef: ref,
    page: 1,
    role: 'Figure',
    resolvedRole: 'Figure',
    hasAlt: false,
    isArtifact: false,
    reachable: true,
    directContent: true,
    subtreeMcids: [9],
    parentPath: ['Document@1_0', `Figure@${ref}`],
  };
}

describe('Stage 193 semantic alt policy', () => {
  it('selects stable content-backed raw Figure targets for semantic alt', () => {
    const snap = snapshot({
      figures: [rawFigure()],
      checkerFigureTargets: [checkerTarget()],
    });
    const decision = classifyStage193SemanticAlt({ analysis: analysis(), snapshot: snap });
    expect(decision.rowClassification).toBe('semantic_alt_candidate');
    expect(decision.behaviorCandidate).toBe(true);
    expect(stage193SemanticAltCandidateStructRefs({ analysis: analysis(), snapshot: snap })).toEqual(new Set(['100_0']));
  });

  it('blocks semantic alt when table or structural categories are still primary blockers', () => {
    const decision = classifyStage193SemanticAlt({
      analysis: analysis({ table_markup: 0, reading_order: 45 }),
      snapshot: snapshot({
        figures: [rawFigure()],
        checkerFigureTargets: [checkerTarget()],
      }),
    });
    expect(decision.rowClassification).toBe('semantic_alt_blocked_by_structure');
    expect(decision.behaviorCandidate).toBe(false);
  });

  it('keeps role-map figure-like targets separate from raw Figure semantic alt', () => {
    const decision = classifyStage193SemanticAlt({
      analysis: analysis(),
      snapshot: snapshot({
        figures: [{
          ...rawFigure('shape_0'),
          rawRole: 'InlineShape',
          role: 'Figure',
          subtreeMcidCount: 2,
          subtreeMcids: [1, 2],
          parentPath: ['Document@1_0', 'InlineShape@shape_0'],
        }],
      }),
    });
    expect(decision.rowClassification).toBe('rolemap_semantic_alt_candidate');
    expect(decision.behaviorCandidate).toBe(true);
  });

  it('does not schedule parked volatility rows', () => {
    const decision = classifyStage193SemanticAlt({
      analysis: analysis(),
      snapshot: snapshot({
        figures: [rawFigure()],
        checkerFigureTargets: [checkerTarget()],
      }),
      parked: true,
    });
    expect(decision.rowClassification).toBe('protected_or_analyzer_volatility');
    expect(decision.behaviorCandidate).toBe(false);
  });
});

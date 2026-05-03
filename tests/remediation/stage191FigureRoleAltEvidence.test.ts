import { describe, expect, it } from 'vitest';
import { classifyStage191FigureRoleAltEvidence } from '../../src/services/remediation/stage191FigureRoleAltEvidence.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../src/types.js';

function analysis(scores: Partial<Record<CategoryKey, number>>, score = 79): AnalysisResult {
  return {
    id: 'stage191-test',
    filename: 'stage191-test.pdf',
    timestamp: new Date().toISOString(),
    pdfClass: 'native_tagged',
    pageCount: 3,
    durationMs: 1,
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    categories: ([
      'heading_structure',
      'reading_order',
      'alt_text',
      'table_markup',
      'pdf_ua_compliance',
      'link_quality',
    ] as CategoryKey[]).map(key => ({
      key,
      score: scores[key] ?? 100,
      weight: 0,
      applicable: true,
      severity: 'pass' as const,
      findings: [],
    })),
    findings: [],
    recommendations: [],
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 3,
    textByPage: ['Title', 'Body', 'Body'],
    textCharCount: 1200,
    imageOnlyPageCount: 0,
    metadata: { title: 'Test', language: 'en-US' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Test',
    headings: [{ level: 1, text: 'Test', page: 0 }],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [{ type: 'H1', children: [] }] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    detectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        structureTreeDepth: 3,
        degenerateStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 1,
      },
      headingSignals: {
        extractedHeadingCount: 1,
        treeHeadingCount: 1,
        headingTreeDepth: 1,
        extractedHeadingsMissingFromTree: false,
      },
      figureSignals: {
        extractedFigureCount: 0,
        treeFigureCount: 0,
        nonFigureRoleCount: 0,
        treeFigureMissingForExtractedFigures: false,
      },
      pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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

describe('Stage 191 figure-role alt evidence classifier', () => {
  it('selects duplicate non-Figure role debt only when MCIDs are covered by alt-owned raw Figures', () => {
    const snap = snapshot({
      figures: [
        {
          structRef: 'fig_0',
          page: 0,
          rawRole: 'Figure',
          role: 'Figure',
          hasAlt: true,
          altText: 'Chart',
          isArtifact: false,
          reachable: true,
          directContent: true,
          subtreeMcidCount: 1,
          subtreeMcids: [7],
        },
        {
          structRef: 'shape_0',
          page: 0,
          rawRole: 'InlineShape',
          role: 'InlineShape',
          hasAlt: false,
          isArtifact: false,
          reachable: true,
          directContent: true,
          subtreeMcidCount: 1,
          subtreeMcids: [7],
        },
      ],
      checkerFigureTargets: [{
        structRef: 'fig_0',
        page: 0,
        role: 'Figure',
        resolvedRole: 'Figure',
        hasAlt: true,
        altText: 'Chart',
        isArtifact: false,
        reachable: true,
        directContent: true,
        subtreeMcids: [7],
        parentPath: ['Figure@fig_0'],
      }],
      detectionProfile: {
        ...snapshot().detectionProfile!,
        figureSignals: {
          extractedFigureCount: 2,
          treeFigureCount: 1,
          nonFigureRoleCount: 1,
          treeFigureMissingForExtractedFigures: false,
        },
      },
    });
    const decision = classifyStage191FigureRoleAltEvidence({
      analysis: analysis({ alt_text: 20 }),
      snapshot: snap,
    });
    expect(decision.classification).toBe('duplicate_nonfigure_role_debt_covered_by_alt_figure');
    expect(decision.behaviorCandidate).toBe(true);
    expect(decision.duplicateOwnership).toHaveLength(1);
  });

  it('treats reachable raw Figures without Alt as true debt before analyzer alignment', () => {
    const decision = classifyStage191FigureRoleAltEvidence({
      analysis: analysis({ alt_text: 20 }),
      snapshot: snapshot({
        figures: [{
          structRef: 'fig_0',
          page: 0,
          rawRole: 'Figure',
          role: 'Figure',
          hasAlt: false,
          isArtifact: false,
          reachable: true,
          directContent: true,
          subtreeMcidCount: 1,
          subtreeMcids: [1],
        }],
        checkerFigureTargets: [{
          structRef: 'fig_0',
          page: 0,
          role: 'Figure',
          resolvedRole: 'Figure',
          hasAlt: false,
          isArtifact: false,
          reachable: true,
          directContent: true,
          subtreeMcids: [1],
          parentPath: ['Figure@fig_0'],
        }],
      }),
    });
    expect(decision.classification).toBe('raw_figure_alt_missing_true_debt');
    expect(decision.behaviorCandidate).toBe(false);
  });

  it('parks role-map targets that still lack Alt instead of calling them stale scorer debt', () => {
    const decision = classifyStage191FigureRoleAltEvidence({
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
          subtreeMcidCount: 3,
          subtreeMcids: [1, 2, 3],
        }],
        checkerFigureTargets: [],
      }),
    });
    expect(decision.classification).toBe('hidden_rolemap_alt_cap_limited');
  });

  it('does not target mixed table or heading blockers', () => {
    const decision = classifyStage191FigureRoleAltEvidence({
      analysis: analysis({ heading_structure: 70, reading_order: 100, table_markup: 100, alt_text: 0 }),
      snapshot: snapshot(),
    });
    expect(decision.classification).toBe('mixed_table_or_heading_blocker');
    expect(decision.behaviorCandidate).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import {
  classifyStage181HiddenAlt,
  hasAppliedStage181HiddenAlt,
  stage181AltPlaceholder,
  stage181HiddenAltTargets,
} from '../../src/services/remediation/stage181HiddenAlt.js';

function analysis(score = 82, overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 86,
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
    pageCount: 8,
    textByPage: ['title'],
    textCharCount: 4000,
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
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: {
      orphanMcidCount: 0,
      mcidTextSpanCount: 10,
      suspectedPathPaintOutsideMc: 0,
    },
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
    },
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
        extractedFigureCount: 1,
        treeFigureCount: 1,
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
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    ...overrides,
  } as unknown as DocumentSnapshot;
}

function applied(toolName: string, details: unknown): AppliedRemediationTool {
  return {
    toolName,
    stage: 1,
    round: 1,
    scoreBefore: 80,
    scoreAfter: 82,
    delta: 2,
    outcome: 'applied',
    details: typeof details === 'string' ? details : JSON.stringify(details),
  };
}

describe('Stage 181 hidden alt helpers', () => {
  it('selects unattempted checker-visible missing-alt figure targets', () => {
    const snap = snapshot({
      figures: [
        { structRef: '1965_0', page: 0, hasAlt: false, isArtifact: false, role: 'Figure', rawRole: 'Figure', reachable: true, directContent: true, subtreeMcidCount: 1 },
        { structRef: '1966_0', page: 1, hasAlt: false, isArtifact: false, role: 'Figure', rawRole: 'Figure', reachable: true, directContent: true, subtreeMcidCount: 1 },
      ],
      checkerFigureTargets: [
        { structRef: '1965_0', page: 0, hasAlt: false, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
        { structRef: '1966_0', page: 1, hasAlt: false, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
      ],
    });
    const decision = classifyStage181HiddenAlt({
      analysis: analysis(),
      snapshot: snap,
      appliedTools: [applied('set_figure_alt_text', { targetRefs: ['1965_0'] })],
    });

    expect(decision).toMatchObject({
      classification: 'hidden_checker_visible_alt_target',
      shouldAttempt: true,
    });
    expect(decision.targets.map(target => target.structRef)).toEqual(['1966_0']);
    expect(decision.targets[0]?.toolName).toBe('set_figure_alt_text');
  });

  it('selects reachable role-map figure ownership targets when checker-visible targets are covered', () => {
    const snap = snapshot({
      figures: [
        { structRef: '128_0', page: 0, hasAlt: false, isArtifact: false, role: 'Figure', rawRole: 'Shape', reachable: true, directContent: true, subtreeMcidCount: 1 },
        { structRef: '979_0', page: 4, hasAlt: false, isArtifact: false, role: 'Figure', rawRole: 'InlineShape', reachable: true, directContent: false, subtreeMcidCount: 3 },
      ],
      checkerFigureTargets: [
        { structRef: 'done_0', page: 0, hasAlt: true, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
      ],
    });
    const decision = classifyStage181HiddenAlt({ analysis: analysis(), snapshot: snap });

    expect(decision).toMatchObject({
      classification: 'orphan_figure_alt_ownership_candidate',
      shouldAttempt: true,
    });
    expect(decision.targets.map(target => target.structRef)).toEqual(['128_0', '979_0']);
    expect(decision.targets.every(target => target.toolName === 'retag_as_figure')).toBe(true);
  });

  it('rejects mixed heading/protected volatility rows before selecting targets', () => {
    const snap = snapshot({
      figures: [
        { structRef: '1_0', page: 0, hasAlt: false, isArtifact: false, role: 'Figure', rawRole: 'Figure', reachable: true, directContent: true, subtreeMcidCount: 1 },
      ],
      checkerFigureTargets: [
        { structRef: '1_0', page: 0, hasAlt: false, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
      ],
    });

    expect(classifyStage181HiddenAlt({
      analysis: analysis(75, { heading_structure: 60 }),
      snapshot: snap,
    })).toMatchObject({
      classification: 'mixed_heading_or_protected_volatility',
      shouldAttempt: false,
    });

    expect(classifyStage181HiddenAlt({
      analysis: analysis(),
      snapshot: snap,
      parked: true,
    })).toMatchObject({
      classification: 'mixed_heading_or_protected_volatility',
      shouldAttempt: false,
    });
  });

  it('detects Stage 181 applied rows and builds deterministic placeholder alt', () => {
    expect(hasAppliedStage181HiddenAlt([
      applied('retag_as_figure', { note: 'stage181_rolemap_alt_ownership', targetRefs: ['128_0'] }),
    ])).toBe(true);

    expect(hasAppliedStage181HiddenAlt([
      applied('retag_as_figure', { note: 'stage179_partial_alt_cleanup', targetRefs: ['128_0'] }),
    ])).toBe(false);

    expect(stage181AltPlaceholder({
      toolName: 'set_figure_alt_text',
      structRef: '1_0',
      page: 4,
      source: 'checker_visible_missing_alt',
      directContent: true,
      subtreeMcidCount: 1,
    })).toBe('Illustration (page 5)');
  });

  it('reports analyzer debt when alt remains low but no content-backed target exists', () => {
    const decision = classifyStage181HiddenAlt({
      analysis: analysis(),
      snapshot: snapshot({
        checkerFigureTargets: [
          { structRef: 'done_0', page: 0, hasAlt: true, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
        ],
      }),
    });

    expect(decision).toMatchObject({
      classification: 'alt_score_analyzer_debt',
      shouldAttempt: false,
    });
  });
});


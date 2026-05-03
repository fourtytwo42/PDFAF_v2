import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import {
  classifyStage186Hard2TableAlt,
  collectStage186TargetRefs,
  stage186TableTargets,
} from '../../src/services/remediation/stage186Hard2TableAlt.js';

function analysis(score = 68, overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 100,
    reading_order: 86,
    link_quality: 100,
    alt_text: 20,
    table_markup: 0,
    pdf_ua_compliance: 83,
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

function table(ref: string, irregularRows = 8): DocumentSnapshot['tables'][number] {
  return {
    structRef: ref,
    page: 0,
    hasHeaders: true,
    headerCount: 3,
    totalCells: 40,
    rowCount: 8,
    cellsMisplacedCount: 0,
    irregularRows,
    dominantColumnCount: 5,
    reachable: true,
    directContent: false,
    subtreeMcidCount: 42,
  };
}

function figure(ref: string): DocumentSnapshot['figures'][number] {
  return {
    structRef: ref,
    page: 25,
    role: 'Figure',
    rawRole: 'InlineShape',
    hasAlt: false,
    reachable: true,
    directContent: true,
    subtreeMcidCount: 1,
    isArtifact: false,
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 68,
    textByPage: ['title'],
    textCharCount: 120000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [{}],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Title', page: 0, structRef: '10_0' }],
    figures: [figure('3400_0'), figure('3403_0')],
    checkerFigureTargets: [
      { structRef: '3403_0', role: 'Figure', resolvedRole: 'Figure', page: 25, reachable: true, hasAlt: true, isArtifact: false, directContent: true },
      { structRef: '3400_0', role: 'Figure', resolvedRole: 'Figure', page: 26, reachable: true, hasAlt: true, isArtifact: false, directContent: true },
    ],
    tables: [
      table('8600_0'),
      table('7263_0', 6),
      table('8017_0', 6),
      table('8026_0', 5),
      table('8100_0', 5),
      table('8200_0', 4),
    ],
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: {
      orphanMcidCount: 1,
      mcidTextSpanCount: 500,
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
      tableSignals: {
        stronglyIrregularTableCount: 6,
        irregularTableCount: 6,
        directCellUnderTableCount: 0,
        misplacedCellCount: 0,
        tablesWithMisplacedCells: 0,
      },
      pdfUaSignals: { orphanMcidCount: 1, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
      annotationSignals: {
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
      },
    },
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    ...overrides,
  } as unknown as DocumentSnapshot;
}

function tool(
  toolName: string,
  targetRef: string,
  tableBefore = 0,
  tableAfter = 0,
): AppliedRemediationTool {
  return {
    toolName,
    stage: 10,
    round: 1,
    scoreBefore: 68,
    scoreAfter: 68,
    delta: 0,
    outcome: 'applied',
    details: JSON.stringify({
      outcome: 'applied',
      note: 'stage180_explicit_table_continuation',
      target: { structRef: targetRef },
      mutation: { debug: { targetRef } },
      debug: {
        replayState: {
          categoryScoresBefore: { table_markup: tableBefore, alt_text: 20, pdf_ua_compliance: 71 },
          categoryScoresAfter: { table_markup: tableAfter, alt_text: 20, pdf_ua_compliance: 71 },
        },
      },
    }),
  };
}

describe('Stage 186 hard-holdout-2 table/alt helpers', () => {
  it('collects target refs from Stage 180-style aggregate details', () => {
    expect([...collectStage186TargetRefs(tool('normalize_table_structure', '8600_0').details)]).toContain('8600_0');
  });

  it('skips already attempted explicit table refs', () => {
    expect(stage186TableTargets(snapshot(), [
      tool('normalize_table_structure', '8600_0'),
      tool('normalize_table_structure', '7263_0'),
    ]).map(target => target.structRef)).toEqual(['8017_0', '8026_0', '8100_0', '8200_0']);
  });

  it('selects 4105-style role-map alt fallback after no-gain table evidence', () => {
    expect(classifyStage186Hard2TableAlt({
      analysis: analysis(),
      snapshot: snapshot(),
      appliedTools: [tool('normalize_table_structure', '8600_0')],
    })).toMatchObject({
      classification: 'rolemap_alt_after_table_candidate',
      shouldAttemptTable: false,
      shouldAttemptAlt: true,
    });
  });

  it('selects simple table continuation before no-gain evidence exists', () => {
    expect(classifyStage186Hard2TableAlt({
      analysis: analysis(),
      snapshot: snapshot(),
    })).toMatchObject({
      classification: 'safe_table_continuation_candidate',
      shouldAttemptTable: true,
    });
  });

  it('parks OCR/scanned and unstable core rows', () => {
    expect(classifyStage186Hard2TableAlt({
      analysis: analysis(),
      snapshot: snapshot({ pdfClass: 'scanned' }),
    })).toMatchObject({
      classification: 'no_safe_path',
      shouldAttemptTable: false,
    });

    expect(classifyStage186Hard2TableAlt({
      analysis: analysis(68, { reading_order: 45 }),
      snapshot: snapshot(),
    })).toMatchObject({
      classification: 'no_safe_path',
      shouldAttemptTable: false,
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import {
  classifyStage180MixedTablePdfUa,
  hasAppliedStage180MixedTablePdfUa,
  shouldTryStage180RepeatedTemplateFinalization,
  shouldTryStage180ReportTableProof,
  shouldTryStage180LinkRepairAfterTable,
  stage180RepeatedTemplateEvidence,
  stage180RemainingTableTargets,
} from '../../src/services/remediation/stage180MixedTablePdfua.js';

function analysis(score = 74, overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 94,
    reading_order: 96,
    link_quality: 95,
    alt_text: 20,
    table_markup: 44,
    pdf_ua_compliance: 50,
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
    pageCount: 34,
    textByPage: ['title'],
    textCharCount: 7000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [{}],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Title', page: 0, structRef: '10_0' }],
    figures: [],
    checkerFigureTargets: [],
    tables: [
      {
        structRef: '2216_0',
        page: 0,
        hasHeaders: true,
        headerCount: 2,
        totalCells: 14,
        rowCount: 8,
        cellsMisplacedCount: 0,
        irregularRows: 2,
        dominantColumnCount: 2,
        reachable: true,
        directContent: false,
        subtreeMcidCount: 20,
      },
      {
        structRef: '2897_0',
        page: 0,
        hasHeaders: true,
        headerCount: 1,
        totalCells: 6,
        rowCount: 4,
        cellsMisplacedCount: 0,
        irregularRows: 2,
        dominantColumnCount: 1,
        reachable: true,
        directContent: false,
        subtreeMcidCount: 6,
      },
    ],
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: {
      orphanMcidCount: 64,
      mcidTextSpanCount: 500,
      suspectedPathPaintOutsideMc: 0,
    },
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 28,
      nonLinkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
    },
    detectionProfile: {
      pdfUaSignals: { orphanMcidCount: 64, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 28 },
      annotationSignals: { linkAnnotationsMissingStructure: 28, linkAnnotationsMissingStructParent: 0 },
    },
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    ...overrides,
  } as unknown as DocumentSnapshot;
}

function applied(toolName: string, targetRef: string): AppliedRemediationTool {
  return {
    toolName,
    stage: 1,
    round: 1,
    scoreBefore: 70,
    scoreAfter: 74,
    delta: 4,
    outcome: 'applied',
    details: JSON.stringify({ outcome: 'applied', invariants: { targetRef } }),
  };
}

function repeatedTemplateTables(count = 120): DocumentSnapshot['tables'] {
  return Array.from({ length: count }, (_, index) => ({
    structRef: `${2000 + index}_0`,
    rawRole: 'Table',
    resolvedRole: 'Table',
    page: Math.floor(index / 4),
    hasHeaders: true,
    headerCount: 2,
    totalCells: 5,
    rowCount: 2,
    rowCellCounts: [2, 3],
    cellsMisplacedCount: 0,
    irregularRows: 1,
    dominantColumnCount: 2,
    maxRowSpan: 1,
    maxColSpan: 1,
    reachable: true,
    directContent: false,
    subtreeMcidCount: 5,
  }));
}

describe('Stage 180 mixed table/PDF-UA helpers', () => {
  it('selects font-4057-style mixed table-first candidates', () => {
    const decision = classifyStage180MixedTablePdfUa({
      analysis: analysis(),
      snapshot: snapshot(),
    });

    expect(decision).toMatchObject({
      classification: 'mixed_ordered_transaction_candidate',
      shouldAttempt: true,
    });
    expect(decision.tableTargets.map(target => target.structRef)).toEqual(['2216_0', '2897_0']);
    expect(decision.tableTargets[1]?.smallDominantFallback).toBe(true);
  });

  it('skips already attempted table refs', () => {
    const targets = stage180RemainingTableTargets(snapshot(), [
      applied('normalize_table_structure', '2216_0'),
    ]);

    expect(targets.map(target => target.structRef)).toEqual(['2897_0']);
  });

  it('does not admit role-mapped non-table refs as Stage 180 table targets', () => {
    const targets = stage180RemainingTableTargets(snapshot({
      tables: [
        {
          structRef: '2216_0',
          rawRole: 'TD',
          resolvedRole: 'Table',
          page: 0,
          hasHeaders: true,
          headerCount: 2,
          totalCells: 14,
          rowCount: 8,
          cellsMisplacedCount: 0,
          irregularRows: 2,
          dominantColumnCount: 2,
          reachable: true,
          directContent: false,
          subtreeMcidCount: 20,
        },
      ],
    }));

    expect(targets).toEqual([]);
  });

  it('rejects parked or unstable core rows', () => {
    expect(classifyStage180MixedTablePdfUa({
      analysis: analysis(59, { reading_order: 0 }),
      snapshot: snapshot(),
    })).toMatchObject({
      shouldAttempt: false,
      classification: 'no_safe_target',
    });

    expect(classifyStage180MixedTablePdfUa({
      analysis: analysis(),
      snapshot: snapshot(),
      parked: true,
    })).toMatchObject({
      shouldAttempt: false,
      classification: 'protected_or_analyzer_volatility',
    });
  });

  it('allows bounded table-only cleanup when non-table scores are moderate but stable', () => {
    const noAnnotationDebt = snapshot({
      tableHeaderAudit: {
        tablesChecked: 2,
        headerAssociationMissingCount: 2,
        orphanHeaderCellCount: 12,
        dataCellsWithoutHeaderCount: 140,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
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
        pdfUaSignals: { orphanMcidCount: 64, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: { linkAnnotationsMissingStructure: 0, linkAnnotationsMissingStructParent: 0 },
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 2,
          stronglyIrregularTableCount: 2,
        },
      },
    });

    expect(classifyStage180MixedTablePdfUa({
      analysis: analysis(69, {
        heading_structure: 75,
        reading_order: 79,
        link_quality: 79,
        alt_text: 100,
        table_markup: 16,
      }),
      snapshot: noAnnotationDebt,
    })).toMatchObject({
      shouldAttempt: true,
      classification: 'stable_table_first_candidate',
    });
  });

  it('allows report-scale object-backed table cleanup with bounded heading debt', () => {
    const reportTableSnapshot = snapshot({
      pageCount: 65,
      tableHeaderAudit: {
        tablesChecked: 22,
        headerAssociationMissingCount: 22,
        orphanHeaderCellCount: 17,
        dataCellsWithoutHeaderCount: 486,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
      },
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 1,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      detectionProfile: {
        pdfUaSignals: { orphanMcidCount: 64, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: { linkAnnotationsMissingStructure: 0, linkAnnotationsMissingStructParent: 0 },
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 11,
          stronglyIrregularTableCount: 11,
        },
      },
      tables: [
        {
          structRef: '2040_0',
          page: 0,
          hasHeaders: true,
          headerCount: 5,
          totalCells: 63,
          rowCount: 17,
          cellsMisplacedCount: 0,
          irregularRows: 16,
          dominantColumnCount: 4,
          reachable: true,
          directContent: false,
          subtreeMcidCount: 103,
        },
      ],
    });
    const reportAnalysis = analysis(69, {
      heading_structure: 60,
      reading_order: 98,
      link_quality: 100,
      alt_text: 100,
      table_markup: 0,
    });

    expect(shouldTryStage180ReportTableProof({
      analysis: reportAnalysis,
      snapshot: reportTableSnapshot,
    })).toBe(true);
    expect(classifyStage180MixedTablePdfUa({
      analysis: reportAnalysis,
      snapshot: reportTableSnapshot,
    })).toMatchObject({
      shouldAttempt: true,
      classification: 'stable_table_first_candidate',
      reason: 'report-scale object-backed table cleanup can run with bounded heading debt',
    });
  });

  it('allows report-scale object-backed table cleanup with bounded non-annotation link debt', () => {
    const reportTableSnapshot = snapshot({
      pageCount: 65,
      tableHeaderAudit: {
        tablesChecked: 22,
        headerAssociationMissingCount: 22,
        orphanHeaderCellCount: 17,
        dataCellsWithoutHeaderCount: 486,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
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
        annotationSignals: { linkAnnotationsMissingStructure: 0, linkAnnotationsMissingStructParent: 0 },
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 11,
          stronglyIrregularTableCount: 11,
        },
      },
      tables: [
        {
          structRef: '2040_0',
          page: 0,
          hasHeaders: true,
          headerCount: 5,
          totalCells: 63,
          rowCount: 17,
          cellsMisplacedCount: 0,
          irregularRows: 16,
          dominantColumnCount: 4,
          reachable: true,
          directContent: false,
          subtreeMcidCount: 103,
        },
      ],
    });
    const reportAnalysis = analysis(69, {
      heading_structure: 60,
      reading_order: 98,
      link_quality: 79,
      alt_text: 100,
      table_markup: 0,
    });

    expect(shouldTryStage180ReportTableProof({
      analysis: reportAnalysis,
      snapshot: reportTableSnapshot,
    })).toBe(true);
    expect(shouldTryStage180ReportTableProof({
      analysis: analysis(69, {
        heading_structure: 60,
        reading_order: 98,
        link_quality: 74,
        alt_text: 100,
        table_markup: 0,
      }),
      snapshot: reportTableSnapshot,
    })).toBe(false);
  });

  it('rejects high-score controls and layout-only blockers for the report table proof', () => {
    const reportTableSnapshot = snapshot({
      pageCount: 65,
      tableHeaderAudit: {
        tablesChecked: 22,
        headerAssociationMissingCount: 22,
        orphanHeaderCellCount: 17,
        dataCellsWithoutHeaderCount: 486,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
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
        annotationSignals: { linkAnnotationsMissingStructure: 0, linkAnnotationsMissingStructParent: 0 },
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 11,
          stronglyIrregularTableCount: 11,
        },
      },
      tables: [
        {
          structRef: '2040_0',
          page: 0,
          hasHeaders: true,
          headerCount: 5,
          totalCells: 63,
          rowCount: 17,
          cellsMisplacedCount: 0,
          irregularRows: 16,
          dominantColumnCount: 4,
          reachable: true,
          directContent: false,
          subtreeMcidCount: 103,
        },
      ],
    });
    const highScoreControl = analysis(96, {
      heading_structure: 100,
      reading_order: 100,
      link_quality: 100,
      alt_text: 100,
      table_markup: 79,
    });
    expect(shouldTryStage180ReportTableProof({
      analysis: highScoreControl,
      snapshot: reportTableSnapshot,
    })).toBe(false);

    const layoutOnlyBlocker = snapshot({
      pageCount: 65,
      tables: [],
      tableHeaderAudit: {
        tablesChecked: 22,
        headerAssociationMissingCount: 22,
        orphanHeaderCellCount: 17,
        dataCellsWithoutHeaderCount: 486,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
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
        pdfUaSignals: { orphanMcidCount: 64, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: { linkAnnotationsMissingStructure: 0, linkAnnotationsMissingStructParent: 0 },
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 11,
          stronglyIrregularTableCount: 11,
          layoutTableCandidateCount: 35,
          denseRowBandTableCandidateCount: 35,
        },
      },
    });
    expect(shouldTryStage180ReportTableProof({
      analysis: analysis(69, {
        heading_structure: 60,
        reading_order: 98,
        link_quality: 100,
        alt_text: 100,
        table_markup: 0,
      }),
      snapshot: layoutOnlyBlocker,
    })).toBe(false);
  });

  it('allows link repair after table is stable even when alt remains low', () => {
    expect(shouldTryStage180LinkRepairAfterTable({
      analysis: analysis(79, { table_markup: 100, pdf_ua_compliance: 57 }),
      snapshot: snapshot({ tables: [] }),
    })).toBe(true);

    expect(shouldTryStage180LinkRepairAfterTable({
      analysis: analysis(74, { table_markup: 44, pdf_ua_compliance: 50 }),
      snapshot: snapshot(),
    })).toBe(false);
  });

  it('admits only high-volume repeated real-table template finalization candidates', () => {
    const candidateSnapshot = snapshot({
      pageCount: 44,
      tables: repeatedTemplateTables(120),
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      tableHeaderAudit: {
        tablesChecked: 120,
        headerAssociationMissingCount: 148,
        orphanHeaderCellCount: 326,
        dataCellsWithoutHeaderCount: 608,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
      },
      detectionProfile: {
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: { linkAnnotationsMissingStructure: 0, linkAnnotationsMissingStructParent: 0 },
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 141,
          stronglyIrregularTableCount: 31,
        },
      },
    });
    const candidateAnalysis = analysis(69, {
      heading_structure: 58,
      reading_order: 100,
      link_quality: 100,
      alt_text: 100,
      table_markup: 5,
    });

    expect(stage180RepeatedTemplateEvidence(candidateSnapshot)).toMatchObject({
      realReachableTableCount: 120,
      repeatedTemplateTableCount: 120,
      largestRepeatedGroupCount: 120,
      largestRepeatedGroupDebt: 360,
      tableHeaderDebt: 1082,
    });
    expect(shouldTryStage180RepeatedTemplateFinalization({
      analysis: candidateAnalysis,
      snapshot: candidateSnapshot,
    })).toBe(true);

    expect(shouldTryStage180RepeatedTemplateFinalization({
      analysis: analysis(93, { table_markup: 100, alt_text: 100, heading_structure: 100, reading_order: 100 }),
      snapshot: candidateSnapshot,
    })).toBe(false);
    expect(shouldTryStage180RepeatedTemplateFinalization({
      analysis: candidateAnalysis,
      snapshot: snapshot({
        ...candidateSnapshot,
        tables: repeatedTemplateTables(10),
      }),
    })).toBe(false);
  });

  it('rejects repeated-template candidates with non-table role evidence or non-table core debt', () => {
    const repeatedNonTables = repeatedTemplateTables(120).map(table => ({
      ...table,
      rawRole: 'Span',
      resolvedRole: 'Table',
    }));
    const coreSnapshot = snapshot({
      pageCount: 44,
      tables: repeatedNonTables,
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      tableHeaderAudit: {
        tablesChecked: 120,
        headerAssociationMissingCount: 148,
        orphanHeaderCellCount: 326,
        dataCellsWithoutHeaderCount: 608,
        headerCellsWithScopeCount: 0,
        headerCellsWithIdCount: 0,
        dataCellsWithHeadersCount: 0,
      },
      detectionProfile: {
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: { linkAnnotationsMissingStructure: 0, linkAnnotationsMissingStructParent: 0 },
        tableSignals: {
          directCellUnderTableCount: 0,
          misplacedCellCount: 0,
          irregularTableCount: 141,
          stronglyIrregularTableCount: 31,
        },
      },
    });

    expect(stage180RepeatedTemplateEvidence(coreSnapshot).realReachableTableCount).toBe(0);
    expect(shouldTryStage180RepeatedTemplateFinalization({
      analysis: analysis(69, {
        heading_structure: 58,
        reading_order: 100,
        link_quality: 100,
        alt_text: 100,
        table_markup: 5,
      }),
      snapshot: coreSnapshot,
    })).toBe(false);
    expect(shouldTryStage180RepeatedTemplateFinalization({
      analysis: analysis(69, {
        heading_structure: 58,
        reading_order: 100,
        link_quality: 100,
        alt_text: 100,
        table_markup: 5,
      }),
      snapshot: snapshot({
        ...coreSnapshot,
        tables: repeatedTemplateTables(120),
        annotationAccessibility: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 1,
          nonLinkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingContents: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
      }),
    })).toBe(false);
  });

  it('detects applied Stage 180 cleanup rows for late font-skip gating', () => {
    expect(hasAppliedStage180MixedTablePdfUa([
      {
        ...applied('normalize_table_structure', '2216_0'),
        details: JSON.stringify({ outcome: 'applied', note: 'stage180_explicit_table_continuation' }),
      },
    ])).toBe(true);

    expect(hasAppliedStage180MixedTablePdfUa([
      {
        ...applied('normalize_table_structure', '2216_0'),
        details: JSON.stringify({ outcome: 'applied', note: 'stage179_partial_alt_cleanup' }),
      },
      {
        ...applied('normalize_table_structure', '2897_0'),
        outcome: 'rejected',
        details: JSON.stringify({ outcome: 'rejected', note: 'stage180_explicit_table_continuation' }),
      },
    ])).toBe(false);
  });
});

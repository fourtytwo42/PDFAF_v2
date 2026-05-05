import { describe, expect, it } from 'vitest';
import {
  pacAcceptanceGateAppliesToTools,
  pacRuleAcceptanceGate,
} from '../../src/services/remediation/pacRuleAcceptanceGate.js';
import type { DocumentSnapshot } from '../../src/types.js';

function baseSnapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Readable text'],
    textCharCount: 120,
    imageOnlyPageCount: 0,
    metadata: { title: 'Accessible Report', language: 'en-US' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Accessible Report', page: 0 }],
    figures: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    detectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        structureTreeDepth: 2,
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

function missingFigureSnapshot(count: number): DocumentSnapshot {
  return baseSnapshot({
    figures: Array.from({ length: count }, (_, index) => ({
      hasAlt: false,
      isArtifact: false,
      page: 0,
      role: 'Figure',
      structRef: `${index + 1}_0`,
      reachable: true,
      directContent: true,
    })),
  });
}

describe('pacRuleAcceptanceGate', () => {
  it('rejects selected PAC rules that change from non-fail to fail', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: missingFigureSnapshot(1),
      toolNames: ['set_figure_alt_text'],
    });

    expect(decision.reject).toBe(true);
    expect(decision.reason).toBe('pac_rule_regressed(pdfua.figure.alt_present)');
    const details = JSON.parse(decision.details ?? '{}');
    expect(details.pacRuleRegression).toMatchObject({
      ruleId: 'pdfua.figure.alt_present',
      beforeStatus: 'not_applicable',
      afterStatus: 'fail',
      beforeCount: 0,
      afterCount: 1,
    });
  });

  it('rejects existing selected PAC failures when the failed count increases', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: missingFigureSnapshot(1),
      afterSnapshot: missingFigureSnapshot(2),
      toolNames: ['retag_as_figure'],
    });

    expect(decision.reject).toBe(true);
    expect(decision.reason).toBe('pac_rule_regressed(pdfua.figure.alt_present)');
    expect(JSON.parse(decision.details ?? '{}').pacRuleRegression).toMatchObject({
      beforeCount: 1,
      afterCount: 2,
    });
  });

  it('does not reject existing selected PAC failures with the same or lower count', () => {
    expect(pacRuleAcceptanceGate({
      beforeSnapshot: missingFigureSnapshot(2),
      afterSnapshot: missingFigureSnapshot(1),
      toolNames: ['retag_as_figure'],
    })).toEqual({ reject: false, reason: null });
  });

  it('does not reject unselected PAC rule regressions', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: baseSnapshot({ metadata: { title: '', language: 'en-US' } }),
      toolNames: ['bootstrap_struct_tree'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
  });

  it('does not reject warning, heuristic, or not-applicable changes unless a selected rule becomes fail', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: baseSnapshot({
        detectionProfile: {
          ...baseSnapshot().detectionProfile!,
          figureSignals: {
            extractedFigureCount: 0,
            treeFigureCount: 0,
            nonFigureRoleCount: 2,
            treeFigureMissingForExtractedFigures: false,
          },
        },
      }),
      toolNames: ['bootstrap_struct_tree'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
  });

  it('skips pure metadata tools even when PAC evidence changed', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: missingFigureSnapshot(1),
      toolNames: ['set_document_title'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
    expect(pacAcceptanceGateAppliesToTools(['set_document_title'])).toBe(false);
  });
});

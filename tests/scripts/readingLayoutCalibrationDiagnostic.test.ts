import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyReadingLayoutRow,
  loadSidecarReport,
  parseArgs,
  runReadingLayoutCalibration,
  type SidecarCalibrationRow,
} from '../../scripts/reading-layout-calibration-diagnostic.js';
import type { AnalysisResult, DocumentSnapshot, NativeLayoutAudit } from '../../src/types.js';

function layout(overrides: Partial<NativeLayoutAudit> = {}): NativeLayoutAudit {
  return {
    sampledPageCount: 1,
    textRunCount: 10,
    repeatedHeaderFooterBandCount: 0,
    repeatedHeaderFooterPageCount: 0,
    headerFooterBandTexts: [],
    multiColumnPageCount: 0,
    geometryOrderRiskPages: 0,
    layoutHeadingCandidateCount: 0,
    layoutHeadingCandidates: [],
    captionCandidateCount: 0,
    captionCandidates: [],
    layoutTableCandidateCount: 0,
    denseRowBandTableCandidateCount: 0,
    undersegmentedTableCandidateCount: 0,
    tableCandidates: [],
    ...overrides,
  };
}

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    id: 'analysis',
    timestamp: new Date(0).toISOString(),
    filename: 'sample.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: 55,
    grade: 'F',
    categories: [
      { key: 'reading_order', score: 30, applicable: true, weight: 1, severity: 'failure', findings: [] },
      { key: 'heading_structure', score: 0, applicable: true, weight: 1, severity: 'failure', findings: [] },
    ],
    scoreProfile: {
      id: 'detailed',
      overallScore: 55,
      grade: 'F',
      gradedCategories: [],
      nonGradedCategories: [],
      limitations: [],
      criticalBlockers: [],
      majorBlockers: [],
    },
    scopeChecklist: {
      isNonWebDocument: true,
      isWebPostedDocument: null,
      isPublicFacing: null,
      isCurrentUseDocument: null,
      isArchivedContentCandidate: null,
      isPreexistingDocumentCandidate: null,
      legalExceptionReviewRequired: false,
    },
    findings: [],
    analysisDurationMs: 1,
    ...overrides,
  } as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Overview Body text'],
    textCharCount: 18,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    paragraphStructElems: [],
    orphanMcids: [],
    mcidTextSpans: [],
    nativeTitleBtCandidates: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    layoutAudit: layout(),
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
        geometryOrderRiskPages: 0,
        suspiciousPageCount: 0,
      },
      headingSignals: {
        extractedHeadingCount: 0,
        treeHeadingCount: 0,
        headingTreeDepth: 0,
        layoutHeadingCandidateCount: 0,
        extractedHeadingsMissingFromTree: false,
      },
      figureSignals: {
        extractedFigureCount: 0,
        treeFigureCount: 0,
        nonFigureRoleCount: 0,
        captionCandidateCount: 0,
        figureCaptionPairCount: 0,
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
        layoutTableCandidateCount: 0,
        denseRowBandTableCandidateCount: 0,
      },
      sampledPages: [0],
      confidence: 'medium',
    },
    ...overrides,
  } as DocumentSnapshot;
}

function sidecar(overrides: Partial<SidecarCalibrationRow> = {}): SidecarCalibrationRow {
  return {
    id: 'focus',
    pdfPath: '/tmp/focus.pdf',
    comparison: { supportedLane: 'reading_order', reason: 'native layout evidence' },
    scoringCalibration: {
      suggestedScoringAction: 'reading_order_calibration_candidate',
      reason: 'ODL/native reading-order candidate',
    },
    ...overrides,
  };
}

describe('reading layout calibration diagnostic', () => {
  it('parses sidecar and control options', () => {
    const args = parseArgs([
      '--sidecar', '/tmp/report.json',
      '--out', '/tmp/out',
      '--limit', '2',
      '--no-controls',
    ]);
    expect(args.sidecar).toBe('/tmp/report.json');
    expect(args.outDir).toBe('/tmp/out');
    expect(args.limit).toBe(2);
    expect(args.includeControls).toBe(false);
  });

  it('classifies matched layout heading evidence as behavior-ready when tied to paragraph target', () => {
    const row = classifyReadingLayoutRow({
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      role: 'focus',
      sidecar: sidecar(),
      analysis: analysis(),
      snapshot: snapshot({
        layoutAudit: layout({
          layoutHeadingCandidateCount: 1,
          layoutHeadingCandidates: [{ text: 'Overview', page: 0, bbox: [72, 700, 170, 720] }],
        }),
        paragraphStructElems: [{
          tag: 'P',
          text: 'Overview',
          page: 0,
          structRef: '12_0',
          reachable: true,
          directContent: true,
          parentPath: ['Document'],
          bbox: [72, 700, 170, 720],
        }],
      }),
    });

    expect(row.classification).toBe('behavior_ready_existing_target');
    expect(row.candidates[0]).toMatchObject({
      decision: 'matched_existing_target',
      matchedTargetType: 'paragraph_struct_elem',
      matchedTargetId: '12_0',
    });
  });

  it('rejects caption, header/footer, and table-like samples as noise', () => {
    const row = classifyReadingLayoutRow({
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      role: 'focus',
      sidecar: sidecar(),
      analysis: analysis(),
      snapshot: snapshot({
        layoutAudit: layout({
          repeatedHeaderFooterBandCount: 1,
          repeatedHeaderFooterPageCount: 2,
          headerFooterBandTexts: [{ page: 0, kind: 'header', text: 'Agency Report' }],
          captionCandidateCount: 1,
          captionCandidates: [{ text: 'Figure 1. Trend', page: 0, bbox: [72, 120, 220, 135] }],
          layoutTableCandidateCount: 1,
          denseRowBandTableCandidateCount: 1,
          tableCandidates: [{
            page: 0,
            bbox: [72, 400, 520, 470],
            rowCount: 3,
            columnCount: 4,
            dense: true,
            undersegmented: true,
          }],
        }),
      }),
    });

    expect(row.classification).toBe('header_footer_or_table_noise');
    expect(row.candidates.map(candidate => candidate.exclusionReason)).toEqual(
      expect.arrayContaining(['caption_like_line', 'header_footer_band', 'table_row_band']),
    );
  });

  it('classifies geometry-only order evidence separately from remediation targets', () => {
    const row = classifyReadingLayoutRow({
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      role: 'focus',
      sidecar: sidecar(),
      analysis: analysis(),
      snapshot: snapshot({
        layoutAudit: layout({
          multiColumnPageCount: 2,
          geometryOrderRiskPages: 2,
        }),
      }),
    });

    expect(row.classification).toBe('scoring_only_order_risk');
    expect(row.promotionSupported).toBe(false);
  });

  it('keeps an accessible control with no score debt non-promotable', () => {
    const row = classifyReadingLayoutRow({
      id: 'pdfaf_fixture_accessible',
      pdfPath: '/home/hendo420/PDFAF_v2/Input/experiment-corpus/00-fixtures/pdfaf_fixture_accessible.pdf',
      role: 'control',
      sidecar: sidecar({ id: 'pdfaf_fixture_accessible' }),
      analysis: analysis({
        score: 96,
        grade: 'A',
        categories: [
          { key: 'reading_order', score: 100, applicable: true, weight: 1, severity: 'info', findings: [] },
          { key: 'heading_structure', score: 100, applicable: true, weight: 1, severity: 'info', findings: [] },
        ],
      }),
      snapshot: snapshot({
        layoutAudit: layout({
          layoutHeadingCandidateCount: 1,
          layoutHeadingCandidates: [{ text: 'Accessible Fixture', page: 0, bbox: [72, 700, 220, 720] }],
        }),
        paragraphStructElems: [{
          tag: 'P',
          text: 'Accessible Fixture',
          page: 0,
          structRef: '20_0',
        }],
      }),
    });

    expect(row.classification).toBe('no_native_support');
    expect(row.promotionSupported).toBe(false);
  });

  it('reports missing sidecar input as a clear diagnostic error', async () => {
    await expect(loadSidecarReport('/tmp/pdfaf-missing-sidecar-report.json')).rejects.toThrow(/Sidecar report not found/);
  });

  it('writes JSON and Markdown reports with an injected analyzer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-reading-layout-'));
    try {
      const sidecarPath = join(dir, 'comparison-report.json');
      await writeFile(sidecarPath, JSON.stringify({ rows: [sidecar()] }));
      const report = await runReadingLayoutCalibration({
        sidecar: sidecarPath,
        outDir: join(dir, 'out'),
        includeControls: true,
      }, async () => ({
        result: analysis(),
        snapshot: snapshot({
          layoutAudit: layout({
            geometryOrderRiskPages: 1,
            multiColumnPageCount: 1,
          }),
        }),
      }));

      expect(report.rows).toHaveLength(1);
      const json = await readFile(join(dir, 'out', 'reading-layout-calibration.json'), 'utf8');
      const md = await readFile(join(dir, 'out', 'reading-layout-calibration.md'), 'utf8');
      expect(json).toContain('scoring_only_order_risk');
      expect(md).toContain('Reading Layout Calibration Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

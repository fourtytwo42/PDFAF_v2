import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadPdfInputs,
  parseArgs,
  runCommandWithTimeout,
  scoringCalibrationForRow,
  summarizeOpenDataLoaderJson,
} from '../../scripts/opendataloader-sidecar-diagnostic.js';

describe('OpenDataLoader sidecar diagnostic helpers', () => {
  it('parses repeatable PDF inputs and sidecar settings', () => {
    const args = parseArgs([
      '--pdf', 'Input/a.pdf',
      '--pdf', 'Input/b.pdf',
      '--out', '/tmp/odl-out',
      '--limit', '1',
      '--odl-cmd', 'custom-odl',
      '--timeout-ms', '25',
    ]);
    expect(args.pdfs).toHaveLength(2);
    expect(args.outDir).toBe('/tmp/odl-out');
    expect(args.limit).toBe(1);
    expect(args.odlCmd).toBe('custom-odl');
    expect(args.timeoutMs).toBe(25);
  });

  it('loads manifest rows and de-duplicates PDF paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-odl-test-'));
    try {
      const manifest = join(dir, 'manifest.json');
      await writeFile(manifest, JSON.stringify({
        rows: [
          { id: 'one', file: 'one.pdf', title: 'One' },
          { id: 'one-repeat', file: 'one.pdf' },
          { id: 'two', localFile: 'two.pdf' },
        ],
      }));
      const inputs = await loadPdfInputs({
        pdfs: [],
        manifest,
        outDir: dir,
        odlCmd: 'opendataloader-pdf',
        timeoutMs: 60_000,
      });
      expect(inputs.map(input => input.id)).toEqual(['one', 'two']);
      expect(inputs[0]!.pdfPath).toBe(join(dir, 'one.pdf'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('records missing OpenDataLoader command as diagnostic status', async () => {
    const result = await runCommandWithTimeout('pdfaf-missing-odl-command-for-test', [], 1_000);
    expect(result.status).toBe('missing_command');
    expect(result.error).toMatch(/pdfaf-missing-odl-command-for-test|ENOENT|not found/i);
  });

  it('records timeout as row failure signal', async () => {
    const result = await runCommandWithTimeout(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      25,
    );
    expect(result.status).toBe('timeout');
  });

  it('summarizes OpenDataLoader heading, table, image, caption, and text evidence', () => {
    const summary = summarizeOpenDataLoaderJson({
      elements: [
        { type: 'heading', level: 2, text: 'Overview' },
        { type: 'table', rowCount: 4, columnCount: 3 },
        { type: 'image' },
        { type: 'caption', text: 'Figure 1. Example' },
      ],
    });
    expect(summary.headingCount).toBe(1);
    expect(summary.headingLevels).toEqual([2]);
    expect(summary.tableCount).toBe(1);
    expect(summary.denseTableHintCount).toBe(1);
    expect(summary.imageCount).toBe(1);
    expect(summary.captionCount).toBe(1);
    expect(summary.textSamples).toEqual(['Overview', 'Figure 1. Example']);
  });

  it('recommends native text-extractability scoring when replacement risk is present', () => {
    const calibration = scoringCalibrationForRow({
      pageCount: 10,
      textCharCount: 10_000,
      score: 92,
      grade: 'A',
      categoryScores: { text_extractability: 100, reading_order: 100, table_markup: 100 },
      detectionProfile: null,
      headingCount: 1,
      headingLevels: [1],
      tableCount: 0,
      tableShapes: [],
      imageCount: 0,
      captionCount: 0,
      textSamples: ['example'],
      layoutAudit: null,
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
        replacementCharacterCount: 500,
        replacementCharacterRatio: 0.05,
        highReplacementCharacterPageCount: 0,
      },
      replacementCharacterRisk: {
        level: 'moderate',
        scoreCap: 70,
        replacementCharacterRatio: 0.05,
        replacementCharacterCount: 500,
        highReplacementCharacterPageCount: 0,
        highReplacementCharacterPageRatio: 0,
      },
    }, {
      headingDelta: 0,
      tableDelta: 0,
      imageDelta: 0,
      captionDelta: 0,
      textOrderSimilarity: 1,
      supportedLane: 'no_safe_lane',
      reason: 'none',
    });

    expect(calibration.suggestedScoringAction).toBe('text_extractability_penalty');
    expect(calibration.nativePdfafSignalAvailable.replacementCharacterTextRiskCap).toBe(70);
  });

  it('recommends reading-order calibration only when native layout evidence exists', () => {
    const calibration = scoringCalibrationForRow({
      pageCount: 4,
      textCharCount: 5_000,
      score: 65,
      grade: 'D',
      categoryScores: { reading_order: 45, heading_structure: 0, table_markup: 100 },
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          geometryOrderRiskPages: 1,
          suspiciousPageCount: 1,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          layoutHeadingCandidateCount: 3,
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
      headingCount: 0,
      headingLevels: [],
      tableCount: 0,
      tableShapes: [],
      imageCount: 0,
      captionCount: 0,
      textSamples: ['right column first'],
      fontSyntaxAudit: null,
      layoutAudit: {
        sampledPageCount: 1,
        textRunCount: 8,
        repeatedHeaderFooterBandCount: 0,
        repeatedHeaderFooterPageCount: 0,
        headerFooterBandTexts: [],
        multiColumnPageCount: 1,
        geometryOrderRiskPages: 1,
        layoutHeadingCandidateCount: 3,
        layoutHeadingCandidates: [],
        captionCandidateCount: 0,
        captionCandidates: [],
        layoutTableCandidateCount: 0,
        denseRowBandTableCandidateCount: 0,
        undersegmentedTableCandidateCount: 0,
        tableCandidates: [],
      },
      replacementCharacterRisk: null,
    }, {
      headingDelta: 4,
      tableDelta: 0,
      imageDelta: 0,
      captionDelta: 0,
      textOrderSimilarity: 0.1,
      supportedLane: 'reading_order',
      reason: 'native geometry evidence',
    });

    expect(calibration.suggestedScoringAction).toBe('reading_order_calibration_candidate');
    expect(calibration.nativePdfafSignalAvailable.geometryOrderRiskPages).toBe(1);
    expect(calibration.nativePdfafSignalAvailable.layoutHeadingCandidateCount).toBe(3);
  });
});

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildReadingHeadingDiscriminatorReport,
  classifyReadingHeadingDiscriminator,
  loadReadingLayoutCalibrationReport,
  parseArgs,
  runReadingHeadingDiscriminator,
} from '../../scripts/reading-heading-discriminator-diagnostic.js';
import type {
  LayoutCandidateEvaluation,
  ReadingLayoutCalibrationReport,
  ReadingLayoutDiagnosticRow,
} from '../../scripts/reading-layout-calibration-diagnostic.js';

function match(text: string, targetType: LayoutCandidateEvaluation['matchedTargetType'] = 'mcid_text_span'): LayoutCandidateEvaluation {
  return {
    source: 'layout_heading_candidate',
    text,
    page: 0,
    bbox: [72, 700, 220, 720],
    decision: 'matched_existing_target',
    matchedTargetType: targetType,
    matchedTargetId: `${targetType}:1`,
    reasons: ['matched_test_target'],
  };
}

function excluded(source: LayoutCandidateEvaluation['source'], reason: NonNullable<LayoutCandidateEvaluation['exclusionReason']>): LayoutCandidateEvaluation {
  return {
    source,
    text: source === 'table_row_band' ? 'table-like row band (3x4)' : 'noise',
    page: 0,
    bbox: [72, 400, 520, 470],
    decision: 'excluded',
    exclusionReason: reason,
    reasons: [reason],
  };
}

function row(overrides: Partial<ReadingLayoutDiagnosticRow> = {}): ReadingLayoutDiagnosticRow {
  return {
    id: 'focus-report',
    pdfPath: '/tmp/focus-report.pdf',
    title: 'Focus Report',
    role: 'focus',
    analysisStatus: 'ok',
    analysisRuntimeMs: 1,
    classification: 'behavior_ready_existing_target',
    promotionSupported: true,
    reasons: [],
    sourceSidecar: {
      supportedLane: 'reading_order',
      suggestedScoringAction: 'reading_order_calibration_candidate',
      reason: 'test',
    },
    scores: { overall: 56, grade: 'F', readingOrder: 30, headingStructure: 0 },
    structure: {
      pdfClass: 'native_tagged',
      structureTreeDepth: 2,
      treeHeadingCount: 0,
      exportedHeadingCount: 0,
      paragraphStructElemCount: 10,
      mcidTextSpanCount: 40,
      nativeTitleBtCandidateCount: 0,
    },
    layout: {
      sampledPageCount: 20,
      geometryOrderRiskPages: 2,
      multiColumnPageCount: 2,
      repeatedHeaderFooterPageCount: 25,
      layoutHeadingCandidateCount: 90,
      captionCandidateCount: 0,
      layoutTableCandidateCount: 8,
    },
    candidates: [
      match('Drug Cases Submitted to the', 'paragraph_struct_elem'),
      match('Virginia Department of Forensic Science', 'mcid_text_span'),
      excluded('table_row_band', 'table_row_band'),
    ],
    ...overrides,
  };
}

function calibration(rows: ReadingLayoutDiagnosticRow[]): ReadingLayoutCalibrationReport {
  return {
    createdAt: new Date(0).toISOString(),
    sidecarPath: '/tmp/sidecar.json',
    outDir: '/tmp/calibration',
    selectedRowCount: rows.length,
    classificationDistribution: {} as never,
    decision: { status: 'reject_reading_heading_lane_controls_trigger', reasons: [] },
    rows,
  };
}

describe('reading/heading discriminator diagnostic', () => {
  it('parses input and output paths', () => {
    const args = parseArgs(['--input', '/tmp/calibration.json', '--out', '/tmp/out']);
    expect(args.input).toBe('/tmp/calibration.json');
    expect(args.outDir).toBe('/tmp/out');
  });

  it('passes an outside report-style positive with target-backed report-scale evidence', () => {
    const result = classifyReadingHeadingDiscriminator(row());
    expect(result.discriminator).toBe('report_layout_heading_recovery_candidate');
    expect(result.features.reportScaleSignal).toBe(true);
    expect(result.features.targetBackedSignal).toBe(true);
  });

  it('rejects Teams-like short guide controls despite target matches', () => {
    const result = classifyReadingHeadingDiscriminator(row({
      id: 'teams-control',
      role: 'control',
      scores: { overall: 71, grade: 'C', readingOrder: 67, headingStructure: 86 },
      layout: {
        sampledPageCount: 8,
        geometryOrderRiskPages: 1,
        multiColumnPageCount: 2,
        repeatedHeaderFooterPageCount: 5,
        layoutHeadingCandidateCount: 19,
        captionCandidateCount: 0,
        layoutTableCandidateCount: 5,
      },
      candidates: [
        match('Quick Start Guide'),
        match('Move around Teams'),
        match('Sign in'),
        match('Pick a team and channel'),
        excluded('table_row_band', 'table_row_band'),
      ],
    }));

    expect(result.discriminator).toBe('control_like_short_guide_or_table_noise');
    expect(result.features.reportScaleSignal).toBe(false);
  });

  it('rejects ADAM/table-noise controls with no target-backed report evidence', () => {
    const result = classifyReadingHeadingDiscriminator(row({
      id: 'ADAM2',
      role: 'control',
      classification: 'control_not_safe',
      promotionSupported: false,
      layout: {
        sampledPageCount: 4,
        geometryOrderRiskPages: 0,
        multiColumnPageCount: 0,
        repeatedHeaderFooterPageCount: 0,
        layoutHeadingCandidateCount: 21,
        captionCandidateCount: 2,
        layoutTableCandidateCount: 4,
      },
      candidates: [
        excluded('table_row_band', 'table_row_band'),
        excluded('table_row_band', 'table_row_band'),
        excluded('caption_candidate', 'caption_like_line'),
        excluded('layout_heading_candidate', 'table_row_band'),
      ],
    }));

    expect(result.discriminator).toBe('control_like_short_guide_or_table_noise');
    expect(result.features.targetBackedSignal).toBe(false);
  });

  it('keeps geometry-only rows as scoring-only candidates', () => {
    const result = classifyReadingHeadingDiscriminator(row({
      id: 'geometry-only',
      classification: 'scoring_only_order_risk',
      promotionSupported: false,
      layout: {
        sampledPageCount: 20,
        geometryOrderRiskPages: 2,
        multiColumnPageCount: 2,
        repeatedHeaderFooterPageCount: 25,
        layoutHeadingCandidateCount: 130,
        captionCandidateCount: 0,
        layoutTableCandidateCount: 18,
      },
      candidates: [
        excluded('table_row_band', 'table_row_band'),
        excluded('layout_heading_candidate', 'table_row_band'),
      ],
    }));

    expect(result.discriminator).toBe('geometry_order_scoring_only_candidate');
  });

  it('keeps accessible controls non-promotable when there is no score debt', () => {
    const result = classifyReadingHeadingDiscriminator(row({
      id: 'pdfaf_fixture_accessible',
      role: 'control',
      classification: 'no_native_support',
      promotionSupported: false,
      scores: { overall: 96, grade: 'A', readingOrder: 100, headingStructure: 100 },
      layout: {
        sampledPageCount: 3,
        geometryOrderRiskPages: 0,
        multiColumnPageCount: 0,
        repeatedHeaderFooterPageCount: 0,
        layoutHeadingCandidateCount: 6,
        captionCandidateCount: 0,
        layoutTableCandidateCount: 1,
      },
      candidates: [excluded('table_row_band', 'table_row_band')],
    }));

    expect(result.discriminator).toBe('no_safe_discriminator');
  });

  it('selects a clean discriminator only when controls do not match the report predicate', () => {
    const report = buildReadingHeadingDiscriminatorReport(calibration([
      row({ id: 'focus-1' }),
      row({ id: 'focus-2' }),
      row({ id: 'focus-3' }),
      row({
        id: 'teams-control',
        role: 'control',
        layout: {
          sampledPageCount: 8,
          geometryOrderRiskPages: 1,
          multiColumnPageCount: 2,
          repeatedHeaderFooterPageCount: 5,
          layoutHeadingCandidateCount: 19,
          captionCandidateCount: 0,
          layoutTableCandidateCount: 5,
        },
        candidates: [match('Quick Start Guide')],
      }),
    ]), '/tmp/in.json', '/tmp/out');

    expect(report.decision.status).toBe('clean_report_layout_discriminator_found');
    expect(report.controlDistribution.report_layout_heading_recovery_candidate ?? 0).toBe(0);
  });

  it('reports missing calibration input clearly', async () => {
    await expect(loadReadingLayoutCalibrationReport('/tmp/pdfaf-missing-reading-layout-calibration.json')).rejects.toThrow(
      /Reading layout calibration report not found/,
    );
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-reading-heading-discriminator-'));
    try {
      const input = join(dir, 'reading-layout-calibration.json');
      await writeFile(input, JSON.stringify(calibration([row({ id: 'focus-1' }), row({ id: 'focus-2' }), row({ id: 'focus-3' })])));
      const report = await runReadingHeadingDiscriminator({
        input,
        outDir: join(dir, 'out'),
      });
      expect(report.decision.status).toBe('clean_report_layout_discriminator_found');
      const json = await readFile(join(dir, 'out', 'reading-heading-discriminator.json'), 'utf8');
      const md = await readFile(join(dir, 'out', 'reading-heading-discriminator.md'), 'utf8');
      expect(json).toContain('report_layout_heading_recovery_candidate');
      expect(md).toContain('Reading/Heading Discriminator Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

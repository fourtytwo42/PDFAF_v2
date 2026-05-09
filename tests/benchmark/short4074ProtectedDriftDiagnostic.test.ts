import { describe, expect, it } from 'vitest';
import {
  buildShort4074ProtectedDriftDiagnostic,
} from '../../scripts/short4074-protected-drift-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function category(key: string, score: number, applicable = true) {
  return {
    key,
    score,
    weight: 1,
    applicable,
    severity: score >= 90 ? 'pass' : 'critical',
    findings: [],
    evidence: 'verified',
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    countsTowardGrade: true,
    diagnosticOnly: false,
    measurementStatus: 'measured',
  } as RemediateBenchmarkRow['afterCategories'][number];
}

function pacReason(rule: string): string {
  return `PAC rule failure: ${rule}`;
}

function row(input: Partial<RemediateBenchmarkRow> = {}): RemediateBenchmarkRow {
  return {
    id: 'short-4074',
    file: 'short-4074.pdf',
    cohort: '10-short-near-pass',
    sourceType: 'original',
    intent: 'test',
    beforeScore: 58,
    beforeGrade: 'F',
    beforePdfClass: 'native_tagged',
    afterScore: input.afterScore ?? 95,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: 'native_tagged',
    afterCategories: input.afterCategories ?? [
      category('alt_text', 100, false),
      category('reading_order', 79),
      category('pdf_ua_compliance', 67),
    ],
    afterManualReviewReasons: input.afterManualReviewReasons ?? [
      pacReason('pdfua.structure.parent_links_valid'),
    ],
    afterDetectionProfile: input.afterDetectionProfile ?? {
      figureSignals: {
        extractedFigureCount: 0,
        treeFigureCount: 1,
      },
    } as RemediateBenchmarkRow['afterDetectionProfile'],
    reanalyzedScore: input.reanalyzedScore ?? 59,
    reanalyzedGrade: input.reanalyzedGrade ?? 'F',
    reanalyzedPdfClass: 'native_tagged',
    reanalyzedCategories: input.reanalyzedCategories ?? [
      category('alt_text', 0, true),
      category('reading_order', 79),
      category('pdf_ua_compliance', 67),
    ],
    reanalyzedManualReviewReasons: input.reanalyzedManualReviewReasons ?? [
      pacReason('pdfua.structure.parent_links_valid'),
      pacReason('pdfua.figure.alt_present'),
      pacReason('pdfua.figure.checker_visible_alt_present'),
    ],
    reanalyzedDetectionProfile: input.reanalyzedDetectionProfile ?? {
      figureSignals: {
        extractedFigureCount: 1,
        treeFigureCount: 1,
      },
    } as RemediateBenchmarkRow['reanalyzedDetectionProfile'],
    delta: null,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: 1,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
  } as RemediateBenchmarkRow;
}

function diagnostic(input?: Partial<RemediateBenchmarkRow>) {
  return buildShort4074ProtectedDriftDiagnostic({
    generatedAt: '2026-05-09T00:00:00.000Z',
    runDir: 'run',
    row: input === undefined ? row() : row(input),
  });
}

describe('short-4074 protected drift diagnostic', () => {
  it('classifies protected reanalysis figure applicability drift', () => {
    const report = diagnostic();

    expect(report).toMatchObject({
      rowId: 'short-4074',
      classification: 'protected_reanalysis_figure_applicability_drift',
      score: {
        after: 95,
        afterGrade: 'A',
        reanalyzed: 59,
        reanalyzedGrade: 'F',
        delta: 36,
      },
      evidence: {
        afterExtractedFigures: 0,
        reanalyzedExtractedFigures: 1,
        afterTreeFigures: 1,
        reanalyzedTreeFigures: 1,
        afterAltScore: 100,
        reanalyzedAltScore: 0,
        afterAltApplicable: false,
        reanalyzedAltApplicable: true,
      },
    });
    expect(report.evidence.newPacReasons).toEqual([
      pacReason('pdfua.figure.alt_present'),
      pacReason('pdfua.figure.checker_visible_alt_present'),
    ]);
  });

  it('classifies a floor-safe row as a safe checkpoint candidate', () => {
    expect(diagnostic({
      reanalyzedScore: 94,
      reanalyzedGrade: 'A',
      reanalyzedCategories: [
        category('alt_text', 100, false),
        category('reading_order', 79),
      ],
      reanalyzedManualReviewReasons: [
        pacReason('pdfua.structure.parent_links_valid'),
      ],
      reanalyzedDetectionProfile: {
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 1,
        },
      } as RemediateBenchmarkRow['reanalyzedDetectionProfile'],
    }).classification).toBe('safe_checkpoint_candidate');
  });

  it('classifies applicable low alt evidence as real figure-alt debt when drift shape is absent', () => {
    expect(diagnostic({
      afterDetectionProfile: {
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 1,
        },
      } as RemediateBenchmarkRow['afterDetectionProfile'],
    }).classification).toBe('real_figure_alt_debt');
  });

  it('handles missing row evidence deterministically', () => {
    const report = buildShort4074ProtectedDriftDiagnostic({
      generatedAt: '2026-05-09T00:00:00.000Z',
      runDir: 'run',
    });

    expect(report).toMatchObject({
      classification: 'insufficient_evidence',
      score: {
        after: null,
        reanalyzed: null,
      },
      evidence: {
        afterExtractedFigures: null,
        reanalyzedExtractedFigures: null,
      },
    });
  });
});

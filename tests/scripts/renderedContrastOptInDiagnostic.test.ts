import { describe, expect, it } from 'vitest';
import {
  buildRenderedContrastReport,
  classifyRenderedContrast,
  type RenderedContrastDiagnosticRow,
  type RenderedContrastFeatures,
} from '../../scripts/rendered-contrast-opt-in-diagnostic.js';

function features(overrides: Partial<RenderedContrastFeatures> = {}): RenderedContrastFeatures {
  return {
    score: 92,
    grade: 'A',
    colorContrastCategory: 100,
    colorContrastApplicable: false,
    measured: true,
    sampledPageCount: 2,
    sampledTextRunCount: 100,
    measuredTextRunCount: 90,
    lowContrastTextRunCount: 0,
    uncertainTextRunCount: 10,
    minContrastRatio: 7.2,
    medianContrastRatio: 12.4,
    confidenceReason: 'bounded_rendered_text_sampling',
    lowContrastSamples: [],
    uncertainSamples: [],
    measurementMs: 500,
    ...overrides,
  };
}

function row(
  classification: RenderedContrastDiagnosticRow['classification'],
  role: 'focus' | 'control' = 'focus',
): RenderedContrastDiagnosticRow {
  const rowFeatures = classification === 'low_contrast_candidate'
    ? features({
        lowContrastTextRunCount: 2,
        minContrastRatio: 2.8,
        lowContrastSamples: [{ page: 0, text: 'Low contrast', ratio: 2.8, bbox: [0, 0, 10, 10] }],
      })
    : classification === 'uncertain_contrast_evidence'
      ? features({
          measured: true,
          sampledTextRunCount: 100,
          measuredTextRunCount: 20,
          lowContrastTextRunCount: 0,
          uncertainTextRunCount: 80,
          minContrastRatio: 7,
          medianContrastRatio: 10,
          confidenceReason: 'many_uncertain_text_runs',
        })
      : features();
  return {
    id: `${role}-${classification}`,
    pdfPath: `/tmp/${role}-${classification}.pdf`,
    title: classification,
    role,
    classification,
    suggestedAction: classification === 'low_contrast_candidate'
      ? 'contrast_validation_needed'
      : classification === 'uncertain_contrast_evidence'
        ? 'sampling_hardening_needed'
        : 'no_action',
    reasons: [],
    features: rowFeatures,
  };
}

describe('rendered contrast opt-in diagnostic classifier', () => {
  it('classifies measured low contrast as a validation candidate', () => {
    const result = classifyRenderedContrast(features({
      lowContrastTextRunCount: 3,
      minContrastRatio: 2.9,
    }));

    expect(result.classification).toBe('low_contrast_candidate');
    expect(result.suggestedAction).toBe('contrast_validation_needed');
    expect(result.reasons).toContain('low_contrast_runs:3');
  });

  it('classifies unmeasured rows as diagnostic-only', () => {
    const result = classifyRenderedContrast(features({
      measured: false,
      sampledTextRunCount: 0,
      measuredTextRunCount: 0,
      lowContrastTextRunCount: 0,
      uncertainTextRunCount: 0,
      minContrastRatio: null,
      medianContrastRatio: null,
      confidenceReason: 'no_measurable_text_runs',
    }));

    expect(result.classification).toBe('contrast_not_measured');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('separates high-uncertainty sampling from no-low-contrast evidence', () => {
    const uncertain = classifyRenderedContrast(features({
      sampledTextRunCount: 100,
      measuredTextRunCount: 25,
      uncertainTextRunCount: 75,
      lowContrastTextRunCount: 0,
      confidenceReason: 'many_uncertain_text_runs',
    }));
    expect(uncertain.classification).toBe('uncertain_contrast_evidence');
    expect(uncertain.suggestedAction).toBe('sampling_hardening_needed');

    const clean = classifyRenderedContrast(features({
      sampledTextRunCount: 100,
      measuredTextRunCount: 95,
      uncertainTextRunCount: 5,
      lowContrastTextRunCount: 0,
    }));
    expect(clean.classification).toBe('no_low_contrast_detected');
    expect(clean.suggestedAction).toBe('no_action');
  });

  it('plans validation only when focus rows have low contrast and controls do not', () => {
    const report = buildRenderedContrastReport({
      outDir: '/tmp/out',
      maxPages: 2,
      maxTextRuns: 100,
      rows: [row('low_contrast_candidate')],
    });
    expect(report.decision.status).toBe('plan_rendered_contrast_validation');

    const controlReport = buildRenderedContrastReport({
      outDir: '/tmp/out',
      maxPages: 2,
      maxTextRuns: 100,
      rows: [row('low_contrast_candidate'), row('low_contrast_candidate', 'control')],
    });
    expect(controlReport.decision.status).toBe('keep_rendered_contrast_opt_in_diagnostic_only');
  });

  it('plans sampling hardening for uncertain opt-in measurements', () => {
    const report = buildRenderedContrastReport({
      outDir: '/tmp/out',
      maxPages: 2,
      maxTextRuns: 100,
      rows: [row('uncertain_contrast_evidence')],
    });

    expect(report.decision.status).toBe('plan_rendered_contrast_sampling_hardening');
  });
});

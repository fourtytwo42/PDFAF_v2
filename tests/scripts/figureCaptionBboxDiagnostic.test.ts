import { describe, expect, it } from 'vitest';
import {
  buildFigureCaptionBboxReport,
  classifyFigureCaptionBboxEvidence,
  type FigureCaptionBboxDiagnosticRow,
  type FigureCaptionBboxFeatures,
} from '../../scripts/figure-caption-bbox-diagnostic.js';

function features(overrides: Partial<FigureCaptionBboxFeatures> = {}): FigureCaptionBboxFeatures {
  return {
    score: 96,
    grade: 'A',
    pdfClass: 'native_tagged',
    pageCount: 8,
    altText: 100,
    pdfUaCompliance: 96,
    hasStructure: true,
    figureCount: 2,
    informativeFigureCount: 2,
    checkerFigureCount: 2,
    missingAltFigureCount: 0,
    checkerMissingAltCount: 0,
    weakAltFigureCount: 0,
    missingBBoxFigureCount: 0,
    figureWithBBoxCount: 2,
    captionCandidateCount: 0,
    figureCaptionPairCount: 0,
    pacFailures: [],
    pacWarnings: [],
    ...overrides,
  };
}

function row(
  classification: FigureCaptionBboxDiagnosticRow['classification'],
  role: FigureCaptionBboxDiagnosticRow['role'] = 'focus',
): FigureCaptionBboxDiagnosticRow {
  return {
    id: `${role}-${classification}`,
    pdfPath: `/tmp/${role}-${classification}.pdf`,
    title: classification,
    role,
    classification,
    suggestedAction: classification === 'caption_alt_behavior_candidate'
      ? 'caption_alt_validation_needed'
      : classification === 'bbox_scoring_validation_candidate'
        ? 'bbox_score_cap_validation_needed'
        : 'keep_diagnostic',
    reasons: [],
    features: features(),
  };
}

describe('figure/caption/BBox diagnostic classifier', () => {
  it('classifies missing alt plus native caption-pair evidence as a behavior candidate', () => {
    const result = classifyFigureCaptionBboxEvidence(features({
      altText: 20,
      missingAltFigureCount: 2,
      checkerMissingAltCount: 2,
      captionCandidateCount: 3,
      figureCaptionPairCount: 2,
      pacFailures: ['pdfua.figure.alt_present', 'pdfua.figure.checker_visible_alt_present'],
    }));

    expect(result.classification).toBe('caption_alt_behavior_candidate');
    expect(result.suggestedAction).toBe('caption_alt_validation_needed');
  });

  it('classifies missing BBox on otherwise strong PDF/UA as stricter scoring validation', () => {
    const result = classifyFigureCaptionBboxEvidence(features({
      pdfUaCompliance: 89,
      missingBBoxFigureCount: 3,
      figureWithBBoxCount: 0,
      pacFailures: ['pdfua.figure.bbox_present'],
    }));

    expect(result.classification).toBe('bbox_scoring_validation_candidate');
    expect(result.suggestedAction).toBe('bbox_score_cap_validation_needed');
  });

  it('keeps ordinary figure alt debt as already score-active when no caption pair exists', () => {
    const result = classifyFigureCaptionBboxEvidence(features({
      altText: 20,
      missingAltFigureCount: 4,
      checkerMissingAltCount: 4,
      pacFailures: ['pdfua.figure.alt_present'],
    }));

    expect(result.classification).toBe('figure_alt_existing_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('keeps caption candidates with no figure debt diagnostic-only', () => {
    const result = classifyFigureCaptionBboxEvidence(features({
      captionCandidateCount: 5,
      figureCaptionPairCount: 2,
    }));

    expect(result.classification).toBe('figure_caption_noise_or_control');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('requires clean controls before planning caption behavior', () => {
    expect(buildFigureCaptionBboxReport('/tmp/out', [
      row('caption_alt_behavior_candidate'),
      row('caption_alt_behavior_candidate'),
    ]).decision.status).toBe('plan_caption_alt_behavior_validation');

    expect(buildFigureCaptionBboxReport('/tmp/out', [
      row('caption_alt_behavior_candidate'),
      row('caption_alt_behavior_candidate'),
      row('caption_alt_behavior_candidate', 'control'),
    ]).decision.status).toBe('keep_figure_caption_bbox_diagnostic_only');
  });

  it('plans BBox scoring validation only after enough focus rows and no controls', () => {
    expect(buildFigureCaptionBboxReport('/tmp/out', [
      row('bbox_scoring_validation_candidate'),
      row('bbox_scoring_validation_candidate'),
    ]).decision.status).toBe('keep_figure_caption_bbox_diagnostic_only');

    expect(buildFigureCaptionBboxReport('/tmp/out', [
      row('bbox_scoring_validation_candidate'),
      row('bbox_scoring_validation_candidate'),
      row('bbox_scoring_validation_candidate'),
    ]).decision.status).toBe('plan_bbox_scoring_validation');
  });
});

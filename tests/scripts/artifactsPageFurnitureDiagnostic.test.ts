import { describe, expect, it } from 'vitest';
import {
  buildArtifactPageFurnitureReport,
  classifyArtifactPageFurnitureEvidence,
  type ArtifactPageFurnitureDiagnosticRow,
  type ArtifactPageFurnitureFeatures,
} from '../../scripts/artifacts-page-furniture-diagnostic.js';

function features(overrides: Partial<ArtifactPageFurnitureFeatures> = {}): ArtifactPageFurnitureFeatures {
  return {
    score: 96,
    grade: 'A',
    pdfClass: 'native_tagged',
    pageCount: 12,
    readingOrder: 96,
    headingStructure: 96,
    tableMarkup: 96,
    altText: 96,
    pdfUaCompliance: 96,
    sampledPageCount: 12,
    repeatedHeaderFooterBandCount: 0,
    repeatedHeaderFooterPageCount: 0,
    headerFooterCoverageRatio: 0,
    headerFooterPollutionRisk: false,
    layoutHeadingCandidateCount: 0,
    captionCandidateCount: 0,
    layoutTableCandidateCount: 0,
    denseRowBandTableCandidateCount: 0,
    artifactBoundaryDebt: 0,
    contentOutsideMarkedContentDebt: 0,
    contentOutsidePageBounds: 0,
    pacFailures: [],
    verifiedFailRules: [],
    scoreCapRules: [],
    failRulesWithScoringPolicy: [],
    failRulesWithoutScoringPolicy: [],
    ...overrides,
  };
}

function row(
  classification: ArtifactPageFurnitureDiagnosticRow['classification'],
  role: ArtifactPageFurnitureDiagnosticRow['role'] = 'focus',
): ArtifactPageFurnitureDiagnosticRow {
  const rowFeatures = classification === 'page_furniture_safety_candidate'
    ? features({
        readingOrder: 79,
        repeatedHeaderFooterBandCount: 2,
        repeatedHeaderFooterPageCount: 8,
        sampledPageCount: 12,
        headerFooterCoverageRatio: 8 / 12,
        layoutHeadingCandidateCount: 24,
      })
    : features();
  return {
    id: `${role}-${classification}`,
    pdfPath: `/tmp/${role}-${classification}.pdf`,
    title: classification,
    role,
    classification,
    suggestedAction: classification === 'page_furniture_safety_candidate'
      ? 'safety_filter_validation_needed'
      : classification === 'verified_artifact_boundary_score_active' || classification === 'content_tagging_score_active'
        ? 'already_score_active'
        : 'keep_diagnostic',
    reasons: [],
    features: rowFeatures,
  };
}

describe('artifacts/page-furniture diagnostic classifier', () => {
  it('treats verified artifact-boundary failures as already score-active', () => {
    const result = classifyArtifactPageFurnitureEvidence(features({
      artifactBoundaryDebt: 2,
      pacFailures: ['pdfua.content.artifact_tag_boundary_valid'],
      verifiedFailRules: ['pdfua.content.artifact_tag_boundary_valid'],
      failRulesWithScoringPolicy: ['pdfua.content.artifact_tag_boundary_valid'],
      scoreCapRules: ['pdfua.content.artifact_tag_boundary_valid'],
    }));

    expect(result.classification).toBe('verified_artifact_boundary_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('treats direct content tagging failures as already score-active', () => {
    const result = classifyArtifactPageFurnitureEvidence(features({
      contentOutsideMarkedContentDebt: 5,
      pacFailures: ['pdfua.content.text_tagged_or_artifacted'],
      failRulesWithScoringPolicy: ['pdfua.content.text_tagged_or_artifacted'],
    }));

    expect(result.classification).toBe('content_tagging_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('classifies repeated page furniture plus category debt as a safety candidate', () => {
    const result = classifyArtifactPageFurnitureEvidence(features({
      readingOrder: 79,
      repeatedHeaderFooterBandCount: 2,
      repeatedHeaderFooterPageCount: 8,
      sampledPageCount: 12,
      headerFooterCoverageRatio: 8 / 12,
      headerFooterPollutionRisk: true,
      layoutHeadingCandidateCount: 24,
    }));

    expect(result.classification).toBe('page_furniture_safety_candidate');
    expect(result.suggestedAction).toBe('safety_filter_validation_needed');
  });

  it('keeps repeated page furniture out of promotion when category debt is absent', () => {
    const result = classifyArtifactPageFurnitureEvidence(features({
      repeatedHeaderFooterBandCount: 2,
      repeatedHeaderFooterPageCount: 8,
      sampledPageCount: 12,
      headerFooterCoverageRatio: 8 / 12,
      layoutHeadingCandidateCount: 24,
    }));

    expect(result.classification).toBe('page_furniture_noise_or_control');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('does not promote sparse page furniture evidence', () => {
    const result = classifyArtifactPageFurnitureEvidence(features({
      readingOrder: 79,
      repeatedHeaderFooterPageCount: 2,
      sampledPageCount: 12,
      headerFooterCoverageRatio: 2 / 12,
      layoutHeadingCandidateCount: 24,
    }));

    expect(result.classification).toBe('page_furniture_noise_or_control');
  });

  it('classifies clean rows with no signal as no action', () => {
    const result = classifyArtifactPageFurnitureEvidence(features());

    expect(result.classification).toBe('no_artifact_page_furniture_signal');
    expect(result.suggestedAction).toBe('no_action');
  });

  it('plans safety-filter validation only with focus candidates and clean controls', () => {
    expect(buildArtifactPageFurnitureReport('/tmp/out', [
      row('page_furniture_safety_candidate'),
      row('page_furniture_safety_candidate'),
      row('page_furniture_safety_candidate'),
    ]).decision.status).toBe('plan_page_furniture_safety_filter_validation');

    expect(buildArtifactPageFurnitureReport('/tmp/out', [
      row('page_furniture_safety_candidate'),
      row('page_furniture_safety_candidate'),
      row('page_furniture_safety_candidate', 'control'),
    ]).decision.status).toBe('keep_artifact_page_furniture_diagnostic_only');
  });

  it('counts page-furniture safety controls even when classified as score-active content debt', () => {
    const scoreActiveControl = row('content_tagging_score_active', 'control');
    scoreActiveControl.features = features({
      readingOrder: 79,
      repeatedHeaderFooterBandCount: 2,
      repeatedHeaderFooterPageCount: 8,
      sampledPageCount: 12,
      headerFooterCoverageRatio: 8 / 12,
      layoutHeadingCandidateCount: 24,
      contentOutsideMarkedContentDebt: 5,
      pacFailures: ['pdfua.content.text_tagged_or_artifacted'],
      failRulesWithScoringPolicy: ['pdfua.content.text_tagged_or_artifacted'],
    });

    expect(buildArtifactPageFurnitureReport('/tmp/out', [
      row('page_furniture_safety_candidate'),
      row('page_furniture_safety_candidate'),
      row('page_furniture_safety_candidate'),
      scoreActiveControl,
    ]).decision.status).toBe('keep_artifact_page_furniture_diagnostic_only');
  });
});

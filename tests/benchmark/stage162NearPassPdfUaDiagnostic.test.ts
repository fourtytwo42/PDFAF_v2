import { describe, expect, it } from 'vitest';
import { classifyStage162NearPass, type Stage162Signals } from '../../scripts/stage162-near-pass-pdfua-diagnostic.js';

const healthySignals: Stage162Signals = {
  pdfUaCompliance: 71,
  linkQuality: 95,
  headingStructure: 94,
  readingOrder: 96,
  altText: 100,
  tableMarkup: 100,
  orphanMcidCount: 0,
  suspectedPathPaintOutsideMc: 0,
  taggedAnnotationRiskCount: 106,
  linkAnnotationsMissingStructure: 106,
  nonLinkAnnotationsMissingStructure: 0,
  linkAnnotationsMissingStructParent: 0,
  nonLinkAnnotationsMissingStructParent: 0,
  pagesMissingTabsS: 0,
  pagesAnnotationOrderDiffers: 0,
};

describe('Stage 162 near-pass PDF/UA diagnostic', () => {
  it('selects near-pass annotation/link candidates with strong core categories', () => {
    const result = classifyStage162NearPass({
      publicationId: 'v1-v1-3468',
      analyzedGrade: 'C',
      falsePositiveApplied: 0,
      signals: healthySignals,
    });

    expect(result.nearPassClass).toBe('near_pass_annotation_link_candidate');
    expect(result.implementable).toBe(true);
    expect(result.reason).toContain('/StructParent present');
  });

  it('allows partial heading near-pass rows when annotation ownership is the limiter', () => {
    const result = classifyStage162NearPass({
      publicationId: 'v1-v1-4766',
      analyzedGrade: 'C',
      falsePositiveApplied: 0,
      signals: {
        ...healthySignals,
        headingStructure: 78,
        linkAnnotationsMissingStructure: 98,
      },
    });

    expect(result.nearPassClass).toBe('near_pass_annotation_link_candidate');
    expect(result.implementable).toBe(true);
  });

  it('does not select smaller annotation-debt rows for the conservative Stage 162 retry', () => {
    const result = classifyStage162NearPass({
      publicationId: 'v1-v1-4761',
      analyzedGrade: 'C',
      falsePositiveApplied: 0,
      signals: {
        ...healthySignals,
        linkAnnotationsMissingStructure: 39,
      },
    });

    expect(result.nearPassClass).toBe('no_safe_candidate');
    expect(result.implementable).toBe(false);
  });

  it('selects artifact cleanup candidates when core categories are healthy and annotation debt is absent', () => {
    const result = classifyStage162NearPass({
      publicationId: 'v1-v1-4761',
      analyzedGrade: 'C',
      falsePositiveApplied: 0,
      signals: {
        ...healthySignals,
        taggedAnnotationRiskCount: 0,
        linkAnnotationsMissingStructure: 0,
        orphanMcidCount: 8,
      },
    });

    expect(result.nearPassClass).toBe('near_pass_pdfua_artifact_candidate');
    expect(result.implementable).toBe(true);
  });

  it('separates orphan cleanup no-score/no-final-benefit residue', () => {
    const result = classifyStage162NearPass({
      publicationId: 'v1-v1-4761',
      analyzedGrade: 'C',
      falsePositiveApplied: 0,
      signals: {
        ...healthySignals,
        taggedAnnotationRiskCount: 0,
        linkAnnotationsMissingStructure: 0,
        orphanMcidCount: 3,
      },
      cleanupTools: [{
        toolName: 'remap_orphan_mcids_as_artifacts',
        outcome: 'applied',
        scoreBefore: 79,
        scoreAfter: 79,
        delta: 0,
        stage: 12,
        round: 1,
        source: 'post_pass',
        note: null,
      }],
    });

    expect(result.nearPassClass).toBe('post_pass_orphan_no_score_gain');
    expect(result.implementable).toBe(false);
  });

  it('parks analyzer and OCR volatile rows', () => {
    const result = classifyStage162NearPass({
      publicationId: 'orig-structure-4076',
      analyzedGrade: 'B',
      falsePositiveApplied: 0,
      signals: healthySignals,
    });

    expect(result.nearPassClass).toBe('analyzer_or_route_volatility');
    expect(result.implementable).toBe(false);
  });

  it('keeps non-near-pass rows out of the PDF/UA stage', () => {
    const result = classifyStage162NearPass({
      publicationId: 'orig-fixture-inaccessible',
      analyzedGrade: 'C',
      falsePositiveApplied: 0,
      signals: {
        ...healthySignals,
        readingOrder: 76,
        altText: 72,
        linkQuality: 73,
        linkAnnotationsMissingStructure: 6,
        linkAnnotationsMissingStructParent: 6,
      },
    });

    expect(result.nearPassClass).toBe('alt_or_heading_primary_not_pdfua');
    expect(result.implementable).toBe(false);
  });
});

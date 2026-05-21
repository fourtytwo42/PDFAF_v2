import { describe, expect, it } from 'vitest';
import {
  buildContentStreamCoverageReport,
  classifyContentStreamCoverage,
  type ContentStreamCoverageFeatures,
} from '../../scripts/content-stream-coverage-diagnostic.js';

function features(overrides: Partial<ContentStreamCoverageFeatures> = {}): ContentStreamCoverageFeatures {
  return {
    score: 95,
    grade: 'A',
    pdfClass: 'native_tagged',
    pageCount: 8,
    hasStructure: true,
    auditConfidence: 'verified',
    pageStreamsChecked: 8,
    totalPageStreams: 8,
    uncheckedPageStreams: 0,
    formXObjectsChecked: 0,
    totalFormXObjects: 0,
    formXObjectParseErrorCount: 0,
    formXObjectSampleLimitHitCount: 0,
    directEventDebt: 0,
    orphanMcidCount: 0,
    contentScoreCapRules: [],
    ...overrides,
  };
}

describe('content-stream coverage diagnostic', () => {
  it('classifies full page stream coverage as verified', () => {
    const result = classifyContentStreamCoverage(features({
      directEventDebt: 4,
    }));

    expect(result.classification).toBe('verified_full_stream_coverage');
    expect(result.suggestedAction).toBe('already_verified');
  });

  it('identifies the bounded first-12-page sample limit', () => {
    const result = classifyContentStreamCoverage(features({
      pageCount: 80,
      pageStreamsChecked: 12,
      totalPageStreams: 80,
      uncheckedPageStreams: 68,
      auditConfidence: 'heuristic',
      directEventDebt: 94,
    }));

    expect(result.classification).toBe('page_sample_limit_coverage_gap');
    expect(result.suggestedAction).toBe('page_coverage_hardening_candidate');
    expect(result.reasons).toContain('bounded_first_12_page_sample');
  });

  it('identifies Form XObject coverage uncertainty', () => {
    const result = classifyContentStreamCoverage(features({
      pageStreamsChecked: 8,
      totalPageStreams: 8,
      formXObjectsChecked: 2,
      totalFormXObjects: 0,
      auditConfidence: 'heuristic',
      directEventDebt: 6,
    }));

    expect(result.classification).toBe('form_xobject_coverage_unknown');
    expect(result.suggestedAction).toBe('form_xobject_metric_candidate');
    expect(result.reasons).toContain('form_xobject_total_not_recorded');
  });

  it('identifies measured Form XObject coverage without changing scoring', () => {
    const result = classifyContentStreamCoverage(features({
      pageStreamsChecked: 8,
      totalPageStreams: 8,
      formXObjectsChecked: 2,
      totalFormXObjects: 2,
      auditConfidence: 'heuristic',
      directEventDebt: 6,
    }));

    expect(result.classification).toBe('form_xobject_coverage_measured');
    expect(result.suggestedAction).toBe('form_xobject_metric_candidate');
    expect(result.reasons).toContain('form_xobject_total_coverage_measured');
  });

  it('parks partial Form XObject coverage', () => {
    const result = classifyContentStreamCoverage(features({
      pageStreamsChecked: 8,
      totalPageStreams: 8,
      formXObjectsChecked: 2,
      totalFormXObjects: 4,
      formXObjectParseErrorCount: 1,
      auditConfidence: 'heuristic',
      directEventDebt: 6,
    }));

    expect(result.classification).toBe('form_xobject_coverage_partial');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('keeps parse failures diagnostic-only', () => {
    const result = classifyContentStreamCoverage(features({
      pageStreamsChecked: 3,
      totalPageStreams: 8,
      auditConfidence: 'heuristic',
      directEventDebt: 12,
    }));

    expect(result.classification).toBe('parse_failure_or_unchecked_pages');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('parks missing-structure rows even when page streams were parsed', () => {
    const result = classifyContentStreamCoverage(features({
      hasStructure: false,
      directEventDebt: 400,
    }));

    expect(result.classification).toBe('missing_structure_manual_review');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('prefers the Form XObject metric lane when focus rows are cleanly separated from controls', () => {
    const baseRow = {
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      title: 'focus',
      role: 'focus' as const,
      classification: 'form_xobject_coverage_unknown' as const,
      suggestedAction: 'form_xobject_metric_candidate' as const,
      reasons: [],
      features: features(),
    };
    const report = buildContentStreamCoverageReport('/tmp/out', [
      baseRow,
      {
        ...baseRow,
        id: 'control',
        role: 'control',
        classification: 'verified_full_stream_coverage',
        suggestedAction: 'already_verified',
      },
    ]);

    expect(report.decision.status).toBe('plan_form_xobject_coverage_metric');
  });

  it('prefers scoring validation once Form XObject coverage is measured on focus rows only', () => {
    const baseRow = {
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      title: 'focus',
      role: 'focus' as const,
      classification: 'form_xobject_coverage_measured' as const,
      suggestedAction: 'form_xobject_metric_candidate' as const,
      reasons: [],
      features: features(),
    };
    const report = buildContentStreamCoverageReport('/tmp/out', [
      baseRow,
      {
        ...baseRow,
        id: 'control',
        role: 'control',
        classification: 'verified_full_stream_coverage',
        suggestedAction: 'already_verified',
      },
    ]);

    expect(report.decision.status).toBe('plan_form_xobject_scoring_validation');
  });

  it('keeps coverage diagnostic-only when a Form XObject control also triggers', () => {
    const row = {
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      title: 'focus',
      role: 'focus' as const,
      classification: 'form_xobject_coverage_unknown' as const,
      suggestedAction: 'form_xobject_metric_candidate' as const,
      reasons: [],
      features: features(),
    };
    const report = buildContentStreamCoverageReport('/tmp/out', [
      row,
      { ...row, id: 'control', role: 'control' },
    ]);

    expect(report.decision.status).toBe('keep_content_coverage_diagnostic_only');
  });
});

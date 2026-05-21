import { describe, expect, it } from 'vitest';
import {
  buildContentPageSamplingReport,
  classifyContentPageSampling,
  type ContentAuditSample,
} from '../../scripts/content-page-sampling-diagnostic.js';

function sample(overrides: Partial<ContentAuditSample> = {}): ContentAuditSample {
  return {
    strategy: 'first',
    pageStreamsChecked: 12,
    totalPageStreams: 80,
    sampledPageIndices: [...Array(12).keys()],
    directEventDebt: 10,
    textOutside: 0,
    imageOutside: 0,
    pathOutside: 10,
    boundaryDebt: 0,
    formXObjectsChecked: 0,
    totalFormXObjects: 0,
    formXObjectParseErrorCount: 0,
    formXObjectSampleLimitHitCount: 0,
    ...overrides,
  };
}

describe('content page sampling diagnostic', () => {
  it('does not propose sampling changes when the full document is within the sample', () => {
    const result = classifyContentPageSampling({
      rowRole: 'focus',
      first: sample({ pageStreamsChecked: 8, totalPageStreams: 8 }),
      stratified: sample({ strategy: 'stratified', pageStreamsChecked: 8, totalPageStreams: 8 }),
    });

    expect(result.classification).toBe('full_document_within_sample');
    expect(result.suggestedAction).toBe('no_action');
  });

  it('classifies same-budget stratified debt gain as a focus candidate', () => {
    const result = classifyContentPageSampling({
      rowRole: 'focus',
      first: sample({ directEventDebt: 10 }),
      stratified: sample({ strategy: 'stratified', directEventDebt: 22 }),
    });

    expect(result.classification).toBe('stratified_increases_content_debt');
    expect(result.suggestedAction).toBe('sampling_validation_candidate');
    expect(result.reasons).toContain('debt_delta:12');
  });

  it('does not promote stratified debt gain on a control row', () => {
    const result = classifyContentPageSampling({
      rowRole: 'control',
      first: sample({ directEventDebt: 10 }),
      stratified: sample({ strategy: 'stratified', directEventDebt: 22 }),
    });

    expect(result.classification).toBe('stratified_increases_content_debt');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('keeps current sampling when stratified debt is the same or lower', () => {
    expect(classifyContentPageSampling({
      rowRole: 'focus',
      first: sample({ directEventDebt: 10 }),
      stratified: sample({ strategy: 'stratified', directEventDebt: 10 }),
    }).classification).toBe('stratified_same_content_debt');

    expect(classifyContentPageSampling({
      rowRole: 'focus',
      first: sample({ directEventDebt: 10 }),
      stratified: sample({ strategy: 'stratified', directEventDebt: 4 }),
    }).classification).toBe('stratified_reduces_content_debt');
  });

  it('requires at least two clean focus candidates before planning validation', () => {
    const row = {
      id: 'focus-1',
      pdfPath: '/tmp/focus-1.pdf',
      title: 'focus-1',
      role: 'focus' as const,
      classification: 'stratified_increases_content_debt' as const,
      suggestedAction: 'sampling_validation_candidate' as const,
      reasons: [],
      first: sample(),
      stratified: sample({ strategy: 'stratified', directEventDebt: 20 }),
    };

    expect(buildContentPageSamplingReport('/tmp/out', 12, [row]).decision.status)
      .toBe('keep_page_sampling_diagnostic_only');
    expect(buildContentPageSamplingReport('/tmp/out', 12, [row, { ...row, id: 'focus-2' }]).decision.status)
      .toBe('plan_stratified_sampling_validation');
  });

  it('parks the lane when a control also gains debt', () => {
    const row = {
      id: 'focus-1',
      pdfPath: '/tmp/focus-1.pdf',
      title: 'focus-1',
      role: 'focus' as const,
      classification: 'stratified_increases_content_debt' as const,
      suggestedAction: 'sampling_validation_candidate' as const,
      reasons: [],
      first: sample(),
      stratified: sample({ strategy: 'stratified', directEventDebt: 20 }),
    };
    const report = buildContentPageSamplingReport('/tmp/out', 12, [
      row,
      { ...row, id: 'focus-2' },
      { ...row, id: 'control', role: 'control' },
    ]);

    expect(report.decision.status).toBe('keep_page_sampling_diagnostic_only');
  });
});

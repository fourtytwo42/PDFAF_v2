import { describe, expect, it } from 'vitest';
import {
  classifyStage168ZeroHeading,
  type Stage168ClassificationInput,
} from '../../scripts/stage168-zero-heading-diagnostic.js';

function input(overrides: Partial<Stage168ClassificationInput> = {}): Stage168ClassificationInput {
  return {
    id: 'v1-4760',
    isPrimary: true,
    headingStructure: 0,
    textExtractability: 96,
    pdfClass: 'native_tagged',
    isOcr: false,
    ownerCount: 12,
    hasOcrCandidate: false,
    hasNativeCandidate: false,
    hasFigureAltDebt: false,
    hasHeadingVolatilitySignal: false,
    ...overrides,
  };
}

describe('Stage 168 zero-heading diagnostic classifier', () => {
  it('selects OCR rows only when a safe owned title candidate exists', () => {
    expect(classifyStage168ZeroHeading(input({
      id: 'v1-3443',
      pdfClass: 'native_tagged',
      isOcr: true,
      ownerCount: 6,
      hasOcrCandidate: true,
    }))).toMatchObject({
      classification: 'ocr_safe_title_owner_candidate',
      implementable: true,
    });
  });

  it('classifies OCR rows with owners but no title candidate as no-safe-anchor', () => {
    expect(classifyStage168ZeroHeading(input({
      id: 'v1-3443',
      isOcr: true,
      ownerCount: 8,
      hasOcrCandidate: false,
    }))).toMatchObject({
      classification: 'no_safe_heading_anchor',
      implementable: false,
    });
  });

  it('selects native tagged title-anchor rows without figure debt', () => {
    expect(classifyStage168ZeroHeading(input({
      id: 'v1-4760',
      hasNativeCandidate: true,
    }))).toMatchObject({
      classification: 'native_tagged_title_anchor_candidate',
      implementable: true,
    });
  });

  it('distinguishes native heading candidates that also have figure-alt debt', () => {
    expect(classifyStage168ZeroHeading(input({
      id: 'v1-4657',
      hasNativeCandidate: true,
      hasFigureAltDebt: true,
    }))).toMatchObject({
      classification: 'native_heading_plus_figure_alt_candidate',
      implementable: true,
    });
  });

  it('parks volatile heading evidence instead of selecting a fixer', () => {
    expect(classifyStage168ZeroHeading(input({
      hasNativeCandidate: true,
      hasHeadingVolatilitySignal: true,
    }))).toMatchObject({
      classification: 'analyzer_or_route_volatility',
      implementable: false,
    });
  });

  it('does not select controls even when candidate-like signals exist', () => {
    expect(classifyStage168ZeroHeading(input({
      id: 'v1-3430',
      isPrimary: false,
      isOcr: true,
      hasOcrCandidate: true,
    }))).toMatchObject({
      classification: 'no_safe_heading_anchor',
      implementable: false,
      reason: 'control row',
    });
  });
});

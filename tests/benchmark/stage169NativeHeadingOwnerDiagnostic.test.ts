import { describe, expect, it } from 'vitest';
import {
  classifyStage169NativeHeading,
  type Stage169ClassificationInput,
} from '../../scripts/stage169-native-heading-owner-diagnostic.js';

function input(overrides: Partial<Stage169ClassificationInput> = {}): Stage169ClassificationInput {
  return {
    id: 'v1-4760',
    isPrimary: true,
    isVolatilityControl: false,
    headingStructure: 0,
    textExtractability: 96,
    pdfClass: 'native_tagged',
    isOcr: false,
    hasNativeCandidate: false,
    hasVisibleTitle: true,
    ownerCount: 10,
    firstPageMcidCount: 0,
    firstPageParagraphCount: 0,
    structureDepth: 4,
    hasBtEtEvidence: false,
    hasFigureAltDebt: false,
    scoreRange: 0,
    sameBufferScoreRange: null,
    ...overrides,
  };
}

describe('Stage 169 native heading owner classifier', () => {
  it('selects native content-owned title candidates', () => {
    expect(classifyStage169NativeHeading(input({
      hasNativeCandidate: true,
      firstPageMcidCount: 2,
    }))).toMatchObject({
      classification: 'native_content_owned_title_candidate',
      implementable: true,
    });
  });

  it('separates heading candidates with figure-alt debt', () => {
    expect(classifyStage169NativeHeading(input({
      id: 'v1-4657',
      hasNativeCandidate: true,
      hasFigureAltDebt: true,
      firstPageMcidCount: 2,
    }))).toMatchObject({
      classification: 'figure_alt_after_heading_candidate',
      implementable: true,
    });
  });

  it('marks ownerless visible-title rows as bootstrap candidates only with raw text-group evidence', () => {
    expect(classifyStage169NativeHeading(input({
      hasVisibleTitle: true,
      firstPageMcidCount: 0,
      firstPageParagraphCount: 0,
      structureDepth: 1,
      hasBtEtEvidence: true,
    }))).toMatchObject({
      classification: 'native_structure_bootstrap_required',
      implementable: true,
    });
  });

  it('parks visible-title rows when no safe owner or bootstrap evidence exists', () => {
    expect(classifyStage169NativeHeading(input({
      hasVisibleTitle: true,
      firstPageMcidCount: 0,
      firstPageParagraphCount: 0,
      structureDepth: 4,
      hasBtEtEvidence: false,
    }))).toMatchObject({
      classification: 'native_visible_title_without_owner',
      implementable: false,
    });
  });

  it('parks route-order volatile controls', () => {
    expect(classifyStage169NativeHeading(input({
      id: 'v1-4553',
      isPrimary: false,
      isVolatilityControl: true,
      hasNativeCandidate: true,
      scoreRange: 28,
    }))).toMatchObject({
      classification: 'route_order_volatility',
      implementable: false,
    });
  });

  it('parks same-buffer analyzer variance before route decisions', () => {
    expect(classifyStage169NativeHeading(input({
      hasNativeCandidate: true,
      sameBufferScoreRange: 12,
    }))).toMatchObject({
      classification: 'same_buffer_analyzer_variance',
      implementable: false,
    });
  });

  it('does not select already fixed or non-primary control rows', () => {
    expect(classifyStage169NativeHeading(input({
      id: 'v1-3443',
      isPrimary: false,
      headingStructure: 95,
      hasNativeCandidate: true,
    }))).toMatchObject({
      classification: 'no_safe_anchor',
      implementable: false,
    });
  });
});

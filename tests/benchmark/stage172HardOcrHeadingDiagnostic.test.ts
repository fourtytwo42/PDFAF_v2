import { describe, expect, it } from 'vitest';
import {
  classifyStage172MixedResidual,
  classifyStage172ZeroHeading,
  type Stage172MixedInput,
  type Stage172ZeroHeadingInput,
} from '../../scripts/stage172-hard-ocr-heading-diagnostic.js';

function zeroInput(overrides: Partial<Stage172ZeroHeadingInput> = {}): Stage172ZeroHeadingInput {
  return {
    role: 'primary_zero_heading',
    headingStructure: 0,
    textExtractability: 97,
    isOcr: true,
    hasSafeOcrCandidate: false,
    hasDeepTitleCandidateBeyondCap: false,
    hasWindowMatch: false,
    visibleTitleTokenHits: 0,
    firstPageMcidCount: 12,
    firstPageTextLength: 300,
    firstPageLooksLikeCollectionCover: false,
    pageCount: 127,
    ...overrides,
  };
}

function mixedInput(overrides: Partial<Stage172MixedInput> = {}): Stage172MixedInput {
  return {
    altText: 0,
    tableMarkup: 72,
    pdfUaCompliance: 71,
    extractedFigureCount: 27,
    treeFigureCount: 8,
    stronglyIrregularTableCount: 2,
    orphanMcidCount: 64,
    ...overrides,
  };
}

describe('Stage 172 hard OCR heading diagnostic classifier', () => {
  it('selects OCR zero-heading rows when the current safe selector already finds an owner', () => {
    expect(classifyStage172ZeroHeading(zeroInput({ hasSafeOcrCandidate: true }))).toMatchObject({
      classification: 'ocr_safe_title_owner_candidate',
      implementable: true,
    });
  });

  it('selects title-owner candidates beyond the global MCID cap', () => {
    expect(classifyStage172ZeroHeading(zeroInput({ hasDeepTitleCandidateBeyondCap: true }))).toMatchObject({
      classification: 'ocr_title_owner_beyond_cap',
      implementable: true,
    });
  });

  it('keeps split or noisy owned OCR title matches implementable but distinct', () => {
    expect(classifyStage172ZeroHeading(zeroInput({ hasWindowMatch: true }))).toMatchObject({
      classification: 'ocr_split_or_noisy_title_candidate',
      implementable: true,
    });
  });

  it('parks visible OCR title text when ownership is not safe enough', () => {
    expect(classifyStage172ZeroHeading(zeroInput({
      visibleTitleTokenHits: 5,
      firstPageMcidCount: 0,
    }))).toMatchObject({
      classification: 'ocr_visible_title_without_owner',
      implementable: false,
    });
  });

  it('parks sparse first pages as possible non-title cover pages', () => {
    expect(classifyStage172ZeroHeading(zeroInput({
      firstPageTextLength: 42,
      visibleTitleTokenHits: 0,
    }))).toMatchObject({
      classification: 'title_page_not_first_page',
      implementable: false,
    });
  });

  it('parks collection-cover first pages when the row title is not visible', () => {
    expect(classifyStage172ZeroHeading(zeroInput({
      firstPageLooksLikeCollectionCover: true,
      firstPageTextLength: 1000,
      visibleTitleTokenHits: 1,
    }))).toMatchObject({
      classification: 'title_page_not_first_page',
      implementable: false,
    });
  });

  it('does not select controls or already fixed rows', () => {
    expect(classifyStage172ZeroHeading(zeroInput({
      role: 'positive_contrast',
      hasSafeOcrCandidate: true,
    }))).toMatchObject({
      classification: 'already_fixed_control',
      implementable: false,
    });
    expect(classifyStage172ZeroHeading(zeroInput({
      headingStructure: 94,
      hasSafeOcrCandidate: true,
    }))).toMatchObject({
      classification: 'already_fixed_control',
      implementable: false,
    });
  });

  it('classifies 4213-style mixed alt/table/pdfua debt as diagnostic-only', () => {
    expect(classifyStage172MixedResidual(mixedInput())).toMatchObject({
      classification: 'mixed_alt_table_pdfua_debt',
      implementable: false,
    });
  });

  it('distinguishes single-path mixed residual candidates from mixed debt', () => {
    expect(classifyStage172MixedResidual(mixedInput({
      tableMarkup: 100,
      pdfUaCompliance: 100,
    }))).toMatchObject({
      classification: 'safe_alt_continuation_candidate',
      implementable: true,
    });
    expect(classifyStage172MixedResidual(mixedInput({
      altText: 100,
      pdfUaCompliance: 100,
    }))).toMatchObject({
      classification: 'safe_table_continuation_candidate',
      implementable: true,
    });
  });
});

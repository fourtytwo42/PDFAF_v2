import { describe, expect, it } from 'vitest';
import { classifyStage176OcrNoisyTitle } from '../../scripts/stage176-ocr-noisy-title-diagnostic.js';

describe('Stage 176 OCR noisy title diagnostic classifier', () => {
  it('selects only primary OCR rows with safe noisy split title candidates', () => {
    const result = classifyStage176OcrNoisyTitle({
      role: 'primary',
      headingStructure: 0,
      textExtractability: 97,
      isOcr: true,
      hasMcidOwner: true,
      hasNoisyCandidate: true,
      hasAnySafeCandidate: true,
      collectionCoverDetected: false,
      visibleTitleTokenHits: 1,
    });
    expect(result).toMatchObject({
      classification: 'ocr_noisy_split_title_candidate',
      implementable: true,
    });
  });

  it('parks mixed structural rows even when they have low headings', () => {
    const result = classifyStage176OcrNoisyTitle({
      role: 'mixed_control',
      headingStructure: 35,
      textExtractability: 96,
      isOcr: false,
      hasMcidOwner: true,
      hasNoisyCandidate: false,
      hasAnySafeCandidate: false,
      collectionCoverDetected: false,
      visibleTitleTokenHits: 4,
    });
    expect(result).toMatchObject({
      classification: 'mixed_not_heading_stage',
      implementable: false,
    });
  });

  it('rejects ownerless OCR rows without loosening heading safety', () => {
    const result = classifyStage176OcrNoisyTitle({
      role: 'primary',
      headingStructure: 0,
      textExtractability: 94,
      isOcr: true,
      hasMcidOwner: false,
      hasNoisyCandidate: false,
      hasAnySafeCandidate: false,
      collectionCoverDetected: false,
      visibleTitleTokenHits: 3,
    });
    expect(result).toMatchObject({
      classification: 'ocr_owner_missing',
      implementable: false,
    });
  });
});

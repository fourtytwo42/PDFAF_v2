import { describe, expect, it } from 'vitest';
import {
  classifyStage177RemainingF,
  type Stage177ClassificationInput,
} from '../../scripts/stage177-hard2-remaining-f-diagnostic.js';

function input(overrides: Partial<Stage177ClassificationInput> = {}): Stage177ClassificationInput {
  return {
    role: 'native_primary',
    scoreRange: 38,
    hasGoodRoute: true,
    hasBadRoute: true,
    goodRouteHasSynthesis: true,
    badRouteMissingSynthesis: true,
    finalReanalysisRange: null,
    pdfClass: 'native_tagged',
    headingStructure: 0,
    pdfUaCompliance: 50,
    tableMarkup: 100,
    linkQuality: 100,
    paragraphCount: 0,
    mcidCount: 407,
    structureDepth: 4,
    orphanMcidCount: 64,
    ...overrides,
  };
}

describe('Stage 177 hard-holdout-2 remaining F classifier', () => {
  it('selects native synthesis route variance when the A route uses synthesis and the F route misses it', () => {
    expect(classifyStage177RemainingF(input())).toMatchObject({
      classification: 'native_synthesis_route_variance',
      implementable: true,
    });
  });

  it('selects MCID-backed native synthesis fallback candidates when paragraph extraction drops out', () => {
    expect(classifyStage177RemainingF(input({
      hasGoodRoute: false,
      hasBadRoute: true,
      goodRouteHasSynthesis: false,
      badRouteMissingSynthesis: true,
      scoreRange: 0,
    }))).toMatchObject({
      classification: 'native_mcid_synthesis_fallback_candidate',
      implementable: true,
    });
  });

  it('parks mixed structural debt for a dedicated stage', () => {
    expect(classifyStage177RemainingF(input({
      role: 'mixed_primary',
      tableMarkup: 0,
      pdfUaCompliance: 71,
      paragraphCount: 100,
      mcidCount: 200,
    }))).toMatchObject({
      classification: 'mixed_residual_debt',
      implementable: false,
    });
  });

  it('parks final-byte analyzer variance before route fixes', () => {
    expect(classifyStage177RemainingF(input({
      finalReanalysisRange: 22,
    }))).toMatchObject({
      classification: 'same_buffer_analyzer_variance',
      implementable: false,
    });
  });

  it('does not select table-blocked rows for the native MCID synthesis fallback', () => {
    expect(classifyStage177RemainingF(input({
      hasGoodRoute: false,
      goodRouteHasSynthesis: false,
      tableMarkup: 0,
      scoreRange: 0,
    }))).toMatchObject({
      classification: 'no_safe_rule',
      implementable: false,
    });
  });
});

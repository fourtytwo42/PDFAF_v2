import { describe, expect, it } from 'vitest';
import {
  classifyStage165LinkParentTree,
  type Stage165Signals,
} from '../../scripts/stage165-link-parenttree-diagnostic.js';

function signals(overrides: Partial<Stage165Signals> = {}): Stage165Signals {
  return {
    pdfUaCompliance: 71,
    linkQuality: 73,
    headingStructure: 96,
    readingOrder: 76,
    altText: 72,
    tableMarkup: 100,
    linkCount: 6,
    structureTreeDepth: 3,
    pagesMissingTabsS: 0,
    pagesAnnotationOrderDiffers: 0,
    linkAnnotationsMissingStructure: 6,
    nonLinkAnnotationsMissingStructure: 0,
    linkAnnotationsMissingStructParent: 6,
    nonLinkAnnotationsMissingStructParent: 0,
    ...overrides,
  };
}

describe('Stage 165 link ParentTree diagnostic classifier', () => {
  it('selects fixture-style small link ownership debt', () => {
    expect(classifyStage165LinkParentTree({
      id: 'fixture-inaccessible',
      publicationId: 'fixture-inaccessible',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toEqual({
      linkParentTreeClass: 'safe_link_parenttree_repair_candidate',
      implementable: true,
      reason: '12 link annotation ParentTree/StructParent ownership issue(s) on a stable near-pass row',
    });
  });

  it('selects the active-tail duplicate as the same general target', () => {
    expect(classifyStage165LinkParentTree({
      id: 'v1-orig-fixture-inaccessible',
      publicationId: 'orig-fixture-inaccessible',
      sourceKind: 'active_primary',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toMatchObject({
      linkParentTreeClass: 'safe_link_parenttree_repair_candidate',
      implementable: true,
    });
  });

  it('parks protected/analyzer-volatility controls', () => {
    expect(classifyStage165LinkParentTree({
      id: 'short-4176',
      publicationId: 'short-4176',
      sourceKind: 'parked_control',
      falsePositiveApplied: 0,
      signals: signals(),
    })).toMatchObject({
      linkParentTreeClass: 'protected_or_analyzer_volatility',
      implementable: false,
    });
  });

  it('separates annotation order debt from ParentTree ownership debt', () => {
    expect(classifyStage165LinkParentTree({
      id: 'fixture-inaccessible',
      publicationId: 'fixture-inaccessible',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({
        linkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        pagesMissingTabsS: 1,
      }),
    })).toMatchObject({
      linkParentTreeClass: 'annotation_order_only_candidate',
      implementable: false,
    });
  });

  it('does not choose link ownership repair when core categories are lower-priority blockers', () => {
    expect(classifyStage165LinkParentTree({
      id: 'fixture-inaccessible',
      publicationId: 'fixture-inaccessible',
      sourceKind: 'legacy_primary',
      falsePositiveApplied: 0,
      signals: signals({ altText: 20 }),
    })).toMatchObject({
      linkParentTreeClass: 'visual_or_no_safe_link_target',
      implementable: false,
    });
  });
});

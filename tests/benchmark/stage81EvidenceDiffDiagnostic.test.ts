import { describe, expect, it } from 'vitest';
import { summarizeEvidenceDiff, summarizeObservationGroup, type Stage81Observation } from '../../scripts/stage81-evidence-diff-diagnostic.js';

function obs(partial: Partial<Stage81Observation>): Stage81Observation {
  return {
    kind: 'paragraph',
    key: 'paragraph:ref:1_0',
    repeat: 1,
    quality: 1,
    item: { structRef: '1_0', page: 0, text: '' },
    ...partial,
  };
}

describe('Stage 81 evidence diff helpers', () => {
  it('merges duplicate observations by preserving richer text evidence', () => {
    const group = summarizeObservationGroup([
      obs({ repeat: 1, quality: 10, item: { structRef: '1_0', page: 0, text: '' } }),
      obs({ repeat: 2, quality: 30, item: { structRef: '1_0', page: 0, text: 'Detailed paragraph text' } }),
    ], 2);

    expect(group.merged.text).toBe('Detailed paragraph text');
    expect(group.mergedQuality).toBeGreaterThanOrEqual(group.bestQuality);
    expect(group.intermittent).toBe(false);
  });

  it('preserves richer figure ownership evidence', () => {
    const group = summarizeObservationGroup([
      obs({
        kind: 'figure',
        key: 'figure:ref:2_0',
        repeat: 1,
        quality: 10,
        item: { structRef: '2_0', page: 0, hasAlt: false, reachable: false, directContent: false, parentPath: [] },
      }),
      obs({
        kind: 'figure',
        key: 'figure:ref:2_0',
        repeat: 2,
        quality: 80,
        item: { structRef: '2_0', page: 0, hasAlt: true, altText: 'Chart', reachable: true, directContent: true, parentPath: ['Document', 'Figure'] },
      }),
    ], 2);

    expect(group.merged.hasAlt).toBe(true);
    expect(group.merged.reachable).toBe(true);
    expect(group.merged.directContent).toBe(true);
    expect(group.merged.parentPath).toEqual(['Document', 'Figure']);
  });

  it('projects merged counts at least as high as per-repeat counts when union preserves evidence', () => {
    const summary = summarizeEvidenceDiff({
      repeatCount: 2,
      repeats: [
        { repeat: 1, raw: { paragraphStructElems: [{ structRef: '1_0', page: 0, text: 'A' }] } },
        { repeat: 2, raw: { paragraphStructElems: [{ structRef: '1_0', page: 0, text: 'A' }, { structRef: '2_0', page: 0, text: 'B' }] } },
      ],
    });

    expect(summary.maxRepeatCounts.paragraph).toBe(2);
    expect(summary.mergedCounts.paragraph).toBe(2);
    expect(summary.preservesMaxObservedEvidence).toBe(true);
    expect(summary.unstableGroups.some(group => group.intermittent)).toBe(true);
  });

  it('keeps objectless inline nodes bounded by stable fallback keys', () => {
    const summary = summarizeEvidenceDiff({
      repeatCount: 2,
      repeats: [
        { repeat: 1, raw: { figures: [{ page: 0, role: 'Figure', altText: 'Logo', parentPath: ['Document'] }] } },
        { repeat: 2, raw: { figures: [{ page: 0, role: 'Figure', altText: 'Logo', parentPath: ['Document'] }] } },
      ],
    });

    expect(summary.mergedCounts.figure).toBe(1);
    expect(summary.unstableGroups).toHaveLength(0);
  });
});

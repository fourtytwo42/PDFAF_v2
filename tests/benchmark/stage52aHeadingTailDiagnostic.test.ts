import { describe, expect, it } from 'vitest';
import {
  buildStage52aHeadingTailReport,
  classifyStage52aHeadingTail,
  type Stage52aBenchmarkRow,
} from '../../scripts/stage52a-heading-tail-diagnostic.js';

function row(input: Partial<Stage52aBenchmarkRow> = {}): Stage52aBenchmarkRow {
  return {
    id: input.id ?? 'v1-4139',
    file: input.file ?? 'sample.pdf',
    afterScore: input.afterScore ?? 59,
    afterGrade: input.afterGrade ?? 'F',
    afterCategories: input.afterCategories ?? [
      { key: 'heading_structure', score: 0 },
      { key: 'alt_text', score: 100 },
      { key: 'reading_order', score: 96 },
    ],
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    afterDetectionProfile: input.afterDetectionProfile ?? {
      headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 0, headingTreeDepth: 0 },
      readingOrderSignals: { structureTreeDepth: 4 },
    },
    appliedTools: input.appliedTools ?? [],
  };
}

describe('Stage 52A heading-tail diagnostic', () => {
  it('classifies hidden root-reachable heading evidence', () => {
    const result = classifyStage52aHeadingTail(row({
      appliedTools: [
        {
          toolName: 'normalize_heading_hierarchy',
          outcome: 'no_effect',
          details: JSON.stringify({
            outcome: 'no_effect',
            invariants: {
              rootReachableHeadingCountBefore: 4,
              rootReachableHeadingCountAfter: 4,
              rootReachableDepthBefore: 6,
              rootReachableDepthAfter: 6,
            },
          }),
        },
      ],
    }));
    expect(result.blocker).toBe('hidden_root_reachable_heading_evidence');
    expect(result.reasons.join(' ')).toContain('maxRootReachableHeadingEvidence=4');
  });

  it('reports terminal create-heading failures without treating them as success', () => {
    const result = classifyStage52aHeadingTail(row({
      appliedTools: [
        {
          toolName: 'create_heading_from_candidate',
          outcome: 'no_effect',
          details: JSON.stringify({
            outcome: 'no_effect',
            note: 'heading_not_root_reachable',
            invariants: { targetRef: '12_0', targetReachable: false },
          }),
        },
      ],
    }));
    expect(result.blocker).toBe('create_heading_target_failed');
  });

  it('distinguishes true zero-heading rows where create-heading was not scheduled', () => {
    const result = classifyStage52aHeadingTail(row());
    expect(result.blocker).toBe('create_heading_not_scheduled');
  });

  it('distinguishes non-tail rows from zero-heading tail rows', () => {
    const result = classifyStage52aHeadingTail(row({
      afterCategories: [{ key: 'heading_structure', score: 86 }],
      afterDetectionProfile: {
        headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 6, headingTreeDepth: 4 },
      },
    }));
    expect(result.blocker).toBe('not_zero_heading_tail');
  });

  it('builds a deterministic focus-row report and handles missing rows', () => {
    const report = buildStage52aHeadingTailReport([
      row({
        id: 'v1-4139',
        appliedTools: [
          {
            toolName: 'normalize_heading_hierarchy',
            outcome: 'no_effect',
            details: JSON.stringify({ invariants: { rootReachableHeadingCountAfter: 2 } }),
          },
        ],
      }),
    ], ['v1-4139', 'v1-missing']);
    expect(report['rowCount']).toBe(2);
    expect(report['blockerDistribution']).toMatchObject({
      hidden_root_reachable_heading_evidence: 1,
      true_zero_heading_no_candidate_evidence: 1,
    });
    const rows = report['rows'] as Array<Record<string, unknown>>;
    expect(rows[1]?.['missing']).toBe(true);
  });
});

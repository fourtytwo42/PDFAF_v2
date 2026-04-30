import { describe, expect, it } from 'vitest';
import {
  classifyStage163Row,
  detectStage162AnnotationRetryRows,
  detectStage162AnnotationRetryTimeline,
} from '../../scripts/stage163-protected-regression-closeout.js';
import type { Stage128ExternalRepeat, Stage128RawRepeat } from '../../scripts/stage128-protected-reanalysis-closeout.js';

function external(repeat: number, score: number, safe = score >= 89): Stage128ExternalRepeat {
  return {
    repeat,
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
    protectedUnsafeReason: safe ? null : `protected_baseline_floor(${score}<89)`,
    categories: { heading_structure: score },
  };
}

function raw(repeat: number, signature: string): Stage128RawRepeat {
  return {
    repeat,
    signature,
    familySignatures: { headings: signature },
    familyCounts: { headings: 1 },
  };
}

describe('classifyStage163Row', () => {
  it('keeps floor-safe final repeats as actionable protected evidence', () => {
    const result = classifyStage163Row({
      floorScore: 89,
      targetAfterScore: 79,
      finalRepeats: [external(1, 79, false), external(2, 91, true)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'b')],
      checkpoints: [],
    });

    expect(result.classification).toBe('same_buffer_floor_safe_repeat_available');
  });

  it('classifies stable unsafe in-run floor states as deterministic route regressions', () => {
    const result = classifyStage163Row({
      floorScore: 89,
      targetAfterScore: 91,
      finalRepeats: [external(1, 79, false), external(2, 79, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [],
    });

    expect(result.classification).toBe('deterministic_route_regression');
  });
});

describe('detectStage162AnnotationRetryTimeline', () => {
  it('detects the Stage 162 retry shape after a zero-debt annotation no-effect', () => {
    const tools = [
      {
        toolName: 'repair_native_link_structure',
        outcome: 'no_effect',
        details: JSON.stringify({
          note: 'annotation_ownership_not_preserved',
          invariants: {
            visibleAnnotationsMissingStructParentBefore: 0,
            visibleAnnotationsMissingStructParentAfter: 0,
            visibleAnnotationsMissingStructureBefore: 0,
            visibleAnnotationsMissingStructureAfter: 0,
          },
        }),
      },
      {
        toolName: 'repair_native_link_structure',
        outcome: 'applied',
        details: JSON.stringify({
          invariants: {
            visibleAnnotationsMissingStructParentBefore: 0,
            visibleAnnotationsMissingStructParentAfter: 0,
            visibleAnnotationsMissingStructureBefore: 98,
            visibleAnnotationsMissingStructureAfter: 0,
          },
        }),
      },
    ];

    expect(detectStage162AnnotationRetryTimeline(tools)).toBe(true);
    expect(detectStage162AnnotationRetryRows(tools)).toEqual([1]);
  });

  it('does not flag ordinary annotation cleanup without the zero-debt precursor', () => {
    expect(detectStage162AnnotationRetryTimeline([
      {
        toolName: 'repair_native_link_structure',
        outcome: 'applied',
        details: JSON.stringify({
          invariants: {
            visibleAnnotationsMissingStructureBefore: 98,
            visibleAnnotationsMissingStructureAfter: 0,
          },
        }),
      },
    ])).toBe(false);
  });

  it('does not flag small annotation debt retries', () => {
    expect(detectStage162AnnotationRetryTimeline([
      {
        toolName: 'tag_unowned_annotations',
        outcome: 'no_effect',
        details: JSON.stringify({
          note: 'annotation_ownership_not_preserved',
          invariants: {
            visibleAnnotationsMissingStructParentBefore: 0,
            visibleAnnotationsMissingStructParentAfter: 0,
            visibleAnnotationsMissingStructureBefore: 0,
            visibleAnnotationsMissingStructureAfter: 0,
          },
        }),
      },
      {
        toolName: 'tag_unowned_annotations',
        outcome: 'applied',
        details: JSON.stringify({
          invariants: {
            visibleAnnotationsMissingStructureBefore: 3,
            visibleAnnotationsMissingStructureAfter: 0,
          },
        }),
      },
    ])).toBe(false);
  });
});

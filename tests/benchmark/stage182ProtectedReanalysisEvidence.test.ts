import { describe, expect, it } from 'vitest';
import {
  acceptedCleanupHarmCandidates,
  classifyStage182Row,
  type Stage182ToolRow,
} from '../../scripts/stage182-protected-reanalysis-evidence.js';
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

function cleanupTool(before: Record<string, number>, after: Record<string, number>): Stage182ToolRow {
  return {
    toolName: 'remap_orphan_mcids_as_artifacts',
    outcome: 'applied',
    source: 'post_pass',
    details: JSON.stringify({
      debug: {
        replayState: {
          stateSignatureBefore: 'a',
          stateSignatureAfter: 'b',
          categoryScoresBefore: before,
          categoryScoresAfter: after,
        },
      },
    }),
  };
}

describe('classifyStage182Row', () => {
  it('keeps floor-safe final repeats as actionable protected evidence', () => {
    const result = classifyStage182Row({
      floorScore: 89,
      targetAfterScore: 87,
      finalRepeats: [external(1, 79, false), external(2, 91, true)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'b')],
      checkpoints: [],
    });

    expect(result.classification).toBe('same_buffer_floor_safe_repeat_available');
  });

  it('selects safe checkpoints when final bytes remain unsafe', () => {
    const result = classifyStage182Row({
      floorScore: 89,
      targetAfterScore: 87,
      finalRepeats: [external(1, 79, false), external(2, 79, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [{ externalRepeats: [external(1, 92, true)], rawRepeats: [raw(1, 'c')] }],
    });

    expect(result.classification).toBe('safe_checkpoint_available');
  });

  it('parks same-buffer analyzer variance before cleanup harm', () => {
    const result = classifyStage182Row({
      floorScore: 89,
      targetAfterScore: 91,
      finalRepeats: [external(1, 79, false), external(2, 79, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'b')],
      checkpoints: [],
      acceptedCleanupHarmCandidates: acceptedCleanupHarmCandidates([
        cleanupTool({ alt_text: 100, table_markup: 100 }, { alt_text: 60, table_markup: 100 }),
      ]),
    });

    expect(result.classification).toBe('same_buffer_analyzer_variance_floor_unsafe');
  });

  it('classifies accepted cleanup harm when stable unsafe repeats follow a harmful cleanup', () => {
    const harm = acceptedCleanupHarmCandidates([
      cleanupTool(
        { alt_text: 100, table_markup: 100, pdf_ua_compliance: 50 },
        { alt_text: 60, table_markup: 100, pdf_ua_compliance: 50 },
      ),
    ]);
    const result = classifyStage182Row({
      floorScore: 89,
      targetAfterScore: 91,
      finalRepeats: [external(1, 79, false), external(2, 79, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [],
      acceptedCleanupHarmCandidates: harm,
    });

    expect(harm).toHaveLength(1);
    expect(result.classification).toBe('accepted_cleanup_harm');
  });

  it('classifies stable unsafe rows with no safe final/checkpoint state as stable below floor', () => {
    const result = classifyStage182Row({
      floorScore: 89,
      targetAfterScore: 91,
      finalRepeats: [external(1, 79, false), external(2, 79, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [],
    });

    expect(result.classification).toBe('stable_below_floor_no_safe_state');
  });
});

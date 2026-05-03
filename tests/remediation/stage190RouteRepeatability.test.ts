import { describe, expect, it } from 'vitest';
import type { CategoryKey } from '../../src/types.js';
import {
  classifyStage190RouteRepeatability,
  type Stage190RunEvidence,
  type Stage190ToolEvent,
} from '../../src/services/remediation/stage190RouteRepeatability.js';

function tool(input: Partial<Stage190ToolEvent> = {}): Stage190ToolEvent {
  return {
    toolName: input.toolName ?? 'repair_alt_text_structure',
    outcome: input.outcome ?? 'applied',
    source: input.source ?? 'post_pass',
    stage: input.stage ?? 9,
    round: input.round ?? 1,
    scoreBefore: input.scoreBefore ?? 72,
    scoreAfter: input.scoreAfter ?? 74,
    targetRefs: input.targetRefs ?? ['10_0'],
    stateSignatureBefore: input.stateSignatureBefore ?? 'state-a',
    stateSignatureAfter: input.stateSignatureAfter ?? 'state-b',
    categoryScoresBefore: input.categoryScoresBefore ?? { alt_text: 80, table_markup: 100 },
    categoryScoresAfter: input.categoryScoresAfter ?? { alt_text: 80, table_markup: 40 },
  };
}

function run(input: Partial<Stage190RunEvidence> & { label: string }): Stage190RunEvidence {
  const score = input.score ?? input.reanalyzedScore ?? 70;
  const reanalyzedScore = input.reanalyzedScore ?? score;
  return {
    label: input.label,
    score,
    grade: input.grade ?? (score >= 90 ? 'A' : score >= 80 ? 'B' : 'D'),
    reanalyzedScore,
    reanalyzedGrade: input.reanalyzedGrade ?? (reanalyzedScore >= 90 ? 'A' : reanalyzedScore >= 80 ? 'B' : 'D'),
    categories: input.categories ?? { alt_text: 20, table_markup: 20 } as Partial<Record<CategoryKey, number>>,
    reanalyzedCategories: input.reanalyzedCategories ?? { alt_text: 20, table_markup: 20 } as Partial<Record<CategoryKey, number>>,
    falsePositiveApplied: input.falsePositiveApplied ?? 0,
    finalPdfReanalyzed: input.finalPdfReanalyzed ?? true,
    checkpointSafeScore: input.checkpointSafeScore ?? null,
    tools: input.tools ?? [],
  };
}

describe('Stage 190 route repeatability classifier', () => {
  it('selects stable good route only when external A/B repeats are stable', () => {
    const decision = classifyStage190RouteRepeatability({
      role: 'primary',
      runs: [
        run({ label: 'r1', reanalyzedScore: 92 }),
        run({ label: 'r2', reanalyzedScore: 88 }),
        run({ label: 'write', reanalyzedScore: 90 }),
      ],
    });

    expect(decision).toMatchObject({
      classification: 'stable_good_route_available',
      behaviorCandidate: false,
    });
  });

  it('selects checkpoint restore candidate only with externally safe checkpoint evidence', () => {
    const decision = classifyStage190RouteRepeatability({
      role: 'primary',
      runs: [
        run({ label: 'r1', reanalyzedScore: 66, checkpointSafeScore: 92 }),
        run({ label: 'r2', reanalyzedScore: 68 }),
      ],
    });

    expect(decision).toMatchObject({
      classification: 'checkpoint_restore_candidate',
      behaviorCandidate: true,
    });
  });

  it('selects accepted cleanup harm for repeated bad-only targetless cleanup drops', () => {
    const harmful = tool();
    const decision = classifyStage190RouteRepeatability({
      role: 'primary',
      runs: [
        run({ label: 'good', reanalyzedScore: 90, tools: [tool({ toolName: 'set_document_title' })] }),
        run({ label: 'bad1', reanalyzedScore: 66, tools: [harmful] }),
        run({ label: 'bad2', reanalyzedScore: 68, tools: [harmful] }),
      ],
    });

    expect(decision).toMatchObject({
      classification: 'accepted_cleanup_harm',
      behaviorCandidate: true,
    });
  });

  it('parks same-buffer analyzer variance when in-run A/B is not preserved externally', () => {
    const decision = classifyStage190RouteRepeatability({
      role: 'primary',
      runs: [
        run({ label: 'r1', score: 92, reanalyzedScore: 68 }),
        run({ label: 'r2', score: 78, reanalyzedScore: 70 }),
      ],
    });

    expect(decision).toMatchObject({
      classification: 'same_buffer_analyzer_variance',
      behaviorCandidate: false,
    });
  });

  it('parks rows with no safe external route', () => {
    const decision = classifyStage190RouteRepeatability({
      role: 'primary',
      runs: [
        run({ label: 'r1', reanalyzedScore: 66 }),
        run({ label: 'r2', reanalyzedScore: 70 }),
      ],
    });

    expect(decision).toMatchObject({
      classification: 'no_safe_state',
      behaviorCandidate: false,
    });
  });
});

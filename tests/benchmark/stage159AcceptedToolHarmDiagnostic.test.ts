import { describe, expect, it } from 'vitest';
import { classifyStage159Row, type Stage159HarmObservation } from '../../scripts/stage159-accepted-tool-harm-diagnostic.js';

const harm: Stage159HarmObservation = {
  runLabel: 'repeat-r1',
  toolName: 'repair_alt_text_structure',
  targetRef: '12_0',
  stateSignatureBefore: 'a',
  stateSignatureAfter: 'b',
  scoreBefore: 70,
  scoreAfter: 72,
  scoreDelta: 2,
  targetCategories: ['alt_text'],
  targetDeltas: { alt_text: 0 },
  droppedCategory: 'table_markup',
  droppedDelta: -80,
  reason: 'stage159_targetless_core_category_regression(repair_alt_text_structure:table_markup:100->20)',
};

describe('Stage 159 accepted tool harm diagnostic', () => {
  it('classifies repeated harmful accepted tools as repeatable harm', () => {
    const result = classifyStage159Row({
      stage158Class: 'accepted_tool_harm',
      observations: [harm, { ...harm, runLabel: 'repeat-r2' }],
      scoreRangeDelta: 4,
      finalReanalysisDelta: null,
    });

    expect(result.class).toBe('repeatable_accepted_tool_harm');
  });

  it('classifies a single harmful accepted tool observation', () => {
    const result = classifyStage159Row({
      stage158Class: 'accepted_tool_harm',
      observations: [harm],
      scoreRangeDelta: 4,
      finalReanalysisDelta: null,
    });

    expect(result.class).toBe('single_accepted_tool_harm');
  });

  it('keeps same-buffer analyzer variance as a control when no harm appears', () => {
    const result = classifyStage159Row({
      stage158Class: 'same_buffer_analyzer_variance',
      observations: [],
      scoreRangeDelta: 28,
      finalReanalysisDelta: -33,
    });

    expect(result.class).toBe('same_buffer_analyzer_control');
  });

  it('keeps same-buffer analyzer variance parked even if harm observations are present', () => {
    const result = classifyStage159Row({
      stage158Class: 'same_buffer_analyzer_variance',
      observations: [harm],
      scoreRangeDelta: 28,
      finalReanalysisDelta: -33,
    });

    expect(result.class).toBe('same_buffer_analyzer_control');
  });

  it('marks stable no-harm rows as stable controls', () => {
    const result = classifyStage159Row({
      stage158Class: 'stable_fix_candidate',
      observations: [],
      scoreRangeDelta: 1,
      finalReanalysisDelta: null,
    });

    expect(result.class).toBe('stable_control');
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifyStage160Row,
  firstTimelineDivergence,
  type Stage160HarmSummary,
  type Stage160RunRow,
} from '../../scripts/stage160-route-timeline-diagnostic.js';

function run(label: string, tools: Array<[string, string]> = [], score = 80): Stage160RunRow {
  return {
    label,
    phase: 'repeat',
    score,
    grade: score >= 80 ? 'B' : 'F',
    categories: {},
    toolCount: tools.length,
    timeline: tools.map(([toolName, outcome], index) => ({
      index,
      toolName,
      outcome,
      stage: index + 1,
      round: 1,
      source: 'planner',
      targetRef: null,
      stateSignatureBefore: `state-${index}`,
      stateSignatureAfter: `state-${index + 1}`,
      scoreBefore: score,
      scoreAfter: score,
      scoreDelta: 0,
      categoryScoresBefore: {},
      categoryScoresAfter: {},
      categoryDeltas: {},
      targetCategories: [],
      targetDeltas: {},
      droppedCategory: null,
      droppedDelta: null,
      harmReason: null,
    })),
  };
}

const tableDropHarm: Stage160HarmSummary = {
  runLabel: 'bad',
  toolName: 'repair_alt_text_structure',
  source: 'post_pass',
  stage: 9,
  targetRef: null,
  droppedCategory: 'table_markup',
  droppedDelta: -80,
  targetCategories: ['alt_text'],
  targetDeltas: { alt_text: 0 },
  recoveryTool: null,
  recoveryRunLabel: null,
};

describe('Stage 160 route timeline diagnostic', () => {
  it('finds the first divergent tool/order between good and bad repeats', () => {
    const good = run('good', [
      ['set_document_title', 'applied'],
      ['normalize_table_structure', 'applied'],
      ['repair_alt_text_structure', 'applied'],
    ]);
    const bad = run('bad', [
      ['set_document_title', 'applied'],
      ['repair_alt_text_structure', 'applied'],
      ['normalize_table_structure', 'applied'],
    ]);

    const divergence = firstTimelineDivergence(good, bad);

    expect(divergence?.index).toBe(1);
    expect(divergence?.good).toContain('normalize_table_structure');
    expect(divergence?.bad).toContain('repair_alt_text_structure');
  });

  it('parks same-buffer analyzer rows even when harmful-looking tools appear', () => {
    const result = classifyStage160Row({
      id: 'orig-structure-4076',
      stage158Class: 'same_buffer_analyzer_variance',
      runs: [run('bad')],
      harms: [tableDropHarm],
      firstDivergence: null,
      scoreRangeDelta: 40,
    });

    expect(result.class).toBe('same_buffer_analyzer_variance');
  });

  it('classifies a cleanup transaction candidate when recovery follows the drop', () => {
    const result = classifyStage160Row({
      id: 'v1-v1-4519',
      runs: [run('bad')],
      harms: [{ ...tableDropHarm, recoveryTool: 'normalize_table_structure', recoveryRunLabel: 'bad' }],
      firstDivergence: null,
      scoreRangeDelta: 20,
    });

    expect(result.class).toBe('cleanup_transaction_candidate');
  });

  it('classifies unrecovered post-pass harm as post-pass order debt', () => {
    const result = classifyStage160Row({
      id: 'v1-v1-4761',
      runs: [run('bad')],
      harms: [tableDropHarm],
      firstDivergence: null,
      scoreRangeDelta: 0,
    });

    expect(result.class).toBe('post_pass_order_debt');
  });

  it('marks stable no-harm rows as stable controls', () => {
    const result = classifyStage160Row({
      id: 'v1-v1-4147',
      runs: [run('repeat-a', [], 69), run('repeat-b', [], 70)],
      harms: [],
      firstDivergence: null,
      scoreRangeDelta: 1,
    });

    expect(result.class).toBe('stable_control');
  });
});

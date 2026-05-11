import { describe, expect, it } from 'vitest';
import {
  classify0108Transaction,
  type TransactionRunSummary,
} from '../../scripts/all-input-0108-transaction-diagnostic.js';

function run(overrides: Partial<TransactionRunSummary>): TransactionRunSummary {
  return {
    label: 'run',
    score: 59,
    grade: 'F',
    durationMs: 1000,
    stageTools: [],
    ...overrides,
  };
}

describe('all-input 0108 transaction diagnostic helpers', () => {
  it('selects a combined stage probe when the good route reaches A and bad route only exposes intermediate alt/table loss', () => {
    const result = classify0108Transaction({
      good: run({
        label: 'good',
        score: 94,
        grade: 'A',
        stageTools: [{
          index: 10,
          stage: 4,
          toolName: 'create_heading_from_candidate',
          outcome: 'applied',
          scoreBefore: 59,
          scoreAfter: 79,
          replayBefore: 'heading-state',
          replayAfter: 'heading-after',
          rawReason: 'exported_heading_converged',
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100, reading_order: 79 },
          categoriesAfter: { heading_structure: 94, alt_text: 100, table_markup: 100, reading_order: 79 },
        }, {
          index: 11,
          stage: 4,
          toolName: 'normalize_annotation_tab_order',
          outcome: 'applied',
          scoreBefore: 59,
          scoreAfter: 79,
          replayBefore: 'shared-tab',
          replayAfter: 'tab-after',
          rawReason: 'applied',
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100, reading_order: 79 },
          categoriesAfter: { heading_structure: 94, alt_text: 100, table_markup: 100, reading_order: 79 },
        }],
      }),
      bad: run({
        stageTools: [{
          index: 10,
          stage: 4,
          toolName: 'create_heading_from_candidate',
          outcome: 'rejected',
          scoreBefore: 59,
          scoreAfter: 55,
          replayBefore: 'shared-tab',
          replayAfter: 'bad-after',
          rawReason: 'stage_regressed_score(55)',
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100, reading_order: 79 },
          categoriesAfter: { heading_structure: 0, alt_text: 0, table_markup: 72, reading_order: 96 },
        }, {
          index: 11,
          stage: 4,
          toolName: 'normalize_annotation_tab_order',
          outcome: 'rejected',
          scoreBefore: 59,
          scoreAfter: 55,
          replayBefore: 'shared-tab',
          replayAfter: 'bad-after',
          rawReason: 'stage_regressed_score(55)',
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100, reading_order: 79 },
          categoriesAfter: { heading_structure: 0, alt_text: 0, table_markup: 72, reading_order: 96 },
        }],
      }),
    });

    expect(result.classification).toBe('combined_stage_probe_candidate');
    expect(result.reasons).toContain('shared_tab_state:shared-tab');
    expect(result.requiredAcceptance.join('\n')).toContain('never accept the alt/table-regressed intermediate state');
  });

  it('does not select behavior when the stage rows are missing', () => {
    const result = classify0108Transaction({
      good: run({ score: 94, grade: 'A', stageTools: [] }),
      bad: run({ stageTools: [] }),
    });

    expect(result.classification).toBe('missing_stage_rows');
  });

  it('requires a buffer when only intermediate regression is visible without a shared final-safe shape', () => {
    const result = classify0108Transaction({
      good: run({
        score: 79,
        grade: 'C',
        stageTools: [{
          index: 1,
          stage: 4,
          toolName: 'create_heading_from_candidate',
          outcome: 'applied',
          scoreBefore: 59,
          scoreAfter: 79,
          replayBefore: 'a',
          replayAfter: 'b',
          rawReason: null,
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100 },
          categoriesAfter: { heading_structure: 94, alt_text: 100, table_markup: 100 },
        }, {
          index: 2,
          stage: 4,
          toolName: 'normalize_annotation_tab_order',
          outcome: 'applied',
          scoreBefore: 59,
          scoreAfter: 79,
          replayBefore: 'not-shared',
          replayAfter: 'c',
          rawReason: null,
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100 },
          categoriesAfter: { heading_structure: 94, alt_text: 100, table_markup: 100 },
        }],
      }),
      bad: run({
        stageTools: [{
          index: 2,
          stage: 4,
          toolName: 'create_heading_from_candidate',
          outcome: 'rejected',
          scoreBefore: 59,
          scoreAfter: 55,
          replayBefore: 'x',
          replayAfter: 'y',
          rawReason: 'stage_regressed_score(55)',
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100 },
          categoriesAfter: { heading_structure: 0, alt_text: 0, table_markup: 72 },
        }, {
          index: 3,
          stage: 4,
          toolName: 'normalize_annotation_tab_order',
          outcome: 'rejected',
          scoreBefore: 59,
          scoreAfter: 55,
          replayBefore: 'x',
          replayAfter: 'y',
          rawReason: 'stage_regressed_score(55)',
          categoriesBefore: { heading_structure: 0, alt_text: 84, table_markup: 100 },
          categoriesAfter: { heading_structure: 0, alt_text: 0, table_markup: 72 },
        }],
      }),
    });

    expect(result.classification).toBe('intermediate_regression_requires_buffer');
  });
});

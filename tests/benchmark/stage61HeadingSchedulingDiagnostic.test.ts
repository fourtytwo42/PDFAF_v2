import { describe, expect, it } from 'vitest';
import {
  buildStage61HeadingSchedulingReport,
  classifyStage61HeadingSchedulingRow,
  type Stage61HeadingSchedulingInput,
} from '../../scripts/stage61-heading-scheduling-diagnostic.js';

function input(overrides: Partial<Stage61HeadingSchedulingInput> = {}): Stage61HeadingSchedulingInput {
  const analysis = overrides.analysis ?? {
    score: 59,
    grade: 'F',
    pdfClass: 'native_tagged',
    categories: [
      { key: 'heading_structure', score: 0, applicable: true },
      { key: 'alt_text', score: 88, applicable: true },
      { key: 'reading_order', score: 96, applicable: true },
    ],
  } as never;
  const snapshot = overrides.snapshot ?? {
    pageCount: 4,
    headings: [],
    structureTree: { type: 'Document', children: [] },
    paragraphStructElems: [{ tag: 'P', text: 'A Compact Section Title', page: 0, structRef: '12_0' }],
    detectionProfile: {
      headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 0 },
      readingOrderSignals: { structureTreeDepth: 4 },
    },
  } as never;
  return {
    id: 'v1-4567',
    role: 'focus',
    analysis,
    snapshot,
    plan: {
      stages: [],
      planningSummary: {
        primaryRoute: 'native_structure_repair',
        secondaryRoutes: [],
        triggeringSignals: [],
        scheduledTools: [],
        skippedTools: [{ toolName: 'create_heading_from_candidate', reason: 'missing_precondition' }],
        semanticDeferred: false,
      },
    },
    eligibleCandidates: [
      {
        tag: 'P',
        text: 'A Compact Section Title',
        page: 0,
        structRef: '12_0',
        score: 82,
        reasons: ['compact_title_like_text'],
      },
    ],
    terminalHeadingTools: [],
    ...overrides,
  };
}

describe('Stage 61 heading scheduling diagnostic', () => {
  it('reports scheduler blockage when ranked candidates exist but create-heading is not scheduled', () => {
    const row = classifyStage61HeadingSchedulingRow(input());
    expect(row.blocker).toBe('candidate_scheduling_blocked');
    expect(row.createHeadingSkippedReason).toBe('missing_precondition');
    expect(row.eligibleCandidateCount).toBe(1);
    expect(row.topCandidates[0]?.structRef).toBe('12_0');
  });

  it('reports no-candidate structural debt when a zero-heading row has no eligible candidates', () => {
    const row = classifyStage61HeadingSchedulingRow(input({ eligibleCandidates: [] }));
    expect(row.blocker).toBe('no_reachable_candidates');
    expect(row.reasons.join(' ')).toContain('no_ranked_heading_bootstrap_candidates');
  });

  it('reports create-heading as already scheduled when the planner includes it', () => {
    const row = classifyStage61HeadingSchedulingRow(input({
      plan: {
        stages: [{ stageNumber: 1, tools: [{ toolName: 'create_heading_from_candidate', params: {}, rationale: 'test' }], reanalyzeAfter: true }],
        planningSummary: {
          primaryRoute: 'native_structure_repair',
          secondaryRoutes: [],
          triggeringSignals: [],
          scheduledTools: ['create_heading_from_candidate'],
          skippedTools: [],
          semanticDeferred: false,
        },
      },
    }));
    expect(row.blocker).toBe('create_heading_already_scheduled');
  });

  it('distinguishes non-tail and hidden-export-mismatch rows', () => {
    const nonTail = classifyStage61HeadingSchedulingRow(input({
      analysis: {
        score: 88,
        grade: 'B',
        pdfClass: 'native_tagged',
        categories: [{ key: 'heading_structure', score: 86, applicable: true }],
      } as never,
    }));
    expect(nonTail.blocker).toBe('hierarchy_or_not_zero_heading_tail');

    const hidden = classifyStage61HeadingSchedulingRow(input({
      snapshot: {
        pageCount: 4,
        headings: [],
        structureTree: { type: 'Document', children: [] },
        paragraphStructElems: [{ tag: 'P', text: 'Section Title', page: 0, structRef: '12_0' }],
        detectionProfile: {
          headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 2, extractedHeadingsMissingFromTree: false },
          readingOrderSignals: { structureTreeDepth: 4 },
        },
      } as never,
    }));
    expect(hidden.blocker).toBe('hidden_export_mismatch');
  });

  it('excludes parked analyzer-debt rows from fixer acceptance', () => {
    const row = classifyStage61HeadingSchedulingRow(input({ id: 'v1-4683', role: 'parked' }));
    expect(row.blocker).toBe('parked_analyzer_debt');
  });

  it('selects the follow-on decision from the v1-4567 focus blocker', () => {
    const blocked = classifyStage61HeadingSchedulingRow(input());
    expect(buildStage61HeadingSchedulingReport([blocked]).decision.status).toBe('implement_heading_scheduling_fix');

    const noCandidates = classifyStage61HeadingSchedulingRow(input({ eligibleCandidates: [] }));
    expect(buildStage61HeadingSchedulingReport([noCandidates]).decision.status).toBe('diagnostic_only_move_to_table_tail');
  });
});

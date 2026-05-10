import { describe, expect, it } from 'vitest';
import { buildProposalMaterializationDiagnostic } from '../../scripts/all-input-proposal-materialization-diagnostic.js';

function details(input: {
  beforeState?: string;
  afterState?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  headingBefore?: number;
  headingAfter?: number;
  readingBefore?: number;
  readingAfter?: number;
  pacRuleIds?: string[];
  targetRef?: string;
}) {
  const pacRuleRegressions = (input.pacRuleIds ?? []).map(ruleId => ({
    ruleId,
    beforeStatus: 'pass',
    afterStatus: 'fail',
    beforeCount: 0,
    afterCount: 1,
  }));
  return JSON.stringify({
    outcome: 'rejected',
    note: input.pacRuleIds?.[0] ? `pac_rule_regressed(${input.pacRuleIds[0]})` : undefined,
    pacRuleRegression: pacRuleRegressions[0],
    pacRuleRegressions,
    invariants: input.targetRef ? { targetRef: input.targetRef } : undefined,
    debug: {
      replayState: {
        stateSignatureBefore: input.beforeState,
        stateSignatureAfter: input.afterState,
        scoreBefore: input.scoreBefore ?? 50,
        scoreAfter: input.scoreAfter ?? 80,
        categoryScoresBefore: {
          heading_structure: input.headingBefore ?? 0,
          reading_order: input.readingBefore ?? 70,
        },
        categoryScoresAfter: {
          heading_structure: input.headingAfter ?? 95,
          reading_order: input.readingAfter ?? 79,
        },
      },
    },
  });
}

function cleanupDetails(state: string) {
  return JSON.stringify({
    outcome: 'applied',
    debug: {
      replayState: {
        stateSignatureBefore: state,
        stateSignatureAfter: `${state}-clean`,
        scoreBefore: 80,
        scoreAfter: 91,
        categoryScoresBefore: { heading_structure: 95, reading_order: 79 },
        categoryScoresAfter: { heading_structure: 95, reading_order: 96 },
      },
    },
  });
}

function row(appliedTools: any[] = []) {
  return {
    file: '0306.pdf',
    afterScore: 59,
    afterGrade: 'F',
    appliedTools,
  };
}

describe('all-input proposal materialization diagnostic', () => {
  it('classifies score-moving annotation-blocked proposals without proposed-state cleanup as requiring a rejected proposal buffer', () => {
    const report = buildProposalMaterializationDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [row([
        {
          toolName: 'create_heading_from_candidate',
          outcome: 'rejected',
          scoreBefore: 59,
          scoreAfter: 59,
          details: details({
            beforeState: 'before',
            afterState: 'proposal',
            scoreBefore: 59,
            scoreAfter: 79,
            pacRuleIds: ['pdfua.annotations.tagged_annotations_present'],
          }),
        },
        {
          toolName: 'tag_unowned_annotations',
          outcome: 'no_effect',
          scoreBefore: 59,
          scoreAfter: 59,
          details: cleanupDetails('before'),
        },
      ])],
    });

    expect(report.summary.requiresRejectedProposalBufferCount).toBe(1);
    expect(report.rows[0]).toMatchObject({
      classification: 'requires_rejected_proposal_buffer',
      bestProposal: {
        classification: 'requires_intermediate_buffer',
        stateSignatureBefore: 'before',
        stateSignatureAfter: 'proposal',
        cleanupFromProposalCount: 0,
        hasTargetEvidence: false,
      },
    });
  });

  it('detects when cleanup already ran from the proposed intermediate state', () => {
    const report = buildProposalMaterializationDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [row([
        {
          toolName: 'synthesize_basic_structure_from_layout',
          outcome: 'rejected',
          details: details({
            beforeState: 'before',
            afterState: 'proposal',
            pacRuleIds: ['pdfua.annotations.tagged_annotations_present', 'pdfua.content.orphan_mcids_absent'],
            targetRef: '12_0',
          }),
        },
        {
          toolName: 'normalize_annotation_tab_order',
          outcome: 'applied',
          details: cleanupDetails('proposal'),
        },
      ])],
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'materialization_candidate',
      bestProposal: {
        classification: 'cleanup_from_proposal_observed',
        cleanupFromProposalTools: ['normalize_annotation_tab_order'],
        hasTargetEvidence: true,
      },
    });
  });

  it('does not select proposals with non-annotation PAC blockers', () => {
    const report = buildProposalMaterializationDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [row([
        {
          toolName: 'create_heading_from_candidate',
          outcome: 'rejected',
          details: details({
            beforeState: 'before',
            afterState: 'proposal',
            pacRuleIds: ['pdfua.structure.parent_links_valid'],
          }),
        },
      ])],
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'unsafe_intermediate',
      bestProposal: { classification: 'unsafe_intermediate' },
    });
  });

  it('keeps non-score-moving rejected proposals out of the selected set', () => {
    const report = buildProposalMaterializationDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [row([
        {
          toolName: 'create_heading_from_candidate',
          outcome: 'rejected',
          details: details({
            beforeState: 'before',
            afterState: 'proposal',
            scoreBefore: 59,
            scoreAfter: 59,
            headingBefore: 0,
            headingAfter: 0,
            pacRuleIds: ['pdfua.annotations.tagged_annotations_present'],
          }),
        },
      ])],
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'no_score_moving_proposal',
      bestProposal: { classification: 'not_score_moving' },
    });
  });
});

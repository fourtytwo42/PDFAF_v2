import { describe, expect, it } from 'vitest';
import {
  buildStructureAnnotationSequenceDiagnostic,
  type TraceRunRow,
  type TraceToolRow,
} from '../../scripts/all-input-structure-annotation-sequence-diagnostic.js';

function details(input: {
  pacRules?: string[];
  scoreBefore?: number;
  scoreAfter?: number;
  headingBefore?: number;
  headingAfter?: number;
  readingBefore?: number;
  readingAfter?: number;
  raw?: string;
}) {
  return JSON.stringify({
    outcome: 'rejected',
    raw: input.raw,
    pacRuleRegressions: (input.pacRules ?? []).map(ruleId => ({ ruleId })),
    debug: {
      replayState: {
        stateSignatureBefore: 'state-a',
        scoreBefore: input.scoreBefore ?? 50,
        scoreAfter: input.scoreAfter ?? 80,
        categoryScoresBefore: {
          heading_structure: input.headingBefore ?? 0,
          reading_order: input.readingBefore ?? 30,
        },
        categoryScoresAfter: {
          heading_structure: input.headingAfter ?? 94,
          reading_order: input.readingAfter ?? 80,
        },
      },
    },
  });
}

function tool(input: Partial<TraceToolRow> & { toolName: string }): TraceToolRow {
  return {
    toolName: input.toolName,
    outcome: input.outcome ?? 'rejected',
    scoreBefore: input.scoreBefore ?? 50,
    scoreAfter: input.scoreAfter ?? 50,
    details: input.details,
  };
}

function row(input: Partial<TraceRunRow> & { file: string; appliedTools: TraceToolRow[] }): TraceRunRow {
  return {
    file: input.file,
    afterScore: input.afterScore ?? 59,
    afterGrade: input.afterGrade ?? 'F',
    afterCategories: input.afterCategories ?? [
      { key: 'heading_structure', score: 0 },
      { key: 'reading_order', score: 30 },
    ],
    appliedTools: input.appliedTools,
  };
}

describe('all-input structure annotation sequence diagnostic', () => {
  it('selects a sequence probe candidate only with score-moving annotation-blocked structure and non-regressive cleanup evidence', () => {
    const report = buildStructureAnnotationSequenceDiagnostic({
      generatedAt: '2026-05-09T00:00:00.000Z',
      rows: [
        row({
          file: 'candidate.pdf',
          appliedTools: [
            tool({
              toolName: 'synthesize_basic_structure_from_layout',
              details: details({
                pacRules: ['pdfua.annotations.tagged_annotations_present', 'pdfua.content.orphan_mcids_absent'],
                scoreBefore: 48,
                scoreAfter: 82,
                headingBefore: 0,
                headingAfter: 94,
              }),
            }),
            tool({ toolName: 'tag_unowned_annotations', outcome: 'applied', details: JSON.stringify({ outcome: 'applied' }) }),
          ],
        }),
      ],
    });

    expect(report.summary.sequenceProbeCandidateCount).toBe(1);
    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'sequence_probe_candidate',
      scoreMovingProposalCount: 1,
      cleanupAttemptCount: 1,
    }));
  });

  it('does not select rows where annotation-blocked proposals do not move score and heading', () => {
    const report = buildStructureAnnotationSequenceDiagnostic({
      rows: [
        row({
          file: 'no-score.pdf',
          appliedTools: [
            tool({
              toolName: 'repair_structure_conformance',
              details: details({
                pacRules: ['pdfua.annotations.tagged_annotations_present'],
                scoreBefore: 59,
                scoreAfter: 59,
                headingBefore: 0,
                headingAfter: 0,
              }),
            }),
          ],
        }),
      ],
    });

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'annotation_blocked_no_score_movement',
      scoreMovingProposalCount: 0,
    }));
  });

  it('separates mixed PAC blockers and regressive cleanup from safe candidates', () => {
    const report = buildStructureAnnotationSequenceDiagnostic({
      rows: [
        row({
          file: 'mixed.pdf',
          appliedTools: [
            tool({
              toolName: 'create_heading_from_candidate',
              details: details({
                pacRules: ['pdfua.annotations.tagged_annotations_present', 'pdfua.figure.alt_present'],
                scoreBefore: 48,
                scoreAfter: 82,
                headingBefore: 0,
                headingAfter: 94,
              }),
            }),
          ],
        }),
        row({
          file: 'regressive-cleanup.pdf',
          appliedTools: [
            tool({
              toolName: 'create_heading_from_candidate',
              details: details({
                pacRules: ['pdfua.annotations.tagged_annotations_present'],
                scoreBefore: 48,
                scoreAfter: 82,
                headingBefore: 0,
                headingAfter: 94,
              }),
            }),
            tool({
              toolName: 'repair_native_link_structure',
              outcome: 'rejected',
              details: JSON.stringify({ raw: 'stage_regressed_score(45)' }),
            }),
          ],
        }),
      ],
    });

    expect(report.rows.map(item => `${item.file}:${item.classification}`).sort()).toEqual([
      'mixed.pdf:mixed_non_annotation_pac_blockers',
      'regressive-cleanup.pdf:cleanup_unproven_or_regressive',
    ]);
  });

  it('keeps a row selectable when at least one score-moving proposal is annotation-only', () => {
    const report = buildStructureAnnotationSequenceDiagnostic({
      rows: [
        row({
          file: 'mixed-plus-clean.pdf',
          appliedTools: [
            tool({
              toolName: 'repair_structure_conformance',
              details: details({
                pacRules: ['pdfua.annotations.tagged_annotations_present', 'pdfua.parent_tree.mcid_entries_valid'],
                scoreBefore: 48,
                scoreAfter: 82,
                headingBefore: 0,
                headingAfter: 94,
              }),
            }),
            tool({
              toolName: 'create_heading_from_candidate',
              details: details({
                pacRules: ['pdfua.annotations.tagged_annotations_present'],
                scoreBefore: 48,
                scoreAfter: 82,
                headingBefore: 0,
                headingAfter: 94,
              }),
            }),
            tool({ toolName: 'tag_unowned_annotations', outcome: 'applied', details: JSON.stringify({ outcome: 'applied' }) }),
          ],
        }),
      ],
    });

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'sequence_probe_candidate',
      scoreMovingProposalCount: 2,
    }));
  });
});

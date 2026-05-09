import { describe, expect, it } from 'vitest';
import {
  buildFont3448NativeTaggingReport,
} from '../../scripts/font3448-native-tagging-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function tool(input: {
  toolName: string;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  stateBefore?: string | null;
  stateAfter?: string | null;
  note?: string;
  headingBefore?: number;
  headingAfter?: number;
  readingBefore?: number;
  readingAfter?: number;
  pdfUaBefore?: number;
  pdfUaAfter?: number;
}) {
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore,
    scoreAfter: input.scoreAfter,
    delta: input.scoreAfter - input.scoreBefore,
    outcome: input.outcome,
    source: 'planner',
    details: JSON.stringify({
      raw: input.note,
      note: input.note,
      debug: {
        replayState: {
          stateSignatureBefore: input.stateBefore ?? null,
          stateSignatureAfter: input.stateAfter ?? null,
          scoreBefore: input.scoreBefore,
          scoreAfter: input.scoreAfter,
          categoryScoresBefore: {
            heading_structure: input.headingBefore ?? 0,
            reading_order: input.readingBefore ?? 0,
            pdf_ua_compliance: input.pdfUaBefore ?? 80,
          },
          categoryScoresAfter: {
            heading_structure: input.headingAfter ?? 98,
            reading_order: input.readingAfter ?? 79,
            pdf_ua_compliance: input.pdfUaAfter ?? 67,
          },
        },
      },
    }),
  } as RemediateBenchmarkRow['appliedTools'][number];
}

function row(input: {
  id?: string;
  score?: number;
  tools?: RemediateBenchmarkRow['appliedTools'];
}): RemediateBenchmarkRow {
  return {
    id: input.id ?? 'font-3448',
    file: `${input.id ?? 'font-3448'}.pdf`,
    cohort: 'test',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 10,
    beforeGrade: 'F',
    beforePdfClass: 'native_tagged',
    afterScore: input.score ?? 51,
    afterGrade: 'F',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.score ?? 51,
    reanalyzedGrade: 'F',
    reanalyzedPdfClass: 'native_tagged',
    delta: null,
    appliedTools: input.tools ?? [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: 1,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
  } as RemediateBenchmarkRow;
}

function report(input: {
  strictTools: RemediateBenchmarkRow['appliedTools'];
  currentTools: RemediateBenchmarkRow['appliedTools'];
}) {
  return buildFont3448NativeTaggingReport({
    generatedAt: '2026-05-08T00:00:00.000Z',
    stage42Run: 'stage42',
    strictRun: 'strict',
    currentRun: 'current',
    stage42Rows: [row({ score: 86, tools: [] })],
    strictRows: [row({ score: 93, tools: input.strictTools })],
    currentRows: [row({ score: 51, tools: input.currentTools })],
  });
}

describe('font-3448 native tagging diagnostic', () => {
  it('classifies same-state orphan-MCID rejection as a recovery candidate', () => {
    const diagnostic = report({
      strictTools: [
        tool({
          toolName: 'tag_native_text_blocks',
          outcome: 'applied',
          scoreBefore: 44,
          scoreAfter: 83,
          stateBefore: '39be10e26232bf205f091beb',
          stateAfter: 'strict-after',
          headingBefore: 0,
          headingAfter: 98,
          readingBefore: 0,
          readingAfter: 79,
          pdfUaBefore: 80,
          pdfUaAfter: 80,
        }),
      ],
      currentTools: [
        tool({
          toolName: 'tag_native_text_blocks',
          outcome: 'rejected',
          scoreBefore: 44,
          scoreAfter: 44,
          stateBefore: '39be10e26232bf205f091beb',
          stateAfter: 'current-after',
          note: 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)',
          headingBefore: 0,
          headingAfter: 79,
          readingBefore: 0,
          readingAfter: 79,
          pdfUaBefore: 80,
          pdfUaAfter: 67,
        }),
      ],
    });

    expect(diagnostic).toMatchObject({
      classification: 'same_state_orphan_recovery_candidate',
      sameReplayState: true,
      orphanOnlyPacRejection: true,
      scoreImproved: true,
      headingImproved: true,
      readingOrderImproved: true,
      pdfUaDelta: -13,
    });
  });

  it('does not classify different replay states as same-state recovery', () => {
    const diagnostic = report({
      strictTools: [tool({ toolName: 'tag_native_text_blocks', outcome: 'applied', scoreBefore: 44, scoreAfter: 83, stateBefore: 'a' })],
      currentTools: [tool({ toolName: 'tag_native_text_blocks', outcome: 'rejected', scoreBefore: 44, scoreAfter: 44, stateBefore: 'b', note: 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)' })],
    });

    expect(diagnostic.classification).toBe('upstream_route_volatility');
  });

  it('requires orphan-only PAC rejection and heading/reading movement', () => {
    expect(report({
      strictTools: [tool({ toolName: 'tag_native_text_blocks', outcome: 'applied', scoreBefore: 44, scoreAfter: 83, stateBefore: 'same' })],
      currentTools: [tool({ toolName: 'tag_native_text_blocks', outcome: 'rejected', scoreBefore: 44, scoreAfter: 44, stateBefore: 'same', note: 'pac_rule_regressed(pdfua.annotations.tagged_annotations_present)' })],
    }).classification).toBe('same_state_not_safe');

    expect(report({
      strictTools: [tool({ toolName: 'tag_native_text_blocks', outcome: 'applied', scoreBefore: 44, scoreAfter: 83, stateBefore: 'same' })],
      currentTools: [tool({ toolName: 'tag_native_text_blocks', outcome: 'rejected', scoreBefore: 44, scoreAfter: 44, stateBefore: 'same', note: 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)', readingBefore: 79, readingAfter: 79 })],
    }).classification).toBe('same_state_not_safe');
  });

  it('handles missing events deterministically', () => {
    expect(report({ strictTools: [], currentTools: [] }).classification).toBe('missing_evidence');
  });
});

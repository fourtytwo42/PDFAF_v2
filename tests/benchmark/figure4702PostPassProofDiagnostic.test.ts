import { describe, expect, it } from 'vitest';
import { buildFigure4702PostPassProofDiagnostic } from '../../scripts/figure4702-postpass-proof-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { AppliedRemediationTool } from '../../src/types.js';

function details(note?: string, before?: Record<string, number>, after?: Record<string, number>): string {
  return JSON.stringify({
    outcome: 'applied',
    note,
    debug: {
      replayState: {
        categoryScoresBefore: before ?? {},
        categoryScoresAfter: after ?? {},
      },
    },
  });
}

function tool(input: Partial<AppliedRemediationTool> & { toolName: string }): AppliedRemediationTool {
  const scoreBefore = input.scoreBefore ?? 82;
  const scoreAfter = input.scoreAfter ?? scoreBefore;
  return {
    toolName: input.toolName,
    stage: input.stage ?? 1,
    round: input.round ?? 1,
    scoreBefore,
    scoreAfter,
    delta: input.delta ?? (scoreAfter - scoreBefore),
    outcome: input.outcome ?? 'applied',
    details: input.details ?? details(),
    durationMs: input.durationMs ?? 100,
    source: input.source,
  };
}

function row(input: Partial<RemediateBenchmarkRow> & { id?: string; appliedTools?: AppliedRemediationTool[] }): RemediateBenchmarkRow {
  return {
    id: input.id ?? 'figure-4702',
    file: input.file ?? '4702.pdf',
    cohort: input.cohort ?? '20-figure-ownership',
    sourceType: input.sourceType ?? 'original',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 37,
    beforeGrade: input.beforeGrade ?? 'F',
    beforePdfClass: input.beforePdfClass ?? 'native_untagged',
    afterScore: input.afterScore ?? 91,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? input.afterScore ?? 91,
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'A',
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? 'native_tagged',
    delta: input.delta ?? 54,
    appliedTools: input.appliedTools ?? [],
    rounds: input.rounds ?? [],
    analysisBeforeMs: input.analysisBeforeMs ?? 1,
    remediationDurationMs: input.remediationDurationMs ?? 1,
    wallRemediateMs: input.wallRemediateMs ?? 1,
    analysisAfterMs: input.analysisAfterMs ?? 1,
    totalPipelineMs: input.totalPipelineMs ?? 1,
  } as RemediateBenchmarkRow;
}

function report(current: RemediateBenchmarkRow) {
  return buildFigure4702PostPassProofDiagnostic({
    currentRunDir: 'current',
    sequenceRunDir: 'sequence',
    currentRows: [current],
    sequenceRows: [row({ afterScore: 91, reanalyzedScore: 91 })],
    runtimeDiagnostic: {
      rows: [{ id: 'figure-4702', classification: 'optional_postpass_churn' }],
    },
    runtimeDiagnosticPath: 'runtime.json',
    generatedAt: '2026-05-09T00:00:00.000Z',
  });
}

describe('figure-4702 post-pass proof diagnostic', () => {
  it('detects sequence recovery and separates required score gain from later no-gain post-pass work', () => {
    const result = report(row({
      appliedTools: [
        tool({
          toolName: 'synthesize_basic_structure_from_layout',
          scoreBefore: 48,
          scoreAfter: 82,
          details: details('structure_annotation_sequence_recovered', { heading_structure: 0 }, { heading_structure: 94 }),
        }),
        tool({
          toolName: 'repair_alt_text_structure',
          source: 'post_pass',
          scoreBefore: 82,
          scoreAfter: 91,
          details: details('pac_orphan_mcid_recovery(repair_alt_text_structure)', { alt_text: 60 }, { alt_text: 90 }),
        }),
        tool({
          toolName: 'set_pdfua_identification',
          source: 'post_pass',
          scoreBefore: 91,
          scoreAfter: 91,
          details: details('post_pass_pdfua_xmp', { pdf_ua_compliance: 57 }, { pdf_ua_compliance: 71 }),
        }),
        tool({ toolName: 'set_pdfua_identification', source: 'post_pass', scoreBefore: 91, scoreAfter: 91 }),
      ],
    }));
    expect(result.sequenceRecoveryIndex).toBe(0);
    expect(result.targetQualityTool).toBe('set_pdfua_identification');
    expect(result.postTargetTools).toMatchObject([
      { toolName: 'set_pdfua_identification', classification: 'optional_no_gain_post_pass' },
    ]);
    expect(result.summary.decision).toBe('guard_candidate');
  });

  it('rejects the proof when final figure-4702 score is below 91', () => {
    const result = report(row({
      afterScore: 90,
      reanalyzedScore: 90,
      afterGrade: 'A',
      reanalyzedGrade: 'A',
      appliedTools: [
        tool({
          toolName: 'synthesize_basic_structure_from_layout',
          scoreBefore: 48,
          scoreAfter: 82,
          details: details('structure_annotation_sequence_recovered'),
        }),
        tool({ toolName: 'repair_alt_text_structure', source: 'post_pass', scoreBefore: 82, scoreAfter: 90 }),
      ],
    }));
    expect(result.summary.targetQualityReached).toBe(false);
    expect(result.summary.decision).toBe('diagnostic_only_not_safe');
  });

  it('keeps score/category-moving post-pass work before the guard boundary', () => {
    const result = report(row({
      appliedTools: [
        tool({
          toolName: 'synthesize_basic_structure_from_layout',
          scoreBefore: 48,
          scoreAfter: 82,
          details: details('structure_annotation_sequence_recovered'),
        }),
        tool({ toolName: 'repair_alt_text_structure', source: 'post_pass', scoreBefore: 82, scoreAfter: 91 }),
        tool({
          toolName: 'normalize_heading_hierarchy',
          source: 'post_pass',
          scoreBefore: 91,
          scoreAfter: 91,
          details: details(undefined, { heading_structure: 91 }, { heading_structure: 95 }),
        }),
        tool({ toolName: 'set_pdfua_identification', source: 'post_pass', scoreBefore: 91, scoreAfter: 91 }),
      ],
    }));
    expect(result.targetQualityTool).toBe('normalize_heading_hierarchy');
    expect(result.postTargetTools[0]?.toolName).toBe('set_pdfua_identification');
    expect(result.postTargetTools[0]?.classification).toBe('optional_no_gain_post_pass');
    expect(result.summary.decision).toBe('guard_candidate');
  });

  it('handles missing replay and post-pass details deterministically', () => {
    const result = report(row({
      appliedTools: [
        tool({
          toolName: 'synthesize_basic_structure_from_layout',
          scoreBefore: 48,
          scoreAfter: 82,
          details: 'structure_annotation_sequence_recovered',
        }),
        tool({ toolName: 'repair_alt_text_structure', source: 'post_pass', scoreBefore: 82, scoreAfter: 91, details: undefined }),
        tool({ toolName: 'unknown_cleanup', source: undefined, scoreBefore: 91, scoreAfter: 91, details: undefined }),
      ],
    }));
    expect(result.sequenceRecoveryIndex).toBe(0);
    expect(result.postTargetTools[0]?.classification).toBe('unknown_needs_repeat_proof');
    expect(result.summary.decision).toBe('diagnostic_only_not_safe');
  });
});

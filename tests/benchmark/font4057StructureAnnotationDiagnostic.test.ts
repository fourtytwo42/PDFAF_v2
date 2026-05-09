import { describe, expect, it } from 'vitest';
import { buildFont4057StructureAnnotationDiagnostic } from '../../scripts/font4057-structure-annotation-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { AppliedRemediationTool } from '../../src/types.js';

function tool(input: {
  toolName: string;
  scoreBefore?: number;
  scoreAfter?: number;
  pacRules?: string[];
  headingAfter?: number;
  tableAfter?: number;
  readingAfter?: number;
}): AppliedRemediationTool {
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore ?? 38,
    scoreAfter: input.scoreBefore ?? 38,
    delta: 0,
    outcome: 'rejected',
    durationMs: 1,
    details: JSON.stringify({
      outcome: 'rejected',
      pacRuleRegressions: (input.pacRules ?? []).map(ruleId => ({ ruleId })),
      debug: {
        replayState: {
          stateSignatureBefore: 'state-a',
          scoreBefore: input.scoreBefore ?? 38,
          scoreAfter: input.scoreAfter ?? 61,
          categoryScoresBefore: {
            heading_structure: 0,
            table_markup: 0,
            reading_order: 0,
          },
          categoryScoresAfter: {
            heading_structure: input.headingAfter ?? 96,
            table_markup: input.tableAfter ?? 44,
            reading_order: input.readingAfter ?? 0,
          },
        },
      },
    }),
  } as AppliedRemediationTool;
}

function row(input: Partial<RemediateBenchmarkRow>): RemediateBenchmarkRow {
  return {
    id: 'font-4057',
    file: 'font-4057.pdf',
    cohort: 'test',
    sourceType: 'original',
    intent: 'test',
    beforeScore: 30,
    beforeGrade: 'F',
    beforePdfClass: 'native_tagged',
    afterScore: input.afterScore ?? 38,
    afterGrade: input.afterGrade ?? 'F',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? input.afterScore ?? 38,
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'F',
    reanalyzedPdfClass: 'native_tagged',
    reanalyzedCategories: input.reanalyzedCategories ?? [
      { key: 'heading_structure', score: 0 },
      { key: 'alt_text', score: 20 },
      { key: 'table_markup', score: 0 },
      { key: 'reading_order', score: 0 },
    ] as RemediateBenchmarkRow['reanalyzedCategories'],
    delta: null,
    appliedTools: input.appliedTools ?? [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: 1,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
  } as RemediateBenchmarkRow;
}

function report(input: Partial<RemediateBenchmarkRow>) {
  return buildFont4057StructureAnnotationDiagnostic({
    runDir: 'run',
    row: row(input),
    generatedAt: '2026-05-09T00:00:00.000Z',
  });
}

describe('font-4057 structure annotation diagnostic', () => {
  it('classifies mixed table/alt debt when annotation-blocked structure gains still leave heavy category debt', () => {
    const diagnostic = report({
      appliedTools: [
        tool({
          toolName: 'create_heading_from_candidate',
          pacRules: ['pdfua.annotations.tagged_annotations_present'],
          scoreAfter: 61,
          headingAfter: 96,
          tableAfter: 44,
        }),
      ],
    });

    expect(diagnostic.classification).toBe('mixed_table_alt_annotation_debt');
    expect(diagnostic.bestBlockedScoreAfter).toBe(61);
    expect(diagnostic.bestBlockedHeadingAfter).toBe(96);
  });

  it('classifies a safe-looking row as a sequence candidate only when final table and alt debt are not heavy', () => {
    const diagnostic = report({
      reanalyzedCategories: [
        { key: 'heading_structure', score: 80 },
        { key: 'alt_text', score: 80 },
        { key: 'table_markup', score: 80 },
        { key: 'reading_order', score: 80 },
      ] as RemediateBenchmarkRow['reanalyzedCategories'],
      appliedTools: [
        tool({
          toolName: 'normalize_heading_hierarchy',
          pacRules: ['pdfua.annotations.tagged_annotations_present'],
          scoreAfter: 84,
          headingAfter: 96,
          tableAfter: 80,
          readingAfter: 80,
        }),
      ],
    });

    expect(diagnostic.classification).toBe('structure_annotation_sequence_candidate');
  });

  it('does not select behavior when no rejected proposal moves score', () => {
    const diagnostic = report({
      appliedTools: [
        tool({
          toolName: 'repair_structure_conformance',
          pacRules: ['pdfua.annotations.tagged_annotations_present'],
          scoreBefore: 38,
          scoreAfter: 38,
        }),
      ],
    });

    expect(diagnostic.classification).toBe('no_score_moving_structure_candidate');
  });

  it('ignores unrelated rejected tools', () => {
    const diagnostic = report({
      appliedTools: [
        tool({
          toolName: 'set_document_title',
          pacRules: ['pdfua.annotations.tagged_annotations_present'],
          scoreAfter: 61,
        }),
      ],
    });

    expect(diagnostic.rejectedStructureProposalCount).toBe(0);
    expect(diagnostic.classification).toBe('no_score_moving_structure_candidate');
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyFinalHiddenHeadingParity,
  buildStage52bHiddenHeadingParityReport,
  deriveFinalHiddenHeadingParity,
} from '../../scripts/stage52b-hidden-heading-parity.js';
import type { EdgeMixBenchmarkRow } from '../../scripts/stage49-edge-mix-baseline.js';

function row(input: Partial<EdgeMixBenchmarkRow> = {}): EdgeMixBenchmarkRow {
  return {
    id: input.id ?? 'v1-4139',
    publicationId: input.publicationId ?? '4139',
    title: input.title ?? 'sample',
    file: input.file ?? 'sample.pdf',
    localFile: input.localFile ?? 'sample.pdf',
    v1Score: input.v1Score ?? null,
    v1Grade: input.v1Grade ?? null,
    pageCount: input.pageCount ?? 4,
    problemMix: input.problemMix ?? [],
    beforeScore: input.beforeScore ?? 59,
    beforeGrade: input.beforeGrade ?? 'F',
    beforeCategories: input.beforeCategories ?? [],
    afterScore: input.afterScore ?? 59,
    afterGrade: input.afterGrade ?? 'F',
    afterCategories: input.afterCategories ?? [
      { key: 'text_extractability', score: 96, applicable: true },
      { key: 'title_language', score: 100, applicable: true },
      { key: 'heading_structure', score: 0, applicable: true },
      { key: 'alt_text', score: 100, applicable: true },
      { key: 'pdf_ua_compliance', score: 80, applicable: true },
      { key: 'bookmarks', score: 97, applicable: true },
      { key: 'table_markup', score: 100, applicable: false },
      { key: 'color_contrast', score: 100, applicable: false },
      { key: 'link_quality', score: 100, applicable: true },
      { key: 'reading_order', score: 96, applicable: true },
      { key: 'form_accessibility', score: 100, applicable: false },
    ],
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    afterDetectionProfile: input.afterDetectionProfile ?? {
      headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 0 },
    },
    delta: input.delta ?? 0,
    appliedTools: input.appliedTools ?? [
      {
        toolName: 'normalize_heading_hierarchy',
        stage: 4,
        round: 1,
        scoreBefore: 59,
        scoreAfter: 59,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          invariants: { rootReachableHeadingCountAfter: 4 },
        }),
      },
    ],
    falsePositiveAppliedCount: input.falsePositiveAppliedCount ?? 0,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisBeforeMs: input.analysisBeforeMs ?? 100,
    analysisAfterMs: input.analysisAfterMs ?? 100,
    totalPipelineMs: input.totalPipelineMs ?? 1200,
    ...(input.error ? { error: input.error } : {}),
  };
}

describe('Stage 52B final-only hidden-heading parity', () => {
  it('applies reduced-confidence heading credit from structured root-reachable evidence', () => {
    const adjusted = applyFinalHiddenHeadingParity(row());
    const heading = adjusted.afterCategories.find(category => category.key === 'heading_structure');
    expect(heading?.score).toBe(78);
    expect(adjusted.afterScore).toBeGreaterThan(59);
    expect(adjusted.finalAdjustments?.[0]).toMatchObject({
      kind: 'final_hidden_heading_parity',
      status: 'applied',
      evidenceCount: 4,
      sourceTool: 'normalize_heading_hierarchy',
    });
    expect(adjusted.appliedTools).toHaveLength(1);
    expect(adjusted.falsePositiveAppliedCount).toBe(0);
  });

  it('uses the higher reduced-confidence score for sufficient hidden heading density', () => {
    const adjusted = applyFinalHiddenHeadingParity(row({
      appliedTools: [
        {
          toolName: 'normalize_heading_hierarchy',
          stage: 4,
          round: 1,
          scoreBefore: 59,
          scoreAfter: 59,
          delta: 0,
          outcome: 'no_effect',
          details: JSON.stringify({ debug: { rootReachableHeadingCount: 105 } }),
        },
      ],
    }));
    expect(adjusted.afterCategories.find(category => category.key === 'heading_structure')?.score).toBe(86);
  });

  it('does not apply when figure or table categories are still failing', () => {
    expect(deriveFinalHiddenHeadingParity(row({
      afterCategories: row().afterCategories.map(category =>
        category.key === 'alt_text' ? { ...category, score: 20, applicable: true } : category
      ),
    })).reason).toBe('alt_text_below_guard');
    expect(deriveFinalHiddenHeadingParity(row({
      afterCategories: row().afterCategories.map(category =>
        category.key === 'table_markup' ? { ...category, score: 35, applicable: true } : category
      ),
    })).reason).toBe('table_markup_below_guard');
  });

  it('does not apply from legacy free-form details', () => {
    const result = deriveFinalHiddenHeadingParity(row({
      appliedTools: [
        {
          toolName: 'normalize_heading_hierarchy',
          stage: 4,
          round: 1,
          scoreBefore: 59,
          scoreAfter: 59,
          delta: 0,
          outcome: 'no_effect',
          details: 'rootReachableHeadingCountAfter=4',
        },
      ],
    }));
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('missing_structured_root_reachable_heading_evidence');
  });

  it('does not apply when final scorer already sees headings', () => {
    expect(deriveFinalHiddenHeadingParity(row({
      afterCategories: row().afterCategories.map(category =>
        category.key === 'heading_structure' ? { ...category, score: 78 } : category
      ),
    })).reason).toBe('heading_score_not_zero');
    expect(deriveFinalHiddenHeadingParity(row({
      afterDetectionProfile: { headingSignals: { extractedHeadingCount: 1, treeHeadingCount: 0 } },
    })).reason).toBe('final_heading_signals_not_zero');
  });

  it('skips rows with critical score caps', () => {
    expect(deriveFinalHiddenHeadingParity(row({
      afterScoreCapsApplied: [{ category: 'text_extractability', cap: 59, rawScore: 100, finalScore: 59, reason: 'critical blocker' }],
    })).reason).toBe('critical_score_cap_present');
  });

  it('reports before/after simulation without mutating applied tool attempts', () => {
    const report = buildStage52bHiddenHeadingParityReport([
      row({ id: 'v1-4139' }),
      row({
        id: 'v1-4683',
        afterCategories: row().afterCategories.map(category =>
          category.key === 'alt_text' ? { ...category, score: 0, applicable: true } : category
        ),
      }),
    ], 'run');
    expect(report.appliedCount).toBe(1);
    expect(report.rows.find(item => item.id === 'v1-4683')?.reason).toBe('alt_text_below_guard');
    expect(report.meanAfter).toBeGreaterThan(report.meanBefore);
  });
});

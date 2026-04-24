import { describe, expect, it } from 'vitest';
import {
  buildStage63Report,
  classifyStage63Residual,
  type Stage63RunPair,
} from '../../scripts/stage63-residual-decision.js';

const pair: Stage63RunPair = { corpus: 'edge_mix_1', stage59RunDir: 's59', stage62RunDir: 's62' };

function row(input: {
  id?: string;
  score: number;
  grade?: string;
  localFile?: string;
  cats?: Record<string, number>;
  tools?: Array<Record<string, unknown>>;
  fp?: number;
}): Record<string, unknown> {
  return {
    id: input.id ?? 'v1-4145',
    publicationId: (input.id ?? 'v1-4145').replace(/^v1-/, ''),
    localFile: input.localFile ?? 'figure_alt/sample.pdf',
    afterScore: input.score,
    afterGrade: input.grade ?? (input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : input.score >= 70 ? 'C' : input.score >= 60 ? 'D' : 'F'),
    afterCategories: Object.entries(input.cats ?? {
      heading_structure: 95,
      alt_text: 20,
      table_markup: 100,
      reading_order: 96,
      pdf_ua_compliance: 83,
    }).map(([key, score]) => ({ key, score })),
    appliedTools: input.tools ?? [],
    falsePositiveAppliedCount: input.fp ?? 0,
  };
}

describe('Stage 63 residual decision', () => {
  it('classifies stable figure-alt residuals with figure tool evidence', () => {
    const report = classifyStage63Residual({
      id: 'v1-4145',
      corpus: 'edge_mix_1',
      stage59: row({ score: 78 }),
      stage62: row({
        score: 59,
        cats: { heading_structure: 95, alt_text: 0, table_markup: 100, reading_order: 100 },
        tools: [{ toolName: 'set_figure_alt_text', outcome: 'no_effect' }],
      }),
    });
    expect(report.class).toBe('figure_alt_residual');
    expect(report.stableForFixer).toBe(true);
  });

  it('parks known analyzer-volatility rows even when they look structurally fixable', () => {
    const report = classifyStage63Residual({
      id: 'v1-4683',
      corpus: 'edge_mix_1',
      stage59: row({ id: 'v1-4683', score: 56 }),
      stage62: row({ id: 'v1-4683', score: 76, cats: { heading_structure: 99, alt_text: 20, table_markup: 100, reading_order: 96 } }),
    });
    expect(report.class).toBe('analyzer_volatility');
    expect(report.stableForFixer).toBe(false);
  });

  it('classifies manual/scanned debt separately from structural fix candidates', () => {
    const report = classifyStage63Residual({
      id: 'v1-3479',
      corpus: 'edge_mix_2',
      stage59: row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
      stage62: row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
    });
    expect(report.class).toBe('manual_scanned_debt');
    expect(report.stableForFixer).toBe(false);
  });

  it('classifies table follow-up candidates only when table tools were involved', () => {
    const report = classifyStage63Residual({
      id: 'v1-4722',
      corpus: 'edge_mix_2',
      stage59: row({ id: 'v1-4722', score: 69, cats: { table_markup: 0, alt_text: 100, heading_structure: 95, reading_order: 96 } }),
      stage62: row({
        id: 'v1-4722',
        score: 69,
        cats: { table_markup: 16, alt_text: 100, heading_structure: 95, reading_order: 96 },
        tools: [{ toolName: 'normalize_table_structure', outcome: 'applied' }],
      }),
    });
    expect(report.class).toBe('table_followup_possible');
  });

  it('does not let mixed structural debt drive a single-family fixer choice', () => {
    const report = classifyStage63Residual({
      id: 'v1-4567',
      corpus: 'edge_mix_1',
      stage59: row({ id: 'v1-4567', score: 59 }),
      stage62: row({
        id: 'v1-4567',
        score: 52,
        cats: { heading_structure: 45, alt_text: 20, table_markup: 0, reading_order: 45 },
        tools: [{ toolName: 'set_figure_alt_text', outcome: 'rejected' }],
      }),
    });
    expect(report.class).toBe('mixed_no_safe_target');
    expect(report.stableForFixer).toBe(true);
  });

  it('fails closed on missing artifacts', () => {
    const report = classifyStage63Residual({
      id: 'v1-missing',
      corpus: 'edge_mix_1',
      stage62: row({ score: 90 }),
    });
    expect(report.class).toBe('inconclusive_missing_artifact');
    expect(report.stableForFixer).toBe(false);
  });

  it('selects a single Stage 64 direction from controlled rows', () => {
    const fig1 = classifyStage63Residual({
      id: 'v1-a',
      corpus: 'edge_mix_1',
      stage59: row({ id: 'v1-a', score: 78 }),
      stage62: row({ id: 'v1-a', score: 75, tools: [{ toolName: 'set_figure_alt_text' }] }),
    });
    const fig2 = classifyStage63Residual({
      id: 'v1-b',
      corpus: 'edge_mix_1',
      stage59: row({ id: 'v1-b', score: 78 }),
      stage62: row({ id: 'v1-b', score: 75, tools: [{ toolName: 'retag_as_figure' }] }),
    });
    expect(buildStage63Report([pair], [fig1, fig2], 'now').selectedStage64Direction).toBe('Figure/Alt Recovery v5');

    const table = classifyStage63Residual({
      id: 'v1-c',
      corpus: 'edge_mix_2',
      stage59: row({ id: 'v1-c', score: 69, cats: { table_markup: 0 } }),
      stage62: row({ id: 'v1-c', score: 69, cats: { table_markup: 16 }, tools: [{ toolName: 'normalize_table_structure' }] }),
    });
    expect(buildStage63Report([pair], [table], 'now').selectedStage64Direction).toBe('Table Tail Follow-up v3');

    const manual1 = classifyStage63Residual({
      id: 'v1-3479',
      corpus: 'edge_mix_2',
      stage59: row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
      stage62: row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
    });
    const manual2 = classifyStage63Residual({
      id: 'v1-3507',
      corpus: 'edge_mix_2',
      stage59: row({ id: 'v1-3507', score: 52, localFile: 'manual_scanned/3507.pdf' }),
      stage62: row({ id: 'v1-3507', score: 52, localFile: 'manual_scanned/3507.pdf' }),
    });
    expect(buildStage63Report([pair], [manual1, manual2], 'now').selectedStage64Direction).toBe('Manual/Scanned Debt Diagnostic');
  });
});

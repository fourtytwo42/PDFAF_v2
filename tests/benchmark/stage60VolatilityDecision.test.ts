import { describe, expect, it } from 'vitest';
import {
  buildStage60Report,
  buildStage60RowReport,
  type Stage60RunInput,
  type Stage60VarianceEvidence,
} from '../../scripts/stage60-volatility-decision.js';

const stage57: Stage60RunInput = { label: 'edge2-stage57', corpus: 'edge_mix_2', stage: 'stage57', runDir: 'stage57' };
const stage59: Stage60RunInput = { label: 'edge2-stage59', corpus: 'edge_mix_2', stage: 'stage59', runDir: 'stage59' };

function row(input: {
  id?: string;
  score: number;
  grade?: string;
  localFile?: string;
  alt?: number;
  tools?: unknown[];
}): Record<string, unknown> {
  return {
    id: `v1-${input.id ?? '4758'}`,
    publicationId: input.id ?? '4758',
    localFile: input.localFile ?? 'figure_alt/test.pdf',
    afterScore: input.score,
    afterGrade: input.grade ?? 'B',
    afterCategories: [
      { key: 'alt_text', score: input.alt ?? 20 },
      { key: 'heading_structure', score: 100 },
    ],
    appliedTools: input.tools ?? [],
  };
}

function variance(input: Partial<Stage60VarianceEvidence> = {}): Stage60VarianceEvidence {
  return {
    source: input.source ?? 'stage58.json',
    classification: input.classification ?? 'python_structure_variance',
    scoreDelta: input.scoreDelta ?? 17,
    detail: input.detail ?? 'python structural variance',
  };
}

describe('Stage 60 volatility decision', () => {
  it('marks stable Stage59 figure-alt gains as safe for next fixer work', () => {
    const report = buildStage60RowReport({
      id: '4758',
      corpus: 'edge_mix_2',
      runRows: [
        { run: stage57, row: row({ score: 80, alt: 16 }) },
        {
          run: stage59,
          row: row({
            score: 81,
            alt: 20,
            tools: [{ toolName: 'set_figure_alt_text', outcome: 'applied', scoreBefore: 80, scoreAfter: 81 }],
          }),
        },
      ],
    });

    expect(report.decision).toBe('safe_for_next_fixer');
    expect(report.stage59FigureToolsInvolved).toBe(false);
  });

  it('parks documented analyzer variance when Stage59 is not the cause', () => {
    const report = buildStage60RowReport({
      id: '4171',
      corpus: 'edge_mix_2',
      runRows: [
        { run: stage57, row: row({ id: '4171', score: 69, localFile: 'long_mixed/4171.pdf' }) },
        { run: stage59, row: row({ id: '4171', score: 56, localFile: 'long_mixed/4171.pdf' }) },
      ],
      varianceEvidence: [variance({ classification: 'non_canonicalizable_variance', scoreDelta: 5 })],
    });

    expect(report.decision).toBe('parked_analyzer_debt');
    expect(report.reason).toMatch(/Python structural/);
  });

  it('flags Stage59-specific figure regressions when the worst row applied figure-alt tools', () => {
    const report = buildStage60RowReport({
      id: '4699',
      corpus: 'edge_mix_2',
      runRows: [
        { run: stage57, row: row({ id: '4699', score: 83, alt: 20 }) },
        {
          run: stage59,
          row: row({
            id: '4699',
            score: 78,
            alt: 16,
            tools: [{ toolName: 'set_figure_alt_text', outcome: 'applied', scoreBefore: 83, scoreAfter: 78 }],
          }),
        },
      ],
      varianceEvidence: [variance()],
    });

    expect(report.decision).toBe('stage59_specific_regression');
    expect(report.stage59FigureToolsInvolved).toBe(true);
  });

  it('parks manual/scanned rows outside deterministic structural fixer scope', () => {
    const report = buildStage60RowReport({
      id: '3479',
      corpus: 'edge_mix_2',
      runRows: [
        { run: stage57, row: row({ id: '3479', score: 52, localFile: 'manual_scanned/3479.pdf' }) },
        { run: stage59, row: row({ id: '3479', score: 52, localFile: 'manual_scanned/3479.pdf' }) },
      ],
    });

    expect(report.decision).toBe('parked_manual_scanned_debt');
  });

  it('fails closed when artifacts for a requested row are missing', () => {
    const report = buildStage60RowReport({
      id: '9999',
      corpus: 'edge_mix_2',
      runRows: [
        { run: stage57 },
        { run: stage59 },
      ],
    });

    expect(report.decision).toBe('inconclusive_missing_artifact');
  });

  it('continues when only analyzer debt is parked but blocks on Stage59 regressions', () => {
    const safe = buildStage60RowReport({
      id: '4758',
      corpus: 'edge_mix_2',
      runRows: [{ run: stage57, row: row({ score: 80 }) }, { run: stage59, row: row({ score: 81 }) }],
    });
    const analyzer = buildStage60RowReport({
      id: '4171',
      corpus: 'edge_mix_2',
      runRows: [{ run: stage57, row: row({ id: '4171', score: 69 }) }, { run: stage59, row: row({ id: '4171', score: 56 }) }],
      varianceEvidence: [variance()],
    });
    expect(buildStage60Report({ runs: [stage57, stage59], rows: [safe, analyzer], generatedAt: '2026-04-24T00:00:00.000Z' }).decision.status)
      .toBe('park_analyzer_volatility_and_continue');

    const stage59Regression = buildStage60RowReport({
      id: '4699',
      corpus: 'edge_mix_2',
      runRows: [
        { run: stage57, row: row({ id: '4699', score: 83 }) },
        { run: stage59, row: row({ id: '4699', score: 78, tools: [{ toolName: 'set_figure_alt_text', outcome: 'applied' }] }) },
      ],
    });
    expect(buildStage60Report({ runs: [stage57, stage59], rows: [safe, stage59Regression], generatedAt: '2026-04-24T00:00:00.000Z' }).decision.status)
      .toBe('block_new_fixers_until_analyzer_design');
  });
});

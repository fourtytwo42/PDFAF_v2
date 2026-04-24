import { describe, expect, it } from 'vitest';
import {
  buildStage67Report,
  buildStage67RowReport,
  selectStage68Direction,
  type Stage67RowReport,
} from '../../scripts/stage67-stable-residual-selection.js';

function range(min: number, max = min) {
  return { min, max, delta: max - min };
}

function stage65Row(input: {
  id: string;
  klass?: string;
  family?: string;
  scoreRange?: { min: number; max: number; delta: number };
  catRanges?: Record<string, { min: number; max: number; delta: number }>;
  gain?: boolean;
}): Record<string, unknown> {
  return {
    id: input.id,
    corpus: input.id === 'v1-4722' ? 'edge_mix_2' : 'edge_mix_1',
    file: `${input.id}.pdf`,
    class: input.klass ?? 'stable_structural_residual',
    residualFamily: input.family ?? 'table',
    scoreRange: input.scoreRange ?? range(69),
    categoryRanges: input.catRanges ?? { table_markup: range(16), alt_text: range(100), heading_structure: range(95), reading_order: range(96) },
    stage64Gain: { required: input.gain === true, repeated: input.gain === true },
  };
}

function stage66Row(id: string, decision: string): Record<string, unknown> {
  return { id, decision };
}

function toolRow(tools: Array<{ toolName: string; outcome: string }>): Record<string, unknown> {
  return { id: 'v1-test', afterCategories: [], appliedTools: tools };
}

function rowReport(input: Partial<Stage67RowReport> & { id: string; klass: Stage67RowReport['class'] }): Stage67RowReport {
  return {
    id: input.id,
    corpus: input.corpus ?? 'edge_mix_1',
    file: '',
    stage65Class: '',
    stage65Family: '',
    stage66Decision: null,
    class: input.klass,
    scoreRange: input.scoreRange ?? range(90),
    categoryRanges: input.categoryRanges ?? {},
    repeatedLowCategories: input.repeatedLowCategories ?? [],
    toolEvidence: input.toolEvidence ?? [],
    plausibleNextFixer: input.plausibleNextFixer ?? false,
    nextFixerReason: input.nextFixerReason ?? '',
    stage64GainPreserved: input.stage64GainPreserved ?? null,
    reasons: input.reasons ?? [],
  };
}

describe('Stage 67 stable residual selection', () => {
  it('excludes Stage66 analyzer-volatility rows from fixer selection', () => {
    const report = buildStage67RowReport({
      stage65Row: stage65Row({
        id: 'v1-4122',
        klass: 'parked_analyzer_volatility',
        family: 'none',
        scoreRange: range(95, 99),
        catRanges: { alt_text: range(100) },
      }),
      stage66ById: new Map([['v1-4122', stage66Row('v1-4122', 'non_canonicalizable_analyzer_debt')]]),
      runRows: [toolRow([{ toolName: 'set_figure_alt_text', outcome: 'applied' }])],
    });
    expect(report.class).toBe('excluded_analyzer_volatility');
    expect(report.plausibleNextFixer).toBe(false);
  });

  it('excludes manual/scanned rows from deterministic structural selection', () => {
    const report = buildStage67RowReport({
      stage65Row: stage65Row({
        id: 'v1-3479',
        klass: 'manual_scanned_debt',
        family: 'manual_scanned',
        scoreRange: range(52),
        catRanges: { heading_structure: range(0), reading_order: range(35) },
      }),
      stage66ById: new Map([['v1-3479', stage66Row('v1-3479', 'policy_debt')]]),
      runRows: [],
    });
    expect(report.class).toBe('excluded_manual_scanned');
    expect(report.plausibleNextFixer).toBe(false);
  });

  it('selects table follow-up when v1-4722 is the only stable below-C structural residual', () => {
    const table = buildStage67RowReport({
      stage65Row: stage65Row({ id: 'v1-4722' }),
      stage66ById: new Map(),
      runRows: [toolRow([{ toolName: 'normalize_table_structure', outcome: 'no_effect' }])],
    });
    const high = buildStage67RowReport({
      stage65Row: stage65Row({
        id: 'v1-3921',
        klass: 'stable_structural_residual',
        family: 'figure_alt',
        scoreRange: range(91),
        catRanges: { alt_text: range(60), heading_structure: range(95), table_markup: range(100), reading_order: range(96) },
        gain: true,
      }),
      stage66ById: new Map(),
      runRows: [toolRow([{ toolName: 'set_figure_alt_text', outcome: 'applied' }])],
    });
    expect(table.class).toBe('stable_table_residual');
    expect(table.plausibleNextFixer).toBe(true);
    expect(selectStage68Direction([table, high]).selectedStage68Direction).toBe('Table Tail Follow-up v3');
  });

  it('selects figure/alt only when at least two stable below-A rows meet repeated evidence threshold', () => {
    const figureA = rowReport({
      id: 'v1-a',
      klass: 'stable_figure_alt_residual',
      scoreRange: range(84),
      categoryRanges: { alt_text: range(20) },
      plausibleNextFixer: true,
      toolEvidence: [{ toolName: 'set_figure_alt_text', outcomes: { applied: 1 }, terminalOutcomes: {} }],
    });
    const figureB = rowReport({
      id: 'v1-b',
      klass: 'stable_figure_alt_residual',
      scoreRange: range(86),
      categoryRanges: { alt_text: range(50) },
      plausibleNextFixer: true,
      toolEvidence: [{ toolName: 'canonicalize_figure_alt_ownership', outcomes: { no_effect: 1 }, terminalOutcomes: { no_effect: 1 } }],
    });
    expect(selectStage68Direction([figureA, figureB]).selectedStage68Direction).toBe('Figure/Alt Polish');

    const onlyOne = selectStage68Direction([figureA]);
    expect(onlyOne.selectedStage68Direction).not.toBe('Figure/Alt Polish');
  });

  it('fails closed when Stage65 repeat artifacts are missing', () => {
    const missing = buildStage67RowReport({
      stage65Row: stage65Row({ id: 'v1-4215', klass: 'inconclusive_repeat_missing', family: 'none', scoreRange: range(94) }),
      stage66ById: new Map(),
      runRows: [],
    });
    expect(missing.class).toBe('inconclusive_missing_artifact');
    expect(selectStage68Direction([missing]).selectedStage68Direction).toBe('No Fixer - Resolve Evidence Gap');
  });

  it('preserves Stage64 gain rows and assigns every row to one bucket', () => {
    const report = buildStage67Report({
      stage65: {
        runs: [],
        rows: [
          stage65Row({
            id: 'v1-3921',
            klass: 'stable_structural_residual',
            family: 'figure_alt',
            scoreRange: range(91),
            catRanges: { alt_text: range(60), heading_structure: range(95), table_markup: range(100), reading_order: range(96) },
            gain: true,
          }),
          stage65Row({ id: 'v1-3479', klass: 'manual_scanned_debt', family: 'manual_scanned', scoreRange: range(52), catRanges: { heading_structure: range(0) } }),
        ],
      },
      stage66: { rows: [stage66Row('v1-3479', 'policy_debt')] },
      generatedAt: 'now',
    });
    expect(report.rows).toHaveLength(2);
    expect(report.preservedStage64Gains).toEqual(['v1-3921']);
    expect(Object.values(report.classDistribution).reduce((sum, count) => sum + count, 0)).toBe(2);
  });
});

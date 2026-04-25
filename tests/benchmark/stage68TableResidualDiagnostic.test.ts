import { describe, expect, it } from 'vitest';
import {
  buildStage68Report,
  type Stage68RunInput,
} from '../../scripts/stage68-table-residual-diagnostic.js';

const runs: Stage68RunInput[] = [
  { label: 'stage62', corpus: 'edge_mix_2', phase: 'stage62', runDir: 's62' },
  { label: 'repeat', corpus: 'edge_mix_2', phase: 'repeat', runDir: 'r1' },
];

function category(key: string, score: number): Record<string, unknown> {
  return { key, score, applicable: true };
}

function tool(input: {
  name?: string;
  outcome?: string;
  strongBefore?: number;
  strongAfter?: number;
  irregularBefore?: number;
  irregularAfter?: number;
  maxTables?: number;
  benefits?: boolean;
}): Record<string, unknown> {
  return {
    toolName: input.name ?? 'normalize_table_structure',
    outcome: input.outcome ?? 'applied',
    stage: 4,
    round: 1,
    scoreBefore: 69,
    scoreAfter: 69,
    details: JSON.stringify({
      invariants: {
        stronglyIrregularTableCountBefore: input.strongBefore ?? 7,
        stronglyIrregularTableCountAfter: input.strongAfter ?? 5,
        irregularRowsBefore: input.irregularBefore ?? 66,
        irregularRowsAfter: input.irregularAfter ?? 38,
        headerCellCountBefore: 216,
        headerCellCountAfter: 216,
        tableTreeValidAfter: true,
      },
      structuralBenefits: input.benefits === false ? undefined : { tableValidityImproved: true },
      debug: {
        maxTablesPerRun: input.maxTables ?? 2,
        replayState: {
          categoryScoresBefore: { table_markup: 16 },
          categoryScoresAfter: { table_markup: 16 },
        },
      },
    }),
  };
}

function row(input: {
  id: string;
  score?: number;
  table?: number;
  strong?: number;
  irregular?: number;
  tools?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    id: input.id,
    publicationId: input.id.replace(/^v1-/, ''),
    afterScore: input.score ?? 69,
    afterGrade: (input.score ?? 69) >= 90 ? 'A' : (input.score ?? 69) >= 80 ? 'B' : (input.score ?? 69) >= 70 ? 'C' : 'D',
    afterCategories: [
      category('table_markup', input.table ?? 16),
      category('heading_structure', 95),
      category('alt_text', 100),
      category('reading_order', 96),
    ],
    afterDetectionProfile: {
      tableSignals: {
        stronglyIrregularTableCount: input.strong ?? 5,
        irregularTableCount: input.irregular ?? 5,
        directCellUnderTableCount: 0,
        misplacedCellCount: 0,
      },
    },
    appliedTools: input.tools ?? [],
  };
}

function stage67(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    inputs: { runs },
    rows,
  };
}

function stage67Row(id: string, klass: string, decision: string | null = null): Record<string, unknown> {
  return { id, class: klass, stage66Decision: decision };
}

describe('Stage 68 table residual diagnostic', () => {
  it('classifies post-normalization table debt separately from pre-normalization irregular debt', () => {
    const report = buildStage68Report({
      stage67: stage67([stage67Row('v1-other', 'stable_table_residual')]),
      runRowsByLabel: new Map([
        ['stage62', new Map([['v1-other', row({ id: 'v1-other', tools: [tool({})] })]])],
        ['repeat', new Map([['v1-other', row({ id: 'v1-other', tools: [tool({})] })]])],
      ]),
      generatedAt: 'now',
    });
    const other = report.rows.find(item => item.id === 'v1-other');
    expect(other?.class).toBe('post_normalization_table_residual');
    expect(report.decision.status).toBe('diagnostic_only_no_safe_table_fix');
  });

  it('marks v1-4722 as implementable only when repeated normalization improvements leave strong table debt', () => {
    const report = buildStage68Report({
      stage67: stage67([stage67Row('v1-4722', 'stable_table_residual')]),
      runRowsByLabel: new Map([
        ['stage62', new Map([['v1-4722', row({ id: 'v1-4722', tools: [tool({ strongBefore: 9, strongAfter: 7 })] })]])],
        ['repeat', new Map([['v1-4722', row({ id: 'v1-4722', tools: [tool({ strongBefore: 7, strongAfter: 5 })] })]])],
      ]),
      generatedAt: 'now',
    });
    const target = report.rows.find(item => item.id === 'v1-4722');
    expect(target?.class).toBe('bounded_multi_table_candidate');
    expect(target?.plausibleInvariantPath).toBe(true);
    expect(report.decision.status).toBe('implement_bounded_multi_table_normalization');
  });

  it('reports terminal table no-effect outcomes without treating them as success', () => {
    const report = buildStage68Report({
      stage67: stage67([stage67Row('v1-4722', 'stable_table_residual')]),
      runRowsByLabel: new Map([
        ['stage62', new Map([['v1-4722', row({ id: 'v1-4722', tools: [tool({ name: 'set_table_header_cells', outcome: 'no_effect', benefits: false })] })]])],
        ['repeat', new Map([['v1-4722', row({ id: 'v1-4722', tools: [tool({ name: 'repair_native_table_headers', outcome: 'no_effect', benefits: false })] })]])],
      ]),
      generatedAt: 'now',
    });
    const target = report.rows.find(item => item.id === 'v1-4722');
    expect(target?.terminalNoEffectCount).toBe(2);
    expect(target?.normalizeImprovementCount).toBe(0);
    expect(target?.class).toBe('no_safe_table_path');
  });

  it('excludes analyzer and manual policy rows from fixer targets', () => {
    const report = buildStage68Report({
      stage67: stage67([
        stage67Row('v1-4122', 'excluded_analyzer_volatility', 'non_canonicalizable_analyzer_debt'),
        stage67Row('v1-3479', 'excluded_manual_scanned', 'policy_debt'),
      ]),
      runRowsByLabel: new Map([
        ['stage62', new Map([
          ['v1-4122', row({ id: 'v1-4122', tools: [tool({})] })],
          ['v1-3479', row({ id: 'v1-3479', tools: [tool({})] })],
        ])],
        ['repeat', new Map([
          ['v1-4122', row({ id: 'v1-4122', tools: [tool({})] })],
          ['v1-3479', row({ id: 'v1-3479', tools: [tool({})] })],
        ])],
      ]),
      generatedAt: 'now',
    });
    expect(report.rows.find(item => item.id === 'v1-4122')?.class).toBe('excluded_analyzer_volatility');
    expect(report.rows.find(item => item.id === 'v1-3479')?.class).toBe('excluded_manual_scanned');
  });
});

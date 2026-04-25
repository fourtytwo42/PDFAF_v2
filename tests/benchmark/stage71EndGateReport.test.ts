import { describe, expect, it } from 'vitest';
import {
  bucketRow,
  buildStage71Report,
  summarizeRows,
  type BenchmarkRow,
} from '../../scripts/stage71-end-gate-report.js';

function row(input: {
  id: string;
  score: number;
  grade?: string;
  categories?: Record<string, number>;
  falsePositiveAppliedCount?: number;
  tools?: string[];
  wall?: number;
}): BenchmarkRow {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
    afterGrade: input.grade ?? (input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : input.score >= 70 ? 'C' : input.score >= 60 ? 'D' : 'F'),
    afterCategories: Object.entries(input.categories ?? {}).map(([key, score]) => ({ key, score })),
    falsePositiveAppliedCount: input.falsePositiveAppliedCount ?? 0,
    wallRemediateMs: input.wall ?? 1000,
    appliedTools: (input.tools ?? []).map(toolName => ({ toolName, outcome: 'applied' })),
  };
}

function gate(input: { passed: boolean; failed?: string[]; protectedRegressions?: number; fpRows?: string[] }) {
  return {
    passed: input.passed,
    gates: [
      {
        key: 'protected_file_regressions',
        passed: !input.failed?.includes('protected_file_regressions'),
        candidateValue: input.protectedRegressions ?? 0,
      },
      ...(input.failed ?? []).filter(key => key !== 'protected_file_regressions').map(key => ({ key, passed: false })),
    ],
    falsePositiveAppliedRows: (input.fpRows ?? []).map(id => ({ id })),
  };
}

function report(overrides: Partial<Parameters<typeof buildStage71Report>[0]> = {}) {
  const legacyRows = [
    row({ id: 'legacy-a', score: 96, grade: 'A', tools: ['set_document_title'] }),
    row({ id: 'legacy-b', score: 96, grade: 'A' }),
    row({ id: 'structure-4207', score: 59, grade: 'F', categories: { heading_structure: 0 } }),
  ];
  const edgeMix1Rows = [
    row({ id: 'v1-3921', score: 91, grade: 'A' }),
    row({ id: 'v1-4139', score: 69, grade: 'D', categories: { reading_order: 35 } }),
  ];
  const edgeMix2Rows = [
    row({ id: 'v1-4758', score: 90, grade: 'A' }),
    row({ id: 'v1-3479', score: 52, grade: 'F', categories: { heading_structure: 0 } }),
  ];
  return buildStage71Report({
    legacyRunDir: 'legacy',
    edgeMix1RunDir: 'edge1',
    edgeMix2RunDir: 'edge2',
    stage69ReconciliationPath: 'stage69.json',
    stage70ReconciliationPath: 'stage70.json',
    stage69GatePath: 'stage69-gate.json',
    stage70GatePath: 'stage70-gate.json',
    legacyRows,
    edgeMix1Rows,
    edgeMix2Rows,
    stage69Reconciliation: { rows: [{ id: 'fixture-teams-targeted-wave1', classification: 'known_protected_parity_debt' }] },
    stage70Reconciliation: { decision: { status: 'inconclusive' } },
    stage69Gate: gate({ passed: false, failed: ['runtime_p95_wall'] }),
    stage70Gate: gate({ passed: false, failed: ['runtime_p95_wall', 'protected_file_regressions'], protectedRegressions: 1 }),
    generatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  });
}

describe('Stage 71 end-gate report', () => {
  it('aggregates grade distributions and A/B percentage across multiple corpora', () => {
    const summary = summarizeRows('combined', 'combined', [
      row({ id: 'a', score: 100, grade: 'A' }),
      row({ id: 'b', score: 85, grade: 'B' }),
      row({ id: 'c', score: 72, grade: 'C' }),
      row({ id: 'd', score: 50, grade: 'F' }),
    ]);
    expect(summary.gradeDistribution).toMatchObject({ A: 1, B: 1, C: 1, F: 1 });
    expect(summary.abCount).toBe(2);
    expect(summary.abPercent).toBe(50);
    expect(summary.mean).toBe(76.75);
  });

  it('counts false-positive applied rows as a hard blocker', () => {
    const candidate = report({
      edgeMix1Rows: [
        row({ id: 'v1-3921', score: 91, grade: 'A', falsePositiveAppliedCount: 1 }),
        row({ id: 'v1-4145', score: 91, grade: 'A' }),
      ],
      edgeMix2Rows: [
        row({ id: 'v1-4758', score: 91, grade: 'A' }),
        row({ id: 'v1-4699', score: 91, grade: 'A' }),
      ],
    });
    expect(candidate.acceptanceChecks.false_positive_applied_zero?.passed).toBe(false);
    expect(candidate.decision.status).toBe('defer_acceptance_for_p95_project');
  });

  it('assigns analyzer-volatility, manual/scanned, protected/runtime, and stable buckets deterministically', () => {
    expect(bucketRow({
      id: 'v1-4139',
      corpus: 'edge_mix_1',
      row: row({ id: 'v1-4139', score: 69, grade: 'D' }),
    }).bucket).toBe('parked_analyzer_volatility');
    expect(bucketRow({
      id: 'v1-3507',
      corpus: 'edge_mix_2',
      row: row({ id: 'v1-3507', score: 52, grade: 'F' }),
    }).bucket).toBe('manual_scanned_policy_debt');
    expect(bucketRow({
      id: 'fixture-teams-targeted-wave1',
      corpus: 'legacy_50',
      row: row({ id: 'fixture-teams-targeted-wave1', score: 69, grade: 'D' }),
      stage69Class: 'known_protected_parity_debt',
    }).bucket).toBe('protected_runtime_or_parity_debt');
    expect(bucketRow({
      id: 'structure-4207',
      corpus: 'legacy_50',
      row: row({ id: 'structure-4207', score: 59, grade: 'F' }),
    }).bucket).toBe('stable_structural_residual');
  });

  it('fails closed when required run artifacts are missing', () => {
    const candidate = report({ legacyRows: [] });
    expect(candidate.acceptanceChecks.corpora_represented?.passed).toBe(false);
    expect(candidate.decision.status).toBe('defer_acceptance_for_p95_project');
  });

  it('keeps the rejected Stage 70 guard separate from accepted Stage 69 reference', () => {
    const candidate = report({
      legacyRows: [
        row({ id: 'legacy-a', score: 96, grade: 'A' }),
        row({ id: 'legacy-b', score: 96, grade: 'A' }),
        row({ id: 'legacy-c', score: 96, grade: 'A' }),
      ],
      edgeMix1Rows: [
        row({ id: 'v1-3921', score: 91, grade: 'A' }),
        row({ id: 'v1-4145', score: 91, grade: 'A' }),
      ],
      edgeMix2Rows: [
        row({ id: 'v1-4758', score: 91, grade: 'A' }),
        row({ id: 'v1-4699', score: 91, grade: 'A' }),
      ],
      stage70Gate: gate({ passed: false, failed: ['runtime_p95_wall', 'protected_file_regressions'], protectedRegressions: 1 }),
      stage70Reconciliation: { decision: { status: 'inconclusive' } },
    });
    expect(candidate.stage70RejectedGuard.documented).toBe(true);
    expect(candidate.acceptanceChecks.stage70_rejected_guard_documented?.passed).toBe(true);
    expect(candidate.summaries.legacy.mean).toBe(96);
  });
});

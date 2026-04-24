import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildStage51Report,
  classifySensitiveRow,
  loadEdgeMixSummaryForStage51,
  summarizeRetagInvolvement,
  summarizeSensitiveRow,
  type Stage51SensitiveRowReport,
} from '../../scripts/stage51-stage50-acceptance-isolation.js';

function row(input: {
  id: string;
  score: number;
  grade?: string;
  categories?: Record<string, number>;
  tools?: Array<{ toolName: string; outcome: string; note?: string; stage?: number; round?: number; scoreBefore?: number; scoreAfter?: number }>;
}) {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
    afterGrade: input.grade ?? 'B',
    afterCategories: Object.entries(input.categories ?? {}).map(([key, score]) => ({ key, score })),
    appliedTools: (input.tools ?? []).map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      stage: tool.stage ?? 1,
      round: tool.round ?? 1,
      scoreBefore: tool.scoreBefore ?? input.score,
      scoreAfter: tool.scoreAfter ?? input.score,
      details: tool.note ? JSON.stringify({ note: tool.note }) : undefined,
    })),
    wallRemediateMs: 1000,
  };
}

function reportFor(reports: Stage51SensitiveRowReport[]) {
  return buildStage51Report({
    baselineRunDir: 'baseline',
    sensitiveRunDir: 'candidate',
    edgeMixRunDir: 'edge',
    baselineRows: new Map(reports.map(report => [report.rowId, row({ id: report.rowId, score: report.baselineScore ?? 0 })])),
    sensitiveRows: new Map(reports.map(report => [report.rowId, row({ id: report.rowId, score: report.candidateScore ?? 0 })])),
    edgeMixSummary: {
      meanAfter: 82.75,
      medianAfter: 87,
      gradeDistributionAfter: { A: 5, B: 3, C: 1, D: 0, F: 3 },
      totalToolAttempts: 215,
      falsePositiveAppliedCount: 0,
    },
    ids: reports.map(report => report.rowId),
    generatedAt: '2026-04-24T00:00:00.000Z',
  });
}

describe('Stage 51 Stage 50 acceptance isolation', () => {
  it('detects retag_as_figure involvement and notes', () => {
    const retag = summarizeRetagInvolvement([
      { toolName: 'set_document_title', outcome: 'applied' },
      { toolName: 'retag_as_figure', outcome: 'applied', details: JSON.stringify({ note: 'rolemap_figure_retagged' }) },
      { toolName: 'retag_as_figure', outcome: 'no_effect', details: JSON.stringify({ note: 'rolemap_not_figure' }) },
    ]);
    expect(retag).toEqual({
      scheduled: true,
      applied: 1,
      rejected: 0,
      noEffect: 1,
      failed: 0,
      firstIndex: 1,
      notes: ['rolemap_figure_retagged', 'rolemap_not_figure'],
    });
  });

  it('classifies a first-divergence retag regression as Stage50-specific', () => {
    const baseline = row({
      id: 'doc',
      score: 90,
      tools: [{ toolName: 'set_document_title', outcome: 'applied' }],
    });
    const candidate = row({
      id: 'doc',
      score: 80,
      tools: [
        { toolName: 'set_document_title', outcome: 'applied' },
        { toolName: 'retag_as_figure', outcome: 'applied', note: 'rolemap_figure_retagged' },
      ],
    });
    const summary = summarizeSensitiveRow('doc', baseline, candidate);
    expect(summary.classification).toBe('stage50_specific_regression');
    expect(summary.decisionReason).toBe('retag_as_figure_present_at_first_divergence');
  });

  it('classifies protected known-row regression without retag as legacy volatility', () => {
    const summary = summarizeSensitiveRow(
      'structure-4076',
      row({ id: 'structure-4076', score: 69, categories: { heading_structure: 100 } }),
      row({ id: 'structure-4076', score: 59, categories: { heading_structure: 0 } }),
    );
    expect(summary.retagAsFigure.scheduled).toBe(false);
    expect(summary.classification).toBe('legacy_protected_volatility');
  });

  it('does not classify a stable row as a regression even when retag was scheduled', () => {
    const summary = summarizeSensitiveRow(
      'doc',
      row({ id: 'doc', score: 80 }),
      row({ id: 'doc', score: 79, tools: [{ toolName: 'retag_as_figure', outcome: 'no_effect', note: 'rolemap_not_figure' }] }),
    );
    expect(summary.classification).toBe('stable_or_improved');
  });

  it('handles missing rows deterministically', () => {
    const result = classifySensitiveRow({
      rowId: 'missing',
      scoreDelta: null,
      retag: summarizeRetagInvolvement([]),
      accepted: null,
      rejected: null,
    });
    expect(result).toEqual({
      classification: 'missing_baseline_or_candidate',
      reason: 'baseline_or_candidate_row_missing',
    });
  });

  it('chooses provisional acceptance when no Stage50-specific regression exists', () => {
    const built = buildStage51Report({
      baselineRunDir: 'baseline',
      sensitiveRunDir: 'candidate',
      edgeMixRunDir: 'edge',
      baselineRows: new Map([
        ['structure-4076', row({ id: 'structure-4076', score: 69 })],
        ['long-4680', row({ id: 'long-4680', score: 78 })],
      ]),
      sensitiveRows: new Map([
        ['structure-4076', row({ id: 'structure-4076', score: 59 })],
        ['long-4680', row({ id: 'long-4680', score: 92 })],
      ]),
      edgeMixSummary: null,
      ids: ['structure-4076', 'long-4680'],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });
    expect(built.decision.status).toBe('edge_mix_accepted_full_corpus_provisional');
    expect(built.sensitiveRows.map(row => row.classification)).toEqual([
      'legacy_protected_volatility',
      'stable_or_improved',
    ]);
  });

  it('requires a Stage50 fix when retag causes a regression', () => {
    const baseline = row({ id: 'doc', score: 90 });
    const candidate = row({
      id: 'doc',
      score: 70,
      tools: [{ toolName: 'retag_as_figure', outcome: 'applied', note: 'rolemap_figure_retagged' }],
    });
    const built = buildStage51Report({
      baselineRunDir: 'baseline',
      sensitiveRunDir: 'candidate',
      edgeMixRunDir: 'edge',
      baselineRows: new Map([['doc', baseline]]),
      sensitiveRows: new Map([['doc', candidate]]),
      edgeMixSummary: null,
      ids: ['doc'],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });
    expect(built.decision.status).toBe('stage50_specific_fix_required');
  });

  it('can build a report object from prebuilt row summaries', () => {
    const built = reportFor([
      {
        rowId: 'doc',
        file: 'doc.pdf',
        baselineScore: 80,
        baselineGrade: 'B',
        candidateScore: 82,
        candidateGrade: 'B',
        scoreDelta: 2,
        categoryDeltas: [],
        firstDivergentAcceptedTool: null,
        firstDivergentRejectedTool: null,
        retagAsFigure: summarizeRetagInvolvement([]),
        classification: 'stable_or_improved',
        decisionReason: 'score_within_two_points_or_improved',
      },
    ]);
    expect(built.edgeMixSummary?.meanAfter).toBe(82.75);
  });

  it('loads nested Stage 49/50 edge-mix summary files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage51-'));
    await writeFile(join(dir, 'summary.json'), JSON.stringify({
      summary: {
        meanAfter: 82.75,
        medianAfter: 87,
        gradeDistributionAfter: { A: 5, B: 3, C: 1, D: 0, F: 3 },
        totalToolAttempts: 215,
        falsePositiveAppliedCount: 0,
      },
    }));
    await expect(loadEdgeMixSummaryForStage51(dir)).resolves.toMatchObject({
      meanAfter: 82.75,
      medianAfter: 87,
      totalToolAttempts: 215,
      falsePositiveAppliedCount: 0,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { selectHoldoutRows, type HoldoutCandidate } from '../../scripts/stage126-v1-holdout-builder.js';
import {
  buildStage126Report,
  classifyStage126HoldoutRow,
} from '../../scripts/stage126-holdout-generalization-report.js';
import type { EdgeMixBenchmarkRow } from '../../scripts/stage49-edge-mix-baseline.js';

function candidate(input: Partial<HoldoutCandidate> & { id: string; sourcePath?: string }): HoldoutCandidate {
  return {
    publicationId: input.id,
    title: input.title ?? `Title ${input.id}`,
    sourcePath: input.sourcePath ?? '/tmp/sample.pdf',
    sourceManifest: input.sourceManifest ?? 'test.json',
    v1Score: input.v1Score ?? 30,
    v1Grade: input.v1Grade ?? 'F',
    pageCount: input.pageCount ?? 10,
    scanned: input.scanned ?? false,
    manualOnlyFailureModeCount: input.manualOnlyFailureModeCount ?? 0,
    blockerFamilyCount: input.blockerFamilyCount ?? 3,
    blockingFindingCount: input.blockingFindingCount ?? 4,
    families: input.families ?? [],
    findingKeys: input.findingKeys ?? [],
    opportunityKeys: input.opportunityKeys ?? [],
    lowCategories: input.lowCategories ?? {},
    selectionSignals: input.selectionSignals ?? [],
    fileSizeBytes: input.fileSizeBytes ?? 1_000_000,
  };
}

function row(input: Partial<EdgeMixBenchmarkRow> & { id?: string } = {}): EdgeMixBenchmarkRow {
  const id = input.id ?? '1000';
  return {
    id: `v1-${id}`,
    publicationId: id,
    title: input.title ?? `Row ${id}`,
    file: input.file ?? `${id}.pdf`,
    localFile: input.localFile ?? `${id}.pdf`,
    v1Score: input.v1Score ?? 30,
    v1Grade: input.v1Grade ?? 'F',
    pageCount: input.pageCount ?? 10,
    problemMix: input.problemMix ?? [],
    beforeScore: input.beforeScore ?? 30,
    beforeGrade: input.beforeGrade ?? 'F',
    beforeCategories: input.beforeCategories ?? [],
    beforePdfClass: input.beforePdfClass ?? 'native_tagged',
    afterScore: input.afterScore ?? 80,
    afterGrade: input.afterGrade ?? 'B',
    afterCategories: input.afterCategories ?? [],
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    afterDetectionProfile: input.afterDetectionProfile ?? {},
    delta: input.delta ?? 50,
    appliedTools: input.appliedTools ?? [],
    falsePositiveAppliedCount: input.falsePositiveAppliedCount ?? 0,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisBeforeMs: input.analysisBeforeMs ?? 100,
    analysisAfterMs: input.analysisAfterMs ?? 100,
    totalPipelineMs: input.totalPipelineMs ?? 1200,
    ...(input.error ? { error: input.error } : {}),
  };
}

describe('Stage 126 holdout selection and reporting', () => {
  it('selects balanced buckets while respecting excluded ids', async () => {
    const sourcePath = new URL('../fixtures/adobe_anchor_thresholds.json', import.meta.url).pathname;
    const candidates = [
      candidate({ id: '1001', sourcePath, families: ['native_figure_convergence'], lowCategories: { alt_text: 0 } }),
      candidate({ id: '1002', sourcePath, families: ['table_structure_recovery'], lowCategories: { table_markup: 40 } }),
      candidate({ id: '1003', sourcePath, families: ['font_embedding_and_unicode'], lowCategories: { text_extractability: 40 } }),
      candidate({ id: '1004', sourcePath, families: ['logical_structure_marked_content'], lowCategories: { heading_structure: 0 } }),
      candidate({ id: '1005', sourcePath, pageCount: 80, families: ['table_structure_recovery', 'native_figure_convergence', 'font_embedding_and_unicode'] }),
      candidate({ id: '1006', sourcePath, scanned: true, manualOnlyFailureModeCount: 1, families: ['unresolved_manual_family'] }),
      candidate({ id: '1007', sourcePath, v1Score: 92, v1Grade: 'A', families: [] }),
      candidate({ id: '1008', sourcePath, families: ['native_figure_convergence'], lowCategories: { alt_text: 0 } }),
    ];

    const rows = await selectHoldoutRows({ candidates, excludedIds: new Set(['1008']), maxRows: 7 });
    expect(rows.map(item => item.candidate.publicationId)).not.toContain('1008');
    expect(rows.map(item => item.bucket)).toEqual(expect.arrayContaining([
      'figure_alt',
      'table_link_annotation',
      'font_text',
      'structure_heading_reading_order',
      'long_mixed',
      'manual_scanned',
      'control',
    ]));
  });

  it('classifies manual/scanned debt before volatility', () => {
    const result = classifyStage126HoldoutRow({
      row: row({ problemMix: ['manual_or_scanned'], afterScore: 50 }),
      repeatRows: [row({ afterScore: 90 })],
    });
    expect(result.classification).toBe('manual_scanned_policy_debt');
  });

  it('classifies analyzer volatility from repeated score range', () => {
    const result = classifyStage126HoldoutRow({
      row: row({ id: '2001', afterScore: 69 }),
      repeatRows: [row({ id: '2001', afterScore: 86 })],
    });
    expect(result.classification).toBe('analyzer_volatility');
    expect(result.repeatStats.range).toBe(17);
  });

  it('keeps stable low-score improvements as fix candidates', () => {
    const result = classifyStage126HoldoutRow({
      row: row({ id: '2002', beforeScore: 28, afterScore: 59, afterGrade: 'F', delta: 31 }),
      repeatRows: [row({ id: '2002', afterScore: 59, afterGrade: 'F' })],
    });
    expect(result.classification).toBe('stable_fix_candidate');
  });

  it('builds pass criteria and next directions from stable rows', () => {
    const baselineRows = [
      row({ id: '1', beforeScore: 40, afterScore: 92, afterGrade: 'A', delta: 52 }),
      row({
        id: '2',
        beforeScore: 76,
        afterScore: 78,
        afterGrade: 'C',
        delta: 2,
        afterCategories: [{ key: 'alt_text', score: 20 }],
        afterDetectionProfile: { headingSignals: { treeHeadingCount: 2 } },
      }),
      row({ id: '3', beforeScore: 95, afterScore: 95, afterGrade: 'A', problemMix: ['holdout_control'] }),
    ];
    const report = buildStage126Report({
      baselineRunDir: 'baseline',
      baselineRows,
      repeatRuns: [{ runDir: 'repeat', rows: [
        row({ id: '1', afterScore: 91, afterGrade: 'A' }),
        row({ id: '2', afterScore: 77, afterGrade: 'C', afterCategories: [{ key: 'alt_text', score: 20 }], afterDetectionProfile: { headingSignals: { treeHeadingCount: 2 } } }),
        row({ id: '3', afterScore: 95, afterGrade: 'A', problemMix: ['holdout_control'] }),
      ] }],
      generatedAt: 'now',
    });

    expect(report.summary.falsePositiveAppliedCount).toBe(0);
    expect(report.summary.repeatability.rate).toBe(1);
    expect(report.rows.map(item => item.classification)).toEqual([
      'stable_engine_gain',
      'stable_fix_candidate',
      'already_good_control',
    ]);
    expect(report.summary.selectedNextDirections[0]).toContain('figure_alt_tail');
  });
});

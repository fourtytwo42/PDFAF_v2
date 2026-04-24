import { describe, expect, it } from 'vitest';
import {
  buildStage65Report,
  buildStage65RowReport,
  summarizeStage65Run,
  type Stage65RunInput,
} from '../../scripts/stage65-repeatability-decision.js';

const stage62: Stage65RunInput = { label: 'edge1-stage62', corpus: 'edge_mix_1', phase: 'stage62', runDir: 's62' };
const stage64: Stage65RunInput = { label: 'edge1-stage64', corpus: 'edge_mix_1', phase: 'stage64', runDir: 's64' };
const repeat1: Stage65RunInput = { label: 'edge1-r1', corpus: 'edge_mix_1', phase: 'repeat', runDir: 'r1' };
const repeat2: Stage65RunInput = { label: 'edge1-r2', corpus: 'edge_mix_1', phase: 'repeat', runDir: 'r2' };
const runs = [stage62, stage64, repeat1, repeat2];

function row(input: {
  id: string;
  score: number;
  grade?: string;
  localFile?: string;
  cats?: Record<string, number>;
  tools?: Array<Record<string, unknown>>;
  fp?: number;
  ms?: number;
}): Record<string, unknown> {
  return {
    id: input.id,
    publicationId: input.id.replace(/^v1-/, ''),
    localFile: input.localFile ?? 'structural/sample.pdf',
    afterScore: input.score,
    afterGrade: input.grade ?? (input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : input.score >= 70 ? 'C' : input.score >= 60 ? 'D' : 'F'),
    afterCategories: Object.entries(input.cats ?? {
      heading_structure: 95,
      alt_text: 100,
      table_markup: 100,
      reading_order: 96,
    }).map(([key, score]) => ({ key, score })),
    appliedTools: input.tools ?? [],
    falsePositiveAppliedCount: input.fp ?? 0,
    totalPipelineMs: input.ms ?? 1000,
  };
}

function reportRow(id: string, rows: Array<Record<string, unknown> | undefined>, corpus: 'edge_mix_1' | 'edge_mix_2' = 'edge_mix_1') {
  return buildStage65RowReport({
    id,
    corpus,
    runRows: runs.map((run, index) => ({ run: { ...run, corpus }, row: rows[index] })),
  });
}

describe('Stage 65 repeatability decision', () => {
  it('detects repeated Stage64 gains instead of one-off gains', () => {
    const repeated = reportRow('v1-3921', [
      row({ id: 'v1-3921', score: 84, cats: { alt_text: 20, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
      row({ id: 'v1-3921', score: 91, cats: { alt_text: 60, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
      row({ id: 'v1-3921', score: 90, cats: { alt_text: 60, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
      row({ id: 'v1-3921', score: 91, cats: { alt_text: 60, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
    ]);
    expect(repeated.stage64Gain).toMatchObject({ required: true, repeated: true });

    const oneOff = reportRow('v1-4145', [
      row({ id: 'v1-4145', score: 59, cats: { alt_text: 0, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
      row({ id: 'v1-4145', score: 78, cats: { alt_text: 20, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
      row({ id: 'v1-4145', score: 59, cats: { alt_text: 0, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
      row({ id: 'v1-4145', score: 59, cats: { alt_text: 0, heading_structure: 95, table_markup: 100, reading_order: 96 } }),
    ]);
    expect(oneOff.stage64Gain).toMatchObject({ required: true, repeated: false });
  });

  it('classifies score swings over two points as volatility unless manual/scanned', () => {
    const volatile = reportRow('v1-4003', [
      row({ id: 'v1-4003', score: 80 }),
      row({ id: 'v1-4003', score: 90 }),
      row({ id: 'v1-4003', score: 86 }),
      row({ id: 'v1-4003', score: 90 }),
    ]);
    expect(volatile.class).toBe('parked_analyzer_volatility');

    const manual = reportRow('v1-3479', [
      row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
      row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
      row({ id: 'v1-3479', score: 58, localFile: 'manual_scanned/3479.pdf' }),
      row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
    ]);
    expect(manual.class).toBe('manual_scanned_debt');
  });

  it('keeps known manual/scanned rows out of structural fixer selection', () => {
    const manual1 = reportRow('v1-3479', [
      row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
      row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
      row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
      row({ id: 'v1-3479', score: 52, localFile: 'manual_scanned/3479.pdf' }),
    ]);
    const manual2 = reportRow('v1-3507', [
      row({ id: 'v1-3507', score: 49, localFile: 'manual_scanned/3507.pdf' }),
      row({ id: 'v1-3507', score: 49, localFile: 'manual_scanned/3507.pdf' }),
      row({ id: 'v1-3507', score: 49, localFile: 'manual_scanned/3507.pdf' }),
      row({ id: 'v1-3507', score: 49, localFile: 'manual_scanned/3507.pdf' }),
    ]);
    const report = buildStage65Report({ runs, runSummaries: [], rows: [manual1, manual2], generatedAt: 'now' });
    expect(report.selectedStage66Direction).toBe('Manual/Scanned Debt Diagnostic');
  });

  it('selects exactly one Stage66 direction from controlled fixtures', () => {
    const table = reportRow('v1-4722', [
      row({ id: 'v1-4722', score: 69, cats: { table_markup: 0, alt_text: 100, heading_structure: 95, reading_order: 96 }, tools: [{ toolName: 'normalize_table_structure' }] }),
      row({ id: 'v1-4722', score: 70, cats: { table_markup: 16, alt_text: 100, heading_structure: 95, reading_order: 96 }, tools: [{ toolName: 'normalize_table_structure' }] }),
      row({ id: 'v1-4722', score: 70, cats: { table_markup: 16, alt_text: 100, heading_structure: 95, reading_order: 96 }, tools: [{ toolName: 'normalize_table_structure' }] }),
      row({ id: 'v1-4722', score: 70, cats: { table_markup: 16, alt_text: 100, heading_structure: 95, reading_order: 96 }, tools: [{ toolName: 'normalize_table_structure' }] }),
    ]);
    expect(table.class).toBe('stable_structural_residual');
    expect(table.residualFamily).toBe('table');
    expect(buildStage65Report({ runs, runSummaries: [], rows: [table], generatedAt: 'now' }).selectedStage66Direction).toBe('Table Tail Follow-up v3');

    const mixed1 = reportRow('v1-a', [
      row({ id: 'v1-a', score: 65, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
      row({ id: 'v1-a', score: 65, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
      row({ id: 'v1-a', score: 65, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
      row({ id: 'v1-a', score: 65, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
    ]);
    const mixed2 = reportRow('v1-b', [
      row({ id: 'v1-b', score: 67, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
      row({ id: 'v1-b', score: 67, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
      row({ id: 'v1-b', score: 67, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
      row({ id: 'v1-b', score: 67, cats: { alt_text: 20, table_markup: 30, heading_structure: 90, reading_order: 90 } }),
    ]);
    expect(buildStage65Report({ runs, runSummaries: [], rows: [mixed1, mixed2], generatedAt: 'now' }).selectedStage66Direction).toBe('Mixed Structural Diagnostic');
  });

  it('fails closed when required repeat artifacts are missing', () => {
    const missing = reportRow('v1-4215', [
      row({ id: 'v1-4215', score: 94 }),
      row({ id: 'v1-4215', score: 94 }),
      undefined,
      row({ id: 'v1-4215', score: 94 }),
    ]);
    expect(missing.class).toBe('inconclusive_repeat_missing');
  });

  it('summarizes run grade distribution, attempts, false positives, and runtime', () => {
    const summary = summarizeStage65Run(repeat1, [
      row({ id: 'v1-a', score: 90, tools: [{ toolName: 'set_document_title' }], fp: 0, ms: 100 }),
      row({ id: 'v1-b', score: 70, tools: [{ toolName: 'set_document_title' }, { toolName: 'set_document_language' }], fp: 1, ms: 200 }),
    ]);
    expect(summary.mean).toBe(80);
    expect(summary.median).toBe(80);
    expect(summary.grades).toMatchObject({ A: 1, C: 1 });
    expect(summary.attempts).toBe(3);
    expect(summary.falsePositiveApplied).toBe(1);
    expect(summary.p95PipelineMs).toBe(200);
  });
});

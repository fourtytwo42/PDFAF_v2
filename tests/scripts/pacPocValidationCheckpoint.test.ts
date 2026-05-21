import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildValidationCheckpointReport,
  renderValidationCheckpointMarkdown,
  writeValidationCheckpointReport,
  type ValidationCheckpointInput,
} from '../../scripts/pac-poc-validation-checkpoint.js';

async function writeBaseline(path: string, rows: Array<Record<string, unknown>>, generatedAt = '2026-05-21T00:00:00.000Z') {
  await writeFile(path, JSON.stringify({
    generatedAt,
    flags: { semantic: false, writePdfs: false },
    summary: { count: rows.length, meanAfter: 95 },
    rows,
  }, null, 2), 'utf8');
}

describe('PAC/POC validation checkpoint', () => {
  it('summarizes baseline reports with all-row mean, errors, and false positives', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-validation-checkpoint-'));
    try {
      const baseline = join(dir, 'baseline_report.json');
      await writeBaseline(baseline, [
        { file: 'a.pdf', afterScore: 95, afterGrade: 'A', durationMs: 100, falsePositiveApplied: 0 },
        { file: 'b.pdf', afterScore: 85, afterGrade: 'B', durationMs: 200, falsePositiveApplied: 1 },
        { file: 'c.pdf', afterScore: null, afterGrade: '?', durationMs: 300, error: 'per_pdf_timeout_300000ms' },
      ]);

      const report = await buildValidationCheckpointReport([{
        scope: 'outside_holdout',
        label: 'fixture holdout',
        path: baseline,
        minimumRows: 3,
        targetMean: 93,
      }]);

      expect(report.decision.status).toBe('validation_not_passing');
      expect(report.scopes[0]?.meanAllRows).toBe(60);
      expect(report.scopes[0]?.meanCompletedRows).toBe(90);
      expect(report.scopes[0]?.falsePositiveApplied).toBe(1);
      expect(report.scopes[0]?.timeoutOrErrorRows).toHaveLength(1);
      expect(report.scopes[0]?.notes).toEqual(expect.arrayContaining([
        'false_positive_applied=1',
        'mean_below_target:60<93',
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads all-input diagnostics and false-positive evidence from source shards', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-validation-checkpoint-'));
    try {
      const sourceRoot = join(dir, 'all-input-run');
      const shard = join(sourceRoot, 'shard-01');
      await mkdir(shard, { recursive: true });
      await writeBaseline(join(shard, 'baseline_report.json'), [
        { file: '001.pdf', afterScore: 94, afterGrade: 'A', durationMs: 100, falsePositiveApplied: 0 },
        { file: '002.pdf', afterScore: null, afterGrade: '?', durationMs: 300000, error: 'timeout' },
      ]);
      const diagnostic = join(dir, 'all-input-mean-diagnostic.json');
      await writeFile(diagnostic, JSON.stringify({
        generatedAt: '2026-05-21T01:00:00.000Z',
        sourceRoot,
        summary: {
          processed: 351,
          mean: 93.01,
          median: 95,
          gradeDistribution: { A: 350, '?': 1 },
          runtimeP95Ms: 1000,
          runtimeMaxMs: 300000,
        },
      }, null, 2), 'utf8');

      const report = await buildValidationCheckpointReport([{
        scope: 'all_unique',
        label: 'all unique',
        path: diagnostic,
        minimumRows: 351,
        targetMean: 93,
      }]);

      expect(report.decision.status).toBe('validation_gate_ready');
      expect(report.scopes[0]?.artifactKind).toBe('all_input_diagnostic');
      expect(report.scopes[0]?.falsePositiveApplied).toBe(0);
      expect(report.scopes[0]?.timeoutOrErrorRows).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('marks missing required scopes incomplete', async () => {
    const inputs: ValidationCheckpointInput[] = [
      { scope: 'original_50', label: 'original', minimumRows: 50 },
      { scope: 'all_unique', label: 'all', minimumRows: 351, targetMean: 93 },
      { scope: 'outside_holdout', label: 'outside', minimumRows: 20, targetMean: 93 },
    ];
    const report = await buildValidationCheckpointReport(inputs);

    expect(report.decision.status).toBe('validation_incomplete');
    expect(report.decision.reasons).toContain('incomplete=3');
    expect(renderValidationCheckpointMarkdown(report)).toContain('artifact_missing');
  });

  it('writes JSON and Markdown artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-validation-checkpoint-'));
    try {
      const baseline = join(dir, 'baseline_report.json');
      await writeBaseline(baseline, Array.from({ length: 20 }, (_, index) => ({
        file: `${index}.pdf`,
        afterScore: 95,
        afterGrade: 'A',
        durationMs: 100 + index,
        falsePositiveApplied: 0,
      })));
      const out = join(dir, 'out');
      await writeValidationCheckpointReport([{
        scope: 'outside_holdout',
        label: 'outside',
        path: baseline,
        minimumRows: 20,
        targetMean: 93,
      }], out);

      const json = JSON.parse(await readFile(join(out, 'pac-poc-validation-checkpoint.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(out, 'pac-poc-validation-checkpoint.md'), 'utf8');

      expect(json).toMatchObject({ decision: { status: 'validation_gate_ready' } });
      expect(md).toContain('PAC/POC Validation Checkpoint');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

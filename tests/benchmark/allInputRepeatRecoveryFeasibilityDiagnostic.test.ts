import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRepeatRecoveryFeasibilityReport } from '../../scripts/all-input-repeat-recovery-feasibility-diagnostic.js';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'repeat-recovery-'));
  tempDirs.push(dir);
  return dir;
}

async function writeReport(dir: string, rows: unknown[]): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'baseline_report.json');
  await writeFile(file, JSON.stringify({ rows }, null, 2), 'utf8');
  return file;
}

function row(file: string, score: number, durationMs = 10_000, falsePositiveApplied = 0) {
  return {
    file,
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    durationMs,
    falsePositiveApplied,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('all-input repeat recovery feasibility diagnostic', () => {
  it('classifies bounded retry candidates separately from semantic and runtime-heavy candidates', async () => {
    const root = await makeTempDir();
    const baseline = await writeReport(join(root, 'baseline'), [
      row('0316.pdf', 59),
      row('0200.pdf', 59),
      row('0136.pdf', 59),
      row('structure-4438.pdf', 0),
      row('already-good.pdf', 94),
    ]);
    await writeReport(join(root, 'run-repeat'), [
      row('0316.pdf', 97, 20_000),
      row('0136.pdf', 80, 20_000),
      row('structure-4438.pdf', 91, 20_000),
      row('already-good.pdf', 99, 20_000),
    ]);
    await writeReport(join(root, 'api-semantic-run'), [
      row('0200.pdf', 91, 40_000),
    ]);
    await writeReport(join(root, 'runtime-run'), [
      row('0136.pdf', 94, 225_000),
    ]);

    const report = await buildRepeatRecoveryFeasibilityReport({
      baselineReport: baseline,
      searchRoot: root,
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(report.summary.baselineMean).toBe(54.2);
    expect(report.summary.boundedRetryCandidateCount).toBe(1);
    expect(report.summary.boundedRetryGain).toBe(38);
    expect(report.candidates.find(candidate => candidate.file === '0316.pdf')).toEqual(expect.objectContaining({
      classification: 'bounded_retry_candidate',
      delta: 38,
    }));
    expect(report.candidates.find(candidate => candidate.file === '0200.pdf')).toEqual(expect.objectContaining({
      classification: 'semantic_planning_candidate',
    }));
    expect(report.candidates.find(candidate => candidate.file === '0136.pdf')).toEqual(expect.objectContaining({
      classification: 'runtime_expensive_candidate',
    }));
    expect(report.candidates.find(candidate => candidate.file === 'structure-4438.pdf')).toEqual(expect.objectContaining({
      classification: 'parked_or_unsafe_candidate',
    }));
    expect(report.candidates.find(candidate => candidate.file === 'already-good.pdf')).toEqual(expect.objectContaining({
      classification: 'already_above_target_polish',
    }));
  });

  it('does not use false-positive candidates for bounded recovery', async () => {
    const root = await makeTempDir();
    const baseline = await writeReport(join(root, 'baseline'), [
      row('bad.pdf', 59),
    ]);
    await writeReport(join(root, 'run-repeat'), [
      row('bad.pdf', 97, 10_000, 1),
    ]);

    const report = await buildRepeatRecoveryFeasibilityReport({
      baselineReport: baseline,
      searchRoot: root,
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(report.summary.boundedRetryCandidateCount).toBe(0);
    expect(report.candidates[0]).toEqual(expect.objectContaining({
      classification: 'parked_or_unsafe_candidate',
      falsePositiveApplied: 1,
    }));
  });
});

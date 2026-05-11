import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMetadataDriftReport } from '../../scripts/all-input-metadata-drift-diagnostic.js';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'metadata-drift-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

function details(input: {
  raw?: string;
  stateBefore: string;
  stateAfter: string;
  scoreBefore: number;
  scoreAfter: number;
  titleBefore: number;
  titleAfter: number;
  headingBefore: number;
  headingAfter: number;
  readingBefore?: number;
  readingAfter?: number;
}): string {
  return JSON.stringify({
    raw: input.raw,
    debug: {
      replayState: {
        stateSignatureBefore: input.stateBefore,
        stateSignatureAfter: input.stateAfter,
        scoreBefore: input.scoreBefore,
        scoreAfter: input.scoreAfter,
        categoryScoresBefore: {
          title_language: input.titleBefore,
          heading_structure: input.headingBefore,
          reading_order: input.readingBefore ?? 0,
        },
        categoryScoresAfter: {
          title_language: input.titleAfter,
          heading_structure: input.headingAfter,
          reading_order: input.readingAfter ?? 0,
        },
      },
    },
  });
}

async function writeReport(dir: string, rows: unknown[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'baseline_report.json'), JSON.stringify({ rows }, null, 2), 'utf8');
}

describe('all-input metadata drift diagnostic', () => {
  it('classifies rejected metadata tools with same-state alternate applied evidence', async () => {
    const root = await makeTempDir();
    const state = 'same-state';
    await writeReport(join(root, 'good'), [{
      file: '4139.pdf',
      appliedTools: [{
        toolName: 'set_document_language',
        outcome: 'applied',
        scoreBefore: 52,
        scoreAfter: 59,
        details: details({
          stateBefore: state,
          stateAfter: 'good-after',
          scoreBefore: 52,
          scoreAfter: 59,
          titleBefore: 0,
          titleAfter: 100,
          headingBefore: 94,
          headingAfter: 94,
        }),
      }],
    }]);
    await writeReport(join(root, 'bad'), [{
      file: '4139.pdf',
      appliedTools: [{
        toolName: 'set_document_language',
        outcome: 'rejected',
        scoreBefore: 52,
        scoreAfter: 52,
        details: details({
          raw: 'stage_regressed_score(38)',
          stateBefore: state,
          stateAfter: 'bad-after',
          scoreBefore: 52,
          scoreAfter: 38,
          titleBefore: 0,
          titleAfter: 100,
          headingBefore: 94,
          headingAfter: 0,
        }),
      }],
    }]);

    const report = await buildMetadataDriftReport({
      searchRoot: root,
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(report.summary.sameStateAlternateApplied).toBe(1);
    expect(report.rows[0]).toEqual(expect.objectContaining({
      file: '4139.pdf',
      toolName: 'set_document_language',
      replayState: state,
      classification: 'same_state_alternate_applied',
      alternateAppliedScoreAfter: 59,
    }));
  });

  it('separates metadata drift candidates without alternate proof from inconclusive rejections', async () => {
    const root = await makeTempDir();
    await writeReport(join(root, 'bad'), [{
      file: 'drift.pdf',
      appliedTools: [{
        toolName: 'set_document_title',
        outcome: 'rejected',
        scoreBefore: 52,
        scoreAfter: 52,
        details: details({
          raw: 'stage_regressed_score(38)',
          stateBefore: 'drift-state',
          stateAfter: 'drift-after',
          scoreBefore: 52,
          scoreAfter: 38,
          titleBefore: 0,
          titleAfter: 100,
          headingBefore: 94,
          headingAfter: 0,
        }),
      }],
    }, {
      file: 'unsafe.pdf',
      appliedTools: [{
        toolName: 'set_document_title',
        outcome: 'rejected',
        scoreBefore: 52,
        scoreAfter: 52,
        details: details({
          raw: 'no_effect',
          stateBefore: 'unsafe-state',
          stateAfter: 'unsafe-after',
          scoreBefore: 52,
          scoreAfter: 52,
          titleBefore: 0,
          titleAfter: 0,
          headingBefore: 94,
          headingAfter: 94,
        }),
      }],
    }]);

    const report = await buildMetadataDriftReport({
      searchRoot: root,
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(report.summary.metadataReanalysisDriftCandidates).toBe(1);
    expect(report.summary.unsafeOrInconclusive).toBe(1);
    expect(report.rows.find(row => row.file === 'drift.pdf')).toEqual(expect.objectContaining({
      classification: 'metadata_reanalysis_drift_candidate',
    }));
    expect(report.rows.find(row => row.file === 'unsafe.pdf')).toEqual(expect.objectContaining({
      classification: 'unsafe_or_inconclusive_metadata_regression',
    }));
  });
});

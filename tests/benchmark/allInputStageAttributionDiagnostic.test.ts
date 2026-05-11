import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStageAttributionReport } from '../../scripts/all-input-stage-attribution-diagnostic.js';

const tempDirs: string[] = [];

async function tempReport(rows: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'stage-attribution-'));
  tempDirs.push(dir);
  const path = join(dir, 'baseline_report.json');
  await writeFile(path, JSON.stringify({ rows }, null, 2), 'utf8');
  return path;
}

function details(state = 'state-a', reason = 'no_structural_change'): string {
  return JSON.stringify({
    note: reason,
    debug: {
      replayState: {
        stateSignatureBefore: state,
        stateSignatureAfter: `${state}-after`,
      },
    },
  });
}

function row(file: string, afterScore: number, tools: unknown[]) {
  return {
    file,
    afterScore,
    afterGrade: afterScore >= 90 ? 'A' : afterScore >= 80 ? 'B' : afterScore >= 70 ? 'C' : afterScore >= 60 ? 'D' : 'F',
    appliedTools: tools,
  };
}

function tool(toolName: string, outcome: string, scoreBefore: number, scoreAfter: number, reason?: string) {
  return {
    toolName,
    outcome,
    scoreBefore,
    scoreAfter,
    delta: scoreAfter - scoreBefore,
    stage: 2,
    round: 1,
    details: details(`${toolName}-state`, reason),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('all-input stage attribution diagnostic', () => {
  it('classifies no-effect rows with score movement separately from normal tool rows', async () => {
    const reportPath = await tempReport([
      row('0346.pdf', 59, [
        tool('create_heading_from_tagged_visible_anchor', 'no_effect', 51, 59, 'mcid_owner_not_found'),
        tool('remap_orphan_mcids_as_artifacts', 'applied', 51, 59),
        tool('set_document_title', 'applied', 59, 59),
      ]),
    ]);

    const report = await buildStageAttributionReport({
      reportPaths: [reportPath],
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(report.summary.noEffectScoreMovement).toBe(1);
    expect(report.summary.appliedNoScoreMovement).toBe(1);
    expect(report.summary.lowFinalRowsWithNoEffectMovement).toBe(1);
    expect(report.rows.map(row => row.classification)).toEqual([
      'no_effect_score_movement',
      'applied_no_score_movement',
    ]);
    expect(report.rows[0]).toEqual(expect.objectContaining({
      file: '0346.pdf',
      toolName: 'create_heading_from_tagged_visible_anchor',
      replayStateBefore: 'create_heading_from_tagged_visible_anchor-state',
      reason: 'mcid_owner_not_found',
    }));
  });

  it('tracks rejected score movement without treating it as normal evidence', async () => {
    const reportPath = await tempReport([
      row('candidate.pdf', 91, [
        tool('normalize_annotation_tab_order', 'rejected', 59, 79, 'pac_regression'),
      ]),
    ]);

    const report = await buildStageAttributionReport({
      reportPaths: [reportPath],
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(report.summary.rejectedScoreMovement).toBe(1);
    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'rejected_score_movement',
      toolName: 'normalize_annotation_tab_order',
    }));
  });
});

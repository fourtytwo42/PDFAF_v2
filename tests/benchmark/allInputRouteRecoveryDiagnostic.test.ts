import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAllInputRouteRecoveryDiagnostic } from '../../scripts/all-input-route-recovery-diagnostic.js';

const tempDirs: string[] = [];

async function tempReport(name: string, row: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-route-diag-'));
  tempDirs.push(dir);
  const path = join(dir, `${name}.json`);
  await writeFile(path, JSON.stringify({ rows: [row] }, null, 2));
  return path;
}

function details(before: string, after: string, raw?: string): string {
  return JSON.stringify({
    raw,
    debug: {
      replayState: {
        stateSignatureBefore: before,
        stateSignatureAfter: after,
      },
    },
  });
}

function row(score: number, tools: unknown[]) {
  return {
    file: '0086-safe-passage.pdf',
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    durationMs: 1000,
    categoryGap: {
      after: [
        { key: 'heading_structure', score: score >= 90 ? 78 : 0, applicable: true },
      ],
    },
    appliedTools: tools,
  };
}

function tool(toolName: string, outcome: string, scoreBefore: number, scoreAfter: number, state: string, raw?: string) {
  return {
    stage: 1,
    round: 1,
    toolName,
    outcome,
    scoreBefore,
    scoreAfter,
    delta: scoreAfter - scoreBefore,
    details: details(state, `${state}-after`, raw),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('all-input route recovery diagnostic', () => {
  it('classifies upstream route volatility when good and bad routes diverge before the score-moving tool', async () => {
    const good = await tempReport('good', row(90, [
      tool('set_document_title', 'applied', 39, 47, 'a'),
      tool('repair_native_link_structure', 'applied', 47, 59, 'b'),
      tool('repair_structure_conformance', 'applied', 69, 89, 'good-state'),
    ]));
    const bad = await tempReport('bad', row(59, [
      tool('set_document_title', 'applied', 39, 47, 'a'),
      tool('repair_native_link_structure', 'applied', 47, 47, 'b'),
      tool('mark_untagged_content_as_artifact', 'applied', 59, 59, 'bad-state'),
    ]));

    const report = await buildAllInputRouteRecoveryDiagnostic({
      focus: '0086',
      runs: [
        { label: 'good', reportPath: good },
        { label: 'bad', reportPath: bad },
      ],
      generatedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(report.comparison).toEqual(expect.objectContaining({
      classification: 'upstream_route_volatility',
      firstDivergenceIndex: 1,
    }));
    expect(report.comparison.goodOnlyScoreMovingTools.some(item => item.includes('repair_structure_conformance'))).toBe(true);
  });

  it('classifies same-state guard candidates when bad route rejects from a state where good route applies', async () => {
    const good = await tempReport('good', row(91, [
      tool('repair_structure_conformance', 'applied', 59, 89, 'shared'),
    ]));
    const bad = await tempReport('bad', row(59, [
      tool('repair_structure_conformance', 'rejected', 59, 59, 'shared', 'pac_regression'),
    ]));

    const report = await buildAllInputRouteRecoveryDiagnostic({
      focus: '0086',
      runs: [
        { label: 'good', reportPath: good },
        { label: 'bad', reportPath: bad },
      ],
      generatedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(report.comparison.classification).toBe('same_state_route_guard_candidate');
    expect(report.comparison.sharedRejectedScoreMovingStates).toEqual(['repair_structure_conformance@shared']);
  });
});

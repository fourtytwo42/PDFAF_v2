import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFigureAltTreeCapAcceptanceAudit,
  renderFigureAltTreeCapAcceptanceAuditMarkdown,
  writeFigureAltTreeCapAcceptanceAudit,
} from '../../scripts/figure-alt-tree-cap-acceptance-audit.js';

function row(file: string, score: number | null, grade = 'A', durationMs = 1000) {
  return {
    file,
    afterScore: score,
    afterGrade: score === null ? '?' : grade,
    durationMs,
    falsePositiveApplied: 0,
    ...(score === null ? { error: 'timeout' } : {}),
  };
}

function baseline(rows: ReturnType<typeof row>[]) {
  return { rows };
}

function originalReference() {
  return baseline([
    row('4516-report.pdf', 85, 'B', 1000),
    row('4680-report.pdf', 98, 'A', 1100),
    row('stable-report.pdf', 95, 'A', 1200),
    row('4438-report.pdf', null, '?', 300000),
  ]);
}

function originalCurrent() {
  return baseline([
    row('4516-report.pdf', 59, 'F', 1000),
    row('4680-report.pdf', 59, 'F', 1100),
    row('stable-report.pdf', 95, 'A', 1200),
    row('4438-report.pdf', null, '?', 300000),
  ]);
}

function originalRepeat() {
  return baseline([
    row('4516.pdf', 55, 'F', 1000),
    row('4680.pdf', 95, 'A', 1100),
  ]);
}

function outsideBefore() {
  return baseline([row('a.pdf', 91, 'A'), row('b.pdf', 91, 'A')]);
}

function outsideAfter() {
  return baseline([row('a.pdf', 94, 'A'), row('b.pdf', 94, 'A')]);
}

const metadataOptimism = {
  rows: [
    { key: '4516', classification: 'reference_metadata_structural_optimism' },
  ],
};

describe('figure alt tree-cap acceptance audit', () => {
  it('requires a fresh original-50 repeat when a material row only recovered in focus', () => {
    const report = buildFigureAltTreeCapAcceptanceAudit({
      generatedAt: '2026-05-21T00:00:00.000Z',
      originalReferencePath: '/reference.json',
      originalCurrentPath: '/current.json',
      originalRepeatPath: '/repeat.json',
      outsideBeforePath: '/outside-before.json',
      outsideAfterPath: '/outside-after.json',
      originalReference: originalReference(),
      originalCurrent: originalCurrent(),
      originalRepeat: originalRepeat(),
      outsideBefore: outsideBefore(),
      outsideAfter: outsideAfter(),
      metadataOptimism,
      allUniquePath: null,
      allUnique: null,
    });

    expect(report.decision.status).toBe('needs_fresh_original50_repeat_after_route_variance');
    expect(report.gates.falsePositiveAppliedZero).toBe(true);
    expect(report.gates.outsideHoldoutImprovedAndAtTarget).toBe(true);
    expect(report.original50.diffRows.map(row => row.classification)).toEqual(expect.arrayContaining([
      'stricter_score_candidate_unaccepted',
      'repeat_recovered_route_variance',
    ]));
  });

  it('requires explicit stricter-score acceptance when route variance is already clear', () => {
    const current = baseline([
      row('4516-report.pdf', 59, 'F', 1000),
      row('4680-report.pdf', 95, 'A', 1100),
      row('stable-report.pdf', 95, 'A', 1200),
      row('4438-report.pdf', null, '?', 300000),
    ]);
    const report = buildFigureAltTreeCapAcceptanceAudit({
      originalReferencePath: '/reference.json',
      originalCurrentPath: '/current.json',
      originalRepeatPath: '/repeat.json',
      outsideBeforePath: '/outside-before.json',
      outsideAfterPath: '/outside-after.json',
      originalReference: originalReference(),
      originalCurrent: current,
      originalRepeat: originalRepeat(),
      outsideBefore: outsideBefore(),
      outsideAfter: outsideAfter(),
      metadataOptimism,
      allUniquePath: null,
      allUnique: null,
    });

    expect(report.decision.status).toBe('needs_explicit_stricter_score_acceptance');
  });

  it('accepts when gates pass and stricter candidates are explicitly accepted', () => {
    const current = baseline([
      row('4516-report.pdf', 59, 'F', 1000),
      row('4680-report.pdf', 95, 'A', 1100),
      row('stable-report.pdf', 95, 'A', 1200),
      row('4438-report.pdf', null, '?', 300000),
    ]);
    const report = buildFigureAltTreeCapAcceptanceAudit({
      originalReferencePath: '/reference.json',
      originalCurrentPath: '/current.json',
      originalRepeatPath: '/repeat.json',
      outsideBeforePath: '/outside-before.json',
      outsideAfterPath: '/outside-after.json',
      originalReference: originalReference(),
      originalCurrent: current,
      originalRepeat: originalRepeat(),
      outsideBefore: outsideBefore(),
      outsideAfter: outsideAfter(),
      metadataOptimism,
      allUniquePath: null,
      allUnique: null,
      acceptedStricterKeys: ['4516'],
    });

    expect(report.decision.status).toBe('accepted_with_documented_stricter_scores');
    expect(report.original50.diffRows.find(row => row.key === '4516')?.classification)
      .toBe('stricter_score_candidate_accepted');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-tree-cap-audit-'));
    try {
      const paths = {
        originalReference: join(dir, 'reference.json'),
        originalCurrent: join(dir, 'current.json'),
        originalRepeat: join(dir, 'repeat.json'),
        outsideBefore: join(dir, 'outside-before.json'),
        outsideAfter: join(dir, 'outside-after.json'),
        metadata: join(dir, 'metadata.json'),
      };
      await writeFile(paths.originalReference, JSON.stringify(originalReference()), 'utf8');
      await writeFile(paths.originalCurrent, JSON.stringify(originalCurrent()), 'utf8');
      await writeFile(paths.originalRepeat, JSON.stringify(originalRepeat()), 'utf8');
      await writeFile(paths.outsideBefore, JSON.stringify(outsideBefore()), 'utf8');
      await writeFile(paths.outsideAfter, JSON.stringify(outsideAfter()), 'utf8');
      await writeFile(paths.metadata, JSON.stringify(metadataOptimism), 'utf8');
      const outDir = join(dir, 'out');
      const report = await writeFigureAltTreeCapAcceptanceAudit({
        originalReferencePath: paths.originalReference,
        originalCurrentPath: paths.originalCurrent,
        originalRepeatPath: paths.originalRepeat,
        outsideBeforePath: paths.outsideBefore,
        outsideAfterPath: paths.outsideAfter,
        metadataOptimismPath: paths.metadata,
        allUniquePath: null,
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'figure-alt-tree-cap-acceptance-audit.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'figure-alt-tree-cap-acceptance-audit.md'), 'utf8');

      expect(report.decision.status).toBe('needs_fresh_original50_repeat_after_route_variance');
      expect(json).toMatchObject({ decision: { status: 'needs_fresh_original50_repeat_after_route_variance' } });
      expect(md).toContain('Figure/Alt Tree-Cap Acceptance Audit');
      expect(renderFigureAltTreeCapAcceptanceAuditMarkdown(report)).toContain('Read-only acceptance audit');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  writeFinalReanalysisVarianceDiagnostic,
} from '../../scripts/original50-final-reanalysis-variance-diagnostic.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function profile(input: {
  headings?: number;
  figures?: number;
  tables?: number;
  irregularTables?: number;
  orphanMcids?: number;
}) {
  return {
    headingSignals: {
      extractedHeadingCount: input.headings ?? 2,
      treeHeadingCount: input.headings ?? 2,
      headingTreeDepth: 5,
    },
    figureSignals: {
      extractedFigureCount: input.figures ?? 3,
      treeFigureCount: input.figures ?? 3,
      checkerVisibleFigureCount: input.figures ?? 3,
    },
    tableSignals: {
      tableCount: input.tables ?? 0,
      irregularTableCount: input.irregularTables ?? 0,
    },
    pdfUaSignals: {
      orphanMcidCount: input.orphanMcids ?? 64,
    },
  };
}

function row(id: string, input: {
  before?: number;
  after: number;
  reanalyzed: number;
  afterCategories: Record<string, number>;
  reanalyzedCategories?: Record<string, number>;
  afterProfile?: ReturnType<typeof profile>;
  reanalyzedProfile?: ReturnType<typeof profile>;
}) {
  return {
    id,
    file: `${id}.pdf`,
    beforeScore: input.before ?? input.after,
    afterScore: input.after,
    afterGrade: input.after >= 90 ? 'A' : 'F',
    reanalyzedScore: input.reanalyzed,
    reanalyzedGrade: input.reanalyzed >= 90 ? 'A' : 'F',
    wallRemediateMs: 1234,
    falsePositiveApplied: 0,
    afterCategories: Object.entries(input.afterCategories).map(([key, value]) => category(key, value)),
    reanalyzedCategories: Object.entries(input.reanalyzedCategories ?? input.afterCategories).map(([key, value]) => category(key, value)),
    afterDetectionProfile: input.afterProfile ?? profile({}),
    reanalyzedDetectionProfile: input.reanalyzedProfile ?? input.afterProfile ?? profile({}),
    appliedTools: [{
      stage: 1,
      toolName: 'set_document_language',
      outcome: 'applied',
      scoreBefore: input.before ?? input.after,
      scoreAfter: input.after,
      details: JSON.stringify({ debug: { replayState: { pacRegressions: [] } } }),
    }],
  };
}

async function writeRun(dir: string, rows: unknown[]) {
  await mkdir(dir);
  await writeFile(join(dir, 'remediate.results.json'), JSON.stringify(rows), 'utf8');
}

describe('original50 final reanalysis variance diagnostic', () => {
  it('classifies after-to-reanalysis score drops', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-final-reanalysis-drop-'));
    try {
      const run = join(dir, 'run');
      await writeRun(run, [
        row('4683', {
          after: 59,
          reanalyzed: 52,
          afterCategories: { heading_structure: 99, table_markup: 100, reading_order: 96 },
          reanalyzedCategories: { heading_structure: 43, table_markup: 6, reading_order: 100 },
          afterProfile: profile({ headings: 22, figures: 2, tables: 0 }),
          reanalyzedProfile: profile({ headings: 22, figures: 13, tables: 11, irregularTables: 3 }),
        }),
      ]);

      const diagnostic = await writeFinalReanalysisVarianceDiagnostic({
        runs: [{ label: 'candidate', path: run }],
        rows: ['4683'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('after_to_reanalysis_score_drop');
      expect(diagnostic.decision.status).toBe('diagnose_final_reanalysis_analyzer_variance_before_behavior');
      expect(diagnostic.rows[0]?.runs[0]?.categoryDeltasAfterToReanalysis.map(delta => delta.key)).toContain('table_markup');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('classifies repeat final reanalysis variance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-final-reanalysis-repeat-'));
    try {
      const r1 = join(dir, 'r1');
      const r2 = join(dir, 'r2');
      await writeRun(r1, [
        row('4680', {
          after: 59,
          reanalyzed: 59,
          afterCategories: { heading_structure: 60, table_markup: 92, reading_order: 100 },
          afterProfile: profile({ headings: 2, figures: 7, tables: 8 }),
        }),
      ]);
      await writeRun(r2, [
        row('4680', {
          after: 94,
          reanalyzed: 94,
          afterCategories: { heading_structure: 95, table_markup: 100, reading_order: 96 },
          afterProfile: profile({ headings: 20, figures: 4, tables: 0 }),
        }),
      ]);

      const diagnostic = await writeFinalReanalysisVarianceDiagnostic({
        runs: [{ label: 'r1', path: r1 }, { label: 'r2', path: r2 }],
        rows: ['4680'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('repeat_reanalysis_variance');
      expect(diagnostic.rows[0]?.repeatReanalysisScoreDelta).toBe(35);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes JSON and Markdown for stable low final evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-final-reanalysis-stable-'));
    try {
      const run = join(dir, 'run');
      await writeRun(run, [
        row('4516', {
          after: 89,
          reanalyzed: 89,
          afterCategories: { heading_structure: 80, table_markup: 100, reading_order: 96 },
          afterProfile: profile({ headings: 4, figures: 1 }),
        }),
      ]);

      const outDir = join(dir, 'out');
      const diagnostic = await writeFinalReanalysisVarianceDiagnostic({
        runs: [{ label: 'run', path: run }],
        rows: ['4516'],
        outDir,
        targetScore: 93,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-final-reanalysis-variance-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-final-reanalysis-variance-diagnostic.md'), 'utf8');

      expect(diagnostic.rows[0]?.classification).toBe('stable_low_reanalysis_verified');
      expect(json).toMatchObject({ summary: { rowCount: 1 } });
      expect(md).toContain('Original-50 Final Reanalysis Variance Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

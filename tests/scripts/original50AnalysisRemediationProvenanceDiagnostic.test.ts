import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  writeAnalysisRemediationProvenanceDiagnostic,
} from '../../scripts/original50-analysis-remediation-provenance-diagnostic.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function analysisRow(id: string, score: number, categories: Record<string, number>, signals: Record<string, number> = {}) {
  return {
    id,
    file: `${id}.pdf`,
    score,
    grade: score >= 90 ? 'A' : 'F',
    categories: Object.entries(categories).map(([key, value]) => category(key, value)),
    detectionProfile: {
      headingSignals: {
        extractedHeadingCount: signals.extractedHeadingCount ?? 10,
        treeHeadingCount: signals.treeHeadingCount ?? 10,
        headingTreeDepth: signals.headingTreeDepth ?? 7,
      },
      figureSignals: {
        extractedFigureCount: signals.extractedFigureCount ?? 4,
        treeFigureCount: signals.treeFigureCount ?? 4,
      },
      tableSignals: {
        irregularTableCount: signals.irregularTableCount ?? 0,
        stronglyIrregularTableCount: signals.stronglyIrregularTableCount ?? 0,
      },
      pdfUaSignals: { orphanMcidCount: 64 },
    },
  };
}

function details(input: {
  before: string;
  scoreBefore: number;
  categories: Record<string, number>;
  signals?: Record<string, number>;
}) {
  return JSON.stringify({
    debug: {
      replayState: {
        stateSignatureBefore: input.before,
        scoreBefore: input.scoreBefore,
        categoryScoresBefore: input.categories,
        detectionSignalsBefore: {
          extractedHeadingCount: input.signals?.extractedHeadingCount ?? 10,
          treeHeadingCount: input.signals?.treeHeadingCount ?? 10,
          headingTreeDepth: input.signals?.headingTreeDepth ?? 7,
          extractedFigureCount: input.signals?.extractedFigureCount ?? 4,
          treeFigureCount: input.signals?.treeFigureCount ?? 4,
          orphanMcidCount: 64,
        },
      },
    },
  });
}

function remRow(id: string, finalScore: number, input: {
  before?: string;
  scoreBefore?: number;
  categories: Record<string, number>;
  signals?: Record<string, number>;
}) {
  return {
    id,
    file: `${id}.pdf`,
    beforeScore: input.scoreBefore ?? finalScore,
    afterScore: finalScore,
    afterGrade: finalScore >= 90 ? 'A' : 'F',
    falsePositiveApplied: 0,
    appliedTools: [{
      stage: 1,
      toolName: 'set_document_language',
      outcome: 'applied',
      scoreBefore: input.scoreBefore ?? finalScore,
      scoreAfter: input.scoreBefore ?? finalScore,
      details: details({
        before: input.before ?? 'state',
        scoreBefore: input.scoreBefore ?? finalScore,
        categories: input.categories,
        signals: input.signals,
      }),
    }],
  };
}

async function writeRun(dir: string, analysisRows: unknown[], remRows: unknown[]) {
  await mkdir(dir);
  await writeFile(join(dir, 'analyze.results.json'), JSON.stringify(analysisRows), 'utf8');
  await writeFile(join(dir, 'remediate.results.json'), JSON.stringify(remRows), 'utf8');
}

describe('original50 analysis/remediation provenance diagnostic', () => {
  it('classifies same-run analysis to remediation entry variance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-provenance-'));
    try {
      const run = join(dir, 'run');
      await writeRun(
        run,
        [analysisRow('4683', 59, { heading_structure: 99, table_markup: 100, reading_order: 96 }, { extractedHeadingCount: 1, extractedFigureCount: 3 })],
        [remRow('4683', 59, {
          scoreBefore: 48,
          categories: { heading_structure: 43, table_markup: 6, reading_order: 100 },
          signals: { extractedHeadingCount: 22, extractedFigureCount: 15 },
        })],
      );

      const diagnostic = await writeAnalysisRemediationProvenanceDiagnostic({
        runs: [{ label: 'run', path: run }],
        rows: ['4683'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('analysis_to_remediation_initial_variance');
      expect(diagnostic.decision.status).toBe('diagnose_analyzer_remediation_entry_variance_before_behavior');
      expect(diagnostic.rows[0]?.runs[0]?.categoryDeltasAnalyzeToReplay.map(delta => delta.key)).toContain('heading_structure');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('classifies repeat-only analyzer variance when same-run entry is stable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-provenance-repeat-'));
    try {
      const r1 = join(dir, 'r1');
      const r2 = join(dir, 'r2');
      const low = { heading_structure: 60, table_markup: 79, reading_order: 100 };
      const high = { heading_structure: 95, table_markup: 100, reading_order: 96 };
      await writeRun(r1, [analysisRow('4680', 59, low, { extractedHeadingCount: 19 })], [remRow('4680', 59, { categories: low, signals: { extractedHeadingCount: 19 } })]);
      await writeRun(r2, [analysisRow('4680', 59, high, { extractedHeadingCount: 1 })], [remRow('4680', 59, { categories: high, signals: { extractedHeadingCount: 1 } })]);

      const diagnostic = await writeAnalysisRemediationProvenanceDiagnostic({
        runs: [{ label: 'r1', path: r1 }, { label: 'r2', path: r2 }],
        rows: ['4680'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('analysis_repeat_variance');
      expect(diagnostic.rows[0]?.analyzeRepeatCategoryDeltas.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes JSON and Markdown for a stable low row', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-provenance-stable-'));
    try {
      const run = join(dir, 'run');
      const categories = { heading_structure: 60, table_markup: 79, reading_order: 100 };
      await writeRun(run, [analysisRow('4516', 89, categories)], [remRow('4516', 89, { categories })]);

      const outDir = join(dir, 'out');
      const diagnostic = await writeAnalysisRemediationProvenanceDiagnostic({
        runs: [{ label: 'run', path: run }],
        rows: ['4516'],
        outDir,
        targetScore: 93,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-analysis-remediation-provenance-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-analysis-remediation-provenance-diagnostic.md'), 'utf8');

      expect(diagnostic.rows[0]?.classification).toBe('stable_low_no_entry_variance');
      expect(json).toMatchObject({ summary: { rowCount: 1 } });
      expect(md).toContain('Original-50 Analysis/Remediation Provenance Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

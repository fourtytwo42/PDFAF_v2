import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFigureAltNoGainReport,
  renderFigureAltNoGainMarkdown,
  writeFigureAltNoGainReport,
} from '../../scripts/outside-figure-alt-no-gain-diagnostic.js';

function categories(values: Record<string, number>) {
  return Object.entries(values).map(([key, score]) => ({ key, score, applicable: true }));
}

function replay(input: {
  beforeAlt?: number;
  afterAlt?: number;
  beforeChecker?: [number, number];
  afterChecker?: [number, number];
  treeMissing?: boolean;
  extracted?: number;
  tree?: number;
}) {
  const beforeChecker = input.beforeChecker ?? [6, 0];
  const afterChecker = input.afterChecker ?? [6, 6];
  return {
    debug: {
      replayState: {
        categoryScoresBefore: {
          alt_text: input.beforeAlt ?? 20,
          heading_structure: 100,
          reading_order: 90,
          table_markup: 100,
          pdf_ua_compliance: 79,
        },
        categoryScoresAfter: {
          alt_text: input.afterAlt ?? 20,
          heading_structure: 100,
          reading_order: 90,
          table_markup: 100,
          pdf_ua_compliance: 79,
        },
        detectionSignalsBefore: {
          checkerVisibleFigureCount: beforeChecker[0],
          checkerVisibleFigureAltCount: beforeChecker[1],
          extractedFigureCount: input.extracted ?? 3,
          treeFigureCount: input.tree ?? 0,
          treeFigureMissingForExtractedFigures: input.treeMissing ?? true,
        },
        detectionSignalsAfter: {
          checkerVisibleFigureCount: afterChecker[0],
          checkerVisibleFigureAltCount: afterChecker[1],
          extractedFigureCount: input.extracted ?? 3,
          treeFigureCount: input.tree ?? 0,
          treeFigureMissingForExtractedFigures: input.treeMissing ?? true,
        },
      },
    },
  };
}

function row(input: {
  file: string;
  score?: number;
  alt?: number;
  toolDetails?: unknown[];
  error?: string;
}) {
  return {
    file: input.file,
    afterScore: input.error ? null : input.score ?? 59,
    afterGrade: input.error ? '?' : 'F',
    falsePositiveApplied: 0,
    durationMs: 1000,
    ...(input.error ? { error: input.error } : {}),
    categoryGap: {
      after: categories({
        alt_text: input.alt ?? 20,
        heading_structure: 100,
        reading_order: 90,
        table_markup: 100,
        pdf_ua_compliance: 79,
      }),
    },
    appliedTools: (input.toolDetails ?? []).map(details => ({
      toolName: 'set_figure_alt_text',
      outcome: 'applied',
      scoreBefore: 59,
      scoreAfter: 59,
      details: JSON.stringify(details),
    })),
  };
}

describe('outside figure/alt no-gain diagnostic', () => {
  it('detects full checker-visible alt coverage held down by the tree figure cap', () => {
    const report = buildFigureAltNoGainReport({
      sourceRun: '/tmp/baseline_report.json',
      report: {
        rows: [
          row({ file: 'candidate.pdf', toolDetails: [replay({ afterChecker: [6, 6], treeMissing: true })] }),
          row({ file: 'pass.pdf', score: 96, alt: 100 }),
        ],
      },
    });

    expect(report.decision.status).toBe('plan_tree_cap_scoring_calibration_proof');
    expect(report.rows[0]?.classification).toBe('checker_alt_full_tree_cap_candidate');
    expect(report.rows[0]?.scoringCalibrationCandidate).toBe(true);
    expect(report.rows[0]?.maxReplayCheckerVisibleFigureAltCount).toBe(6);
  });

  it('separates partial bounded alt batches from tree-cap candidates', () => {
    const report = buildFigureAltNoGainReport({
      sourceRun: '/tmp/baseline_report.json',
      report: {
        rows: [
          row({ file: 'partial.pdf', toolDetails: [replay({ beforeChecker: [6, 0], afterChecker: [6, 3], treeMissing: true })] }),
        ],
      },
    });

    expect(report.decision.status).toBe('keep_figure_alt_diagnostic_only');
    expect(report.rows[0]?.classification).toBe('checker_alt_partial_existing_bound');
  });

  it('flags applied alt writes that do not increase checker-visible coverage', () => {
    const report = buildFigureAltNoGainReport({
      sourceRun: '/tmp/baseline_report.json',
      report: {
        rows: [
          row({ file: 'wrong-ref.pdf', toolDetails: [replay({ beforeChecker: [6, 1], afterChecker: [6, 1], treeMissing: false, tree: 6 })] }),
        ],
      },
    });

    expect(report.decision.status).toBe('plan_target_discovery_proof');
    expect(report.rows[0]?.classification).toBe('alt_target_not_checker_counted');
    expect(report.rows[0]?.behaviorCandidate).toBe(true);
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-figure-alt-no-gain-'));
    try {
      const run = join(dir, 'baseline_report.json');
      await writeFile(run, JSON.stringify({
        inputDir: '/input',
        rows: [
          row({
            file: 'candidate.pdf',
            toolDetails: [replay({ afterChecker: [6, 6], treeMissing: true })],
          }),
        ],
      }, null, 2), 'utf8');
      const out = join(dir, 'out');
      const report = await writeFigureAltNoGainReport({ runPath: run, outDir: out });
      const json = JSON.parse(await readFile(join(out, 'outside-figure-alt-no-gain-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(out, 'outside-figure-alt-no-gain-diagnostic.md'), 'utf8');

      expect(report.inputDir).toBe('/input');
      expect(json).toMatchObject({ decision: { status: 'plan_tree_cap_scoring_calibration_proof' } });
      expect(md).toContain('Outside Figure/Alt No-Gain Diagnostic');
      expect(renderFigureAltNoGainMarkdown(report)).toContain('diagnostic/reporting artifact only');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

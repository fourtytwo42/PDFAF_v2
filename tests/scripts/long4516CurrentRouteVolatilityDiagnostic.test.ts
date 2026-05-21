import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLong4516CurrentRouteVolatilityReport,
  renderLong4516CurrentRouteVolatilityMarkdown,
  writeLong4516CurrentRouteVolatilityReport,
} from '../../scripts/long4516-current-route-volatility-diagnostic.js';

function categories(values: Record<string, number>) {
  return Object.entries(values).map(([key, score]) => ({ key, score, applicable: true }));
}

function replay(input: {
  beforeState?: string;
  afterState?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  beforeCategories?: Record<string, number>;
  afterCategories?: Record<string, number>;
  beforeFigures?: [number, number];
  afterFigures?: [number, number];
  treeMissing?: boolean;
  extracted?: number;
  tree?: number;
  targetRef?: string;
}) {
  return JSON.stringify({
    debug: {
      replayState: {
        stateSignatureBefore: input.beforeState ?? 'start',
        stateSignatureAfter: input.afterState ?? 'after',
        scoreBefore: input.scoreBefore ?? 43,
        scoreAfter: input.scoreAfter ?? 85,
        categoryScoresBefore: {
          heading_structure: 44,
          alt_text: 0,
          table_markup: 0,
          reading_order: 79,
          title_language: 0,
          pdf_ua_compliance: 38,
          ...(input.beforeCategories ?? {}),
        },
        categoryScoresAfter: {
          heading_structure: 78,
          alt_text: 80,
          table_markup: 100,
          reading_order: 79,
          title_language: 100,
          pdf_ua_compliance: 57,
          ...(input.afterCategories ?? {}),
        },
        detectionSignalsBefore: {
          checkerVisibleFigureCount: input.beforeFigures?.[0] ?? 18,
          checkerVisibleFigureAltCount: input.beforeFigures?.[1] ?? 0,
          extractedFigureCount: input.extracted ?? 21,
          treeFigureCount: input.tree ?? 13,
          treeFigureMissingForExtractedFigures: input.treeMissing ?? false,
          directCellUnderTableCount: 0,
          malformedTableCount: 0,
          misplacedCellCount: 0,
          orphanMcidCount: 64,
        },
        detectionSignalsAfter: {
          checkerVisibleFigureCount: input.afterFigures?.[0] ?? 18,
          checkerVisibleFigureAltCount: input.afterFigures?.[1] ?? 0,
          extractedFigureCount: input.extracted ?? 21,
          treeFigureCount: input.tree ?? 13,
          treeFigureMissingForExtractedFigures: input.treeMissing ?? false,
          directCellUnderTableCount: 0,
          malformedTableCount: 0,
          misplacedCellCount: 0,
          orphanMcidCount: 64,
        },
        ...(input.targetRef ? { targetRef: input.targetRef } : {}),
      },
    },
  });
}

function tool(input: {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: string;
}) {
  return {
    toolName: input.toolName ?? 'set_document_language',
    outcome: input.outcome ?? 'applied',
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore ?? 43,
    scoreAfter: input.scoreAfter ?? 85,
    delta: input.delta ?? ((input.scoreAfter ?? 85) - (input.scoreBefore ?? 43)),
    durationMs: 10,
    details: input.details ?? replay({ scoreAfter: input.scoreAfter ?? 85 }),
  };
}

function row(input: {
  file?: string;
  beforeScore?: number;
  afterScore?: number | null;
  afterGrade?: string | null;
  categories?: Record<string, number>;
  tools?: ReturnType<typeof tool>[];
  error?: string;
}) {
  const afterScore = 'afterScore' in input ? input.afterScore ?? null : 85;
  const afterGrade = 'afterGrade' in input ? input.afterGrade ?? null : 'B';
  return {
    file: input.file ?? '4516.pdf',
    beforeScore: input.beforeScore ?? 43,
    beforeGrade: 'F',
    afterScore,
    afterGrade,
    afterDeterministicScore: afterScore,
    afterDeterministicGrade: afterGrade,
    durationMs: 1000,
    falsePositiveApplied: 0,
    ...(input.error ? { error: input.error } : {}),
    categoryGap: {
      after: categories(input.categories ?? {
        heading_structure: 78,
        alt_text: 80,
        table_markup: 100,
        reading_order: 79,
        title_language: 100,
        pdf_ua_compliance: 57,
      }),
    },
    appliedTools: input.tools ?? [tool({})],
  };
}

describe('long4516 current route volatility diagnostic', () => {
  it('classifies repeated current low routes as an acceptance blocker, not a tree-cap candidate', () => {
    const referenceDetails = replay({ beforeState: 'same', afterState: 'good', scoreAfter: 85 });
    const lowDetails = replay({
      beforeState: 'same',
      afterState: 'low',
      scoreAfter: 55,
      afterCategories: { alt_text: 20, table_markup: 0, heading_structure: 44 },
      afterFigures: [19, 4],
      treeMissing: false,
    });
    const report = buildLong4516CurrentRouteVolatilityReport({
      generatedAt: '2026-05-21T00:00:00.000Z',
      referencePath: '/reference.json',
      currentPath: '/current.json',
      repeatPath: '/repeat.json',
      referenceReport: {
        rows: [row({ tools: [tool({ scoreAfter: 85, details: referenceDetails })] })],
      },
      currentReport: {
        rows: [row({
          afterScore: 59,
          afterGrade: 'F',
          categories: {
            heading_structure: 78,
            alt_text: 0,
            table_markup: 100,
            reading_order: 79,
            title_language: 100,
            pdf_ua_compliance: 57,
          },
          tools: [tool({ scoreAfter: 51, details: lowDetails })],
        })],
      },
      repeatReport: {
        rows: [row({
          afterScore: 55,
          afterGrade: 'F',
          categories: {
            heading_structure: 44,
            alt_text: 20,
            table_markup: 0,
            reading_order: 79,
            title_language: 100,
            pdf_ua_compliance: 50,
          },
          tools: [tool({ scoreAfter: 55, details: lowDetails })],
        })],
      },
    });

    expect(report.classification).toBe('repeatable_low_route_current_blocker');
    expect(report.decision.status).toBe('park_tree_cap_acceptance_on_4516_route_debt');
    expect(report.evidence.anyTreeCapScoringCandidate).toBe(false);
    expect(report.evidence.referenceLooksAnalyzerOptimistic).toBe(true);
    expect(report.evidence.sharedReferenceRepeatInitialState).toBe(true);
  });

  it('separates hard timeouts from score-route regressions', () => {
    const report = buildLong4516CurrentRouteVolatilityReport({
      referencePath: '/reference.json',
      currentPath: '/current.json',
      repeatPath: '/repeat.json',
      referenceReport: { rows: [row({ afterScore: 85, afterGrade: 'B' })] },
      currentReport: {
        rows: [row({ afterScore: null, afterGrade: null, error: 'The operation was aborted due to timeout' })],
      },
      repeatReport: { rows: [row({ afterScore: 55, afterGrade: 'F' })] },
    });

    expect(report.classification).toBe('known_runtime_timeout_debt');
    expect(report.decision.status).toBe('park_acceptance_on_runtime_timeout_debt');
  });

  it('detects floor-safe current score-moving states as checkpoint investigation candidates', () => {
    const report = buildLong4516CurrentRouteVolatilityReport({
      referencePath: '/reference.json',
      currentPath: '/current.json',
      repeatPath: '/repeat.json',
      referenceReport: { rows: [row({ afterScore: 85, afterGrade: 'B' })] },
      currentReport: {
        rows: [row({
          afterScore: 59,
          afterGrade: 'F',
          tools: [tool({ scoreBefore: 51, scoreAfter: 89, details: replay({ scoreBefore: 51, scoreAfter: 89 }) })],
        })],
      },
      repeatReport: { rows: [row({ afterScore: 55, afterGrade: 'F' })] },
    });

    expect(report.classification).toBe('checkpoint_return_candidate');
    expect(report.decision.status).toBe('investigate_checkpoint_return');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-long4516-current-'));
    try {
      const referencePath = join(dir, 'reference.json');
      const currentPath = join(dir, 'current.json');
      const repeatPath = join(dir, 'repeat.json');
      await writeFile(referencePath, JSON.stringify({ rows: [row({ afterScore: 85, afterGrade: 'B' })] }), 'utf8');
      await writeFile(currentPath, JSON.stringify({
        rows: [row({ afterScore: 59, afterGrade: 'F', tools: [tool({ scoreAfter: 59 })] })],
      }), 'utf8');
      await writeFile(repeatPath, JSON.stringify({
        rows: [row({ afterScore: 55, afterGrade: 'F', tools: [tool({ scoreAfter: 55 })] })],
      }), 'utf8');

      const outDir = join(dir, 'out');
      const report = await writeLong4516CurrentRouteVolatilityReport({
        referencePath,
        currentPath,
        repeatPath,
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'long4516-current-route-volatility-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'long4516-current-route-volatility-diagnostic.md'), 'utf8');

      expect(report.classification).toBe('repeatable_low_route_current_blocker');
      expect(json).toMatchObject({ decision: { status: 'park_tree_cap_acceptance_on_4516_route_debt' } });
      expect(md).toContain('Long-4516 Current Route Volatility Diagnostic');
      expect(renderLong4516CurrentRouteVolatilityMarkdown(report)).toContain('Diagnostic-only comparison');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

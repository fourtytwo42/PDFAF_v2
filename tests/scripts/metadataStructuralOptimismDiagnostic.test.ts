import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMetadataStructuralOptimismReport,
  renderMetadataStructuralOptimismMarkdown,
  writeMetadataStructuralOptimismReport,
} from '../../scripts/metadata-structural-optimism-diagnostic.js';

function categories(values: Record<string, number>) {
  return Object.entries(values).map(([key, score]) => ({ key, score, applicable: true }));
}

function metadataDetails(input: {
  scoreBefore?: number;
  scoreAfter?: number;
  titleBefore?: number;
  titleAfter?: number;
  before?: Record<string, number>;
  after?: Record<string, number>;
}) {
  return JSON.stringify({
    debug: {
      replayState: {
        scoreBefore: input.scoreBefore ?? 43,
        scoreAfter: input.scoreAfter ?? 85,
        categoryScoresBefore: {
          title_language: input.titleBefore ?? 0,
          alt_text: 0,
          table_markup: 0,
          heading_structure: 44,
          reading_order: 79,
          pdf_ua_compliance: 38,
          ...(input.before ?? {}),
        },
        categoryScoresAfter: {
          title_language: input.titleAfter ?? 100,
          alt_text: 80,
          table_markup: 100,
          heading_structure: 78,
          reading_order: 79,
          pdf_ua_compliance: 57,
          ...(input.after ?? {}),
        },
      },
    },
  });
}

function metadataTools(details: string) {
  return [
    {
      toolName: 'set_document_language',
      outcome: 'applied',
      stage: 1,
      scoreBefore: 43,
      scoreAfter: 85,
      details,
    },
    {
      toolName: 'set_document_title',
      outcome: 'applied',
      stage: 1,
      scoreBefore: 43,
      scoreAfter: 85,
      details,
    },
  ];
}

function row(input: {
  file?: string;
  score?: number;
  grade?: string;
  toolDetails?: string;
  categoriesAfter?: Record<string, number>;
}) {
  return {
    file: input.file ?? '4516-report.pdf',
    afterScore: input.score ?? 85,
    afterGrade: input.grade ?? 'B',
    falsePositiveApplied: 0,
    durationMs: 1000,
    categoryGap: {
      after: categories(input.categoriesAfter ?? {
        title_language: 100,
        alt_text: 80,
        table_markup: 100,
        heading_structure: 78,
        reading_order: 79,
        pdf_ua_compliance: 57,
      }),
    },
    appliedTools: input.toolDetails ? metadataTools(input.toolDetails) : [],
  };
}

describe('metadata structural optimism diagnostic', () => {
  it('classifies reference metadata-only structural optimism when current/repeat stay low', () => {
    const report = buildMetadataStructuralOptimismReport({
      generatedAt: '2026-05-21T00:00:00.000Z',
      referencePath: '/reference.json',
      currentPath: '/current.json',
      repeatPath: '/repeat.json',
      referenceReport: {
        rows: [row({ toolDetails: metadataDetails({}) })],
      },
      currentReport: {
        rows: [row({
          score: 59,
          grade: 'F',
          toolDetails: metadataDetails({
            scoreAfter: 51,
            after: { alt_text: 0, table_markup: 0, heading_structure: 44 },
          }),
          categoriesAfter: {
            title_language: 100,
            alt_text: 0,
            table_markup: 0,
            heading_structure: 44,
            reading_order: 79,
            pdf_ua_compliance: 50,
          },
        })],
      },
      repeatReport: {
        rows: [row({
          file: '4516.pdf',
          score: 55,
          grade: 'F',
          toolDetails: metadataDetails({
            scoreAfter: 51,
            after: { alt_text: 0, table_markup: 0, heading_structure: 44 },
          }),
        })],
      },
    });

    expect(report.decision.status).toBe('document_stricter_score_candidate');
    expect(report.summary.referenceOptimismRows).toBe(1);
    expect(report.rows[0]?.classification).toBe('reference_metadata_structural_optimism');
    expect(report.rows[0]?.reference.metadataStage.gainKeys).toEqual(
      expect.arrayContaining(['alt_text', 'table_markup', 'heading_structure']),
    );
  });

  it('separates current metadata-only structural drop volatility', () => {
    const report = buildMetadataStructuralOptimismReport({
      referencePath: '/reference.json',
      currentPath: '/current.json',
      referenceReport: {
        rows: [row({
          file: 'control-1000.pdf',
          score: 80,
          toolDetails: metadataDetails({
            scoreAfter: 80,
            before: { alt_text: 80, table_markup: 100 },
            after: { alt_text: 80, table_markup: 100 },
          }),
        })],
      },
      currentReport: {
        rows: [row({
          file: 'control-1000.pdf',
          score: 51,
          grade: 'F',
          toolDetails: metadataDetails({
            scoreBefore: 76,
            scoreAfter: 51,
            before: { alt_text: 80, table_markup: 100 },
            after: { alt_text: 0, table_markup: 0 },
          }),
        })],
      },
    });

    expect(report.decision.status).toBe('metadata_volatility_behavior_candidate');
    expect(report.summary.currentDropVolatilityRows).toBe(1);
    expect(report.rows[0]?.classification).toBe('current_metadata_structural_drop_volatility');
  });

  it('keeps stable metadata stages diagnostic-only', () => {
    const report = buildMetadataStructuralOptimismReport({
      referencePath: '/reference.json',
      currentPath: '/current.json',
      referenceReport: {
        rows: [row({
          file: 'stable-1000.pdf',
          score: 80,
          toolDetails: metadataDetails({
            scoreBefore: 72,
            scoreAfter: 80,
            before: { alt_text: 80, table_markup: 100, heading_structure: 78 },
            after: { alt_text: 80, table_markup: 100, heading_structure: 78 },
          }),
        })],
      },
      currentReport: {
        rows: [row({
          file: 'stable-1000.pdf',
          score: 80,
          toolDetails: metadataDetails({
            scoreBefore: 72,
            scoreAfter: 80,
            before: { alt_text: 80, table_markup: 100, heading_structure: 78 },
            after: { alt_text: 80, table_markup: 100, heading_structure: 78 },
          }),
        })],
      },
    });

    expect(report.decision.status).toBe('keep_diagnostic_only');
    expect(report.rows[0]?.classification).toBe('metadata_stage_stable_or_absent');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-metadata-optimism-'));
    try {
      const referencePath = join(dir, 'reference.json');
      const currentPath = join(dir, 'current.json');
      await writeFile(referencePath, JSON.stringify({ rows: [row({ toolDetails: metadataDetails({}) })] }), 'utf8');
      await writeFile(currentPath, JSON.stringify({
        rows: [row({
          score: 59,
          grade: 'F',
          toolDetails: metadataDetails({
            scoreAfter: 51,
            after: { alt_text: 0, table_markup: 0, heading_structure: 44 },
          }),
        })],
      }), 'utf8');

      const outDir = join(dir, 'out');
      const report = await writeMetadataStructuralOptimismReport({
        referencePath,
        currentPath,
        repeatPath: null,
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'metadata-structural-optimism-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'metadata-structural-optimism-diagnostic.md'), 'utf8');

      expect(report.summary.referenceOptimismRows).toBe(1);
      expect(json).toMatchObject({ decision: { status: 'document_stricter_score_candidate' } });
      expect(md).toContain('Metadata Structural Optimism Diagnostic');
      expect(renderMetadataStructuralOptimismMarkdown(report)).toContain('Read-only diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

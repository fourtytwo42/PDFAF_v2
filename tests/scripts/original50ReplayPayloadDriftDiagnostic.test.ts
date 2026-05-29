import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  writeReplayPayloadDriftDiagnostic,
} from '../../scripts/original50-replay-payload-drift-diagnostic.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function details(input: {
  before: string;
  after: string;
  scoreBefore: number;
  scoreAfter: number;
  categoryBefore: Record<string, number>;
  categoryAfter?: Record<string, number>;
  detectionBefore?: Record<string, number | boolean>;
  detectionAfter?: Record<string, number | boolean>;
  note?: string;
  pac?: string[];
}) {
  return JSON.stringify({
    note: input.note,
    pacRuleRegressions: (input.pac ?? []).map(ruleId => ({ ruleId })),
    debug: {
      replayState: {
        stateSignatureBefore: input.before,
        stateSignatureAfter: input.after,
        scoreBefore: input.scoreBefore,
        scoreAfter: input.scoreAfter,
        categoryScoresBefore: input.categoryBefore,
        categoryScoresAfter: input.categoryAfter ?? input.categoryBefore,
        detectionSignalsBefore: input.detectionBefore ?? {},
        detectionSignalsAfter: input.detectionAfter ?? input.detectionBefore ?? {},
      },
    },
  });
}

function tool(input: {
  stage?: number;
  toolName?: string;
  outcome?: string;
  before: string;
  after: string;
  scoreBefore?: number;
  scoreAfter?: number;
  categoryBefore: Record<string, number>;
  categoryAfter?: Record<string, number>;
  detectionBefore?: Record<string, number | boolean>;
  detectionAfter?: Record<string, number | boolean>;
}) {
  return {
    stage: input.stage ?? 1,
    toolName: input.toolName ?? 'set_document_language',
    outcome: input.outcome ?? 'applied',
    scoreBefore: input.scoreBefore ?? 59,
    scoreAfter: input.scoreAfter ?? 59,
    details: details({
      before: input.before,
      after: input.after,
      scoreBefore: input.scoreBefore ?? 59,
      scoreAfter: input.scoreAfter ?? 59,
      categoryBefore: input.categoryBefore,
      categoryAfter: input.categoryAfter,
      detectionBefore: input.detectionBefore,
      detectionAfter: input.detectionAfter,
    }),
  };
}

function row(id: string, score: number, tools: ReturnType<typeof tool>[]) {
  return {
    id,
    file: `${id}.pdf`,
    beforeScore: 59,
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
    falsePositiveApplied: 0,
    afterCategories: [
      category('heading_structure', score >= 90 ? 95 : 60),
      category('alt_text', score >= 90 ? 100 : 0),
      category('table_markup', 79),
      category('reading_order', 100),
      category('pdf_ua_compliance', 67),
    ],
    appliedTools: tools,
  };
}

async function writeReport(path: string, rows: unknown[]) {
  await writeFile(path, JSON.stringify({ rows }), 'utf8');
}

describe('original50 replay payload drift diagnostic', () => {
  it('classifies repeat-low replay payload count drift', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-replay-payload-'));
    try {
      const r1 = join(dir, 'r1.json');
      const r2 = join(dir, 'r2.json');
      const ref = join(dir, 'ref.json');
      const categories = { heading_structure: 60, alt_text: 0, table_markup: 79, reading_order: 100 };
      await writeReport(r1, [row('4680', 59, [tool({
        before: 'low-a',
        after: 'low-a2',
        categoryBefore: categories,
        detectionBefore: { extractedHeadingCount: 19, extractedFigureCount: 10, orphanMcidCount: 64 },
      })])]);
      await writeReport(r2, [row('4680', 59, [tool({
        before: 'low-b',
        after: 'low-b2',
        categoryBefore: categories,
        detectionBefore: { extractedHeadingCount: 18, extractedFigureCount: 8, orphanMcidCount: 64 },
      })])]);
      await writeReport(ref, [row('4680', 98, [tool({
        before: 'high-a',
        after: 'high-a2',
        categoryBefore: categories,
        detectionBefore: { extractedHeadingCount: 20, extractedFigureCount: 9, orphanMcidCount: 64 },
      })])]);

      const diagnostic = await writeReplayPayloadDriftDiagnostic({
        reports: [{ label: 'r1', path: r1 }, { label: 'r2', path: r2 }, { label: 'high', path: ref }],
        rows: ['4680'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('replay_payload_count_drift');
      expect(diagnostic.decision.status).toBe('diagnose_replay_payload_or_native_analyzer_before_behavior');
      expect(diagnostic.rows[0]?.lowFirstBeforeDetectionDeltas.map(delta => delta.key)).toContain('extractedFigureCount');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('classifies metadata-stage after-state divergence when a high run shares a low initial signature', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-replay-metadata-'));
    try {
      const r1 = join(dir, 'r1.json');
      const r2 = join(dir, 'r2.json');
      const ref = join(dir, 'ref.json');
      const before = { heading_structure: 43, alt_text: 0, table_markup: 6, reading_order: 100 };
      await writeReport(r1, [row('4683', 59, [tool({
        outcome: 'rejected',
        before: 'low-a',
        after: 'after-a',
        scoreBefore: 48,
        scoreAfter: 59,
        categoryBefore: before,
        categoryAfter: { heading_structure: 78, alt_text: 0, table_markup: 100, reading_order: 96 },
        detectionBefore: { extractedHeadingCount: 22, extractedFigureCount: 15 },
        detectionAfter: { extractedHeadingCount: 0, extractedFigureCount: 3 },
      })])]);
      await writeReport(r2, [row('4683', 59, [tool({
        outcome: 'applied',
        before: 'shared',
        after: 'after-b',
        scoreBefore: 48,
        scoreAfter: 59,
        categoryBefore: before,
        categoryAfter: { heading_structure: 85, alt_text: 0, table_markup: 100, reading_order: 100 },
        detectionBefore: { extractedHeadingCount: 20, extractedFigureCount: 14 },
        detectionAfter: { extractedHeadingCount: 2, extractedFigureCount: 4 },
      })])]);
      await writeReport(ref, [row('4683', 99, [tool({
        outcome: 'applied',
        before: 'shared',
        after: 'after-ref',
        scoreBefore: 48,
        scoreAfter: 59,
        categoryBefore: before,
        categoryAfter: { heading_structure: 85, alt_text: 0, table_markup: 100, reading_order: 100 },
        detectionBefore: { extractedHeadingCount: 20, extractedFigureCount: 14 },
        detectionAfter: { extractedHeadingCount: 2, extractedFigureCount: 4 },
      })])]);

      const diagnostic = await writeReplayPayloadDriftDiagnostic({
        reports: [{ label: 'r1', path: r1 }, { label: 'r2', path: r2 }, { label: 'high', path: ref }],
        rows: ['4683'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('metadata_stage_after_state_divergence');
      expect(diagnostic.rows[0]?.highRunsSharingLowInitialSignature).toEqual(['high']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes JSON and Markdown for a family-specific stable route candidate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-replay-family-'));
    try {
      const low = join(dir, 'low.json');
      const ref = join(dir, 'ref.json');
      const categories = { heading_structure: 44, alt_text: 20, table_markup: 79, reading_order: 79 };
      const detection = { extractedHeadingCount: 46, extractedFigureCount: 12, checkerVisibleFigureCount: 17 };
      await writeReport(low, [row('4754', 59, [tool({
        before: 'shared',
        after: 'low-after',
        categoryBefore: categories,
        categoryAfter: categories,
        detectionBefore: detection,
        detectionAfter: detection,
      })])]);
      await writeReport(ref, [row('4754', 94, [tool({
        before: 'shared',
        after: 'high-after',
        categoryBefore: categories,
        categoryAfter: categories,
        detectionBefore: detection,
        detectionAfter: detection,
      })])]);

      const outDir = join(dir, 'out');
      const diagnostic = await writeReplayPayloadDriftDiagnostic({
        reports: [{ label: 'low', path: low }, { label: 'high', path: ref }],
        rows: ['4754'],
        outDir,
        targetScore: 93,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-replay-payload-drift-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-replay-payload-drift-diagnostic.md'), 'utf8');

      expect(diagnostic.rows[0]?.classification).toBe('family_specific_after_stable_route');
      expect(json).toMatchObject({ summary: { rowCount: 1 } });
      expect(md).toContain('Original-50 Replay Payload Drift Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { initSchema } from '../../src/db/schema.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';
import { remediatePdf } from '../../src/services/remediation/orchestrator.js';
import { createPlaybookStore } from '../../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../../src/services/learning/toolOutcomes.js';
import { buildFailureSignature } from '../../src/services/learning/failureSignature.js';

async function barePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('Playbook fixture', { x: 36, y: 100, size: 14 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('playbook fast path (remediatePdf)', () => {
  let db: Database.Database;
  let playbookStore: ReturnType<typeof createPlaybookStore>;
  let toolOutcomeStore: ReturnType<typeof createToolOutcomeStore>;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    playbookStore = createPlaybookStore(db);
    toolOutcomeStore = createToolOutcomeStore(db);
  });

  it('learns and replays structural synthesis and heading normalization tools', async () => {
    const publicPath = '/home/hendo420/pdfaf-public-cycles/set03/input/15-AnnualReport2007.pdf';
    const analyzed = await analyzePdf(publicPath, '15-AnnualReport2007.pdf', { bypassCache: true });
    const { result, snapshot } = analyzed;
    const sig = buildFailureSignature(result, snapshot);
    const applied = [
      { toolName: 'set_document_language' as const, stage: 1, round: 1, scoreBefore: result.score, scoreAfter: result.score + 20, delta: 20, outcome: 'applied' as const },
      { toolName: 'set_document_title' as const, stage: 1, round: 1, scoreBefore: result.score, scoreAfter: result.score + 20, delta: 20, outcome: 'applied' as const },
      { toolName: 'bootstrap_struct_tree' as const, stage: 2, round: 1, scoreBefore: result.score, scoreAfter: result.score + 20, delta: 20, outcome: 'applied' as const },
      { toolName: 'synthesize_basic_structure_from_layout' as const, stage: 2, round: 1, scoreBefore: result.score, scoreAfter: result.score + 20, delta: 20, outcome: 'applied' as const },
      { toolName: 'normalize_heading_hierarchy' as const, stage: 4, round: 1, scoreBefore: result.score, scoreAfter: result.score + 20, delta: 20, outcome: 'applied' as const },
    ];
    playbookStore.learnFromSuccess(result, snapshot, applied, 20);
    playbookStore.learnFromSuccess(result, snapshot, applied, 20);
    playbookStore.learnFromSuccess(result, snapshot, applied, 20);
    const learned = playbookStore.findActive(sig);
    expect(learned).not.toBeNull();
    expect(learned?.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'bootstrap_struct_tree',
      'synthesize_basic_structure_from_layout',
      'normalize_heading_hierarchy',
    ]);

    const pdf = await readFile(publicPath);
    const out = await remediatePdf(pdf, '15-AnnualReport2007.pdf', result, snapshot, {
      playbookStore,
      toolOutcomeStore,
      maxRounds: 1,
    });
    expect(out.remediation.rounds[0]?.source).toBe('playbook');
  });

  it('replays an active playbook and tags the round as playbook', async () => {
    const pdf = await barePdfBuffer();
    const path = join(tmpdir(), `pdfaf-pb-${Date.now()}.pdf`);
    await writeFile(path, pdf);
    try {
      let analyzed: Awaited<ReturnType<typeof analyzePdf>>;
      try {
        analyzed = await analyzePdf(path, 'fixture-playbook.pdf');
      } catch (e) {
        if ((e as { statusCode?: number }).statusCode === 429) {
          console.log('[integration] playbook test skipped — at capacity');
          return;
        }
        throw e;
      }
      const { result, snapshot } = analyzed;
      const sig = buildFailureSignature(result, snapshot);
      const applied = [
        {
          toolName: 'set_document_title' as const,
          stage: 1,
          round: 1,
          scoreBefore: result.score,
          scoreAfter: result.score,
          delta: 0,
          outcome: 'applied' as const,
        },
      ];
      playbookStore.learnFromSuccess(result, snapshot, applied, 6);
      playbookStore.learnFromSuccess(result, snapshot, applied, 6);
      playbookStore.learnFromSuccess(result, snapshot, applied, 6);
      expect(playbookStore.findActive(sig)).not.toBeNull();

      const out = await remediatePdf(pdf, 'fixture-playbook.pdf', result, snapshot, {
        playbookStore,
        toolOutcomeStore,
        maxRounds: 1,
      });
      expect(out.remediation.rounds[0]?.source).toBe('playbook');
    } finally {
      await unlink(path).catch(() => {});
    }
  }, 120_000);
});

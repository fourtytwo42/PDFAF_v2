import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../../src/db/schema.js';
import { createToolOutcomeStore } from '../../src/services/learning/toolOutcomes.js';

describe('toolOutcomes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
  });

  it('returns optimistic default when fewer than 3 outcomes exist', () => {
    const store = createToolOutcomeStore(db);
    const r = store.getReliability('set_document_title', 'native_untagged');
    expect(r.attempts).toBe(0);
    expect(r.successRate).toBe(0.85);
  });

  it('returns actual success rate after enough outcomes', () => {
    const store = createToolOutcomeStore(db);
    for (let i = 0; i < 10; i++) {
      store.record({
        toolName: 'set_document_title',
        pdfClass: 'native_untagged',
        outcome: i < 7 ? 'applied' : 'no_effect',
        scoreBefore: 50,
        scoreAfter: i < 7 ? 55 : 50,
      });
    }
    const r = store.getReliability('set_document_title', 'native_untagged');
    expect(r.attempts).toBe(10);
    expect(r.successRate).toBeCloseTo(0.7, 5);
  });

  it('getReliabilitySummary lists recorded tool/class pairs', () => {
    const store = createToolOutcomeStore(db);
    store.record({
      toolName: 'set_document_language',
      pdfClass: 'native_untagged',
      outcome: 'applied',
      scoreBefore: 40,
      scoreAfter: 45,
    });
    const sum = store.getReliabilitySummary();
    expect(sum.some(x => x.toolName === 'set_document_language' && x.pdfClass === 'native_untagged')).toBe(true);
  });
});

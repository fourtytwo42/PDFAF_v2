import { describe, it, expect } from 'vitest';
import { score } from '../src/services/scorer/scorer.js';
import type { DocumentSnapshot } from '../src/types.js';

function makeSnap(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 5,
    textByPage: Array(5).fill('x'),
    textCharCount: 5,
    imageOnlyPageCount: 0,
    metadata: { title: 'T', language: 'en-US', author: '', subject: '' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'T',
    headings: [{ level: 1, text: 'H', page: 0 }],
    figures: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

const META = { id: 't', filename: 't.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

describe('pdf_ua_compliance listStructureAudit', () => {
  it('adds a failing checklist item when list violations meet threshold', () => {
    const snap = makeSnap({
      listStructureAudit: {
        listCount: 0,
        listItemCount: 1,
        listItemMisplacedCount: 1,
        lblBodyMisplacedCount: 0,
        listsWithoutItems: 0,
      },
    });
    const cat = score(snap, META).categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(cat.findings.some(f => f.message.includes('List structure audit'))).toBe(true);
    expect(cat.score).toBeLessThan(100);
  });

  it('passes list check when audit is clean', () => {
    const snapClean = makeSnap({
      listStructureAudit: {
        listCount: 1,
        listItemCount: 1,
        listItemMisplacedCount: 0,
        lblBodyMisplacedCount: 0,
        listsWithoutItems: 0,
      },
    });
    const snapNoAudit = makeSnap({ listStructureAudit: undefined });
    const rClean = score(snapClean, META).categories.find(c => c.key === 'pdf_ua_compliance')!;
    const rNo = score(snapNoAudit, META).categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(rClean.findings.some(f => f.message.includes('List structure audit'))).toBe(false);
    expect(rNo.findings.some(f => f.message.includes('List structure audit'))).toBe(false);
  });
});

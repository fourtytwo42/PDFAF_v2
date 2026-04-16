import { describe, expect, it } from 'vitest';
import { score } from '../src/services/scorer/scorer.js';
import { pdfafSignalCoversAdobeFailure } from '../src/services/compliance/adobeAccreportPdfafSignals.js';
import type { DocumentSnapshot } from '../src/types.js';
import { PDF_UA_PATH_PAINT_OUTSIDE_MC_FAIL_THRESHOLD } from '../src/config.js';

const META = { id: 't', filename: 'x.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function baseSnap(over: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 20,
    textByPage: Array(20).fill('hello'),
    textCharCount: 100,
    imageOnlyPageCount: 0,
    metadata: { title: 'T', language: 'en', author: '', subject: '' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
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
    ...over,
  };
}

describe('pdfafSignalCoversAdobeFailure', () => {
  it('TaggedCont: accepts orphan MCID count', () => {
    const snap = baseSnap({
      taggedContentAudit: {
        orphanMcidCount: 2,
        mcidTextSpanCount: 4,
        suspectedPathPaintOutsideMc: 0,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('TaggedCont', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('orphanMcidCount'))).toBe(true);
  });

  it('TaggedCont: rejects clean taggedContentAudit', () => {
    const snap = baseSnap({
      taggedContentAudit: {
        orphanMcidCount: 0,
        mcidTextSpanCount: 1,
        suspectedPathPaintOutsideMc: 0,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('TaggedCont', snap, analysis);
    expect(r.ok).toBe(false);
  });

  it('TaggedCont: accepts path paint above threshold', () => {
    const snap = baseSnap({
      taggedContentAudit: {
        orphanMcidCount: 0,
        mcidTextSpanCount: 1,
        suspectedPathPaintOutsideMc: PDF_UA_PATH_PAINT_OUTSIDE_MC_FAIL_THRESHOLD + 5,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('TaggedCont', snap, analysis);
    expect(r.ok).toBe(true);
  });

  it('OtherAltText: accepts nonLinkAnnotationsMissingContents', () => {
    const snap = baseSnap({
      figures: [],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 2,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('OtherAltText', snap, analysis);
    expect(r.ok).toBe(true);
  });

  it('Bookmarks: long doc without outlines', () => {
    const snap = baseSnap({
      pageCount: 20,
      bookmarks: [],
      headings: [{ level: 1, text: 'Only', page: 0 }],
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('Bookmarks', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('bookmarks.score') || m.includes('longDoc'))).toBe(true);
  });

  // ── ListItems / LblLBody ────────────────────────────────────────────────────

  it('ListItems: accepts listStructureAudit with misplaced LI', () => {
    const snap = baseSnap({
      listStructureAudit: {
        listCount: 3,
        listItemCount: 8,
        listItemMisplacedCount: 2,
        lblBodyMisplacedCount: 0,
        listsWithoutItems: 0,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('ListItems', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('listItemMisplacedCount'))).toBe(true);
  });

  it('ListItems: accepts listStructureAudit with any list count (scanned proxy)', () => {
    const snap = baseSnap({
      pdfClass: 'scanned',
      imageToTextRatio: 0.9,
      listStructureAudit: {
        listCount: 0,
        listItemCount: 0,
        listItemMisplacedCount: 0,
        lblBodyMisplacedCount: 0,
        listsWithoutItems: 0,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('ListItems', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('scanned'))).toBe(true);
  });

  it('LblLBody: accepts listStructureAudit with misplaced Lbl/LBody', () => {
    const snap = baseSnap({
      listStructureAudit: {
        listCount: 2,
        listItemCount: 6,
        listItemMisplacedCount: 0,
        lblBodyMisplacedCount: 4,
        listsWithoutItems: 0,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('LblLBody', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('lblBodyMisplacedCount'))).toBe(true);
  });

  it('LblLBody: rejects when no list data and no proxy', () => {
    const snap = baseSnap({
      listStructureAudit: {
        listCount: 0,
        listItemCount: 0,
        listItemMisplacedCount: 0,
        lblBodyMisplacedCount: 0,
        listsWithoutItems: 0,
      },
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('LblLBody', snap, analysis);
    expect(r.ok).toBe(false);
  });

  // ── Headings nesting ─────────────────────────────────────────────────────────

  it('Headings: accepts heading_structure score < 100 with skipped levels', () => {
    const snap = baseSnap({
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 3, text: 'B', page: 1 },  // skipped H2
      ],
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('Headings', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('heading_structure'))).toBe(true);
  });

  // ── Table structure depth ────────────────────────────────────────────────────

  it('TableRows: accepts tables with misplaced cells (no TR)', () => {
    const snap = baseSnap({
      tables: [{
        hasHeaders: false,
        headerCount: 0,
        totalCells: 4,
        page: 0,
        rowCount: 0,
        cellsMisplacedCount: 4,
        irregularRows: 0,
      }],
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('TableRows', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('cellsMisplaced') || m.includes('noTRChildren'))).toBe(true);
  });

  it('RegularTable: accepts tables with irregular row counts', () => {
    const snap = baseSnap({
      tables: [{
        hasHeaders: true,
        headerCount: 2,
        totalCells: 8,
        page: 0,
        rowCount: 3,
        cellsMisplacedCount: 0,
        irregularRows: 2,
      }],
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('RegularTable', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('irregularRows'))).toBe(true);
  });

  // ── DocTitle ViewerPreferences ───────────────────────────────────────────────

  it('DocTitle: accepted by title_language score < 100 when title is missing', () => {
    const snap = baseSnap({
      metadata: { title: '', language: 'en' },
      structTitle: '',
    });
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('DocTitle', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.matched.some(m => m.includes('title') || m.includes('Title'))).toBe(true);
  });

  it('marks LogicalRO as unmapped (no false failure)', () => {
    const snap = baseSnap();
    const analysis = score(snap, META);
    const r = pdfafSignalCoversAdobeFailure('LogicalRO', snap, analysis);
    expect(r.ok).toBe(true);
    expect(r.unmapped).toBe(true);
  });

  it('lenient mode records parity gap when score is high but TaggedCont has no orphan signal', () => {
    const snap = baseSnap({
      taggedContentAudit: {
        orphanMcidCount: 0,
        mcidTextSpanCount: 1,
        suspectedPathPaintOutsideMc: 0,
      },
    });
    const analysis = score(snap, META);
    const strict = pdfafSignalCoversAdobeFailure('TaggedCont', snap, analysis);
    expect(strict.ok).toBe(false);

    const lenient = pdfafSignalCoversAdobeFailure('TaggedCont', snap, analysis, { lenientWhenScoreAtLeast: 0 });
    expect(lenient.ok).toBe(true);
    expect(lenient.parityGap).toBe(true);
  });
});

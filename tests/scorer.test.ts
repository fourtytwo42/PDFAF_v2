import { describe, it, expect } from 'vitest';
import { score, SCORING_WEIGHTS } from '../src/services/scorer/scorer.js';
import type { DocumentSnapshot } from '../src/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnap(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 20,
    textByPage: Array(20).fill('Some text content here'),
    textCharCount: 20 * 22,
    imageOnlyPageCount: 0,
    metadata: { title: 'Test Doc', language: 'en-US', author: 'Author', subject: 'Test' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Test Doc',
    headings: [
      { level: 1, text: 'Introduction', page: 0 },
      { level: 2, text: 'Background',  page: 2 },
      { level: 2, text: 'Methods',     page: 5 },
      { level: 1, text: 'Results',     page: 8 },
      { level: 2, text: 'Discussion',  page: 12 },
      { level: 1, text: 'Conclusion',  page: 16 },
    ],
    figures: [],
    tables: [],
    fonts: [{ name: 'Calibri', isEmbedded: true, hasUnicode: true }],
    bookmarks: [
      { title: 'Introduction', level: 1 },
      { title: 'Background',   level: 2 },
      { title: 'Results',      level: 1 },
    ],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

const META = { id: 'test-1', filename: 'test.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 100 };

// ─── Weight integrity ─────────────────────────────────────────────────────────

describe('scoring weights', () => {
  it('sum to exactly 1.0', () => {
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('has 11 categories', () => {
    expect(Object.keys(SCORING_WEIGHTS)).toHaveLength(11);
  });
});

// ─── N/A redistribution ───────────────────────────────────────────────────────

describe('N/A weight redistribution', () => {
  it('redistributes bookmark weight when pageCount < 10', () => {
    const snap = makeSnap({ pageCount: 5, textByPage: Array(5).fill('text'), headings: [] });
    const result = score(snap, META);
    const bookmarks = result.categories.find(c => c.key === 'bookmarks')!;
    expect(bookmarks.applicable).toBe(false);
    // All applicable categories should have weight > their base
    const applicable = result.categories.filter(c => c.applicable);
    const totalApplicableWeight = applicable.reduce((s, c) => s + c.weight, 0);
    expect(totalApplicableWeight).toBeCloseTo(1.0, 3);
  });

  it('redistributes form weight when no form fields', () => {
    const snap = makeSnap({ formFields: [], formFieldsFromPdfjs: [] });
    const result = score(snap, META);
    const forms = result.categories.find(c => c.key === 'form_accessibility')!;
    expect(forms.applicable).toBe(false);
  });

  it('redistributes alt_text weight when no figures', () => {
    const snap = makeSnap({ figures: [] });
    const result = score(snap, META);
    const alt = result.categories.find(c => c.key === 'alt_text')!;
    expect(alt.applicable).toBe(false);
  });
});

// ─── Grade derivation ─────────────────────────────────────────────────────────

describe('grade derivation', () => {
  it('grades a well-formed tagged document as A', () => {
    const snap = makeSnap({
      figures: [{ hasAlt: true, altText: 'Chart showing data', isArtifact: false, page: 1 }],
      tables: [{ hasHeaders: true, headerCount: 3, totalCells: 12, page: 2 }],
      links: [{ text: 'Read the full report', url: 'https://example.com', page: 1 }],
    });
    const result = score(snap, META);
    expect(result.grade).toBe('A');
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('grades a fully scanned document as F', () => {
    const snap = makeSnap({
      pageCount: 20,
      textCharCount: 0,
      textByPage: Array(20).fill(''),
      imageOnlyPageCount: 20,
      isTagged: false,
      markInfo: null,
      lang: null,
      pdfUaVersion: null,
      structureTree: null,
      headings: [],
      bookmarks: [],
      pdfClass: 'scanned',
      imageToTextRatio: 1.0,
    });
    const result = score(snap, META);
    expect(result.grade).toBe('F');
  });

  it('grades an untagged doc with text as D or F', () => {
    const snap = makeSnap({
      isTagged: false,
      markInfo: null,
      lang: null,
      pdfUaVersion: null,
      structureTree: null,
      headings: [],
      bookmarks: [],
      pdfClass: 'native_untagged',
      imageToTextRatio: 0,
    });
    const result = score(snap, META);
    expect(['D', 'F']).toContain(result.grade);
  });
});

// ─── Individual category edge cases ──────────────────────────────────────────

describe('textExtractability', () => {
  it('returns score 0 for scanned documents', () => {
    const snap = makeSnap({ pdfClass: 'scanned', textCharCount: 0, imageToTextRatio: 1.0, imageOnlyPageCount: 20 });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(0);
    expect(cat.severity).toBe('critical');
  });

  it('returns 100 for native_tagged with text', () => {
    const snap = makeSnap({ pdfClass: 'native_tagged', textCharCount: 5000 });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(100);
  });
});

describe('titleLanguage', () => {
  it('penalises missing language', () => {
    const snap = makeSnap({ lang: null, metadata: { title: 'Doc', language: undefined } });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'title_language')!;
    expect(cat.score).toBe(50);
  });

  it('penalises missing title', () => {
    const snap = makeSnap({ structTitle: undefined, metadata: { title: undefined, language: 'en-US' } });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'title_language')!;
    expect(cat.score).toBe(50);
  });

  it('scores 0 when both are missing', () => {
    const snap = makeSnap({ lang: null, structTitle: undefined, metadata: {} });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'title_language')!;
    expect(cat.score).toBe(0);
  });
});

describe('headingStructure', () => {
  it('scores 0 for multi-page doc with no headings', () => {
    const snap = makeSnap({ headings: [], pageCount: 10 });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(0);
    expect(cat.severity).toBe('critical');
  });

  it('penalises skipped levels', () => {
    const snap = makeSnap({
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 3, text: 'B', page: 1 }, // skipped H2
      ],
    });
    const withSkip = score(snap, META);
    const catSkip = withSkip.categories.find(c => c.key === 'heading_structure')!;

    const snap2 = makeSnap({
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 2, text: 'B', page: 1 },
      ],
    });
    const noSkip = score(snap2, META);
    const catNoSkip = noSkip.categories.find(c => c.key === 'heading_structure')!;

    expect(catSkip.score).toBeLessThan(catNoSkip.score);
  });
});

describe('altText', () => {
  it('is N/A when there are no figures', () => {
    const snap = makeSnap({ figures: [] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.applicable).toBe(false);
  });

  it('scores 100 when all figures have alt text', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: true, altText: 'A bar chart', isArtifact: false, page: 1 },
        { hasAlt: true, altText: 'A map',       isArtifact: false, page: 2 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(100);
  });

  it('scores 0 when no figures have alt text', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: false, isArtifact: false, page: 1 },
        { hasAlt: false, isArtifact: false, page: 2 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(0);
  });

  it('ignores artifact figures', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: true, altText: 'Logo', isArtifact: false, page: 1 },
        { hasAlt: false, isArtifact: true, page: 2 },   // decorative, don't penalise
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(100);
  });
});

describe('bookmarks', () => {
  it('is N/A for docs under BOOKMARKS_PAGE_THRESHOLD pages', () => {
    const snap = makeSnap({ pageCount: 5, textByPage: Array(5).fill('text'), headings: [{ level: 1, text: 'A', page: 0 }] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.applicable).toBe(false);
  });

  it('scores 0 for a 20-page doc with no bookmarks', () => {
    const snap = makeSnap({ bookmarks: [] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(0);
  });
});

describe('findings ordering', () => {
  it('sorts findings critical → moderate → minor → pass', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      markInfo: null,
      lang: null,
      pdfUaVersion: null,
      structureTree: null,
      headings: [],
      bookmarks: [],
      imageToTextRatio: 0,
    });
    const result = score(snap, META);
    const severities = result.findings.map(f => f.severity);
    const ORDER = ['critical', 'moderate', 'minor', 'pass'];
    for (let i = 1; i < severities.length; i++) {
      expect(ORDER.indexOf(severities[i]!)).toBeGreaterThanOrEqual(ORDER.indexOf(severities[i - 1]!));
    }
  });
});

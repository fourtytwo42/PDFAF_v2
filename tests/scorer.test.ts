import { describe, it, expect } from 'vitest';
import { score, SCORING_WEIGHTS } from '../src/services/scorer/scorer.js';
import { SCORE_TAGGED_MARKED_NO_EXTRACTABLE_TEXT } from '../src/config.js';
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
    expect(cat.evidence).toBe('verified');
  });

  it('caps OCR-derived text extractability below a full-confidence pass', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 5000,
      metadata: {
        title: 'Test Doc',
        language: 'en-US',
        author: 'Author',
        subject: 'Test',
        producer: 'OCRmyPDF 17.0',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(89);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
    expect(cat.findings.some(f => f.message.includes('OCR'))).toBe(true);
    expect(result.manualReviewRequired).toBe(true);
    expect(result.scoreCapsApplied?.some(cap => cap.category === 'text_extractability')).toBe(true);
  });

  it('returns capped score for tagged Marked native_tagged when pdf.js extracts no text', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 0,
      textByPage: Array(20).fill(''),
      headings: [],
      bookmarks: [],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(SCORE_TAGGED_MARKED_NO_EXTRACTABLE_TEXT);
  });

  it('penalises native_tagged when fonts have encodingRisk (Acrobat Character encoding proxy)', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 5000,
      fonts: [
        { name: 'Arial', isEmbedded: false, hasUnicode: false, encodingRisk: true },
        { name: 'Times', isEmbedded: false, hasUnicode: false, encodingRisk: true },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => /Character encoding|encoding/i.test(f.message))).toBe(true);
  });

  it('applies full encoding penalty when text layer is sparse (relax thresholds not met)', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      pageCount: 40,
      textByPage: Array(40).fill('short'),
      textCharCount: 2000,
      fonts: [
        { name: 'Arial', isEmbedded: false, hasUnicode: false, encodingRisk: true },
        { name: 'Times', isEmbedded: false, hasUnicode: false, encodingRisk: true },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBeLessThanOrEqual(90);
    expect(cat.severity).toBe('moderate');
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
  it('scores 0 for multi-page doc with no headings and sparse paragraph structure', () => {
    const snap = makeSnap({
      headings: [],
      pageCount: 10,
      paragraphStructElems: [{ tag: 'P', text: 'x', page: 0, structRef: '1_0' }],
      textCharCount: 80,
      textByPage: Array(10).fill('short'),
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(0);
    expect(cat.severity).toBe('critical');
  });

  it('scores 100 when tagged Marked multi-page doc has no H tags but many P-structure elements', () => {
    const elems = Array.from({ length: 6 }, (_, i) => ({
      tag: 'P' as const,
      text: `Section ${i}`,
      page: Math.floor(i / 3),
      structRef: `${i}_0`,
    }));
    const snap = makeSnap({ headings: [], pageCount: 10, paragraphStructElems: elems });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(100);
    expect(cat.severity).toBe('pass');
  });

  it('scores 100 for native_tagged multi-page with no H tags but substantial text (no P-struct list)', () => {
    const snap = makeSnap({
      headings: [],
      pageCount: 10,
      paragraphStructElems: [],
      textCharCount: 5000,
      textByPage: Array(10).fill('x'.repeat(500)),
      pdfClass: 'native_tagged',
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(100);
  });

  it('scores 100 for tagged Marked multi-page with no H tags and pdf.js text length 0', () => {
    const snap = makeSnap({
      headings: [],
      pageCount: 12,
      paragraphStructElems: [],
      textCharCount: 0,
      textByPage: Array(12).fill(''),
      pdfClass: 'native_tagged',
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(100);
  });

  it('penalises skipped levels', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      pageCount: 8,
      textByPage: Array(8).fill('Some text content here'),
      textCharCount: 8 * 22,
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 3, text: 'B', page: 1 }, // skipped H2
      ],
    });
    const withSkip = score(snap, META);
    const catSkip = withSkip.categories.find(c => c.key === 'heading_structure')!;

    const snap2 = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      pageCount: 8,
      textByPage: Array(8).fill('Some text content here'),
      textCharCount: 8 * 22,
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
    expect(cat.evidence).toBe('verified');
  });

  it('scores 0 when no figures have alt text (untagged class; small native_tagged floor is separate)', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      markInfo: null,
      figures: [
        { hasAlt: false, isArtifact: false, page: 1 },
        { hasAlt: false, isArtifact: false, page: 2 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(0);
  });

  it('does not inflate alt_text for native_tagged figures with no alt (Acrobat FigAltText alignment)', () => {
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
        { hasAlt: true, altText: 'Acme brand mark on title page', isArtifact: false, page: 1 },
        { hasAlt: false, isArtifact: true, page: 2 },   // decorative, don't penalise
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(100);
  });

  it('penalises generic alternate text on figures (Tier A)', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: true, altText: 'image', isArtifact: false, page: 1 },
        { hasAlt: true, altText: 'A bar chart', isArtifact: false, page: 2 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('generic'))).toBe(true);
    expect(cat.evidence).toBe('heuristic');
  });

  it('scores non-link annotations missing /Contents when there are no figures', () => {
    const snap = makeSnap({
      figures: [],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 3,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.applicable).toBe(true);
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('non-link'))).toBe(true);
  });
});

describe('annotationAccessibility signals', () => {
  it('penalises pdf_ua when many visible annotations lack structure association', () => {
    const snap = makeSnap({
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 13,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('annotation'))).toBe(true);
  });

  it('penalises reading_order when many pages lack /Tabs /S', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      markInfo: null,
      pageCount: 20,
      textByPage: Array(20).fill('Some text content here'),
      annotationAccessibility: {
        pagesMissingTabsS: 10,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThanOrEqual(50);
    expect(cat.findings.some(f => f.message.includes('/Tabs'))).toBe(true);
    expect(cat.manualReviewRequired).toBe(true);
  });

  it('penalises pdf_ua for tagged-content audit orphan MCIDs (Acrobat TaggedCont proxy)', () => {
    const snap = makeSnap({
      taggedContentAudit: {
        orphanMcidCount: 2,
        mcidTextSpanCount: 6,
        suspectedPathPaintOutsideMc: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('orphan'))).toBe(true);
  });

  it('penalises pdf_ua for path paint outside marked-content (heuristic)', () => {
    const snap = makeSnap({
      taggedContentAudit: {
        orphanMcidCount: 0,
        mcidTextSpanCount: 4,
        suspectedPathPaintOutsideMc: 50,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('path paint'))).toBe(true);
  });

  it('penalises link_quality for link annotations missing structure', () => {
    const snap = makeSnap({
      links: [{ text: 'Good label', url: 'https://example.com', page: 0 }],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 2,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.score).toBe(95);
    expect(cat.findings.some(f => f.message.includes('structure tree'))).toBe(true);
  });

  it('scores link_quality from structure issues when pdfjs extracted no links', () => {
    const snap = makeSnap({
      links: [],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 1,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.applicable).toBe(true);
    expect(cat.score).toBeLessThan(100);
  });

  it('penalises reading_order when link annotations lack /StructParent (Tier A)', () => {
    const snap = makeSnap({
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 5,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('StructParent'))).toBe(true);
    expect(cat.manualReviewRequired).toBe(true);
  });

  it('penalises link_quality for /Link missing /StructParent (distinct from ParentTree)', () => {
    const snap = makeSnap({
      links: [{ text: 'Good label', url: 'https://example.com', page: 0 }],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 4,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('/StructParent'))).toBe(true);
  });

  it('flags pdfaf-style generic link phrase (find out more)', () => {
    const snap = makeSnap({
      links: [{ text: 'Find out more', url: 'https://example.com', page: 0 }],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.findings.some(f => f.message.includes('non-descriptive'))).toBe(true);
  });

  it('applies advisory table regularity when row pattern matches pdfaf heuristic', () => {
    const snap = makeSnap({
      tables: [
        {
          hasHeaders: true,
          headerCount: 1,
          totalCells: 18,
          page: 1,
          rowCount: 5,
          cellsMisplacedCount: 0,
          irregularRows: 4,
          rowCellCounts: [2, 4, 4, 4, 4],
          dominantColumnCount: 4,
          maxRowSpan: 1,
          maxColSpan: 1,
        },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'table_markup')!;
    expect(cat.findings.some(f => f.message.includes('advisory'))).toBe(true);
  });
});

describe('bookmarks', () => {
  it('is N/A for docs under BOOKMARKS_PAGE_THRESHOLD pages', () => {
    const snap = makeSnap({ pageCount: 5, textByPage: Array(5).fill('text'), headings: [{ level: 1, text: 'A', page: 0 }] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.applicable).toBe(false);
  });

  it('scores 88 for a 20-page doc with no bookmarks and sparse headings (long-doc floor)', () => {
    const snap = makeSnap({
      bookmarks: [],
      headings: [{ level: 1, text: 'Only', page: 0 }],
      markInfo: null,
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(88);
  });

  it('scores partial credit for tagged Marked long doc with no outlines and a single heading', () => {
    const snap = makeSnap({
      bookmarks: [],
      headings: [{ level: 1, text: 'Only', page: 0 }],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(94);
  });

  it('gives partial credit when there are no outlines but many tagged headings', () => {
    const snap = makeSnap({ bookmarks: [] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(92);
  });

  it('gives 88 when there are no outlines but only two headings', () => {
    const snap = makeSnap({
      bookmarks: [],
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 2, text: 'B', page: 1 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(88);
  });

  it('scores 97 when bookmarks exist without headings but paragraph tagging is rich', () => {
    const paras = Array.from({ length: 25 }, (_, i) => ({
      tag: 'P' as const,
      text: `p${i}`,
      page: i % 20,
      structRef: `${i}_0`,
    }));
    const snap = makeSnap({
      pageCount: 20,
      bookmarks: [
        { title: 'Ch1', level: 1 },
        { title: 'Ch2', level: 1 },
      ],
      headings: [],
      paragraphStructElems: paras,
      textByPage: Array(20).fill('word '.repeat(50)),
      textCharCount: 20_000,
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(97);
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

describe('stage 1 evidence model', () => {
  it('marks heuristic reading-order fallback without a structure tree and caps it below full confidence', () => {
    const snap = makeSnap({
      structureTree: null,
      headings: [
        { level: 1, text: 'Intro', page: 0 },
        { level: 2, text: 'Body', page: 1 },
      ],
      paragraphStructElems: [],
      pdfClass: 'native_tagged',
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBe(89);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
    expect(result.verificationLevel).toBe('manual_review_required');
  });

  it('surfaces color contrast as manual-review-required even when it is not applicable', () => {
    const result = score(makeSnap(), META);
    const cat = result.categories.find(c => c.key === 'color_contrast')!;
    expect(cat.applicable).toBe(false);
    expect(cat.evidence).toBe('heuristic');
    expect(cat.manualReviewRequired).toBe(true);
    expect(result.manualReviewRequired).toBe(false);
    expect(result.verificationLevel).toBe('mixed');
    expect(result.manualReviewReasons?.some(reason => reason.includes('Color contrast'))).toBe(true);
  });

  it('marks alt-text ownership risks as manual-review-required and caps high scores', () => {
    const snap = makeSnap({
      figures: [{ hasAlt: true, altText: 'Chart', isArtifact: false, page: 1 }],
      acrobatStyleAltRisks: {
        nonFigureWithAltCount: 1,
        nestedFigureAltCount: 0,
        orphanedAltEmptyElementCount: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(89);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
  });
});

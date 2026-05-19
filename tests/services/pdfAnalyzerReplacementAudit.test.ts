import { describe, expect, it } from 'vitest';
import {
  mergeSnapshot,
  replacementCharacterAuditFromTextByPage,
} from '../../src/services/pdfAnalyzer.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { DocumentSnapshot, PdfjsResult, PythonAnalysisResult } from '../../src/types.js';

function pdfjs(textByPage: string[]): PdfjsResult {
  return {
    pageCount: textByPage.length,
    textByPage,
    textCharCount: textByPage.reduce((sum, text) => sum + text.length, 0),
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFields: [],
  };
}

function struct(): PythonAnalysisResult {
  return {
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: null,
    headings: [{ level: 1, text: 'Title', page: 1 }],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: null,
    paragraphStructElems: [],
    threeCcGoldenV1: false,
    threeCcGoldenOrphanV1: false,
    orphanMcids: [],
    mcidTextSpans: [],
    nativeTitleBtCandidates: [],
    linkScoringRows: [],
    fontSyntaxAudit: {
      fontsChecked: 0,
      missingToUnicodeCMapCount: 0,
      invalidToUnicodeCMapCount: 0,
      emptyToUnicodeCMapCount: 0,
      cidToGidMapRiskCount: 0,
      trueTypeEncodingMismatchCount: 0,
      wModeMismatchCount: 0,
      externalCMapReferenceCount: 0,
      type0DescendantFontRiskCount: 0,
    },
  };
}

function categoryScores(snapshot: DocumentSnapshot): Record<string, number> {
  const result = score(snapshot, {
    id: 'replacement-audit-test',
    filename: 'replacement-audit-test.pdf',
    timestamp: '2026-05-18T00:00:00.000Z',
    analysisDurationMs: 0,
  });
  return Object.fromEntries(result.categories.map(category => [category.key, category.score]));
}

describe('replacement-character audit', () => {
  it('counts no replacement characters', () => {
    expect(replacementCharacterAuditFromTextByPage(['abc', 'plain text'])).toEqual({
      replacementCharacterCount: 0,
      replacementCharacterRatio: 0,
      highReplacementCharacterPageCount: 0,
    });
  });

  it('counts mixed text at the high-page threshold', () => {
    expect(replacementCharacterAuditFromTextByPage(['abc', '\uFFFD\uFFFD\uFFFD1234567'])).toEqual({
      replacementCharacterCount: 3,
      replacementCharacterRatio: 3 / 13,
      highReplacementCharacterPageCount: 1,
    });
  });

  it('counts high replacement ratio pages', () => {
    expect(replacementCharacterAuditFromTextByPage(['\uFFFD\uFFFD\uFFFD\uFFFD', 'ok'])).toEqual({
      replacementCharacterCount: 4,
      replacementCharacterRatio: 4 / 6,
      highReplacementCharacterPageCount: 1,
    });
  });

  it('handles empty text pages', () => {
    expect(replacementCharacterAuditFromTextByPage(['', ''])).toEqual({
      replacementCharacterCount: 0,
      replacementCharacterRatio: 0,
      highReplacementCharacterPageCount: 0,
    });
  });

  it('populates snapshot fields without changing category scores', () => {
    const snapshot = mergeSnapshot(pdfjs(['Clean text', '\uFFFD\uFFFDxx']), struct());
    expect(snapshot.fontSyntaxAudit?.replacementCharacterCount).toBe(2);
    expect(snapshot.fontSyntaxAudit?.highReplacementCharacterPageCount).toBe(1);

    const withoutReplacementAudit: DocumentSnapshot = {
      ...snapshot,
      fontSyntaxAudit: { ...snapshot.fontSyntaxAudit! },
    };
    delete withoutReplacementAudit.fontSyntaxAudit!.replacementCharacterCount;
    delete withoutReplacementAudit.fontSyntaxAudit!.replacementCharacterRatio;
    delete withoutReplacementAudit.fontSyntaxAudit!.highReplacementCharacterPageCount;

    expect(categoryScores(snapshot)).toEqual(categoryScores(withoutReplacementAudit));
  });
});

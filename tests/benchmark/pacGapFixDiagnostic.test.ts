import { describe, expect, it } from 'vitest';
import {
  buildPacGapFixRow,
  buildPacGapFixSummary,
} from '../../scripts/pac-gap-fix-diagnostic.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

function analysis(score: number): Pick<AnalysisResult, 'score' | 'grade' | 'categories'> {
  return {
    score,
    grade: score >= 90 ? 'A' : 'B',
    categories: [
      { key: 'title_language', score, weight: 1, applicable: true, severity: 'pass', findings: [] },
      { key: 'pdf_ua_compliance', score, weight: 1, applicable: true, severity: 'pass', findings: [] },
    ],
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Report'],
    textCharCount: 100,
    imageOnlyPageCount: 0,
    metadata: { title: 'Report', language: 'en-US' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true, Suspects: true },
    viewerPreferences: { displayDocTitle: false },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Report',
    headings: [{ level: 1, text: 'Report', page: 0 }],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [{ type: 'H1', children: [] }] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

describe('pac gap fix diagnostic helpers', () => {
  it('marks Stage 5 catalog setting gaps as applicable and category-pass/PAC-fail', () => {
    const row = buildPacGapFixRow({
      id: 'fixture',
      file: '/tmp/fixture.pdf',
      analysis: analysis(98),
      snapshot: snapshot(),
    });

    expect(row.stage5CatalogSettingsApplicable).toBe(true);
    expect(row.gaps.map(gap => gap.ruleId)).toEqual([
      'pdfua.settings.suspects_absent_or_false',
      'pdfua.settings.display_doc_title_present_or_unknown',
    ]);
    expect(row.categoryPassedPacFailed).toHaveLength(2);
  });

  it('sorts applicable candidates before non-candidates deterministically', () => {
    const candidate = buildPacGapFixRow({
      id: 'b-candidate',
      file: '/tmp/b.pdf',
      analysis: analysis(98),
      snapshot: snapshot(),
    });
    const clean = buildPacGapFixRow({
      id: 'a-clean',
      file: '/tmp/a.pdf',
      analysis: analysis(98),
      snapshot: snapshot({
        markInfo: { Marked: true, Suspects: false },
        viewerPreferences: { displayDocTitle: true },
      }),
    });

    const summary = buildPacGapFixSummary([clean, candidate]);

    expect(summary.candidateCount).toBe(1);
    expect(summary.rows.map(row => row.id)).toEqual(['b-candidate', 'a-clean']);
    expect(summary.fixableByRule).toEqual({
      'pdfua.settings.display_doc_title_present_or_unknown': 1,
      'pdfua.settings.suspects_absent_or_false': 1,
    });
  });
});

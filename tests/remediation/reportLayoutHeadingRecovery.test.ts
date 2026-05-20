import { describe, expect, it } from 'vitest';
import { score } from '../../src/services/scorer/scorer.js';
import {
  classifyReportLayoutHeadingRecovery,
  REPORT_LAYOUT_HEADING_RECOVERY_SIGNAL,
} from '../../src/services/remediation/reportLayoutHeadingRecovery.js';
import type { AnalysisResult, DocumentSnapshot, NativeLayoutAudit } from '../../src/types.js';

const META = { id: 'report-layout', filename: 'report-layout.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function baseSnapshot(): DocumentSnapshot {
  return {
    pageCount: 25,
    textByPage: Array.from({ length: 25 }, () => 'Drug Cases Submitted to the Virginia Department of Forensic Science'),
    textCharCount: 5000,
    imageOnlyPageCount: 0,
    metadata: { title: 'Report', language: 'en', author: '', subject: '' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    pdfUaVersion: '1',
    structTitle: null,
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
  };
}

function layoutAudit(overrides: Partial<NativeLayoutAudit> = {}): NativeLayoutAudit {
  return {
    sampledPageCount: 25,
    textRunCount: 200,
    repeatedHeaderFooterBandCount: 25,
    repeatedHeaderFooterPageCount: 25,
    headerFooterBandTexts: [],
    multiColumnPageCount: 12,
    geometryOrderRiskPages: 8,
    layoutHeadingCandidateCount: 70,
    layoutHeadingCandidates: [
      { text: 'Executive Summary', page: 0, bbox: [50, 700, 260, 725] },
      { text: 'Key Findings', page: 1, bbox: [50, 690, 220, 712] },
    ],
    captionCandidateCount: 0,
    captionCandidates: [],
    layoutTableCandidateCount: 0,
    denseRowBandTableCandidateCount: 0,
    undersegmentedTableCandidateCount: 0,
    tableCandidates: [],
    ...overrides,
  };
}

function analysisFor(snapshot: DocumentSnapshot, scores: Partial<Record<AnalysisResult['categories'][number]['key'], number>>): AnalysisResult {
  const base = score(snapshot, META);
  return {
    ...base,
    score: Math.min(base.score, ...Object.values(scores).filter((value): value is number => typeof value === 'number')),
    categories: base.categories.map(category =>
      scores[category.key] == null
        ? { ...category, score: 100, applicable: category.applicable }
        : { ...category, score: scores[category.key]!, applicable: true },
    ),
  };
}

describe('classifyReportLayoutHeadingRecovery', () => {
  it('passes a report-scale paragraph-backed positive', () => {
    const snapshot: DocumentSnapshot = {
      ...baseSnapshot(),
      layoutAudit: layoutAudit(),
      paragraphStructElems: [
        { tag: 'P', text: 'Executive Summary', page: 0, structRef: '10_0', bbox: [50, 700, 260, 725] },
        { tag: 'P', text: 'Key Findings', page: 1, structRef: '11_0', bbox: [50, 690, 220, 712] },
      ],
    };
    const result = classifyReportLayoutHeadingRecovery(analysisFor(snapshot, {
      reading_order: 79,
      heading_structure: 74,
    }), snapshot);
    expect(result.kind).toBe(REPORT_LAYOUT_HEADING_RECOVERY_SIGNAL);
    expect(result.existingTargetMatchCount).toBe(2);
    expect(result.paragraphTargetMatchCount).toBe(2);
    expect(result.paragraphCandidates.map(candidate => candidate.structRef)).toEqual(['10_0', '11_0']);
  });

  it('rejects a Teams-style short guide control', () => {
    const snapshot: DocumentSnapshot = {
      ...baseSnapshot(),
      pageCount: 5,
      textByPage: Array.from({ length: 5 }, () => 'Quick start content'),
      layoutAudit: layoutAudit({
        sampledPageCount: 5,
        layoutHeadingCandidateCount: 24,
        repeatedHeaderFooterPageCount: 5,
      }),
      paragraphStructElems: [
        { tag: 'P', text: 'Executive Summary', page: 0, structRef: '10_0', bbox: [50, 700, 260, 725] },
        { tag: 'P', text: 'Key Findings', page: 1, structRef: '11_0', bbox: [50, 690, 220, 712] },
      ],
    };
    const result = classifyReportLayoutHeadingRecovery(analysisFor(snapshot, {
      reading_order: 30,
      heading_structure: 55,
    }), snapshot);
    expect(result.kind).toBe('no_report_layout_heading_recovery');
    expect(result.reasons).toContain('layout_heading_candidates_below_60:24');
  });

  it('rejects an ADAM-like table/noise control without repeated report furniture', () => {
    const snapshot: DocumentSnapshot = {
      ...baseSnapshot(),
      layoutAudit: layoutAudit({
        repeatedHeaderFooterPageCount: 0,
        layoutTableCandidateCount: 12,
        denseRowBandTableCandidateCount: 8,
        tableCandidates: [
          { page: 0, bbox: [40, 450, 520, 620], rowCount: 12, columnCount: 5, dense: true, undersegmented: true },
        ],
      }),
      paragraphStructElems: [
        { tag: 'P', text: 'Executive Summary', page: 0, structRef: '10_0', bbox: [50, 700, 260, 725] },
        { tag: 'P', text: 'Key Findings', page: 1, structRef: '11_0', bbox: [50, 690, 220, 712] },
      ],
    };
    const result = classifyReportLayoutHeadingRecovery(analysisFor(snapshot, {
      reading_order: 30,
      heading_structure: 0,
    }), snapshot);
    expect(result.kind).toBe('no_report_layout_heading_recovery');
    expect(result.reasons).toContain('repeated_header_footer_pages_below_20:0');
  });

  it('rejects an accessible fixture with no current reading or heading debt', () => {
    const snapshot: DocumentSnapshot = {
      ...baseSnapshot(),
      layoutAudit: layoutAudit(),
      headings: [{ level: 1, text: 'Executive Summary', page: 0, structRef: '20_0' }],
      paragraphStructElems: [
        { tag: 'P', text: 'Executive Summary', page: 0, structRef: '10_0', bbox: [50, 700, 260, 725] },
        { tag: 'P', text: 'Key Findings', page: 1, structRef: '11_0', bbox: [50, 690, 220, 712] },
      ],
    };
    const result = classifyReportLayoutHeadingRecovery(analysisFor(snapshot, {
      reading_order: 100,
      heading_structure: 100,
    }), snapshot);
    expect(result.kind).toBe('no_report_layout_heading_recovery');
    expect(result.reasons).toContain('reading_and_heading_scores_above_report_layout_threshold');
  });

  it('rejects MCID-only report rows for the paragraph-backed behavior stage', () => {
    const snapshot: DocumentSnapshot = {
      ...baseSnapshot(),
      layoutAudit: layoutAudit(),
      paragraphStructElems: [],
      mcidTextSpans: [
        { page: 0, mcid: 10, snippet: '/P << /MCID 10 >>', resolvedText: 'Executive Summary' },
        { page: 1, mcid: 11, snippet: '/P << /MCID 11 >>', resolvedText: 'Key Findings' },
      ],
    };
    const result = classifyReportLayoutHeadingRecovery(analysisFor(snapshot, {
      reading_order: 30,
      heading_structure: 0,
    }), snapshot);
    expect(result.kind).toBe('no_report_layout_heading_recovery');
    expect(result.existingTargetMatchCount).toBe(2);
    expect(result.mcidTargetMatchCount).toBe(2);
    expect(result.paragraphTargetMatchCount).toBe(0);
    expect(result.reasons).toContain('no_paragraph_backed_heading_candidate');
  });
});

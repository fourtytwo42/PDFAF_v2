import { describe, expect, it } from 'vitest';
import { buildReadabilityRepairPlan } from '../../src/services/semantic/readabilityRepairPlan.js';
import type { AnalysisResult, DocumentSnapshot, ReadabilityReviewSummary } from '../../src/types.js';

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    filename: 'target.pdf',
    pageCount: 2,
    pdfClass: 'native_tagged',
    scoreProfile: { overallScore: 96, grade: 'A' },
    score: 96,
    grade: 'A',
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    categories: [
      { key: 'reading_order', label: 'Reading order', score: 92, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'heading_structure', label: 'Heading structure', score: 95, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'alt_text', label: 'Alt text', score: 96, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'table_markup', label: 'Table markup', score: 100, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'link_quality', label: 'Link quality', score: 100, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'form_accessibility', label: 'Forms', score: 100, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'text_extractability', label: 'Text', score: 100, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'pdf_ua_compliance', label: 'PDF/UA', score: 100, applicable: true, severity: 'pass', findings: [], countsTowardGrade: false },
      { key: 'title_language', label: 'Title', score: 100, applicable: true, severity: 'pass', findings: [], countsTowardGrade: true },
      { key: 'bookmarks', label: 'Bookmarks', score: 100, applicable: true, severity: 'pass', findings: [], countsTowardGrade: false },
      { key: 'color_contrast', label: 'Color', score: 100, applicable: false, severity: 'pass', findings: [], countsTowardGrade: false },
    ],
    findings: [],
    ...overrides,
  } as unknown as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 2,
    textByPage: ['Title Body text', 'More body text'],
    textCharCount: 28,
    metadata: { title: 'Target', language: 'en' },
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    structTitle: 'Target',
    structureTree: { type: 'Document', children: [] },
    headings: [{ level: 1, text: 'Title', page: 0, structRef: '1_0' }],
    figures: [{ page: 0, hasAlt: false, isArtifact: false, structRef: '2_0' }],
    tables: [],
    links: [],
    formFields: [],
    formFieldsFromPdfjs: [],
    ...overrides,
  } as unknown as DocumentSnapshot;
}

function review(overrides: Partial<ReadabilityReviewSummary>): ReadabilityReviewSummary {
  return {
    status: 'warn',
    score: 82,
    grade: 'B',
    confidence: 'medium',
    durationMs: 1,
    summary: 'Needs review.',
    strengths: [],
    findings: [],
    manualReviewRecommended: true,
    manualReviewReasons: [],
    ...overrides,
  } as ReadabilityReviewSummary;
}

describe('buildReadabilityRepairPlan', () => {
  it('maps concrete readability findings to focused deterministic tools and routes', () => {
    const plan = buildReadabilityRepairPlan({
      analysis: analysis(),
      snapshot: snapshot(),
      review: review({
        findings: [
          { area: 'alt_text', severity: 'moderate', message: 'Figure alt text is missing.' },
          { area: 'reading_order', severity: 'minor', message: 'Confirm reading order around the title.' },
        ],
      }),
    });

    expect(plan.manualReviewOnly).toBe(false);
    expect(plan.areas).toEqual(['alt_text', 'reading_order']);
    expect(plan.deterministicToolNames).toContain('set_figure_alt_text');
    expect(plan.deterministicToolNames).toContain('repair_native_reading_order');
    expect(plan.preferredRoutes).toContain('figure_semantics');
    expect(plan.preferredRoutes).toContain('native_structure_repair');
    expect(plan.semanticLanes).toContain('figures');
    expect(plan.findingsMapped).toBe(2);
  });

  it('marks overall assistive-technology concerns manual-only when there is no concrete engine evidence', () => {
    const plan = buildReadabilityRepairPlan({
      analysis: analysis(),
      snapshot: snapshot({ figures: [], headings: [], structureTree: null }),
      review: review({
        findings: [
          { area: 'assistive_technology', severity: 'minor', message: 'Manual screen-reader smoke test recommended.' },
        ],
      }),
    });

    expect(plan.manualReviewOnly).toBe(true);
    expect(plan.deterministicToolNames).toEqual([]);
    expect(plan.findingsUnmapped).toBe(1);
  });
});

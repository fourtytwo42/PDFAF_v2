import { describe, expect, it } from 'vitest';
import {
  buildStage146Report,
  buildStage146Row,
  classifyStage146FigureAlt,
} from '../../scripts/stage146-active-tail-figure-alt-diagnostic.js';
import type { DocumentSnapshot } from '../../src/types.js';

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['hello'],
    textCharCount: 5,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: null,
    headings: [],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    paragraphStructElems: [],
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

describe('Stage 146 active-tail figure/alt diagnostic', () => {
  it('classifies three-target rows with remaining checker-visible targets as cap-bound candidates', () => {
    const classified = classifyStage146FigureAlt({
      publicationId: 'v1-v1-4453',
      afterScore: 69,
      afterGrade: 'D',
      altTextScore: 20,
      headingScore: 100,
      readingOrderScore: 100,
      tableScore: 100,
      falsePositiveApplied: 0,
      setAltAppliedCount: 3,
      retagAppliedCount: 0,
      terminalFigureToolCount: 0,
      remainingSafeCheckerTargetCount: 2,
      remainingSafeRoleMapTargetCount: 0,
      scoreShapeFigureRejectionCount: 0,
      invariantFigureFailureCount: 0,
    });

    expect(classified).toEqual({
      candidateClass: 'cap_bound_remaining_safe_targets',
      implementable: true,
      reason: 'three figure-alt targets already applied and safe checker-visible missing-alt targets remain',
    });
  });

  it('parks known analyzer-volatility rows even when figure targets remain', () => {
    const classified = classifyStage146FigureAlt({
      publicationId: 'v1-v1-4683',
      afterScore: 56,
      afterGrade: 'F',
      altTextScore: 20,
      headingScore: 43,
      readingOrderScore: 100,
      tableScore: 6,
      falsePositiveApplied: 0,
      setAltAppliedCount: 3,
      retagAppliedCount: 0,
      terminalFigureToolCount: 0,
      remainingSafeCheckerTargetCount: 2,
      remainingSafeRoleMapTargetCount: 0,
      scoreShapeFigureRejectionCount: 0,
      invariantFigureFailureCount: 0,
    });

    expect(classified.candidateClass).toBe('analyzer_volatility');
    expect(classified.implementable).toBe(false);
  });

  it('classifies mixed table or heading blockers when no safe continuation target exists', () => {
    const classified = classifyStage146FigureAlt({
      publicationId: 'v1-v1-4690',
      afterScore: 65,
      afterGrade: 'D',
      altTextScore: 20,
      headingScore: 75,
      readingOrderScore: 97,
      tableScore: 1,
      falsePositiveApplied: 0,
      setAltAppliedCount: 1,
      retagAppliedCount: 0,
      terminalFigureToolCount: 0,
      remainingSafeCheckerTargetCount: 0,
      remainingSafeRoleMapTargetCount: 0,
      scoreShapeFigureRejectionCount: 0,
      invariantFigureFailureCount: 0,
    });

    expect(classified.candidateClass).toBe('mixed_table_or_heading_blocker');
    expect(classified.implementable).toBe(false);
  });

  it('builds row evidence from checker-visible and role-map targets', () => {
    const row = buildStage146Row(
      { id: 'v1-v1-4145', publicationId: 'v1-v1-4145', title: 'Doc', localFile: 'doc.pdf' },
      snapshot({
        figures: [
          { hasAlt: true, isArtifact: false, page: 0, rawRole: 'Figure', role: 'Figure', structRef: '1_0', reachable: true, directContent: true, subtreeMcidCount: 1 },
          { hasAlt: false, isArtifact: false, page: 1, rawRole: 'InlineShape', role: 'Figure', structRef: '2_0', reachable: true, directContent: true, subtreeMcidCount: 1 },
          { hasAlt: false, isArtifact: false, page: 2, rawRole: 'Figure', role: 'Figure', structRef: '3_0', reachable: true, directContent: true, subtreeMcidCount: 1 },
        ],
        checkerFigureTargets: [
          { hasAlt: false, isArtifact: false, page: 2, role: 'Figure', resolvedRole: 'Figure', structRef: '3_0', reachable: true, directContent: true, parentPath: [] },
        ],
      }),
      {
        afterScore: 79,
        afterGrade: 'C',
        afterCategories: [
          { key: 'alt_text', score: 20 },
          { key: 'heading_structure', score: 95 },
          { key: 'reading_order', score: 100 },
          { key: 'table_markup', score: 100 },
          { key: 'pdf_ua_compliance', score: 83 },
        ],
        falsePositiveAppliedCount: 0,
        afterDetectionProfile: { figureSignals: { extractedFigureCount: 3, treeFigureCount: 3 } },
        appliedTools: [
          { toolName: 'retag_as_figure', outcome: 'applied', details: JSON.stringify({ invariants: { targetRef: '1_0' } }) },
          { toolName: 'retag_as_figure', outcome: 'applied', details: JSON.stringify({ invariants: { targetRef: '4_0' } }) },
          { toolName: 'set_figure_alt_text', outcome: 'applied', details: JSON.stringify({ invariants: { targetRef: '1_0' } }) },
          { toolName: 'set_figure_alt_text', outcome: 'applied', details: JSON.stringify({ invariants: { targetRef: '4_0' } }) },
          { toolName: 'set_figure_alt_text', outcome: 'applied', details: JSON.stringify({ invariants: { targetRef: '5_0' } }) },
        ],
      },
    );

    expect(row.remainingSafeCheckerTargets).toEqual(['3_0']);
    expect(row.remainingSafeRoleMapTargets).toEqual(['2_0']);
    expect(row.extractedFigureCount).toBe(3);
    expect(row.treeFigureCount).toBe(3);
    expect(row.implementable).toBe(true);
  });

  it('selects only implementable rows in the report decision', () => {
    const report = buildStage146Report('manifest', 'run', [
      {
        id: 'row-a',
        publicationId: 'row-a',
        title: 'A',
        file: 'a.pdf',
        afterScore: 69,
        afterGrade: 'D',
        altTextScore: 20,
        headingScore: 100,
        readingOrderScore: 100,
        tableScore: 100,
        pdfUaScore: 83,
        falsePositiveApplied: 0,
        extractedFigureCount: 4,
        treeFigureCount: 4,
        checkerVisibleFigureCount: 4,
        checkerVisibleFigureWithAltCount: 3,
        checkerVisibleMissingAltCount: 1,
        remainingSafeCheckerTargetCount: 1,
        remainingSafeCheckerTargets: ['4_0'],
        remainingSafeRoleMapTargetCount: 0,
        remainingSafeRoleMapTargets: [],
        attemptedTargetRefs: [],
        setAltAppliedCount: 3,
        retagAppliedCount: 0,
        terminalFigureToolCount: 0,
        scoreShapeFigureRejectionCount: 0,
        invariantFigureFailureCount: 0,
        candidateClass: 'cap_bound_remaining_safe_targets',
        implementable: true,
        reason: 'test',
        candidates: [],
      },
    ]);

    expect(report.decision.selectedRows).toEqual(['row-a']);
    expect(report.decision.recommendedDirection).toBe('implement_bounded_figure_alt_continuation');
  });
});

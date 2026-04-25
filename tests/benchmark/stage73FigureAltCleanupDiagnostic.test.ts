import { describe, expect, it } from 'vitest';
import {
  buildStage73Report,
  buildStage73Row,
  classifyStage73FigureCleanup,
} from '../../scripts/stage73-figure-alt-cleanup-diagnostic.js';
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

describe('Stage 73 figure/alt cleanup diagnostic', () => {
  it('classifies v1-4145-style rows as stable role-map retag progression candidates', () => {
    const classified = classifyStage73FigureCleanup({
      publicationId: '4145',
      afterScore: 78,
      afterGrade: 'C',
      altTextScore: 20,
      falsePositiveApplied: 0,
      retagAppliedCount: 2,
      attemptedTargetRefs: ['70_0'],
      candidates: [
        {
          structRef: '70_0',
          page: 0,
          rawRole: 'InlineShape',
          resolvedRole: 'Figure',
          reachable: true,
          directContent: true,
          subtreeMcidCount: 1,
          hasAlt: true,
          checkerVisible: true,
          safeRoleMapRetagTarget: true,
          blocker: 'role_map_mismatch',
        },
        {
          structRef: '80_0',
          page: 1,
          rawRole: 'InlineShape',
          resolvedRole: 'Figure',
          reachable: true,
          directContent: true,
          subtreeMcidCount: 1,
          hasAlt: false,
          checkerVisible: false,
          safeRoleMapRetagTarget: true,
          blocker: 'role_map_mismatch',
        },
      ],
    });

    expect(classified.candidateClass).toBe('stable_rolemap_retag_progression_candidate');
    expect(classified.implementable).toBe(true);
    expect(classified.remainingSafeRoleMapTargets).toEqual(['80_0']);
  });

  it('keeps analyzer-volatility observation rows excluded from acceptance', () => {
    const classified = classifyStage73FigureCleanup({
      publicationId: '4139',
      afterScore: 78,
      afterGrade: 'C',
      altTextScore: 20,
      falsePositiveApplied: 0,
      retagAppliedCount: 2,
      attemptedTargetRefs: [],
      candidates: [{
        structRef: '80_0',
        page: 1,
        rawRole: 'InlineShape',
        resolvedRole: 'Figure',
        reachable: true,
        directContent: true,
        subtreeMcidCount: 1,
        hasAlt: false,
        checkerVisible: false,
        safeRoleMapRetagTarget: true,
        blocker: 'role_map_mismatch',
      }],
    });

    expect(classified.candidateClass).toBe('excluded_observation');
    expect(classified.implementable).toBe(false);
  });

  it('reports terminal figure outcomes and attempted target refs without treating them as success', () => {
    const row = buildStage73Row(
      { id: 'v1-4145', publicationId: '4145', title: 'Doc', localFile: 'doc.pdf' },
      snapshot({
        figures: [
          { hasAlt: true, isArtifact: false, page: 0, rawRole: 'Figure', role: 'Figure', structRef: '70_0', reachable: true, directContent: true, subtreeMcidCount: 1 },
          { hasAlt: false, isArtifact: false, page: 1, rawRole: 'InlineShape', role: 'Figure', structRef: '80_0', reachable: true, directContent: true, subtreeMcidCount: 1 },
        ],
      }),
      {
        afterScore: 78,
        afterGrade: 'C',
        afterCategories: [{ key: 'alt_text', score: 20 }],
        falsePositiveApplied: 0,
        appliedTools: [
          { toolName: 'retag_as_figure', outcome: 'applied', details: JSON.stringify({ invariants: { targetRef: '70_0' } }) },
          { toolName: 'set_figure_alt_text', outcome: 'no_effect', details: JSON.stringify({ note: 'target_not_checker_visible_figure', invariants: { targetRef: '90_0', targetIsFigureAfter: false } }) },
          { toolName: 'canonicalize_figure_alt_ownership', outcome: 'no_effect', details: JSON.stringify({ note: 'no_structural_change' }) },
        ],
      },
    );

    expect(row.retagAppliedCount).toBe(1);
    expect(row.terminalSetAltNoEffectCount).toBe(1);
    expect(row.terminalCanonicalizeNoEffectCount).toBe(1);
    expect(row.attemptedTargetRefs).toEqual(['70_0', '90_0']);
    expect(row.remainingSafeRoleMapTargets).toEqual(['80_0']);
  });

  it('selects implementation only when at least one conservative candidate exists', () => {
    const report = buildStage73Report('run', [
      {
        id: 'v1-4145',
        publicationId: '4145',
        title: 'Doc',
        file: 'doc.pdf',
        afterScore: 78,
        afterGrade: 'C',
        altTextScore: 20,
        falsePositiveApplied: 0,
        retagAppliedCount: 2,
        terminalSetAltNoEffectCount: 1,
        terminalCanonicalizeNoEffectCount: 1,
        attemptedTargetRefs: [],
        remainingSafeRoleMapTargetCount: 1,
        remainingSafeRoleMapTargets: ['80_0'],
        candidateClass: 'stable_rolemap_retag_progression_candidate',
        implementable: true,
        reason: 'test',
        candidates: [],
      },
    ]);

    expect(report.decision.selectedRows).toEqual(['v1-4145']);
    expect(report.decision.recommendedDirection).toBe('implement_bounded_rolemap_retag_progression');
  });
});

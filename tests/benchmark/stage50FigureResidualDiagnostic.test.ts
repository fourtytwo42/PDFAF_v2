import { describe, expect, it } from 'vitest';
import {
  buildFigureCandidateDiagnostics,
  summarizeFigureCandidates,
} from '../../scripts/stage50-figure-residual-diagnostic.js';
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

describe('Stage 50 figure residual diagnostic helpers', () => {
  it('reports role-mapped figure candidates with raw role, resolved role, reachability, and alt state', () => {
    const rows = buildFigureCandidateDiagnostics(snapshot({
      figures: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        rawRole: 'InlineShape',
        role: 'Figure',
        structRef: '10_0',
        reachable: true,
        directContent: true,
        subtreeMcidCount: 1,
        parentPath: ['Document', 'InlineShape'],
      }],
    }));

    expect(rows).toEqual([expect.objectContaining({
      structRef: '10_0',
      rawRole: 'InlineShape',
      resolvedRole: 'Figure',
      reachable: true,
      directContent: true,
      hasAlt: false,
      checkerVisible: false,
      safeRoleMapRetagTarget: true,
      blocker: 'role_map_mismatch',
    })]);
    expect(summarizeFigureCandidates(rows).safeRoleMapRetagTargetCount).toBe(1);
  });

  it('reports unreachable and contentless candidates but does not classify them as safe retag targets', () => {
    const rows = buildFigureCandidateDiagnostics(snapshot({
      figures: [
        { hasAlt: false, isArtifact: false, page: 0, rawRole: 'Shape', role: 'Figure', structRef: '11_0', reachable: false, directContent: true, subtreeMcidCount: 1 },
        { hasAlt: false, isArtifact: false, page: 0, rawRole: 'InlineShape', role: 'Figure', structRef: '12_0', reachable: true, directContent: false, subtreeMcidCount: 0 },
      ],
    }));

    expect(rows.map(row => row.safeRoleMapRetagTarget)).toEqual([false, false]);
    expect(rows.map(row => row.blocker)).toEqual(['unreachable', 'no_content']);
  });

  it('marks raw reachable /Figure targets as checker-visible missing-alt candidates', () => {
    const rows = buildFigureCandidateDiagnostics(snapshot({
      figures: [{ hasAlt: false, isArtifact: false, page: 0, rawRole: 'Figure', role: 'Figure', structRef: '13_0', reachable: true, directContent: true, subtreeMcidCount: 1 }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Figure',
        resolvedRole: 'Figure',
        structRef: '13_0',
        reachable: true,
        directContent: true,
        parentPath: [],
      }],
    }));

    expect(rows[0]).toMatchObject({
      checkerVisible: true,
      blocker: 'missing_alt',
      safeRoleMapRetagTarget: false,
    });
  });
});

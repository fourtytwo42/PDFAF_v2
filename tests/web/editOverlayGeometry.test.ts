import { describe, expect, it } from 'vitest';
import {
  clampEditZoom,
  convertPdfBoundsToOverlayRect,
  getVisiblePageWindow,
  groupIssuesForPage,
  stepEditZoom,
} from '../../apps/pdf-af-web/lib/editor/editOverlayGeometry';
import type { EditorIssue } from '../../apps/pdf-af-web/types/editor';

function issue(overrides: Partial<EditorIssue>): EditorIssue {
  return {
    id: 'issue-1',
    source: 'analyzer',
    category: 'metadata',
    severity: 'blocker',
    message: 'Issue',
    fixType: 'analyzer_metadata',
    fixState: 'needs-input',
    ...overrides,
  };
}

describe('edit overlay geometry', () => {
  it('converts PDF bounds to rendered overlay coordinates', () => {
    const rect = convertPdfBoundsToOverlayRect(
      { x: 50, y: 100, width: 200, height: 80 },
      { width: 500, height: 700 },
      { width: 1000, height: 1400 },
    );

    expect(rect).toEqual({
      left: 100,
      top: 1040,
      width: 400,
      height: 160,
    });
  });

  it('inverts the PDF y axis for CSS top positioning', () => {
    const rect = convertPdfBoundsToOverlayRect(
      { x: 0, y: 650, width: 100, height: 50 },
      { width: 500, height: 700 },
      { width: 500, height: 700 },
    );

    expect(rect.top).toBe(0);
  });

  it('groups page-level and inspector-only issues', () => {
    const groups = groupIssuesForPage(
      [
        issue({ id: 'bounds', page: 2, bounds: { x: 1, y: 2, width: 3, height: 4 } }),
        issue({ id: 'page', page: 2 }),
        issue({ id: 'other-page', page: 1 }),
        issue({ id: 'inspector-only' }),
      ],
      2,
    );

    expect(groups.pageIssues.map((item) => item.id)).toEqual(['bounds', 'page']);
    expect(groups.boundsIssues.map((item) => item.id)).toEqual(['bounds']);
    expect(groups.pageMarkerIssues.map((item) => item.id)).toEqual(['page']);
    expect(groups.inspectorOnlyIssues.map((item) => item.id)).toEqual(['inspector-only']);
  });

  it('clamps zoom and steps within boundaries', () => {
    expect(clampEditZoom(0.1)).toBe(0.5);
    expect(clampEditZoom(1)).toBe(1);
    expect(clampEditZoom(3)).toBe(2);
    expect(stepEditZoom(1.9, 'in')).toBe(2);
    expect(stepEditZoom(0.6, 'out')).toBe(0.5);
  });

  it('returns a bounded visible page window', () => {
    expect(getVisiblePageWindow(1, 5)).toEqual([1, 2]);
    expect(getVisiblePageWindow(3, 5)).toEqual([2, 3, 4]);
    expect(getVisiblePageWindow(5, 5)).toEqual([4, 5]);
  });
});

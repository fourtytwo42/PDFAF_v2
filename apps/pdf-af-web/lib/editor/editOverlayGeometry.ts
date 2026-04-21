import type { EditorIssue, EditorIssueBounds } from '../../types/editor';

export const EDIT_MIN_ZOOM = 0.5;
export const EDIT_MAX_ZOOM = 2;
export const EDIT_ZOOM_STEP = 0.25;

export interface EditPageRenderInfo {
  page: number;
  width: number;
  height: number;
  renderedScale: number;
}

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PageIssueGroups {
  pageIssues: EditorIssue[];
  boundsIssues: EditorIssue[];
  pageMarkerIssues: EditorIssue[];
  inspectorOnlyIssues: EditorIssue[];
}

export function clampEditZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(EDIT_MAX_ZOOM, Math.max(EDIT_MIN_ZOOM, Math.round(zoom * 100) / 100));
}

export function stepEditZoom(zoom: number, direction: 'in' | 'out'): number {
  return clampEditZoom(zoom + (direction === 'in' ? EDIT_ZOOM_STEP : -EDIT_ZOOM_STEP));
}

export function getVisiblePageWindow(
  selectedPage: number,
  pageCount: number,
  radius = 1,
): number[] {
  if (pageCount <= 0) return [];

  const clampedPage = Math.min(pageCount, Math.max(1, selectedPage));
  const start = Math.max(1, clampedPage - radius);
  const end = Math.min(pageCount, clampedPage + radius);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function convertPdfBoundsToOverlayRect(
  bounds: EditorIssueBounds,
  pageSize: { width: number; height: number },
  renderedSize: { width: number; height: number },
): OverlayRect {
  const xScale = renderedSize.width / pageSize.width;
  const yScale = renderedSize.height / pageSize.height;

  return {
    left: bounds.x * xScale,
    top: (pageSize.height - bounds.y - bounds.height) * yScale,
    width: bounds.width * xScale,
    height: bounds.height * yScale,
  };
}

export function groupIssuesForPage(issues: EditorIssue[], page: number): PageIssueGroups {
  const pageIssues = issues.filter((issue) => issue.page === page);

  return {
    pageIssues,
    boundsIssues: pageIssues.filter((issue) => Boolean(issue.bounds)),
    pageMarkerIssues: pageIssues.filter((issue) => !issue.bounds),
    inspectorOnlyIssues: issues.filter((issue) => issue.page == null),
  };
}

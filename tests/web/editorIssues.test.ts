import { describe, expect, it } from 'vitest';
import {
  classifyReadiness,
  computeReadinessSummary,
  filterEditorIssues,
  findAdjacentIssueId,
} from '../../apps/pdf-af-web/lib/editor/issues';
import type { EditorIssue } from '../../apps/pdf-af-web/types/editor';

function issue(overrides: Partial<EditorIssue>): EditorIssue {
  return {
    id: 'issue-1',
    source: 'authoring-validator',
    category: 'alt_text',
    severity: 'blocker',
    message: 'Image needs alt text.',
    fixType: 'image_alt_text',
    fixState: 'open',
    ...overrides,
  };
}

describe('editor issue readiness', () => {
  it('is ready when no unresolved blocker or warning exists', () => {
    const issues = [
      issue({ id: 'fixed-blocker', severity: 'blocker', fixState: 'fixed' }),
      issue({ id: 'info', severity: 'info', fixState: 'open' }),
    ];

    expect(classifyReadiness(issues)).toBe('ready');
    expect(computeReadinessSummary(issues)).toMatchObject({
      status: 'ready',
      totalIssues: 2,
      unresolvedIssues: 1,
      blockerCount: 0,
      warningCount: 0,
      infoCount: 1,
      fixedCount: 1,
    });
  });

  it('is blocked with an unresolved blocker', () => {
    const issues = [issue({ id: 'blocker', severity: 'blocker', fixState: 'needs-input' })];

    expect(classifyReadiness(issues)).toBe('blocked');
    expect(computeReadinessSummary(issues).blockerCount).toBe(1);
  });

  it('needs attention with an unresolved warning only', () => {
    const issues = [issue({ id: 'warning', severity: 'warning', fixState: 'ready' })];

    expect(classifyReadiness(issues)).toBe('needs_attention');
    expect(computeReadinessSummary(issues).warningCount).toBe(1);
  });

  it('does not let fixed blockers block readiness', () => {
    const issues = [issue({ id: 'fixed-blocker', severity: 'blocker', fixState: 'fixed' })];

    expect(classifyReadiness(issues)).toBe('ready');
  });
});

describe('editor issue filtering', () => {
  const issues = [
    issue({ id: 'alt', severity: 'blocker', category: 'alt_text', fixState: 'open' }),
    issue({ id: 'heading', severity: 'warning', category: 'heading_structure', fixState: 'ready' }),
    issue({ id: 'meta', severity: 'info', category: 'title_language', fixState: 'fixed' }),
  ];

  it('filters by severity', () => {
    expect(filterEditorIssues(issues, { severity: 'warning' }).map((item) => item.id)).toEqual([
      'heading',
    ]);
  });

  it('filters by category', () => {
    expect(filterEditorIssues(issues, { category: 'alt_text' }).map((item) => item.id)).toEqual([
      'alt',
    ]);
  });

  it('filters by fix state and unresolved state', () => {
    expect(filterEditorIssues(issues, { fixState: 'fixed' }).map((item) => item.id)).toEqual([
      'meta',
    ]);
    expect(filterEditorIssues(issues, { fixState: 'unresolved' }).map((item) => item.id)).toEqual([
      'alt',
      'heading',
    ]);
  });
});

describe('editor issue navigation', () => {
  const issues = [
    issue({ id: 'first' }),
    issue({ id: 'second' }),
    issue({ id: 'third' }),
  ];

  it('wraps next and previous navigation', () => {
    expect(findAdjacentIssueId(issues, 'first', 'next')).toBe('second');
    expect(findAdjacentIssueId(issues, 'first', 'previous')).toBe('third');
    expect(findAdjacentIssueId(issues, 'third', 'next')).toBe('first');
  });

  it('returns the first issue when selection is missing', () => {
    expect(findAdjacentIssueId(issues, null, 'next')).toBe('first');
    expect(findAdjacentIssueId(issues, 'missing', 'next')).toBe('first');
  });
});

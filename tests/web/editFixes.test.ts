import { describe, expect, it } from 'vitest';
import {
  applyPendingFixStateToIssues,
  removeEditFix,
  upsertEditFix,
  validateEditFix,
  validateEditFixes,
} from '../../apps/pdf-af-web/lib/editor/editFixes';
import type { EditFixInstruction } from '../../apps/pdf-af-web/types/editEditor';
import type { EditorIssue } from '../../apps/pdf-af-web/types/editor';

function issue(overrides: Partial<EditorIssue>): EditorIssue {
  return {
    id: 'issue-1',
    source: 'analyzer',
    category: 'Title and Language',
    severity: 'blocker',
    message: 'Missing title',
    fixType: 'analyzer_title_language',
    fixState: 'needs-input',
    ...overrides,
  };
}

describe('edit fix helpers', () => {
  it('validates required metadata and alt fields', () => {
    expect(validateEditFix({ type: 'set_document_title', title: '  ' })).toMatch(/title/i);
    expect(validateEditFix({ type: 'set_document_language', language: '' })).toMatch(/language/i);
    expect(
      validateEditFix({ type: 'set_figure_alt_text', objectRef: 'fig-1', altText: '' }),
    ).toMatch(/alt text/i);
    expect(validateEditFix({ type: 'mark_figure_decorative', objectRef: '' })).toMatch(/target/i);
  });

  it('rejects an empty fix list', () => {
    expect(validateEditFixes([])).toMatch(/at least one/i);
  });

  it('upserts and removes fixes by stable key', () => {
    const fixes: EditFixInstruction[] = [
      { type: 'set_document_title', title: 'Old' },
      { type: 'set_figure_alt_text', objectRef: 'fig-1', altText: 'Old alt' },
    ];

    const updated = upsertEditFix(fixes, { type: 'set_document_title', title: 'New' });
    expect(updated).toContainEqual({ type: 'set_document_title', title: 'New' });
    expect(updated).not.toContainEqual({ type: 'set_document_title', title: 'Old' });

    expect(removeEditFix(updated, 'set_figure_alt_text', 'fig-1')).not.toContainEqual({
      type: 'set_figure_alt_text',
      objectRef: 'fig-1',
      altText: 'Old alt',
    });
  });

  it('marks matching issues ready while fixes are pending', () => {
    const issues = [
      issue({ id: 'metadata' }),
      issue({
        id: 'figure',
        category: 'Alt Text',
        target: { objectRef: 'fig-1' },
        fixState: 'needs-input',
      }),
      issue({
        id: 'other-figure',
        category: 'Alt Text',
        target: { objectRef: 'fig-2' },
        fixState: 'needs-input',
      }),
    ];

    const next = applyPendingFixStateToIssues(issues, [
      { type: 'set_document_title', title: 'Report' },
      { type: 'set_figure_alt_text', objectRef: 'fig-1', altText: 'Chart showing trend' },
    ]);

    expect(next.find((item) => item.id === 'metadata')?.fixState).toBe('ready');
    expect(next.find((item) => item.id === 'figure')?.fixState).toBe('ready');
    expect(next.find((item) => item.id === 'other-figure')?.fixState).toBe('needs-input');
  });
});

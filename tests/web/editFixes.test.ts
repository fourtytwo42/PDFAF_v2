import { describe, expect, it } from 'vitest';
import {
  applyPendingFixStateToIssues,
  getEditIssueFixPromptMode,
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
    expect(validateEditFix({ type: 'set_pdfua_identification', language: '' })).toMatch(/pdf\/ua/i);
    expect(
      validateEditFix({ type: 'set_figure_alt_text', objectRef: 'fig-1', altText: '' }),
    ).toMatch(/alt text/i);
    expect(validateEditFix({ type: 'mark_figure_decorative', objectRef: '' })).toMatch(/target/i);
  });

  it('classifies issue prompt modes by available guided fix support', () => {
    expect(getEditIssueFixPromptMode(issue({ category: 'Title and Language' }))).toBe('metadata');
    expect(getEditIssueFixPromptMode(issue({ category: 'title_language' }))).toBe('metadata');
    expect(
      getEditIssueFixPromptMode(
        issue({
          category: 'PDF/UA Compliance',
          message: 'Document language (/Lang) is not specified.',
        }),
      ),
    ).toBe('metadata');
    expect(
      getEditIssueFixPromptMode(
        issue({
          category: 'PDF/UA Compliance',
          message: 'XMP metadata does not declare PDF/UA conformance (pdfuaid:part missing).',
        }),
      ),
    ).toBe('metadata');
    expect(
      getEditIssueFixPromptMode(issue({ category: 'Alt Text', target: { objectRef: 'fig-1' } })),
    ).toBe('alt-text');
    expect(getEditIssueFixPromptMode(issue({ category: 'Alt Text' }))).toBe('info');
    expect(getEditIssueFixPromptMode(issue({ category: 'Reading Order' }))).toBe('info');
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

  it('keeps combined metadata findings open until title and language are both queued', () => {
    const issues = [
      issue({
        id: 'metadata',
        category: 'title_language',
        message: 'Document is missing both /Title and /Lang.',
        whyItMatters: 'Title and language are required for assistive technology.',
      }),
    ];

    const titleOnly = applyPendingFixStateToIssues(issues, [
      { type: 'set_document_title', title: 'Report' },
    ]);
    expect(titleOnly[0]?.fixState).toBe('needs-input');

    const complete = applyPendingFixStateToIssues(issues, [
      { type: 'set_document_title', title: 'Report' },
      { type: 'set_document_language', language: 'en-US' },
    ]);
    expect(complete[0]?.fixState).toBe('ready');
  });

  it('marks PDF/UA language and identification findings ready with matching metadata fixes', () => {
    const issues = [
      issue({
        id: 'language',
        category: 'PDF/UA Compliance',
        message: 'Document language (/Lang) is not specified.',
      }),
      issue({
        id: 'pdfua',
        category: 'PDF/UA Compliance',
        message: 'XMP metadata does not declare PDF/UA conformance (pdfuaid:part missing).',
      }),
    ];

    const languageOnly = applyPendingFixStateToIssues(issues, [
      { type: 'set_document_language', language: 'en-US' },
    ]);
    expect(languageOnly.find((item) => item.id === 'language')?.fixState).toBe('ready');
    expect(languageOnly.find((item) => item.id === 'pdfua')?.fixState).toBe('needs-input');

    const pdfUa = applyPendingFixStateToIssues(issues, [
      { type: 'set_pdfua_identification', language: 'en-US' },
    ]);
    expect(pdfUa.map((item) => item.fixState)).toEqual(['ready', 'ready']);
  });
});

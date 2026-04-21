import { describe, expect, it } from 'vitest';
import { exportCreateDocumentToPdf } from '../../apps/pdf-af-web/lib/editor/createExport';
import { validateCreateDocument } from '../../apps/pdf-af-web/lib/editor/createValidation';
import { validateEditFixes } from '../../apps/pdf-af-web/lib/editor/editFixes';
import { getVisiblePageWindow } from '../../apps/pdf-af-web/lib/editor/editOverlayGeometry';
import {
  computeReadinessSummary,
  filterEditorIssues,
} from '../../apps/pdf-af-web/lib/editor/issues';
import type { CreateDocument } from '../../apps/pdf-af-web/types/createEditor';
import type { EditFixInstruction } from '../../apps/pdf-af-web/types/editEditor';
import type { EditorIssue } from '../../apps/pdf-af-web/types/editor';

function issue(overrides: Partial<EditorIssue>): EditorIssue {
  return {
    id: overrides.id ?? 'issue-1',
    source: overrides.source ?? 'analyzer',
    category: overrides.category ?? 'title_language',
    severity: overrides.severity ?? 'blocker',
    message: overrides.message ?? 'Issue',
    fixType: overrides.fixType ?? 'test',
    fixState: overrides.fixState ?? 'needs-input',
    ...overrides,
  };
}

function createDocumentFixture(): CreateDocument {
  return {
    id: 'doc',
    metadata: {
      title: 'Prototype Gate',
      language: 'en-US',
    },
    pages: [
      {
        id: 'page-1',
        title: 'Page 1',
        objects: [
          { id: 'h1', type: 'heading', text: 'Prototype Gate', level: 1 },
          { id: 'p1', type: 'paragraph', text: 'A structured document.' },
          {
            id: 'image-1',
            type: 'image',
            label: 'Chart',
            altText: 'Chart showing progress.',
            decorative: false,
          },
          {
            id: 'table-1',
            type: 'table',
            caption: 'Metrics',
            hasHeaderRow: true,
            rows: [
              {
                id: 'row-1',
                cells: [
                  { id: 'cell-1', text: 'Metric' },
                  { id: 'cell-2', text: 'Value' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('editor thin prototype gate', () => {
  it('supports issue sources across create, export, and edit workflows', () => {
    const issues = [
      issue({ id: 'create', source: 'authoring-validator' }),
      issue({ id: 'export', source: 'export-check', severity: 'warning' }),
      issue({ id: 'edit', source: 'analyzer', severity: 'info' }),
      issue({ id: 'fix', source: 'remediation', fixState: 'fixed' }),
    ];

    const readiness = computeReadinessSummary(issues);

    expect(readiness.status).toBe('blocked');
    expect(readiness.totalIssues).toBe(4);
    expect(filterEditorIssues(issues, { fixState: 'unresolved' }).map((item) => item.id)).toEqual([
      'create',
      'export',
      'edit',
    ]);
  });

  it('keeps create validation and export helpers contract-compatible', async () => {
    const document = createDocumentFixture();
    const issues = validateCreateDocument(document);
    const exported = await exportCreateDocumentToPdf(document);

    expect(issues).toEqual([]);
    expect(exported.blob.type).toBe('application/pdf');
    expect(exported.fileName).toBe('prototype-gate.pdf');
  });

  it('validates edit guided fix instructions without analyzer/runtime dependencies', () => {
    const fixes: EditFixInstruction[] = [
      { type: 'set_document_title', title: 'Reviewed Report' },
      { type: 'set_document_language', language: 'en-US' },
      {
        type: 'set_figure_alt_text',
        objectRef: 'figure-1',
        altText: 'Line chart showing improvement.',
      },
      { type: 'mark_figure_decorative', objectRef: 'figure-2' },
    ];

    expect(validateEditFixes(fixes)).toBeNull();
  });

  it('preserves the long-PDF selected-page render window contract', () => {
    expect(getVisiblePageWindow(1, 50)).toEqual([1, 2]);
    expect(getVisiblePageWindow(25, 50)).toEqual([24, 25, 26]);
    expect(getVisiblePageWindow(50, 50)).toEqual([49, 50]);
  });
});

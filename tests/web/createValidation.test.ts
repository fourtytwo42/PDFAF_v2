import { describe, expect, it } from 'vitest';
import { computeReadinessSummary } from '../../apps/pdf-af-web/lib/editor/issues';
import { validateCreateDocument } from '../../apps/pdf-af-web/lib/editor/createValidation';
import type { CreateDocument } from '../../apps/pdf-af-web/types/createEditor';

function documentFixture(overrides: Partial<CreateDocument> = {}): CreateDocument {
  const document: CreateDocument = {
    id: 'doc',
    metadata: {
      title: 'Accessible draft',
      language: 'en-US',
    },
    pages: [
      {
        id: 'page-1',
        title: 'Page 1',
        objects: [
          {
            id: 'h1',
            type: 'heading',
            text: 'Title',
            level: 1,
          },
          {
            id: 'image-1',
            type: 'image',
            label: 'Chart image',
            altText: 'Chart showing stable revenue.',
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

  return {
    ...document,
    ...overrides,
    metadata: {
      ...document.metadata,
      ...overrides.metadata,
    },
    pages: overrides.pages ?? document.pages,
  };
}

describe('create document validation', () => {
  it('reports missing title and language as blockers', () => {
    const issues = validateCreateDocument(
      documentFixture({
        metadata: {
          title: '',
          language: '',
        },
      }),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'title_language', fixType: 'document_title', severity: 'blocker' }),
        expect.objectContaining({ category: 'title_language', fixType: 'document_language', severity: 'blocker' }),
      ]),
    );
  });

  it('requires image alt text unless image is decorative', () => {
    const missingAlt = validateCreateDocument(
      documentFixture({
        pages: [
          {
            id: 'page-1',
            title: 'Page 1',
            objects: [
              {
                id: 'image-1',
                type: 'image',
                label: 'Logo',
                altText: '',
                decorative: false,
              },
            ],
          },
        ],
      }),
    );

    expect(missingAlt).toEqual([
      expect.objectContaining({
        category: 'alt_text',
        fixType: 'image_alt_text',
        target: expect.objectContaining({ pageId: 'page-1', objectId: 'image-1' }),
      }),
    ]);

    const decorative = validateCreateDocument(
      documentFixture({
        pages: [
          {
            id: 'page-1',
            title: 'Page 1',
            objects: [
              {
                id: 'image-1',
                type: 'image',
                label: 'Divider',
                altText: '',
                decorative: true,
              },
            ],
          },
        ],
      }),
    );

    expect(decorative).toHaveLength(0);
  });

  it('reports table without header row as a blocker', () => {
    const issues = validateCreateDocument(
      documentFixture({
        pages: [
          {
            id: 'page-1',
            title: 'Page 1',
            objects: [
              {
                id: 'table-1',
                type: 'table',
                caption: 'Metrics',
                hasHeaderRow: false,
                rows: [],
              },
            ],
          },
        ],
      }),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        category: 'table_markup',
        fixType: 'table_header_row',
        severity: 'blocker',
        target: expect.objectContaining({ objectId: 'table-1' }),
      }),
    ]);
  });

  it('reports skipped heading levels as a warning', () => {
    const issues = validateCreateDocument(
      documentFixture({
        pages: [
          {
            id: 'page-1',
            title: 'Page 1',
            objects: [
              { id: 'h1', type: 'heading', text: 'Title', level: 1 },
              { id: 'h3', type: 'heading', text: 'Details', level: 3 },
            ],
          },
        ],
      }),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        category: 'heading_structure',
        severity: 'warning',
        target: expect.objectContaining({ pageId: 'page-1', objectId: 'h3' }),
      }),
    ]);
  });

  it('becomes ready when blockers and warnings are fixed', () => {
    const issues = validateCreateDocument(documentFixture());
    const readiness = computeReadinessSummary(issues);

    expect(issues).toHaveLength(0);
    expect(readiness.status).toBe('ready');
  });
});

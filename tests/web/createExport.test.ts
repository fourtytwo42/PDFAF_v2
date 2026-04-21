import { describe, expect, it } from 'vitest';
import { exportCreateDocumentToPdf } from '../../apps/pdf-af-web/lib/editor/createExport';
import type { CreateDocument } from '../../apps/pdf-af-web/types/createEditor';

function documentFixture(title = 'Quarterly Accessibility Report'): CreateDocument {
  return {
    id: 'doc',
    metadata: {
      title,
      language: 'en-US',
    },
    pages: [
      {
        id: 'page-1',
        title: 'Page 1',
        objects: [
          { id: 'h1', type: 'heading', text: 'Quarterly Accessibility Report', level: 1 },
          {
            id: 'p1',
            type: 'paragraph',
            text: 'This document was generated from structured authoring data.',
          },
          {
            id: 'image-1',
            type: 'image',
            label: 'Trend image',
            altText: 'Line chart showing improvement across quarters.',
            decorative: false,
          },
          {
            id: 'table-1',
            type: 'table',
            caption: 'Accessibility metrics',
            hasHeaderRow: true,
            rows: [
              {
                id: 'row-1',
                cells: [
                  { id: 'cell-1', text: 'Metric' },
                  { id: 'cell-2', text: 'Value' },
                ],
              },
              {
                id: 'row-2',
                cells: [
                  { id: 'cell-3', text: 'Score' },
                  { id: 'cell-4', text: '100' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'page-2',
        title: 'Page 2',
        objects: [{ id: 'h2', type: 'heading', text: 'Details', level: 2 }],
      },
    ],
  };
}

async function blobTextPrefix(blob: Blob, length: number): Promise<string> {
  const text = await blob.slice(0, length).text();
  return text;
}

describe('create PDF export spike', () => {
  it('exports a non-empty PDF blob', async () => {
    const result = await exportCreateDocumentToPdf(documentFixture());

    expect(result.blob.type).toBe('application/pdf');
    expect(result.blob.size).toBeGreaterThan(100);
    expect(await blobTextPrefix(result.blob, 4)).toBe('%PDF');
  });

  it('uses a sanitized title for the filename', async () => {
    const result = await exportCreateDocumentToPdf(documentFixture('Quarterly Report: Q1/Q2.pdf'));

    expect(result.fileName).toBe('quarterly-report-q1-q2.pdf');
  });

  it('uses a stable fallback filename when title is missing', async () => {
    const result = await exportCreateDocumentToPdf(documentFixture('   '));

    expect(result.fileName).toBe('untitled-accessible-draft.pdf');
  });
});

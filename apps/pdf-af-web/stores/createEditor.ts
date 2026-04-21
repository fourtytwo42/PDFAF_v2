'use client';

import { create } from 'zustand';
import { analyzePdf } from '../lib/api/pdfafClient';
import { mapAnalyzeFindingsToEditorIssues } from '../lib/editor/analyzeFindings';
import { exportCreateDocumentToPdf } from '../lib/editor/createExport';
import { validateCreateDocument } from '../lib/editor/createValidation';
import type { AnalyzeSummary } from '../types/analyze';
import type {
  CreateDocument,
  CreateEditorSelection,
  CreateHeadingObject,
  CreateImageObject,
  CreatePage,
  CreatePageObject,
  CreateParagraphObject,
  CreateTableCell,
  CreateTableObject,
  CreateTableRow,
} from '../types/createEditor';
import type { EditorIssue } from '../types/editor';

export type CreateExportStatus = 'idle' | 'exporting' | 'analyzing' | 'complete' | 'failed';

interface CreateEditorStoreState {
  document: CreateDocument;
  selection: CreateEditorSelection;
  exportStatus: CreateExportStatus;
  exportError: string | null;
  lastExportFileName: string | null;
  lastAnalyzeResult: AnalyzeSummary | null;
  exportIssues: EditorIssue[];
  selectPage: (pageId: string) => void;
  selectObject: (pageId: string, objectId: string) => void;
  clearObjectSelection: () => void;
  updateMetadata: (metadata: Partial<CreateDocument['metadata']>) => void;
  addHeading: () => void;
  addParagraph: () => void;
  addImage: () => void;
  addTable: () => void;
  updateSelectedObject: (updates: Partial<CreatePageObject>) => void;
  exportAndAnalyze: (apiBaseUrl: string) => Promise<void>;
  clearExportResult: () => void;
}

function createId(prefix: string): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function cell(text: string): CreateTableCell {
  return {
    id: createId('cell'),
    text,
  };
}

function row(cells: string[]): CreateTableRow {
  return {
    id: createId('row'),
    cells: cells.map(cell),
  };
}

function createDefaultDocument(): CreateDocument {
  const heading: CreateHeadingObject = {
    id: createId('heading'),
    type: 'heading',
    text: 'Accessible report title',
    level: 1,
  };
  const paragraph: CreateParagraphObject = {
    id: createId('paragraph'),
    type: 'paragraph',
    text: 'Start with real text and semantic structure so the exported PDF can stay accessible.',
  };
  const image: CreateImageObject = {
    id: createId('image'),
    type: 'image',
    label: 'Image placeholder',
    altText: '',
    decorative: false,
  };
  const table: CreateTableObject = {
    id: createId('table'),
    type: 'table',
    caption: 'Sample data table',
    hasHeaderRow: true,
    rows: [
      row(['Metric', 'Status']),
      row(['Title', 'Missing']),
      row(['Language', 'Missing']),
    ],
  };
  const skippedHeading: CreateHeadingObject = {
    id: createId('heading'),
    type: 'heading',
    text: 'Skipped heading example',
    level: 3,
  };

  const pages: CreatePage[] = [
    {
      id: createId('page'),
      title: 'Page 1',
      objects: [heading, paragraph, image, table],
    },
    {
      id: createId('page'),
      title: 'Page 2',
      objects: [skippedHeading],
    },
  ];

  return {
    id: createId('document'),
    metadata: {
      title: '',
      language: '',
    },
    pages,
  };
}

function getSelectedPage(document: CreateDocument, selection: CreateEditorSelection): CreatePage {
  return (
    document.pages.find((page) => page.id === selection.pageId) ??
    document.pages[0] ?? {
      id: createId('page'),
      title: 'Page 1',
      objects: [],
    }
  );
}

function appendObject(document: CreateDocument, selection: CreateEditorSelection, object: CreatePageObject) {
  const page = getSelectedPage(document, selection);

  return {
    document: {
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.id === page.id
          ? {
              ...candidate,
              objects: [...candidate.objects, object],
            }
          : candidate,
      ),
    },
    selection: {
      pageId: page.id,
      objectId: object.id,
    },
  };
}

function updateObject(document: CreateDocument, selection: CreateEditorSelection, updates: Partial<CreatePageObject>) {
  if (!selection.pageId || !selection.objectId) return document;

  return {
    ...document,
    pages: document.pages.map((page) =>
      page.id === selection.pageId
        ? {
            ...page,
            objects: page.objects.map((object) =>
              object.id === selection.objectId
                ? ({
                    ...object,
                    ...updates,
                    type: object.type,
                    id: object.id,
                  } as CreatePageObject)
                : object,
            ),
          }
        : page,
    ),
  };
}

const defaultDocument = createDefaultDocument();

const clearedExportState = {
  exportStatus: 'idle' as const,
  exportError: null,
  lastAnalyzeResult: null,
  exportIssues: [],
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'Export or analysis failed.';
}

export const useCreateEditorStore = create<CreateEditorStoreState>((set, get) => ({
  document: defaultDocument,
  selection: {
    pageId: defaultDocument.pages[0]?.id ?? null,
    objectId: null,
  },
  exportStatus: 'idle',
  exportError: null,
  lastExportFileName: null,
  lastAnalyzeResult: null,
  exportIssues: [],
  selectPage: (pageId) => set({ selection: { pageId, objectId: null } }),
  selectObject: (pageId, objectId) => set({ selection: { pageId, objectId } }),
  clearObjectSelection: () =>
    set((state) => ({
      selection: {
        pageId: state.selection.pageId ?? state.document.pages[0]?.id ?? null,
        objectId: null,
      },
    })),
  updateMetadata: (metadata) =>
    set((state) => ({
      document: {
        ...state.document,
        metadata: {
          ...state.document.metadata,
          ...metadata,
        },
      },
      ...clearedExportState,
    })),
  addHeading: () =>
    set((state) => ({
      ...appendObject(state.document, state.selection, {
        id: createId('heading'),
        type: 'heading',
        text: 'New heading',
        level: 2,
      }),
      ...clearedExportState,
    })),
  addParagraph: () =>
    set((state) => ({
      ...appendObject(state.document, state.selection, {
        id: createId('paragraph'),
        type: 'paragraph',
        text: 'New paragraph text.',
      }),
      ...clearedExportState,
    })),
  addImage: () =>
    set((state) => ({
      ...appendObject(state.document, state.selection, {
        id: createId('image'),
        type: 'image',
        label: 'Image placeholder',
        altText: '',
        decorative: false,
      }),
      ...clearedExportState,
    })),
  addTable: () =>
    set((state) => ({
      ...appendObject(state.document, state.selection, {
        id: createId('table'),
        type: 'table',
        caption: 'New table',
        hasHeaderRow: true,
        rows: [row(['Header 1', 'Header 2']), row(['Value 1', 'Value 2'])],
      }),
      ...clearedExportState,
    })),
  updateSelectedObject: (updates) =>
    set((state) => ({
      document: updateObject(state.document, state.selection, updates),
      ...clearedExportState,
    })),
  exportAndAnalyze: async (apiBaseUrl) => {
    const document = get().document;
    const blockers = validateCreateDocument(document).filter(
      (issue) => issue.severity === 'blocker' && issue.fixState !== 'fixed',
    );
    if (blockers.length > 0) {
      set({
        exportStatus: 'failed',
        exportError: 'Resolve local blockers before exporting.',
        exportIssues: [],
        lastAnalyzeResult: null,
      });
      return;
    }

    set({
      exportStatus: 'exporting',
      exportError: null,
      lastAnalyzeResult: null,
      exportIssues: [],
      lastExportFileName: null,
    });

    try {
      const exported = await exportCreateDocumentToPdf(document);
      set({
        exportStatus: 'analyzing',
        lastExportFileName: exported.fileName,
      });

      const analysis = await analyzePdf(apiBaseUrl, exported.blob, exported.fileName);
      set({
        exportStatus: 'complete',
        lastAnalyzeResult: analysis,
        exportIssues: mapAnalyzeFindingsToEditorIssues(analysis.findings),
        exportError: null,
      });
    } catch (error) {
      set({
        exportStatus: 'failed',
        exportError: toErrorMessage(error),
        lastAnalyzeResult: null,
      });
    }
  },
  clearExportResult: () =>
    set({
      exportStatus: 'idle',
      exportError: null,
      lastExportFileName: null,
      lastAnalyzeResult: null,
      exportIssues: [],
    }),
}));

export function getSelectedCreateObject(
  document: CreateDocument,
  selection: CreateEditorSelection,
): CreatePageObject | null {
  const page = document.pages.find((candidate) => candidate.id === selection.pageId);
  if (!page || !selection.objectId) return null;
  return page.objects.find((object) => object.id === selection.objectId) ?? null;
}

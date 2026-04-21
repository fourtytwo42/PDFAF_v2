'use client';

import { create } from 'zustand';
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

interface CreateEditorStoreState {
  document: CreateDocument;
  selection: CreateEditorSelection;
  selectPage: (pageId: string) => void;
  selectObject: (pageId: string, objectId: string) => void;
  clearObjectSelection: () => void;
  updateMetadata: (metadata: Partial<CreateDocument['metadata']>) => void;
  addHeading: () => void;
  addParagraph: () => void;
  addImage: () => void;
  addTable: () => void;
  updateSelectedObject: (updates: Partial<CreatePageObject>) => void;
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

export const useCreateEditorStore = create<CreateEditorStoreState>((set, get) => ({
  document: defaultDocument,
  selection: {
    pageId: defaultDocument.pages[0]?.id ?? null,
    objectId: null,
  },
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
    })),
  addHeading: () =>
    set((state) =>
      appendObject(state.document, state.selection, {
        id: createId('heading'),
        type: 'heading',
        text: 'New heading',
        level: 2,
      }),
    ),
  addParagraph: () =>
    set((state) =>
      appendObject(state.document, state.selection, {
        id: createId('paragraph'),
        type: 'paragraph',
        text: 'New paragraph text.',
      }),
    ),
  addImage: () =>
    set((state) =>
      appendObject(state.document, state.selection, {
        id: createId('image'),
        type: 'image',
        label: 'Image placeholder',
        altText: '',
        decorative: false,
      }),
    ),
  addTable: () =>
    set((state) =>
      appendObject(state.document, state.selection, {
        id: createId('table'),
        type: 'table',
        caption: 'New table',
        hasHeaderRow: true,
        rows: [row(['Header 1', 'Header 2']), row(['Value 1', 'Value 2'])],
      }),
    ),
  updateSelectedObject: (updates) =>
    set((state) => ({
      document: updateObject(state.document, state.selection, updates),
    })),
}));

export function getSelectedCreateObject(
  document: CreateDocument,
  selection: CreateEditorSelection,
): CreatePageObject | null {
  const page = document.pages.find((candidate) => candidate.id === selection.pageId);
  if (!page || !selection.objectId) return null;
  return page.objects.find((object) => object.id === selection.objectId) ?? null;
}

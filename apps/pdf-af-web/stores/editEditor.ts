'use client';

import { create, type StateCreator } from 'zustand';
import { analyzePdf } from '../lib/api/pdfafClient';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../lib/constants/uploads';
import { mapAnalyzeFindingsToEditorIssues } from '../lib/editor/analyzeFindings';
import { clampEditZoom, stepEditZoom } from '../lib/editor/editOverlayGeometry';
import {
  clearActiveEditSource,
  loadActiveEditSource,
  saveActiveEditSource,
} from '../lib/editor/editStorage';
import { findAdjacentIssueId, filterEditorIssues, sortEditorIssues } from '../lib/editor/issues';
import type { AnalyzeSummary } from '../types/analyze';
import type {
  EditAnalyzeStatus,
  EditRenderStatus,
  EditSourceFileMetadata,
  EditStoredSourceFile,
} from '../types/editEditor';
import type { EditorIssue, EditorIssueFilter } from '../types/editor';

interface EditEditorStoreState {
  sourceFile: EditSourceFileMetadata | null;
  sourceBlob: Blob | null;
  analyzeStatus: EditAnalyzeStatus;
  analyzeError: string | null;
  selectedIssueId: string | null;
  issueFilter: EditorIssueFilter;
  lastAnalyzeResult: AnalyzeSummary | null;
  issues: EditorIssue[];
  validationMessage: string | null;
  selectedPage: number;
  zoom: number;
  renderStatus: EditRenderStatus;
  renderError: string | null;
  hydrate: () => Promise<void>;
  openFile: (file: File, apiBaseUrl: string) => Promise<void>;
  reanalyze: (apiBaseUrl: string) => Promise<void>;
  clearDocument: () => Promise<void>;
  setIssueFilter: (filter: EditorIssueFilter) => void;
  selectIssue: (issueId: string | null) => void;
  selectAdjacentIssue: (direction: 'next' | 'previous') => void;
  selectPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setRenderStatus: (status: EditRenderStatus, error?: string | null) => void;
}

type EditSet = Parameters<StateCreator<EditEditorStoreState>>[0];
type EditGet = Parameters<StateCreator<EditEditorStoreState>>[1];

function nowIso(): string {
  return new Date().toISOString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return 'Unable to analyze this PDF.';
}

function validatePdfFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const looksLikePdf =
    file.type === 'application/pdf' ||
    file.type === 'application/x-pdf' ||
    lowerName.endsWith('.pdf');

  if (!looksLikePdf) return 'Only PDF files are accepted.';
  if (file.size <= 0) return 'This file is empty.';
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `This file exceeds the ${MAX_UPLOAD_SIZE_MB} MB upload limit.`;
  }

  return null;
}

function buildMetadata(file: File): EditSourceFileMetadata {
  return {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/pdf',
    updatedAt: nowIso(),
  };
}

function mapAnalyzeResultToIssues(result: AnalyzeSummary): EditorIssue[] {
  return sortEditorIssues(
    mapAnalyzeFindingsToEditorIssues(result.findings, {
      source: 'analyzer',
      idPrefix: 'analyzer',
      fixTypePrefix: 'analyzer',
    }),
  );
}

function selectFirstFilteredIssue(
  issues: EditorIssue[],
  filter: EditorIssueFilter,
  currentIssueId: string | null,
): string | null {
  const filtered = filterEditorIssues(issues, filter);
  if (currentIssueId && filtered.some((issue) => issue.id === currentIssueId)) {
    return currentIssueId;
  }

  return filtered[0]?.id ?? null;
}

function pageFromIssue(issues: EditorIssue[], issueId: string | null): number | null {
  if (!issueId) return null;
  const issue = issues.find((candidate) => candidate.id === issueId);
  return issue?.page ?? null;
}

function clampPage(page: number, pageCount: number | null | undefined): number {
  const maxPage = Math.max(1, pageCount ?? 1);
  if (!Number.isFinite(page)) return 1;
  return Math.min(maxPage, Math.max(1, Math.round(page)));
}

async function analyzeStoredSource(
  set: EditSet,
  source: EditStoredSourceFile,
  apiBaseUrl: string,
): Promise<void> {
  set({
    analyzeStatus: 'analyzing',
    analyzeError: null,
    validationMessage: null,
  });

  try {
    const result = await analyzePdf(apiBaseUrl, source.blob, source.metadata.fileName);
    const issues = mapAnalyzeResultToIssues(result);
    set((state) => ({
      analyzeStatus: 'complete',
      analyzeError: null,
      lastAnalyzeResult: result,
      issues,
      selectedIssueId: selectFirstFilteredIssue(issues, state.issueFilter, state.selectedIssueId),
    }));
  } catch (error) {
    set({
      analyzeStatus: 'failed',
      analyzeError: toErrorMessage(error),
      lastAnalyzeResult: null,
      issues: [],
      selectedIssueId: null,
    });
  }
}

export const useEditEditorStore = create<EditEditorStoreState>((set: EditSet, get: EditGet) => ({
  sourceFile: null,
  sourceBlob: null,
  analyzeStatus: 'idle',
  analyzeError: null,
  selectedIssueId: null,
  issueFilter: { severity: 'all', fixState: 'unresolved' },
  lastAnalyzeResult: null,
  issues: [],
  validationMessage: null,
  selectedPage: 1,
  zoom: 1,
  renderStatus: 'idle',
  renderError: null,

  hydrate: async () => {
    set({ analyzeStatus: 'hydrating', analyzeError: null });
    try {
      const source = await loadActiveEditSource();
      if (!source) {
        set({ analyzeStatus: 'idle', sourceFile: null, sourceBlob: null });
        return;
      }

      set({
        sourceFile: source.metadata,
        sourceBlob: source.blob,
        analyzeStatus: 'idle',
        selectedPage: 1,
      });
    } catch (error) {
      set({
        analyzeStatus: 'failed',
        analyzeError: toErrorMessage(error),
      });
    }
  },

  openFile: async (file: File, apiBaseUrl: string) => {
    const validationMessage = validatePdfFile(file);
    if (validationMessage) {
      set({ validationMessage });
      return;
    }

    const source: EditStoredSourceFile = {
      metadata: buildMetadata(file),
      blob: file,
    };

    set({
      sourceFile: source.metadata,
      sourceBlob: source.blob,
      analyzeStatus: 'analyzing',
      renderStatus: 'loading',
      renderError: null,
      analyzeError: null,
      validationMessage: null,
      lastAnalyzeResult: null,
      issues: [],
      selectedIssueId: null,
      selectedPage: 1,
    });

    try {
      await saveActiveEditSource(source);
    } catch (error) {
      set({
        analyzeStatus: 'failed',
        analyzeError: toErrorMessage(error),
      });
      return;
    }

    await analyzeStoredSource(set, source, apiBaseUrl);
  },

  reanalyze: async (apiBaseUrl: string) => {
    const sourceFile = get().sourceFile;
    const sourceBlob = get().sourceBlob;
    if (!sourceFile || !sourceBlob) {
      set({ validationMessage: 'Open a PDF before running analysis.' });
      return;
    }

    await analyzeStoredSource(set, { metadata: sourceFile, blob: sourceBlob }, apiBaseUrl);
  },

  clearDocument: async () => {
    await clearActiveEditSource();
    set({
      sourceFile: null,
      sourceBlob: null,
      analyzeStatus: 'idle',
      analyzeError: null,
      selectedIssueId: null,
      lastAnalyzeResult: null,
      issues: [],
      validationMessage: null,
      selectedPage: 1,
      zoom: 1,
      renderStatus: 'idle',
      renderError: null,
    });
  },

  setIssueFilter: (filter: EditorIssueFilter) => {
    set((state) => ({
      issueFilter: {
        ...state.issueFilter,
        ...filter,
      },
      selectedIssueId: selectFirstFilteredIssue(state.issues, {
        ...state.issueFilter,
        ...filter,
      }, state.selectedIssueId),
    }));
  },

  selectIssue: (issueId: string | null) => {
    set((state) => ({
      selectedIssueId: issueId,
      selectedPage: clampPage(pageFromIssue(state.issues, issueId) ?? state.selectedPage, state.lastAnalyzeResult?.pageCount),
    }));
  },

  selectAdjacentIssue: (direction: 'next' | 'previous') => {
    set((state) => {
      const filtered = filterEditorIssues(state.issues, state.issueFilter);
      const selectedIssueId = findAdjacentIssueId(filtered, state.selectedIssueId, direction);
      return {
        selectedIssueId,
        selectedPage: clampPage(pageFromIssue(state.issues, selectedIssueId) ?? state.selectedPage, state.lastAnalyzeResult?.pageCount),
      };
    });
  },

  selectPage: (page: number) => {
    set((state) => ({
      selectedPage: clampPage(page, state.lastAnalyzeResult?.pageCount),
    }));
  },

  setZoom: (zoom: number) => {
    set({ zoom: clampEditZoom(zoom) });
  },

  zoomIn: () => {
    set((state) => ({ zoom: stepEditZoom(state.zoom, 'in') }));
  },

  zoomOut: () => {
    set((state) => ({ zoom: stepEditZoom(state.zoom, 'out') }));
  },

  resetZoom: () => {
    set({ zoom: 1 });
  },

  setRenderStatus: (status: EditRenderStatus, error: string | null = null) => {
    set({ renderStatus: status, renderError: error });
  },
}));

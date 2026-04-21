'use client';

import { create, type StateCreator } from 'zustand';
import { analyzePdf, applyEditFixes, remediatePdf } from '../lib/api/pdfafClient';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../lib/constants/uploads';
import { mapAnalyzeFindingsToEditorIssues } from '../lib/editor/analyzeFindings';
import { clampEditZoom, stepEditZoom } from '../lib/editor/editOverlayGeometry';
import {
  removeEditFix,
  upsertEditFix,
  validateEditFixes,
} from '../lib/editor/editFixes';
import {
  clearActiveEditSource,
  loadActiveEditSource,
  saveActiveEditSource,
} from '../lib/editor/editStorage';
import { findAdjacentIssueId, filterEditorIssues, sortEditorIssues } from '../lib/editor/issues';
import type { AnalyzeSummary } from '../types/analyze';
import type {
  EditAnalyzeStatus,
  EditApplyFixesResult,
  EditApplyStatus,
  EditFixInstruction,
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
  originalSourceBlob: Blob | null;
  pendingFixes: EditFixInstruction[];
  applyStatus: EditApplyStatus;
  applyError: string | null;
  fixedSourceBlob: Blob | null;
  scoreDelta: number | null;
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
  upsertPendingFix: (fix: EditFixInstruction) => void;
  removePendingFix: (type: EditFixInstruction['type'], objectRef?: string) => void;
  clearPendingFixes: () => void;
  applyPendingFixes: (apiBaseUrl: string) => Promise<void>;
  autoFixCurrentPdf: (apiBaseUrl: string) => Promise<void>;
  revertToOriginal: () => void;
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

function base64ToPdfBlob(value: string): Blob {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'application/pdf' });
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
    await saveActiveEditSource({
      metadata: source.metadata,
      blob: source.blob,
      analyzeResult: result,
    });
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
  originalSourceBlob: null,
  analyzeStatus: 'idle',
  analyzeError: null,
  selectedIssueId: null,
  issueFilter: { severity: 'all', fixState: 'needs-input' },
  lastAnalyzeResult: null,
  issues: [],
  validationMessage: null,
  selectedPage: 1,
  zoom: 1,
  renderStatus: 'idle',
  renderError: null,
  pendingFixes: [],
  applyStatus: 'idle',
  applyError: null,
  fixedSourceBlob: null,
  scoreDelta: null,

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
        originalSourceBlob: source.blob,
        analyzeStatus: source.analyzeResult ? 'complete' : 'idle',
        analyzeError: null,
        lastAnalyzeResult: source.analyzeResult ?? null,
        issues: source.analyzeResult ? mapAnalyzeResultToIssues(source.analyzeResult) : [],
        selectedIssueId: source.analyzeResult
          ? selectFirstFilteredIssue(mapAnalyzeResultToIssues(source.analyzeResult), get().issueFilter, null)
          : null,
        selectedPage: 1,
        renderStatus: 'loading',
        renderError: null,
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
      originalSourceBlob: source.blob,
      analyzeStatus: 'analyzing',
      renderStatus: 'loading',
      renderError: null,
      analyzeError: null,
      validationMessage: null,
      lastAnalyzeResult: null,
      issues: [],
      selectedIssueId: null,
      selectedPage: 1,
      pendingFixes: [],
      applyStatus: 'idle',
      applyError: null,
      fixedSourceBlob: null,
      scoreDelta: null,
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
      originalSourceBlob: null,
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
      pendingFixes: [],
      applyStatus: 'idle',
      applyError: null,
      fixedSourceBlob: null,
      scoreDelta: null,
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

  upsertPendingFix: (fix: EditFixInstruction) => {
    set((state) => ({
      pendingFixes: upsertEditFix(state.pendingFixes, fix),
      applyStatus: 'idle',
      applyError: null,
    }));
  },

  removePendingFix: (type: EditFixInstruction['type'], objectRef?: string) => {
    set((state) => ({
      pendingFixes: removeEditFix(state.pendingFixes, type, objectRef),
      applyStatus: 'idle',
      applyError: null,
    }));
  },

  clearPendingFixes: () => {
    set({ pendingFixes: [], applyStatus: 'idle', applyError: null });
  },

  applyPendingFixes: async (apiBaseUrl: string) => {
    const state = get();
    const sourceBlob = state.sourceBlob;
    const sourceFile = state.sourceFile;
    const validationMessage = validateEditFixes(state.pendingFixes);
    if (validationMessage) {
      set({ applyStatus: 'failed', applyError: validationMessage });
      return;
    }

    if (!sourceBlob || !sourceFile) {
      set({ applyStatus: 'failed', applyError: 'Open a PDF before applying fixes.' });
      return;
    }

    set({ applyStatus: 'applying', applyError: null });

    try {
      const result: EditApplyFixesResult = await applyEditFixes(
        apiBaseUrl,
        sourceBlob,
        sourceFile.fileName,
        state.pendingFixes,
      );
      const issues = mapAnalyzeResultToIssues(result.after);
      await saveActiveEditSource({
        metadata: sourceFile,
        blob: result.fixedPdfBlob,
        analyzeResult: result.after,
      });
      set((current) => ({
        sourceBlob: result.fixedPdfBlob,
        fixedSourceBlob: result.fixedPdfBlob,
        lastAnalyzeResult: result.after,
        issues,
        selectedIssueId: selectFirstFilteredIssue(issues, current.issueFilter, null),
        selectedPage: 1,
        pendingFixes: [],
        applyStatus: 'complete',
        applyError: result.rejectedFixes.length
          ? `${result.rejectedFixes.length} fix could not be applied.`
          : null,
        scoreDelta: result.after.score - result.before.score,
        renderStatus: 'loading',
        renderError: null,
      }));
    } catch (error) {
      set({
        applyStatus: 'failed',
        applyError: toErrorMessage(error),
      });
    }
  },

  autoFixCurrentPdf: async (apiBaseUrl: string) => {
    const state = get();
    const sourceBlob = state.sourceBlob;
    const sourceFile = state.sourceFile;

    if (!sourceBlob || !sourceFile) {
      set({ applyStatus: 'failed', applyError: 'Open a PDF before running auto-fix.' });
      return;
    }

    set({ applyStatus: 'applying', applyError: null });

    try {
      const result = await remediatePdf(apiBaseUrl, sourceBlob, sourceFile.fileName);
      if (!result.remediatedPdfBase64) {
        set({
          applyStatus: 'failed',
          applyError: 'Auto-fix completed, but the fixed PDF was too large to load into the editor.',
        });
        return;
      }

      const fixedPdfBlob = base64ToPdfBlob(result.remediatedPdfBase64);
      const issues = mapAnalyzeResultToIssues(result.summary.after);
      await saveActiveEditSource({
        metadata: sourceFile,
        blob: fixedPdfBlob,
        analyzeResult: result.summary.after,
      });
      set((current) => ({
        sourceBlob: fixedPdfBlob,
        fixedSourceBlob: fixedPdfBlob,
        lastAnalyzeResult: result.summary.after,
        issues,
        selectedIssueId: selectFirstFilteredIssue(issues, current.issueFilter, null),
        selectedPage: 1,
        pendingFixes: [],
        applyStatus: 'complete',
        applyError: null,
        scoreDelta: result.summary.after.score - result.summary.before.score,
        renderStatus: 'loading',
        renderError: null,
      }));
    } catch (error) {
      set({
        applyStatus: 'failed',
        applyError: toErrorMessage(error),
      });
    }
  },

  revertToOriginal: () => {
    const state = get();
    if (!state.originalSourceBlob) return;
    set({
      sourceBlob: state.originalSourceBlob,
      fixedSourceBlob: null,
      pendingFixes: [],
      applyStatus: 'idle',
      applyError: null,
      scoreDelta: null,
      renderStatus: 'loading',
      renderError: null,
    });
  },
}));

'use client';

import { create } from 'zustand';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../lib/constants/uploads';
import {
  createJobWithOriginalBlob,
  deleteJobAndBlobs,
  getOriginalBlob,
  listJobRecords,
} from '../lib/storage/pdfafDb';
import type {
  FileValidationMessage,
  JobRecord,
  QueueStorageState,
} from '../types/queue';

interface QueueStoreState {
  jobs: JobRecord[];
  selectedJobIds: string[];
  validationMessages: FileValidationMessage[];
  storageState: QueueStorageState;
  hydrated: boolean;
  isAddingFiles: boolean;
  hydrateFromStorage: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  removeJob: (jobId: string) => Promise<void>;
  removeSelected: () => Promise<void>;
  toggleSelection: (jobId: string) => void;
  toggleSelectAllVisible: () => void;
  clearSelection: () => void;
  downloadOriginal: (jobId: string) => Promise<void>;
}

function toStorageErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Browser storage is unavailable right now. Check private browsing or storage quota settings.';
}

function buildValidationMessage(fileName: string, message: string): FileValidationMessage {
  return {
    id: crypto.randomUUID(),
    fileName,
    message,
  };
}

function validateFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const looksLikePdf =
    file.type === 'application/pdf' ||
    file.type === 'application/x-pdf' ||
    lowerName.endsWith('.pdf');

  if (!looksLikePdf) {
    return 'Only PDF files are accepted.';
  }

  if (file.size <= 0) {
    return 'This file is empty.';
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `This file exceeds the ${MAX_UPLOAD_SIZE_MB} MB browser upload limit.`;
  }

  return null;
}

function startBrowserDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export const useQueueStore = create<QueueStoreState>()((set, get) => ({
  jobs: [],
  selectedJobIds: [],
  validationMessages: [],
  storageState: 'loading',
  hydrated: false,
  isAddingFiles: false,

  hydrateFromStorage: async () => {
    if (get().hydrated && get().storageState === 'ready') return;

    set({ storageState: 'loading' });

    try {
      const jobs = await listJobRecords();
      set({
        jobs,
        hydrated: true,
        selectedJobIds: [],
        storageState: 'ready',
      });
    } catch (error) {
      const message = toStorageErrorMessage(error);
      const storageState =
        message.includes('IndexedDB is not available') ? 'unavailable' : 'error';

      set({
        hydrated: true,
        jobs: [],
        selectedJobIds: [],
        storageState,
        validationMessages: [buildValidationMessage('Browser storage', message)],
      });
    }
  },

  addFiles: async (files) => {
    if (!files.length) return;

    set({ isAddingFiles: true });

    const nextMessages: FileValidationMessage[] = [];
    const createdJobs: JobRecord[] = [];

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        nextMessages.push(buildValidationMessage(file.name, validationError));
        continue;
      }

      const timestamp = new Date().toISOString();
      const jobId = crypto.randomUUID();
      const originalBlobKey = crypto.randomUUID();
      const jobRecord: JobRecord = {
        id: jobId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/pdf',
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'idle',
        mode: null,
        originalBlobKey,
      };

      try {
        await createJobWithOriginalBlob(jobRecord, {
          blobKey: originalBlobKey,
          jobId,
          kind: 'original',
          fileName: file.name,
          mimeType: jobRecord.mimeType,
          blob: file,
        });
        createdJobs.push(jobRecord);
      } catch (error) {
        nextMessages.push(buildValidationMessage(file.name, toStorageErrorMessage(error)));
      }
    }

    set((state) => {
      const combinedJobs = [...state.jobs, ...createdJobs].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
      const hasStorageFailure = nextMessages.some((message) =>
        message.message.includes('storage'),
      );

      return {
        jobs: combinedJobs,
        validationMessages: nextMessages,
        isAddingFiles: false,
        storageState:
          hasStorageFailure && state.storageState !== 'unavailable' ? 'error' : state.storageState,
      };
    });
  },

  removeJob: async (jobId) => {
    try {
      await deleteJobAndBlobs(jobId);
      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
        selectedJobIds: state.selectedJobIds.filter((selectedId) => selectedId !== jobId),
      }));
    } catch (error) {
      set((state) => ({
        storageState: 'error',
        validationMessages: [
          buildValidationMessage('Removal', toStorageErrorMessage(error)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  },

  removeSelected: async () => {
    const selectedIds = [...get().selectedJobIds];
    for (const jobId of selectedIds) {
      await get().removeJob(jobId);
    }
  },

  toggleSelection: (jobId) => {
    set((state) => ({
      selectedJobIds: state.selectedJobIds.includes(jobId)
        ? state.selectedJobIds.filter((selectedId) => selectedId !== jobId)
        : [...state.selectedJobIds, jobId],
    }));
  },

  toggleSelectAllVisible: () => {
    set((state) => ({
      selectedJobIds:
        state.selectedJobIds.length === state.jobs.length
          ? []
          : state.jobs.map((job) => job.id),
    }));
  },

  clearSelection: () => set({ selectedJobIds: [] }),

  downloadOriginal: async (jobId) => {
    const job = get().jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;

    try {
      const blobRecord = await getOriginalBlob(jobId);
      if (!blobRecord) {
        throw new Error('Original file is no longer available in browser storage.');
      }

      startBrowserDownload(blobRecord.blob, job.fileName);
    } catch (error) {
      set((state) => ({
        storageState: 'error',
        validationMessages: [
          buildValidationMessage(job.fileName, toStorageErrorMessage(error)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  },
}));

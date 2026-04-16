'use client';

import { create, type StateCreator } from 'zustand';
import { analyzePdf } from '../lib/api/pdfafClient';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../lib/constants/uploads';
import {
  createJobWithOriginalBlob,
  deleteJobAndBlobs,
  getOriginalBlob,
  listJobRecords,
  putJobRecord,
  putJobRecords,
} from '../lib/storage/pdfafDb';
import { useAppSettingsStore } from './settings';
import type {
  FileValidationMessage,
  JobRecord,
  QueueStorageState,
} from '../types/queue';

const ANALYZE_CONCURRENCY = 2;

interface QueueStoreState {
  jobs: JobRecord[];
  selectedJobIds: string[];
  activeJobIds: string[];
  validationMessages: FileValidationMessage[];
  storageState: QueueStorageState;
  hydrated: boolean;
  isAddingFiles: boolean;
  queuePaused: boolean;
  detailJobId: string | null;
  hydrateFromStorage: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  removeJob: (jobId: string) => Promise<void>;
  removeSelected: () => Promise<void>;
  toggleSelection: (jobId: string) => void;
  toggleSelectAllVisible: () => void;
  clearSelection: () => void;
  downloadOriginal: (jobId: string) => Promise<void>;
  enqueueAnalyze: (jobIds?: string[]) => Promise<void>;
  runScheduler: () => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  openDetail: (jobId: string) => void;
  closeDetail: () => void;
}

type QueueSet = Parameters<StateCreator<QueueStoreState>>[0];
type QueueGet = Parameters<StateCreator<QueueStoreState>>[1];

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

function isStorageFailureMessage(message: string): boolean {
  return /storage|indexeddb|browser/i.test(message);
}

function updateJobCollection(jobs: JobRecord[], nextJob: JobRecord): JobRecord[] {
  return jobs
    .map((job) => (job.id === nextJob.id ? nextJob : job))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function eligibleForAnalyze(job: JobRecord): boolean {
  return job.status === 'idle' || job.status === 'failed' || job.status === 'done';
}

function nowIso(): string {
  return new Date().toISOString();
}

async function processAnalyzeJob(jobId: string, set: QueueSet, get: QueueGet) {
  const queuedJob = get().jobs.find((job) => job.id === jobId);
  if (!queuedJob) {
    set((state: QueueStoreState) => ({
      activeJobIds: state.activeJobIds.filter((activeId) => activeId !== jobId),
    }));
    return;
  }

  let job: JobRecord = {
    ...queuedJob,
    status: 'uploading',
    updatedAt: nowIso(),
    errorMessage: undefined,
  };

  set((state: QueueStoreState) => ({
    jobs: updateJobCollection(state.jobs, job),
  }));

  try {
    await putJobRecord(job);

    const blobRecord = await getOriginalBlob(jobId);
    if (!blobRecord) {
      throw new Error('Original PDF is no longer available in browser storage.');
    }

    job = {
      ...job,
      status: 'analyzing',
      updatedAt: nowIso(),
    };

    set((state: QueueStoreState) => ({
      jobs: updateJobCollection(state.jobs, job),
    }));
    await putJobRecord(job);

    const apiBaseUrl = useAppSettingsStore.getState().apiBaseUrl;
    const analyzeResult = await analyzePdf(apiBaseUrl, blobRecord.blob, job.fileName);

    job = {
      ...job,
      status: 'done',
      mode: 'grade',
      analyzeResult,
      findingSummaries: analyzeResult.topFindings,
      updatedAt: nowIso(),
      errorMessage: undefined,
    };

    set((state: QueueStoreState) => ({
      jobs: updateJobCollection(state.jobs, job),
    }));
    await putJobRecord(job);
  } catch (error) {
    const message = toStorageErrorMessage(error);
    job = {
      ...job,
      status: 'failed',
      errorMessage: message,
      updatedAt: nowIso(),
    };

    set((state: QueueStoreState) => ({
      jobs: updateJobCollection(state.jobs, job),
      storageState:
        isStorageFailureMessage(message) && state.storageState !== 'unavailable'
          ? 'error'
          : state.storageState,
      validationMessages: [
        buildValidationMessage(job.fileName, message),
        ...state.validationMessages,
      ].slice(0, 8),
    }));

    try {
      await putJobRecord(job);
    } catch (persistError) {
      set((state: QueueStoreState) => ({
        storageState: 'error',
        validationMessages: [
          buildValidationMessage(job.fileName, toStorageErrorMessage(persistError)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  } finally {
    set((state: QueueStoreState) => ({
      activeJobIds: state.activeJobIds.filter((activeId) => activeId !== jobId),
    }));
    void get().runScheduler();
  }
}

export const useQueueStore = create<QueueStoreState>()((set, get) => ({
  jobs: [],
  selectedJobIds: [],
  activeJobIds: [],
  validationMessages: [],
  storageState: 'loading',
  hydrated: false,
  isAddingFiles: false,
  queuePaused: false,
  detailJobId: null,

  hydrateFromStorage: async () => {
    if (get().hydrated && get().storageState === 'ready') return;

    set({ storageState: 'loading' });

    try {
      const storedJobs = await listJobRecords();
      const normalizedJobs = storedJobs.map((job) => {
        if (job.status !== 'uploading' && job.status !== 'analyzing') {
          return job;
        }

        return {
          ...job,
          status: 'failed' as const,
          updatedAt: nowIso(),
          errorMessage: 'Previous browser session ended before analysis completed.',
        };
      });

      const staleJobs = normalizedJobs.filter(
        (job, index) =>
          job !== storedJobs[index],
      );

      if (staleJobs.length > 0) {
        await putJobRecords(staleJobs);
      }

      set({
        jobs: normalizedJobs,
        hydrated: true,
        selectedJobIds: [],
        activeJobIds: [],
        storageState: 'ready',
      });

      if (normalizedJobs.some((job) => job.status === 'queued_analyze')) {
        void get().runScheduler();
      }
    } catch (error) {
      const message = toStorageErrorMessage(error);
      const storageState =
        message.includes('IndexedDB is not available') ? 'unavailable' : 'error';

      set({
        hydrated: true,
        jobs: [],
        selectedJobIds: [],
        activeJobIds: [],
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
        isStorageFailureMessage(message.message),
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
    const target = get().jobs.find((job) => job.id === jobId);
    if (target && (target.status === 'uploading' || target.status === 'analyzing')) {
      set((state) => ({
        validationMessages: [
          buildValidationMessage(target.fileName, 'Wait for analysis to finish before removing this row.'),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
      return;
    }

    try {
      await deleteJobAndBlobs(jobId);
      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
        selectedJobIds: state.selectedJobIds.filter((selectedId) => selectedId !== jobId),
        activeJobIds: state.activeJobIds.filter((activeId) => activeId !== jobId),
        detailJobId: state.detailJobId === jobId ? null : state.detailJobId,
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

  enqueueAnalyze: async (jobIds) => {
    const selectedIds = jobIds ?? get().selectedJobIds;
    if (selectedIds.length === 0) return;

    const queuedAt = nowIso();
    let updatedJobs: JobRecord[] = [];

    set((state) => {
      updatedJobs = state.jobs.map((job) => {
        if (!selectedIds.includes(job.id) || !eligibleForAnalyze(job)) {
          return job;
        }

        return {
          ...job,
          mode: 'grade',
          status: 'queued_analyze',
          errorMessage: undefined,
          analyzeResult: undefined,
          findingSummaries: undefined,
          updatedAt: queuedAt,
        };
      });

      return { jobs: updatedJobs };
    });

    const changedJobs = updatedJobs.filter(
      (job) => selectedIds.includes(job.id) && job.status === 'queued_analyze',
    );

    try {
      await putJobRecords(changedJobs);
      await get().runScheduler();
    } catch (error) {
      set((state) => ({
        storageState: 'error',
        validationMessages: [
          buildValidationMessage('Analysis queue', toStorageErrorMessage(error)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  },

  runScheduler: async () => {
    const state = get();
    if (state.queuePaused || state.storageState !== 'ready') return;

    const availableSlots = ANALYZE_CONCURRENCY - state.activeJobIds.length;
    if (availableSlots <= 0) return;

    const queuedJobs = state.jobs.filter(
      (job) => job.status === 'queued_analyze' && !state.activeJobIds.includes(job.id),
    );

    const nextJobs = queuedJobs.slice(0, availableSlots);
    if (nextJobs.length === 0) return;

    set((current) => ({
      activeJobIds: [...current.activeJobIds, ...nextJobs.map((job) => job.id)],
    }));

    for (const job of nextJobs) {
      void processAnalyzeJob(job.id, set, get);
    }
  },

  retryJob: async (jobId) => {
    await get().enqueueAnalyze([jobId]);
  },

  openDetail: (jobId) => set({ detailJobId: jobId }),
  closeDetail: () => set({ detailJobId: null }),
}));

'use client';

import { create, type StateCreator } from 'zustand';
import { analyzePdf, remediatePdf } from '../lib/api/pdfafClient';
import { LOCAL_STORAGE_KEYS } from '../lib/constants/config';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../lib/constants/uploads';
import {
  createJobWithOriginalBlob,
  deleteBlobByKey,
  deleteJobAndBlobs,
  getOriginalBlob,
  getRemediatedBlob,
  listJobRecords,
  putBlobRecord,
  putJobRecord,
  putJobRecords,
} from '../lib/storage/pdfafDb';
import { downloadSelectedRemediatedZip as downloadRemediatedZipArchive } from '../lib/zip/downloadZip';
import { useAppSettingsStore } from './settings';
import type { AnalyzeSummary, NormalizedFinding } from '../types/analyze';
import type { RemediationSummary } from '../types/remediation';
import type {
  FileValidationMessage,
  JobMode,
  JobRecord,
  JobStatus,
  QueueStorageState,
} from '../types/queue';

const DEFAULT_QUEUE_CONCURRENCY = 2;
const MIN_QUEUE_CONCURRENCY = 1;
const MAX_QUEUE_CONCURRENCY = 3;

interface QueuePreferences {
  autoRemediateOnAdd: boolean;
  preferredQueueConcurrency: number;
  queuePaused: boolean;
}

interface QueueStoreState {
  jobs: JobRecord[];
  selectedJobIds: string[];
  activeJobIds: string[];
  validationMessages: FileValidationMessage[];
  storageState: QueueStorageState;
  hydrated: boolean;
  isAddingFiles: boolean;
  autoRemediateOnAdd: boolean;
  preferredQueueConcurrency: number;
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
  downloadRemediated: (jobId: string) => Promise<void>;
  enqueueAnalyze: (jobIds?: string[]) => Promise<void>;
  enqueueRemediate: (jobIds?: string[]) => Promise<void>;
  setAutoRemediateOnAdd: (enabled: boolean) => void;
  setPreferredQueueConcurrency: (value: number) => void;
  pauseQueue: () => void;
  resumeQueue: () => void;
  runScheduler: () => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  retryFailed: (jobIds?: string[]) => Promise<void>;
  clearCompleted: () => Promise<void>;
  downloadSelectedRemediatedZip: (jobIds?: string[]) => Promise<void>;
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

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function clampQueueConcurrency(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_QUEUE_CONCURRENCY;
  return Math.min(MAX_QUEUE_CONCURRENCY, Math.max(MIN_QUEUE_CONCURRENCY, Math.round(value)));
}

function loadQueuePreferences(): QueuePreferences {
  if (!canUseLocalStorage()) {
    return {
      autoRemediateOnAdd: false,
      preferredQueueConcurrency: DEFAULT_QUEUE_CONCURRENCY,
      queuePaused: false,
    };
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.queuePreferences);
    if (!raw) {
      return {
        autoRemediateOnAdd: false,
        preferredQueueConcurrency: DEFAULT_QUEUE_CONCURRENCY,
        queuePaused: false,
      };
    }

    const parsed = JSON.parse(raw) as Partial<QueuePreferences>;

    return {
      autoRemediateOnAdd: parsed.autoRemediateOnAdd === true,
      preferredQueueConcurrency: clampQueueConcurrency(
        typeof parsed.preferredQueueConcurrency === 'number'
          ? parsed.preferredQueueConcurrency
          : DEFAULT_QUEUE_CONCURRENCY,
      ),
      queuePaused: parsed.queuePaused === true,
    };
  } catch {
    return {
      autoRemediateOnAdd: false,
      preferredQueueConcurrency: DEFAULT_QUEUE_CONCURRENCY,
      queuePaused: false,
    };
  }
}

function saveQueuePreferences(preferences: QueuePreferences) {
  if (!canUseLocalStorage()) return;

  localStorage.setItem(LOCAL_STORAGE_KEYS.queuePreferences, JSON.stringify(preferences));
}

function createUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `pdfaf-${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
}

function buildValidationMessage(fileName: string, message: string): FileValidationMessage {
  return {
    id: createUuid(),
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

function nowIso(): string {
  return new Date().toISOString();
}

function updateJobCollection(jobs: JobRecord[], nextJob: JobRecord): JobRecord[] {
  return jobs
    .map((job) => (job.id === nextJob.id ? nextJob : job))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function eligibleForAnalyze(job: JobRecord): boolean {
  return job.status === 'idle' || job.status === 'failed' || job.status === 'done';
}

function eligibleForRemediate(job: JobRecord): boolean {
  return job.status === 'idle' || job.status === 'failed' || job.status === 'done';
}

function getProcessingStatus(mode: JobMode): JobStatus {
  return mode === 'remediate' ? 'remediating' : 'analyzing';
}

function getQueuedStatus(mode: JobMode): JobStatus {
  return mode === 'remediate' ? 'queued_remediate' : 'queued_analyze';
}

function buildRemediatedFileName(fileName: string): string {
  return fileName.toLowerCase().endsWith('.pdf')
    ? `${fileName.slice(0, -4)}-remediated.pdf`
    : `${fileName}-remediated.pdf`;
}

function decodeBase64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function getDisplayedSummary(job: JobRecord): AnalyzeSummary | undefined {
  return job.remediationResult?.after ?? job.analyzeResult;
}

function getDisplayedFindings(job: JobRecord): NormalizedFinding[] | undefined {
  return job.findingSummaries;
}

function buildFailureJob(job: JobRecord, message: string): JobRecord {
  return {
    ...job,
    status: 'failed',
    errorMessage: message,
    updatedAt: nowIso(),
  };
}

function retryableFailedJobs(jobs: JobRecord[], selectedIds: string[]): JobRecord[] {
  return jobs.filter(
    (job) =>
      selectedIds.includes(job.id) &&
      job.status === 'failed' &&
      (job.mode === 'grade' || job.mode === 'remediate'),
  );
}

async function persistFailure(
  job: JobRecord,
  message: string,
  set: QueueSet,
  state: QueueStoreState,
) {
  const failedJob = buildFailureJob(job, message);

  set((current) => ({
    jobs: updateJobCollection(current.jobs, failedJob),
    storageState:
      isStorageFailureMessage(message) && current.storageState !== 'unavailable'
        ? 'error'
        : current.storageState,
    validationMessages: [
      buildValidationMessage(job.fileName, message),
      ...current.validationMessages,
    ].slice(0, 8),
  }));

  try {
    await putJobRecord(failedJob);
  } catch (persistError) {
    set((current) => ({
      storageState: 'error',
      validationMessages: [
        buildValidationMessage(job.fileName, toStorageErrorMessage(persistError)),
        ...current.validationMessages,
      ].slice(0, 8),
    }));
  }
}

async function processJob(jobId: string, set: QueueSet, get: QueueGet) {
  const queuedJob = get().jobs.find((job) => job.id === jobId);
  if (!queuedJob || !queuedJob.mode) {
    set((state) => ({
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

  set((state) => ({ jobs: updateJobCollection(state.jobs, job) }));

  try {
    await putJobRecord(job);

    const originalBlob = await getOriginalBlob(jobId);
    if (!originalBlob) {
      throw new Error('Original PDF is no longer available in browser storage.');
    }

    job = {
      ...job,
      status: getProcessingStatus(job.mode),
      updatedAt: nowIso(),
    };

    set((state) => ({ jobs: updateJobCollection(state.jobs, job) }));
    await putJobRecord(job);

    const apiBaseUrl = useAppSettingsStore.getState().apiBaseUrl;

    if (job.mode === 'grade') {
      const analyzeResult = await analyzePdf(apiBaseUrl, originalBlob.blob, job.fileName);
      job = {
        ...job,
        status: 'done',
        analyzeResult,
        findingSummaries:
          job.remediationResult?.after.topFindings ?? analyzeResult.topFindings,
        updatedAt: nowIso(),
        errorMessage: undefined,
      };

      set((state) => ({ jobs: updateJobCollection(state.jobs, job) }));
      await putJobRecord(job);
    } else {
      const remediation = await remediatePdf(apiBaseUrl, originalBlob.blob, job.fileName);
      let nextRemediatedBlobKey = job.remediatedBlobKey;

      if (job.remediatedBlobKey) {
        await deleteBlobByKey(job.remediatedBlobKey);
        nextRemediatedBlobKey = undefined;
      }

      if (remediation.remediatedPdfBase64) {
        nextRemediatedBlobKey = createUuid();
        const remediatedBlob = decodeBase64ToBlob(
          remediation.remediatedPdfBase64,
          job.mimeType || 'application/pdf',
        );

        await putBlobRecord({
          blobKey: nextRemediatedBlobKey,
          jobId: job.id,
          kind: 'remediated',
          fileName: buildRemediatedFileName(job.fileName),
          mimeType: job.mimeType || 'application/pdf',
          blob: remediatedBlob,
        });
      }

      const remediationMessage =
        remediation.summary.remediatedPdfTooLarge
          ? 'Remediation completed, but the repaired PDF was too large for inline download.'
          : undefined;

      job = {
        ...job,
        status: 'done',
        mode: 'remediate',
        analyzeResult: remediation.summary.after,
        remediationResult: remediation.summary,
        remediatedBlobKey: nextRemediatedBlobKey,
        findingSummaries: remediation.summary.after.topFindings,
        updatedAt: nowIso(),
        errorMessage: remediationMessage,
      };

      set((state) => ({ jobs: updateJobCollection(state.jobs, job) }));
      await putJobRecord(job);
    }
  } catch (error) {
    const message = toStorageErrorMessage(error);
    await persistFailure(job, message, set, get());
  } finally {
    set((state) => ({
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
  autoRemediateOnAdd: false,
  preferredQueueConcurrency: DEFAULT_QUEUE_CONCURRENCY,
  queuePaused: false,
  detailJobId: null,

  hydrateFromStorage: async () => {
    if (get().hydrated && get().storageState === 'ready') return;

    set({ storageState: 'loading' });

    try {
      const storedJobs = await listJobRecords();
      const normalizedJobs = storedJobs.map((job) => {
        if (
          job.status !== 'uploading' &&
          job.status !== 'analyzing' &&
          job.status !== 'remediating'
        ) {
          return job;
        }

        return {
          ...job,
          status: 'failed' as const,
          updatedAt: nowIso(),
          errorMessage: 'Previous browser session ended before processing completed.',
        };
      });

      const staleJobs = normalizedJobs.filter((job, index) => job !== storedJobs[index]);
      if (staleJobs.length > 0) {
        await putJobRecords(staleJobs);
      }

      const preferences = loadQueuePreferences();

      set({
        jobs: normalizedJobs,
        hydrated: true,
        selectedJobIds: [],
        activeJobIds: [],
        storageState: 'ready',
        autoRemediateOnAdd: preferences.autoRemediateOnAdd,
        preferredQueueConcurrency: preferences.preferredQueueConcurrency,
        queuePaused: preferences.queuePaused,
      });

      if (
        normalizedJobs.some(
          (job) => job.status === 'queued_analyze' || job.status === 'queued_remediate',
        )
      ) {
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
    const autoRemediateOnAdd = get().autoRemediateOnAdd;

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        nextMessages.push(buildValidationMessage(file.name, validationError));
        continue;
      }

      const timestamp = nowIso();
      const jobId = createUuid();
      const originalBlobKey = createUuid();
      const jobRecord: JobRecord = {
        id: jobId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/pdf',
        createdAt: timestamp,
        updatedAt: timestamp,
        status: autoRemediateOnAdd ? 'queued_remediate' : 'idle',
        mode: autoRemediateOnAdd ? 'remediate' : null,
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

    if (autoRemediateOnAdd) {
      await get().runScheduler();
    }
  },

  removeJob: async (jobId) => {
    const target = get().jobs.find((job) => job.id === jobId);
    if (
      target &&
      (target.status === 'uploading' ||
        target.status === 'analyzing' ||
        target.status === 'remediating')
    ) {
      set((state) => ({
        validationMessages: [
          buildValidationMessage(
            target.fileName,
            'Wait for processing to finish before removing this row.',
          ),
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

  downloadRemediated: async (jobId) => {
    const job = get().jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;

    try {
      const blobRecord = await getRemediatedBlob(jobId);
      if (!blobRecord) {
        throw new Error('Remediated PDF is not available for this row.');
      }

      startBrowserDownload(blobRecord.blob, blobRecord.fileName);
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

  setAutoRemediateOnAdd: (enabled) => {
    const nextPreferences = {
      autoRemediateOnAdd: enabled,
      preferredQueueConcurrency: get().preferredQueueConcurrency,
      queuePaused: get().queuePaused,
    };
    saveQueuePreferences(nextPreferences);
    set({ autoRemediateOnAdd: enabled });
  },

  setPreferredQueueConcurrency: (value) => {
    const preferredQueueConcurrency = clampQueueConcurrency(value);
    const nextPreferences = {
      autoRemediateOnAdd: get().autoRemediateOnAdd,
      preferredQueueConcurrency,
      queuePaused: get().queuePaused,
    };
    saveQueuePreferences(nextPreferences);
    set({ preferredQueueConcurrency });
    void get().runScheduler();
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
          updatedAt: queuedAt,
          ...(job.remediationResult
            ? {}
            : { findingSummaries: undefined }),
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

  enqueueRemediate: async (jobIds) => {
    const selectedIds = jobIds ?? get().selectedJobIds;
    if (selectedIds.length === 0) return;

    const queuedAt = nowIso();
    let updatedJobs: JobRecord[] = [];

    set((state) => {
      updatedJobs = state.jobs.map((job) => {
        if (!selectedIds.includes(job.id) || !eligibleForRemediate(job)) {
          return job;
        }

        return {
          ...job,
          mode: 'remediate',
          status: 'queued_remediate',
          errorMessage: undefined,
          remediationResult: undefined,
          updatedAt: queuedAt,
        };
      });

      return { jobs: updatedJobs };
    });

    const changedJobs = updatedJobs.filter(
      (job) => selectedIds.includes(job.id) && job.status === 'queued_remediate',
    );

    try {
      await putJobRecords(changedJobs);
      await get().runScheduler();
    } catch (error) {
      set((state) => ({
        storageState: 'error',
        validationMessages: [
          buildValidationMessage('Remediation queue', toStorageErrorMessage(error)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  },

  pauseQueue: () => {
    const nextPreferences = {
      autoRemediateOnAdd: get().autoRemediateOnAdd,
      preferredQueueConcurrency: get().preferredQueueConcurrency,
      queuePaused: true,
    };
    saveQueuePreferences(nextPreferences);
    set({ queuePaused: true });
  },

  resumeQueue: () => {
    const nextPreferences = {
      autoRemediateOnAdd: get().autoRemediateOnAdd,
      preferredQueueConcurrency: get().preferredQueueConcurrency,
      queuePaused: false,
    };
    saveQueuePreferences(nextPreferences);
    set({ queuePaused: false });
    void get().runScheduler();
  },

  runScheduler: async () => {
    const state = get();
    if (state.queuePaused || state.storageState !== 'ready') return;

    const availableSlots = state.preferredQueueConcurrency - state.activeJobIds.length;
    if (availableSlots <= 0) return;

    const queuedJobs = state.jobs.filter(
      (job) =>
        (job.status === 'queued_analyze' || job.status === 'queued_remediate') &&
        !state.activeJobIds.includes(job.id),
    );

    const nextJobs = queuedJobs.slice(0, availableSlots);
    if (nextJobs.length === 0) return;

    set((current) => ({
      activeJobIds: [...current.activeJobIds, ...nextJobs.map((job) => job.id)],
    }));

    for (const job of nextJobs) {
      void processJob(job.id, set, get);
    }
  },

  retryJob: async (jobId) => {
    const job = get().jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;

    if (job.mode === 'remediate') {
      await get().enqueueRemediate([jobId]);
      return;
    }

    await get().enqueueAnalyze([jobId]);
  },

  retryFailed: async (jobIds) => {
    const selectedIds = jobIds ?? get().selectedJobIds;
    const failedJobs = retryableFailedJobs(get().jobs, selectedIds);
    const analyzeIds = failedJobs
      .filter((job) => job.mode === 'grade')
      .map((job) => job.id);
    const remediateIds = failedJobs
      .filter((job) => job.mode === 'remediate')
      .map((job) => job.id);

    if (analyzeIds.length > 0) {
      await get().enqueueAnalyze(analyzeIds);
    }

    if (remediateIds.length > 0) {
      await get().enqueueRemediate(remediateIds);
    }
  },

  clearCompleted: async () => {
    const completedIds = get()
      .jobs.filter((job) => job.status === 'done')
      .map((job) => job.id);

    for (const jobId of completedIds) {
      await get().removeJob(jobId);
    }
  },

  downloadSelectedRemediatedZip: async (jobIds) => {
    const selectedIds = jobIds ?? get().selectedJobIds;
    const selectedJobs = get().jobs.filter((job) => selectedIds.includes(job.id));

    try {
      const includedCount = await downloadRemediatedZipArchive(selectedJobs);
      if (includedCount === 0) {
        set((state) => ({
          validationMessages: [
            buildValidationMessage(
              'ZIP download',
              'Select at least one row with a remediated PDF before downloading a ZIP.',
            ),
            ...state.validationMessages,
          ].slice(0, 8),
        }));
      }
    } catch (error) {
      set((state) => ({
        validationMessages: [
          buildValidationMessage('ZIP download', toStorageErrorMessage(error)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  },

  openDetail: (jobId) => set({ detailJobId: jobId }),
  closeDetail: () => set({ detailJobId: null }),
}));

'use client';

import { create, type StateCreator } from 'zustand';
import {
  deleteFile,
  downloadFile,
  listFiles,
  remediateStoredFile,
  uploadForAnalyze,
  uploadForRemediation,
} from '../lib/api/fileClient';
import { LOCAL_STORAGE_KEYS } from '../lib/constants/config';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../lib/constants/uploads';
import { downloadSelectedRemediatedZip as downloadRemediatedZipArchive } from '../lib/zip/downloadZip';
import type { StoredFileSummary } from '../types/files';
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

function nowIso(): string {
  return new Date().toISOString();
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

function validateFile(file: File): string | null {
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

function startBrowserDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function mapStoredFileToJob(file: StoredFileSummary): JobRecord {
  return {
    id: file.id,
    fileName: file.fileName,
    fileSize: file.fileSize,
    mimeType: file.mimeType,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    status: file.status,
    mode: file.mode,
    errorMessage: file.errorMessage ?? undefined,
    analyzeResult: file.analyzeResult,
    remediationResult: file.remediationResult,
    findingSummaries: file.findingSummaries,
    fileStatus: file.fileStatus,
    storedFileName: file.storedFileName ?? undefined,
    storedSizeBytes: file.storedSizeBytes ?? undefined,
    hasServerSource: file.hasServerSource,
    expiresAt: file.expiresAt ?? undefined,
    deletedAt: file.deletedAt ?? undefined,
    deletionReason: file.deletionReason ?? undefined,
    persisted: true,
  };
}

function createLocalJob(file: File, mode: JobMode, status: JobStatus): JobRecord {
  const timestamp = nowIso();
  return {
    id: createUuid(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/pdf',
    createdAt: timestamp,
    updatedAt: timestamp,
    processingStartedAt:
      status === 'queued_analyze' || status === 'queued_remediate' ? timestamp : undefined,
    status,
    mode,
    fileStatus: 'none',
    hasServerSource: false,
    localFile: file,
    persisted: false,
  };
}

function sortJobs(jobs: JobRecord[]): JobRecord[] {
  return [...jobs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function updateJobCollection(jobs: JobRecord[], nextJob: JobRecord, previousId?: string): JobRecord[] {
  const filtered = jobs.filter((job) => job.id !== (previousId ?? nextJob.id));
  return sortJobs([...filtered, nextJob]);
}

function canAnalyzeJob(job: JobRecord): boolean {
  return Boolean(job.localFile) && (job.status === 'idle' || job.status === 'failed' || job.status === 'done');
}

function canRemediateJob(job: JobRecord): boolean {
  return (
    Boolean(job.localFile) ||
    (job.persisted &&
      (job.fileStatus === 'available' || job.hasServerSource) &&
      job.status !== 'uploading' &&
      job.status !== 'remediating')
  );
}

function isQueued(job: JobRecord): boolean {
  return job.status === 'queued_analyze' || job.status === 'queued_remediate';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

function replaceSelectedId(selectedIds: string[], previousId: string, nextId: string): string[] {
  return selectedIds.map((id) => (id === previousId ? nextId : id));
}

async function refreshServerJobs(set: QueueSet, get: QueueGet) {
  const current = get().jobs.filter((job) => !job.persisted);
  const serverJobs = (await listFiles()).map(mapStoredFileToJob);
  set({ jobs: sortJobs([...current, ...serverJobs]), storageState: 'ready' });
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
    job = {
      ...job,
      status: job.mode === 'remediate' ? 'remediating' : 'analyzing',
      updatedAt: nowIso(),
    };

    set((state) => ({ jobs: updateJobCollection(state.jobs, job) }));

    const result =
      job.mode === 'grade'
        ? await uploadForAnalyze(job.localFile as File)
        : job.persisted
          ? await remediateStoredFile(job.id)
          : job.localFile
          ? await uploadForRemediation(job.localFile)
          : await remediateStoredFile(job.id);

    const mapped = mapStoredFileToJob(result);
    const nextJob: JobRecord =
      job.mode === 'grade' && job.localFile
        ? {
            ...mapped,
            localFile: job.localFile,
          }
        : mapped;

    set((state) => ({
      jobs: updateJobCollection(state.jobs, nextJob, job.id),
      selectedJobIds: replaceSelectedId(state.selectedJobIds, job.id, nextJob.id),
      detailJobId: state.detailJobId === job.id ? nextJob.id : state.detailJobId,
      validationMessages:
        nextJob.status === 'failed'
          ? [buildValidationMessage(nextJob.fileName, nextJob.errorMessage || 'Request failed.'), ...state.validationMessages].slice(0, 8)
          : state.validationMessages,
    }));
  } catch (error) {
    const message = toErrorMessage(error);
    const failed: JobRecord = {
      ...job,
      status: 'failed',
      updatedAt: nowIso(),
      errorMessage: message,
    };

    set((state) => ({
      jobs: updateJobCollection(state.jobs, failed),
      validationMessages: [buildValidationMessage(job.fileName, message), ...state.validationMessages].slice(0, 8),
      storageState: 'error',
    }));
  } finally {
    set((state) => ({
      activeJobIds: state.activeJobIds.filter((activeId) => activeId !== jobId),
    }));
    void refreshServerJobs(set, get).catch(() => undefined);
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
    set({ storageState: 'loading' });

    try {
      const preferences = loadQueuePreferences();
      const files = await listFiles();

      set({
        jobs: files.map(mapStoredFileToJob),
        hydrated: true,
        selectedJobIds: [],
        activeJobIds: [],
        storageState: 'ready',
        autoRemediateOnAdd: preferences.autoRemediateOnAdd,
        preferredQueueConcurrency: preferences.preferredQueueConcurrency,
        queuePaused: preferences.queuePaused,
      });
    } catch (error) {
      set({
        hydrated: true,
        jobs: [],
        selectedJobIds: [],
        activeJobIds: [],
        storageState: 'error',
        validationMessages: [buildValidationMessage('Server', toErrorMessage(error))],
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

      createdJobs.push(
        createLocalJob(
          file,
          autoRemediateOnAdd ? 'remediate' : 'grade',
          autoRemediateOnAdd ? 'queued_remediate' : 'queued_analyze',
        ),
      );
    }

    set((state) => ({
      jobs: sortJobs([...state.jobs, ...createdJobs]),
      validationMessages: nextMessages,
      isAddingFiles: false,
    }));

    await get().runScheduler();
  },

  removeJob: async (jobId) => {
    const target = get().jobs.find((job) => job.id === jobId);
    if (!target) return;

    if (target.status === 'uploading' || target.status === 'analyzing' || target.status === 'remediating') {
      set((state) => ({
        validationMessages: [
          buildValidationMessage(target.fileName, 'Wait for processing to finish before removing this row.'),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
      return;
    }

    try {
      if (target.persisted) {
        await deleteFile(jobId);
      }

      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
        selectedJobIds: state.selectedJobIds.filter((selectedId) => selectedId !== jobId),
        activeJobIds: state.activeJobIds.filter((activeId) => activeId !== jobId),
        detailJobId: state.detailJobId === jobId ? null : state.detailJobId,
      }));
    } catch (error) {
      set((state) => ({
        validationMessages: [
          buildValidationMessage(target.fileName, toErrorMessage(error)),
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
        state.selectedJobIds.length === state.jobs.length ? [] : state.jobs.map((job) => job.id),
    }));
  },

  clearSelection: () => set({ selectedJobIds: [] }),

  downloadOriginal: async (jobId) => {
    const job = get().jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;

    set((state) => ({
      validationMessages: [
        buildValidationMessage(job.fileName, 'Original PDFs are not kept after processing.'),
        ...state.validationMessages,
      ].slice(0, 8),
    }));
  },

  downloadRemediated: async (jobId) => {
    const job = get().jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;

    try {
      const { blob, fileName } = await downloadFile(jobId);
      startBrowserDownload(blob, fileName);
    } catch (error) {
      set((state) => ({
        validationMessages: [
          buildValidationMessage(job.fileName, toErrorMessage(error)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  },

  setAutoRemediateOnAdd: (enabled) => {
    saveQueuePreferences({
      autoRemediateOnAdd: enabled,
      preferredQueueConcurrency: get().preferredQueueConcurrency,
      queuePaused: get().queuePaused,
    });
    set({ autoRemediateOnAdd: enabled });
  },

  setPreferredQueueConcurrency: (value) => {
    const preferredQueueConcurrency = clampQueueConcurrency(value);
    saveQueuePreferences({
      autoRemediateOnAdd: get().autoRemediateOnAdd,
      preferredQueueConcurrency,
      queuePaused: get().queuePaused,
    });
    set({ preferredQueueConcurrency });
    void get().runScheduler();
  },

  enqueueAnalyze: async (jobIds) => {
    const selectedIds = jobIds ?? get().selectedJobIds;
    if (selectedIds.length === 0) return;
    const queuedAt = nowIso();

    set((state) => ({
      jobs: state.jobs.map((job) =>
        selectedIds.includes(job.id) && canAnalyzeJob(job)
          ? {
              ...job,
              mode: 'grade',
              status: 'queued_analyze',
              processingStartedAt: queuedAt,
              updatedAt: queuedAt,
              errorMessage: undefined,
            }
          : job,
      ),
    }));

    await get().runScheduler();
  },

  enqueueRemediate: async (jobIds) => {
    const selectedIds = jobIds ?? get().selectedJobIds;
    if (selectedIds.length === 0) return;
    const queuedAt = nowIso();
    const nonRetryable = get()
      .jobs.filter((job) => selectedIds.includes(job.id) && !canRemediateJob(job))
      .map((job) => buildValidationMessage(job.fileName, 'This file is no longer available. Add it again to fix it.'));

    set((state) => ({
      jobs: state.jobs.map((job) =>
        selectedIds.includes(job.id) && canRemediateJob(job)
          ? {
              ...job,
              mode: 'remediate',
              status: 'queued_remediate',
              processingStartedAt: queuedAt,
              updatedAt: queuedAt,
              errorMessage: undefined,
            }
          : job,
      ),
      validationMessages: [...nonRetryable, ...state.validationMessages].slice(0, 8),
    }));

    await get().runScheduler();
  },

  pauseQueue: () => {
    saveQueuePreferences({
      autoRemediateOnAdd: get().autoRemediateOnAdd,
      preferredQueueConcurrency: get().preferredQueueConcurrency,
      queuePaused: true,
    });
    set({ queuePaused: true });
  },

  resumeQueue: () => {
    saveQueuePreferences({
      autoRemediateOnAdd: get().autoRemediateOnAdd,
      preferredQueueConcurrency: get().preferredQueueConcurrency,
      queuePaused: false,
    });
    set({ queuePaused: false });
    void get().runScheduler();
  },

  runScheduler: async () => {
    const state = get();
    if (state.queuePaused) return;

    const availableSlots = state.preferredQueueConcurrency - state.activeJobIds.length;
    if (availableSlots <= 0) return;

    const queuedJobs = state.jobs.filter((job) => isQueued(job) && !state.activeJobIds.includes(job.id));
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
    const failedJobs = get().jobs.filter(
      (job) =>
        selectedIds.includes(job.id) &&
        job.status === 'failed' &&
        (job.mode === 'grade' || job.mode === 'remediate'),
    );

    const analyzeIds = failedJobs.filter((job) => job.mode === 'grade').map((job) => job.id);
    const remediateIds = failedJobs.filter((job) => job.mode === 'remediate').map((job) => job.id);

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
            buildValidationMessage('Download', 'Select at least one saved fixed PDF before downloading.'),
            ...state.validationMessages,
          ].slice(0, 8),
        }));
      }
    } catch (error) {
      set((state) => ({
        validationMessages: [
          buildValidationMessage('Download', toErrorMessage(error)),
          ...state.validationMessages,
        ].slice(0, 8),
      }));
    }
  },

  openDetail: (jobId) => set({ detailJobId: jobId }),
  closeDetail: () => set({ detailJobId: null }),
}));

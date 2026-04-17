import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { AnalyzeSummary, RawAnalyzeResponse } from '../../types/analyze';
import type {
  FileMutationResponse,
  StoredDeletionReason,
  StoredFileRecord,
  StoredFileStatus,
  StoredFileSummary,
} from '../../types/files';
import type { JobMode, JobStatus } from '../../types/queue';
import type { RawRemediationResponse, RemediationSummary } from '../../types/remediation';
import { normalizeAnalyzePayload } from '../findings/normalize';

const DEFAULT_STORAGE_DIR = process.env.PDF_AF_STORAGE_DIR?.trim() || '/data';
const DEFAULT_RETENTION_HOURS = Number(process.env.PDF_AF_RETENTION_HOURS ?? '24');
const DEFAULT_RETENTION_MS = DEFAULT_RETENTION_HOURS * 60 * 60 * 1000;
const DEFAULT_QUOTA_BYTES = Number(
  process.env.PDF_AF_PER_USER_QUOTA_BYTES ?? `${1024 * 1024 * 1024}`,
);
const DATABASE_FILE = 'pdf-af-web.sqlite';
const REMEDIATED_DIR = 'remediated';
const SOURCE_DIR = 'source';
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface StoredFileRow {
  id: string;
  session_id: string;
  file_name: string;
  stored_file_name: string | null;
  storage_path: string | null;
  file_size: number;
  stored_size_bytes: number | null;
  source_stored_file_name: string | null;
  source_storage_path: string | null;
  source_stored_size_bytes: number | null;
  mime_type: string;
  status: JobStatus;
  mode: JobMode;
  error_message: string | null;
  file_status: StoredFileStatus;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  deleted_at: string | null;
  deletion_reason: StoredDeletionReason;
  analyze_result_json: string | null;
  remediation_result_json: string | null;
  finding_summaries_json: string | null;
}

interface PersistRecordInput {
  id?: string;
  sessionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: JobStatus;
  mode: JobMode;
  errorMessage?: string | null;
  fileStatus: StoredFileStatus;
  analyzeResult?: AnalyzeSummary;
  remediationResult?: RemediationSummary;
  findingSummaries?: StoredFileRecord['findingSummaries'];
  storedFileName?: string | null;
  storagePath?: string | null;
  storedSizeBytes?: number | null;
  sourceStoredFileName?: string | null;
  sourceStoragePath?: string | null;
  sourceStoredSizeBytes?: number | null;
  expiresAt?: string | null;
  deletedAt?: string | null;
  deletionReason?: StoredDeletionReason;
  createdAt?: string;
  updatedAt?: string;
}

interface UpstreamApiError extends Error {
  status?: number;
  code?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function configuredApiBaseUrl(): string {
  return trimTrailingSlash(
    process.env.PDFAF_API_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_PDFAF_API_BASE_URL?.trim() ||
      'http://localhost:6200',
  );
}

function getStorageDir(): string {
  return DEFAULT_STORAGE_DIR;
}

function getDatabasePath(): string {
  return path.join(getStorageDir(), DATABASE_FILE);
}

function getRemediatedBaseDir(): string {
  return path.join(getStorageDir(), REMEDIATED_DIR);
}

function getSourceBaseDir(): string {
  return path.join(getStorageDir(), SOURCE_DIR);
}

function normalizeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function retentionMs(): number {
  return normalizeNumber(DEFAULT_RETENTION_MS, 24 * 60 * 60 * 1000);
}

function quotaBytes(): number {
  return normalizeNumber(DEFAULT_QUOTA_BYTES, 1024 * 1024 * 1024);
}

function isSeverity(value: unknown): boolean {
  return value === 'critical' || value === 'moderate' || value === 'minor' || value === 'pass';
}

function isGrade(value: unknown): boolean {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'F';
}

function isPdfClass(value: unknown): boolean {
  return (
    value === 'native_tagged' ||
    value === 'native_untagged' ||
    value === 'scanned' ||
    value === 'mixed'
  );
}

function isRawAnalyzeResponse(payload: unknown): payload is RawAnalyzeResponse {
  if (!payload || typeof payload !== 'object') return false;

  const record = payload as Record<string, unknown>;

  return (
    typeof record.id === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.filename === 'string' &&
    typeof record.pageCount === 'number' &&
    isPdfClass(record.pdfClass) &&
    typeof record.score === 'number' &&
    isGrade(record.grade) &&
    typeof record.analysisDurationMs === 'number' &&
    Array.isArray(record.categories) &&
    Array.isArray(record.findings) &&
    record.categories.every((category) => {
      if (!category || typeof category !== 'object') return false;
      const item = category as Record<string, unknown>;
      return (
        typeof item.key === 'string' &&
        typeof item.score === 'number' &&
        typeof item.weight === 'number' &&
        typeof item.applicable === 'boolean' &&
        isSeverity(item.severity) &&
        Array.isArray(item.findings)
      );
    }) &&
    record.findings.every((finding) => {
      if (!finding || typeof finding !== 'object') return false;
      const item = finding as Record<string, unknown>;
      return (
        typeof item.category === 'string' &&
        isSeverity(item.severity) &&
        typeof item.wcag === 'string' &&
        typeof item.message === 'string'
      );
    })
  );
}

function isAppliedToolArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((tool) => {
      if (!tool || typeof tool !== 'object') return false;
      const record = tool as Record<string, unknown>;
      return (
        typeof record.toolName === 'string' &&
        typeof record.stage === 'number' &&
        typeof record.round === 'number' &&
        typeof record.scoreBefore === 'number' &&
        typeof record.scoreAfter === 'number' &&
        typeof record.delta === 'number'
      );
    })
  );
}

function isRoundsArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((round) => {
      if (!round || typeof round !== 'object') return false;
      const record = round as Record<string, unknown>;
      return (
        typeof record.round === 'number' &&
        typeof record.scoreAfter === 'number' &&
        typeof record.improved === 'boolean'
      );
    })
  );
}

function isSemanticSummary(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.skippedReason === 'string' &&
    typeof record.durationMs === 'number' &&
    typeof record.proposalsAccepted === 'number' &&
    typeof record.proposalsRejected === 'number' &&
    typeof record.scoreBefore === 'number' &&
    typeof record.scoreAfter === 'number' &&
    Array.isArray(record.batches)
  );
}

function isOcrPipelineSummary(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.applied === 'boolean' &&
    typeof record.attempted === 'boolean' &&
    typeof record.humanReviewRecommended === 'boolean' &&
    typeof record.guidance === 'string'
  );
}

function isRawRemediationResponse(payload: unknown): payload is RawRemediationResponse {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;

  return (
    isRawAnalyzeResponse(record.before) &&
    isRawAnalyzeResponse(record.after) &&
    (record.remediatedPdfBase64 === null || typeof record.remediatedPdfBase64 === 'string') &&
    typeof record.remediatedPdfTooLarge === 'boolean' &&
    isAppliedToolArray(record.appliedTools) &&
    isRoundsArray(record.rounds) &&
    typeof record.remediationDurationMs === 'number' &&
    typeof record.improved === 'boolean' &&
    (record.semantic === undefined || isSemanticSummary(record.semantic)) &&
    (record.semanticHeadings === undefined || isSemanticSummary(record.semanticHeadings)) &&
    (record.semanticPromoteHeadings === undefined || isSemanticSummary(record.semanticPromoteHeadings)) &&
    (record.semanticUntaggedHeadings === undefined || isSemanticSummary(record.semanticUntaggedHeadings)) &&
    (record.ocrPipeline === undefined || isOcrPipelineSummary(record.ocrPipeline))
  );
}

function normalizeRemediationResponse(payload: RawRemediationResponse): RemediationSummary {
  return {
    before: normalizeAnalyzePayload(payload.before as RawAnalyzeResponse),
    after: normalizeAnalyzePayload(payload.after as RawAnalyzeResponse),
    improved: payload.improved,
    appliedTools: payload.appliedTools,
    rounds: payload.rounds,
    remediationDurationMs: payload.remediationDurationMs,
    remediatedPdfTooLarge: payload.remediatedPdfTooLarge,
    ...(payload.semantic ? { semantic: payload.semantic } : {}),
    ...(payload.semanticHeadings ? { semanticHeadings: payload.semanticHeadings } : {}),
    ...(payload.semanticPromoteHeadings
      ? { semanticPromoteHeadings: payload.semanticPromoteHeadings }
      : {}),
    ...(payload.semanticUntaggedHeadings
      ? { semanticUntaggedHeadings: payload.semanticUntaggedHeadings }
      : {}),
    ...(payload.ocrPipeline ? { ocrPipeline: payload.ocrPipeline } : {}),
  };
}

let databaseInstance: Database.Database | null = null;
let setupPromise: Promise<void> | null = null;
let cleanupStarted = false;

function ensureColumn(db: Database.Database, tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function database(): Database.Database {
  if (databaseInstance) return databaseInstance;

  databaseInstance = new Database(getDatabasePath());
  databaseInstance.pragma('journal_mode = WAL');
  databaseInstance.exec(`
    CREATE TABLE IF NOT EXISTS stored_files (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      stored_file_name TEXT,
      storage_path TEXT,
      file_size INTEGER NOT NULL,
      stored_size_bytes INTEGER,
      source_stored_file_name TEXT,
      source_storage_path TEXT,
      source_stored_size_bytes INTEGER,
      mime_type TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT,
      error_message TEXT,
      file_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      deleted_at TEXT,
      deletion_reason TEXT,
      analyze_result_json TEXT,
      remediation_result_json TEXT,
      finding_summaries_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stored_files_session_created
      ON stored_files(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stored_files_session_file_status
      ON stored_files(session_id, file_status);
    CREATE INDEX IF NOT EXISTS idx_stored_files_expires_at
      ON stored_files(expires_at);
  `);

  ensureColumn(databaseInstance, 'stored_files', 'source_stored_file_name', 'TEXT');
  ensureColumn(databaseInstance, 'stored_files', 'source_storage_path', 'TEXT');
  ensureColumn(databaseInstance, 'stored_files', 'source_stored_size_bytes', 'INTEGER');

  return databaseInstance;
}

export async function ensureServerStorageReady(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      await fs.mkdir(getStorageDir(), { recursive: true });
      await fs.mkdir(getRemediatedBaseDir(), { recursive: true });
      await fs.mkdir(getSourceBaseDir(), { recursive: true });
      database();
      ensureCleanupLoop();
      await sweepExpiredRecordsInternal();
    })();
  }

  await setupPromise;
}

function rowToRecord(row: StoredFileRow): StoredFileRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    fileName: row.file_name,
    storedFileName: row.stored_file_name,
    storagePath: row.storage_path,
    fileSize: row.file_size,
    storedSizeBytes: row.stored_size_bytes,
    sourceStoredFileName: row.source_stored_file_name,
    sourceStoragePath: row.source_storage_path,
    sourceStoredSizeBytes: row.source_stored_size_bytes,
    hasServerSource: Boolean(row.source_storage_path),
    mimeType: row.mime_type,
    status: row.status,
    mode: row.mode,
    errorMessage: row.error_message,
    fileStatus: row.file_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
    deletionReason: row.deletion_reason,
    analyzeResult: row.analyze_result_json
      ? (JSON.parse(row.analyze_result_json) as AnalyzeSummary)
      : undefined,
    remediationResult: row.remediation_result_json
      ? (JSON.parse(row.remediation_result_json) as RemediationSummary)
      : undefined,
    findingSummaries: row.finding_summaries_json
      ? (JSON.parse(row.finding_summaries_json) as StoredFileRecord['findingSummaries'])
      : undefined,
  };
}

function toSummary(record: StoredFileRecord): StoredFileSummary {
  const {
    sessionId: _sessionId,
    storagePath: _storagePath,
    sourceStoredFileName: _sourceStoredFileName,
    sourceStoragePath: _sourceStoragePath,
    sourceStoredSizeBytes: _sourceStoredSizeBytes,
    ...summary
  } = record;
  return summary;
}

function putRecord(input: PersistRecordInput): StoredFileRecord {
  const db = database();
  const id = input.id ?? randomUUID();
  const createdAt = input.createdAt ?? nowIso();
  const updatedAt = input.updatedAt ?? nowIso();

  db.prepare(
    `
      INSERT INTO stored_files (
        id, session_id, file_name, stored_file_name, storage_path, file_size, stored_size_bytes,
        source_stored_file_name, source_storage_path, source_stored_size_bytes, mime_type, status,
        mode, error_message, file_status, created_at, updated_at, expires_at, deleted_at,
        deletion_reason, analyze_result_json, remediation_result_json, finding_summaries_json
      ) VALUES (
        @id, @session_id, @file_name, @stored_file_name, @storage_path, @file_size, @stored_size_bytes,
        @source_stored_file_name, @source_storage_path, @source_stored_size_bytes, @mime_type,
        @status, @mode, @error_message, @file_status, @created_at, @updated_at, @expires_at,
        @deleted_at, @deletion_reason, @analyze_result_json, @remediation_result_json, @finding_summaries_json
      )
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        file_name = excluded.file_name,
        stored_file_name = excluded.stored_file_name,
        storage_path = excluded.storage_path,
        file_size = excluded.file_size,
        stored_size_bytes = excluded.stored_size_bytes,
        source_stored_file_name = excluded.source_stored_file_name,
        source_storage_path = excluded.source_storage_path,
        source_stored_size_bytes = excluded.source_stored_size_bytes,
        mime_type = excluded.mime_type,
        status = excluded.status,
        mode = excluded.mode,
        error_message = excluded.error_message,
        file_status = excluded.file_status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at,
        deleted_at = excluded.deleted_at,
        deletion_reason = excluded.deletion_reason,
        analyze_result_json = excluded.analyze_result_json,
        remediation_result_json = excluded.remediation_result_json,
        finding_summaries_json = excluded.finding_summaries_json
    `,
  ).run({
    id,
    session_id: input.sessionId,
    file_name: input.fileName,
    stored_file_name: input.storedFileName ?? null,
    storage_path: input.storagePath ?? null,
    file_size: input.fileSize,
    stored_size_bytes: input.storedSizeBytes ?? null,
    source_stored_file_name: input.sourceStoredFileName ?? null,
    source_storage_path: input.sourceStoragePath ?? null,
    source_stored_size_bytes: input.sourceStoredSizeBytes ?? null,
    mime_type: input.mimeType,
    status: input.status,
    mode: input.mode,
    error_message: input.errorMessage ?? null,
    file_status: input.fileStatus,
    created_at: createdAt,
    updated_at: updatedAt,
    expires_at: input.expiresAt ?? null,
    deleted_at: input.deletedAt ?? null,
    deletion_reason: input.deletionReason ?? null,
    analyze_result_json: input.analyzeResult ? JSON.stringify(input.analyzeResult) : null,
    remediation_result_json: input.remediationResult ? JSON.stringify(input.remediationResult) : null,
    finding_summaries_json: input.findingSummaries ? JSON.stringify(input.findingSummaries) : null,
  });

  return rowToRecord(
    db.prepare('SELECT * FROM stored_files WHERE id = ?').get(id) as StoredFileRow,
  );
}

export async function listStoredFiles(sessionId: string): Promise<StoredFileSummary[]> {
  await ensureServerStorageReady();
  const rows = database()
    .prepare('SELECT * FROM stored_files WHERE session_id = ? ORDER BY created_at DESC')
    .all(sessionId) as StoredFileRow[];

  return rows.map((row) => toSummary(rowToRecord(row)));
}

export async function getStoredFile(
  sessionId: string,
  id: string,
): Promise<StoredFileRecord | null> {
  await ensureServerStorageReady();
  const row = database()
    .prepare('SELECT * FROM stored_files WHERE id = ? AND session_id = ?')
    .get(id, sessionId) as StoredFileRow | undefined;

  return row ? rowToRecord(row) : null;
}

export async function deleteStoredFile(sessionId: string, id: string): Promise<boolean> {
  await ensureServerStorageReady();
  const record = await getStoredFile(sessionId, id);
  if (!record) return false;

  if (record.storagePath) {
    await fs.rm(record.storagePath, { force: true }).catch(() => undefined);
  }
  if (record.sourceStoragePath) {
    await fs.rm(record.sourceStoragePath, { force: true }).catch(() => undefined);
  }

  database().prepare('DELETE FROM stored_files WHERE id = ? AND session_id = ?').run(id, sessionId);
  return true;
}

function remediatedPath(sessionId: string, id: string): string {
  return path.join(getRemediatedBaseDir(), sessionId, `${id}.pdf`);
}

function sourcePath(sessionId: string, id: string): string {
  return path.join(getSourceBaseDir(), sessionId, `${id}.pdf`);
}

async function saveRemediatedFile(
  sessionId: string,
  id: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<{ storagePath: string; storedFileName: string; storedSizeBytes: number }> {
  const dir = path.join(getRemediatedBaseDir(), sessionId);
  await fs.mkdir(dir, { recursive: true });
  const storagePath = remediatedPath(sessionId, id);
  await fs.writeFile(storagePath, bytes);

  return {
    storagePath,
    storedFileName: fileName.toLowerCase().endsWith('.pdf')
      ? `${fileName.slice(0, -4)}-remediated.pdf`
      : `${fileName}-remediated.pdf`,
    storedSizeBytes: bytes.byteLength,
  };
}

async function saveSourceFile(
  sessionId: string,
  id: string,
  file: File,
): Promise<{ sourceStoragePath: string; sourceStoredFileName: string; sourceStoredSizeBytes: number }> {
  const dir = path.join(getSourceBaseDir(), sessionId);
  await fs.mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  const sourceStoragePath = sourcePath(sessionId, id);
  await fs.writeFile(sourceStoragePath, bytes);

  return {
    sourceStoragePath,
    sourceStoredFileName: file.name,
    sourceStoredSizeBytes: bytes.byteLength,
  };
}

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

async function enforceQuota(sessionId: string, keepId: string) {
  const db = database();
  const rows = db
    .prepare(
      `
        SELECT * FROM stored_files
        WHERE session_id = ?
          AND (storage_path IS NOT NULL OR source_storage_path IS NOT NULL)
        ORDER BY created_at ASC
      `,
    )
    .all(sessionId) as StoredFileRow[];

  let totalBytes = rows.reduce(
    (sum, row) => sum + (row.stored_size_bytes ?? 0) + (row.source_stored_size_bytes ?? 0),
    0,
  );
  const quota = quotaBytes();

  for (const row of rows) {
    if (totalBytes <= quota) break;
    if (row.id === keepId) continue;

    const record = rowToRecord(row);
    if (record.storagePath) {
      await fs.rm(record.storagePath, { force: true }).catch(() => undefined);
    }
    if (record.sourceStoragePath) {
      await fs.rm(record.sourceStoragePath, { force: true }).catch(() => undefined);
    }

    const removedBytes = (record.storedSizeBytes ?? 0) + (record.sourceStoredSizeBytes ?? 0);
    const removedVisibleFile = record.fileStatus === 'available' && Boolean(record.storagePath);
    const removedHiddenSource = Boolean(record.sourceStoragePath);

    const errorMessage = removedVisibleFile
      ? 'Deleted to stay under your saved file limit. Download fixed files sooner.'
      : removedHiddenSource && record.analyzeResult && !record.remediationResult
        ? 'Saved source was removed to stay under your storage limit. Add the PDF again if you want to fix it.'
        : record.errorMessage ?? null;

    const updated = putRecord({
      ...record,
      sessionId: record.sessionId,
      fileName: record.fileName,
      fileSize: record.fileSize,
      mimeType: record.mimeType,
      status: record.status,
      mode: record.mode,
      fileStatus: removedVisibleFile ? 'quota_deleted' : record.fileStatus,
      storedFileName: record.storedFileName,
      storagePath: null,
      storedSizeBytes: null,
      sourceStoredFileName: removedHiddenSource ? null : record.sourceStoredFileName,
      sourceStoragePath: null,
      sourceStoredSizeBytes: null,
      updatedAt: nowIso(),
      deletedAt: removedVisibleFile ? nowIso() : record.deletedAt,
      deletionReason: removedVisibleFile ? 'quota' : record.deletionReason,
      errorMessage,
      analyzeResult: record.analyzeResult,
      remediationResult: record.remediationResult,
      findingSummaries: record.findingSummaries,
      expiresAt: record.expiresAt,
    });

    totalBytes -= removedBytes;
    if (updated.id === keepId && totalBytes > quota) {
      break;
    }
  }
}

async function markExpiredRecord(record: StoredFileRecord) {
  if (record.storagePath) {
    await fs.rm(record.storagePath, { force: true }).catch(() => undefined);
  }
  if (record.sourceStoragePath) {
    await fs.rm(record.sourceStoragePath, { force: true }).catch(() => undefined);
  }

  const expiredVisibleFile = record.fileStatus === 'available' && Boolean(record.storagePath);
  const expiredHiddenSource = Boolean(record.sourceStoragePath);
  const errorMessage = expiredVisibleFile
    ? 'Expired after 24 hours. Download fixed files before they expire.'
    : expiredHiddenSource && record.analyzeResult && !record.remediationResult
      ? 'Saved source expired after 24 hours. Add the PDF again if you want to fix it.'
      : record.errorMessage ?? null;

  putRecord({
    ...record,
    sessionId: record.sessionId,
    fileName: record.fileName,
    fileSize: record.fileSize,
    mimeType: record.mimeType,
    status: record.status,
    mode: record.mode,
    fileStatus: expiredVisibleFile ? 'expired' : record.fileStatus,
    storagePath: null,
    storedSizeBytes: null,
    sourceStoredFileName: expiredHiddenSource ? null : record.sourceStoredFileName,
    sourceStoragePath: null,
    sourceStoredSizeBytes: null,
    updatedAt: nowIso(),
    deletedAt: expiredVisibleFile ? nowIso() : record.deletedAt,
    deletionReason: expiredVisibleFile ? 'expired' : record.deletionReason,
    errorMessage,
    analyzeResult: record.analyzeResult,
    remediationResult: record.remediationResult,
    findingSummaries: record.findingSummaries,
    storedFileName: record.storedFileName,
    expiresAt: record.expiresAt,
  });
}

async function sweepExpiredRecordsInternal() {
  const rows = database()
    .prepare(
      `
        SELECT * FROM stored_files
        WHERE (storage_path IS NOT NULL OR source_storage_path IS NOT NULL)
          AND expires_at IS NOT NULL
          AND expires_at <= ?
      `,
    )
    .all(nowIso()) as StoredFileRow[];

  for (const row of rows) {
    await markExpiredRecord(rowToRecord(row));
  }
}

export async function sweepExpiredRecords() {
  await ensureServerStorageReady();
  await sweepExpiredRecordsInternal();
}

function ensureCleanupLoop() {
  if (cleanupStarted) return;
  cleanupStarted = true;

  const timer = setInterval(() => {
    void sweepExpiredRecords();
  }, CLEANUP_INTERVAL_MS);

  timer.unref?.();
}

async function parseUpstreamJson(response: Response): Promise<unknown> {
  const text = await response.text();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    const error = new Error('The PDFAF API returned invalid JSON.') as UpstreamApiError;
    error.status = response.status;
    error.code = 'INVALID_JSON';
    throw error;
  }
}

async function postToUpstream(pathname: string, formData: FormData): Promise<unknown> {
  const baseUrl = configuredApiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    });
  } catch {
    const error = new Error('Unable to reach the PDFAF API from the web server.') as UpstreamApiError;
    error.status = 502;
    error.code = 'UPSTREAM_UNREACHABLE';
    throw error;
  }

  const payload = await parseUpstreamJson(response);
  if (!response.ok) {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const error = new Error(
      typeof record?.error === 'string' ? record.error : `Request failed with HTTP ${response.status}.`,
    ) as UpstreamApiError;
    error.status = response.status;
    error.code = typeof record?.code === 'string' ? record.code : 'UPSTREAM_ERROR';
    throw error;
  }

  return payload;
}

export async function createAnalyzeRecord(sessionId: string, file: File): Promise<StoredFileSummary> {
  await ensureServerStorageReady();
  const formData = new FormData();
  formData.append('file', file, file.name);

  try {
    const payload = await postToUpstream('/v1/analyze', formData);
    if (!isRawAnalyzeResponse(payload)) {
      throw new Error('The PDFAF API returned a malformed analysis payload.');
    }

    const analyzeResult = normalizeAnalyzePayload(payload);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + retentionMs()).toISOString();
    let sourceStoredFileName: string | null = null;
    let sourceStoragePath: string | null = null;
    let sourceStoredSizeBytes: number | null = null;
    let errorMessage: string | null = null;

    try {
      const savedSource = await saveSourceFile(sessionId, id, file);
      sourceStoredFileName = savedSource.sourceStoredFileName;
      sourceStoragePath = savedSource.sourceStoragePath;
      sourceStoredSizeBytes = savedSource.sourceStoredSizeBytes;
    } catch {
      errorMessage = 'Checked, but the server could not save this PDF for later fixing.';
    }

    const record = putRecord({
      id,
      sessionId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/pdf',
      status: 'done',
      mode: 'grade',
      fileStatus: 'none',
      errorMessage,
      analyzeResult,
      findingSummaries: analyzeResult.topFindings,
      sourceStoredFileName,
      sourceStoragePath,
      sourceStoredSizeBytes,
      expiresAt,
    });

    if (sourceStoragePath) {
      await enforceQuota(sessionId, record.id);
    }

    return toSummary((await getStoredFile(sessionId, record.id)) ?? record);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    const failed = putRecord({
      sessionId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/pdf',
      status: 'failed',
      mode: 'grade',
      fileStatus: 'failed',
      errorMessage: message,
    });

    return toSummary(failed);
  }
}

async function resolveSourceFile(input: { file?: File; sessionId: string; fileId?: string }): Promise<File> {
  if (input.file) {
    return input.file;
  }

  if (!input.fileId) {
    throw new Error('No source PDF was provided.');
  }

  const existing = await getStoredFile(input.sessionId, input.fileId);
  if (!existing) {
    throw new Error('This saved file is no longer available. Add the PDF again.');
  }

  const sourcePathname = existing.sourceStoragePath ?? existing.storagePath;
  const sourceFileName =
    existing.sourceStoredFileName ?? existing.storedFileName ?? existing.fileName;

  if (!sourcePathname) {
    throw new Error('This saved file is no longer available. Add the PDF again.');
  }

  const bytes = await fs.readFile(sourcePathname);
  return new File([bytes], sourceFileName, {
    type: existing.mimeType || 'application/pdf',
  });
}

export async function createRemediationRecord(input: {
  sessionId: string;
  file?: File;
  fileId?: string;
}): Promise<StoredFileSummary> {
  await ensureServerStorageReady();
  const existingRecord = input.fileId ? await getStoredFile(input.sessionId, input.fileId) : null;
  const sourceFile = await resolveSourceFile(input);
  const formData = new FormData();
  formData.append('file', sourceFile, sourceFile.name);

  try {
    const payload = await postToUpstream('/v1/remediate', formData);
    if (!isRawRemediationResponse(payload)) {
      throw new Error('The PDFAF API returned a malformed remediation payload.');
    }

    const remediationResult = normalizeRemediationResponse(payload);
    const id = existingRecord?.id ?? randomUUID();
    const expiresAt = new Date(Date.now() + retentionMs()).toISOString();
    let fileStatus: StoredFileStatus = existingRecord?.fileStatus ?? 'failed';
    let storedFileName: string | null = existingRecord?.storedFileName ?? null;
    let storagePath: string | null = existingRecord?.storagePath ?? null;
    let storedSizeBytes: number | null = existingRecord?.storedSizeBytes ?? null;
    let sourceStoredFileName: string | null = existingRecord?.sourceStoredFileName ?? null;
    let sourceStoragePath: string | null = existingRecord?.sourceStoragePath ?? null;
    let sourceStoredSizeBytes: number | null = existingRecord?.sourceStoredSizeBytes ?? null;
    let errorMessage: string | null =
      payload.remediatedPdfTooLarge
        ? 'Fixed file was too large to save for download. Download earlier or retry with a smaller PDF.'
        : null;

    if (payload.remediatedPdfBase64) {
      const bytes = decodeBase64(payload.remediatedPdfBase64);
      const saved = await saveRemediatedFile(input.sessionId, id, sourceFile.name, bytes);
      fileStatus = 'available';
      storedFileName = saved.storedFileName;
      storagePath = saved.storagePath;
      storedSizeBytes = saved.storedSizeBytes;

      if (sourceStoragePath) {
        await fs.rm(sourceStoragePath, { force: true }).catch(() => undefined);
      }
      sourceStoredFileName = null;
      sourceStoragePath = null;
      sourceStoredSizeBytes = null;
    }

    const record = putRecord({
      id,
      sessionId: input.sessionId,
      fileName: existingRecord?.fileName ?? sourceFile.name,
      fileSize: existingRecord?.fileSize ?? sourceFile.size,
      mimeType: sourceFile.type || 'application/pdf',
      status: 'done',
      mode: 'remediate',
      fileStatus,
      errorMessage,
      analyzeResult: remediationResult.after,
      remediationResult,
      findingSummaries: remediationResult.after.topFindings,
      storedFileName,
      storagePath,
      storedSizeBytes,
      sourceStoredFileName,
      sourceStoragePath,
      sourceStoredSizeBytes,
      expiresAt,
      createdAt: existingRecord?.createdAt,
    });

    if (fileStatus === 'available') {
      await enforceQuota(input.sessionId, record.id);
    }

    return toSummary((await getStoredFile(input.sessionId, record.id)) ?? record);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Remediation failed.';
    const failed = putRecord({
      id: existingRecord?.id,
      sessionId: input.sessionId,
      fileName: existingRecord?.fileName ?? sourceFile.name,
      fileSize: existingRecord?.fileSize ?? sourceFile.size,
      mimeType: sourceFile.type || 'application/pdf',
      status: 'failed',
      mode: 'remediate',
      fileStatus: existingRecord?.fileStatus ?? 'failed',
      errorMessage: message,
      analyzeResult: existingRecord?.analyzeResult,
      remediationResult: existingRecord?.remediationResult,
      findingSummaries: existingRecord?.findingSummaries,
      storedFileName: existingRecord?.storedFileName,
      storagePath: existingRecord?.storagePath,
      storedSizeBytes: existingRecord?.storedSizeBytes,
      sourceStoredFileName: existingRecord?.sourceStoredFileName,
      sourceStoragePath: existingRecord?.sourceStoragePath,
      sourceStoredSizeBytes: existingRecord?.sourceStoredSizeBytes,
      expiresAt: existingRecord?.expiresAt,
      createdAt: existingRecord?.createdAt,
      deletedAt: existingRecord?.deletedAt,
      deletionReason: existingRecord?.deletionReason,
    });

    return toSummary(failed);
  }
}

export async function readDownloadFile(
  sessionId: string,
  id: string,
): Promise<{ fileName: string; mimeType: string; bytes: Buffer } | null> {
  await ensureServerStorageReady();
  const record = await getStoredFile(sessionId, id);
  if (!record || record.fileStatus !== 'available' || !record.storagePath) {
    return null;
  }

  try {
    const bytes = await fs.readFile(record.storagePath);
    return {
      fileName: record.storedFileName || record.fileName,
      mimeType: record.mimeType || 'application/pdf',
      bytes,
    };
  } catch {
    putRecord({
      ...record,
      sessionId: record.sessionId,
      fileName: record.fileName,
      fileSize: record.fileSize,
      mimeType: record.mimeType,
      status: record.status,
      mode: record.mode,
      fileStatus: 'failed',
      storagePath: null,
      storedSizeBytes: null,
      sourceStoredFileName: record.sourceStoredFileName,
      sourceStoragePath: record.sourceStoragePath,
      sourceStoredSizeBytes: record.sourceStoredSizeBytes,
      updatedAt: nowIso(),
      errorMessage: 'Saved file is no longer available on the server.',
      analyzeResult: record.analyzeResult,
      remediationResult: record.remediationResult,
      findingSummaries: record.findingSummaries,
      storedFileName: record.storedFileName,
      expiresAt: record.expiresAt,
      deletedAt: record.deletedAt,
      deletionReason: record.deletionReason,
    });

    return null;
  }
}

export function wrapFileMutationResponse(file: StoredFileSummary): FileMutationResponse {
  return { file };
}

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FileBlobRecord, JobRecord } from '../../types/queue';

const DB_NAME = 'pdf-af-web';
const DB_VERSION = 1;
const JOB_RECORDS_STORE = 'jobRecords';
const FILE_BLOBS_STORE = 'fileBlobs';

interface PdfAfDbSchema extends DBSchema {
  jobRecords: {
    key: string;
    value: JobRecord;
    indexes: {
      status: JobRecord['status'];
      createdAt: string;
      updatedAt: string;
      fileName: string;
    };
  };
  fileBlobs: {
    key: string;
    value: FileBlobRecord;
    indexes: {
      jobId: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PdfAfDbSchema>> | null = null;

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function getDb(): Promise<IDBPDatabase<PdfAfDbSchema>> {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  if (!dbPromise) {
    dbPromise = openDB<PdfAfDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(JOB_RECORDS_STORE)) {
          const jobStore = db.createObjectStore(JOB_RECORDS_STORE, { keyPath: 'id' });
          jobStore.createIndex('status', 'status');
          jobStore.createIndex('createdAt', 'createdAt');
          jobStore.createIndex('updatedAt', 'updatedAt');
          jobStore.createIndex('fileName', 'fileName');
        }

        if (!db.objectStoreNames.contains(FILE_BLOBS_STORE)) {
          const blobStore = db.createObjectStore(FILE_BLOBS_STORE, { keyPath: 'blobKey' });
          blobStore.createIndex('jobId', 'jobId');
        }
      },
    });
  }

  return dbPromise;
}

export async function listJobRecords(): Promise<JobRecord[]> {
  const db = await getDb();
  const jobs = await db.getAll(JOB_RECORDS_STORE);

  return jobs.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function createJobWithOriginalBlob(
  job: JobRecord,
  blobRecord: FileBlobRecord,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([JOB_RECORDS_STORE, FILE_BLOBS_STORE], 'readwrite');

  await tx.objectStore(JOB_RECORDS_STORE).put(job);
  await tx.objectStore(FILE_BLOBS_STORE).put(blobRecord);
  await tx.done;
}

export async function deleteJobAndBlobs(jobId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([JOB_RECORDS_STORE, FILE_BLOBS_STORE], 'readwrite');
  const blobIndex = tx.objectStore(FILE_BLOBS_STORE).index('jobId');
  const blobKeys = await blobIndex.getAllKeys(jobId);

  await Promise.all(blobKeys.map((blobKey) => tx.objectStore(FILE_BLOBS_STORE).delete(blobKey)));
  await tx.objectStore(JOB_RECORDS_STORE).delete(jobId);
  await tx.done;
}

export async function getBlobByKey(blobKey: string): Promise<FileBlobRecord | undefined> {
  const db = await getDb();
  return db.get(FILE_BLOBS_STORE, blobKey);
}

export async function getOriginalBlob(jobId: string): Promise<FileBlobRecord | undefined> {
  const db = await getDb();
  const tx = db.transaction(FILE_BLOBS_STORE, 'readonly');
  const index = tx.store.index('jobId');
  const blobs = await index.getAll(jobId);

  return blobs.find((blob) => blob.kind === 'original');
}

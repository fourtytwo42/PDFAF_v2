import { zipSync, strToU8 } from 'fflate';
import { getRemediatedBlob } from '../storage/pdfafDb';
import type { JobRecord } from '../../types/queue';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function buildArchiveName(now: Date): string {
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('');
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');

  return `pdf-af-remediated-${stamp}-${time}.zip`;
}

function triggerDownload(blob: Blob, fileName: string) {
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function downloadSelectedRemediatedZip(jobs: JobRecord[]): Promise<number> {
  const fileEntries: Record<string, Uint8Array> = {};
  let includedCount = 0;

  for (const job of jobs) {
    if (!job.remediatedBlobKey) continue;

    const blobRecord = await getRemediatedBlob(job.id);
    if (!blobRecord) continue;

    fileEntries[blobRecord.fileName] = await blobToUint8Array(blobRecord.blob);
    includedCount += 1;
  }

  if (includedCount === 0) {
    return 0;
  }

  fileEntries['README.txt'] = strToU8(
    'PDF AF remediated outputs archive. Files were assembled in the browser and were not re-uploaded.',
  );

  const zipped = zipSync(fileEntries, { level: 0 });
  const zipBlob = new Blob([toArrayBuffer(zipped)], { type: 'application/zip' });
  triggerDownload(zipBlob, buildArchiveName(new Date()));

  return includedCount;
}

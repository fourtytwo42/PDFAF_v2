/**
 * Shared ICIJA audit HTTP client (multipart `file` field).
 * Used by `icjia-audit-corpus-batch.ts` and `icjia-retry-failed-audits.ts`.
 */
export const DEFAULT_ICJIA_URL = 'https://audit.icjia.app/api/analyze';
/** ~4 requests / minute */
export const DEFAULT_ICJIA_INTERVAL_MS = 15_000;

export interface IcjiaAnalyzeJson {
  filename?: string;
  overallScore?: number;
  grade?: string;
  executiveSummary?: string;
  categories?: Array<{
    id?: string;
    label?: string;
    score?: number | null;
    grade?: string | null;
    weight?: number;
    severity?: string | null;
    findings?: string[];
  }>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function parseIcjiaMinIntervalMs(): number {
  const raw = (process.env['PDFAF_ICJIA_MIN_INTERVAL_MS'] ?? '').trim();
  if (!raw) return DEFAULT_ICJIA_INTERVAL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_ICJIA_INTERVAL_MS;
}

function parse429MaxRetries(): number {
  const raw = parseInt(process.env['PDFAF_ICJIA_429_MAX_RETRIES'] ?? '8', 10);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 30) return raw;
  return 8;
}

function parse429WaitMs(): number {
  const raw = parseInt(process.env['PDFAF_ICJIA_429_WAIT_MS'] ?? '90000', 10);
  if (Number.isFinite(raw) && raw >= 5_000 && raw <= 600_000) return raw;
  return 90_000;
}

/** Clamp `Retry-After` from server (sometimes ~3600s) so a batch does not sleep half an hour per 429. */
function parseRetryAfterCapMs(): number {
  const raw = parseInt(process.env['PDFAF_ICJIA_RETRY_AFTER_CAP_MS'] ?? '300000', 10);
  if (Number.isFinite(raw) && raw >= 30_000 && raw <= 3_600_000) return raw;
  return 300_000;
}

export async function postIcjiaAnalyze(
  url: string,
  pdfBuffer: Buffer,
  filename: string,
): Promise<{
  ok: boolean;
  status: number;
  rawBody: string;
  json?: IcjiaAnalyzeJson;
  errorText?: string;
}> {
  const max429 = parse429MaxRetries();
  const base429Wait = parse429WaitMs();
  const retryAfterCap = parseRetryAfterCapMs();

  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
    try {
      const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(600_000) });
      const text = await res.text();

      if (res.status === 429 && attempt < max429) {
        const ra = res.headers.get('retry-after');
        const raSec = ra ? parseInt(ra, 10) : NaN;
        const fromHeader = Number.isFinite(raSec) && raSec > 0 ? raSec * 1000 : base429Wait;
        const waitMs = Math.min(fromHeader, retryAfterCap);
        if (fromHeader > waitMs) {
          console.warn(
            `[icjia] Retry-After ${Math.round(fromHeader / 1000)}s capped to ${Math.round(waitMs / 1000)}s (PDFAF_ICJIA_RETRY_AFTER_CAP_MS)`,
          );
        }
        console.warn(
          `[icjia] HTTP 429 for ${filename}, retry ${attempt + 1}/${max429} after ${Math.round(waitMs / 1000)}s`,
        );
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        return { ok: false, status: res.status, rawBody: text, errorText: text.slice(0, 2000) };
      }
      try {
        return { ok: true, status: res.status, rawBody: text, json: JSON.parse(text) as IcjiaAnalyzeJson };
      } catch {
        return { ok: false, status: res.status, rawBody: text, errorText: `non-json: ${text.slice(0, 500)}` };
      }
    } catch (e) {
      return { ok: false, status: 0, rawBody: '', errorText: (e as Error).message };
    }
  }
}

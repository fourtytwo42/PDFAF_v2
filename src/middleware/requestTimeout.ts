import type { RequestHandler } from 'express';
import { sendApiError } from '../apiError.js';

const MB = 1024 * 1024;
const FIVE_MIN_MS = 5 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_FILE_SIZE_BYTES = 100 * MB;
const MS_PER_MB = TWO_HOURS_MS / 100;

function parseContentLengthBytes(rawValue: string | string[] | undefined): number | null {
  if (typeof rawValue !== 'string') return null;
  const value = Number(rawValue.trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function scaledTimeoutMsFromBytes(bytes: number | null, fallbackMs: number): number {
  if (bytes === null) return fallbackMs;

  const clampedBytes = Math.min(bytes, MAX_FILE_SIZE_BYTES);
  const sizeMb = clampedBytes / MB;
  if (sizeMb < 5) {
    return FIVE_MIN_MS;
  }

  return Math.max(TEN_MIN_MS, Math.round(sizeMb * MS_PER_MB));
}

/** Aborts the HTTP response if the handler has not finished within an adaptive timeout. */
export function requestTimeout(ms: number): RequestHandler {
  if (ms <= 0) {
    return (_req, _res, next) => next();
  }
  return (req, res, next) => {
    const timeoutMs = scaledTimeoutMsFromBytes(parseContentLengthBytes(req.headers['content-length']), ms);
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        sendApiError(
          res,
          504,
          'REQUEST_TIMEOUT',
          'The request took too long and was closed by the server.',
        );
        res.locals.__timedOut = true;
      }
      try {
        req.destroy();
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

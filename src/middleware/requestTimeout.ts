import type { RequestHandler } from 'express';
import { sendApiError } from '../apiError.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Aborts the HTTP response if the handler has not finished within one hour. */
export function requestTimeout(ms: number): RequestHandler {
  if (ms <= 0) {
    return (_req, _res, next) => next();
  }
  return (req, res, next) => {
    const timeoutMs = ONE_HOUR_MS;
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

import type { RequestHandler } from 'express';
import { sendApiError } from '../apiError.js';

/** Aborts the HTTP response if the handler has not finished within `ms` (non-zero). */
export function requestTimeout(ms: number): RequestHandler {
  if (ms <= 0) {
    return (_req, _res, next) => next();
  }
  return (req, res, next) => {
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
    }, ms);
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

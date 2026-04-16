import type { Response } from 'express';
import { isProductionNodeEnv } from './config.js';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'INVALID_OPTIONS'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'REQUEST_TIMEOUT'
  | 'SERVER_AT_CAPACITY'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: string;
  code: ErrorCode;
  requestId?: string;
  details?: unknown;
}

export function sendApiError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): void {
  if (res.headersSent) return;
  const requestId = res.locals.requestId;
  const body: ApiErrorBody = {
    error: message,
    code,
    ...(requestId ? { requestId } : {}),
  };
  if (details !== undefined && !isProductionNodeEnv()) {
    body.details = details;
  }
  res.status(status).json(body);
}

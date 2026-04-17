import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import {
  RATE_LIMIT_ANALYZE_MAX,
  RATE_LIMIT_ANALYZE_WINDOW_MS,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_REMEDIATE_MAX,
  RATE_LIMIT_REMEDIATE_WINDOW_MS,
  REQUEST_TIMEOUT_ANALYZE_MS,
  REQUEST_TIMEOUT_REMEDIATE_MS,
} from './config.js';
import { sendApiError } from './apiError.js';
import { logError, logInfo } from './logging.js';
import { analyzeRouter } from './routes/analyze.js';
import { remediateRouter } from './routes/remediate.js';
import { healthRouter } from './routes/health.js';
import { playbooksRouter } from './routes/playbooks.js';
import { requestTimeout } from './middleware/requestTimeout.js';

const analyzeLimiter = rateLimit({
  windowMs: RATE_LIMIT_ANALYZE_WINDOW_MS,
  max: RATE_LIMIT_ANALYZE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendApiError(
      res,
      429,
      'TOO_MANY_REQUESTS',
      'Too many analyze requests from this IP. Try again later.',
    );
  },
});

const remediateLimiter = rateLimit({
  windowMs: RATE_LIMIT_REMEDIATE_WINDOW_MS,
  max: RATE_LIMIT_REMEDIATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.method !== 'POST',
  handler: (_req, res) => {
    sendApiError(
      res,
      429,
      'TOO_MANY_REQUESTS',
      'Too many remediate requests from this IP. Try again later.',
    );
  },
});

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
    res.locals.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      const path = (req.originalUrl ?? req.url).split('?')[0] ?? req.path;
      logInfo({
        message: 'request',
        requestId: res.locals.requestId,
        method: req.method,
        path,
        durationMs: Date.now() - started,
      });
    });
    next();
  });

  if (RATE_LIMIT_ENABLED) {
    app.use('/v1/analyze', analyzeLimiter);
  }
  app.use('/v1/analyze', requestTimeout(REQUEST_TIMEOUT_ANALYZE_MS), analyzeRouter);
  if (RATE_LIMIT_ENABLED) {
    app.use('/v1/remediate', remediateLimiter);
  }
  app.use('/v1/remediate', requestTimeout(REQUEST_TIMEOUT_REMEDIATE_MS), remediateRouter);
  app.use('/v1/playbooks', playbooksRouter);
  app.use('/v1/health', healthRouter);

  app.use((_req, res) => {
    sendApiError(res, 404, 'NOT_FOUND', 'Not found');
  });

  app.use((err: Error & { status?: number; code?: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message?.includes('Only PDF')) {
      sendApiError(res, 400, 'BAD_REQUEST', err.message);
      return;
    }
    if ((err as NodeJS.ErrnoException).code === 'LIMIT_FILE_SIZE') {
      sendApiError(res, 413, 'FILE_TOO_LARGE', 'Uploaded file exceeds the configured maximum size.');
      return;
    }
    logError({
      message: 'unhandled_error',
      requestId: res.locals.requestId,
      path: req.path,
      error: err.message,
    });
    sendApiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  });

  return app;
}

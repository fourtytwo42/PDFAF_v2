import express, { type Express } from 'express';
import { analyzeRouter } from './routes/analyze.js';
import { remediateRouter } from './routes/remediate.js';
import { healthRouter }  from './routes/health.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Request logging (minimal, not using a logger dep)
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  app.use('/v1/analyze', analyzeRouter);
  app.use('/v1/remediate', remediateRouter);
  app.use('/v1/health',  healthRouter);

  // 404 fallback
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message?.includes('Only PDF')) {
      res.status(400).json({ error: err.message });
      return;
    }
    if ((err as any).code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large' });
      return;
    }
    console.error('[app] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

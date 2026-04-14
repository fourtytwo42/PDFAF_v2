import { createApp } from './app.js';
import { PORT } from './config.js';
import { getDb } from './db/client.js';

const app = createApp();

// Eagerly initialise DB so schema errors surface at startup, not first request
try {
  getDb();
  console.log('[server] database ready');
} catch (err) {
  console.error('[server] database init failed:', err);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`[server] PDFAF v2 listening on port ${PORT}`);
  console.log(`[server] POST http://localhost:${PORT}/v1/analyze`);
  console.log(`[server] GET  http://localhost:${PORT}/v1/health`);
});

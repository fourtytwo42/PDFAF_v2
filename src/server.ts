import { createApp } from './app.js';
import { PORT } from './config.js';
import { getDb } from './db/client.js';
import { startEmbeddedLlmIfEnabled, stopEmbeddedLlm } from './llm/embedLocalLlama.js';
import { bootstrapOpenAiModelFromServer } from './llm/syncRemoteOpenAiModel.js';
import { logError, logInfo } from './logging.js';

async function main(): Promise<void> {
  await startEmbeddedLlmIfEnabled();
  await bootstrapOpenAiModelFromServer();

  const app = createApp();

  try {
    getDb();
    logInfo({ message: 'database_ready' });
  } catch (err) {
    logError({ message: 'database_init_failed', error: String(err) });
    stopEmbeddedLlm();
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logInfo({
      message: 'server_listen',
      details: {
        port: PORT,
        analyze: `http://localhost:${PORT}/v1/analyze`,
        health: `http://localhost:${PORT}/v1/health`,
      },
    });
  });

  const shutdown = () => {
    stopEmbeddedLlm();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch(err => {
  logError({ message: 'server_boot_failed', error: String(err) });
  stopEmbeddedLlm();
  process.exit(1);
});

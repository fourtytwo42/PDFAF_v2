// Bootstrap for pdfjsWorker in dev (tsx) mode.
// Node.js doesn't propagate --import hooks to worker threads (Node v20+ limitation).
// We use tsx's own register() API which properly sets up module.register() with
// the correct MessageChannel and data payload that tsx's initialize hook expects.
import { register } from 'tsx/esm/api';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Register tsx so .ts files can be imported in this worker thread
register();

// Now import the TypeScript worker
await import(pathToFileURL(join(__dirname, 'pdfjsWorker.ts')).href);

import { app, BrowserWindow, dialog } from 'electron';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type StartupPhase =
  | 'idle'
  | 'allocating_ports'
  | 'starting_api'
  | 'waiting_for_api'
  | 'starting_web'
  | 'waiting_for_web'
  | 'ready'
  | 'failed'
  | 'shutting_down';

interface StartupError {
  component: 'api' | 'web' | 'desktop';
  message: string;
  stderrTail: string[];
}

interface ManagedChild {
  name: 'api' | 'web';
  proc: ChildProcessWithoutNullStreams;
  stderrTail: string[];
}

interface RuntimeState {
  apiChild: ManagedChild | null;
  webChild: ManagedChild | null;
  apiPort: number | null;
  webPort: number | null;
  startupPhase: StartupPhase;
  lastStartupError: StartupError | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const desktopRoot = resolve(__dirname, '..');
const repoRoot = resolve(desktopRoot, '..', '..');
const apiEntry = join(repoRoot, 'dist', 'server.js');
const apiCwd = repoRoot;
const webCwd = join(repoRoot, 'apps', 'pdf-af-web');
const webEntry = join(webCwd, '.next', 'standalone', 'apps', 'pdf-af-web', 'server.js');
const preloadPath = join(desktopRoot, 'dist', 'preload.js');
const startupTimeoutMs = 60_000;
const pollIntervalMs = 500;
const maxTailLines = 40;

let mainWindow: BrowserWindow | null = null;
let logFilePath = '';
let isQuitting = false;

interface RuntimePaths {
  appDataDir: string;
  dbDir: string;
  dbPath: string;
  filesDir: string;
  logsDir: string;
  logFilePath: string;
  llmDir: string;
  tempDir: string;
}

let runtimePaths: RuntimePaths | null = null;

const runtimeState: RuntimeState = {
  apiChild: null,
  webChild: null,
  apiPort: null,
  webPort: null,
  startupPhase: 'idle',
  lastStartupError: null,
};

function baseChildEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    ELECTRON_RUN_AS_NODE: '1',
  };
}

function resolveRuntimePaths(): RuntimePaths {
  const appDataDir = join(app.getPath('userData'), 'data');
  const dbDir = join(appDataDir, 'db');
  const filesDir = join(appDataDir, 'files');
  const logsDir = join(appDataDir, 'logs');
  const llmDir = join(appDataDir, 'llm');
  const tempDir = join(appDataDir, 'temp');

  return {
    appDataDir,
    dbDir,
    dbPath: join(dbDir, 'pdfaf.db'),
    filesDir,
    logsDir,
    logFilePath: join(logsDir, 'pdfaf-desktop.log'),
    llmDir,
    tempDir,
  };
}

async function ensureRuntimePaths(paths: RuntimePaths): Promise<void> {
  await Promise.all([
    mkdir(paths.appDataDir, { recursive: true }),
    mkdir(paths.dbDir, { recursive: true }),
    mkdir(paths.filesDir, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(paths.llmDir, { recursive: true }),
    mkdir(paths.tempDir, { recursive: true }),
  ]);
}

function desktopChildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  if (!runtimePaths) {
    throw new Error('Runtime paths are not initialized.');
  }

  return baseChildEnv({
    DB_PATH: runtimePaths.dbPath,
    PDF_AF_STORAGE_DIR: runtimePaths.filesDir,
    PDF_AF_STORAGE_POLICY: 'desktop-persistent',
    PDFAF_APP_DATA_DIR: runtimePaths.appDataDir,
    PDFAF_DESKTOP_MODE: '1',
    PDFAF_LLAMA_WORKDIR: runtimePaths.llmDir,
    ...extra,
  });
}

async function writeLog(source: 'api' | 'web' | 'electron', message: string): Promise<void> {
  if (!logFilePath) return;
  const line = `[${new Date().toISOString()}] [${source}] ${message}\n`;
  await appendFile(logFilePath, line, 'utf8');
}

function queueLog(source: 'api' | 'web' | 'electron', message: string): void {
  void writeLog(source, message).catch(() => {
    // Logging should never crash startup.
  });
}

function pushTail(lines: string[], chunk: string): void {
  for (const line of chunk.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lines.push(trimmed);
  }
  if (lines.length > maxTailLines) {
    lines.splice(0, lines.length - maxTailLines);
  }
}

function attachLogging(child: ManagedChild): void {
  child.proc.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      queueLog(child.name, line);
    }
  });

  child.proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    pushTail(child.stderrTail, text);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      queueLog(child.name, line);
    }
  });
}

async function allocatePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a localhost port.')));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) reject(err);
        else resolvePort(port);
      });
    });
  });
}

async function pollUntil(
  fn: () => Promise<boolean>,
  timeoutMs: number,
  onTimeout: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) {
      return;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, pollIntervalMs));
  }
  throw new Error(onTimeout);
}

async function waitForApiReady(port: number): Promise<void> {
  queueLog('electron', `Waiting for API readiness on http://127.0.0.1:${port}/v1/health`);
  await pollUntil(async () => {
    const child = runtimeState.apiChild;
    if (!child) {
      throw new Error('The API process is no longer running.');
    }
    if (child.proc.exitCode !== null) {
      throw new Error(`The API process exited before becoming ready (exit=${child.proc.exitCode}).`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
      if (response.status !== 200 && response.status !== 503) {
        return false;
      }
      await response.json();
      return true;
    } catch {
      return false;
    }
  }, startupTimeoutMs, `Timed out waiting for the API to become ready on port ${port}.`);
}

async function waitForWebReady(port: number): Promise<void> {
  queueLog('electron', `Waiting for web readiness on http://127.0.0.1:${port}/`);
  await pollUntil(async () => {
    const child = runtimeState.webChild;
    if (!child) {
      throw new Error('The web process is no longer running.');
    }
    if (child.proc.exitCode !== null) {
      throw new Error(`The web process exited before becoming ready (exit=${child.proc.exitCode}).`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      return response.status === 200;
    } catch {
      return false;
    }
  }, startupTimeoutMs, `Timed out waiting for the web app to become ready on port ${port}.`);
}

function spawnManagedChild(
  name: 'api' | 'web',
  scriptPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): ManagedChild {
  queueLog('electron', `Spawning ${name}: ${process.execPath} ${scriptPath} (cwd=${cwd})`);
  const proc = spawn(process.execPath, [scriptPath], {
    cwd,
    env,
    stdio: 'pipe',
    windowsHide: true,
  });
  const managed: ManagedChild = {
    name,
    proc,
    stderrTail: [],
  };
  attachLogging(managed);
  proc.on('error', (error) => {
    pushTail(managed.stderrTail, error.message);
    queueLog('electron', `${name} spawn failed: ${error.message}`);
  });
  proc.on('exit', (code, signal) => {
    queueLog('electron', `${name} exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    if (name === 'api') runtimeState.apiChild = null;
    if (name === 'web') runtimeState.webChild = null;
    if (!isQuitting && runtimeState.startupPhase === 'ready') {
      void handleRuntimeFailure(name, managed.stderrTail, `The ${name} process exited unexpectedly.`);
    }
  });
  return managed;
}

async function stopManagedChild(child: ManagedChild | null): Promise<void> {
  if (!child) return;
  if (child.proc.exitCode !== null) return;

  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.proc.exitCode === null) {
        child.proc.kill('SIGKILL');
      }
    }, 5_000);

    child.proc.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });

    child.proc.kill('SIGTERM');
  });
}

async function shutdownChildren(): Promise<void> {
  runtimeState.startupPhase = 'shutting_down';
  const webChild = runtimeState.webChild;
  const apiChild = runtimeState.apiChild;
  runtimeState.webChild = null;
  runtimeState.apiChild = null;

  await stopManagedChild(webChild);
  await stopManagedChild(apiChild);
}

async function showFatalStartupError(error: StartupError): Promise<void> {
  runtimeState.lastStartupError = error;
  runtimeState.startupPhase = 'failed';
  const detail = [
    `Component: ${error.component}`,
    `Message: ${error.message}`,
    '',
    'Last stderr lines:',
    ...(error.stderrTail.length > 0 ? error.stderrTail : ['(no stderr output captured)']),
    '',
    `Log file: ${logFilePath}`,
  ].join('\n');
  await dialog.showMessageBox({
    type: 'error',
    title: 'PDFAF Desktop startup failed',
    message: 'PDFAF Desktop could not start its local services.',
    detail,
  });
}

async function handleRuntimeFailure(
  component: 'api' | 'web',
  stderrTail: string[],
  message: string,
): Promise<void> {
  if (isQuitting) return;
  runtimeState.lastStartupError = { component, message, stderrTail };
  await dialog.showMessageBox({
    type: 'error',
    title: 'PDFAF Desktop service failure',
    message: `The ${component} service exited unexpectedly.`,
    detail: `${message}\n\nLog file: ${logFilePath}`,
  });
  app.quit();
}

async function createMainWindow(url: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
  mainWindow.show();
}

async function initializeRuntime(): Promise<void> {
  if (!existsSync(apiEntry)) {
    throw {
      component: 'api',
      message: `Missing API entrypoint: ${apiEntry}`,
      stderrTail: [],
    } satisfies StartupError;
  }
  if (!existsSync(webEntry)) {
    throw {
      component: 'web',
      message: `Missing web standalone entrypoint: ${webEntry}. Build the web app with standalone output before starting the desktop shell.`,
      stderrTail: [],
    } satisfies StartupError;
  }

  runtimeState.startupPhase = 'allocating_ports';
  runtimeState.apiPort = await allocatePort();
  runtimeState.webPort = await allocatePort();
  queueLog('electron', `Allocated apiPort=${runtimeState.apiPort} webPort=${runtimeState.webPort}`);

  runtimeState.startupPhase = 'starting_api';
  runtimeState.apiChild = spawnManagedChild('api', apiEntry, apiCwd, desktopChildEnv({
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    PORT: String(runtimeState.apiPort),
  }));

  runtimeState.startupPhase = 'waiting_for_api';
  try {
    await waitForApiReady(runtimeState.apiPort);
  } catch (error) {
    throw {
      component: 'api',
      message: error instanceof Error ? error.message : 'Unknown API startup failure.',
      stderrTail: runtimeState.apiChild?.stderrTail ?? [],
    } satisfies StartupError;
  }

  runtimeState.startupPhase = 'starting_web';
  runtimeState.webChild = spawnManagedChild('web', webEntry, webCwd, desktopChildEnv({
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    PDFAF_API_BASE_URL: `http://127.0.0.1:${runtimeState.apiPort}`,
    PORT: String(runtimeState.webPort),
  }));

  runtimeState.startupPhase = 'waiting_for_web';
  try {
    await waitForWebReady(runtimeState.webPort);
  } catch (error) {
    throw {
      component: 'web',
      message: error instanceof Error ? error.message : 'Unknown web startup failure.',
      stderrTail: runtimeState.webChild?.stderrTail ?? [],
    } satisfies StartupError;
  }

  runtimeState.startupPhase = 'ready';
  await createMainWindow(`http://127.0.0.1:${runtimeState.webPort}`);
}

async function bootstrap(): Promise<void> {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  });

  app.on('window-all-closed', () => {
    if (!isQuitting) {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  await app.whenReady();
  runtimePaths = resolveRuntimePaths();
  await ensureRuntimePaths(runtimePaths);
  logFilePath = runtimePaths.logFilePath;
  queueLog('electron', 'Desktop runtime booting');
  queueLog('electron', `Desktop app data dir: ${runtimePaths.appDataDir}`);

  try {
    await initializeRuntime();
  } catch (error) {
    const startupError = (error as StartupError);
    await shutdownChildren();
    await showFatalStartupError(startupError);
    app.quit();
  }
}

void bootstrap().catch(async (error) => {
  await writeLog('electron', `Unhandled desktop bootstrap failure: ${String(error)}`).catch(() => {});
  await dialog.showMessageBox({
    type: 'error',
    title: 'PDFAF Desktop fatal error',
    message: 'PDFAF Desktop could not start.',
    detail: `${String(error)}\n\nLog file: ${logFilePath || '(log unavailable)'}`,
  });
  app.quit();
});

process.on('SIGINT', () => {
  app.quit();
});

process.on('SIGTERM', () => {
  app.quit();
});

app.on('will-quit', (event) => {
  if (runtimeState.startupPhase === 'shutting_down') {
    return;
  }

  event.preventDefault();
  void shutdownChildren().finally(() => {
    app.exit();
  });
});

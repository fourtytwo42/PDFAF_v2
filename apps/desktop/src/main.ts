import { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage, shell } from 'electron';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDesktopBuildMetadata,
  parseDesktopRuntimeManifest,
  resolveDesktopAppPaths,
  resolveDesktopDependencyPaths,
  validateDesktopStartupInputs,
  validatePackagedDependencyPaths,
  type DesktopAppPaths,
  type DesktopBuildMetadataSummary,
  type DesktopDependencyPaths,
  type DesktopRuntimeManifestSummary,
} from './runtime.js';
import { LocalLlmManager, type LocalLlmPublicState } from './localLlm.js';

type StartupPhase =
  | 'idle'
  | 'allocating_ports'
  | 'starting_api'
  | 'waiting_for_api'
  | 'starting_web'
  | 'waiting_for_web'
  | 'ready'
  | 'failed'
  | 'restarting'
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
  tray: Tray | null;
  restartInProgress: boolean;
}

interface RuntimePaths {
  appDataDir: string;
  dbDir: string;
  dbPath: string;
  filesDir: string;
  logsDir: string;
  logFilePath: string;
  llmDir: string;
  supportDir: string;
  tempDir: string;
  stateFilePath: string;
}

interface DesktopState {
  hasSeenTrayHint: boolean;
}

interface DesktopDiagnosticsSummary {
  appVersion: string;
  startupPhase: StartupPhase;
  runtimeMode: 'development' | 'packaged';
  apiPort: number | null;
  webPort: number | null;
  appDataDir: string;
  logsDir: string;
  runtime: {
    nodeBin: string;
    pythonBin: string;
    qpdfBin: string;
    manifest: DesktopRuntimeManifestSummary | null;
    buildMetadata: DesktopBuildMetadataSummary | null;
  };
  localAi: LocalLlmPublicState | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const startupTimeoutMs = 60_000;
const pollIntervalMs = 500;
const maxTailLines = 40;
const defaultDesktopState: DesktopState = { hasSeenTrayHint: false };

let mainWindow: BrowserWindow | null = null;
let logFilePath = '';
let isQuitting = false;
let runtimePaths: RuntimePaths | null = null;
let dependencyPaths: DesktopDependencyPaths | null = null;
let desktopState: DesktopState = { ...defaultDesktopState };
let localLlmManager: LocalLlmManager | null = null;
let runtimeManifestSummary: DesktopRuntimeManifestSummary | null = null;
let buildMetadataSummary: DesktopBuildMetadataSummary | null = null;
let appPaths: DesktopAppPaths | null = null;

const runtimeState: RuntimeState = {
  apiChild: null,
  webChild: null,
  apiPort: null,
  webPort: null,
  startupPhase: 'idle',
  lastStartupError: null,
  tray: null,
  restartInProgress: false,
};

function baseChildEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    ELECTRON_RUN_AS_NODE: '1',
  };
}

function requireAppPaths(): DesktopAppPaths {
  if (!appPaths) {
    throw new Error('Desktop app paths are not initialized.');
  }
  return appPaths;
}

function resolveRuntimePaths(): RuntimePaths {
  const appDataDir = join(app.getPath('userData'), 'data');
  const dbDir = join(appDataDir, 'db');
  const filesDir = join(appDataDir, 'files');
  const logsDir = join(appDataDir, 'logs');
  const llmDir = join(appDataDir, 'llm');
  const supportDir = join(appDataDir, 'support');
  const tempDir = join(appDataDir, 'temp');

  return {
    appDataDir,
    dbDir,
    dbPath: join(dbDir, 'pdfaf.db'),
    filesDir,
    logsDir,
    logFilePath: join(logsDir, 'pdfaf-desktop.log'),
    llmDir,
    supportDir,
    tempDir,
    stateFilePath: join(appDataDir, 'desktop-state.json'),
  };
}

async function ensureRuntimePaths(paths: RuntimePaths): Promise<void> {
  await Promise.all([
    mkdir(paths.appDataDir, { recursive: true }),
    mkdir(paths.dbDir, { recursive: true }),
    mkdir(paths.filesDir, { recursive: true }),
    mkdir(paths.logsDir, { recursive: true }),
    mkdir(paths.llmDir, { recursive: true }),
    mkdir(paths.supportDir, { recursive: true }),
    mkdir(paths.tempDir, { recursive: true }),
  ]);
}

async function validateWritableRuntimePaths(paths: RuntimePaths): Promise<void> {
  const probePath = join(paths.tempDir, 'desktop-write-test.tmp');
  await writeFile(probePath, 'ok', 'utf8');
  await rm(probePath, { force: true });
}

async function loadDesktopState(): Promise<void> {
  if (!runtimePaths) return;
  try {
    const raw = await readFile(runtimePaths.stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DesktopState>;
    desktopState = {
      hasSeenTrayHint: parsed.hasSeenTrayHint === true,
    };
  } catch {
    desktopState = { ...defaultDesktopState };
  }
}

async function loadRuntimeManifestSummary(): Promise<DesktopRuntimeManifestSummary | null> {
  if (!dependencyPaths?.runtimeManifestPath || !existsSync(dependencyPaths.runtimeManifestPath)) {
    return null;
  }

  try {
    return parseDesktopRuntimeManifest(await readFile(dependencyPaths.runtimeManifestPath, 'utf8'));
  } catch {
    return null;
  }
}

async function loadBuildMetadataSummary(): Promise<DesktopBuildMetadataSummary | null> {
  if (!dependencyPaths?.buildMetadataPath || !existsSync(dependencyPaths.buildMetadataPath)) {
    return null;
  }

  try {
    return parseDesktopBuildMetadata(await readFile(dependencyPaths.buildMetadataPath, 'utf8'));
  } catch {
    return null;
  }
}

async function saveDesktopState(): Promise<void> {
  if (!runtimePaths) return;
  await writeFile(runtimePaths.stateFilePath, JSON.stringify(desktopState, null, 2), 'utf8');
}

function desktopChildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  if (!runtimePaths) {
    throw new Error('Runtime paths are not initialized.');
  }
  if (!dependencyPaths) {
    throw new Error('Dependency paths are not initialized.');
  }

  return baseChildEnv({
    DB_PATH: runtimePaths.dbPath,
    PDF_AF_STORAGE_DIR: runtimePaths.filesDir,
    PDF_AF_STORAGE_POLICY: 'desktop-persistent',
    PDFAF_APP_DATA_DIR: runtimePaths.appDataDir,
    PDFAF_DESKTOP_MODE: '1',
    PDFAF_LLAMA_WORKDIR: runtimePaths.llmDir,
    PDFAF_NODE_BIN: dependencyPaths.nodeBin,
    PDFAF_PYTHON_BIN: dependencyPaths.pythonBin,
    ...(dependencyPaths.apiRuntimeRoot
      ? { PDFAF_PYTHON_SCRIPT: join(dependencyPaths.apiRuntimeRoot, 'python', 'pdf_analysis_helper.py') }
      : {}),
    PDFAF_QPDF_BIN: dependencyPaths.qpdfBin,
    ...(dependencyPaths.webRuntimeNodeModulesPath
      ? { NODE_PATH: dependencyPaths.webRuntimeNodeModulesPath }
      : {}),
    PDFAF_LOCAL_LLM_INSTALLED: localLlmManager?.isInstalled() ? '1' : '0',
    PDFAF_LOCAL_LLM_ENABLED: localLlmManager?.getState().enabled ? '1' : '0',
    PDFAF_LOCAL_LLM_ACTIVE_MODE: localLlmManager?.getState().enabled && localLlmManager?.isInstalled() ? 'local' : 'none',
    ...(localLlmManager?.getApiEnv() ?? {}),
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
  nodeBin: string,
  scriptPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): ManagedChild {
  queueLog('electron', `Spawning ${name}: ${nodeBin} ${scriptPath} (cwd=${cwd})`);
  const proc = spawn(nodeBin, [scriptPath], {
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
    if (!isQuitting && !runtimeState.restartInProgress && runtimeState.startupPhase === 'ready') {
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

async function validateInstalledDesktopRuntime(): Promise<void> {
  if (!dependencyPaths) {
    throw new Error('Desktop dependency paths are not initialized.');
  }
  if (!runtimePaths) {
    throw new Error('Desktop runtime paths are not initialized.');
  }
  if (!appPaths) {
    throw new Error('Desktop app paths are not initialized.');
  }

  const issues = validateDesktopStartupInputs({
    dependencyPaths,
    appPaths,
  });
  if (issues.length > 0) {
    throw new Error(issues.join('\n'));
  }

  await validateWritableRuntimePaths(runtimePaths);
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
    detail: [
      message,
      '',
      'Next steps:',
      '1. Open the logs folder and review the latest desktop log.',
      '2. Try Restart App Services from the tray or diagnostics panel.',
      '3. Export a support bundle if the problem persists.',
      '',
      `Logs: ${runtimePaths?.logsDir ?? '(unavailable)'}`,
      `Data: ${runtimePaths?.appDataDir ?? '(unavailable)'}`,
      `Log file: ${logFilePath}`,
    ].join('\n'),
  });
  app.quit();
}

function getDesktopDiagnostics(): DesktopDiagnosticsSummary {
  if (!runtimePaths || !dependencyPaths) {
    throw new Error('Desktop runtime is not initialized.');
  }

  return {
    appVersion: app.getVersion(),
    startupPhase: runtimeState.startupPhase,
    runtimeMode: dependencyPaths.mode,
    apiPort: runtimeState.apiPort,
    webPort: runtimeState.webPort,
    appDataDir: runtimePaths.appDataDir,
    logsDir: runtimePaths.logsDir,
    runtime: {
      nodeBin: dependencyPaths.nodeBin,
      pythonBin: dependencyPaths.pythonBin,
      qpdfBin: dependencyPaths.qpdfBin,
      manifest: runtimeManifestSummary,
      buildMetadata: buildMetadataSummary,
    },
    localAi: localLlmManager?.getState() ?? null,
  };
}

async function openFolder(path: string): Promise<string> {
  const error = await shell.openPath(path);
  if (error) {
    throw new Error(error);
  }
  return path;
}

async function compressArchive(sourceDir: string, zipPath: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      'powershell',
      [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        `Compress-Archive -LiteralPath '${sourceDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`Compress-Archive exited with code ${code ?? 'null'}`));
    });
  });
}

async function captureHealthSnapshot(): Promise<unknown> {
  if (!runtimeState.apiPort) return null;

  try {
    const response = await fetch(`http://127.0.0.1:${runtimeState.apiPort}/v1/health`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return { status: 'unavailable', httpStatus: response.status };
    }
    return await response.json();
  } catch (error) {
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function exportSupportBundle(): Promise<string> {
  if (!runtimePaths) {
    throw new Error('Desktop runtime is not initialized.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bundleDir = join(runtimePaths.supportDir, `bundle-${timestamp}`);
  const zipPath = join(runtimePaths.supportDir, `pdfaf-support-${timestamp}.zip`);
  await rm(bundleDir, { recursive: true, force: true });
  await rm(zipPath, { force: true }).catch(() => {});
  await mkdir(bundleDir, { recursive: true });

  const copyIfExists = async (sourcePath: string | null, targetName: string): Promise<void> => {
    if (!sourcePath || !existsSync(sourcePath)) return;
    await copyFile(sourcePath, join(bundleDir, targetName));
  };

  await Promise.all([
    copyIfExists(logFilePath || null, 'pdfaf-desktop.log'),
    copyIfExists(runtimePaths.stateFilePath, 'desktop-state.json'),
    copyIfExists(join(runtimePaths.llmDir, 'state.json'), 'local-llm-state.json'),
    copyIfExists(dependencyPaths?.runtimeManifestPath ?? null, 'runtime-manifest.json'),
    copyIfExists(dependencyPaths?.buildMetadataPath ?? null, 'build-metadata.json'),
  ]);

  await writeFile(
    join(bundleDir, 'diagnostics.json'),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        diagnostics: getDesktopDiagnostics(),
        health: await captureHealthSnapshot(),
      },
      null,
      2,
    ),
    'utf8',
  );

  await compressArchive(bundleDir, zipPath);
  await rm(bundleDir, { recursive: true, force: true });
  queueLog('electron', `Support bundle exported: ${zipPath}`);
  return zipPath;
}

function broadcastLocalLlmState(state: LocalLlmPublicState): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pdfaf:local-llm:changed', state);
  const serializedState = JSON.stringify(state).replace(/</g, '\\u003c');
  void mainWindow.webContents
    .executeJavaScript(
      `window.__pdfafLocalAiState__ = ${serializedState}; window.dispatchEvent(new CustomEvent('pdfaf:local-ai-state', { detail: window.__pdfafLocalAiState__ }));`,
      true,
    )
    .catch(() => {
      // The page may not be ready yet; a later broadcast will refresh the state.
    });
}

function registerLocalLlmIpc(): void {
  ipcMain.handle('pdfaf:local-llm:get-state', async () => localLlmManager?.getState() ?? null);
  ipcMain.handle('pdfaf:local-llm:cancel', async () => localLlmManager?.cancelInstall() ?? null);
  ipcMain.handle('pdfaf:local-llm:install', async () => {
    if (!localLlmManager) {
      throw new Error('Local AI manager is not initialized.');
    }
    const state = await localLlmManager.install();
    await restartServices();
    return state;
  });
  ipcMain.handle('pdfaf:local-llm:remove', async () => {
    if (!localLlmManager) {
      throw new Error('Local AI manager is not initialized.');
    }
    const state = await localLlmManager.remove();
    await restartServices();
    return state;
  });
  ipcMain.handle('pdfaf:local-llm:set-enabled', async (_event, enabled: boolean) => {
    if (!localLlmManager) {
      throw new Error('Local AI manager is not initialized.');
    }
    const state = await localLlmManager.setEnabled(enabled);
    await restartServices();
    return state;
  });
  ipcMain.handle('pdfaf:desktop:get-diagnostics', async () => getDesktopDiagnostics());
  ipcMain.handle('pdfaf:desktop:open-data-folder', async () => {
    if (!runtimePaths) {
      throw new Error('Desktop runtime is not initialized.');
    }
    return await openFolder(runtimePaths.appDataDir);
  });
  ipcMain.handle('pdfaf:desktop:open-logs-folder', async () => {
    if (!runtimePaths) {
      throw new Error('Desktop runtime is not initialized.');
    }
    return await openFolder(runtimePaths.logsDir);
  });
  ipcMain.handle('pdfaf:desktop:export-support-bundle', async () => await exportSupportBundle());
  ipcMain.handle('pdfaf:desktop:restart-services', async () => {
    await restartServices();
    return getDesktopDiagnostics();
  });
  ipcMain.handle('pdfaf:desktop:reset-local-ai', async () => {
    if (!localLlmManager) {
      throw new Error('Local AI manager is not initialized.');
    }
    await localLlmManager.remove();
    await restartServices();
    return getDesktopDiagnostics();
  });
}

function getCurrentWebUrl(): string {
  if (!runtimeState.webPort) {
    throw new Error('The web port is not initialized.');
  }
  return `http://127.0.0.1:${runtimeState.webPort}`;
}

async function showMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: requireAppPaths().preloadPath,
    },
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
    void showTrayHintIfNeeded();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(getCurrentWebUrl());
  if (localLlmManager) {
    broadcastLocalLlmState(localLlmManager.getState());
  }
  mainWindow.show();
  mainWindow.focus();
}

async function createMainWindow(url: string): Promise<void> {
  runtimeState.webPort = Number(new URL(url).port);
  await showMainWindow();
}

async function startServices(): Promise<void> {
  const resolvedAppPaths = requireAppPaths();
  if (!dependencyPaths) {
    throw {
      component: 'desktop',
      message: 'Desktop dependency paths were not initialized.',
      stderrTail: [],
    } satisfies StartupError;
  }
  if (!existsSync(resolvedAppPaths.apiEntry)) {
    throw {
      component: 'api',
      message: `Missing API entrypoint: ${resolvedAppPaths.apiEntry}`,
      stderrTail: [],
    } satisfies StartupError;
  }
  if (!existsSync(resolvedAppPaths.webEntry)) {
    throw {
      component: 'web',
      message: `Missing web standalone entrypoint: ${resolvedAppPaths.webEntry}. Build the web app with standalone output before starting the desktop shell.`,
      stderrTail: [],
    } satisfies StartupError;
  }

  runtimeState.startupPhase = 'allocating_ports';
  runtimeState.apiPort = await allocatePort();
  runtimeState.webPort = await allocatePort();
  queueLog('electron', `Allocated apiPort=${runtimeState.apiPort} webPort=${runtimeState.webPort}`);

  runtimeState.startupPhase = 'starting_api';
  runtimeState.apiChild = spawnManagedChild(
    'api',
    dependencyPaths.nodeBin,
    resolvedAppPaths.apiEntry,
    resolvedAppPaths.apiCwd,
    desktopChildEnv({
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      PORT: String(runtimeState.apiPort),
    }),
  );

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
  runtimeState.webChild = spawnManagedChild(
    'web',
    dependencyPaths.nodeBin,
    resolvedAppPaths.webEntry,
    resolvedAppPaths.webCwd,
    desktopChildEnv({
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      PDFAF_API_BASE_URL: `http://127.0.0.1:${runtimeState.apiPort}`,
      PORT: String(runtimeState.webPort),
    }),
  );

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
}

async function restartServices(): Promise<void> {
  if (runtimeState.restartInProgress) return;

  runtimeState.restartInProgress = true;
  runtimeState.startupPhase = 'restarting';
  queueLog('electron', 'Restarting managed services');
  let restartSucceeded = false;

  try {
    await shutdownChildren();
    await startServices();

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(getCurrentWebUrl());
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
    restartSucceeded = true;
  } catch (error) {
    const startupError = error as StartupError;
    runtimeState.lastStartupError = startupError;
    await dialog.showMessageBox({
      type: 'error',
      title: 'PDFAF Desktop service restart failed',
      message: `PDFAF Desktop could not restart its ${startupError.component} service.`,
      detail: [
        startupError.message,
        '',
        'Last stderr lines:',
        ...(startupError.stderrTail.length > 0 ? startupError.stderrTail : ['(no stderr output captured)']),
        '',
        `Log file: ${logFilePath}`,
      ].join('\n'),
    });
  } finally {
    runtimeState.restartInProgress = false;
    if (!restartSucceeded) {
      runtimeState.startupPhase = runtimeState.apiChild || runtimeState.webChild ? 'failed' : 'idle';
    }
  }
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Open App',
      click: () => {
        void showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Restart Services',
      click: () => {
        void restartServices();
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        void exitApplication();
      },
    },
  ]);
}

function createTrayIcon(): void {
  if (runtimeState.tray) return;
  const resolvedAppPaths = requireAppPaths();

  const trayImage = existsSync(resolvedAppPaths.trayIconPath)
    ? nativeImage.createFromPath(resolvedAppPaths.trayIconPath)
    : nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAx0lEQVR4AY2RsQ3CQBBFnxMHEMABnMAJnMAGnMAJnMABHMAJxwSJP0l2ghJp2SZv7r2dnXve6+5ShlDNQkS9RrkmaRjA2ckb2z9CbYuK7VUyWWtaFgjA5a6W3V6sbjMqYNri7JjBdP4zCZh98oOw3XK7oUNwnR5jh1OrCiAtDfJxQgWVa5iTZ8u4K4DkWt9Nso1gpGnoR0AV4yStM8+gPe8IIwRgz5rEhP1MO9mNfVGLyH8s12Mg3ylGjM2D0T4drm2oAQ0s69c4+jQ5s5rY8Y7A7q8f7l0x1F5gQhSt6XJgAAAABJRU5ErkJggg==',
      );
  runtimeState.tray = new Tray(trayImage);
  runtimeState.tray.setToolTip('PDFAF');
  runtimeState.tray.setContextMenu(buildTrayMenu());
  runtimeState.tray.on('double-click', () => {
    void showMainWindow();
  });
}

function destroyTray(): void {
  runtimeState.tray?.destroy();
  runtimeState.tray = null;
}

async function showTrayHintIfNeeded(): Promise<void> {
  if (desktopState.hasSeenTrayHint) return;

  desktopState.hasSeenTrayHint = true;
  await saveDesktopState();
  await dialog.showMessageBox({
    type: 'info',
    title: 'PDFAF is still running',
    message: 'PDFAF moved to the notification area.',
    detail: 'Double-click the tray icon to reopen the app. Use the tray menu when you want to exit.',
  });
}

async function exitApplication(): Promise<void> {
  if (isQuitting) return;
  isQuitting = true;
  destroyTray();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  app.quit();
}

async function initializeRuntime(): Promise<void> {
  await startServices();
  await createMainWindow(getCurrentWebUrl());
}

async function bootstrap(): Promise<void> {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    void showMainWindow();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  await app.whenReady();
  appPaths = resolveDesktopAppPaths({
    desktopDistDir: __dirname,
    processResourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  });
  dependencyPaths = resolveDesktopDependencyPaths({
    desktopDistDir: __dirname,
    isPackaged: app.isPackaged,
    processResourcesPath: process.resourcesPath,
  });
  runtimePaths = resolveRuntimePaths();
  await ensureRuntimePaths(runtimePaths);
  logFilePath = runtimePaths.logFilePath;
  try {
    await validateInstalledDesktopRuntime();
  } catch (error) {
    await showFatalStartupError({
      component: 'desktop',
      message:
        error instanceof Error
          ? `The installed PDFAF package is incomplete, corrupted, or cannot write to its app-data directory.\n${error.message}`
          : 'The installed PDFAF package failed validation.',
      stderrTail: [],
    });
    app.quit();
    return;
  }
  await loadDesktopState();
  localLlmManager = new LocalLlmManager({
    llmRootDir: runtimePaths.llmDir,
    onStateChange: (state) => {
      queueLog(
        'electron',
        `Local AI state changed: status=${state.status} enabled=${state.enabled} available=${state.available}`,
      );
      broadcastLocalLlmState(state);
    },
    log: (message) => queueLog('electron', message),
  });
  await localLlmManager.initialize();
  runtimeManifestSummary = await loadRuntimeManifestSummary();
  buildMetadataSummary = await loadBuildMetadataSummary();
  registerLocalLlmIpc();
  queueLog('electron', 'Desktop runtime booting');
  queueLog('electron', `Desktop app version: ${app.getVersion()}`);
  queueLog('electron', `Desktop build flavor: ${app.isPackaged ? 'nsis' : 'development'}`);
  queueLog('electron', `Desktop app data dir: ${runtimePaths.appDataDir}`);
  queueLog('electron', `Desktop runtime mode: ${dependencyPaths.mode}`);
  queueLog('electron', `Resolved node bin: ${dependencyPaths.nodeBin}`);
  queueLog('electron', `Resolved python bin: ${dependencyPaths.pythonBin}`);
  queueLog('electron', `Resolved qpdf bin: ${dependencyPaths.qpdfBin}`);
  if (runtimeManifestSummary) {
    queueLog(
      'electron',
      `Runtime manifest: generatedAt=${runtimeManifestSummary.generatedAt} platform=${runtimeManifestSummary.platform} node=${runtimeManifestSummary.nodeVersion ?? 'unknown'} python=${runtimeManifestSummary.pythonVersion ?? 'unknown'} qpdf=${runtimeManifestSummary.qpdfVersion ?? 'unknown'}`,
    );
  }
  if (buildMetadataSummary) {
    queueLog(
      'electron',
      `Build metadata: version=${buildMetadataSummary.appVersion} commit=${buildMetadataSummary.gitCommit ?? 'unknown'} builtAt=${buildMetadataSummary.buildTimestamp} signingConfigured=${buildMetadataSummary.signingConfigured}`,
    );
  }
  if (localLlmManager) {
    const localLlmState = localLlmManager.getState();
    queueLog(
      'electron',
      `Local AI startup state: status=${localLlmState.status} enabled=${localLlmState.enabled} available=${localLlmState.available}`,
    );
  }
  const packagedDependencyErrors = validatePackagedDependencyPaths(dependencyPaths);
  if (packagedDependencyErrors.length > 0) {
    await showFatalStartupError({
      component: 'desktop',
      message: packagedDependencyErrors.join('\n'),
      stderrTail: [],
    });
    app.quit();
    return;
  }
  createTrayIcon();
  if (localLlmManager) {
    localLlmManager.ensureInstalledInBackground(async () => {
      queueLog('electron', 'Local AI finished installing in background; restarting services.');
      if (runtimeState.startupPhase === 'ready') {
        await restartServices();
      }
    });
  }

  try {
    await initializeRuntime();
  } catch (error) {
    const startupError = error as StartupError;
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
  void exitApplication();
});

process.on('SIGTERM', () => {
  void exitApplication();
});

app.on('will-quit', (event) => {
  if (runtimeState.startupPhase === 'shutting_down') {
    return;
  }

  event.preventDefault();
  destroyTray();
  void shutdownChildren().finally(() => {
    app.exit();
  });
});

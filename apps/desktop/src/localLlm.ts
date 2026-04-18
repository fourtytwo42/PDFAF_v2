import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  localLlmArtifactManifest,
  type LocalLlmArtifactManifestEntry,
} from './localLlmManifest.js';

export type LocalLlmInstallStatus =
  | 'not_installed'
  | 'downloading'
  | 'installed'
  | 'failed'
  | 'removing';

export interface LocalLlmPaths {
  rootDir: string;
  binDir: string;
  modelsDir: string;
  downloadsDir: string;
  stateFilePath: string;
  serverBinPath: string;
  ggufPath: string;
  mmprojPath: string;
}

export interface LocalLlmState {
  status: LocalLlmInstallStatus;
  enabled: boolean;
  artifactVersion: {
    llamaCppRelease: string;
    hfRepo: string;
    gguf: string;
    mmproj: string;
  };
  lastError: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  lastValidatedAt: string | null;
}

export interface LocalLlmPublicState extends LocalLlmState {
  available: boolean;
  paths: {
    serverBin: string;
    gguf: string;
    mmproj: string;
  };
}

interface LocalLlmArtifact {
  kind: 'zip' | 'file';
  url: string;
  destinationPath: string;
  manifest: LocalLlmArtifactManifestEntry;
}

interface LocalLlmManagerOptions {
  llmRootDir: string;
  onStateChange: (state: LocalLlmPublicState) => void;
  log: (message: string) => void;
}

const DEFAULT_HF_REPO = localLlmArtifactManifest.hfRepo;
const DEFAULT_GGUF_FILE = localLlmArtifactManifest.artifacts.gguf.filename;
const DEFAULT_MMPROJ_FILE = localLlmArtifactManifest.artifacts.mmproj.filename;

const defaultState: LocalLlmState = {
  status: 'not_installed',
  enabled: false,
  artifactVersion: {
    llamaCppRelease: localLlmArtifactManifest.artifacts.llamaServer.version,
    hfRepo: DEFAULT_HF_REPO,
    gguf: DEFAULT_GGUF_FILE,
    mmproj: DEFAULT_MMPROJ_FILE,
  },
  lastError: null,
  downloadedBytes: 0,
  totalBytes: null,
  lastValidatedAt: null,
};

export function resolveLocalLlmPaths(llmRootDir: string): LocalLlmPaths {
  return {
    rootDir: llmRootDir,
    binDir: join(llmRootDir, 'bin'),
    modelsDir: join(llmRootDir, 'models'),
    downloadsDir: join(llmRootDir, 'downloads'),
    stateFilePath: join(llmRootDir, 'state.json'),
    serverBinPath: join(llmRootDir, 'bin', 'llama-server.exe'),
    ggufPath: join(llmRootDir, 'models', DEFAULT_GGUF_FILE),
    mmprojPath: join(llmRootDir, 'models', DEFAULT_MMPROJ_FILE),
  };
}

async function ensureLocalLlmPaths(paths: LocalLlmPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.rootDir, { recursive: true }),
    mkdir(paths.binDir, { recursive: true }),
    mkdir(paths.modelsDir, { recursive: true }),
    mkdir(paths.downloadsDir, { recursive: true }),
  ]);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(path: string): Promise<string> {
  const buffer = await readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}

async function findFileRecursively(rootDir: string, filename: string): Promise<string | null> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = join(rootDir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
      return candidate;
    }
    if (entry.isDirectory()) {
      const nested = await findFileRecursively(candidate, filename);
      if (nested) return nested;
    }
  }
  return null;
}

function runPowerShell(command: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'powershell',
      ['-NoLogo', '-NoProfile', '-Command', command],
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
      reject(new Error(`PowerShell exited with code ${code ?? 'null'}`));
    });
  });
}

async function extractZip(zipPath: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await runPowerShell(
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
  );
}

async function validateServerBinary(serverBinPath: string): Promise<boolean> {
  if (!existsSync(serverBinPath)) return false;

  return await new Promise<boolean>((resolvePromise) => {
    const child = spawn(serverBinPath, ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => resolvePromise(false));
    child.on('exit', (code) => resolvePromise(code === 0));
  });
}

export class LocalLlmManager {
  readonly paths: LocalLlmPaths;
  #state: LocalLlmState = { ...defaultState };
  #onStateChange: (state: LocalLlmPublicState) => void;
  #log: (message: string) => void;
  #installAbortController: AbortController | null = null;

  constructor(options: LocalLlmManagerOptions) {
    this.paths = resolveLocalLlmPaths(options.llmRootDir);
    this.#onStateChange = options.onStateChange;
    this.#log = options.log;
  }

  async initialize(): Promise<void> {
    await ensureLocalLlmPaths(this.paths);
    this.#state = await this.#loadState();
    if (!(await this.validateInstalled())) {
      this.#state = {
        ...this.#state,
        status: this.#state.lastError ? 'failed' : 'not_installed',
        enabled: false,
        lastValidatedAt: null,
      };
      await this.#saveState();
    }
    this.#emit();
  }

  getState(): LocalLlmPublicState {
    return {
      ...this.#state,
      available: this.#state.enabled && this.isInstalled(),
      paths: {
        serverBin: this.paths.serverBinPath,
        gguf: this.paths.ggufPath,
        mmproj: this.paths.mmprojPath,
      },
    };
  }

  getApiEnv(): Record<string, string> {
    if (!this.#state.enabled || !this.isInstalled()) {
      return {};
    }

    return {
      PDFAF_RUN_LOCAL_LLM: '1',
      LLAMA_SERVER_BIN: this.paths.serverBinPath,
      PDFAF_LLAMA_WORKDIR: this.paths.rootDir,
      GEMMA4_GGUF_FILE: this.paths.ggufPath,
      GEMMA4_MMPROJ_FILE: this.paths.mmprojPath,
      PDFAF_LOCAL_LLM_INSTALLED: '1',
      PDFAF_LOCAL_LLM_ENABLED: '1',
      PDFAF_LOCAL_LLM_ACTIVE_MODE: 'local',
    };
  }

  isInstalled(): boolean {
    return this.#state.status === 'installed';
  }

  async install(): Promise<LocalLlmPublicState> {
    if (this.#state.status === 'downloading') {
      return this.getState();
    }

    await ensureLocalLlmPaths(this.paths);
    this.#installAbortController = new AbortController();
    const signal = this.#installAbortController.signal;

    this.#state = {
      ...this.#state,
      status: 'downloading',
      lastError: null,
      downloadedBytes: 0,
      totalBytes: null,
    };
    await this.#saveState();
    this.#emit();
    this.#log(`local-llm install started: ${DEFAULT_HF_REPO}`);

    try {
      const artifacts: LocalLlmArtifact[] = [
        {
          kind: 'zip',
          url: localLlmArtifactManifest.artifacts.llamaServer.url,
          destinationPath: join(this.paths.downloadsDir, localLlmArtifactManifest.artifacts.llamaServer.filename),
          manifest: localLlmArtifactManifest.artifacts.llamaServer,
        },
        {
          kind: 'file',
          url: localLlmArtifactManifest.artifacts.gguf.url,
          destinationPath: this.paths.ggufPath,
          manifest: localLlmArtifactManifest.artifacts.gguf,
        },
        {
          kind: 'file',
          url: localLlmArtifactManifest.artifacts.mmproj.url,
          destinationPath: this.paths.mmprojPath,
          manifest: localLlmArtifactManifest.artifacts.mmproj,
        },
      ];

      for (const artifact of artifacts) {
        await this.#downloadArtifact(artifact, signal);
        if (artifact.kind === 'zip') {
          await this.#installLlamaZip(artifact.destinationPath);
        }
      }

      const valid = await this.validateInstalled();
      if (!valid) {
        throw new Error('Downloaded local AI artifacts failed validation.');
      }

      this.#state = {
        ...this.#state,
        status: 'installed',
        enabled: true,
        lastError: null,
        downloadedBytes: 0,
        totalBytes: null,
        lastValidatedAt: new Date().toISOString(),
      };
      await this.#saveState();
      this.#emit();
      this.#log('local-llm install finished successfully');
      return this.getState();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown local AI install failure.';
      if (signal.aborted) {
        this.#log('local-llm install canceled');
        this.#state = {
          ...this.#state,
          status: 'not_installed',
          enabled: false,
          lastError: null,
          downloadedBytes: 0,
          totalBytes: null,
        };
      } else {
        this.#log(`local-llm install failed: ${message}`);
        this.#state = {
          ...this.#state,
          status: 'failed',
          enabled: false,
          lastError: message,
          downloadedBytes: 0,
          totalBytes: null,
        };
      }
      await this.#saveState();
      this.#emit();
      throw error;
    } finally {
      this.#installAbortController = null;
    }
  }

  cancelInstall(): LocalLlmPublicState {
    this.#installAbortController?.abort();
    return this.getState();
  }

  async remove(): Promise<LocalLlmPublicState> {
    if (this.#state.status === 'removing') {
      return this.getState();
    }

    this.cancelInstall();
    this.#state = {
      ...this.#state,
      status: 'removing',
      enabled: false,
      lastError: null,
      downloadedBytes: 0,
      totalBytes: null,
    };
    await this.#saveState();
    this.#emit();
    this.#log('local-llm remove started');

    await Promise.all([
      rm(this.paths.binDir, { recursive: true, force: true }),
      rm(this.paths.modelsDir, { recursive: true, force: true }),
      rm(this.paths.downloadsDir, { recursive: true, force: true }),
    ]);
    await ensureLocalLlmPaths(this.paths);

    this.#state = {
      ...defaultState,
      status: 'not_installed',
      enabled: false,
      artifactVersion: { ...defaultState.artifactVersion },
    };
    await this.#saveState();
    this.#emit();
    this.#log('local-llm remove finished');
    return this.getState();
  }

  async setEnabled(enabled: boolean): Promise<LocalLlmPublicState> {
    const installed = await this.validateInstalled();
    this.#state = {
      ...this.#state,
      enabled: enabled && installed,
      lastError: enabled && !installed ? 'Local AI runtime is not installed.' : this.#state.lastError,
    };
    await this.#saveState();
    this.#emit();
    this.#log(`local-llm enabled set to ${this.#state.enabled}`);
    return this.getState();
  }

  async validateInstalled(): Promise<boolean> {
    const [serverOk, ggufOk, mmprojOk] = await Promise.all([
      validateServerBinary(this.paths.serverBinPath),
      fileExists(this.paths.ggufPath),
      fileExists(this.paths.mmprojPath),
    ]);
    return serverOk && ggufOk && mmprojOk;
  }

  async #loadState(): Promise<LocalLlmState> {
    try {
      const raw = await readFile(this.paths.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LocalLlmState>;
      return {
        ...defaultState,
        ...parsed,
        artifactVersion: {
          ...defaultState.artifactVersion,
          ...(parsed.artifactVersion ?? {}),
        },
      };
    } catch {
      return { ...defaultState };
    }
  }

  async #saveState(): Promise<void> {
    await writeFile(this.paths.stateFilePath, JSON.stringify(this.#state, null, 2), 'utf8');
  }

  #emit(): void {
    this.#onStateChange(this.getState());
  }

  async #downloadArtifact(artifact: LocalLlmArtifact, signal: AbortSignal): Promise<void> {
    const temporaryPath = join(this.paths.downloadsDir, `${randomUUID()}.partial`);
    const response = await fetch(artifact.url, {
      signal,
      headers: artifact.url.includes('huggingface.co')
        ? { 'User-Agent': 'PDFAF-Desktop/1.0' }
        : undefined,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download local AI artifact: HTTP ${response.status} for ${artifact.url}`);
    }

    const totalBytes = artifact.manifest.size;
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    await mkdir(dirname(temporaryPath), { recursive: true });
    const stream = createWriteStream(temporaryPath);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        downloadedBytes += value.byteLength;
        if (!stream.write(Buffer.from(value))) {
          await new Promise<void>((resolvePromise) => stream.once('drain', resolvePromise));
        }
        this.#state = {
          ...this.#state,
          downloadedBytes,
          totalBytes,
        };
        this.#emit();
      }
    } finally {
      await new Promise<void>((resolvePromise, reject) => {
        stream.end((error: Error | null | undefined) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise();
        });
      });
    }

    const downloadedStat = await stat(temporaryPath);
    if (downloadedStat.size !== totalBytes) {
      await unlink(temporaryPath).catch(() => {});
      throw new Error(`Downloaded artifact size mismatch for ${artifact.destinationPath}.`);
    }

    const sha256 = await sha256File(temporaryPath);
    if (sha256 !== artifact.manifest.sha256) {
      await unlink(temporaryPath).catch(() => {});
      throw new Error(
        `Downloaded artifact checksum mismatch for ${artifact.manifest.filename}. Expected ${artifact.manifest.sha256}, got ${sha256}.`,
      );
    }

    await mkdir(dirname(artifact.destinationPath), { recursive: true });
    await rm(artifact.destinationPath, { force: true }).catch(() => {});
    await rename(temporaryPath, artifact.destinationPath);
    this.#log(`local-llm artifact verified: ${artifact.manifest.id}@${artifact.manifest.version}`);
  }

  async #installLlamaZip(zipPath: string): Promise<void> {
    const extractDir = join(this.paths.downloadsDir, `llama-extract-${randomUUID()}`);
    await extractZip(zipPath, extractDir);
    const serverExe = await findFileRecursively(extractDir, 'llama-server.exe');
    if (!serverExe) {
      throw new Error('The downloaded llama.cpp archive did not contain llama-server.exe.');
    }
    const serverDir = dirname(serverExe);
    await rm(this.paths.binDir, { recursive: true, force: true });
    await mkdir(this.paths.binDir, { recursive: true });
    const serverEntries = await readdir(serverDir, { withFileTypes: true });
    for (const entry of serverEntries) {
      await cp(join(serverDir, entry.name), join(this.paths.binDir, entry.name), {
        recursive: true,
        force: true,
      });
    }
    await rm(extractDir, { recursive: true, force: true });
  }
}

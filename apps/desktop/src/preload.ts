import { contextBridge, ipcRenderer } from 'electron';

type LocalLlmInstallStatus =
  | 'not_installed'
  | 'downloading'
  | 'installed'
  | 'failed'
  | 'removing';

type LocalLlmInstallStep =
  | 'idle'
  | 'downloading_runtime'
  | 'downloading_model'
  | 'waiting_for_retry'
  | 'verifying'
  | 'finalizing'
  | 'removing';

interface LocalLlmPublicState {
  status: LocalLlmInstallStatus;
  currentStep: LocalLlmInstallStep;
  currentArtifact: string | null;
  enabled: boolean;
  available: boolean;
  lastError: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  lastValidatedAt: string | null;
  artifactVersion: {
    llamaCppRelease: string;
    hfRepo: string;
    gguf: string;
    mmproj: string;
  };
  paths: {
    serverBin: string;
    gguf: string;
    mmproj: string;
  };
}

interface DesktopDiagnosticsSummary {
  appVersion: string;
  startupPhase: string;
  runtimeMode: 'development' | 'packaged';
  apiPort: number | null;
  webPort: number | null;
  appDataDir: string;
  logsDir: string;
  runtime: {
    nodeBin: string;
    pythonBin: string;
    qpdfBin: string;
    manifest: {
      generatedAt: string;
      platform: string;
      nodeVersion: string | null;
      pythonVersion: string | null;
      qpdfVersion: string | null;
    } | null;
    buildMetadata: {
      appVersion: string;
      gitCommit: string | null;
      buildTimestamp: string;
      signingConfigured: boolean;
    } | null;
  };
  localAi: LocalLlmPublicState | null;
}

const channels = {
  getState: 'pdfaf:local-llm:get-state',
  install: 'pdfaf:local-llm:install',
  cancel: 'pdfaf:local-llm:cancel',
  remove: 'pdfaf:local-llm:remove',
  setEnabled: 'pdfaf:local-llm:set-enabled',
  changed: 'pdfaf:local-llm:changed',
  getDiagnostics: 'pdfaf:desktop:get-diagnostics',
  openDataFolder: 'pdfaf:desktop:open-data-folder',
  openLogsFolder: 'pdfaf:desktop:open-logs-folder',
  exportSupportBundle: 'pdfaf:desktop:export-support-bundle',
  restartServices: 'pdfaf:desktop:restart-services',
  resetLocalAi: 'pdfaf:desktop:reset-local-ai',
} as const;

contextBridge.exposeInMainWorld('pdfafDesktop', {
  localAi: {
    getState: () => ipcRenderer.invoke(channels.getState) as Promise<LocalLlmPublicState>,
    install: () => ipcRenderer.invoke(channels.install) as Promise<LocalLlmPublicState>,
    cancel: () => ipcRenderer.invoke(channels.cancel) as Promise<LocalLlmPublicState>,
    remove: () => ipcRenderer.invoke(channels.remove) as Promise<LocalLlmPublicState>,
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke(channels.setEnabled, enabled) as Promise<LocalLlmPublicState>,
    subscribe: (listener: (state: LocalLlmPublicState) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: LocalLlmPublicState) => listener(state);
      ipcRenderer.on(channels.changed, wrapped);
      return () => {
        ipcRenderer.removeListener(channels.changed, wrapped);
      };
    },
  },
  support: {
    getDiagnostics: () => ipcRenderer.invoke(channels.getDiagnostics) as Promise<DesktopDiagnosticsSummary>,
    openDataFolder: () => ipcRenderer.invoke(channels.openDataFolder) as Promise<string>,
    openLogsFolder: () => ipcRenderer.invoke(channels.openLogsFolder) as Promise<string>,
    exportSupportBundle: () => ipcRenderer.invoke(channels.exportSupportBundle) as Promise<string>,
    restartServices: () => ipcRenderer.invoke(channels.restartServices) as Promise<DesktopDiagnosticsSummary>,
    resetLocalAi: () => ipcRenderer.invoke(channels.resetLocalAi) as Promise<DesktopDiagnosticsSummary>,
  },
});

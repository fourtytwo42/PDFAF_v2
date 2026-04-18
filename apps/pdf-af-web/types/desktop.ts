import type { DesktopLocalLlmState } from './health';

export interface DesktopDiagnosticsSummary {
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
  localAi: DesktopLocalLlmState | null;
}

export interface DesktopLocalAiBridge {
  getState: () => Promise<DesktopLocalLlmState | null>;
  install: () => Promise<DesktopLocalLlmState | null>;
  cancel: () => Promise<DesktopLocalLlmState | null>;
  remove: () => Promise<DesktopLocalLlmState | null>;
  setEnabled: (enabled: boolean) => Promise<DesktopLocalLlmState | null>;
  subscribe: (listener: (state: DesktopLocalLlmState) => void) => () => void;
}

export interface DesktopSupportBridge {
  getDiagnostics: () => Promise<DesktopDiagnosticsSummary>;
  openDataFolder: () => Promise<string>;
  openLogsFolder: () => Promise<string>;
  exportSupportBundle: () => Promise<string>;
  restartServices: () => Promise<DesktopDiagnosticsSummary>;
  resetLocalAi: () => Promise<DesktopDiagnosticsSummary>;
}

declare global {
  interface Window {
    pdfafDesktop?: {
      localAi: DesktopLocalAiBridge;
      support: DesktopSupportBridge;
    };
    __pdfafLocalAiState__?: DesktopLocalLlmState | null;
  }
}

export {};

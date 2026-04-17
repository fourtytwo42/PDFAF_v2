import { contextBridge, ipcRenderer } from 'electron';

type LocalLlmInstallStatus =
  | 'not_installed'
  | 'downloading'
  | 'installed'
  | 'failed'
  | 'removing';

interface LocalLlmPublicState {
  status: LocalLlmInstallStatus;
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

const channels = {
  getState: 'pdfaf:local-llm:get-state',
  install: 'pdfaf:local-llm:install',
  cancel: 'pdfaf:local-llm:cancel',
  remove: 'pdfaf:local-llm:remove',
  setEnabled: 'pdfaf:local-llm:set-enabled',
  changed: 'pdfaf:local-llm:changed',
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
});

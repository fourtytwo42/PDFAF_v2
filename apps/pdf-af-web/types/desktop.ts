import type { DesktopLocalLlmState } from './health';

export interface DesktopLocalAiBridge {
  getState: () => Promise<DesktopLocalLlmState | null>;
  install: () => Promise<DesktopLocalLlmState | null>;
  cancel: () => Promise<DesktopLocalLlmState | null>;
  remove: () => Promise<DesktopLocalLlmState | null>;
  setEnabled: (enabled: boolean) => Promise<DesktopLocalLlmState | null>;
  subscribe: (listener: (state: DesktopLocalLlmState) => void) => () => void;
}

declare global {
  interface Window {
    pdfafDesktop?: {
      localAi: DesktopLocalAiBridge;
    };
  }
}

export {};

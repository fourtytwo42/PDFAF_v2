export interface FrontendConfig {
  defaultApiBaseUrl: string;
}

export interface LocalLlmHealthSummary {
  installed: boolean;
  enabled: boolean;
  activeMode: 'local' | 'remote' | 'none';
  serverBin: string;
  serverPresent: boolean;
  modelPath: string;
  modelPresent: boolean;
  mmprojPath: string;
  mmprojPresent: boolean;
}

export interface DesktopLocalLlmState {
  status: 'not_installed' | 'downloading' | 'installed' | 'failed' | 'removing';
  currentStep: 'idle' | 'downloading_runtime' | 'downloading_model' | 'verifying' | 'finalizing' | 'removing';
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

export interface ApiErrorShape {
  message: string;
  httpStatus?: number;
  code?: string;
  requestId?: string;
}

export interface HealthSummary {
  status: string;
  version: string;
  port: number;
  llmConfigured: boolean;
  llmReachable: boolean;
  llmMode: 'local' | 'remote' | 'none';
  localLlm?: LocalLlmHealthSummary;
  databaseOk?: boolean;
}

export interface ApiConnectionState {
  status: 'checking' | 'connected' | 'unreachable' | 'misconfigured';
  summary?: HealthSummary;
  error?: ApiErrorShape;
}

export interface RawHealthResponse {
  status: string;
  version: string;
  port: number;
  dependencies?: {
    llm?: {
      configured?: boolean;
      reachable?: boolean;
      mode?: 'local' | 'remote' | 'none';
      local?: Partial<LocalLlmHealthSummary>;
    };
    database?: {
      ok?: boolean;
    };
  };
}

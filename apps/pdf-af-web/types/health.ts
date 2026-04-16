export interface FrontendConfig {
  defaultApiBaseUrl: string;
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
    };
    database?: {
      ok?: boolean;
    };
  };
}

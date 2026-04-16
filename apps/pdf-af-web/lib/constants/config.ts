import type { FrontendConfig } from '../../types/health';

const FALLBACK_API_BASE_URL = 'http://localhost:6200';

export function getFrontendConfig(): FrontendConfig {
  return {
    defaultApiBaseUrl:
      process.env.NEXT_PUBLIC_PDFAF_API_BASE_URL?.trim() || FALLBACK_API_BASE_URL,
  };
}

export const LOCAL_STORAGE_KEYS = {
  settings: 'pdf-af-settings',
  queuePreferences: 'pdf-af-queue-preferences',
} as const;

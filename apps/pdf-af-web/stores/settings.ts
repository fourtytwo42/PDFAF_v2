'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { fetchHealthSummary } from '../lib/api/pdfafClient';
import { LOCAL_STORAGE_KEYS } from '../lib/constants/config';
import type { ApiConnectionState, ApiErrorShape, HealthSummary } from '../types/health';

interface AppSettingsState {
  initialized: boolean;
  apiBaseUrl: string;
  apiBaseUrlOverride: string | null;
  apiConnectionStatus: ApiConnectionState;
  lastHealthPayload: HealthSummary | null;
  lastHealthCheckedAt: string | null;
  settingsDialogOpen: boolean;
  initialize: (defaultApiBaseUrl: string) => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;
  saveApiBaseUrl: (nextValue: string) => Promise<void>;
  clearApiBaseUrlOverride: (defaultApiBaseUrl: string) => Promise<void>;
  testConnection: (baseUrl: string) => Promise<void>;
  refreshHealth: () => Promise<void>;
}

function invalidUrlError(): ApiErrorShape {
  return {
    message: 'Enter a valid absolute API URL, for example http://localhost:6200.',
  };
}

function validateUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set, get) => ({
      initialized: false,
      apiBaseUrl: 'http://localhost:6200',
      apiBaseUrlOverride: null,
      apiConnectionStatus: { status: 'checking' },
      lastHealthPayload: null,
      lastHealthCheckedAt: null,
      settingsDialogOpen: false,

      initialize: async (defaultApiBaseUrl) => {
        if (get().initialized) return;

        const apiBaseUrl = get().apiBaseUrlOverride ?? defaultApiBaseUrl;
        set({
          initialized: true,
          apiBaseUrl,
          apiConnectionStatus: validateUrl(apiBaseUrl)
            ? { status: 'checking' }
            : { status: 'misconfigured', error: invalidUrlError() },
        });

        if (validateUrl(apiBaseUrl)) {
          await get().testConnection(apiBaseUrl);
        }
      },

      openSettings: () => set({ settingsDialogOpen: true }),
      closeSettings: () => set({ settingsDialogOpen: false }),

      saveApiBaseUrl: async (nextValue) => {
        if (!validateUrl(nextValue)) {
          set({ apiConnectionStatus: { status: 'misconfigured', error: invalidUrlError() } });
          return;
        }

        set({
          apiBaseUrl: nextValue,
          apiBaseUrlOverride: nextValue,
          settingsDialogOpen: false,
        });
        await get().testConnection(nextValue);
      },

      clearApiBaseUrlOverride: async (defaultApiBaseUrl) => {
        set({
          apiBaseUrl: defaultApiBaseUrl,
          apiBaseUrlOverride: null,
          settingsDialogOpen: false,
        });

        if (!validateUrl(defaultApiBaseUrl)) {
          set({ apiConnectionStatus: { status: 'misconfigured', error: invalidUrlError() } });
          return;
        }

        await get().testConnection(defaultApiBaseUrl);
      },

      testConnection: async (baseUrl) => {
        if (!validateUrl(baseUrl)) {
          set({ apiConnectionStatus: { status: 'misconfigured', error: invalidUrlError() } });
          return;
        }

        set({ apiConnectionStatus: { status: 'checking' } });

        try {
          const summary = await fetchHealthSummary(baseUrl);
          set({
            apiConnectionStatus: { status: 'connected', summary },
            lastHealthPayload: summary,
            lastHealthCheckedAt: new Date().toISOString(),
          });
        } catch (error) {
          set({
            apiConnectionStatus: {
              status: 'unreachable',
              error: error as ApiErrorShape,
            },
            lastHealthCheckedAt: new Date().toISOString(),
          });
        }
      },

      refreshHealth: async () => {
        await get().testConnection(get().apiBaseUrl);
      },
    }),
    {
      name: LOCAL_STORAGE_KEYS.settings,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        apiBaseUrlOverride: state.apiBaseUrlOverride,
      }),
    },
  ),
);


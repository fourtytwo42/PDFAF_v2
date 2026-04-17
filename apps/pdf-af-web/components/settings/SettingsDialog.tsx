'use client';

import { useEffect, useState } from 'react';
import { Button } from '../common/Button';
import { LocalAiSettingsCard } from './LocalAiSettingsCard';
import { useAppSettingsStore } from '../../stores/settings';

interface SettingsDialogProps {
  defaultApiBaseUrl: string;
}

export function SettingsDialog({ defaultApiBaseUrl }: SettingsDialogProps) {
  const isOpen = useAppSettingsStore((state) => state.settingsDialogOpen);
  const apiBaseUrl = useAppSettingsStore((state) => state.apiBaseUrl);
  const connection = useAppSettingsStore((state) => state.apiConnectionStatus);
  const closeSettings = useAppSettingsStore((state) => state.closeSettings);
  const saveApiBaseUrl = useAppSettingsStore((state) => state.saveApiBaseUrl);
  const clearApiBaseUrlOverride = useAppSettingsStore((state) => state.clearApiBaseUrlOverride);
  const testConnection = useAppSettingsStore((state) => state.testConnection);

  const [draftValue, setDraftValue] = useState(apiBaseUrl);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftValue(apiBaseUrl);
      setValidationMessage(null);
    }
  }, [apiBaseUrl, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const nextValue = draftValue.trim();
    if (!nextValue) {
      setValidationMessage('API base URL is required.');
      return;
    }
    try {
      new URL(nextValue);
    } catch {
      setValidationMessage('Enter a valid absolute URL, for example http://localhost:6200.');
      return;
    }
    setValidationMessage(null);
    await saveApiBaseUrl(nextValue);
  };

  const handleTest = async () => {
    const nextValue = draftValue.trim();
    if (!nextValue) {
      setValidationMessage('API base URL is required.');
      return;
    }
    try {
      new URL(nextValue);
    } catch {
      setValidationMessage('Enter a valid absolute URL before testing the connection.');
      return;
    }
    setValidationMessage(null);
    await testConnection(nextValue);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4">
      <div className="surface w-full max-w-2xl p-4">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--surface-border)] pb-2">
          <div>
            <h2 className="mt-1 text-sm font-bold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
              API URL
            </h2>
          </div>
          <Button variant="ghost" onClick={() => void closeSettings()}>
            Close
          </Button>
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--foreground)]">
              API base URL
            </span>
            <input
              className="focus-ring w-full border border-[color:var(--surface-border)] bg-black px-3 py-2 text-xs text-[var(--foreground)]"
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="http://localhost:6200"
            />
          </label>

          {validationMessage ? (
            <p className="border border-[color:rgba(255,114,114,0.28)] bg-[color:rgba(255,114,114,0.08)] px-2 py-2 text-xs text-[var(--danger)]">
              {validationMessage}
            </p>
          ) : null}

          {connection.error && connection.status !== 'checking' ? (
            <p className="border border-[color:rgba(255,224,102,0.28)] bg-[color:rgba(255,224,102,0.08)] px-2 py-2 text-xs text-[var(--warning)]">
              Last test: {connection.error.message}
            </p>
          ) : null}

          <LocalAiSettingsCard />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Button variant="primary" onClick={() => void handleSave()}>
            Save URL
          </Button>
          <Button variant="secondary" onClick={() => void handleTest()}>
            Test Connection
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void clearApiBaseUrlOverride(defaultApiBaseUrl);
              setDraftValue(defaultApiBaseUrl);
              setValidationMessage(null);
            }}
          >
            Reset to Default
          </Button>
        </div>

        <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Server default: {defaultApiBaseUrl}
        </p>
      </div>
    </div>
  );
}

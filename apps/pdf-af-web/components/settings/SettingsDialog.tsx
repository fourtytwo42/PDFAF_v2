'use client';

import { useEffect, useState } from 'react';
import { Button } from '../common/Button';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="surface w-full max-w-2xl rounded-[32px] p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              API Settings
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Configure the PDFAF API endpoint
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
              The saved value is stored only in this browser. Future milestones can replace
              this with same-origin proxy routes for the Docker deployment.
            </p>
          </div>
          <Button variant="ghost" onClick={() => void closeSettings()}>
            Close
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[var(--foreground)]">
              API base URL
            </span>
            <input
              className="focus-ring w-full rounded-2xl border border-[color:var(--surface-border)] bg-white/80 px-4 py-3 text-[var(--foreground)] shadow-sm"
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="http://localhost:6200"
            />
          </label>

          {validationMessage ? (
            <p className="rounded-2xl bg-[color:rgba(161,50,50,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
              {validationMessage}
            </p>
          ) : null}

          {connection.error && connection.status !== 'checking' ? (
            <p className="rounded-2xl bg-[color:rgba(149,95,17,0.10)] px-4 py-3 text-sm text-[var(--warning)]">
              Last test: {connection.error.message}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
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

        <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          Default from environment: {defaultApiBaseUrl}
        </p>
      </div>
    </div>
  );
}


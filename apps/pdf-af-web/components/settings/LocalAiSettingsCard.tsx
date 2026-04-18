'use client';

import { useMemo, useState } from 'react';
import type { DesktopLocalLlmState } from '../../types/health';
import { useDesktopLocalAiState } from '../../lib/hooks/useDesktopLocalAiState';
import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function statusLabel(state: DesktopLocalLlmState | null, hasDesktopBridge: boolean): string {
  if (!hasDesktopBridge) return 'Web only';
  if (!state) return 'Checking';
  if (state.status === 'downloading') return 'Installing';
  if (state.status === 'installed' && state.enabled) return 'Local installed';
  if (state.status === 'installed') return 'Local disabled';
  if (state.status === 'failed') return 'Install failed';
  if (state.status === 'removing') return 'Removing';
  return 'Local not installed';
}

function statusTone(
  state: DesktopLocalLlmState | null,
  hasDesktopBridge: boolean,
): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  if (!hasDesktopBridge) return 'neutral';
  if (!state) return 'accent';
  if (state.status === 'installed' && state.enabled) return 'success';
  if (state.status === 'failed') return 'danger';
  if (state.status === 'downloading' || state.status === 'removing') return 'accent';
  if (state.status === 'installed') return 'warning';
  return 'neutral';
}

export function LocalAiSettingsCard() {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { desktopBridge, hasDesktopBridge, state, error, setState, setError } = useDesktopLocalAiState();

  const progressLabel = useMemo(() => {
    if (!state || state.status !== 'downloading') return null;
    if (!state.totalBytes) {
      return `${formatBytes(state.downloadedBytes)} downloaded`;
    }
    return `${formatBytes(state.downloadedBytes)} of ${formatBytes(state.totalBytes)}`;
  }, [state]);

  const runAction = async (action: () => Promise<DesktopLocalLlmState | null>) => {
    setBusy(true);
    setActionError(null);
    setError(null);
    try {
      const nextState = await action();
      if (nextState) {
        setState(nextState);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Local AI action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-strong p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            Local AI
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Install the bundled local model runtime for offline semantic remediation.
          </p>
        </div>
        <StatusPill label={statusLabel(state, hasDesktopBridge)} tone={statusTone(state, hasDesktopBridge)} />
      </div>

      {!hasDesktopBridge ? (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Local AI installation is available only in the Windows desktop app.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Mode</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {state?.enabled ? 'Local enabled' : 'Remote / disabled'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Model</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {state?.artifactVersion.gguf ?? 'gemma-4-E2B-it-Q4_K_M.gguf'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Runtime</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {state?.artifactVersion.llamaCppRelease ?? 'Pending'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Last validated</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {state?.lastValidatedAt ? new Date(state.lastValidatedAt).toLocaleString() : 'Not yet'}
              </dd>
            </div>
          </dl>

          {progressLabel ? (
            <p className="mt-3 border border-[color:rgba(21,112,239,0.18)] bg-[var(--accent-soft)] px-2 py-2 text-xs text-[var(--accent-strong)]">
              {progressLabel}
            </p>
          ) : null}

          {state?.lastError || actionError || error ? (
            <p className="mt-3 border border-[color:rgba(255,114,114,0.28)] bg-[color:rgba(255,114,114,0.08)] px-2 py-2 text-xs text-[var(--danger)]">
              {actionError ?? state?.lastError ?? error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {state?.status === 'downloading' ? (
              <Button variant="secondary" disabled={busy} onClick={() => void runAction(() => desktopBridge!.cancel())}>
                Cancel Install
              </Button>
            ) : null}

            {state?.status !== 'downloading' && state?.status !== 'installed' ? (
              <Button variant="primary" disabled={busy} onClick={() => void runAction(() => desktopBridge!.install())}>
                {state?.status === 'failed' ? 'Retry Install' : 'Install Local AI'}
              </Button>
            ) : null}

            {state?.status === 'installed' ? (
              <Button
                variant={state.enabled ? 'secondary' : 'primary'}
                disabled={busy}
                onClick={() => void runAction(() => desktopBridge!.setEnabled(!state.enabled))}
              >
                {state.enabled ? 'Disable Local AI' : 'Enable Local AI'}
              </Button>
            ) : null}

            {state?.status === 'installed' || state?.status === 'failed' ? (
              <Button variant="ghost" disabled={busy} onClick={() => void runAction(() => desktopBridge!.remove())}>
                Remove Local AI
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

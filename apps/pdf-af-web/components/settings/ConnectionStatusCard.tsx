'use client';

import { useMemo } from 'react';
import { Button } from '../common/Button';
import { SectionCard } from '../common/SectionCard';
import { StatusPill } from '../common/StatusPill';
import { formatLastChecked } from '../../lib/format/formatters';
import { useDesktopLocalAiState } from '../../lib/hooks/useDesktopLocalAiState';
import { useAppSettingsStore } from '../../stores/settings';

export function ConnectionStatusCard() {
  const connection = useAppSettingsStore((state) => state.apiConnectionStatus);
  const apiBaseUrl = useAppSettingsStore((state) => state.apiBaseUrl);
  const lastCheckedAt = useAppSettingsStore((state) => state.lastHealthCheckedAt);
  const refreshHealth = useAppSettingsStore((state) => state.refreshHealth);
  const openSettings = useAppSettingsStore((state) => state.openSettings);
  const { hasDesktopBridge, state: localAiState, error: localAiError } = useDesktopLocalAiState();
  const healthLocalLlm = connection.summary?.localLlm;
  const showLocalAiProgress = Boolean(
    hasDesktopBridge &&
    localAiState &&
    (localAiState.status === 'downloading' || localAiState.currentStep === 'waiting_for_retry') &&
    localAiState.totalBytes &&
    localAiState.totalBytes > 0,
  );
  const localAiProgressPercent = showLocalAiProgress && localAiState?.totalBytes
    ? Math.min(100, Math.max(0, (localAiState.downloadedBytes / localAiState.totalBytes) * 100))
    : 0;

  const statusTone =
    connection.status === 'connected'
      ? 'success'
      : connection.status === 'checking'
        ? 'accent'
        : connection.status === 'misconfigured'
          ? 'warning'
          : 'danger';

  const statusLabel =
    connection.status === 'connected'
      ? 'Connected'
      : connection.status === 'checking'
        ? 'Checking'
        : connection.status === 'misconfigured'
          ? 'Misconfigured'
        : 'Unreachable';

  const localAiSummary = useMemo(() => {
    if (!hasDesktopBridge) {
      if (healthLocalLlm?.installed) {
        return {
          label: healthLocalLlm.enabled
            ? 'Local AI is installed and ready for remediation.'
            : 'Local AI is installed but disabled. Remediation requires local AI to be enabled.',
          tone: healthLocalLlm.enabled ? 'success' as const : 'warning' as const,
        };
      }
      return {
        label: 'Local AI is required for remediation. Run installer repair or reinstall to provision it.',
        tone: 'warning' as const,
      };
    }

    if (!localAiState) {
      return {
        label: 'Local AI status: checking desktop runtime.',
        tone: 'accent' as const,
      };
    }

    if (localAiState.status === 'downloading') {
      const downloadedLabel =
        localAiState.currentStep === 'downloading_model'
          ? `${(localAiState.downloadedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
          : `${(localAiState.downloadedBytes / (1024 * 1024)).toFixed(1)} MB`;
      const totalLabel = localAiState.totalBytes
        ? localAiState.currentStep === 'downloading_model'
          ? `${(localAiState.totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
          : `${(localAiState.totalBytes / (1024 * 1024)).toFixed(1)} MB`
        : 'unknown total';
      const phaseLabel =
        localAiState.currentStep === 'downloading_runtime'
          ? 'Downloading local AI runtime'
          : 'Downloading local AI model';
      return {
        label: `${phaseLabel}: ${downloadedLabel} of ${totalLabel}${localAiState.currentArtifact ? ` (${localAiState.currentArtifact})` : ''}. You can grade PDFs now; remediation will be available after this finishes.`,
        tone: 'accent' as const,
      };
    }

    if (localAiState.currentStep === 'waiting_for_retry') {
      return {
        label: `${localAiState.lastError ?? 'Waiting to resume local AI download.'} You can grade PDFs now; remediation will be available after download resumes and finishes.`,
        tone: 'warning' as const,
      };
    }

    if (localAiState.currentStep === 'verifying') {
      return {
        label: 'Verifying local AI files.',
        tone: 'accent' as const,
      };
    }

    if (localAiState.currentStep === 'finalizing') {
      return {
        label: 'Finalizing local AI setup.',
        tone: 'accent' as const,
      };
    }

    if (localAiState.status === 'installed' && localAiState.enabled) {
      return {
        label: 'Local AI is installed and ready for remediation.',
        tone: 'success' as const,
      };
    }

    if (localAiState.status === 'installed') {
      return {
        label: 'Local AI is installed but disabled. Remediation requires it to be enabled.',
        tone: 'warning' as const,
      };
    }

    if (localAiState.status === 'failed') {
      return {
        label: localAiState.lastError ?? localAiError ?? 'Local AI install failed.',
        tone: 'danger' as const,
      };
    }

    if (localAiState.status === 'removing') {
      return {
        label: 'Local AI removal in progress.',
        tone: 'accent' as const,
      };
    }

    return {
      label: 'Local AI is downloading automatically in the background when the desktop app starts. Until it finishes, you can only grade PDFs.',
      tone: 'warning' as const,
    };
  }, [hasDesktopBridge, healthLocalLlm, localAiError, localAiState]);

  return (
    <SectionCard
      title="Api"
      description="Health check and upstream target."
      action={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void refreshHealth()}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={() => void openSettings()}>
            Edit URL
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="surface-strong p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                Effective Url
              </p>
              <p className="mt-1 break-all text-xs font-bold text-[var(--foreground)]">
                {apiBaseUrl}
              </p>
            </div>
            <StatusPill label={statusLabel} tone={statusTone} />
          </div>
          {connection.error ? (
            <p className="mt-2 border border-[color:rgba(255,114,114,0.28)] bg-[color:rgba(255,114,114,0.08)] px-2 py-2 text-xs leading-5 text-[var(--danger)]">
              {connection.error.message}
              {connection.error.httpStatus ? ` (HTTP ${connection.error.httpStatus})` : ''}
            </p>
          ) : null}
          <p className={`mt-2 px-2 py-2 text-xs leading-5 ${
            localAiSummary.tone === 'danger'
              ? 'border border-[color:rgba(255,114,114,0.28)] bg-[color:rgba(255,114,114,0.08)] text-[var(--danger)]'
              : localAiSummary.tone === 'success'
                ? 'border border-[color:rgba(29,170,118,0.24)] bg-[color:rgba(29,170,118,0.08)] text-[var(--success)]'
                : localAiSummary.tone === 'warning'
                  ? 'border border-[color:rgba(255,184,78,0.26)] bg-[color:rgba(255,184,78,0.10)] text-[var(--warning)]'
                  : 'border border-[color:rgba(21,112,239,0.18)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
          }`}>
            {localAiSummary.label}
          </p>
          {showLocalAiProgress ? (
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded-full bg-[color:rgba(255,255,255,0.08)]">
                <div
                  className="h-full bg-[var(--accent-strong)] transition-[width] duration-300"
                  style={{ width: `${localAiProgressPercent.toFixed(1)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Local AI download {localAiProgressPercent.toFixed(1)}%
              </p>
            </div>
          ) : null}
        </div>

        <div className="surface-strong p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            Status
          </p>
          {connection.summary ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-[var(--muted)]">Status</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {connection.summary.status}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Version</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {connection.summary.version}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Port</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {connection.summary.port}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Database</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {connection.summary.databaseOk ? 'Ready' : 'Unavailable'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">LLM Configured</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {connection.summary.llmConfigured ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">LLM Mode</dt>
                <dd className="mt-0.5 font-bold uppercase text-[var(--foreground)]">
                  {connection.summary.llmMode}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">LLM Reachable</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {connection.summary.llmReachable ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Local AI</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {connection.summary.localLlm?.installed
                    ? connection.summary.localLlm.enabled
                      ? 'Installed + enabled'
                      : 'Installed + disabled'
                    : 'Not installed'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              No health payload available yet.
            </p>
          )}
          <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Last checked {formatLastChecked(lastCheckedAt)}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

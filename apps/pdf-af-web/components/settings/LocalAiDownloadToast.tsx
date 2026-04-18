'use client';

import { useMemo } from 'react';
import { useDesktopLocalAiState } from '../../lib/hooks/useDesktopLocalAiState';

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function LocalAiDownloadToast() {
  const { hasDesktopBridge, state } = useDesktopLocalAiState();

  const model = useMemo(() => {
    if (!hasDesktopBridge || !state) return null;

    if (state.status === 'downloading') {
      const phaseLabel =
        state.currentStep === 'downloading_runtime'
          ? 'Downloading local AI runtime'
          : state.currentStep === 'downloading_model'
            ? 'Downloading local AI model'
            : state.currentStep === 'verifying'
              ? 'Verifying local AI files'
              : 'Finalizing local AI setup';
      const totalLabel = state.totalBytes ? formatBytes(state.totalBytes) : 'unknown total';
      const progressLabel =
        state.currentStep === 'verifying' || state.currentStep === 'finalizing'
          ? null
          : `${formatBytes(state.downloadedBytes)} of ${totalLabel}`;
      const percent =
        state.totalBytes && state.totalBytes > 0
          ? Math.min(100, Math.max(0, (state.downloadedBytes / state.totalBytes) * 100))
          : null;

      return {
        tone: 'accent' as const,
        title: phaseLabel,
        body: progressLabel
          ? `${progressLabel}${state.currentArtifact ? ` • ${state.currentArtifact}` : ''}. You can grade PDFs while this finishes.`
          : 'You can grade PDFs while this finishes. Remediation will unlock automatically when setup completes.',
        percent,
      };
    }

    if (state.currentStep === 'waiting_for_retry') {
      const percent =
        state.totalBytes && state.totalBytes > 0
          ? Math.min(100, Math.max(0, (state.downloadedBytes / state.totalBytes) * 100))
          : null;
      return {
        tone: 'warning' as const,
        title: 'Waiting to resume local AI download',
        body: `${state.lastError ?? 'Network connection lost.'} The download will retry automatically and continue from the saved partial file.`,
        percent,
      };
    }

    return null;
  }, [hasDesktopBridge, state]);

  if (!model) {
    return null;
  }

  const toneClasses =
    model.tone === 'warning'
      ? 'border-[color:rgba(255,184,78,0.30)] bg-[color:rgba(255,184,78,0.12)] text-[var(--warning)]'
      : 'border-[color:rgba(21,112,239,0.18)] bg-[var(--accent-soft)] text-[var(--accent-strong)]';

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(28rem,calc(100vw-2rem))]">
      <div className={`pointer-events-auto rounded-2xl border p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur ${toneClasses}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Local AI</p>
        <p className="mt-1 text-sm font-bold">{model.title}</p>
        <p className="mt-2 text-xs leading-5">{model.body}</p>
        {model.percent != null ? (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-[color:rgba(255,255,255,0.12)]">
              <div
                className="h-full bg-current transition-[width] duration-300"
                style={{ width: `${model.percent.toFixed(1)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">
              {model.percent.toFixed(1)}%
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

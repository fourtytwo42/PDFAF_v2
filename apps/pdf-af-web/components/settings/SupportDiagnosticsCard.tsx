'use client';

import { useEffect, useState } from 'react';
import type { DesktopDiagnosticsSummary } from '../../types/desktop';
import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';

function runtimeTone(summary: DesktopDiagnosticsSummary | null, hasDesktopBridge: boolean) {
  if (!hasDesktopBridge) return 'neutral' as const;
  if (!summary) return 'accent' as const;
  if (summary.startupPhase === 'ready') return 'success' as const;
  if (summary.startupPhase === 'failed') return 'danger' as const;
  if (summary.startupPhase === 'restarting') return 'accent' as const;
  return 'warning' as const;
}

function runtimeLabel(summary: DesktopDiagnosticsSummary | null, hasDesktopBridge: boolean): string {
  if (!hasDesktopBridge) return 'Web only';
  if (!summary) return 'Checking';
  return summary.startupPhase.replace(/_/g, ' ');
}

export function SupportDiagnosticsCard() {
  const supportBridge = typeof window !== 'undefined' ? window.pdfafDesktop?.support : undefined;
  const hasDesktopBridge = Boolean(supportBridge);
  const [summary, setSummary] = useState<DesktopDiagnosticsSummary | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supportBridge) return;
    let active = true;
    void supportBridge.getDiagnostics()
      .then((nextSummary) => {
        if (active) {
          setSummary(nextSummary);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Could not read desktop diagnostics.');
        }
      });
    return () => {
      active = false;
    };
  }, [supportBridge]);

  const runAction = async <T,>(name: string, action: () => Promise<T>, onSuccess?: (result: T) => void) => {
    setBusyAction(name);
    setMessage(null);
    try {
      const result = await action();
      onSuccess?.(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Desktop action failed.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="surface-strong p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            Desktop Diagnostics
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Export a support bundle, open runtime folders, and recover the managed local services.
          </p>
        </div>
        <StatusPill label={runtimeLabel(summary, hasDesktopBridge)} tone={runtimeTone(summary, hasDesktopBridge)} />
      </div>

      {!hasDesktopBridge ? (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Desktop diagnostics are available only in the Windows desktop app.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">App version</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">{summary?.appVersion ?? 'Pending'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Runtime mode</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">{summary?.runtimeMode ?? 'Pending'}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Bundled Node</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {summary?.runtime.manifest?.nodeVersion ?? 'Unknown'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Bundled Python</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {summary?.runtime.manifest?.pythonVersion ?? 'Unknown'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Bundled qpdf</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {summary?.runtime.manifest?.qpdfVersion ?? 'Unknown'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Build commit</dt>
              <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                {summary?.runtime.buildMetadata?.gitCommit ?? 'Unavailable'}
              </dd>
            </div>
          </dl>

          {message ? (
            <p className="mt-3 border border-[color:rgba(255,224,102,0.28)] bg-[color:rgba(255,224,102,0.08)] px-2 py-2 text-xs text-[var(--warning)]">
              {message}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              variant="secondary"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction('open-data', () => supportBridge!.openDataFolder(), (path) => {
                  setMessage(`Opened data folder: ${path}`);
                })
              }
            >
              Open Data Folder
            </Button>
            <Button
              variant="secondary"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction('open-logs', () => supportBridge!.openLogsFolder(), (path) => {
                  setMessage(`Opened logs folder: ${path}`);
                })
              }
            >
              Open Logs Folder
            </Button>
            <Button
              variant="primary"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction('export-bundle', () => supportBridge!.exportSupportBundle(), (path) => {
                  setMessage(`Support bundle exported: ${path}`);
                })
              }
            >
              Export Support Bundle
            </Button>
            <Button
              variant="ghost"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction('restart-services', () => supportBridge!.restartServices(), (nextSummary) => {
                  setSummary(nextSummary);
                  setMessage('Restarted desktop services.');
                })
              }
            >
              Restart App Services
            </Button>
            <Button
              variant="ghost"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction('reset-local-ai', () => supportBridge!.resetLocalAi(), (nextSummary) => {
                  setSummary(nextSummary);
                  setMessage('Reset local AI artifacts and restarted services.');
                })
              }
            >
              Reset Local AI
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

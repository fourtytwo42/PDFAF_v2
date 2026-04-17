'use client';

import { Button } from '../common/Button';
import { SectionCard } from '../common/SectionCard';
import { StatusPill } from '../common/StatusPill';
import { formatLastChecked } from '../../lib/format/formatters';
import { useAppSettingsStore } from '../../stores/settings';

export function ConnectionStatusCard() {
  const connection = useAppSettingsStore((state) => state.apiConnectionStatus);
  const apiBaseUrl = useAppSettingsStore((state) => state.apiBaseUrl);
  const lastCheckedAt = useAppSettingsStore((state) => state.lastHealthCheckedAt);
  const refreshHealth = useAppSettingsStore((state) => state.refreshHealth);
  const openSettings = useAppSettingsStore((state) => state.openSettings);

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

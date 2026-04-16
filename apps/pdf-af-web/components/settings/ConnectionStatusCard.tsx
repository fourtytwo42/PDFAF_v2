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
      title="API Connection"
      description="The app still uses GET /v1/health for connectivity. Queueing now lives in the browser, and processing actions will attach to this connection in later milestones."
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
      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-strong rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Effective API URL
              </p>
              <p className="mt-2 break-all text-lg font-medium text-[var(--foreground)]">
                {apiBaseUrl}
              </p>
            </div>
            <StatusPill label={statusLabel} tone={statusTone} />
          </div>
          {connection.error ? (
            <p className="mt-4 rounded-2xl bg-[color:rgba(161,50,50,0.08)] px-4 py-3 text-sm leading-6 text-[var(--danger)]">
              {connection.error.message}
              {connection.error.httpStatus ? ` (HTTP ${connection.error.httpStatus})` : ''}
            </p>
          ) : null}
        </div>

        <div className="surface-strong rounded-3xl p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Service Summary
          </p>
          {connection.summary ? (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Status</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {connection.summary.status}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Version</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {connection.summary.version}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Port</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {connection.summary.port}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Database</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {connection.summary.databaseOk ? 'Ready' : 'Unavailable'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">LLM Configured</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {connection.summary.llmConfigured ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">LLM Reachable</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {connection.summary.llmReachable ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              No health payload available yet.
            </p>
          )}
          <p className="mt-5 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            Last checked {formatLastChecked(lastCheckedAt)}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

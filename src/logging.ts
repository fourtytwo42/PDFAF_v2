import { randomUUID } from 'node:crypto';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  requestId?: string;
  method?: string;
  path?: string;
  durationMs?: number;
  filename?: string;
  grade?: string;
  score?: number;
  error?: string;
  details?: unknown;
}

function write(entry: LogEntry): void {
  const line = JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
    service: 'pdfaf-v2',
  });
  process.stdout.write(`${line}\n`);
}

export function logInfo(entry: Omit<LogEntry, 'level'> & { level?: 'info' }): void {
  write({ ...entry, level: 'info' });
}

export function logWarn(entry: Omit<LogEntry, 'level'> & { level?: 'warn' }): void {
  write({ ...entry, level: 'warn' });
}

export function logError(entry: Omit<LogEntry, 'level'> & { level?: 'error' }): void {
  write({ ...entry, level: 'error' });
}

export function newRequestId(): string {
  return randomUUID();
}

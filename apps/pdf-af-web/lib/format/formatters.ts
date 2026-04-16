export function formatLastChecked(value: string | null): string {
  if (!value) return 'never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatFileSize(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'unknown';

  if (value < 1024) return `${value} B`;

  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatJobTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

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

export function formatPdfClass(value: string): string {
  switch (value) {
    case 'native_tagged':
      return 'Native Tagged';
    case 'native_untagged':
      return 'Native Untagged';
    case 'scanned':
      return 'Scanned';
    case 'mixed':
      return 'Mixed';
    default:
      return value;
  }
}

export function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'unknown';

  if (value < 1000) return `${Math.round(value)} ms`;

  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`;
}

export function formatScoreGrade(score: number, grade: string): string {
  return `${score} / ${grade}`;
}

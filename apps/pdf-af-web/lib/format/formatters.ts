export function formatLastChecked(value: string | null): string {
  if (!value) return 'never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}


import { BAD_LINK_LABELS, GENERIC_LINK_PHRASES_EXTRA } from '../../config.js';

export function isRawUrlLinkText(text: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(text.trim());
}

const EXTRA_GENERIC = new Set(GENERIC_LINK_PHRASES_EXTRA.map(s => s.toLowerCase()));

/** pdfaf-style generic link label (BAD_LINK_LABELS + GENERIC_LINK_PHRASES_EXTRA). */
export function isGenericLinkText(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (!normalized) return false;
  if (BAD_LINK_LABELS.has(normalized)) return true;
  if (EXTRA_GENERIC.has(normalized)) return true;
  return false;
}

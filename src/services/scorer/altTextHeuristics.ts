/** pdfaf `localStandardsService`–style weak alt detection (Tier A, bounded). */

const GENERIC_ALT_TEXT_PATTERNS = new Set(['image', 'photo', 'picture', 'graphic', 'icon', 'logo']);

function normalizeSemanticText(text: string | null | undefined): string {
  return String(text || '')
    .replace(/^u:/, '')
    .trim()
    .toLowerCase();
}

export function isGenericAltText(text: string | null | undefined): boolean {
  const normalized = normalizeSemanticText(text);
  if (!normalized) return false;
  if (GENERIC_ALT_TEXT_PATTERNS.has(normalized)) return true;
  return /^image\s+\d+$/i.test(normalized);
}

export function isBoilerplateAltText(text: string | null | undefined): boolean {
  return /^(image|picture|photo|graphic)\s+of\b/i.test(normalizeSemanticText(text));
}

export function isUnreadableAltText(text: string | null | undefined): boolean {
  const raw = String(text || '')
    .replace(/^u:/, '')
    .trim();
  if (!raw) return false;
  const tokens = raw.split(/\s+/).filter(Boolean);
  const isolatedGlyphTokens = tokens.filter(token => {
    const normalized = token.replace(/[.,;:!?'"()\-_/\\]/g, '');
    return normalized.length <= 1;
  });
  return tokens.length >= 6 && isolatedGlyphTokens.length / tokens.length >= 0.65;
}

export function isWeakFigureAlt(altText: string | null | undefined, hasAlt: boolean): boolean {
  if (!hasAlt) return false;
  const t = altText?.trim() ?? '';
  if (!t) return false;
  return isGenericAltText(t) || isBoilerplateAltText(t) || isUnreadableAltText(t);
}

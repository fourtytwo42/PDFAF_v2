import { afterEach, describe, expect, it } from 'vitest';
import type { DocumentSnapshot } from '../../src/types.js';
import {
  shouldTryLocalFontSubstitution,
  shouldTryUrwType1Embed,
} from '../../src/services/remediation/fontEmbed.js';

function snap(input: Partial<DocumentSnapshot>): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    textCharCount: 1000,
    fonts: [],
    ...input,
  } as unknown as DocumentSnapshot;
}

describe('font embedding gates', () => {
  const oldLocal = process.env['PDFAF_LOCAL_FONT_SUBSTITUTION'];

  afterEach(() => {
    if (oldLocal === undefined) delete process.env['PDFAF_LOCAL_FONT_SUBSTITUTION'];
    else process.env['PDFAF_LOCAL_FONT_SUBSTITUTION'] = oldLocal;
  });

  it('enables local substitution for risky text fonts by default', () => {
    expect(shouldTryLocalFontSubstitution(snap({
      fonts: [{ name: 'Helvetica', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }))).toBe(true);
  });

  it('skips scanned PDFs and clean fonts', () => {
    expect(shouldTryLocalFontSubstitution(snap({
      pdfClass: 'scanned',
      fonts: [{ name: 'Helvetica', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }))).toBe(false);
    expect(shouldTryLocalFontSubstitution(snap({
      fonts: [{ name: 'Helvetica', isEmbedded: true, hasUnicode: true, encodingRisk: false }],
    }))).toBe(false);
  });

  it('respects PDFAF_LOCAL_FONT_SUBSTITUTION=0', () => {
    process.env['PDFAF_LOCAL_FONT_SUBSTITUTION'] = '0';
    expect(shouldTryLocalFontSubstitution(snap({
      fonts: [{ name: 'Helvetica', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }))).toBe(false);
  });

  it('keeps the existing URW Type1 gate narrow', () => {
    expect(shouldTryUrwType1Embed(snap({
      fonts: [{ name: 'Century-Book', subtype: 'Type1', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }))).toBe(true);
    expect(shouldTryUrwType1Embed(snap({
      fonts: [{ name: 'Helvetica', subtype: 'Type1', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }))).toBe(false);
  });
});

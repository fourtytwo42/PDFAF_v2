import { afterEach, describe, expect, it } from 'vitest';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';
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

function analysis(input: Partial<AnalysisResult> & { textScore?: number } = {}): AnalysisResult {
  const textScore = input.textScore ?? 90;
  return {
    score: 90,
    categories: [
      {
        key: 'text_extractability',
        score: textScore,
        weight: 0.18,
        applicable: true,
        severity: textScore < 100 ? 'moderate' : 'pass',
        findings: textScore < 100
          ? [{
              category: 'text_extractability',
              severity: 'moderate',
              wcag: '1.3.1',
              message: '1 font(s) may fail Acrobat "Character encoding" (missing embedding and/or ToUnicode).',
            }]
          : [],
      },
    ],
    ...input,
  } as unknown as AnalysisResult;
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
    }), analysis({ score: 87, textScore: 90 }))).toBe(true);
  });

  it('skips scanned PDFs and clean fonts', () => {
    expect(shouldTryLocalFontSubstitution(snap({
      pdfClass: 'scanned',
      fonts: [{ name: 'Helvetica', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }), analysis({ score: 87, textScore: 90 }))).toBe(false);
    expect(shouldTryLocalFontSubstitution(snap({
      fonts: [{ name: 'Helvetica', isEmbedded: true, hasUnicode: true, encodingRisk: false }],
    }), analysis({ score: 87, textScore: 90 }))).toBe(false);
  });

  it('skips high-score rows unless text extractability is limiting', () => {
    const risky = snap({
      fonts: [{ name: 'Helvetica', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    });
    expect(shouldTryLocalFontSubstitution(risky, analysis({ score: 99, textScore: 98 }))).toBe(false);
    expect(shouldTryLocalFontSubstitution(risky, analysis({ score: 99, textScore: 90 }))).toBe(true);
  });

  it('requires text-extractability risk evidence when analysis is available', () => {
    expect(shouldTryLocalFontSubstitution(snap({
      fonts: [{ name: 'Helvetica', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }), analysis({ score: 87, textScore: 100 }))).toBe(false);
  });

  it('respects PDFAF_LOCAL_FONT_SUBSTITUTION=0', () => {
    process.env['PDFAF_LOCAL_FONT_SUBSTITUTION'] = '0';
    expect(shouldTryLocalFontSubstitution(snap({
      fonts: [{ name: 'Helvetica', isEmbedded: false, hasUnicode: false, encodingRisk: true }],
    }), analysis({ score: 87, textScore: 90 }))).toBe(false);
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

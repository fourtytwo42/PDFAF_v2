import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import {
  ENGINE_OCR_TEXT_EXTRACTABILITY_SCORE,
  OCR_METADATA_TEXT_EXTRACTABILITY_CAP,
  SCORE_TAGGED_MARKED_NO_EXTRACTABLE_TEXT,
  TEXT_EXTRACTABILITY_ENCODING_MAX_PENALTY,
  TEXT_EXTRACTABILITY_ENCODING_PER_RISK_FONT,
  TEXT_EXTRACTABILITY_ENCODING_RELAX_CHARS_PER_PAGE,
  TEXT_EXTRACTABILITY_ENCODING_RELAX_MAX_PENALTY,
  TEXT_EXTRACTABILITY_ENCODING_RELAX_MIN_CHARS,
  TEXT_EXTRACTABILITY_ENCODING_RELAX_PER_FONT,
  TEXT_EXTRACTABILITY_ENCODING_SCORE_FLOOR,
} from '../../../config.js';
import { qualifiesForEngineOwnedOcrExtractabilityCredit } from '../remediationProvenance.js';

function encodingRiskFontCount(snap: DocumentSnapshot): number {
  return snap.fonts.filter(f => Boolean(f.encodingRisk)).length;
}

function encodingRiskPenaltyRelaxed(snap: DocumentSnapshot): boolean {
  if (snap.pdfClass !== 'native_tagged') return false;
  const textChars = snap.textCharCount ?? 0;
  const cpp = (snap.textCharCount ?? 0) / Math.max(snap.pageCount, 1);
  const denseTaggedShortDoc =
    snap.isTagged &&
    snap.pageCount <= 2 &&
    textChars >= 500 &&
    cpp >= TEXT_EXTRACTABILITY_ENCODING_RELAX_CHARS_PER_PAGE;
  if (denseTaggedShortDoc) return true;
  if (TEXT_EXTRACTABILITY_ENCODING_RELAX_MIN_CHARS <= 0) return false;
  if (textChars < TEXT_EXTRACTABILITY_ENCODING_RELAX_MIN_CHARS) return false;
  return cpp >= TEXT_EXTRACTABILITY_ENCODING_RELAX_CHARS_PER_PAGE;
}

function applyEncodingRiskPenalty(score: number, snap: DocumentSnapshot): { score: number; findings: Finding[] } {
  const extra: Finding[] = [];
  const n = encodingRiskFontCount(snap);
  if (n <= 0) return { score, findings: extra };
  const relaxed = encodingRiskPenaltyRelaxed(snap);
  const penalty = relaxed
    ? Math.min(TEXT_EXTRACTABILITY_ENCODING_RELAX_MAX_PENALTY, n * TEXT_EXTRACTABILITY_ENCODING_RELAX_PER_FONT)
    : Math.min(TEXT_EXTRACTABILITY_ENCODING_MAX_PENALTY, n * TEXT_EXTRACTABILITY_ENCODING_PER_RISK_FONT);
  const next = Math.max(TEXT_EXTRACTABILITY_ENCODING_SCORE_FLOOR, Math.round(score - penalty));
  extra.push({
    category: 'text_extractability',
    severity: relaxed ? 'minor' : 'moderate',
    wcag: '1.3.1',
    message: relaxed
      ? `${n} font(s) are flagged for Acrobat "Character encoding" risk, but pdf.js extracted a dense text layer (${snap.textCharCount} chars) — extraction likely works for AT; still prefer embedded fonts + ToUnicode for archival tooling.`
      : `${n} font(s) may fail Acrobat "Character encoding" (missing embedding and/or ToUnicode). Re-export with embedded OpenType fonts, enable Ghostscript embedding (PDFAF_EMBED_FONTS=1 or PDFAF_AUTO_EMBED_ENCODING=1 with gs on PATH), or fix in the source document.`,
    count: n,
  });
  return { score: next, findings: extra };
}

function metadataSuggestsOcrEngine(snap: DocumentSnapshot): boolean {
  const p = (snap.metadata.producer ?? '').toLowerCase();
  const c = (snap.metadata.creator ?? '').toLowerCase();
  return (
    p.includes('ocrmypdf') ||
    c.includes('ocrmypdf') ||
    p.includes('tesseract') ||
    c.includes('tesseract')
  );
}

export function scoreTextExtractability(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];
  let score: number;

  switch (snap.pdfClass) {
    case 'scanned':
      score = 0;
      findings.push({
        category: 'text_extractability',
        severity: 'critical',
        wcag: '1.3.1',
        message: 'Document appears to be scanned — no machine-readable text. Screen readers cannot access content.',
      });
      break;

    case 'mixed': {
      // Score based on how many pages have real text
      const textPageCount = snap.pageCount - snap.imageOnlyPageCount;
      const ratio = textPageCount / snap.pageCount;
      score = Math.round(ratio * 60); // max 60 for mixed — structure is also missing
      if (snap.imageOnlyPageCount > 0) {
        findings.push({
          category: 'text_extractability',
          severity: 'moderate',
          wcag: '1.3.1',
          message: `${snap.imageOnlyPageCount} of ${snap.pageCount} pages appear to be scanned images with no extractable text.`,
          count: snap.imageOnlyPageCount,
        });
      }
      break;
    }

    case 'native_untagged': {
      // Text is present but no accessibility structure
      if (snap.textCharCount === 0) {
        score = 10;
        findings.push({
          category: 'text_extractability',
          severity: 'critical',
          wcag: '1.3.1',
          message: 'No text could be extracted despite the document not being flagged as scanned.',
        });
      } else {
        score = 65;
        findings.push({
          category: 'text_extractability',
          severity: 'moderate',
          wcag: '1.3.1',
          message: 'Document has extractable text but lacks accessibility tagging (no structure tree).',
        });
      }
      break;
    }

    case 'native_tagged': {
      if (snap.textCharCount === 0) {
        if (snap.isTagged && snap.markInfo?.Marked === true) {
          score = SCORE_TAGGED_MARKED_NO_EXTRACTABLE_TEXT;
          findings.push({
            category: 'text_extractability',
            severity: 'moderate',
            wcag: '1.3.1',
            message:
              'Document is tagged for accessibility (Marked) but pdf.js extracted no characters — common for some OCR or legacy exports. Verify access with assistive technology.',
          });
        } else {
          score = 40;
          findings.push({
            category: 'text_extractability',
            severity: 'moderate',
            wcag: '1.3.1',
            message: 'Document is tagged but no text was extracted — may be image-only despite tagging.',
          });
        }
      } else {
        if (metadataSuggestsOcrEngine(snap)) {
          if (qualifiesForEngineOwnedOcrExtractabilityCredit(snap)) {
            score = ENGINE_OCR_TEXT_EXTRACTABILITY_SCORE;
            findings.push({
              category: 'text_extractability',
              severity: 'minor',
              wcag: '1.3.1',
              message:
                'PDFAF-applied OCR produced a tagged, fully extractable text layer with no remaining font-unicode risk. Manual validation of OCR accuracy is still recommended, but extractability is no longer capped at the generic OCR-survivor floor.',
            });
            break;
          }
          findings.push({
            category: 'text_extractability',
            severity: 'moderate',
            wcag: '1.3.1',
            message:
              'Producer/Creator metadata indicates an OCR-generated text layer. Automated scoring cannot judge recognition accuracy, logical reading order, or PDF/UA parity with external checkers — validate with assistive technology and Acrobat/PAC-style review.',
          });
          score =
            OCR_METADATA_TEXT_EXTRACTABILITY_CAP >= 100
              ? 100
              : Math.min(100, OCR_METADATA_TEXT_EXTRACTABILITY_CAP);
          const encOcr = applyEncodingRiskPenalty(score, snap);
          score = encOcr.score;
          findings.push(...encOcr.findings);
        } else {
          score = 100;
          const enc = applyEncodingRiskPenalty(score, snap);
          score = enc.score;
          findings.push(...enc.findings);
        }
      }
      break;
    }
  }

  return {
    key: 'text_extractability',
    score,
    weight: 0.175, // will be adjusted by scorer for N/A redistribution
    applicable: true,
    severity: findings.length > 0 ? findings[0]!.severity : 'pass',
    findings,
  };
}

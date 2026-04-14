import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';

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
        score = 40;
        findings.push({
          category: 'text_extractability',
          severity: 'moderate',
          wcag: '1.3.1',
          message: 'Document is tagged but no text was extracted — may be image-only despite tagging.',
        });
      } else {
        score = 100;
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

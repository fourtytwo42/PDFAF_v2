import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';

export function scoreReadingOrder(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];

  if (!snap.structureTree || snap.pdfClass === 'scanned') {
    // Can't verify reading order without a structure tree
    const score = snap.pdfClass === 'scanned' ? 0 : 30;
    if (snap.pdfClass !== 'scanned') {
      findings.push({
        category: 'reading_order',
        severity: 'moderate',
        wcag: '1.3.2',
        message: 'Reading order cannot be verified without a document structure tree.',
      });
    }
    return {
      key: 'reading_order',
      score,
      weight: 0.040,
      applicable: snap.pdfClass !== 'scanned',
      severity: snap.pdfClass === 'scanned' ? 'critical' : 'moderate',
      findings,
    };
  }

  // Heuristic: check that headings appear in page-ascending order
  // (a proxy for logical reading flow without full content stream analysis)
  const headings = snap.headings;
  if (headings.length < 2) {
    return {
      key: 'reading_order',
      score: 80,
      weight: 0.040,
      applicable: true,
      severity: 'pass',
      findings: [],
    };
  }

  let outOfOrder = 0;
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1]!;
    const curr = headings[i]!;
    // Headings on earlier pages appearing after headings on later pages = suspect
    if (prev.page > curr.page + 1) {
      outOfOrder++;
    }
  }

  const ratio = outOfOrder / (headings.length - 1);
  let score = Math.round((1 - ratio) * 100);
  score = Math.max(0, Math.min(100, score));

  if (outOfOrder > 0) {
    findings.push({
      category: 'reading_order',
      severity: ratio > 0.3 ? 'moderate' : 'minor',
      wcag: '1.3.2',
      message: `${outOfOrder} heading${outOfOrder !== 1 ? 's' : ''} appear out of page order, suggesting reading order issues.`,
      count: outOfOrder,
    });
  }

  return {
    key: 'reading_order',
    score,
    weight: 0.040,
    applicable: true,
    severity: scoreSeverity(score),
    findings,
  };
}

function scoreSeverity(score: number) {
  if (score >= 90) return 'pass' as const;
  if (score >= 70) return 'minor' as const;
  if (score >= 40) return 'moderate' as const;
  return 'critical' as const;
}

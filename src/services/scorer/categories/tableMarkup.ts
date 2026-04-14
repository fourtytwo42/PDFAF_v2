import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';

export function scoreTableMarkup(snap: DocumentSnapshot): ScoredCategory {
  if (snap.tables.length === 0) {
    return {
      key: 'table_markup',
      score: 100,
      weight: 0.085,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  const findings: Finding[] = [];
  const tablesWithHeaders = snap.tables.filter(t => t.hasHeaders);
  const ratio = tablesWithHeaders.length / snap.tables.length;
  const score = Math.round(ratio * 100);

  if (tablesWithHeaders.length < snap.tables.length) {
    const missing = snap.tables.length - tablesWithHeaders.length;
    findings.push({
      category: 'table_markup',
      severity: ratio < 0.5 ? 'critical' : ratio < 0.8 ? 'moderate' : 'minor',
      wcag: '1.3.1',
      message: `${missing} of ${snap.tables.length} table${snap.tables.length !== 1 ? 's' : ''} lack header cells (/TH). Screen readers cannot associate data with headers.`,
      count: missing,
    });
  }

  return {
    key: 'table_markup',
    score,
    weight: 0.085,
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

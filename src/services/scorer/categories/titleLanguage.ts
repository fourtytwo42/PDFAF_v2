import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';

export function scoreTitleLanguage(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];

  const hasTitle = !!(snap.metadata.title?.trim() || snap.structTitle?.trim());
  const hasLang = !!(snap.lang?.trim() || snap.metadata.language?.trim());

  let score: number;

  if (hasTitle && hasLang) {
    score = 100;
  } else if (hasTitle && !hasLang) {
    score = 50;
    findings.push({
      category: 'title_language',
      severity: 'moderate',
      wcag: '3.1.1',
      message: 'Document language is not set (/Lang missing). Screen readers cannot select the correct voice/language.',
    });
  } else if (!hasTitle && hasLang) {
    score = 50;
    findings.push({
      category: 'title_language',
      severity: 'moderate',
      wcag: '2.4.2',
      message: 'Document title is not set (/Title missing). Tab windows and screen readers show no meaningful title.',
    });
  } else {
    score = 0;
    findings.push({
      category: 'title_language',
      severity: 'critical',
      wcag: '2.4.2',
      message: 'Document is missing both /Title and /Lang. Essential metadata for screen reader users is absent.',
    });
  }

  return {
    key: 'title_language',
    score,
    weight: 0.130,
    applicable: true,
    severity: findings.length > 0 ? findings[0]!.severity : 'pass',
    findings,
  };
}

import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { ALT_TEXT_THRESHOLDS } from '../../../config.js';

export function scoreAltText(snap: DocumentSnapshot): ScoredCategory {
  const allFigures = snap.figures;

  // Figures that are not marked as decorative artifacts
  const informativeFigures = allFigures.filter(f => !f.isArtifact);

  if (informativeFigures.length === 0) {
    // No non-decorative figures → this category is N/A
    return {
      key: 'alt_text',
      score: 100,
      weight: 0.130,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  const withAlt   = informativeFigures.filter(f => f.hasAlt && (f.altText?.trim() ?? '').length > 0);
  const withoutAlt = informativeFigures.filter(f => !f.hasAlt || !(f.altText?.trim()));
  const ratio = withAlt.length / informativeFigures.length;

  let score: number;
  if (ratio >= ALT_TEXT_THRESHOLDS.FULL)     score = 100;
  else if (ratio >= ALT_TEXT_THRESHOLDS.HIGH) score = 85;
  else if (ratio >= ALT_TEXT_THRESHOLDS.MODERATE) score = 60;
  else if (ratio >= ALT_TEXT_THRESHOLDS.LOW)  score = 20;
  else score = 0;

  const findings: Finding[] = [];

  if (withoutAlt.length > 0) {
    const severity = ratio < 0.5 ? 'critical' : ratio < 0.8 ? 'moderate' : 'minor';
    findings.push({
      category: 'alt_text',
      severity,
      wcag: '1.1.1',
      message: `${withoutAlt.length} of ${informativeFigures.length} image${informativeFigures.length !== 1 ? 's' : ''} lack alternative text.`,
      count: withoutAlt.length,
      page: withoutAlt[0]?.page,
    });
  }

  // Warn about empty alt text strings (hasAlt=true but text is blank)
  const emptyAlt = informativeFigures.filter(f => f.hasAlt && !(f.altText?.trim()));
  if (emptyAlt.length > 0) {
    findings.push({
      category: 'alt_text',
      severity: 'minor',
      wcag: '1.1.1',
      message: `${emptyAlt.length} image${emptyAlt.length !== 1 ? 's' : ''} have an /Alt attribute but it is empty.`,
      count: emptyAlt.length,
    });
  }

  return {
    key: 'alt_text',
    score,
    weight: 0.130,
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

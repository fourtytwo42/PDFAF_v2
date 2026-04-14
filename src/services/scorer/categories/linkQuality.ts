import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { BAD_LINK_LABELS } from '../../../config.js';

export function scoreLinkQuality(snap: DocumentSnapshot): ScoredCategory {
  if (snap.links.length === 0) {
    return {
      key: 'link_quality',
      score: 100,
      weight: 0.045,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  const findings: Finding[] = [];
  let badCount = 0;

  for (const link of snap.links) {
    const label = link.text.trim().toLowerCase();
    if (!label) {
      badCount++;
    } else if (BAD_LINK_LABELS.has(label)) {
      badCount++;
    } else if (/^https?:\/\//i.test(label)) {
      // Raw URL as the visible label
      badCount++;
    }
  }

  const ratio = (snap.links.length - badCount) / snap.links.length;
  const score = Math.round(ratio * 100);

  if (badCount > 0) {
    findings.push({
      category: 'link_quality',
      severity: ratio < 0.5 ? 'moderate' : 'minor',
      wcag: '2.4.4',
      message: `${badCount} of ${snap.links.length} link${snap.links.length !== 1 ? 's' : ''} have non-descriptive labels (e.g. "click here", raw URLs).`,
      count: badCount,
    });
  }

  return {
    key: 'link_quality',
    score,
    weight: 0.045,
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

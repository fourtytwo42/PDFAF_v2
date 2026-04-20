import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { CATEGORY_BASE_WEIGHTS } from '../../../config.js';

export function scoreFormAccessibility(snap: DocumentSnapshot): ScoredCategory {
  // Merge tagged form fields and pdfjs-detected widget annotations
  const allFields = mergeFormFields(snap);

  if (allFields.length === 0) {
    return {
      key: 'form_accessibility',
      score: 100,
      weight: CATEGORY_BASE_WEIGHTS.form_accessibility,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  const findings: Finding[] = [];
  const withTooltip    = allFields.filter(f => f.tooltip && f.tooltip.trim().length > 0);
  const withoutTooltip = allFields.filter(f => !f.tooltip || !f.tooltip.trim());
  const ratio = withTooltip.length / allFields.length;
  const score = Math.round(ratio * 100);

  if (withoutTooltip.length > 0) {
    findings.push({
      category: 'form_accessibility',
      severity: ratio < 0.5 ? 'critical' : ratio < 0.8 ? 'moderate' : 'minor',
      wcag: '1.3.1',
      message: `${withoutTooltip.length} of ${allFields.length} form field${allFields.length !== 1 ? 's' : ''} lack accessible labels (/TU tooltip).`,
      count: withoutTooltip.length,
    });
  }

  return {
    key: 'form_accessibility',
    score,
    weight: CATEGORY_BASE_WEIGHTS.form_accessibility,
    applicable: true,
    severity: scoreSeverity(score),
    findings,
  };
}

function mergeFormFields(snap: DocumentSnapshot) {
  // Prefer pikepdf-detected fields (have tooltip info); supplement with pdfjs
  const out = [...snap.formFields];
  const knownNames = new Set(snap.formFields.map(f => f.name));
  for (const f of snap.formFieldsFromPdfjs) {
    if (!knownNames.has(f.name)) {
      out.push({ name: f.name, tooltip: undefined, page: f.page });
    }
  }
  return out;
}

function scoreSeverity(score: number) {
  if (score >= 90) return 'pass' as const;
  if (score >= 70) return 'minor' as const;
  if (score >= 40) return 'moderate' as const;
  return 'critical' as const;
}

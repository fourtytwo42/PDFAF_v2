import type { DocumentSnapshot, ScoredCategory } from '../../../types.js';

// Phase 1: heuristic only — no pixel sampling (too slow).
// Assumes moderate compliance for native documents. Phase 3 adds real sampling.
export function scoreColorContrast(snap: DocumentSnapshot): ScoredCategory {
  if (snap.pdfClass === 'scanned') {
    // Scanned images: contrast cannot be evaluated from PDF structure
    return {
      key: 'color_contrast',
      score: 100,
      weight: 0.045,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  // Default heuristic: assume moderate compliance (70) until Phase 3 sampling
  return {
    key: 'color_contrast',
    score: 70,
    weight: 0.045,
    applicable: true,
    severity: 'minor',
    findings: [{
      category: 'color_contrast',
      severity: 'minor',
      wcag: '1.4.3',
      message: 'Color contrast has not been verified (Phase 1 heuristic). Manual review or Phase 3 analysis recommended.',
    }],
  };
}

import type { DocumentSnapshot, ScoredCategory } from '../../../types.js';
import { CATEGORY_BASE_WEIGHTS } from '../../../config.js';

// Phase 1: heuristic only — no pixel sampling (too slow).
// Assumes moderate compliance for native documents. Phase 3 adds real sampling.
export function scoreColorContrast(snap: DocumentSnapshot): ScoredCategory {
  if (snap.pdfClass === 'scanned') {
    // Scanned images: contrast cannot be evaluated from PDF structure
    return {
      key: 'color_contrast',
      score: 100,
      weight: CATEGORY_BASE_WEIGHTS.color_contrast,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  // Phase 1: we do not sample pixels — contrast cannot be inferred from PDF structure alone.
  // Treat as N/A (weight redistributes) so the weighted total is not capped by a placeholder 70.
  return {
    key: 'color_contrast',
    score: 100,
    weight: CATEGORY_BASE_WEIGHTS.color_contrast,
    applicable: false,
    severity: 'pass',
    findings: [{
      category: 'color_contrast',
      severity: 'minor',
      wcag: '1.4.3',
      message: 'Color contrast was not evaluated (no pixel sampling in this build).',
    }],
  };
}

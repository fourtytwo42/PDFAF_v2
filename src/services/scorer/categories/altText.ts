import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import {
  ALT_TEXT_THRESHOLDS,
  ALT_TEXT_WEAK_ALT_MAX_DEDUCTION,
  ALT_TEXT_WEAK_ALT_PER_FIGURE,
  CATEGORY_BASE_WEIGHTS,
} from '../../../config.js';
import { isWeakFigureAlt } from '../altTextHeuristics.js';

export function scoreAltText(snap: DocumentSnapshot): ScoredCategory {
  const allFigures = snap.figures;
  const informativeFigures = allFigures.filter(f => !f.isArtifact);
  const otherMissing = snap.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0;
  const risks = snap.acrobatStyleAltRisks;
  const figureSignals = snap.detectionProfile?.figureSignals;
  const acrobatRiskTotal =
    (risks?.nonFigureWithAltCount ?? 0) +
    (risks?.nestedFigureAltCount ?? 0) +
    (risks?.orphanedAltEmptyElementCount ?? 0);

  if (informativeFigures.length === 0 && otherMissing === 0 && acrobatRiskTotal === 0) {
    return {
      key: 'alt_text',
      score: 100,
      weight: CATEGORY_BASE_WEIGHTS.alt_text,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  let figureScore = 100;
  if (informativeFigures.length > 0) {
    const withAlt = informativeFigures.filter(f => f.hasAlt && (f.altText?.trim() ?? '').length > 0);
    const ratio = withAlt.length / informativeFigures.length;
    if (ratio >= ALT_TEXT_THRESHOLDS.FULL) figureScore = 100;
    else if (ratio >= ALT_TEXT_THRESHOLDS.HIGH) figureScore = 85;
    else if (ratio >= ALT_TEXT_THRESHOLDS.MODERATE) figureScore = 60;
    else if (ratio >= ALT_TEXT_THRESHOLDS.LOW) figureScore = 20;
    else figureScore = 0;

    const weakAltFigures = informativeFigures.filter(f =>
      isWeakFigureAlt(f.altText, f.hasAlt),
    );
    if (weakAltFigures.length > 0) {
      const ded = Math.min(
        ALT_TEXT_WEAK_ALT_MAX_DEDUCTION,
        weakAltFigures.length * ALT_TEXT_WEAK_ALT_PER_FIGURE,
      );
      figureScore = Math.max(0, figureScore - ded);
    }
    if ((figureSignals?.nonFigureRoleCount ?? 0) > 0) {
      const nonFigureRoleCount = figureSignals?.nonFigureRoleCount ?? 0;
      figureScore = Math.min(figureScore, Math.max(0, 88 - nonFigureRoleCount * 8));
    }
    if (figureSignals?.treeFigureMissingForExtractedFigures) {
      figureScore = Math.min(figureScore, 45);
    }
  }

  let otherScore = 100;
  if (otherMissing > 0) {
    otherScore = Math.max(45, 100 - Math.min(55, otherMissing * 12));
  }

  let acrobatRiskPenalty = 0;
  if (acrobatRiskTotal > 0) {
    acrobatRiskPenalty = Math.min(50, 4 + acrobatRiskTotal * 4);
  }
  const score = Math.min(figureScore, otherScore, 100 - acrobatRiskPenalty);

  const findings: Finding[] = [];

  if (informativeFigures.length > 0) {
    const withoutAlt = informativeFigures.filter(f => !f.hasAlt || !(f.altText?.trim()));
    const ratio = withoutAlt.length / informativeFigures.length;
    if (withoutAlt.length > 0) {
      const severity = ratio > 0.5 ? 'critical' : ratio > 0.2 ? 'moderate' : 'minor';
      findings.push({
        category: 'alt_text',
        severity,
        wcag: '1.1.1',
        message: `${withoutAlt.length} of ${informativeFigures.length} image${informativeFigures.length !== 1 ? 's' : ''} lack alternative text.`,
        count: withoutAlt.length,
        page: withoutAlt[0]?.page,
      });
    }
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
    const weakAlt = informativeFigures.filter(f => isWeakFigureAlt(f.altText, f.hasAlt));
    if (weakAlt.length > 0) {
      findings.push({
        category: 'alt_text',
        severity: 'minor',
        wcag: '1.1.1',
        message: `${weakAlt.length} image(s) have generic, boilerplate, or low-signal alternate text (verify meaning for assistive technology).`,
        count: weakAlt.length,
      });
    }
  }

  if (otherMissing > 0) {
    findings.push({
      category: 'alt_text',
      severity: otherMissing > 8 ? 'moderate' : 'minor',
      wcag: '1.1.1',
      message: `${otherMissing} non-link annotation(s) lack /Contents (other elements alternate text).`,
      count: otherMissing,
    });
  }

  const nestedN = risks?.nestedFigureAltCount ?? 0;
  if (nestedN > 0) {
    findings.push({
      category: 'alt_text',
      severity: nestedN > 4 ? 'moderate' : 'minor',
      wcag: '1.1.1',
      message: `${nestedN} nested alternate text issue(s): /Figure carries alternate text while also containing child structure (nested / empty alt risk for assistive technology).`,
      count: nestedN,
    });
  }
  const orphanN = risks?.orphanedAltEmptyElementCount ?? 0;
  if (orphanN > 0) {
    findings.push({
      category: 'alt_text',
      severity: orphanN > 4 ? 'moderate' : 'minor',
      wcag: '1.1.1',
      message: `${orphanN} alternate text element(s) appear orphaned: /Alt or /ActualText is present but the node has no MCID, OBJR, or child structure (alternate text may never be read or may not be associated with visible content).`,
      count: orphanN,
    });
  }
  const nonFigN = risks?.nonFigureWithAltCount ?? 0;
  if (nonFigN > 0) {
    findings.push({
      category: 'alt_text',
      severity: nonFigN > 6 ? 'moderate' : 'minor',
      wcag: '1.1.1',
      message: `${nonFigN} non-Figure structure element(s) carry /Alt or /ActualText while also owning marked content or child structure (other elements alternate text pattern).`,
      count: nonFigN,
    });
  }

  if ((figureSignals?.nonFigureRoleCount ?? 0) > 0) {
    findings.push({
      category: 'alt_text',
      severity: (figureSignals?.nonFigureRoleCount ?? 0) > 2 ? 'moderate' : 'minor',
      wcag: '1.1.1',
      message: `${figureSignals?.nonFigureRoleCount} image structure element(s) use non-Figure roles (for example Word Shape/InlineShape), so alternate text may not be recognized by external PDF accessibility checkers.`,
      count: figureSignals?.nonFigureRoleCount,
    });
  }
  if (figureSignals?.treeFigureMissingForExtractedFigures) {
    findings.push({
      category: 'alt_text',
      severity: 'critical',
      wcag: '1.1.1',
      message: `Detected ${figureSignals.extractedFigureCount} figure-like structure element(s), but none are reachable as /Figure nodes in the exported structure tree.`,
      count: figureSignals.extractedFigureCount,
    });
  }

  return {
    key: 'alt_text',
    score,
    weight: CATEGORY_BASE_WEIGHTS.alt_text,
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

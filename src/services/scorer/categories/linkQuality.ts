import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import {
  CATEGORY_BASE_WEIGHTS,
  LINK_QUALITY_MISSING_STRUCT_PARENT_MAX_DEDUCTION,
  LINK_QUALITY_MISSING_STRUCT_PARENT_WEIGHT,
} from '../../../config.js';
import { isGenericLinkText, isRawUrlLinkText } from '../linkTextHeuristics.js';

export function scoreLinkQuality(snap: DocumentSnapshot): ScoredCategory {
  const annotationSignals = snap.detectionProfile?.annotationSignals ?? snap.annotationAccessibility;
  const structLinks = annotationSignals?.linkAnnotationsMissingStructure ?? 0;
  const linkMissingStructParent =
    annotationSignals?.linkAnnotationsMissingStructParent ?? 0;
  if (snap.links.length === 0 && structLinks === 0 && linkMissingStructParent === 0) {
    return {
      key: 'link_quality',
      score: 100,
      weight: CATEGORY_BASE_WEIGHTS.link_quality,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  const findings: Finding[] = [];
  let badCount = 0;

  for (const link of snap.links) {
    const raw = link.text.trim();
    if (!raw) {
      badCount++;
    } else if (isGenericLinkText(raw)) {
      badCount++;
    } else if (isRawUrlLinkText(raw)) {
      badCount++;
    }
  }

  const ratio =
    snap.links.length > 0 ? (snap.links.length - badCount) / snap.links.length : 1;
  let score = Math.round(ratio * 100);
  if (structLinks > 0) {
    score = Math.max(0, score - Math.min(15, structLinks * 3));
    findings.push({
      category: 'link_quality',
      severity: structLinks > 3 ? 'moderate' : 'minor',
      wcag: '2.4.4',
      message: `${structLinks} link annotation(s) are not associated with the structure tree (ParentTree / role), which also weakens reading-order confidence.`,
      count: structLinks,
    });
  }

  if (linkMissingStructParent > 0) {
    const d = Math.min(
      LINK_QUALITY_MISSING_STRUCT_PARENT_MAX_DEDUCTION,
      linkMissingStructParent * LINK_QUALITY_MISSING_STRUCT_PARENT_WEIGHT,
    );
    score = Math.max(0, score - d);
    findings.push({
      category: 'link_quality',
      severity: linkMissingStructParent > 5 ? 'moderate' : 'minor',
      wcag: '2.4.4',
      message: `${linkMissingStructParent} link annotation(s) are missing /StructParent (native link structure vs tab order).`,
      count: linkMissingStructParent,
    });
  }

  const badRatio = snap.links.length > 0 ? badCount / snap.links.length : 0;
  if (structLinks > 0 && linkMissingStructParent === 0 && score < 95 && badRatio <= 0.2) {
    score = Math.max(score, 95);
  }

  if (badCount > 0 && snap.links.length > 0) {
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
    weight: CATEGORY_BASE_WEIGHTS.link_quality,
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

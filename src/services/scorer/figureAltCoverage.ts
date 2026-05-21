import type { DocumentSnapshot } from '../../types.js';

function normalizeRole(value: unknown): string {
  return String(value ?? '').replace(/^\//, '').trim().toLowerCase();
}

function hasNonEmptyAlt(value: { hasAlt: boolean; altText?: string }): boolean {
  return value.hasAlt && Boolean(value.altText?.trim());
}

export function checkerVisibleFigureTargets(snapshot: DocumentSnapshot): NonNullable<DocumentSnapshot['checkerFigureTargets']> {
  return (snapshot.checkerFigureTargets ?? []).filter(target =>
    target.reachable &&
    !target.isArtifact &&
    normalizeRole(target.resolvedRole ?? target.role) === 'figure'
  );
}

export function checkerVisibleFiguresFullyAltOwned(snapshot: DocumentSnapshot): boolean {
  const targets = checkerVisibleFigureTargets(snapshot);
  return targets.length > 0 && targets.every(hasNonEmptyAlt);
}

export function hasCheckerVisibleFigureAltDebt(snapshot: DocumentSnapshot): boolean {
  const targets = checkerVisibleFigureTargets(snapshot);
  return targets.length > 0 && targets.some(target => !hasNonEmptyAlt(target));
}

export function treeFigureMissingRequiresAltCap(snapshot: DocumentSnapshot): boolean {
  return snapshot.detectionProfile?.figureSignals?.treeFigureMissingForExtractedFigures === true &&
    !checkerVisibleFiguresFullyAltOwned(snapshot);
}

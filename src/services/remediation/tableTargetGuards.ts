import type { DocumentSnapshot } from '../../types.js';

type SnapshotTable = DocumentSnapshot['tables'][number];

function normalizeRole(role: unknown): string | null {
  return typeof role === 'string' && role.trim()
    ? role.trim().replace(/^\//, '').toUpperCase()
    : null;
}

export function tableTargetRefsFromParams(params: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const single = params['structRef'] ?? params['targetRef'];
  if (typeof single === 'string' && single.length > 0) refs.push(single);
  const batch = params['structRefs'];
  if (Array.isArray(batch)) {
    for (const ref of batch) {
      if (typeof ref === 'string' && ref.length > 0) refs.push(ref);
    }
  }
  return [...new Set(refs)];
}

export function isRealRootReachableTableTarget(table: SnapshotTable): boolean {
  if (!table.structRef) return false;
  if (table.reachable === false) return false;

  const hasRawRole = Object.prototype.hasOwnProperty.call(table, 'rawRole');
  const rawRole = normalizeRole(table.rawRole);
  if (hasRawRole && rawRole !== 'TABLE') return false;

  const hasResolvedRole = Object.prototype.hasOwnProperty.call(table, 'resolvedRole');
  const resolvedRole = normalizeRole(table.resolvedRole);
  if (hasResolvedRole && resolvedRole !== 'TABLE') return false;

  return true;
}

export function tableHeaderParamsHaveRealRootReachableTargets(
  params: Record<string, unknown>,
  snapshot: DocumentSnapshot,
): boolean {
  const refs = tableTargetRefsFromParams(params);
  if (refs.length === 0) return false;
  const tablesByRef = new Map(
    snapshot.tables
      .filter(table => typeof table.structRef === 'string' && table.structRef.length > 0)
      .map(table => [table.structRef!, table]),
  );
  return refs.every(ref => {
    const table = tablesByRef.get(ref);
    return Boolean(table && isRealRootReachableTableTarget(table));
  });
}

import { describe, expect, it } from 'vitest';
import {
  isRealRootReachableTableTarget,
  tableHeaderParamsHaveRealRootReachableTargets,
  tableTargetRefsFromParams,
} from '../../src/services/remediation/tableTargetGuards.js';
import type { DocumentSnapshot } from '../../src/types.js';

function table(overrides: Partial<DocumentSnapshot['tables'][number]> = {}): DocumentSnapshot['tables'][number] {
  return {
    structRef: '10_0',
    rawRole: 'Table',
    resolvedRole: 'Table',
    reachable: true,
    hasHeaders: true,
    headerCount: 1,
    totalCells: 4,
    page: 0,
    ...overrides,
  };
}

describe('table target guards', () => {
  it('accepts real root-reachable table refs', () => {
    expect(isRealRootReachableTableTarget(table())).toBe(true);
  });

  it('blocks role-mapped non-table refs and roleless refs', () => {
    expect(isRealRootReachableTableTarget(table({ rawRole: 'Span', resolvedRole: 'Table' }))).toBe(false);
    expect(isRealRootReachableTableTarget(table({ rawRole: 'L', resolvedRole: 'Table' }))).toBe(false);
    expect(isRealRootReachableTableTarget(table({ rawRole: '', resolvedRole: 'Table' }))).toBe(false);
  });

  it('blocks unresolved or unreachable targets', () => {
    expect(isRealRootReachableTableTarget(table({ structRef: undefined }))).toBe(false);
    expect(isRealRootReachableTableTarget(table({ reachable: false }))).toBe(false);
  });

  it('allows older snapshots without role metadata so legacy diagnostics keep working', () => {
    const legacy = table({ rawRole: undefined, resolvedRole: undefined });
    delete legacy.rawRole;
    delete legacy.resolvedRole;
    expect(isRealRootReachableTableTarget(legacy)).toBe(true);
  });

  it('extracts unique table refs from single and batch params', () => {
    expect(tableTargetRefsFromParams({
      structRef: '10_0',
      targetRef: 'ignored_0',
      structRefs: ['11_0', '10_0', null],
    })).toEqual(['10_0', '11_0']);
  });

  it('requires header params to resolve to real root-reachable table refs', () => {
    const snapshot = {
      tables: [
        table({ structRef: '10_0' }),
        table({ structRef: '11_0', rawRole: 'Span', resolvedRole: 'Table' }),
        table({ structRef: '12_0', reachable: false }),
      ],
    } as DocumentSnapshot;
    expect(tableHeaderParamsHaveRealRootReachableTargets({ structRef: '10_0' }, snapshot)).toBe(true);
    expect(tableHeaderParamsHaveRealRootReachableTargets({ structRefs: ['10_0'] }, snapshot)).toBe(true);
    expect(tableHeaderParamsHaveRealRootReachableTargets({ structRefs: ['10_0', '11_0'] }, snapshot)).toBe(false);
    expect(tableHeaderParamsHaveRealRootReachableTargets({ structRef: '12_0' }, snapshot)).toBe(false);
    expect(tableHeaderParamsHaveRealRootReachableTargets({}, snapshot)).toBe(false);
  });
});

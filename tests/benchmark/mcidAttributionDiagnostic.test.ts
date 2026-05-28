import { describe, expect, it } from 'vitest';
import {
  classifyMcidAttribution,
  parseArgs,
} from '../../scripts/mcid-attribution-diagnostic.js';

describe('mcid attribution diagnostic classification', () => {
  it('classifies current collector misses when stable traversal references current orphans', () => {
    expect(classifyMcidAttribution({
      currentOrphanMcidCount: 30,
      stableOrphanMcidCount: 26,
      currentOrphanStableReferencedCount: 4,
      stableRefOnlyCount: 12,
      currentRefOnlyCount: 0,
    })).toEqual({
      classification: 'current_collector_misses_stable_refs',
      reasons: ['current_orphan_stable_referenced:4'],
    });
  });

  it('classifies stable traversal debt changes without direct orphan contradiction', () => {
    expect(classifyMcidAttribution({
      currentOrphanMcidCount: 30,
      stableOrphanMcidCount: 16,
      currentOrphanStableReferencedCount: 0,
      stableRefOnlyCount: 14,
      currentRefOnlyCount: 0,
    }).classification).toBe('stable_traversal_changes_debt');
  });

  it('classifies matching traversal as stable', () => {
    expect(classifyMcidAttribution({
      currentOrphanMcidCount: 0,
      stableOrphanMcidCount: 0,
      currentOrphanStableReferencedCount: 0,
      stableRefOnlyCount: 0,
      currentRefOnlyCount: 0,
    })).toEqual({
      classification: 'stable_matches_current',
      reasons: ['stable_and_current_traversal_match'],
    });
  });

  it('parses pdf, output, and control arguments', () => {
    const args = parseArgs([
      '--pdf', '/tmp/a.pdf',
      '--pdf', '/tmp/b.pdf',
      '--out', '/tmp/out',
      '--control', 'b.pdf',
    ], new Date('2026-05-28T00:00:00Z'));

    expect(args.pdfs).toEqual(['/tmp/a.pdf', '/tmp/b.pdf']);
    expect(args.outDir).toBe('/tmp/out');
    expect(args.controls.has('b')).toBe(true);
  });
});

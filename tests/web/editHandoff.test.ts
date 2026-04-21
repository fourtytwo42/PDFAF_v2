import { describe, expect, it } from 'vitest';
import { chooseEditorHandoffSource } from '../../apps/pdf-af-web/lib/editor/editHandoff';

describe('edit handoff source selection', () => {
  it('prefers fixed output when it is available', () => {
    expect(chooseEditorHandoffSource({ fileStatus: 'available', hasServerSource: true })).toBe(
      'fixed',
    );
  });

  it('falls back to saved source when no fixed output exists', () => {
    expect(chooseEditorHandoffSource({ fileStatus: 'none', hasServerSource: true })).toBe(
      'source',
    );
  });

  it('reports unavailable when no saved PDF can be opened', () => {
    expect(chooseEditorHandoffSource({ fileStatus: 'expired', hasServerSource: false })).toBe(
      'unavailable',
    );
  });
});

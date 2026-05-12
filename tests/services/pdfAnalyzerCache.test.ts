import { describe, expect, it } from 'vitest';
import { analysisCacheKey } from '../../src/services/pdfAnalyzer.js';

describe('pdf analyzer cache keys', () => {
  it('keeps identical PDF bytes separate when filenames differ', () => {
    const hash = 'abc123';
    expect(analysisCacheKey(hash, 'source-title.pdf')).not.toBe(
      analysisCacheKey(hash, 'fallback-title.pdf'),
    );
  });

  it('keeps repeated analyses cacheable for the same hash and filename', () => {
    expect(analysisCacheKey('abc123', 'same.pdf')).toBe(analysisCacheKey('abc123', 'same.pdf'));
  });
});

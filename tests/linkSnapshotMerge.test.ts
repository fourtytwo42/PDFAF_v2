import { describe, expect, it } from 'vitest';
import { buildSnapshotLinks } from '../src/services/pdfAnalyzer.js';

describe('buildSnapshotLinks', () => {
  it('keeps pdfjs links when Python produced no rows', () => {
    const pdfjs = [{ text: 'x', url: 'https://a.test/', page: 1 }];
    expect(buildSnapshotLinks(pdfjs, undefined)).toEqual(pdfjs);
    expect(buildSnapshotLinks(pdfjs, [])).toEqual(pdfjs);
  });

  it('prefers Python-derived labels for scoring (full-document link scan)', () => {
    const rows = [
      { page: 2, url: 'https://b.test/doc', effectiveText: 'Web link (b.test) — doc' },
    ];
    const pdfjs = [{ text: 'https://b.test/doc', url: 'https://b.test/doc', page: 2 }];
    const merged = buildSnapshotLinks(pdfjs, rows);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe('Web link (b.test) — doc');
  });

  it('appends pdfjs-only links not present in Python rows', () => {
    const rows = [{ page: 0, url: 'https://a/', effectiveText: 'A' }];
    const pdfjs = [
      { text: 'https://a/', url: 'https://a/', page: 0 },
      { text: '', url: 'https://orphan/', page: 3 },
    ];
    const merged = buildSnapshotLinks(pdfjs, rows);
    expect(merged).toHaveLength(2);
    expect(merged.find(l => l.url === 'https://orphan/')).toMatchObject({
      page: 3,
      url: 'https://orphan/',
    });
  });
});

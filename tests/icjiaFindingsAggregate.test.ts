import { describe, expect, it } from 'vitest';
import { aggregateIcjiaFiles } from '../src/services/compliance/icjiaFindingsAggregate.js';

describe('aggregateIcjiaFiles', () => {
  it('aggregates category scores and keyword hits', () => {
    const agg = aggregateIcjiaFiles([
      {
        filename: 'a.pdf',
        overallScore: 50,
        categories: [
          {
            id: 'text_extractability',
            score: 40,
            findings: ['Document is NOT tagged — no StructTreeRoot found', 'font embedding'],
          },
          { id: 'title_language', score: 60, findings: ['No document title'] },
        ],
      },
      {
        filename: 'b.pdf',
        overallScore: 90,
        categories: [{ id: 'text_extractability', score: 80, findings: ['heading structure'] }],
      },
    ]);

    expect(agg.fileCount).toBe(2);
    expect(agg.overallMin).toBe(50);
    expect(agg.overallMax).toBe(90);
    expect(agg.overallAvg).toBeCloseTo(70, 5);
    expect(agg.byCategoryId['text_extractability']?.n).toBe(2);
    expect(agg.byCategoryId['text_extractability']?.sumScore).toBe(120);
    const structHit = agg.keywordHits.find(k => k.keyword === 'structtreeroot');
    expect(structHit?.count).toBeGreaterThanOrEqual(1);
  });
});

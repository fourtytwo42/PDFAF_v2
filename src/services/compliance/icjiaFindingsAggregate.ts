/**
 * Offline aggregation of ICIJA audit JSON (e.g. under Output/.../icjia_api_raw).
 */

export interface IcjiaFileSummary {
  filename?: string;
  overallScore?: number;
  grade?: string;
  categories?: Array<{
    id?: string;
    label?: string;
    score?: number | null;
    findings?: string[];
  }>;
}

const DEFAULT_KEYWORDS = [
  'StructTreeRoot',
  'heading',
  'bookmark',
  'Alt',
  'font',
  'title',
  'tagged',
  'reading order',
  'table',
] as const;

export function aggregateIcjiaFiles(
  files: IcjiaFileSummary[],
  keywords: readonly string[] = DEFAULT_KEYWORDS,
): {
  fileCount: number;
  overallMin: number | null;
  overallMax: number | null;
  overallAvg: number | null;
  byCategoryId: Record<string, { n: number; sumScore: number; scoreCount: number }>;
  keywordHits: Array<{ keyword: string; count: number }>;
} {
  const scores = files
    .map(f => f.overallScore)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  const overallMin = scores.length ? Math.min(...scores) : null;
  const overallMax = scores.length ? Math.max(...scores) : null;
  const overallAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const byCategoryId: Record<string, { n: number; sumScore: number; scoreCount: number }> = {};
  for (const f of files) {
    for (const c of f.categories ?? []) {
      const id = c.id;
      if (!id) continue;
      if (!byCategoryId[id]) byCategoryId[id] = { n: 0, sumScore: 0, scoreCount: 0 };
      byCategoryId[id]!.n += 1;
      if (typeof c.score === 'number' && Number.isFinite(c.score)) {
        byCategoryId[id]!.sumScore += c.score;
        byCategoryId[id]!.scoreCount += 1;
      }
    }
  }

  const kwLower = keywords.map(k => k.toLowerCase());
  const keywordHits = kwLower.map(k => ({ keyword: k, count: 0 }));
  for (const f of files) {
    for (const c of f.categories ?? []) {
      const text = (c.findings ?? []).join('\n').toLowerCase();
      for (let i = 0; i < kwLower.length; i++) {
        if (text.includes(kwLower[i]!)) keywordHits[i]!.count += 1;
      }
    }
  }

  return {
    fileCount: files.length,
    overallMin,
    overallMax,
    overallAvg,
    byCategoryId,
    keywordHits: keywordHits.map(({ keyword, count }) => ({ keyword, count })),
  };
}

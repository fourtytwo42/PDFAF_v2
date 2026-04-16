/**
 * Aggregate ICIJA API JSON files (default: Output/corpus_1_2_icjia_run/icjia_api_raw).
 *
 * Usage:
 *   pnpm exec tsx scripts/icjia-aggregate-findings.ts [icjiaRawDir]
 *
 * Writes icjia_findings_aggregate.json next to the raw dir and prints a short summary to stdout.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aggregateIcjiaFiles, type IcjiaFileSummary } from '../src/services/compliance/icjiaFindingsAggregate.js';

async function main(): Promise<void> {
  const raw =
    process.argv[2] ??
    join(process.cwd(), 'Output', 'corpus_1_2_icjia_run', 'icjia_api_raw');
  let names: string[];
  try {
    names = (await readdir(raw)).filter(f => f.endsWith('.json')).sort();
  } catch (e) {
    console.error(`Cannot read directory: ${raw} (${(e as Error).message})`);
    process.exit(1);
    return;
  }

  const files: IcjiaFileSummary[] = [];
  for (const n of names) {
    try {
      const text = await readFile(join(raw, n), 'utf8');
      files.push(JSON.parse(text) as IcjiaFileSummary);
    } catch {
      // skip malformed
    }
  }

  const agg = aggregateIcjiaFiles(files);
  const outPath = join(raw, '..', 'icjia_findings_aggregate.json');
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceDir: raw,
        ...agg,
        categoryAverages: Object.fromEntries(
          Object.entries(agg.byCategoryId).map(([id, v]) => [
            id,
            v.scoreCount > 0 ? Math.round((v.sumScore / v.scoreCount) * 10) / 10 : null,
          ]),
        ),
      },
      null,
      2,
    ),
  );

  console.log(`Files: ${agg.fileCount} | overall avg: ${agg.overallAvg?.toFixed(1) ?? '—'} (min ${agg.overallMin ?? '—'} max ${agg.overallMax ?? '—'})`);
  console.log(`Wrote ${outPath}`);
  const topKw = [...agg.keywordHits].sort((a, b) => b.count - a.count).slice(0, 8);
  console.log('Top finding keywords (substring hits per category findings):');
  for (const k of topKw) console.log(`  ${k.keyword}: ${k.count}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

/**
 * Assert aggregate Adobe failure counts stay under thresholds (CI gate).
 *
 * Usage:
 *   pnpm exec tsx scripts/adobe-accreport-assert-thresholds.ts [aggregatePath] [thresholdsPath]
 * Defaults: Output/adobe_grade/adobe_failures_aggregate.json, tests/fixtures/adobe_anchor_thresholds.json
 *
 * Exit 1 if any anchor frequency exceeds max; exit 0 otherwise.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function main(): Promise<void> {
  const root = process.cwd();
  const aggPath = process.argv[2] ?? join(root, 'Output', 'adobe_grade', 'adobe_failures_aggregate.json');
  const thrPath = process.argv[3] ?? join(root, 'tests', 'fixtures', 'adobe_anchor_thresholds.json');
  const rawAgg = await readFile(aggPath, 'utf8').catch(() => '');
  if (!rawAgg.trim()) {
    if (process.env.ADOBE_AGGREGATE_REQUIRED === '1') {
      console.error('Missing aggregate file:', aggPath, '(run pnpm adobe:ingest-reports first)');
      process.exit(2);
    }
    console.warn('Skip Adobe threshold check (no aggregate):', aggPath);
    process.exit(0);
  }
  const agg = JSON.parse(rawAgg) as {
    failedAnchorFrequency?: Array<{ anchor: string; count: number }>;
  };
  const thrRaw = await readFile(thrPath, 'utf8');
  const thresholds = JSON.parse(thrRaw) as Record<string, number>;
  const freq = agg.failedAnchorFrequency ?? [];
  const errors: string[] = [];
  for (const row of freq) {
    const max = thresholds[row.anchor];
    if (max === undefined || typeof max !== 'number') continue;
    if (row.count > max) {
      errors.push(`${row.anchor}: ${row.count} > max ${max}`);
    }
  }
  if (errors.length) {
    console.error('Adobe aggregate thresholds exceeded:\n', errors.join('\n'));
    process.exit(1);
  }
  console.log('Adobe aggregate within thresholds:', aggPath);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

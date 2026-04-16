/**
 * Aggregate Adobe Acrobat *.accreport.html files into JSON for CI / parity tracking.
 *
 * Usage:
 *   pnpm exec tsx scripts/adobe-accreport-ingest.ts [reportsDir]
 * Default reportsDir: Output/adobe_grade
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  failedAdobeAnchors,
  parseAdobeAccessibilityReportHtml,
} from '../src/services/compliance/parseAdobeAccreportHtml.js';
import { parityForAdobeAnchor } from '../src/services/compliance/adobeCheckerParity.js';

async function main(): Promise<void> {
  const dir = process.argv[2] ?? join(process.cwd(), 'Output', 'adobe_grade');
  const names = (await readdir(dir))
    .filter(f => f.toLowerCase().endsWith('.accreport.html'))
    .sort();
  if (names.length === 0) {
    console.error('No *.accreport.html in', dir);
    process.exit(1);
  }

  const files: Array<{
    file: string;
    failedAnchors: string[];
    failedRows: Array<{ anchor: string; ruleName: string; description: string }>;
    summaryFailed: number | null;
  }> = [];

  const anchorCounts = new Map<string, number>();

  for (const name of names) {
    const html = await readFile(join(dir, name), 'utf8');
    const rep = parseAdobeAccessibilityReportHtml(html);
    const failed = rep.rows.filter(r => r.status === 'Failed');
    for (const r of failed) {
      anchorCounts.set(r.anchor, (anchorCounts.get(r.anchor) ?? 0) + 1);
    }
    files.push({
      file: name,
      failedAnchors: failedAdobeAnchors(rep),
      failedRows: failed.map(r => ({
        anchor: r.anchor,
        ruleName: r.ruleName,
        description: r.description,
      })),
      summaryFailed: rep.summary?.failed ?? null,
    });
  }

  const byAnchor = [...anchorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([anchor, count]) => ({
      anchor,
      count,
      parity: parityForAdobeAnchor(anchor)?.parity ?? 'unknown',
    }));

  const out = {
    generatedAt: new Date().toISOString(),
    reportsDir: dir,
    fileCount: names.length,
    files,
    failedAnchorFrequency: byAnchor,
  };

  const outPath = join(dir, 'adobe_failures_aggregate.json');
  await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log('Top failed anchors:', byAnchor.slice(0, 8));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

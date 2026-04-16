/**
 * Re-submit remediated PDFs to ICIJA when the batch recorded a failed audit
 * (e.g. HTTP **429**), then refresh `icjia_api_raw/*.json`, `icjia_batch_results.json`,
 * and `CORPUS_ICJIA_REPORT.md`.
 *
 * Usage:
 *   pnpm exec tsx scripts/icjia-retry-failed-audits.ts [batchDir]
 *
 * Default **batchDir**: `Output/corpus_1_2_icjia_run`
 *
 * Flags:
 *   `--all-failed` — retry any row with `icjia.ok === false` (not only 429)
 *
 * Environment: same as corpus batch (`PDFAF_ICJIA_ANALYZE_URL`, `PDFAF_ICJIA_MIN_INTERVAL_MS`,
 * `PDFAF_ICJIA_429_*`, `PDFAF_ICJIA_RETRY_AFTER_CAP_MS`).
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DEFAULT_ICJIA_URL, postIcjiaAnalyze, parseIcjiaMinIntervalMs, sleep } from './icjia-api-client.js';
import { buildCorpusReportMd } from './icjia-corpus-report-md.js';

interface BatchJson {
  generatedAt?: string;
  localTargetScore?: number;
  icjiaUrl?: string | null;
  icjiaMinIntervalMs?: number | null;
  useSemantic?: boolean;
  results?: Array<{
    corpus: string;
    file: string;
    error?: string;
    scoreBefore: number;
    scoreAfter: number;
    metLocalTarget: boolean;
    semanticRan: boolean;
    outPdf?: string;
    durationMs: number;
    pdfafLocalPath?: string;
    icjiaRawPath?: string;
    localCategories?: Record<string, number | null>;
    icjia?: {
      overallScore?: number;
      grade?: string;
      ok: boolean;
      httpStatus: number;
      errorText?: string;
      categoryScores?: Record<string, number | null>;
      executiveSummary?: string;
    };
  }>;
}

function needsIcjiaRetry(
  row: NonNullable<BatchJson['results']>[number],
  allFailed: boolean,
): boolean {
  if (row.error || !row.outPdf) return false;
  if (!row.icjia) return true;
  if (allFailed) return !row.icjia.ok;
  return !row.icjia.ok && row.icjia.httpStatus === 429;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pos = argv.filter(a => !a.startsWith('-'));
  const batchDir = pos[0] ?? join(process.cwd(), 'Output', 'corpus_1_2_icjia_run');
  const allFailed = argv.includes('--all-failed');

  const icjiaUrl = (process.env['PDFAF_ICJIA_ANALYZE_URL'] ?? DEFAULT_ICJIA_URL).trim() || DEFAULT_ICJIA_URL;
  const icjiaIntervalMs = parseIcjiaMinIntervalMs();

  const batchPath = join(batchDir, 'icjia_batch_results.json');
  const raw = await readFile(batchPath, 'utf8');
  const batch = JSON.parse(raw) as BatchJson;
  const results = batch.results ?? [];
  if (results.length === 0) {
    console.error(`No results in ${batchPath}`);
    process.exit(1);
  }

  const toRetry = results
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => needsIcjiaRetry(row, allFailed));

  if (toRetry.length === 0) {
    console.log(`No rows need ICIJA retry in ${batchDir} (--all-failed: ${allFailed})`);
    process.exit(0);
  }

  console.log(
    `Retrying ICIJA for ${toRetry.length} file(s) in ${batchDir} | interval ${icjiaIntervalMs}ms | URL ${icjiaUrl}`,
  );
  await mkdir(join(batchDir, 'icjia_api_raw'), { recursive: true });

  let lastIcjiaAt = 0;
  const tRetry0 = Date.now();

  for (const { row, i } of toRetry) {
    const pdfPath = join(batchDir, row.outPdf!);
    const buf = await readFile(pdfPath);
    const uploadName = basename(row.outPdf!);

    const now = Date.now();
    const wait = Math.max(0, icjiaIntervalMs - (now - lastIcjiaAt));
    if (wait > 0 && lastIcjiaAt > 0) await sleep(wait);
    lastIcjiaAt = Date.now();

    const icjia = await postIcjiaAnalyze(icjiaUrl, buf, uploadName);
    const stem = uploadName.replace(/_remediated\.pdf$/i, '');
    const icjiaRel = join('icjia_api_raw', `${stem}_icjia.json`);
    const icjiaAbs = join(batchDir, icjiaRel);
    try {
      const pretty = JSON.stringify(JSON.parse(icjia.rawBody), null, 2);
      await writeFile(icjiaAbs, pretty);
    } catch {
      await writeFile(
        icjiaAbs,
        JSON.stringify(
          {
            parseError: true,
            httpStatus: icjia.status,
            errorText: icjia.errorText,
            rawBodyPreview: icjia.rawBody.slice(0, 50_000),
          },
          null,
          2,
        ),
      );
    }

    const catScores: Record<string, number | null> = {};
    if (icjia.json?.categories) {
      for (const c of icjia.json.categories) {
        const id = c.id;
        if (id) catScores[id] = c.score ?? null;
      }
    }

    results[i] = {
      ...row,
      icjiaRawPath: icjiaRel.replace(/\\/g, '/'),
      icjia: {
        ok: icjia.ok,
        httpStatus: icjia.status,
        overallScore: icjia.json?.overallScore,
        grade: icjia.json?.grade,
        errorText: icjia.errorText,
        categoryScores: catScores,
        executiveSummary: icjia.json?.executiveSummary,
      },
    };

    const line = icjia.ok
      ? `OK ICIJA ${icjia.json?.overallScore ?? '?'} grade=${icjia.json?.grade ?? '?'}`
      : `ERR http=${icjia.status}`;
    console.log(`[${row.corpus}/${row.file}] ${line}`);
  }

  const icjiaMet95 = results.filter(
    r => r.icjia?.ok && typeof r.icjia.overallScore === 'number' && r.icjia.overallScore >= 95,
  ).length;

  const generatedAt = new Date().toISOString();
  const outJson = {
    ...batch,
    generatedAt,
    icjiaRetriedAt: generatedAt,
    icjiaRetryDurationMs: Date.now() - tRetry0,
    icjiaUrl,
    icjiaMinIntervalMs: icjiaIntervalMs,
    icjiaMet95Count: icjiaMet95,
    results,
  };
  await writeFile(join(batchDir, 'icjia_batch_results.json'), JSON.stringify(outJson, null, 2));

  const reportMd = buildCorpusReportMd({
    outRoot: batchDir,
    generatedAt,
    batchTarget: batch.localTargetScore ?? 95,
    icjiaUrl,
    icjiaIntervalMs,
    useSemantic: Boolean(batch.useSemantic),
    skipIcjia: false,
    results,
    subtitleNote: `**Note:** ICIJA re-audit pass for ${toRetry.length} file(s) that previously failed (${allFailed ? 'all non-OK' : 'HTTP 429'}).`,
  });
  await writeFile(join(batchDir, 'CORPUS_ICJIA_REPORT.md'), reportMd);

  console.log(`Updated ${batchPath} and CORPUS_ICJIA_REPORT.md`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

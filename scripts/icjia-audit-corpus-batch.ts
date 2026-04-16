/**
 * Process **Input/corpus_1** and **Input/corpus_2**: remediate toward a local score target,
 * then grade each output PDF with **POST** multipart to the ICIJA audit API (default
 * `https://audit.icjia.app/api/analyze`, field name **`file`**).
 *
 * Usage:
 *   pnpm exec tsx scripts/icjia-audit-corpus-batch.ts [outputDir]
 *
 * Flags: `--no-semantic`, `--skip-icjia` (remediate only; no HTTP to ICIJA).
 *
 * Outputs (under output dir):
 *   - `*_remediated.pdf` — final PDFs
 *   - `pdfaf_local/*.json` — PDFAF post-remediation scores (inspect local vs ICIJA)
 *   - `icjia_api_raw/*.json` — full ICIJA API JSON (findings, categories, executiveSummary)
 *   - `icjia_batch_results.json` — machine summary + paths
 *   - `CORPUS_ICJIA_REPORT.md` — human-readable report
 *
 * Environment:
 *   PDFAF_ICJIA_ANALYZE_URL — default `https://audit.icjia.app/api/analyze`
 *   PDFAF_ICJIA_MIN_INTERVAL_MS — minimum spacing between audit HTTP calls (default **15000** ≈ 4/minute)
 *   PDFAF_ICJIA_429_MAX_RETRIES — on HTTP 429, wait and retry (default **8**)
 *   PDFAF_ICJIA_429_WAIT_MS — base wait if no Retry-After header (default **90000** ms)
 *   PDFAF_ICJIA_RETRY_AFTER_CAP_MS — max wait per 429 when server sends huge `Retry-After` (default **300000**)
 *   PDFAF_ICJIA_MAX_FILES — if set > 0, only process that many PDFs (after sort) for dry runs
 *   PDFAF_ICJIA_BATCH_TARGET_SCORE — local PDFAF target before audit (default **95**)
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AppliedRemediationTool, SemanticRemediationSummary } from '../src/types.js';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';
import { DEFAULT_ICJIA_URL, postIcjiaAnalyze, parseIcjiaMinIntervalMs, sleep } from './icjia-api-client.js';
import { buildCorpusReportMd } from './icjia-corpus-report-md.js';

const CORPUS_DIRS: Array<{ label: string; dir: string }> = [
  { label: 'corpus_1', dir: join(process.cwd(), 'Input', 'corpus_1') },
  { label: 'corpus_2', dir: join(process.cwd(), 'Input', 'corpus_2') },
];

const SEMANTIC_TIMEOUT_MS = 600_000;

function safeBase(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

async function probeOpenAiCompatServer(): Promise<boolean> {
  const baseRaw = (process.env['OPENAI_COMPAT_BASE_URL'] ?? '').trim().replace(/\/$/, '');
  if (!baseRaw) return false;
  const url = `${baseRaw}/models`;
  const key = (process.env['OPENAI_COMPAT_API_KEY'] ?? '').trim() || 'local';
  const headers: Record<string, string> = {};
  if (key) headers['Authorization'] = `Bearer ${key}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const j = (await res.json()) as { data?: Array<{ id?: string }> };
    const id = j.data?.[0]?.id;
    if (id) process.env['OPENAI_COMPAT_MODEL'] = id;
    return true;
  } catch {
    return false;
  }
}

function parseLocalTarget(): number {
  const raw = parseInt(process.env['PDFAF_ICJIA_BATCH_TARGET_SCORE'] ?? '95', 10);
  if (Number.isFinite(raw) && raw >= 80 && raw <= 100) return raw;
  return 95;
}

function parseMaxFiles(): number {
  const raw = (process.env['PDFAF_ICJIA_MAX_FILES'] ?? '').trim();
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pos = argv.filter(a => !a.startsWith('-'));
  const outRoot = pos[0] ?? join(process.cwd(), 'Output', 'icjia_corpus_pass');
  const forceNoSemantic = argv.includes('--no-semantic');
  const skipIcjia = argv.includes('--skip-icjia');

  if (process.env['PDFAF_RUN_LOCAL_LLM'] === '1' && !(process.env['OPENAI_COMPAT_BASE_URL'] ?? '').trim()) {
    const p = process.env['PDFAF_LLAMA_PORT'] ?? '1234';
    process.env['OPENAI_COMPAT_BASE_URL'] = `http://127.0.0.1:${p}/v1`;
    if (!(process.env['OPENAI_COMPAT_API_KEY'] ?? '').trim()) {
      process.env['OPENAI_COMPAT_API_KEY'] = 'local';
    }
  }

  const {
    getOpenAiCompatBaseUrl,
    SEMANTIC_REMEDIATE_FIGURE_PASSES,
    SEMANTIC_REMEDIATE_PROMOTE_PASSES,
  } = await import('../src/config.js');

  const batchTarget = parseLocalTarget();
  const maxFiles = parseMaxFiles();
  const icjiaUrl = (process.env['PDFAF_ICJIA_ANALYZE_URL'] ?? DEFAULT_ICJIA_URL).trim() || DEFAULT_ICJIA_URL;
  const icjiaIntervalMs = skipIcjia ? 0 : parseIcjiaMinIntervalMs();

  const llmUp = forceNoSemantic ? false : await probeOpenAiCompatServer();
  const useSemantic = !forceNoSemantic && llmUp;

  const floorEnvInt = (key: string, minVal: number) => {
    const raw = (process.env[key] ?? '').trim();
    const n = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(n) || n < minVal) process.env[key] = String(minVal);
  };
  if (useSemantic) {
    floorEnvInt('SEMANTIC_MAX_PROMOTE_CANDIDATES', 200);
    floorEnvInt('SEMANTIC_MAX_FIGURE_CANDIDATES', 400);
    if (process.env['PDFAF_SEMANTIC_UNTAGGED_TIER2'] !== '0') {
      process.env['PDFAF_SEMANTIC_UNTAGGED_TIER2'] = '1';
    }
  } else {
    floorEnvInt('SEMANTIC_MAX_PROMOTE_CANDIDATES', 80);
    floorEnvInt('SEMANTIC_MAX_FIGURE_CANDIDATES', 96);
  }

  const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');
  const { remediatePdf } = await import('../src/services/remediation/orchestrator.js');
  const { applyPostRemediationAltRepair } = await import('../src/services/remediation/altStructureRepair.js');
  const { applySemanticRepairs } = await import('../src/services/semantic/semanticService.js');
  const { applySemanticHeadingRepairs } = await import('../src/services/semantic/headingSemantic.js');
  const { applySemanticPromoteHeadingRepairs } = await import('../src/services/semantic/promoteHeadingSemantic.js');
  const { applySemanticUntaggedHeadingRepairs } = await import('../src/services/semantic/untaggedHeadingSemantic.js');
  const { mergeSequentialSemanticSummaries } = await import('../src/routes/remediate.js');

  await mkdir(outRoot, { recursive: true });
  const dirPdfafLocal = join(outRoot, 'pdfaf_local');
  const dirIcjiaRaw = join(outRoot, 'icjia_api_raw');
  await mkdir(dirPdfafLocal, { recursive: true });
  await mkdir(dirIcjiaRaw, { recursive: true });

  const jobs: Array<{ corpus: string; file: string; path: string }> = [];
  for (const { label, dir } of CORPUS_DIRS) {
    let names: string[];
    try {
      names = (await readdir(dir))
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      console.warn(`Skip missing dir: ${dir}`);
      continue;
    }
    for (const name of names) {
      jobs.push({ corpus: label, file: name, path: join(dir, name) });
    }
  }

  const jobsToRun = maxFiles > 0 ? jobs.slice(0, maxFiles) : jobs;
  if (maxFiles > 0 && jobs.length > jobsToRun.length) {
    console.log(`PDFAF_ICJIA_MAX_FILES=${maxFiles}: running ${jobsToRun.length} of ${jobs.length} job(s)`);
  }

  console.log(
    `Jobs: ${jobsToRun.length} | local target >= ${batchTarget} | semantic: ${useSemantic ? 'on' : 'off'} | ICIJA: ${skipIcjia ? 'skipped' : icjiaUrl} | interval: ${skipIcjia ? 'n/a' : `${icjiaIntervalMs}ms`}`,
  );

  const semanticAbort = new AbortController();
  const signal = semanticAbort.signal;

  let lastIcjiaAt = 0;

  const results: Array<{
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
  }> = [];

  for (const job of jobsToRun) {
    const t0 = Date.now();
    const name = job.file;
    const base = `${job.corpus}__${safeBase(name.replace(/\.pdf$/i, ''))}`;
    const row: (typeof results)[number] = {
      corpus: job.corpus,
      file: name,
      scoreBefore: 0,
      scoreAfter: 0,
      metLocalTarget: false,
      semanticRan: false,
      durationMs: 0,
    };

    try {
      const buf = await readFile(job.path);
      const tmpPath = join(tmpdir(), `pdfaf-icjia-${randomUUID()}.pdf`);
      await writeFile(tmpPath, buf);
      const { result, snapshot } = await analyzePdf(tmpPath, name);
      await unlink(tmpPath).catch(() => {});

      row.scoreBefore = result.score;

      const memDb = new Database(':memory:');
      initSchema(memDb);
      const playbookStore = createPlaybookStore(memDb);
      const toolOutcomeStore = createToolOutcomeStore(memDb);

      const allApplied: AppliedRemediationTool[] = [];

      let { remediation, buffer: outBuf, snapshot: outSnap } = await remediatePdf(buf, name, result, snapshot, {
        maxRounds: 12,
        targetScore: batchTarget,
        playbookStore,
        toolOutcomeStore,
      });
      let outAfter = remediation.after;
      allApplied.push(...remediation.appliedTools);

      if (outSnap.isTagged && outAfter.score < batchTarget) {
        const ar = await applyPostRemediationAltRepair(outBuf, name, outAfter, outSnap, { signal });
        outBuf = ar.buffer;
        outAfter = ar.analysis;
        outSnap = ar.snapshot;
      }

      if (outAfter.score < batchTarget) {
        const memDb2 = new Database(':memory:');
        initSchema(memDb2);
        const r2 = await remediatePdf(outBuf, name, outAfter, outSnap, {
          maxRounds: 12,
          targetScore: batchTarget,
          playbookStore: createPlaybookStore(memDb2),
          toolOutcomeStore: createToolOutcomeStore(memDb2),
        });
        memDb2.close();
        if (r2.remediation.after.score >= outAfter.score) {
          outBuf = r2.buffer;
          outAfter = r2.remediation.after;
          outSnap = r2.snapshot;
          allApplied.push(...r2.remediation.appliedTools);
        }
        if (outSnap.isTagged && outAfter.score < batchTarget) {
          const ar2 = await applyPostRemediationAltRepair(outBuf, name, outAfter, outSnap, { signal });
          outBuf = ar2.buffer;
          outAfter = ar2.analysis;
          outSnap = ar2.snapshot;
        }
      }

      if (outAfter.score < batchTarget) {
        const memDb3 = new Database(':memory:');
        initSchema(memDb3);
        const r3 = await remediatePdf(outBuf, name, outAfter, outSnap, {
          maxRounds: 12,
          targetScore: batchTarget,
          playbookStore: createPlaybookStore(memDb3),
          toolOutcomeStore: createToolOutcomeStore(memDb3),
        });
        memDb3.close();
        if (r3.remediation.after.score >= outAfter.score) {
          outBuf = r3.buffer;
          outAfter = r3.remediation.after;
          outSnap = r3.snapshot;
          allApplied.push(...r3.remediation.appliedTools);
        }
        if (outSnap.isTagged && outAfter.score < batchTarget) {
          const ar3 = await applyPostRemediationAltRepair(outBuf, name, outAfter, outSnap, { signal });
          outBuf = ar3.buffer;
          outAfter = ar3.analysis;
          outSnap = ar3.snapshot;
        }
      }

      memDb.close();

      const llm = getOpenAiCompatBaseUrl();
      if (useSemantic && outAfter.score < batchTarget && llm) {
        row.semanticRan = true;
        const opts = { timeoutMs: SEMANTIC_TIMEOUT_MS, signal };

        const runSemanticWave = async (): Promise<void> => {
          const scoreFig = outAfter.score;
          const figureParts: SemanticRemediationSummary[] = [];
          for (let pass = 0; pass < SEMANTIC_REMEDIATE_FIGURE_PASSES; pass++) {
            const sem = await applySemanticRepairs({
              buffer: outBuf,
              filename: name,
              analysis: outAfter,
              snapshot: outSnap,
              options: opts,
            });
            figureParts.push(sem.summary);
            outBuf = sem.buffer;
            outAfter = sem.analysis;
            outSnap = sem.snapshot;
            if (sem.summary.skippedReason !== 'completed') break;
            if (sem.summary.proposalsAccepted === 0) break;
          }
          mergeSequentialSemanticSummaries(scoreFig, figureParts);

          const scorePr = outAfter.score;
          const promoteParts: SemanticRemediationSummary[] = [];
          for (let pass = 0; pass < SEMANTIC_REMEDIATE_PROMOTE_PASSES; pass++) {
            const promote = await applySemanticPromoteHeadingRepairs({
              buffer: outBuf,
              filename: name,
              analysis: outAfter,
              snapshot: outSnap,
              options: opts,
            });
            promoteParts.push(promote.summary);
            outBuf = promote.buffer;
            outAfter = promote.analysis;
            outSnap = promote.snapshot;
            if (promote.summary.skippedReason !== 'completed') break;
            if (promote.summary.proposalsAccepted === 0) break;
          }
          mergeSequentialSemanticSummaries(scorePr, promoteParts);

          const head = await applySemanticHeadingRepairs({
            buffer: outBuf,
            filename: name,
            analysis: outAfter,
            snapshot: outSnap,
            options: opts,
          });
          outBuf = head.buffer;
          outAfter = head.analysis;
          outSnap = head.snapshot;

          const untag = await applySemanticUntaggedHeadingRepairs({
            buffer: outBuf,
            filename: name,
            analysis: outAfter,
            snapshot: outSnap,
            options: opts,
          });
          outBuf = untag.buffer;
          outAfter = untag.analysis;
          outSnap = untag.snapshot;

          if (outSnap.isTagged && outAfter.score < batchTarget) {
            const ar2 = await applyPostRemediationAltRepair(outBuf, name, outAfter, outSnap, { signal });
            outBuf = ar2.buffer;
            outAfter = ar2.analysis;
            outSnap = ar2.snapshot;
          }
        };

        for (let wave = 0; wave < 12 && outAfter.score < batchTarget; wave++) {
          await runSemanticWave();
        }
      }

      row.scoreAfter = outAfter.score;
      row.metLocalTarget = outAfter.score >= batchTarget;

      const localRel = join('pdfaf_local', `${base}_local.json`);
      const localCats: Record<string, number | null> = {};
      for (const c of outAfter.categories) {
        localCats[c.key] = c.applicable === false ? null : c.score;
      }
      row.localCategories = localCats;
      const localPayload = {
        corpus: job.corpus,
        sourceFile: name,
        generatedAt: new Date().toISOString(),
        score: outAfter.score,
        grade: outAfter.grade,
        pdfClass: outAfter.pdfClass,
        pageCount: outAfter.pageCount,
        categories: outAfter.categories.map(c => ({
          key: c.key,
          score: c.score,
          grade: c.grade,
          applicable: c.applicable,
        })),
      };
      await writeFile(join(outRoot, localRel), JSON.stringify(localPayload, null, 2));
      row.pdfafLocalPath = localRel.replace(/\\/g, '/');

      const outPdf = join(outRoot, `${base}_remediated.pdf`);
      await writeFile(outPdf, outBuf);
      row.outPdf = basename(outPdf);
      // ICIJA receives the same bytes as outBuf / outPdf (no second serialization path).

      if (!skipIcjia) {
        const now = Date.now();
        const wait = Math.max(0, icjiaIntervalMs - (now - lastIcjiaAt));
        if (wait > 0 && lastIcjiaAt > 0) await sleep(wait);
        lastIcjiaAt = Date.now();

        const icjia = await postIcjiaAnalyze(icjiaUrl, outBuf, basename(outPdf));
        const icjiaRel = join('icjia_api_raw', `${base}_icjia.json`);
        const icjiaAbs = join(outRoot, icjiaRel);
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
        row.icjiaRawPath = icjiaRel.replace(/\\/g, '/');

        const catScores: Record<string, number | null> = {};
        if (icjia.json?.categories) {
          for (const c of icjia.json.categories) {
            const id = c.id;
            if (id) catScores[id] = c.score ?? null;
          }
        }
        row.icjia = {
          ok: icjia.ok,
          httpStatus: icjia.status,
          overallScore: icjia.json?.overallScore,
          grade: icjia.json?.grade,
          errorText: icjia.errorText,
          categoryScores: catScores,
          executiveSummary: icjia.json?.executiveSummary,
        };
      }
    } catch (e) {
      row.error = (e as Error).message;
    }
    row.durationMs = Date.now() - t0;
    results.push(row);

    const icjiaStr = skipIcjia
      ? ''
      : row.icjia
        ? ` ICIJA=${row.icjia.ok ? row.icjia.overallScore ?? '?' : `ERR ${row.icjia.httpStatus}`}`
        : '';
    const status = row.error
      ? `ERR ${row.error}`
      : `OK ${row.scoreBefore}→${row.scoreAfter} local>=${batchTarget} met=${row.metLocalTarget} semantic=${row.semanticRan}${icjiaStr}`;
    console.log(`[${job.corpus}/${name}] ${status}`);
  }

  const icjiaMet95 = results.filter(
    r => r.icjia?.ok && typeof r.icjia.overallScore === 'number' && r.icjia.overallScore >= 95,
  ).length;

  const generatedAt = new Date().toISOString();
  const batchJson = {
    generatedAt,
    localTargetScore: batchTarget,
    icjiaUrl: skipIcjia ? null : icjiaUrl,
    icjiaMinIntervalMs: skipIcjia ? null : icjiaIntervalMs,
    useSemantic,
    icjiaMet95Count: skipIcjia ? null : icjiaMet95,
    results,
  };

  await writeFile(join(outRoot, 'icjia_batch_results.json'), JSON.stringify(batchJson, null, 2));

  const reportMd = buildCorpusReportMd({
    outRoot,
    generatedAt,
    batchTarget,
    icjiaUrl: skipIcjia ? null : icjiaUrl,
    icjiaIntervalMs: skipIcjia ? null : icjiaIntervalMs,
    useSemantic,
    skipIcjia,
    results,
  });
  await writeFile(join(outRoot, 'CORPUS_ICJIA_REPORT.md'), reportMd);

  console.log(`Done. See ${join(outRoot, 'CORPUS_ICJIA_REPORT.md')} and icjia_batch_results.json under ${outRoot}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

/**
 * Scan corpus folders for PDFs that should go through OCR (scanned / mixed / native with no extractable text),
 * run deterministic remediation, then (by default) semantic passes when an OpenAI-compatible LLM is reachable
 * until scores meet **PDFAF_OCR_BATCH_TARGET_SCORE** (default **95**, i.e. at least 95). Use **96** for strictly above 95
 * (may not clear on heavy OCR PDFs while `pdf_ua_compliance` stays low — fix PDF/UA or tune scorers separately).
 *
 * Usage:
 *   pnpm exec tsx scripts/ocr-corpus-inspect-batch.ts [outputDir]
 *
 * Flags: `--no-semantic` (deterministic only; may not reach target after OCR metadata cap).
 *
 * Defaults: scans Input/corpus_from_pdfaf_v1 and Input/corpus_v2, writes Output/corpus_ocr_pass
 *
 * Environment:
 *   PDFAF_OCR_BATCH_MAX_JOBS — if set to a positive number, only process that many OCR jobs (after scan; for dev).
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  DocumentSnapshot,
  SemanticRemediationSummary,
} from '../src/types.js';
import {
  OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS,
} from '../src/config.js';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';

const CORPUS_DIRS: Array<{ label: string; dir: string }> = [
  { label: 'corpus_v1', dir: join(process.cwd(), 'Input', 'corpus_from_pdfaf_v1') },
  { label: 'corpus_v2', dir: join(process.cwd(), 'Input', 'corpus_v2') },
];

const SEMANTIC_TIMEOUT_MS = 600_000;

function safeBase(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

/** Returns false when URL is unset or the OpenAI-compatible server is not reachable. */
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

/** Same eligibility as planner `ocr_scanned_pdf` applicability (see planner.ts). */
function needsOcrPipeline(snap: DocumentSnapshot, pdfClass: AnalysisResult['pdfClass']): boolean {
  if (pdfClass === 'scanned' || pdfClass === 'mixed') return true;
  if (
    (pdfClass === 'native_untagged' || pdfClass === 'native_tagged') &&
    snap.textCharCount <= OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS
  ) {
    return true;
  }
  return false;
}

function textExtractScore(a: AnalysisResult): number {
  return a.categories.find(c => c.key === 'text_extractability')?.score ?? -1;
}

function parseBatchTarget(): number {
  const raw = parseInt(process.env['PDFAF_OCR_BATCH_TARGET_SCORE'] ?? '95', 10);
  if (Number.isFinite(raw) && raw >= 95 && raw <= 100) return raw;
  return 95;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pos = argv.filter(a => !a.startsWith('-'));
  const outRoot = pos[0] ?? join(process.cwd(), 'Output', 'corpus_ocr_pass');
  const forceNoSemantic = argv.includes('--no-semantic');

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

  const batchTarget = parseBatchTarget();
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

  type ScanRow = {
    corpus: string;
    file: string;
    pdfClass: string;
    textCharCount: number;
    textExtractScore: number;
    overallScore: number;
    grade: string;
    candidate: boolean;
    reason: string;
  };

  const scanRows: ScanRow[] = [];
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
      const inputPath = join(dir, name);
      const tmpPath = join(tmpdir(), `pdfaf-ocr-scan-${randomUUID()}.pdf`);
      const buf = await readFile(inputPath);
      await writeFile(tmpPath, buf);
      const { result, snapshot } = await analyzePdf(tmpPath, name);
      await unlink(tmpPath).catch(() => {});

      const te = textExtractScore(result);
      const cand = needsOcrPipeline(snapshot, result.pdfClass);
      let reason = '';
      if (!cand) {
        reason = 'not_scanned_mixed_or_native_with_text';
      } else if (result.pdfClass === 'scanned' || result.pdfClass === 'mixed') {
        reason = `pdfClass=${result.pdfClass}`;
      } else {
        reason = `native_image_only(textCharCount=${snapshot.textCharCount}<=${OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS})`;
      }

      scanRows.push({
        corpus: label,
        file: name,
        pdfClass: result.pdfClass,
        textCharCount: snapshot.textCharCount,
        textExtractScore: te,
        overallScore: result.score,
        grade: result.grade,
        candidate: cand,
        reason,
      });

      if (cand) {
        jobs.push({ corpus: label, file: name, path: inputPath });
      }
    }
  }

  const maxJobsRaw = (process.env['PDFAF_OCR_BATCH_MAX_JOBS'] ?? '').trim();
  const maxJobs = maxJobsRaw ? Math.max(0, parseInt(maxJobsRaw, 10)) : 0;
  const jobsToRun = maxJobs > 0 ? jobs.slice(0, maxJobs) : jobs;
  if (maxJobs > 0 && jobs.length > jobsToRun.length) {
    console.log(`PDFAF_OCR_BATCH_MAX_JOBS=${maxJobs}: running ${jobsToRun.length} of ${jobs.length} OCR job(s)`);
  }

  const scanPath = join(outRoot, 'ocr_scan_report.json');
  await writeFile(
    scanPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        batchTargetScore: batchTarget,
        useSemantic,
        llmConfigured: Boolean(getOpenAiCompatBaseUrl().trim()),
        rows: scanRows,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${scanPath}`);
  console.log(
    `OCR candidates: ${jobs.length} / ${scanRows.length} (running ${jobsToRun.length}) | target score: >=${batchTarget} | semantic: ${useSemantic ? 'on' : 'off'}`,
  );

  if (!useSemantic && jobs.length > 0) {
    console.warn(
      `[ocr-corpus-inspect-batch] No reachable LLM (set OPENAI_COMPAT_BASE_URL or PDFAF_RUN_LOCAL_LLM=1). Scores may stay < ${batchTarget} after OCR metadata scoring; use --no-semantic to silence only when intentional.`,
    );
  }

  const semanticAbort = new AbortController();
  const signal = semanticAbort.signal;

  const results: Array<{
    corpus: string;
    file: string;
    error?: string;
    pdfClassBefore: string;
    pdfClassAfter: string;
    textCharCountBefore: number;
    textCharCountAfter: number;
    textExtractBefore: number;
    textExtractAfter: number;
    scoreBefore: number;
    scoreAfterDeterministic: number;
    scoreAfter: number;
    batchTargetScore: number;
    metTarget: boolean;
    semanticRan: boolean;
    ocrApplied: boolean;
    ocrDetails?: string;
    outPdf?: string;
    durationMs: number;
  }> = [];

  for (const job of jobsToRun) {
    const t0 = Date.now();
    const name = job.file;
    const base = `${job.corpus}__${safeBase(name.replace(/\.pdf$/i, ''))}`;
    const row: (typeof results)[number] = {
      corpus: job.corpus,
      file: name,
      pdfClassBefore: '',
      pdfClassAfter: '',
      textCharCountBefore: 0,
      textCharCountAfter: 0,
      textExtractBefore: 0,
      textExtractAfter: 0,
      scoreBefore: 0,
      scoreAfterDeterministic: 0,
      scoreAfter: 0,
      batchTargetScore: batchTarget,
      metTarget: false,
      semanticRan: false,
      ocrApplied: false,
      durationMs: 0,
    };

    try {
      const buf = await readFile(job.path);
      const tmpPath = join(tmpdir(), `pdfaf-ocr-run-${randomUUID()}.pdf`);
      await writeFile(tmpPath, buf);
      const { result, snapshot } = await analyzePdf(tmpPath, name);
      await unlink(tmpPath).catch(() => {});

      row.pdfClassBefore = result.pdfClass;
      row.textCharCountBefore = snapshot.textCharCount;
      row.textExtractBefore = textExtractScore(result);
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

      row.scoreAfterDeterministic = outAfter.score;

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

      const ocrTools = allApplied.filter(t => t.toolName === 'ocr_scanned_pdf');
      row.ocrApplied = ocrTools.some(t => t.outcome === 'applied');
      const failed = ocrTools.find(t => t.outcome === 'failed');
      if (failed?.details) row.ocrDetails = failed.details;

      row.pdfClassAfter = outAfter.pdfClass;
      row.textCharCountAfter = outSnap.textCharCount;
      row.textExtractAfter = textExtractScore(outAfter);
      row.scoreAfter = outAfter.score;
      row.metTarget = outAfter.score >= batchTarget;

      const outPdf = join(outRoot, `${base}_remediated.pdf`);
      await writeFile(outPdf, outBuf);
      row.outPdf = basename(outPdf);
    } catch (e) {
      row.error = (e as Error).message;
    }
    row.durationMs = Date.now() - t0;
    results.push(row);
    const status = row.error
      ? `ERR ${row.error}`
      : `OK ${row.scoreBefore}→${row.scoreAfter} (det peak ${row.scoreAfterDeterministic}) target>=${batchTarget} met=${row.metTarget} ocr=${row.ocrApplied} semantic=${row.semanticRan}`;
    console.log(`[${job.corpus}/${name}] ${status}`);
  }

  await writeFile(
    join(outRoot, 'ocr_run_results.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        batchTargetScore: batchTarget,
        useSemantic,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`Done. PDFs and JSON under ${outRoot}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

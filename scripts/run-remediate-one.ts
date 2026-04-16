/**
 * One-shot full remediation (deterministic + semantic) without HTTP timeouts.
 * Uses existing local llama when PDFAF_RUN_LOCAL_LLM=1 and base URL is unset (same as dev server).
 *
 * Usage: pnpm exec tsx scripts/run-remediate-one.ts <input.pdf> [outputDir]
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { SemanticRemediationSummary } from '../src/types.js';

const SEMANTIC_TIMEOUT_MS = 600_000;

async function syncModelIdFromServer(): Promise<void> {
  const baseRaw = (process.env['OPENAI_COMPAT_BASE_URL'] ?? '').trim().replace(/\/$/, '');
  if (!baseRaw) return;
  const url = `${baseRaw}/models`;
  const key = (process.env['OPENAI_COMPAT_API_KEY'] ?? '').trim() || 'local';
  const headers: Record<string, string> = {};
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return;
  const j = (await res.json()) as { data?: Array<{ id?: string }> };
  const id = j.data?.[0]?.id;
  if (id) process.env['OPENAI_COMPAT_MODEL'] = id;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const outDir = process.argv[3] ?? join(process.cwd(), 'Output');
  if (!inputPath) {
    console.error('Usage: tsx scripts/run-remediate-one.ts <input.pdf> [outputDir]');
    process.exit(1);
  }

  if (process.env['PDFAF_RUN_LOCAL_LLM'] === '1' && !(process.env['OPENAI_COMPAT_BASE_URL'] ?? '').trim()) {
    const p = process.env['PDFAF_LLAMA_PORT'] ?? '1234';
    process.env['OPENAI_COMPAT_BASE_URL'] = `http://127.0.0.1:${p}/v1`;
    if (!(process.env['OPENAI_COMPAT_API_KEY'] ?? '').trim()) {
      process.env['OPENAI_COMPAT_API_KEY'] = 'local';
    }
  }
  await syncModelIdFromServer();

  /** Office-style PDFs need higher caps than older .env defaults. */
  const floorEnvInt = (key: string, minVal: number) => {
    const raw = (process.env[key] ?? '').trim();
    const n = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(n) || n < minVal) process.env[key] = String(minVal);
  };
  floorEnvInt('SEMANTIC_MAX_PROMOTE_CANDIDATES', 80);
  floorEnvInt('SEMANTIC_MAX_FIGURE_CANDIDATES', 96);

  const { getOpenAiCompatBaseUrl, SEMANTIC_REMEDIATE_FIGURE_PASSES, SEMANTIC_REMEDIATE_PROMOTE_PASSES } =
    await import('../src/config.js');
  const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');
  const { remediatePdf } = await import('../src/services/remediation/orchestrator.js');
  const { applySemanticRepairs } = await import('../src/services/semantic/semanticService.js');
  const { applySemanticHeadingRepairs } = await import('../src/services/semantic/headingSemantic.js');
  const { applySemanticPromoteHeadingRepairs } = await import('../src/services/semantic/promoteHeadingSemantic.js');
  const { applySemanticUntaggedHeadingRepairs } = await import('../src/services/semantic/untaggedHeadingSemantic.js');
  const { mergeSequentialSemanticSummaries } = await import('../src/routes/remediate.js');
  const { applyPostRemediationAltRepair } = await import('../src/services/remediation/altStructureRepair.js');

  const filename = basename(inputPath);
  const tmpPath = join(tmpdir(), `pdfaf-cli-${randomUUID()}.pdf`);
  const pdfBuf = await readFile(inputPath);
  await writeFile(tmpPath, pdfBuf);

  const semanticAbort = new AbortController();
  const signal = semanticAbort.signal;

  console.log('Analyzing…', inputPath);
  const { result, snapshot } = await analyzePdf(tmpPath, filename);
  console.log('Before:', result.score, result.grade, result.categories.map(c => `${c.key}:${c.score}`).join(' '));

  console.log('Deterministic remediation…');
  const { remediation, buffer: detBuffer, snapshot: detSnapshot } = await remediatePdf(
    pdfBuf,
    filename,
    result,
    snapshot,
    { maxRounds: 10 },
  );
  let outBuffer = detBuffer;
  let outAfter = remediation.after;
  let outSnapshot = detSnapshot;

  const llm = getOpenAiCompatBaseUrl();
  if (!llm) {
    console.warn('No LLM base URL — skipping semantic passes.');
  } else {
    console.log('LLM:', llm, 'model', process.env['OPENAI_COMPAT_MODEL'] ?? '(default)');
    const opts = { timeoutMs: SEMANTIC_TIMEOUT_MS, signal };

    console.log('Semantic figures (multi-pass)…');
    const scoreFig = outAfter.score;
    const figureParts: SemanticRemediationSummary[] = [];
    for (let pass = 0; pass < SEMANTIC_REMEDIATE_FIGURE_PASSES; pass++) {
      const sem = await applySemanticRepairs({
        buffer: outBuffer,
        filename,
        analysis: outAfter,
        snapshot: outSnapshot,
        options: opts,
      });
      figureParts.push(sem.summary);
      outBuffer = sem.buffer;
      outAfter = sem.analysis;
      outSnapshot = sem.snapshot;
      console.log(`  pass ${pass + 1}:`, sem.summary.skippedReason, 'accepted', sem.summary.proposalsAccepted);
      if (sem.summary.skippedReason !== 'completed') break;
      if (sem.summary.proposalsAccepted === 0) break;
    }
    const figMerged = mergeSequentialSemanticSummaries(scoreFig, figureParts);
    console.log('Figures merged:', figMerged.skippedReason, 'total accepted', figMerged.proposalsAccepted);

    console.log('Semantic promote headings (multi-pass)…');
    const scorePr = outAfter.score;
    const promoteParts: SemanticRemediationSummary[] = [];
    for (let pass = 0; pass < SEMANTIC_REMEDIATE_PROMOTE_PASSES; pass++) {
      const promote = await applySemanticPromoteHeadingRepairs({
        buffer: outBuffer,
        filename,
        analysis: outAfter,
        snapshot: outSnapshot,
        options: opts,
      });
      promoteParts.push(promote.summary);
      outBuffer = promote.buffer;
      outAfter = promote.analysis;
      outSnapshot = promote.snapshot;
      console.log(`  pass ${pass + 1}:`, promote.summary.skippedReason, 'accepted', promote.summary.proposalsAccepted);
      if (promote.summary.skippedReason !== 'completed') break;
      if (promote.summary.proposalsAccepted === 0) break;
    }
    const prMerged = mergeSequentialSemanticSummaries(scorePr, promoteParts);
    console.log('Promote merged:', prMerged.skippedReason, 'total accepted', prMerged.proposalsAccepted);

    console.log('Semantic heading level repair…');
    const head = await applySemanticHeadingRepairs({
      buffer: outBuffer,
      filename,
      analysis: outAfter,
      snapshot: outSnapshot,
      options: opts,
    });
    outBuffer = head.buffer;
    outAfter = head.analysis;
    outSnapshot = head.snapshot;
    console.log('Headings:', head.summary.skippedReason, head.summary.proposalsAccepted);

    console.log('Semantic untagged headings…');
    const untag = await applySemanticUntaggedHeadingRepairs({
      buffer: outBuffer,
      filename,
      analysis: outAfter,
      snapshot: outSnapshot,
      options: opts,
    });
    outBuffer = untag.buffer;
    outAfter = untag.analysis;
    outSnapshot = untag.snapshot;
    console.log('Untagged:', untag.summary.skippedReason, untag.summary.proposalsAccepted);
  }

  if (outSnapshot.isTagged) {
    const ar = await applyPostRemediationAltRepair(outBuffer, filename, outAfter, outSnapshot, { signal });
    outBuffer = ar.buffer;
    outAfter = ar.analysis;
    outSnapshot = ar.snapshot;
    console.log('Alt structure repair (nested / orphan alt) applied; after:', outAfter.score, outAfter.grade);
  }

  await mkdir(outDir, { recursive: true });
  const base = filename.replace(/\.pdf$/i, '');
  const outPdf = join(outDir, `${base}_cli_remediated.pdf`);
  const outJson = join(outDir, `${base}_cli_result.json`);
  await writeFile(outPdf, outBuffer);
  await writeFile(
    outJson,
    JSON.stringify(
      {
        beforeScore: remediation.before.score,
        beforeGrade: remediation.before.grade,
        afterScore: outAfter.score,
        afterGrade: outAfter.grade,
        categories: outAfter.categories.map(c => ({ key: c.key, score: c.score, applicable: c.applicable })),
      },
      null,
      2,
    ),
  );
  await unlink(tmpPath).catch(() => {});

  console.log('After:', outAfter.score, outAfter.grade);
  console.log('Wrote', outPdf, outJson);
  const altCat = outAfter.categories.find(c => c.key === 'alt_text');
  const altOk = !altCat?.applicable || altCat.score >= 100;
  console.log('Score ≥80:', outAfter.score >= 80, '| alt_text 100 (when applicable):', altOk);
  if (outAfter.score < 80) process.exit(2);
  if (!altOk) process.exit(3);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

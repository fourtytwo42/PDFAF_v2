/**
 * Baseline batch: grade → deterministic remediation (+ optional post passes) → grade.
 *
 * Modes:
 * - Default: analyze → remediatePdf → applyPostRemediationAltRepair when tagged (no LLM).
 * - `--semantic`: after deterministic + alt, if score < 80 and OPENAI_COMPAT_BASE_URL is set,
 *   runs the same semantic sequence as run-remediate-one.ts, then applyPostRemediationAltRepair again.
 *
 * Flags: `--semantic`, `--no-pdfs` (skip writing *_remediated.pdf; report JSON still written).
 * Args: [inputDir] [outputDir] (optional; must not start with `-`).
 *
 * For reproducible corpus numbers, each file uses ephemeral :memory: playbook + tool-outcome stores.
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  RemediationRuntimeSummary,
  SemanticRemediationSummary,
} from '../src/types.js';
import type { RemediationRuntimeTraceEvent } from '../src/services/remediation/orchestrator.js';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';

const SEMANTIC_TIMEOUT_MS = 600_000;

function safeBase(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function categoryRows(a: AnalysisResult): Array<{ key: CategoryKey; score: number; applicable: boolean }> {
  return a.categories.map(c => ({ key: c.key, score: c.score, applicable: c.applicable }));
}

function countFalsePositiveApplied(tools: AppliedRemediationTool[]): number {
  return tools.filter(tool => tool.details?.includes('false_positive_applied')).length;
}

function hasVerifiedCheckpointTimeoutReturn(result: { runtimeSummary?: RemediationRuntimeSummary }): boolean {
  const reasons = result.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons;
  return reasons?.some(row => row.key === 'verified_checkpoint_timeout_return' && row.count > 0) ?? false;
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutLikeError(error: string | undefined): boolean {
  return /timeout|aborted|abort/i.test(error ?? '');
}

function runtimeEventCounts(events: RemediationRuntimeTraceEvent[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function parseTraceReason(details: string | undefined): string | null {
  if (!details) return null;
  if (!details.startsWith('{')) return details;
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const reason = parsed['reason'] ?? parsed['note'] ?? parsed['raw'];
    return typeof reason === 'string' && reason.length > 0 ? reason : null;
  } catch {
    return details;
  }
}

async function writeRuntimeTimeoutTrace(input: {
  outRoot: string;
  base: string;
  file: string;
  error: string | undefined;
  durationMs: number;
  events: RemediationRuntimeTraceEvent[];
}): Promise<void> {
  if (!isTimeoutLikeError(input.error)) return;
  const lastEvent = input.events.at(-1) ?? null;
  const toolFinishes = input.events.filter(event => event.kind === 'tool_finish');
  const lastToolFinish = toolFinishes.at(-1) ?? null;
  const checkpoints = input.events.filter(event => event.kind === 'verified_checkpoint');
  const lastCheckpoint = checkpoints.at(-1) ?? null;
  const artifact = {
    file: input.file,
    rowId: input.base,
    generatedAt: new Date().toISOString(),
    error: input.error ?? '',
    elapsedMs: input.durationMs,
    eventCount: input.events.length,
    eventCounts: runtimeEventCounts(input.events),
    lastEvent,
    lastToolName: lastToolFinish?.toolName ?? null,
    lastToolOutcome: lastToolFinish?.outcome ?? null,
    lastToolDurationMs: lastToolFinish ? Math.round(lastToolFinish.durationMs) : null,
    lastStateSignatureBefore: lastToolFinish?.stateSignatureBefore ?? null,
    lastRejectedOrNoEffectReason:
      lastToolFinish && (lastToolFinish.outcome === 'rejected' || lastToolFinish.outcome === 'no_effect')
        ? parseTraceReason(lastToolFinish.details)
        : null,
    lastVerifiedCheckpointScore: lastCheckpoint?.score ?? null,
    lastVerifiedCheckpointGrade: lastCheckpoint?.grade ?? null,
    lastVerifiedCheckpointReason: lastCheckpoint?.reason ?? null,
    lastVerifiedCheckpointEligible: lastCheckpoint?.eligible ?? null,
    lastVerifiedCheckpointEligibilityReason: lastCheckpoint?.eligibilityReason ?? null,
    lastVerifiedCheckpointReturned: lastCheckpoint?.returned === true,
    verifiedCheckpointHistory: checkpoints.map(event => ({
      reason: event.reason,
      score: event.score,
      grade: event.grade ?? null,
      appliedToolCount: event.appliedToolCount,
      eligible: event.eligible,
      eligibilityReason: event.eligibilityReason,
      returned: event.returned === true,
      elapsedMs: Math.round(event.elapsedMs),
    })),
    recentEvents: input.events.slice(-100),
  };
  const dir = join(input.outRoot, 'runtime-timeouts');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${input.base}.json`), JSON.stringify(artifact, null, 2), 'utf8');
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const writePdfs = !argv.includes('--no-pdfs');
  const pos = argv.filter(a => !a.startsWith('-'));
  const inputDir = pos[0] ?? join(process.cwd(), 'Input', 'corpus_from_pdfaf_v1');
  const outRoot = pos[1] ?? join(process.cwd(), 'Output', 'baseline_corpus_run');

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
    REMEDIATION_PDF_TIMEOUT_MS,
    REMEDIATION_TARGET_SCORE,
  } = await import('../src/config.js');

  const forceNoSemantic = argv.includes('--no-semantic');
  const llmUp = forceNoSemantic ? false : await probeOpenAiCompatServer();
  const useSemantic = !forceNoSemantic && (argv.includes('--semantic') || llmUp);

  const floorEnvInt = (key: string, minVal: number) => {
    const raw = (process.env[key] ?? '').trim();
    const n = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(n) || n < minVal) process.env[key] = String(minVal);
  };
  if (useSemantic) {
    // Corpus / large ICJIA PDFs: allow more figure + promote work when LLM is available.
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
  const { applyPostRemediationAltRepair, shouldKeepPostRemediationAltRepair } = await import('../src/services/remediation/altStructureRepair.js');
  const { applySemanticRepairs } = await import('../src/services/semantic/semanticService.js');
  const { applySemanticHeadingRepairs } = await import('../src/services/semantic/headingSemantic.js');
  const { applySemanticPromoteHeadingRepairs } = await import('../src/services/semantic/promoteHeadingSemantic.js');
  const { applySemanticUntaggedHeadingRepairs } = await import('../src/services/semantic/untaggedHeadingSemantic.js');
  const { mergeSequentialSemanticSummaries } = await import('../src/routes/remediate.js');

  const names = (await readdir(inputDir))
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b));

  if (names.length === 0) {
    console.error('No PDFs in', inputDir);
    process.exit(1);
  }

  await mkdir(outRoot, { recursive: true });
  const rows: Array<{
    file: string;
    pdfClassBefore: string;
    beforeScore: number;
    beforeGrade: string;
    categoriesBefore: ReturnType<typeof categoryRows>;
    afterDeterministicScore: number;
    afterDeterministicGrade: string;
    afterScore: number;
    afterGrade: string;
    pdfClassAfter: string;
    delta: number;
    durationMs: number;
    semanticRan: boolean;
    categoryGap?: { before: ReturnType<typeof categoryRows>; after: ReturnType<typeof categoryRows> };
    appliedTools?: AppliedRemediationTool[];
    falsePositiveApplied?: number;
    error?: string;
  }> = [];

  for (const name of names) {
    const inputPath = join(inputDir, name);
    const t0 = Date.now();
    const base = safeBase(name.replace(/\.pdf$/i, ''));
    const fileAbort = new AbortController();
    const timeout = setTimeout(() => {
      fileAbort.abort(new Error(`per_pdf_timeout_${REMEDIATION_PDF_TIMEOUT_MS}ms`));
    }, REMEDIATION_PDF_TIMEOUT_MS);
    const signal = fileAbort.signal;
    let error: string | undefined;
    let beforeScore = 0;
    let beforeGrade = '?';
    let afterDeterministicScore = 0;
    let afterDeterministicGrade = '?';
    let afterScore = 0;
    let afterGrade = '?';
    let pdfClassBefore = '';
    let pdfClassAfter = '';
    let categoriesBefore: ReturnType<typeof categoryRows> = [];
    let semanticRan = false;
    let categoryGap: { before: ReturnType<typeof categoryRows>; after: ReturnType<typeof categoryRows> } | undefined;
    const appliedTools: AppliedRemediationTool[] = [];
    const runtimeTraceEvents: RemediationRuntimeTraceEvent[] = [];
    let verifiedCheckpointReturned = false;

    try {
      const buf = await readFile(inputPath);
      const tmpPath = join(tmpdir(), `pdfaf-baseline-${randomUUID()}.pdf`);
      await writeFile(tmpPath, buf);
      const { result, snapshot } = await analyzePdf(tmpPath, name);
      await unlink(tmpPath).catch(() => {});
      beforeScore = result.score;
      beforeGrade = result.grade;
      pdfClassBefore = result.pdfClass;
      categoriesBefore = categoryRows(result);

      const memDb = new Database(':memory:');
      initSchema(memDb);
      const playbookStore = createPlaybookStore(memDb);
      const toolOutcomeStore = createToolOutcomeStore(memDb);

      const { remediation, buffer, snapshot: snap2 } = await remediatePdf(buf, name, result, snapshot, {
        maxRounds: 10,
        playbookStore,
        toolOutcomeStore,
        signal,
        onRuntimeTrace: event => {
          runtimeTraceEvents.push(event);
        },
      });
      appliedTools.push(...remediation.appliedTools);
      verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(remediation);
      let outBuf = buffer;
      let outAfter = remediation.after;
      let outSnap = snap2;
      if (!verifiedCheckpointReturned && outSnap.isTagged && outAfter.score < REMEDIATION_TARGET_SCORE) {
        const ar = await applyPostRemediationAltRepair(outBuf, name, outAfter, outSnap, { signal });
        if (shouldKeepPostRemediationAltRepair(outAfter, ar.analysis)) {
          outBuf = ar.buffer;
          outAfter = ar.analysis;
          outSnap = ar.snapshot;
        }
      }
      // Second deterministic pass: planner/tool caps often leave headroom after the first re-analyze.
      if (!verifiedCheckpointReturned && outAfter.score < REMEDIATION_TARGET_SCORE) {
        const memDb2 = new Database(':memory:');
        initSchema(memDb2);
        const r2 = await remediatePdf(outBuf, name, outAfter, outSnap, {
          maxRounds: 10,
          playbookStore: createPlaybookStore(memDb2),
          toolOutcomeStore: createToolOutcomeStore(memDb2),
          signal,
          onRuntimeTrace: event => {
            runtimeTraceEvents.push(event);
          },
        });
        memDb2.close();
        if (r2.remediation.after.score >= outAfter.score) {
          outBuf = r2.buffer;
          outAfter = r2.remediation.after;
          outSnap = r2.snapshot;
          appliedTools.push(...r2.remediation.appliedTools);
          verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(r2.remediation);
        }
        if (!verifiedCheckpointReturned && outSnap.isTagged && outAfter.score < REMEDIATION_TARGET_SCORE) {
          const ar2 = await applyPostRemediationAltRepair(outBuf, name, outAfter, outSnap, { signal });
          if (shouldKeepPostRemediationAltRepair(outAfter, ar2.analysis)) {
            outBuf = ar2.buffer;
            outAfter = ar2.analysis;
            outSnap = ar2.snapshot;
          }
        }
      }
      afterDeterministicScore = outAfter.score;
      afterDeterministicGrade = outAfter.grade;

      const llm = getOpenAiCompatBaseUrl();
      if (!verifiedCheckpointReturned && useSemantic && outAfter.score < REMEDIATION_TARGET_SCORE && llm) {
        semanticRan = true;
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

          if (outSnap.isTagged && outAfter.score < REMEDIATION_TARGET_SCORE) {
            const ar2 = await applyPostRemediationAltRepair(outBuf, name, outAfter, outSnap, { signal });
            if (shouldKeepPostRemediationAltRepair(outAfter, ar2.analysis)) {
              outBuf = ar2.buffer;
              outAfter = ar2.analysis;
              outSnap = ar2.snapshot;
            }
          }
        };

        for (let wave = 0; wave < 8 && outAfter.score < REMEDIATION_TARGET_SCORE; wave++) {
          await runSemanticWave();
        }
      } else if (!verifiedCheckpointReturned && useSemantic && outAfter.score < REMEDIATION_TARGET_SCORE && !llm) {
        console.warn(
          `[${name}] Semantic pass skipped (set OPENAI_COMPAT_BASE_URL or use --no-semantic to silence).`,
        );
      }

      afterScore = outAfter.score;
      afterGrade = outAfter.grade;
      pdfClassAfter = outAfter.pdfClass;

      if (afterScore < REMEDIATION_TARGET_SCORE) {
        categoryGap = {
          before: categoriesBefore,
          after: categoryRows(outAfter),
        };
      }

      if (writePdfs) {
        const outPdf = join(outRoot, `${base}_remediated.pdf`);
        await writeFile(outPdf, outBuf);
      }
      memDb.close();
    } catch (e) {
      error = sanitizeError(e);
    }
    clearTimeout(timeout);
    const durationMs = Date.now() - t0;
    await writeRuntimeTimeoutTrace({
      outRoot,
      base,
      file: name,
      error,
      durationMs,
      events: runtimeTraceEvents,
    });
    rows.push({
      file: name,
      pdfClassBefore,
      beforeScore,
      beforeGrade,
      categoriesBefore,
      afterDeterministicScore,
      afterDeterministicGrade,
      afterScore,
      afterGrade,
      pdfClassAfter,
      delta: afterScore - beforeScore,
      durationMs,
      semanticRan,
      categoryGap,
      appliedTools,
      falsePositiveApplied: countFalsePositiveApplied(appliedTools),
      error,
    });
  }

  const belowTarget = rows.filter(r => !r.error && r.afterScore < REMEDIATION_TARGET_SCORE);
  const report = {
    generatedAt: new Date().toISOString(),
    inputDir,
    outputDir: outRoot,
    flags: { semantic: useSemantic, writePdfs },
    pipeline: useSemantic
      ? `analyze → remediatePdf (:memory: stores, maxRounds 10) → alt repair → (semantic while score<${REMEDIATION_TARGET_SCORE} and LLM set) → alt repair`
      : 'analyze → remediatePdf (:memory: stores, maxRounds 10) → applyPostRemediationAltRepair when tagged; no LLM',
    summary: {
      count: rows.length,
      targetScore: REMEDIATION_TARGET_SCORE,
      belowTarget: belowTarget.length,
      meanBefore:
        (() => {
          const ok = rows.filter(r => !r.error);
          return ok.length ? ok.reduce((s, r) => s + r.beforeScore, 0) / ok.length : 0;
        })(),
      meanAfter:
        (() => {
          const ok = rows.filter(r => !r.error);
          return ok.length ? ok.reduce((s, r) => s + r.afterScore, 0) / ok.length : 0;
        })(),
    },
    rows,
  };
  const reportPath = join(outRoot, 'baseline_report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log('\n# Baseline corpus report\n');
  console.log('| File | before | det+alt | final | Δ | sem | err |');
  console.log('|------|--------|---------|-------|---|-----|-----|');
  for (const r of rows) {
    const err = r.error ? r.error.slice(0, 36).replace(/\|/g, '/') : '';
    console.log(
      `| ${r.file} | ${r.beforeScore}/${r.beforeGrade} | ${r.afterDeterministicScore}/${r.afterDeterministicGrade} | ${r.afterScore}/${r.afterGrade} | ${r.delta >= 0 ? '+' : ''}${r.delta} | ${r.semanticRan ? 'y' : 'n'} | ${err} |`,
    );
  }
  console.log(`\nBelow target (${REMEDIATION_TARGET_SCORE}):`, belowTarget.length, '| Wrote', reportPath);
  if (belowTarget.length) {
    console.log('\nCategory gaps (final score < target):');
    for (const r of belowTarget) {
      console.log(' ', r.file, JSON.stringify(r.categoryGap, null, 0).slice(0, 400));
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

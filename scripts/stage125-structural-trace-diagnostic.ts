#!/usr/bin/env tsx
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PYTHON_SCRIPT_PATH, PYTHON_TIMEOUT_MS } from '../src/config.js';

type JsonRecord = Record<string, unknown>;

export type Stage125TraceClass =
  | 'root_missing_or_unreadable'
  | 'root_k_unreadable_or_empty'
  | 'enqueue_drop'
  | 'early_traversal_exception'
  | 'visited_key_collapse'
  | 'cap_or_order_instability'
  | 'family_collector_exception'
  | 'trace_stable_but_output_varies'
  | 'trace_inconclusive';

interface ProtectedStateMetadata {
  rowId: string;
  file: string;
  reason: string;
  sequence: number;
  bufferSha256: string;
  score: number;
  grade: string;
}

export interface Stage125TraceRepeat {
  repeat: number;
  ok: boolean;
  trace: JsonRecord;
  finalCounts: Record<string, number>;
  traceSignature: string | null;
  outputSignature: string | null;
  runtimeMs?: number;
  stderr?: string;
  error?: string;
}

interface CheckpointReport {
  rowId: string;
  checkpoint: string;
  pdfPath: string;
  metadataPath: string;
  metadata: ProtectedStateMetadata;
  classification: Stage125TraceClass;
  classificationReason: string;
  countRanges: Record<string, [number, number]>;
  queuePopRange: [number, number];
  enqueuedRange: [number, number];
  exceptionPhases: string[];
  capFamilies: string[];
  repeats: Stage125TraceRepeat[];
}

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-stage124-target-protected-2026-04-26-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage125-structural-trace-diagnostic-2026-04-26-r1';
const DEFAULT_IDS = ['long-4516', 'short-4176', 'long-4683', 'structure-3775', 'font-4156', 'font-4172', 'font-4699'];
const DEFAULT_REPEATS = 5;
const CORE_FAMILIES = ['headings', 'figures', 'tables', 'paragraphStructElems'];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage125-structural-trace-diagnostic.ts [options]',
    `  --run <dir>      Run dir with protected-states artifacts (default: ${DEFAULT_RUN})`,
    `  --out <dir>      Output directory (default: ${DEFAULT_OUT})`,
    `  --ids <csv>      Row ids (default: ${DEFAULT_IDS.join(',')})`,
    '  --repeats <n>    Trace repeat count, capped at 8 (default: 5)',
  ].join('\n');
}

function parseArgs(argv: string[]): { runDir: string; out: string; ids: string[]; repeats: number } {
  const args = {
    runDir: DEFAULT_RUN,
    out: DEFAULT_OUT,
    ids: DEFAULT_IDS,
    repeats: DEFAULT_REPEATS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--run') args.runDir = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--repeats') args.repeats = Math.max(1, Math.min(8, Number.parseInt(next, 10) || DEFAULT_REPEATS));
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signature(value: unknown): string {
  return createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 20);
}

function numberField(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function objectField(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayField(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
}

function traceControlSlice(trace: JsonRecord): JsonRecord {
  const counters = objectField(trace['counters']);
  return {
    root: trace['root'] ?? {},
    counters,
    caps: trace['caps'] ?? {},
    exceptionPhases: arrayField(trace['exceptions']).map(row => row['phase']),
    visitedRoleSample: arrayField(trace['visitedSamples']).slice(0, 20).map(row => ({
      role: row['role'],
      structRef: row['structRef'],
      page: row['page'],
    })),
  };
}

function finalCountsFromTrace(trace: JsonRecord, fallback: unknown): Record<string, number> {
  const counts = objectField(trace['finalFamilyCounts']);
  const fallbackCounts = objectField(fallback);
  const out: Record<string, number> = {};
  for (const key of ['headings', 'figures', 'checkerFigureTargets', 'tables', 'formFields', 'paragraphStructElems']) {
    out[key] = numberField(counts[key], numberField(fallbackCounts[key], 0));
  }
  return out;
}

function numericRange(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  return [Math.min(...values), Math.max(...values)];
}

function countRanges(repeats: Stage125TraceRepeat[]): Record<string, [number, number]> {
  const keys = new Set<string>();
  for (const repeat of repeats) {
    for (const key of Object.keys(repeat.finalCounts)) keys.add(key);
  }
  return Object.fromEntries([...keys].sort().map(key => [
    key,
    numericRange(repeats.map(repeat => numberField(repeat.finalCounts[key], 0))),
  ]));
}

function counterRange(repeats: Stage125TraceRepeat[], counter: string): [number, number] {
  return numericRange(repeats.map(repeat => numberField(objectField(repeat.trace['counters'])[counter], 0)));
}

function coreEvidenceCount(repeat: Stage125TraceRepeat): number {
  return CORE_FAMILIES.reduce((sum, family) => sum + numberField(repeat.finalCounts[family], 0), 0);
}

function exceptionPhases(repeats: Stage125TraceRepeat[]): string[] {
  const phases = new Set<string>();
  for (const repeat of repeats) {
    for (const row of arrayField(repeat.trace['exceptions'])) {
      const phase = row['phase'];
      if (phase != null) phases.add(String(phase));
    }
  }
  return [...phases].sort();
}

function capFamilies(repeats: Stage125TraceRepeat[]): string[] {
  const families = new Set<string>();
  for (const repeat of repeats) {
    const caps = objectField(repeat.trace['caps']);
    for (const [family, active] of Object.entries(caps)) {
      if (active === true) families.add(family);
    }
  }
  return [...families].sort();
}

export function classifyStage125TraceGroup(input: {
  repeats: Stage125TraceRepeat[];
}): { classification: Stage125TraceClass; reason: string } {
  const successful = input.repeats.filter(repeat => repeat.ok);
  if (successful.length === 0) {
    return { classification: 'root_missing_or_unreadable', reason: 'no_successful_trace_repeats' };
  }

  const roots = successful.map(repeat => objectField(repeat.trace['root']));
  if (roots.some(root => root['hasStructTreeRoot'] !== true)) {
    return { classification: 'root_missing_or_unreadable', reason: 'struct_tree_root_missing_or_unreadable' };
  }
  if (roots.some(root => root['rootKType'] === 'none' || root['rootKType'] === 'unreadable' || numberField(root['rootChildCount'], 0) === 0)) {
    return { classification: 'root_k_unreadable_or_empty', reason: 'root_k_missing_empty_or_unreadable' };
  }

  const phases = exceptionPhases(successful);
  const familyException = phases.find(phase => /heading|figure|table|paragraph|checker/.test(phase));
  if (familyException) {
    return { classification: 'family_collector_exception', reason: `phase=${familyException}` };
  }
  const earlyException = phases.find(phase => /root|enqueue|tag_page|struct_tree_traversal|mcid_lookup/.test(phase));
  if (earlyException) {
    return { classification: 'early_traversal_exception', reason: `phase=${earlyException}` };
  }

  const ranges = countRanges(successful);
  const coreCounts = successful.map(coreEvidenceCount);
  const [minCore, maxCore] = numericRange(coreCounts);
  const [minQueuePops, maxQueuePops] = counterRange(successful, 'queuePops');
  const [minEnqueued, maxEnqueued] = counterRange(successful, 'enqueuedChildren');
  if (
    maxCore >= 50 &&
    minCore <= Math.max(5, Math.floor(maxCore * 0.05)) &&
    minQueuePops <= Math.max(3, Math.floor(maxQueuePops * 0.1))
  ) {
    return { classification: 'enqueue_drop', reason: `core_evidence_${minCore}->${maxCore};queue_pops_${minQueuePops}->${maxQueuePops}` };
  }
  if (maxEnqueued > 0 && minEnqueued === 0) {
    return { classification: 'enqueue_drop', reason: `enqueued_children_${minEnqueued}->${maxEnqueued}` };
  }

  const maxDuplicateVisited = Math.max(...successful.map(repeat => numberField(objectField(repeat.trace['counters'])['duplicateVisitedIdCount'], 0)));
  const maxDuplicateRefs = Math.max(...successful.map(repeat => numberField(objectField(repeat.trace['counters'])['duplicateObjectRefCount'], 0)));
  if ((maxDuplicateVisited > 0 || maxDuplicateRefs > 0) && maxCore > minCore) {
    return { classification: 'visited_key_collapse', reason: `duplicate_id=${maxDuplicateVisited};duplicate_ref=${maxDuplicateRefs}` };
  }

  const traceSignatures = new Set(successful.map(repeat => repeat.traceSignature).filter(Boolean));
  const outputSignatures = new Set(successful.map(repeat => repeat.outputSignature).filter(Boolean));
  if (traceSignatures.size <= 1 && outputSignatures.size > 1) {
    return { classification: 'trace_stable_but_output_varies', reason: 'trace_signature_stable_output_counts_changed' };
  }

  const caps = capFamilies(successful);
  const varyingFamilies = Object.entries(ranges).filter(([, [min, max]]) => min !== max).map(([key]) => key);
  if (caps.length > 0 || varyingFamilies.length > 0) {
    return {
      classification: 'cap_or_order_instability',
      reason: caps.length > 0 ? `caps=${caps.join(',')}` : `varying_counts=${varyingFamilies.join(',')}`,
    };
  }

  return { classification: 'trace_inconclusive', reason: 'no_classification_rule_matched' };
}

async function listCheckpoints(runDir: string, id: string): Promise<Array<{ pdfPath: string; metadataPath: string; metadata: ProtectedStateMetadata }>> {
  const dir = join(resolve(runDir), 'protected-states', id);
  const names = await readdir(dir).catch(() => []);
  const metadataNames = names.filter(name => name.endsWith('.json')).sort();
  const out = [];
  for (const name of metadataNames) {
    const metadataPath = join(dir, name);
    const pdfPath = join(dir, name.replace(/\.json$/, '.pdf'));
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as ProtectedStateMetadata;
    out.push({ pdfPath, metadataPath, metadata });
  }
  return out;
}

async function runTrace(pdfPath: string, repeat: number): Promise<Stage125TraceRepeat> {
  const started = Date.now();
  return new Promise(resolveRun => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (result: Stage125TraceRepeat) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun(result);
    };
    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, '--trace-structure', pdfPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({
        repeat,
        ok: false,
        trace: {},
        finalCounts: {},
        traceSignature: null,
        outputSignature: null,
        runtimeMs: Date.now() - started,
        stderr,
        error: `timeout_${PYTHON_TIMEOUT_MS}ms`,
      });
    }, PYTHON_TIMEOUT_MS);
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => {
      done({
        repeat,
        ok: false,
        trace: {},
        finalCounts: {},
        traceSignature: null,
        outputSignature: null,
        runtimeMs: Date.now() - started,
        stderr,
        error: error.message,
      });
    });
    proc.on('close', code => {
      if (settled) return;
      try {
        const parsed = JSON.parse(stdout) as JsonRecord;
        const trace = objectField(parsed['trace']);
        const finalCounts = finalCountsFromTrace(trace, parsed['finalCounts']);
        done({
          repeat,
          ok: parsed['ok'] === true && code === 0,
          trace,
          finalCounts,
          traceSignature: signature(traceControlSlice(trace)),
          outputSignature: signature(finalCounts),
          runtimeMs: Date.now() - started,
          stderr,
          ...(code === 0 ? {} : { error: `python_exit_${code}` }),
        });
      } catch (error) {
        done({
          repeat,
          ok: false,
          trace: {},
          finalCounts: {},
          traceSignature: null,
          outputSignature: null,
          runtimeMs: Date.now() - started,
          stderr,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}

async function buildCheckpointReport(input: {
  rowId: string;
  checkpoint: { pdfPath: string; metadataPath: string; metadata: ProtectedStateMetadata };
  repeats: number;
}): Promise<CheckpointReport> {
  const repeats: Stage125TraceRepeat[] = [];
  for (let repeat = 1; repeat <= input.repeats; repeat += 1) {
    repeats.push(await runTrace(input.checkpoint.pdfPath, repeat));
  }
  const classification = classifyStage125TraceGroup({ repeats });
  return {
    rowId: input.rowId,
    checkpoint: input.checkpoint.metadataPath.split('/').pop()?.replace(/\.json$/, '') ?? input.checkpoint.metadata.reason,
    pdfPath: input.checkpoint.pdfPath,
    metadataPath: input.checkpoint.metadataPath,
    metadata: input.checkpoint.metadata,
    classification: classification.classification,
    classificationReason: classification.reason,
    countRanges: countRanges(repeats),
    queuePopRange: counterRange(repeats, 'queuePops'),
    enqueuedRange: counterRange(repeats, 'enqueuedChildren'),
    exceptionPhases: exceptionPhases(repeats),
    capFamilies: capFamilies(repeats),
    repeats,
  };
}

function renderMarkdown(report: { runDir: string; rows: CheckpointReport[] }): string {
  const lines = [
    '# Stage 125 Structural Trace Diagnostic',
    '',
    `- Run: \`${report.runDir}\``,
    '',
    '| Row | Checkpoint | Class | Queue pops | Enqueued | Core counts | Exceptions | Caps |',
    '| --- | --- | --- | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const core = CORE_FAMILIES.map(family => `${family}:${(row.countRanges[family] ?? [0, 0]).join('-')}`).join(', ');
    lines.push([
      row.rowId,
      row.checkpoint,
      `${row.classification} (${row.classificationReason})`,
      row.queuePopRange.join('-'),
      row.enqueuedRange.join('-'),
      core,
      row.exceptionPhases.join(', ') || 'none',
      row.capFamilies.join(', ') || 'none',
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('', '## Repeat Samples', '');
  for (const row of report.rows) {
    lines.push(`### ${row.rowId} / ${row.checkpoint}`, '');
    for (const repeat of row.repeats) {
      const counters = objectField(repeat.trace['counters']);
      lines.push(`- r${repeat.repeat}: ok=${repeat.ok} queue=${numberField(counters['queuePops'])} enqueued=${numberField(counters['enqueuedChildren'])} counts=${JSON.stringify(repeat.finalCounts)}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows: CheckpointReport[] = [];
  for (const id of args.ids) {
    const checkpoints = await listCheckpoints(args.runDir, id);
    for (const checkpoint of checkpoints) {
      const row = await buildCheckpointReport({ rowId: id, checkpoint, repeats: args.repeats });
      rows.push(row);
      console.log(`${id}/${row.checkpoint}: ${row.classification} (${row.classificationReason})`);
    }
  }
  const out = resolve(args.out);
  const report = {
    generatedAt: new Date().toISOString(),
    runDir: resolve(args.runDir),
    repeats: args.repeats,
    pythonScriptPath: PYTHON_SCRIPT_PATH,
    rows,
  };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage125-structural-trace-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage125-structural-trace-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

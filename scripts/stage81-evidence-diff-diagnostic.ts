#!/usr/bin/env tsx
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PYTHON_SCRIPT_PATH, PYTHON_TIMEOUT_MS, SEMANTIC_MCID_MAX_PAGES } from '../src/config.js';
import { sha256Buffer } from '../src/services/benchmark/protectedReanalysisSelection.js';

type JsonRecord = Record<string, unknown>;
type ObservationKind = 'heading' | 'figure' | 'checkerFigureTarget' | 'table' | 'paragraph';

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  afterScore?: number;
  reanalyzedScore?: number;
}

export interface Stage81Observation {
  kind: ObservationKind;
  key: string;
  repeat: number;
  quality: number;
  item: JsonRecord;
}

export interface Stage81GroupSummary {
  key: string;
  kind: ObservationKind;
  repeatIndexes: number[];
  observationCount: number;
  variantCount: number;
  bestQuality: number;
  mergedQuality: number;
  intermittent: boolean;
  merged: JsonRecord;
}

interface RawRepeat {
  repeat: number;
  runtimeMs: number;
  error?: string;
  raw?: JsonRecord;
}

interface Stage81RowReport {
  id: string;
  pdfPath: string | null;
  bufferSha256: string | null;
  runRowScore: number | null;
  baselineScore: number | null;
  repeatCounts: Array<Record<ObservationKind, number>>;
  mergedCounts: Record<ObservationKind, number>;
  maxRepeatCounts: Record<ObservationKind, number>;
  unstableGroupCount: number;
  intermittentGroupCount: number;
  preservesMaxObservedEvidence: boolean;
  safeToImplement: boolean;
  decisionReason: string;
  topUnstableGroups: Stage81GroupSummary[];
  errors: string[];
}

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-stage79-target-2026-04-26-r1';
const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage81-evidence-diff-diagnostic-2026-04-26-r1';
const DEFAULT_IDS = [
  'structure-4076',
  'fixture-teams-remediated',
  'long-4683',
  'long-4470',
  'font-4156',
  'font-4172',
  'font-4699',
  'short-4214',
  'structure-4108',
];
const KINDS: ObservationKind[] = ['heading', 'figure', 'checkerFigureTarget', 'table', 'paragraph'];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as JsonRecord;
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 20);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function observationKey(kind: ObservationKind, item: JsonRecord): string {
  const ref = str(item['structRef']);
  if (ref) return `${kind}:ref:${ref}`;
  const role = str(item['role'] ?? item['rawRole'] ?? item['resolvedRole'] ?? item['tag']);
  const page = num(item['page']);
  const text = str(item['text'] ?? item['altText']).replace(/\s+/g, ' ').slice(0, 120);
  const parent = arr(item['parentPath']).map(String).join('/');
  return `${kind}:inline:${role}:${page}:${text}:${parent}`;
}

function quality(kind: ObservationKind, item: JsonRecord): number {
  let score = 0;
  if (str(item['structRef'])) score += 50;
  if (num(item['page']) >= 0) score += 5;
  if (str(item['text'])) score += Math.min(40, str(item['text']).length / 5);
  if (str(item['altText'])) score += Math.min(30, str(item['altText']).length / 5);
  if (bool(item['reachable'])) score += 10;
  if (bool(item['directContent'])) score += 8;
  score += Math.min(20, num(item['subtreeMcidCount']));
  score += Math.min(30, arr(item['parentPath']).length * 2);
  if (Array.isArray(item['bbox'])) score += 5;
  if (kind === 'heading') score += 10 + Math.max(0, 7 - num(item['level']));
  if (kind === 'figure' || kind === 'checkerFigureTarget') {
    if (bool(item['hasAlt'])) score += 20;
    if (!bool(item['isArtifact'])) score += 4;
  }
  if (kind === 'table') {
    score += Math.min(50, num(item['totalCells']));
    score += Math.min(20, num(item['headerCount']) * 2);
    score += Math.min(25, num(item['rowCount']));
    score += Math.min(20, arr(item['rowCellCounts']).length);
    if (num(item['dominantColumnCount']) > 0) score += 8;
  }
  if (kind === 'paragraph') score += Math.min(60, str(item['text']).length / 4);
  return Math.round(score * 100) / 100;
}

function normalizeObservation(kind: ObservationKind, item: JsonRecord, repeat: number): Stage81Observation {
  return {
    kind,
    key: observationKey(kind, item),
    repeat,
    quality: quality(kind, item),
    item,
  };
}

function betterText(a: unknown, b: unknown): string | undefined {
  const sa = str(a);
  const sb = str(b);
  return sb.length > sa.length ? sb : sa || undefined;
}

function mergeItems(kind: ObservationKind, observations: Stage81Observation[]): JsonRecord {
  const best = [...observations].sort((a, b) => b.quality - a.quality || stableStringify(a.item).localeCompare(stableStringify(b.item)))[0]?.item ?? {};
  const merged: JsonRecord = { ...best };
  for (const obs of observations) {
    const item = obs.item;
    for (const key of ['text', 'altText'] as const) {
      const text = betterText(merged[key], item[key]);
      if (text) merged[key] = text;
    }
    for (const key of ['reachable', 'directContent', 'hasAlt'] as const) merged[key] = bool(merged[key]) || bool(item[key]);
    for (const key of ['subtreeMcidCount', 'headerCount', 'totalCells', 'rowCount', 'cellsMisplacedCount', 'irregularRows', 'dominantColumnCount'] as const) {
      merged[key] = Math.max(num(merged[key]), num(item[key]));
    }
    if (!Array.isArray(merged['bbox']) && Array.isArray(item['bbox'])) merged['bbox'] = item['bbox'];
    if (arr(item['parentPath']).length > arr(merged['parentPath']).length) merged['parentPath'] = item['parentPath'];
    if (arr(item['rowCellCounts']).length > arr(merged['rowCellCounts']).length) merged['rowCellCounts'] = item['rowCellCounts'];
  }
  merged['stage81MergedKind'] = kind;
  return merged;
}

export function summarizeObservationGroup(observations: Stage81Observation[], repeatCount: number): Stage81GroupSummary {
  const first = observations[0]!;
  const repeatIndexes = [...new Set(observations.map(obs => obs.repeat))].sort((a, b) => a - b);
  const variants = new Set(observations.map(obs => hash(obs.item)));
  const merged = mergeItems(first.kind, observations);
  return {
    key: first.key,
    kind: first.kind,
    repeatIndexes,
    observationCount: observations.length,
    variantCount: variants.size,
    bestQuality: Math.max(...observations.map(obs => obs.quality)),
    mergedQuality: quality(first.kind, merged),
    intermittent: repeatIndexes.length !== repeatCount,
    merged,
  };
}

export function summarizeEvidenceDiff(input: { repeats: Array<{ repeat: number; raw: JsonRecord }>; repeatCount: number }): {
  repeatCounts: Array<Record<ObservationKind, number>>;
  mergedCounts: Record<ObservationKind, number>;
  maxRepeatCounts: Record<ObservationKind, number>;
  groups: Stage81GroupSummary[];
  unstableGroups: Stage81GroupSummary[];
  preservesMaxObservedEvidence: boolean;
} {
  const observations: Stage81Observation[] = [];
  const repeatCounts: Array<Record<ObservationKind, number>> = [];
  for (const repeat of input.repeats) {
    const byKind: Record<ObservationKind, JsonRecord[]> = {
      heading: arr(repeat.raw['headings']) as JsonRecord[],
      figure: arr(repeat.raw['figures']) as JsonRecord[],
      checkerFigureTarget: arr(repeat.raw['checkerFigureTargets']) as JsonRecord[],
      table: arr(repeat.raw['tables']) as JsonRecord[],
      paragraph: arr(repeat.raw['paragraphStructElems']) as JsonRecord[],
    };
    repeatCounts.push(Object.fromEntries(KINDS.map(kind => [kind, byKind[kind].length])) as Record<ObservationKind, number>);
    for (const kind of KINDS) {
      for (const item of byKind[kind]) observations.push(normalizeObservation(kind, item, repeat.repeat));
    }
  }
  const grouped = new Map<string, Stage81Observation[]>();
  for (const obs of observations) {
    const key = `${obs.kind}:${obs.key}`;
    grouped.set(key, [...(grouped.get(key) ?? []), obs]);
  }
  const groups = [...grouped.values()].map(group => summarizeObservationGroup(group, input.repeatCount));
  const mergedCounts = Object.fromEntries(KINDS.map(kind => [kind, groups.filter(group => group.kind === kind).length])) as Record<ObservationKind, number>;
  const maxRepeatCounts = Object.fromEntries(KINDS.map(kind => [kind, Math.max(0, ...repeatCounts.map(counts => counts[kind]))])) as Record<ObservationKind, number>;
  const unstableGroups = groups.filter(group => group.intermittent || group.variantCount > 1);
  return {
    repeatCounts,
    mergedCounts,
    maxRepeatCounts,
    groups,
    unstableGroups,
    preservesMaxObservedEvidence: KINDS.every(kind => mergedCounts[kind] >= maxRepeatCounts[kind]),
  };
}

async function runPythonRaw(pdfPath: string): Promise<{ raw: JsonRecord | null; stderr: string; runtimeMs: number; error?: string }> {
  const started = Date.now();
  return new Promise(resolveRun => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (result: { raw: JsonRecord | null; stderr: string; runtimeMs: number; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun(result);
    };
    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, pdfPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PDFAF_SEMANTIC_MCID_MAX_PAGES: String(SEMANTIC_MCID_MAX_PAGES) },
    });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({ raw: null, stderr, runtimeMs: Date.now() - started, error: `python_timeout_${PYTHON_TIMEOUT_MS}ms` });
    }, PYTHON_TIMEOUT_MS);
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => done({ raw: null, stderr, runtimeMs: Date.now() - started, error: error.message }));
    proc.on('close', code => {
      if (!stdout.trim()) return done({ raw: null, stderr, runtimeMs: Date.now() - started, error: `no_stdout_exit_${code}` });
      try {
        done({ raw: JSON.parse(stdout) as JsonRecord, stderr, runtimeMs: Date.now() - started });
      } catch (error) {
        done({ raw: null, stderr, runtimeMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      }
    });
  });
}

async function readRows(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const rows = JSON.parse(await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
}

function rowScore(row?: BenchmarkRow): number | null {
  const value = row?.reanalyzedScore ?? row?.afterScore;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function decideRow(summary: ReturnType<typeof summarizeEvidenceDiff>): Pick<Stage81RowReport, 'safeToImplement' | 'decisionReason'> {
  if (!summary.preservesMaxObservedEvidence) {
    return { safeToImplement: false, decisionReason: 'projected_merge_would_drop_observed_collection_count' };
  }
  const hasIntermittentTables = summary.unstableGroups.some(group => group.kind === 'table' && group.intermittent);
  if (hasIntermittentTables) {
    return { safeToImplement: false, decisionReason: 'intermittent_table_evidence_can_change_scoring_shape' };
  }
  return { safeToImplement: false, decisionReason: 'diagnostic_only_projection_requires_target_validation_before_python_change' };
}

async function buildRowReport(input: {
  id: string;
  runDir: string;
  baselineRows: Map<string, BenchmarkRow>;
  runRows: Map<string, BenchmarkRow>;
  repeats: number;
}): Promise<Stage81RowReport> {
  const pdfPath = join(resolve(input.runDir), 'pdfs', `${input.id}.pdf`);
  let buffer: Buffer;
  try {
    buffer = await readFile(pdfPath);
  } catch {
    return {
      id: input.id,
      pdfPath: null,
      bufferSha256: null,
      runRowScore: rowScore(input.runRows.get(input.id)),
      baselineScore: rowScore(input.baselineRows.get(input.id)),
      repeatCounts: [],
      mergedCounts: Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<ObservationKind, number>,
      maxRepeatCounts: Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<ObservationKind, number>,
      unstableGroupCount: 0,
      intermittentGroupCount: 0,
      preservesMaxObservedEvidence: false,
      safeToImplement: false,
      decisionReason: 'missing_written_pdf',
      topUnstableGroups: [],
      errors: ['missing_written_pdf'],
    };
  }
  const rawRepeats: RawRepeat[] = [];
  for (let repeat = 1; repeat <= input.repeats; repeat += 1) {
    const result = await runPythonRaw(pdfPath);
    rawRepeats.push({ repeat, runtimeMs: result.runtimeMs, raw: result.raw ?? undefined, error: result.error });
  }
  const successful = rawRepeats.filter((repeat): repeat is RawRepeat & { raw: JsonRecord } => Boolean(repeat.raw));
  const summary = summarizeEvidenceDiff({ repeats: successful.map(repeat => ({ repeat: repeat.repeat, raw: repeat.raw })), repeatCount: input.repeats });
  const decision = decideRow(summary);
  const topUnstableGroups = [...summary.unstableGroups]
    .sort((a, b) => b.bestQuality - a.bestQuality || b.observationCount - a.observationCount)
    .slice(0, 20);
  return {
    id: input.id,
    pdfPath,
    bufferSha256: sha256Buffer(buffer),
    runRowScore: rowScore(input.runRows.get(input.id)),
    baselineScore: rowScore(input.baselineRows.get(input.id)),
    repeatCounts: summary.repeatCounts,
    mergedCounts: summary.mergedCounts,
    maxRepeatCounts: summary.maxRepeatCounts,
    unstableGroupCount: summary.unstableGroups.length,
    intermittentGroupCount: summary.unstableGroups.filter(group => group.intermittent).length,
    preservesMaxObservedEvidence: summary.preservesMaxObservedEvidence,
    ...decision,
    topUnstableGroups,
    errors: rawRepeats.map(repeat => repeat.error).filter((error): error is string => Boolean(error)),
  };
}

function parseArgs(argv: string[]): { runDir: string; baselineRun: string; out: string; ids: string[]; repeats: number } {
  const args = {
    runDir: DEFAULT_RUN,
    baselineRun: DEFAULT_BASELINE_RUN,
    out: DEFAULT_OUT,
    ids: DEFAULT_IDS,
    repeats: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/stage81-evidence-diff-diagnostic.ts [options]',
        `  --run <dir>           Default: ${DEFAULT_RUN}`,
        `  --baseline-run <dir>  Default: ${DEFAULT_BASELINE_RUN}`,
        `  --out <dir>           Default: ${DEFAULT_OUT}`,
        '  --ids <csv>           Default: Stage 81 focus rows and controls',
        '  --repeats <n>         Default 5, capped at 10',
      ].join('\n'));
      process.exit(0);
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--run') args.runDir = next;
    else if (arg === '--baseline-run') args.baselineRun = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--repeats') args.repeats = Math.max(1, Math.min(10, Number.parseInt(next, 10) || 5));
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
}

function renderMarkdown(report: { runDir: string; baselineRun: string; repeats: number; rows: Stage81RowReport[] }): string {
  const lines = [
    '# Stage 81 Evidence-Diff Diagnostic',
    '',
    `- Run: \`${report.runDir}\``,
    `- Baseline: \`${report.baselineRun}\``,
    `- Repeats: ${report.repeats}`,
    `- Python helper: \`${PYTHON_SCRIPT_PATH}\``,
    '',
    '## Rows',
    '',
    '| Row | Run/Baseline | Preserves Max Evidence | Safe To Implement | Unstable Groups | Merged Counts | Decision |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.runRowScore ?? 'n/a'} / ${row.baselineScore ?? 'n/a'} | ${row.preservesMaxObservedEvidence ? 'yes' : 'no'} | ${row.safeToImplement ? 'yes' : 'no'} | ${row.unstableGroupCount} (${row.intermittentGroupCount} intermittent) | H${row.mergedCounts.heading} F${row.mergedCounts.figure} CF${row.mergedCounts.checkerFigureTarget} T${row.mergedCounts.table} P${row.mergedCounts.paragraph} | ${row.decisionReason} |`);
  }
  for (const row of report.rows) {
    lines.push('', `### ${row.id}`, `- PDF: \`${row.pdfPath ?? 'missing'}\``, `- Buffer SHA-256: ${row.bufferSha256 ?? 'n/a'}`);
    lines.push(`- Repeat counts: \`${JSON.stringify(row.repeatCounts)}\``);
    if (row.topUnstableGroups.length) {
      lines.push('', '| Kind | Key | Repeats | Variants | Best/Merged Quality | Intermittent |', '| --- | --- | --- | --- | --- | --- |');
      for (const group of row.topUnstableGroups.slice(0, 10)) {
        lines.push(`| ${group.kind} | \`${group.key.slice(0, 120)}\` | ${group.repeatIndexes.join(',')} | ${group.variantCount} | ${group.bestQuality}/${group.mergedQuality} | ${group.intermittent ? 'yes' : 'no'} |`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [runRows, baselineRows] = await Promise.all([readRows(args.runDir), readRows(args.baselineRun)]);
  const rows: Stage81RowReport[] = [];
  for (const id of args.ids) {
    const row = await buildRowReport({ id, runDir: args.runDir, runRows, baselineRows, repeats: args.repeats });
    rows.push(row);
    console.log(`${id}: unstable=${row.unstableGroupCount} preserves=${row.preservesMaxObservedEvidence ? 'yes' : 'no'} safe=${row.safeToImplement ? 'yes' : 'no'}`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    runDir: args.runDir,
    baselineRun: args.baselineRun,
    repeats: args.repeats,
    pythonScriptPath: PYTHON_SCRIPT_PATH,
    rows,
  };
  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage81-evidence-diff-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(out, 'stage81-evidence-diff-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

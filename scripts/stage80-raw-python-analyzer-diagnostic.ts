#!/usr/bin/env tsx
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PYTHON_SCRIPT_PATH, PYTHON_TIMEOUT_MS, SEMANTIC_MCID_MAX_PAGES } from '../src/config.js';
import { sha256Buffer } from '../src/services/benchmark/protectedReanalysisSelection.js';

type JsonRecord = Record<string, unknown>;

export type Stage80VarianceClass =
  | 'nondeterministic_traversal_order'
  | 'capped_collection_instability'
  | 'object_identity_wrapper_instability'
  | 'sampled_page_instability'
  | 'pikepdf_object_access_variance'
  | 'downstream_typescript_only_variance'
  | 'stable_below_floor';

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  reanalyzedScore?: number;
}

export interface Stage80RawRepeat {
  repeat: number;
  runtimeMs: number;
  error?: string;
  stderr?: string;
  counts: JsonRecord;
  signatures: {
    rawStructural: string;
    canonicalStructural: string;
    structureTree: string;
    headings: string;
    figures: string;
    checkerFigureTargets: string;
    tables: string;
    paragraphStructElems: string;
    orphanMcids: string;
    mcidTextSpans: string;
    sampledPages: string;
    objectRefs: string;
  };
}

export interface Stage80ClassificationInput {
  repeats: Stage80RawRepeat[];
  runRowScore?: number | null;
  baselineScore?: number | null;
}

export interface Stage80ClassificationResult {
  classification: Stage80VarianceClass;
  reason: string;
  changedSections: string[];
}

interface Stage80RowReport {
  id: string;
  runDir: string;
  pdfPath: string | null;
  bufferSha256: string | null;
  runRowScore: number | null;
  baselineScore: number | null;
  classification: Stage80VarianceClass;
  reason: string;
  changedSections: string[];
  repeats: Stage80RawRepeat[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-stage79-target-2026-04-26-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage80-raw-python-analyzer-diagnostic-2026-04-26-r1';
const DEFAULT_IDS = ['structure-4076', 'fixture-teams-remediated', 'long-4683', 'long-4470'];

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

function canonicalArray(value: unknown): unknown[] {
  return Array.isArray(value)
    ? [...value].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))
    : [];
}

function structureShape(node: unknown): unknown {
  if (!node || typeof node !== 'object') return null;
  const obj = node as JsonRecord;
  return {
    type: obj['type'] ?? null,
    page: obj['page'] ?? null,
    children: Array.isArray(obj['children']) ? obj['children'].map(structureShape) : [],
  };
}

function canonicalStructureShape(node: unknown): unknown {
  if (!node || typeof node !== 'object') return null;
  const obj = node as JsonRecord;
  const children = Array.isArray(obj['children'])
    ? obj['children'].map(canonicalStructureShape).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))
    : [];
  return { type: obj['type'] ?? null, page: obj['page'] ?? null, children };
}

function objectRefs(items: unknown[]): string[] {
  const out = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const ref = (item as JsonRecord)['structRef'];
    if (typeof ref === 'string' && ref) out.add(ref);
  }
  return [...out].sort();
}

function pagesFromTree(node: unknown, out = new Set<number>()): number[] {
  if (!node || typeof node !== 'object') return [...out].sort((a, b) => a - b);
  const obj = node as JsonRecord;
  const page = obj['page'];
  if (typeof page === 'number' && Number.isFinite(page)) out.add(page);
  if (Array.isArray(obj['children'])) {
    for (const child of obj['children']) pagesFromTree(child, out);
  }
  return [...out].sort((a, b) => a - b);
}

function buildRawParts(raw: JsonRecord): {
  counts: JsonRecord;
  rawStructural: JsonRecord;
  canonicalStructural: JsonRecord;
  sectionValues: Record<keyof Stage80RawRepeat['signatures'], unknown>;
} {
  const headings = Array.isArray(raw['headings']) ? raw['headings'] : [];
  const figures = Array.isArray(raw['figures']) ? raw['figures'] : [];
  const checkerFigureTargets = Array.isArray(raw['checkerFigureTargets']) ? raw['checkerFigureTargets'] : [];
  const tables = Array.isArray(raw['tables']) ? raw['tables'] : [];
  const paragraphStructElems = Array.isArray(raw['paragraphStructElems']) ? raw['paragraphStructElems'] : [];
  const orphanMcids = Array.isArray(raw['orphanMcids']) ? raw['orphanMcids'] : [];
  const mcidTextSpans = Array.isArray(raw['mcidTextSpans']) ? raw['mcidTextSpans'] : [];
  const structureTree = raw['structureTree'] ?? null;
  const refs = objectRefs([...headings, ...figures, ...checkerFigureTargets, ...tables, ...paragraphStructElems]);
  const sampledPages = pagesFromTree(structureTree);

  const counts = {
    isTagged: raw['isTagged'] === true,
    headingCount: headings.length,
    figureCount: figures.length,
    checkerFigureTargetCount: checkerFigureTargets.length,
    checkerFigureWithAltCount: checkerFigureTargets.filter(item => Boolean((item as JsonRecord)?.['hasAlt'])).length,
    tableCount: tables.length,
    paragraphStructElemCount: paragraphStructElems.length,
    orphanMcidCount: orphanMcids.length,
    mcidTextSpanCount: mcidTextSpans.length,
    bookmarkCount: Array.isArray(raw['bookmarks']) ? raw['bookmarks'].length : 0,
    fontCount: Array.isArray(raw['fonts']) ? raw['fonts'].length : 0,
    structureTreePresent: Boolean(structureTree),
    sampledPageCount: sampledPages.length,
    objectRefCount: refs.length,
  };

  const rawStructural = {
    isTagged: raw['isTagged'] ?? null,
    markInfo: raw['markInfo'] ?? null,
    lang: raw['lang'] ?? null,
    pdfUaVersion: raw['pdfUaVersion'] ?? null,
    headings,
    figures,
    checkerFigureTargets,
    tables,
    paragraphStructElems,
    structureTree: structureShape(structureTree),
    orphanMcids,
    mcidTextSpans,
    taggedContentAudit: raw['taggedContentAudit'] ?? null,
    listStructureAudit: raw['listStructureAudit'] ?? null,
    annotationAccessibility: raw['annotationAccessibility'] ?? null,
    acrobatStyleAltRisks: raw['acrobatStyleAltRisks'] ?? null,
  };

  const canonicalStructural = {
    ...rawStructural,
    headings: canonicalArray(headings),
    figures: canonicalArray(figures),
    checkerFigureTargets: canonicalArray(checkerFigureTargets),
    tables: canonicalArray(tables),
    paragraphStructElems: canonicalArray(paragraphStructElems),
    structureTree: canonicalStructureShape(structureTree),
    orphanMcids: canonicalArray(orphanMcids),
    mcidTextSpans: canonicalArray(mcidTextSpans),
  };

  return {
    counts,
    rawStructural,
    canonicalStructural,
    sectionValues: {
      rawStructural,
      canonicalStructural,
      structureTree: structureShape(structureTree),
      headings,
      figures,
      checkerFigureTargets,
      tables,
      paragraphStructElems,
      orphanMcids,
      mcidTextSpans,
      sampledPages,
      objectRefs: refs,
    },
  };
}

function changedSignatureSections(repeats: Stage80RawRepeat[]): string[] {
  const sections = Object.keys(repeats[0]?.signatures ?? {}) as Array<keyof Stage80RawRepeat['signatures']>;
  return sections.filter(section => new Set(repeats.map(repeat => repeat.signatures[section])).size > 1);
}

function countValues(repeats: Stage80RawRepeat[], key: string): number[] {
  return repeats.map(repeat => {
    const value = repeat.counts[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  });
}

function changedCount(repeats: Stage80RawRepeat[], key: string): boolean {
  return new Set(countValues(repeats, key)).size > 1;
}

function anyAtCap(repeats: Stage80RawRepeat[], key: string, cap: number): boolean {
  return countValues(repeats, key).some(value => value >= cap);
}

export function classifyStage80RawAnalyzerRow(input: Stage80ClassificationInput): Stage80ClassificationResult {
  const repeats = input.repeats.filter(repeat => !repeat.error);
  if (repeats.length < 2) {
    return { classification: 'stable_below_floor', reason: 'fewer_than_two_successful_repeats', changedSections: [] };
  }
  const changedSections = changedSignatureSections(repeats);
  if (changedSections.length === 0) {
    return { classification: 'downstream_typescript_only_variance', reason: 'raw_python_output_stable', changedSections };
  }
  const canonicalChanged = changedSections.includes('canonicalStructural');
  const rawChanged = changedSections.includes('rawStructural');
  if (rawChanged && !canonicalChanged) {
    return { classification: 'nondeterministic_traversal_order', reason: 'raw_order_changed_but_canonical_content_stable', changedSections };
  }
  if (
    changedSections.includes('mcidTextSpans') && anyAtCap(repeats, 'mcidTextSpanCount', 500) ||
    changedSections.includes('orphanMcids') && anyAtCap(repeats, 'orphanMcidCount', 64)
  ) {
    return { classification: 'capped_collection_instability', reason: 'bounded_collection_changed_at_known_cap', changedSections };
  }
  if (changedSections.includes('sampledPages') || changedCount(repeats, 'sampledPageCount')) {
    return { classification: 'sampled_page_instability', reason: 'structure_page_set_changed_between_repeats', changedSections };
  }
  if (changedSections.includes('objectRefs') || changedCount(repeats, 'objectRefCount')) {
    return { classification: 'object_identity_wrapper_instability', reason: 'struct_object_reference_set_changed_between_repeats', changedSections };
  }
  return { classification: 'pikepdf_object_access_variance', reason: 'raw_python_structural_content_changed', changedSections };
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
      env: {
        ...process.env,
        PDFAF_SEMANTIC_MCID_MAX_PAGES: String(SEMANTIC_MCID_MAX_PAGES),
      },
    });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({ raw: null, stderr, runtimeMs: Date.now() - started, error: `python_timeout_${PYTHON_TIMEOUT_MS}ms` });
    }, PYTHON_TIMEOUT_MS);
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => {
      done({ raw: null, stderr, runtimeMs: Date.now() - started, error: error.message });
    });
    proc.on('close', code => {
      if (!stdout.trim()) {
        done({ raw: null, stderr, runtimeMs: Date.now() - started, error: `no_stdout_exit_${code}` });
        return;
      }
      try {
        done({ raw: JSON.parse(stdout) as JsonRecord, stderr, runtimeMs: Date.now() - started });
      } catch (error) {
        done({ raw: null, stderr, runtimeMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      }
    });
  });
}

async function rawRepeat(pdfPath: string, repeat: number): Promise<Stage80RawRepeat> {
  const result = await runPythonRaw(pdfPath);
  if (!result.raw) {
    return {
      repeat,
      runtimeMs: result.runtimeMs,
      error: result.error ?? 'python_failed',
      stderr: result.stderr.trim() || undefined,
      counts: {},
      signatures: {
        rawStructural: 'error',
        canonicalStructural: 'error',
        structureTree: 'error',
        headings: 'error',
        figures: 'error',
        checkerFigureTargets: 'error',
        tables: 'error',
        paragraphStructElems: 'error',
        orphanMcids: 'error',
        mcidTextSpans: 'error',
        sampledPages: 'error',
        objectRefs: 'error',
      },
    };
  }
  const parts = buildRawParts(result.raw);
  return {
    repeat,
    runtimeMs: result.runtimeMs,
    stderr: result.stderr.trim() || undefined,
    counts: parts.counts,
    signatures: Object.fromEntries(
      Object.entries(parts.sectionValues).map(([key, value]) => [key, signature(value)]),
    ) as Stage80RawRepeat['signatures'],
  };
}

async function readRows(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const raw = await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8');
  const rows = JSON.parse(raw) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
}

function rowScore(row?: BenchmarkRow): number | null {
  const value = row?.reanalyzedScore ?? row?.afterScore;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
        'Usage: pnpm exec tsx scripts/stage80-raw-python-analyzer-diagnostic.ts [options]',
        `  --run <dir>           Benchmark run dir with pdfs/<row-id>.pdf artifacts. Default: ${DEFAULT_RUN}`,
        `  --baseline-run <dir>  Default: ${DEFAULT_BASELINE_RUN}`,
        `  --out <dir>           Default: ${DEFAULT_OUT}`,
        '  --ids <csv>           Default: Stage 79 same-buffer focus rows',
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

async function buildRowReport(input: {
  id: string;
  runDir: string;
  runRows: Map<string, BenchmarkRow>;
  baselineRows: Map<string, BenchmarkRow>;
  repeats: number;
}): Promise<Stage80RowReport> {
  const pdfPath = join(resolve(input.runDir), 'pdfs', `${input.id}.pdf`);
  let buffer: Buffer | null = null;
  try {
    buffer = await readFile(pdfPath);
  } catch {
    return {
      id: input.id,
      runDir: input.runDir,
      pdfPath: null,
      bufferSha256: null,
      runRowScore: rowScore(input.runRows.get(input.id)),
      baselineScore: rowScore(input.baselineRows.get(input.id)),
      classification: 'stable_below_floor',
      reason: 'missing_written_pdf',
      changedSections: [],
      repeats: [],
    };
  }
  const repeats: Stage80RawRepeat[] = [];
  for (let i = 1; i <= input.repeats; i += 1) {
    repeats.push(await rawRepeat(pdfPath, i));
  }
  const classified = classifyStage80RawAnalyzerRow({
    repeats,
    runRowScore: rowScore(input.runRows.get(input.id)),
    baselineScore: rowScore(input.baselineRows.get(input.id)),
  });
  return {
    id: input.id,
    runDir: input.runDir,
    pdfPath,
    bufferSha256: sha256Buffer(buffer),
    runRowScore: rowScore(input.runRows.get(input.id)),
    baselineScore: rowScore(input.baselineRows.get(input.id)),
    classification: classified.classification,
    reason: classified.reason,
    changedSections: classified.changedSections,
    repeats,
  };
}

function renderMarkdown(report: { runDir: string; baselineRun: string; repeats: number; rows: Stage80RowReport[] }): string {
  const lines = [
    '# Stage 80 Raw Python Analyzer Diagnostic',
    '',
    `- Run: \`${report.runDir}\``,
    `- Baseline: \`${report.baselineRun}\``,
    `- Repeats: ${report.repeats}`,
    `- Python helper: \`${PYTHON_SCRIPT_PATH}\``,
    '',
    '## Classification Counts',
    '',
  ];
  const counts = new Map<string, number>();
  for (const row of report.rows) counts.set(row.classification, (counts.get(row.classification) ?? 0) + 1);
  for (const [key, value] of [...counts.entries()].sort()) lines.push(`- ${key}: ${value}`);
  lines.push('', '## Rows', '', '| Row | Classification | Run/Baseline | Changed sections | Key counts by repeat |', '| --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const keyCounts = row.repeats.map(repeat => {
      const c = repeat.counts;
      return `r${repeat.repeat}:H${c.headingCount ?? '?'} F${c.figureCount ?? '?'} T${c.tableCount ?? '?'} P${c.paragraphStructElemCount ?? '?'} O${c.orphanMcidCount ?? '?'} M${c.mcidTextSpanCount ?? '?'}`;
    }).join('<br>');
    lines.push(`| ${row.id} | ${row.classification}<br>${row.reason} | ${row.runRowScore ?? 'n/a'} / ${row.baselineScore ?? 'n/a'} | ${row.changedSections.join(', ') || 'none'} | ${keyCounts || 'n/a'} |`);
  }
  for (const row of report.rows) {
    lines.push('', `### ${row.id}`, `- Buffer SHA-256: ${row.bufferSha256 ?? 'n/a'}`, `- PDF: \`${row.pdfPath ?? 'missing'}\``);
    for (const repeat of row.repeats) {
      lines.push(`- Repeat ${repeat.repeat}: runtimeMs=${repeat.runtimeMs}${repeat.error ? ` error=${repeat.error}` : ''}`);
      lines.push(`  - counts: \`${JSON.stringify(repeat.counts)}\``);
      lines.push(`  - signatures: \`${JSON.stringify(repeat.signatures)}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [runRows, baselineRows] = await Promise.all([readRows(args.runDir), readRows(args.baselineRun)]);
  const rows: Stage80RowReport[] = [];
  for (const id of args.ids) {
    const row = await buildRowReport({ id, runDir: args.runDir, runRows, baselineRows, repeats: args.repeats });
    rows.push(row);
    console.log(`${id}: ${row.classification} (${row.changedSections.join(', ') || 'none'})`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    runDir: args.runDir,
    baselineRun: args.baselineRun,
    repeats: args.repeats,
    pythonScriptPath: PYTHON_SCRIPT_PATH,
    pdfsDir: join(resolve(args.runDir), 'pdfs'),
    rows,
  };
  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage80-raw-python-analyzer-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(out, 'stage80-raw-python-analyzer-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

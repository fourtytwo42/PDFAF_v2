#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_SCRIPT_PATH, PYTHON_TIMEOUT_MS } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage131DegenerateNative,
  type DegenerateNativeAnchorCandidate,
  type Stage131DegenerateNativeClass,
} from '../src/services/remediation/degenerateNativeStructure.js';

interface Args {
  runDir: string;
  manifestPath: string;
  outDir: string;
  ids: string[];
}

interface ManifestRow {
  publicationId: string;
  title: string;
  localFile: string;
  problemMix?: string[];
}

interface BenchmarkRow {
  id: string;
  publicationId: string;
  title?: string;
  file?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: string; score: number; applicable?: boolean }>;
  afterDetectionProfile?: unknown;
  appliedTools?: Array<{ toolName: string; outcome: string; delta?: number; details?: string }>;
}

interface RawShape {
  structTreeRoot: boolean;
  rootKType: string;
  parentTreeNums: number;
  page0BdcCount: number;
  page0McidCount: number;
  page0BtCount: number;
  page0EtCount: number;
  error?: string;
}

interface Stage131DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  classification: Stage131DegenerateNativeClass;
  candidate: DegenerateNativeAnchorCandidate | null;
  afterClassification: Stage131DegenerateNativeClass;
  afterCandidate: DegenerateNativeAnchorCandidate | null;
  categories: Record<string, number>;
  shape: {
    textCharCount: number;
    pageCount: number;
    structureDepth: number | null;
    rootKShape: string;
    parentTreeShape: string;
    pageTabsMissing: number;
    linkMissingStructure: number;
    linkMissingStructParent: number;
  };
  rawShape: RawShape;
  firstPageText: string;
  toolTimeline: Array<{ toolName: string; outcome: string; delta: number | null; note: string | null }>;
}

interface Stage131DiagnosticReport {
  generatedAt: string;
  runDir: string;
  manifestPath: string;
  rows: Stage131DiagnosticRow[];
  classificationDistribution: Record<string, number>;
  recommendation: string;
}

const DEFAULT_IDS = ['4002', '4737', '3423', '3429', '3433', '4156', '4172', '4699'];

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage131-degenerate-native-diagnostic.ts --run <run-dir> --manifest <manifest.json> [options]

Options:
  --id <id>       Publication id or v1-<id> row id to include; repeatable
  --ids <csv>     Comma-separated ids (default: ${DEFAULT_IDS.join(',')})
  --out <dir>     Output directory (default: <run-dir>/stage131-degenerate-native-diagnostic)
  --help          Show this help`;
}

function parseArgs(argv = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'))): Args {
  let runDir = '';
  let manifestPath = '';
  let outDir = '';
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--run') runDir = argv[++i] ?? '';
    else if (arg === '--manifest') manifestPath = argv[++i] ?? '';
    else if (arg === '--out') outDir = argv[++i] ?? '';
    else if (arg === '--id') ids.push((argv[++i] ?? '').replace(/^v1-/, ''));
    else if (arg === '--ids') ids.push(...(argv[++i] ?? '').split(',').map(id => id.trim().replace(/^v1-/, '')).filter(Boolean));
  }
  if (!runDir || !manifestPath) throw new Error(usage());
  return {
    runDir: resolve(runDir),
    manifestPath: resolve(manifestPath),
    outDir: outDir ? resolve(outDir) : join(resolve(runDir), 'stage131-degenerate-native-diagnostic'),
    ids: ids.length > 0 ? ids : DEFAULT_IDS,
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function categoryMap(row: BenchmarkRow): Record<string, number> {
  return Object.fromEntries((row.afterCategories ?? []).map(category => [category.key, category.score]));
}

function categoryScore(row: BenchmarkRow, key: string): number | null {
  const category = row.afterCategories?.find(item => item.key === key);
  return typeof category?.score === 'number' ? category.score : null;
}

function nestedNumber(value: unknown, path: string[]): number | null {
  let cur = value;
  for (const key of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
}

function parseToolNote(details: unknown): string | null {
  if (typeof details !== 'string') return null;
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof parsed['note'] === 'string'
      ? parsed['note']
      : typeof parsed['raw'] === 'string'
        ? parsed['raw']
        : null;
  } catch {
    return null;
  }
}

function pdfArtifactName(row: BenchmarkRow): string | null {
  const safeTitle = (row.file ?? row.title ?? '').split('/').pop()?.replace(/\.pdf$/i, '') ?? '';
  if (!safeTitle) return null;
  return `${row.publicationId}-${safeTitle}.remediated.pdf`;
}

async function rawShape(pdfPath: string): Promise<RawShape> {
  return new Promise(resolveRun => {
    let stdout = '';
    let stderr = '';
    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, '--stage131-shape', pdfPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolveRun({ structTreeRoot: false, rootKType: 'unknown', parentTreeNums: 0, page0BdcCount: 0, page0McidCount: 0, page0BtCount: 0, page0EtCount: 0, error: `timeout_${PYTHON_TIMEOUT_MS}ms` });
    }, PYTHON_TIMEOUT_MS);
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('close', () => {
      clearTimeout(timer);
      try {
        resolveRun(JSON.parse(stdout) as RawShape);
      } catch {
        resolveRun({ structTreeRoot: false, rootKType: 'unknown', parentTreeNums: 0, page0BdcCount: 0, page0McidCount: 0, page0BtCount: 0, page0EtCount: 0, error: stderr || 'shape_parse_failed' });
      }
    });
  });
}

async function pdfPathForRow(args: Args, row: BenchmarkRow, manifestRow?: ManifestRow): Promise<string> {
  const artifact = pdfArtifactName(row);
  if (artifact) {
    const candidate = join(args.runDir, artifact);
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // Fall back to source manifest path.
    }
  }
  return join(dirname(args.manifestPath), manifestRow?.localFile ?? row.file ?? '');
}

function sourcePdfPath(args: Args, row: BenchmarkRow, manifestRow?: ManifestRow): string {
  return join(dirname(args.manifestPath), manifestRow?.localFile ?? row.file ?? '');
}

function renderMarkdown(report: Stage131DiagnosticReport): string {
  const lines = [
    '# Stage 131 Degenerate Native Diagnostic',
    '',
    `Run: \`${report.runDir}\``,
    `Manifest: \`${report.manifestPath}\``,
    '',
    `Recommendation: \`${report.recommendation}\``,
    '',
    '| Class | Count |',
    '| --- | ---: |',
  ];
  for (const [key, count] of Object.entries(report.classificationDistribution).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push('', '## Rows', '', '| ID | Score | Before class | After class | Candidate | Shape | Raw | Tools |', '| --- | ---: | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const candidate = row.candidate ? `${row.candidate.source} page=${row.candidate.page} score=${row.candidate.score}` : 'none';
    const shape = `text=${row.shape.textCharCount} pages=${row.shape.pageCount} depth=${row.shape.structureDepth ?? 'n/a'} tabsMissing=${row.shape.pageTabsMissing} links=${row.shape.linkMissingStructure}/${row.shape.linkMissingStructParent}`;
    const raw = `K=${row.rawShape.rootKType} PT=${row.rawShape.parentTreeNums} BDC=${row.rawShape.page0BdcCount} MCID=${row.rawShape.page0McidCount} BT=${row.rawShape.page0BtCount}`;
    const tools = row.toolTimeline.filter(tool => tool.outcome === 'applied').map(tool => tool.toolName).join(',') || 'none';
    lines.push(`| ${row.id} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.classification} | ${row.afterClassification} | ${candidate} | ${shape} | ${raw} | ${tools} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function buildStage131DiagnosticReport(args: Args): Promise<Stage131DiagnosticReport> {
  const rows = await readJson<BenchmarkRow[]>(join(args.runDir, 'remediate.results.json'));
  const manifest = await readJson<{ rows: ManifestRow[] }>(args.manifestPath);
  const manifestById = new Map(manifest.rows.map(row => [row.publicationId, row]));
  const requested = new Set(args.ids);
  const outRows: Stage131DiagnosticRow[] = [];

  for (const row of rows) {
    const id = row.publicationId ?? row.id.replace(/^v1-/, '');
    if (!requested.has(id) && !requested.has(row.id.replace(/^v1-/, ''))) continue;
    const manifestRow = manifestById.get(id);
    const sourcePath = sourcePdfPath(args, row, manifestRow);
    const finalPath = await pdfPathForRow(args, row, manifestRow);
    const { result: beforeResult, snapshot: beforeSnapshot } = await analyzePdf(sourcePath, row.file ?? row.title ?? `${id}.pdf`, { bypassCache: true });
    const { result: afterResult, snapshot } = await analyzePdf(finalPath, row.file ?? row.title ?? `${id}.pdf`, { bypassCache: true });
    const disposition = classifyStage131DegenerateNative(beforeResult, beforeSnapshot);
    const afterDisposition = classifyStage131DegenerateNative(afterResult, snapshot);
    const shapeRaw = await rawShape(finalPath);
    outRows.push({
      id: row.id,
      publicationId: id,
      title: manifestRow?.title ?? row.title ?? id,
      localFile: manifestRow?.localFile ?? row.file ?? '',
      beforeScore: typeof row.beforeScore === 'number' ? row.beforeScore : null,
      afterScore: typeof row.afterScore === 'number' ? row.afterScore : null,
      afterGrade: row.afterGrade ?? null,
      classification: disposition.classification,
      candidate: disposition.candidate,
      afterClassification: afterDisposition.classification,
      afterCandidate: afterDisposition.candidate,
      categories: categoryMap(row),
      shape: {
        textCharCount: snapshot.textCharCount,
        pageCount: snapshot.pageCount,
        structureDepth: nestedNumber(row.afterDetectionProfile, ['readingOrderSignals', 'structureTreeDepth']) ?? snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? null,
        rootKShape: snapshot.structureTree ? snapshot.structureTree.type : 'none',
        parentTreeShape: `${snapshot.taggedContentAudit?.mcidTextSpanCount ?? 0}_mcid_spans`,
        pageTabsMissing: snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0,
        linkMissingStructure: snapshot.annotationAccessibility?.linkAnnotationsMissingStructure ?? 0,
        linkMissingStructParent: snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0,
      },
      rawShape: shapeRaw,
      firstPageText: (snapshot.textByPage[0] ?? '').slice(0, 500),
      toolTimeline: (row.appliedTools ?? []).map(tool => ({
        toolName: tool.toolName,
        outcome: tool.outcome,
        delta: typeof tool.delta === 'number' ? tool.delta : null,
        note: parseToolNote(tool.details),
      })),
    });
  }
  const classificationDistribution: Record<string, number> = {};
  for (const row of outRows) {
    classificationDistribution[row.classification] = (classificationDistribution[row.classification] ?? 0) + 1;
  }
  const candidateCount =
    (classificationDistribution['degenerate_native_title_anchor_candidate'] ?? 0) +
    (classificationDistribution['degenerate_native_text_block_candidate'] ?? 0);
  const recommendation = candidateCount > 0
    ? 'try_guarded_degenerate_native_structure_recovery'
    : 'diagnostic_only_no_safe_degenerate_native_anchor';
  return {
    generatedAt: new Date().toISOString(),
    runDir: args.runDir,
    manifestPath: args.manifestPath,
    rows: outRows,
    classificationDistribution,
    recommendation,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await buildStage131DiagnosticReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage131-degenerate-native-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage131-degenerate-native-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 131 diagnostic to ${args.outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

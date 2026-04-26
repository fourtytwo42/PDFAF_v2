#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage127ZeroHeadingAnchor,
  type Stage127ZeroHeadingClass,
  type VisibleHeadingAnchorCandidate,
} from '../src/services/remediation/visibleHeadingAnchor.js';

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
  title: string;
  localFile: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  problemMix?: string[];
  afterCategories?: Array<{ key: string; score: number; applicable?: boolean }>;
  afterDetectionProfile?: unknown;
  appliedTools?: Array<{ toolName: string; outcome: string; delta?: number; details?: string }>;
}

export interface Stage127DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  headingScoreAfter: number | null;
  classification: Stage127ZeroHeadingClass;
  candidate: VisibleHeadingAnchorCandidate | null;
  reasons: string[];
  toolTimeline: Array<{ toolName: string; outcome: string; delta: number | null; note: string | null }>;
}

export interface Stage127DiagnosticReport {
  generatedAt: string;
  runDir: string;
  manifestPath: string;
  rows: Stage127DiagnosticRow[];
  classificationDistribution: Record<string, number>;
  recommendation: string;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage127-zero-heading-anchor-diagnostic.ts --run <run-dir> --manifest <manifest.json> [options]

Options:
  --id <id>       Publication id or v1-<id> row id to include; repeatable
  --out <dir>     Output directory (default: <run-dir>/stage127-zero-heading-anchor-diagnostic)
  --help          Show this help`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
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
  }
  if (!runDir || !manifestPath) {
    throw new Error(usage());
  }
  return {
    runDir: resolve(runDir),
    manifestPath: resolve(manifestPath),
    outDir: outDir ? resolve(outDir) : join(resolve(runDir), 'stage127-zero-heading-anchor-diagnostic'),
    ids,
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function categoryScore(row: BenchmarkRow, key: string): number | null {
  const category = row.afterCategories?.find(item => item.key === key);
  return typeof category?.score === 'number' ? category.score : null;
}

function parseToolNote(details: unknown): string | null {
  if (typeof details !== 'string') return null;
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed['note'] === 'string') return parsed['note'];
    if (typeof parsed['raw'] === 'string') return parsed['raw'];
  } catch {
    return null;
  }
  return null;
}

function nestedNumber(value: unknown, path: string[]): number | null {
  let cur = value;
  for (const key of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
}

function rowFallbackClassification(row: BenchmarkRow, current: Stage127ZeroHeadingClass): { classification: Stage127ZeroHeadingClass; reasons: string[] } {
  if (current === 'visible_anchor_candidate') return { classification: current, reasons: [] };
  const problemMix = row.problemMix ?? [];
  const tools = row.appliedTools ?? [];
  if (
    problemMix.some(value => /manual|scanned/i.test(value)) ||
    tools.some(tool => tool.toolName === 'ocr_scanned_pdf' && tool.outcome === 'applied') ||
    tools.some(tool => tool.toolName === 'tag_native_text_blocks' && /ocr_pdf/i.test(String(tool.details ?? '')))
  ) {
    return { classification: 'ocr_page_shell_defer', reasons: ['benchmark_row_ocr_or_manual_policy_signal'] };
  }
  const depth = nestedNumber(row.afterDetectionProfile, ['readingOrderSignals', 'structureTreeDepth']);
  const missingLinkStruct = nestedNumber(row.afterDetectionProfile, ['annotationSignals', 'linkAnnotationsMissingStructure']) ?? 0;
  if (depth !== null && depth <= 1) {
    return { classification: 'degenerate_marked_content_no_candidate', reasons: [`reanalyzed_depth:${depth}`] };
  }
  if (missingLinkStruct > 0 || tools.some(tool => /link|annotation/i.test(tool.toolName))) {
    return { classification: 'link_only_no_heading_candidate', reasons: ['link_annotation_route_without_heading_anchor'] };
  }
  return { classification: current, reasons: [] };
}

function shouldIncludeRow(row: BenchmarkRow, requestedIds: Set<string>): boolean {
  if (requestedIds.size > 0) {
    return requestedIds.has(row.publicationId) || requestedIds.has(row.id.replace(/^v1-/, ''));
  }
  return row.afterGrade === 'F' && categoryScore(row, 'heading_structure') === 0;
}

function renderMarkdown(report: Stage127DiagnosticReport): string {
  const lines: string[] = [
    '# Stage 127 Zero-Heading Anchor Diagnostic',
    '',
    `Run: \`${report.runDir}\``,
    `Manifest: \`${report.manifestPath}\``,
    '',
    '## Summary',
    '',
    `Recommendation: \`${report.recommendation}\``,
    '',
    '| Class | Count |',
    '| --- | ---: |',
  ];
  for (const [key, count] of Object.entries(report.classificationDistribution).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push('', '## Rows', '', '| ID | Score | Class | Candidate | Reasons |', '| --- | ---: | --- | --- | --- |');
  for (const row of report.rows) {
    const candidate = row.candidate
      ? `${row.candidate.source} page=${row.candidate.page} mcid=${row.candidate.mcid ?? 'n/a'} score=${row.candidate.score}`
      : 'none';
    lines.push(`| ${row.id} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.classification} | ${candidate} | ${row.reasons.join('; ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function buildStage127DiagnosticReport(args: Args): Promise<Stage127DiagnosticReport> {
  const rows = await readJson<BenchmarkRow[]>(join(args.runDir, 'remediate.results.json'));
  const manifest = await readJson<{ rows: ManifestRow[] }>(args.manifestPath);
  const manifestById = new Map(manifest.rows.map(row => [row.publicationId, row]));
  const requestedIds = new Set(args.ids);
  const outRows: Stage127DiagnosticRow[] = [];
  const manifestRoot = dirname(args.manifestPath);

  for (const row of rows) {
    if (!shouldIncludeRow(row, requestedIds)) continue;
    const manifestRow = manifestById.get(row.publicationId);
    const localFile = manifestRow?.localFile ?? row.localFile;
    const pdfPath = join(manifestRoot, localFile);
    const { result, snapshot } = await analyzePdf(pdfPath, { bypassCache: true });
    const disposition = classifyStage127ZeroHeadingAnchor(result, snapshot);
    const fallback = rowFallbackClassification(row, disposition.classification);
    const classification = fallback.classification;
    outRows.push({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      localFile,
      beforeScore: typeof row.beforeScore === 'number' ? row.beforeScore : null,
      afterScore: typeof row.afterScore === 'number' ? row.afterScore : null,
      afterGrade: row.afterGrade ?? null,
      headingScoreAfter: categoryScore(row, 'heading_structure'),
      classification,
      candidate: disposition.candidate,
      reasons: [...fallback.reasons, ...disposition.reasons],
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
  const visible = classificationDistribution['visible_anchor_candidate'] ?? 0;
  const recommendation = visible > 0
    ? 'implement_visible_anchor_heading_recovery'
    : 'diagnostic_only_no_safe_visible_anchor';

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
  const report = await buildStage127DiagnosticReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage127-zero-heading-anchor-diagnostic.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(join(args.outDir, 'stage127-zero-heading-anchor-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 127 diagnostic to ${args.outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

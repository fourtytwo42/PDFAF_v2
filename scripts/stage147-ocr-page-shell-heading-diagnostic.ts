#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage129OcrPageShell,
  debugOcrPageShellHeadingSelection,
  selectOcrPageShellHeadingCandidate,
} from '../src/services/remediation/ocrPageShellHeading.js';
import type { AnalysisResult } from '../src/types.js';

interface Args {
  runDir: string;
  outDir: string;
  ids: string[];
}

interface BenchmarkRow {
  id: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterCategories?: AnalysisResult['categories'];
  appliedTools?: Array<{ toolName: string; outcome: string; details?: string; scoreAfter?: number }>;
}

interface DiagnosticRow {
  id: string;
  publicationId: string;
  file: string;
  after: string;
  classification: string;
  reasons: string[];
  candidate: null | {
    text: string;
    source: string;
    score: number;
    page: number;
    mcid: number;
    mcids: number[];
    reasons: string[];
  };
  lowCategories: Record<string, number>;
  ocrShape: null | {
    pdfClass: string;
    pageCount: number;
    textCharCount: number;
    structureTreeDepth: number | null;
    paragraphStructElemCount: number;
    mcidTextSpanCount: number;
    engineAppliedOcr: boolean;
    engineTaggedOcrText: boolean;
  };
  firstPageLineCandidates: string[];
  seedDiagnostics: ReturnType<typeof debugOcrPageShellHeadingSelection>['seeds'];
  firstPageMcidSpanSamples: ReturnType<typeof debugOcrPageShellHeadingSelection>['firstPageMcidSpanSamples'];
  paragraphSamples: ReturnType<typeof debugOcrPageShellHeadingSelection>['paragraphSamples'];
  acceptedTools: string[];
}

const DEFAULT_RUN = 'Output/stage145-low-grade-tail/run-stage146-active-tail-2026-04-28-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage147-ocr-page-shell-heading-diagnostic-2026-04-28-r1';
const DEFAULT_IDS = ['3451', '3459', '3513', '3602', '4519', '4690', '4754', '4737', '4002', '4156', '4172', '4699'];

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage147-ocr-page-shell-heading-diagnostic.ts [options]

Options:
  --run <dir>   Benchmark run directory with remediated PDFs (default: ${DEFAULT_RUN})
  --out <dir>   Output directory (default: ${DEFAULT_OUT})
  --id <id>     Row id/publication id substring to inspect; repeatable
  --ids <csv>   Comma-separated ids`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  let runDir = DEFAULT_RUN;
  let outDir = DEFAULT_OUT;
  const ids: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--run') runDir = argv[++index] ?? runDir;
    else if (arg === '--out') outDir = argv[++index] ?? outDir;
    else if (arg === '--id') ids.push(argv[++index] ?? '');
    else if (arg === '--ids') ids.push(...(argv[++index] ?? '').split(',').map(value => value.trim()).filter(Boolean));
    else throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }
  return {
    runDir: resolve(runDir),
    outDir: resolve(outDir),
    ids: ids.length > 0 ? ids : DEFAULT_IDS,
  };
}

function rowKey(row: BenchmarkRow): string {
  return [row.id, row.publicationId, row.file, row.localFile].filter(Boolean).join(' ');
}

function rowMatches(row: BenchmarkRow, ids: string[]): boolean {
  const key = rowKey(row);
  return ids.some(id => key.includes(id));
}

async function readRows(runDir: string): Promise<BenchmarkRow[]> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  return Array.isArray(parsed) ? parsed as BenchmarkRow[] : [];
}

async function findRemediatedPdf(runDir: string, row: BenchmarkRow): Promise<string | null> {
  const names = await readdir(runDir).catch(() => []);
  const ids = [row.id, row.publicationId].filter((value): value is string => typeof value === 'string' && value.length > 0);
  const found = names
    .filter(name => name.endsWith('.remediated.pdf'))
    .find(name => ids.some(id => name.startsWith(`${id}-`) || name.includes(id)));
  return found ? join(runDir, found) : null;
}

function lowCategories(categories: AnalysisResult['categories'] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? [])
    .filter(category => category.applicable !== false && typeof category.score === 'number' && category.score < 80)
    .map(category => [category.key, category.score]));
}

function acceptedTools(row: BenchmarkRow): string[] {
  return (row.appliedTools ?? [])
    .filter(tool => tool.outcome === 'applied')
    .map(tool => tool.toolName);
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function appliedOcrHeadingCandidate(row: BenchmarkRow): DiagnosticRow['candidate'] {
  const tool = (row.appliedTools ?? []).find(item =>
    item.toolName === 'create_heading_from_ocr_page_shell_anchor' &&
    item.outcome === 'applied',
  );
  const details = parseDetails(tool?.details);
  const debug = details?.['debug'];
  if (!tool || !debug || typeof debug !== 'object' || Array.isArray(debug)) return null;
  const obj = debug as Record<string, unknown>;
  const mcids = Array.isArray(obj['mcids'])
    ? obj['mcids'].map(value => Number(value)).filter(value => Number.isInteger(value))
    : [];
  const mcid = Number(obj['mcid'] ?? mcids[0]);
  return {
    text: typeof obj['visibleText'] === 'string' ? obj['visibleText'] : '',
    source: 'applied_tool_debug',
    score: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : 0,
    page: Number(obj['page'] ?? 0),
    mcid: Number.isInteger(mcid) ? mcid : 0,
    mcids,
    reasons: ['create_heading_from_ocr_page_shell_anchor_applied'],
  };
}

async function buildRow(runDir: string, row: BenchmarkRow): Promise<DiagnosticRow> {
  const pdfPath = await findRemediatedPdf(runDir, row);
  if (!pdfPath) {
    return {
      id: row.id,
      publicationId: row.publicationId ?? row.id,
      file: row.localFile ?? row.file ?? '',
      after: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
      classification: 'missing_remediated_pdf',
      reasons: ['run_did_not_write_pdf_for_row'],
      candidate: null,
      lowCategories: lowCategories(row.afterCategories),
      ocrShape: null,
      firstPageLineCandidates: [],
      seedDiagnostics: [],
      firstPageMcidSpanSamples: [],
      paragraphSamples: [],
      acceptedTools: acceptedTools(row),
    };
  }
  const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const disposition = classifyStage129OcrPageShell(analyzed.result, analyzed.snapshot);
  const candidate = selectOcrPageShellHeadingCandidate(analyzed.result, analyzed.snapshot);
  const debug = debugOcrPageShellHeadingSelection(analyzed.result, analyzed.snapshot);
  const reading = analyzed.snapshot.detectionProfile?.readingOrderSignals;
  const appliedCandidate = appliedOcrHeadingCandidate(row);
  return {
    id: row.id,
    publicationId: row.publicationId ?? row.id,
    file: row.localFile ?? row.file ?? '',
    after: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
    classification: appliedCandidate ? 'ocr_heading_anchor_applied' : disposition.classification,
    reasons: appliedCandidate?.reasons ?? disposition.reasons,
    candidate: appliedCandidate ?? (candidate
      ? {
        text: candidate.text,
        source: candidate.source,
        score: candidate.score,
        page: candidate.page,
        mcid: candidate.mcid,
        mcids: candidate.mcids,
        reasons: candidate.reasons,
      }
      : null),
    lowCategories: lowCategories(row.afterCategories),
    ocrShape: {
      pdfClass: analyzed.result.pdfClass,
      pageCount: analyzed.snapshot.pageCount,
      textCharCount: analyzed.snapshot.textCharCount,
      structureTreeDepth: reading?.structureTreeDepth ?? null,
      paragraphStructElemCount: analyzed.snapshot.paragraphStructElems?.length ?? 0,
      mcidTextSpanCount: analyzed.snapshot.mcidTextSpans?.length ?? 0,
      engineAppliedOcr: analyzed.snapshot.remediationProvenance?.engineAppliedOcr === true,
      engineTaggedOcrText: analyzed.snapshot.remediationProvenance?.engineTaggedOcrText === true,
    },
    firstPageLineCandidates: debug.firstPageLineCandidates,
    seedDiagnostics: debug.seeds,
    firstPageMcidSpanSamples: debug.firstPageMcidSpanSamples,
    paragraphSamples: debug.paragraphSamples,
    acceptedTools: acceptedTools(row),
  };
}

function renderMarkdown(rows: DiagnosticRow[]): string {
  const distribution = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# Stage 147 OCR Page-Shell Heading Diagnostic',
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(distribution).sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | After | Class | Candidate | Low categories | OCR shape | Seed summary |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const candidate = row.candidate
      ? `${row.candidate.text} (${row.candidate.score}, MCIDs ${row.candidate.mcids.join('/')})`
      : 'none';
    const shape = row.ocrShape
      ? `text=${row.ocrShape.textCharCount} depth=${row.ocrShape.structureTreeDepth ?? 'n/a'} P=${row.ocrShape.paragraphStructElemCount} MCID=${row.ocrShape.mcidTextSpanCount}`
      : 'n/a';
    const seeds = row.seedDiagnostics.map(seed =>
      `${seed.source}:${seed.text}:${seed.score ?? 'no-score'}:${seed.mcids.length ? seed.mcids.join('/') : 'no-mcid'}`,
    ).join('<br>') || 'none';
    lines.push(`| ${row.publicationId} | ${row.after} | ${row.classification} | ${candidate} | ${Object.entries(row.lowCategories).map(([key, value]) => `${key}:${value}`).join(', ') || 'none'} | ${shape} | ${seeds} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const rows = (await readRows(args.runDir)).filter(row => rowMatches(row, args.ids));
  const diagnosticRows: DiagnosticRow[] = [];
  for (const row of rows) diagnosticRows.push(await buildRow(args.runDir, row));
  const report = {
    generatedAt: new Date().toISOString(),
    runDir: args.runDir,
    ids: args.ids,
    rows: diagnosticRows,
  };
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage147-ocr-page-shell-heading-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage147-ocr-page-shell-heading-diagnostic.md'), renderMarkdown(diagnosticRows), 'utf8');
  console.log(`Wrote Stage 147 OCR page-shell heading diagnostic to ${args.outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

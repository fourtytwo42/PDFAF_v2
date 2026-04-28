#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage129OcrPageShell,
  selectOcrPageShellHeadingCandidate,
} from '../src/services/remediation/ocrPageShellHeading.js';
import type { AnalysisResult } from '../src/types.js';

interface Args {
  runDirs: string[];
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
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  afterCategories?: AnalysisResult['categories'];
  reanalyzedCategories?: AnalysisResult['categories'];
  appliedTools?: Array<{ toolName: string; outcome: string; scoreAfter?: number; details?: string; delta?: number }>;
}

interface DiagnosticRow {
  id: string;
  runDir: string;
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
  ocrShape: {
    pdfClass: string;
    textCharCount: number;
    pageCount: number;
    structureTreeDepth: number | null;
    paragraphStructElemCount: number;
    mcidTextSpanCount: number;
    engineAppliedOcr: boolean;
    engineTaggedOcrText: boolean;
    firstPageTextPrefix: string;
    metadataTitle: string;
  } | null;
  acceptedTools: string[];
}

const DEFAULT_IDS = ['3451', '3459', '3602', '3490', '3513', '3423', '3429', '3433', '3479', '3507', '4737', '4002', '4156', '4172', '4699'];

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage145-ocr-heading-anchor-diagnostic.ts [options]

Options:
  --run <dir>      Benchmark run directory; repeatable
  --out <dir>      Output directory
  --id <id>        Row id/publication id to inspect; repeatable
  --ids <csv>      Comma-separated ids`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const runDirs: string[] = [];
  let outDir = 'Output/stage145-ocr-heading-anchor-diagnostic';
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--run') runDirs.push(resolve(argv[++i] ?? ''));
    else if (arg === '--out') outDir = resolve(argv[++i] ?? outDir);
    else if (arg === '--id') ids.push(argv[++i] ?? '');
    else if (arg === '--ids') ids.push(...(argv[++i] ?? '').split(',').map(value => value.trim()).filter(Boolean));
    else throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }
  if (runDirs.length === 0) throw new Error(`At least one --run directory is required.\n${usage()}`);
  return {
    runDirs,
    outDir,
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

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function findRemediatedPdf(runDir: string, row: BenchmarkRow): Promise<string | null> {
  const names = await readdir(runDir).catch(() => []);
  const ids = [row.id, row.publicationId].filter(Boolean) as string[];
  const candidate = names
    .filter(name => name.endsWith('.remediated.pdf'))
    .filter(name => ids.some(id => name.startsWith(`${id}-`) || name.includes(`-${id}-`) || name.includes(id)))
    .sort()[0];
  return candidate ? join(runDir, candidate) : null;
}

function lowCategories(categories: AnalysisResult['categories'] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? [])
    .filter(category => category.applicable !== false && typeof category.score === 'number' && category.score < 80)
    .map(category => [category.key, category.score]));
}

function parseToolDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function appliedOcrHeadingCandidate(row: BenchmarkRow): DiagnosticRow['candidate'] {
  const tool = (row.appliedTools ?? []).find(item =>
    item.toolName === 'create_heading_from_ocr_page_shell_anchor' &&
    item.outcome === 'applied',
  );
  const details = parseToolDetails(tool?.details);
  const debug = details?.['debug'] as Record<string, unknown> | undefined;
  const mcids = Array.isArray(debug?.['mcids'])
    ? debug['mcids'].map(value => Number(value)).filter(value => Number.isInteger(value))
    : [];
  const mcid = Number(debug?.['mcid'] ?? mcids[0] ?? 0);
  if (!tool || !debug || !Number.isInteger(mcid)) return null;
  return {
    text: typeof debug['visibleText'] === 'string' ? debug['visibleText'] : '',
    source: 'applied_tool_debug',
    score: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : 0,
    page: Number(debug['page'] ?? 0),
    mcid,
    mcids,
    reasons: ['create_heading_from_ocr_page_shell_anchor_applied'],
  };
}

function renderMarkdown(rows: DiagnosticRow[]): string {
  const distribution: Record<string, number> = {};
  for (const row of rows) distribution[row.classification] = (distribution[row.classification] ?? 0) + 1;
  const lines = [
    '# Stage 145 OCR Heading Anchor Diagnostic',
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(distribution).sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| ID | After | Class | Candidate | Low categories | Shape | Tools |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const candidate = row.candidate
      ? `${row.candidate.text} (${row.candidate.score}, MCIDs ${row.candidate.mcids.join('/')})`
      : 'none';
    const shape = row.ocrShape
      ? `text=${row.ocrShape.textCharCount} depth=${row.ocrShape.structureTreeDepth ?? 'n/a'} P=${row.ocrShape.paragraphStructElemCount} MCID=${row.ocrShape.mcidTextSpanCount}`
      : 'n/a';
    lines.push(`| ${row.id} | ${row.after} | ${row.classification} | ${candidate} | ${Object.entries(row.lowCategories).map(([key, value]) => `${key}:${value}`).join(', ') || 'none'} | ${shape} | ${row.acceptedTools.join(', ') || 'none'} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const rows: DiagnosticRow[] = [];
  for (const runDir of args.runDirs) {
    const benchmarkRows = await readJson<BenchmarkRow[]>(join(runDir, 'remediate.results.json')) ?? [];
    for (const row of benchmarkRows.filter(item => rowMatches(item, args.ids))) {
      const pdfPath = await findRemediatedPdf(runDir, row);
      const afterScore = row.reanalyzedScore ?? row.afterScore ?? null;
      const afterGrade = row.reanalyzedGrade ?? row.afterGrade ?? 'n/a';
      const categories = row.reanalyzedCategories ?? row.afterCategories;
      let classification = 'missing_remediated_pdf';
      let reasons: string[] = [];
      let candidate: DiagnosticRow['candidate'] = null;
      let ocrShape: DiagnosticRow['ocrShape'] = null;
      if (pdfPath) {
        const analyzed = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
        const disposition = classifyStage129OcrPageShell(analyzed.result, analyzed.snapshot);
        const selected = selectOcrPageShellHeadingCandidate(analyzed.result, analyzed.snapshot);
        const appliedCandidate = appliedOcrHeadingCandidate(row);
        classification = disposition.classification;
        reasons = disposition.reasons;
        if (appliedCandidate) {
          classification = 'ocr_heading_anchor_applied';
          reasons = appliedCandidate.reasons;
        }
        candidate = appliedCandidate ?? (selected
          ? {
            text: selected.text,
            source: selected.source,
            score: selected.score,
            page: selected.page,
            mcid: selected.mcid,
            mcids: selected.mcids,
            reasons: selected.reasons,
          }
          : null);
        const reading = analyzed.snapshot.detectionProfile?.readingOrderSignals;
        ocrShape = {
          pdfClass: analyzed.result.pdfClass,
          textCharCount: analyzed.snapshot.textCharCount,
          pageCount: analyzed.snapshot.pageCount,
          structureTreeDepth: reading?.structureTreeDepth ?? null,
          paragraphStructElemCount: analyzed.snapshot.paragraphStructElems?.length ?? 0,
          mcidTextSpanCount: analyzed.snapshot.mcidTextSpans?.length ?? 0,
          engineAppliedOcr: analyzed.snapshot.remediationProvenance?.engineAppliedOcr === true,
          engineTaggedOcrText: analyzed.snapshot.remediationProvenance?.engineTaggedOcrText === true,
          firstPageTextPrefix: (analyzed.snapshot.textByPage[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
          metadataTitle: analyzed.snapshot.metadata.title ?? '',
        };
      }
      rows.push({
        id: row.id || row.publicationId || 'unknown',
        runDir,
        file: row.localFile ?? row.file ?? '',
        after: `${afterScore ?? 'n/a'}/${afterGrade}`,
        classification,
        reasons,
        candidate,
        lowCategories: lowCategories(categories),
        ocrShape,
        acceptedTools: (row.appliedTools ?? []).filter(tool => tool.outcome === 'applied').map(tool => tool.toolName),
      });
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    runDirs: args.runDirs,
    ids: args.ids,
    rows,
  };
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage145-ocr-heading-anchor-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage145-ocr-heading-anchor-diagnostic.md'), renderMarkdown(rows), 'utf8');
  console.log(`Wrote Stage 145 OCR heading anchor diagnostic to ${args.outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

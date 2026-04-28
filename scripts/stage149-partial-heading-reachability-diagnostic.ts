#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyPartialHeadingReachability,
  selectPartialHeadingReachabilityCandidate,
  selectTaggedVisibleHeadingAnchorCandidate,
} from '../src/services/remediation/visibleHeadingAnchor.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_REFERENCE_RUN = 'Output/stage145-low-grade-tail/run-stage148-target-reading-order-native-2026-04-28-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage149-partial-heading-reachability-diagnostic-2026-04-28-r1';
const DEFAULT_IDS = [
  'v1-v1-legacy-4078-4078-community-reentry-challenges-daunt-exoff',
  'v1-v1-legacy-4184-4184-child-sex-exploitation-study-probes-exte',
  'v1-v1-4519',
  'v1-v1-4635',
  'v1-v1-4641',
];

interface Args {
  manifest: string;
  referenceRun: string;
  outDir: string;
  ids: string[];
  all: boolean;
}

interface BenchmarkRow {
  id: string;
  publicationId: string;
  title?: string;
  file?: string;
  localFile?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterCategories?: AnalysisResult['categories'];
  afterDetectionProfile?: Record<string, unknown> | null;
  appliedTools?: AppliedRemediationTool[];
}

interface DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  after: string;
  hasWrittenPdf: boolean;
  classification: string;
  reasons: string[];
  candidate: null | {
    text: string;
    source: string;
    score: number;
    page: number;
    mcid?: number;
    mcids?: number[];
    reasons: string[];
  };
  weakCandidate: null | {
    text: string;
    source: string;
    score: number;
    reasons: string[];
  };
  scores: Record<string, number | null>;
  headingSignals: unknown;
  readingOrderSignals: unknown;
  firstPageText: string;
  firstPageMcidSamples: Array<{ mcid: number; text: string; snippet: string }>;
  paragraphSamples: Array<{ page: number; text: string; structRef?: string }>;
  headingToolTimeline: Array<{ toolName: string; outcome: string; scoreBefore: number; scoreAfter: number; details: string }>;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage149-partial-heading-reachability-diagnostic.ts [options]

Options:
  --manifest <path>       Active low-grade tail manifest (default: ${DEFAULT_MANIFEST})
  --reference-run <dir>   Run with remediated PDFs if available (default: ${DEFAULT_REFERENCE_RUN})
  --out <dir>             Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>             Limit to publication id or manifest id; repeatable
  --all                   Analyze every manifest row
  --help                  Show this help`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  let manifest = DEFAULT_MANIFEST;
  let referenceRun = DEFAULT_REFERENCE_RUN;
  let outDir = DEFAULT_OUT;
  const ids: string[] = [];
  let all = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--manifest') {
      manifest = argv[++index] ?? manifest;
    } else if (arg === '--reference-run') {
      referenceRun = argv[++index] ?? referenceRun;
    } else if (arg === '--out') {
      outDir = argv[++index] ?? outDir;
    } else if (arg === '--file') {
      ids.push(argv[++index] ?? '');
    } else if (arg === '--all') {
      all = true;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return { manifest: resolve(manifest), referenceRun: resolve(referenceRun), outDir: resolve(outDir), ids: ids.filter(Boolean), all };
}

async function readRows(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as BenchmarkRow[] : [];
  const out = new Map<string, BenchmarkRow>();
  for (const row of rows) {
    out.set(row.publicationId, row);
    out.set(row.id, row);
  }
  return out;
}

async function findRemediatedPdf(runDir: string, row: BenchmarkRow): Promise<string | null> {
  const names = await readdir(runDir).catch(() => []);
  const ids = [row.publicationId, row.id].filter(Boolean);
  const found = names
    .filter(name => name.endsWith('.remediated.pdf'))
    .find(name => ids.some(id => name.startsWith(`${id}-`) || name.includes(id)));
  return found ? join(runDir, found) : null;
}

function scoreFor(categories: AnalysisResult['categories'] | undefined, key: string): number | null {
  const found = categories?.find(category => category.key === key);
  return typeof found?.score === 'number' && found.applicable !== false ? found.score : null;
}

function shouldInclude(manifestRow: EdgeMixManifestRow, row: BenchmarkRow | undefined, args: Args): boolean {
  if (args.all) return true;
  const ids = args.ids.length > 0 ? args.ids : DEFAULT_IDS;
  const key = [manifestRow.id, manifestRow.publicationId, row?.id, row?.publicationId].filter(Boolean).join(' ');
  return ids.some(id => key.includes(id));
}

function headingTools(row: BenchmarkRow): DiagnosticRow['headingToolTimeline'] {
  return (row.appliedTools ?? [])
    .filter(tool => /heading|structure_conformance/i.test(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
      details: String(tool.details ?? '').slice(0, 500),
    }));
}

function weakCandidate(analysis: AnalysisResult, snapshot: DocumentSnapshot): DiagnosticRow['weakCandidate'] {
  const candidate = selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot);
  return candidate
    ? { text: candidate.text, source: candidate.source, score: candidate.score, reasons: candidate.reasons }
    : null;
}

async function buildRow(manifestRow: EdgeMixManifestRow, row: BenchmarkRow, runDir: string): Promise<DiagnosticRow> {
  const remediatedPdf = await findRemediatedPdf(runDir, row);
  if (!remediatedPdf) {
    return {
      id: row.id,
      publicationId: row.publicationId,
      title: manifestRow.title,
      file: row.localFile ?? row.file ?? manifestRow.localFile,
      after: `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'}`,
      hasWrittenPdf: false,
      classification: 'missing_written_pdf',
      reasons: ['reference_run_did_not_write_pdf'],
      candidate: null,
      weakCandidate: null,
      scores: {
        heading_structure: scoreFor(row.afterCategories, 'heading_structure'),
        reading_order: scoreFor(row.afterCategories, 'reading_order'),
        alt_text: scoreFor(row.afterCategories, 'alt_text'),
        table_markup: scoreFor(row.afterCategories, 'table_markup'),
      },
      headingSignals: row.afterDetectionProfile?.['headingSignals'],
      readingOrderSignals: row.afterDetectionProfile?.['readingOrderSignals'],
      firstPageText: '',
      firstPageMcidSamples: [],
      paragraphSamples: [],
      headingToolTimeline: headingTools(row),
    };
  }
  const analyzed = await analyzePdf(remediatedPdf, basename(remediatedPdf), { bypassCache: true });
  const disposition = classifyPartialHeadingReachability(analyzed.result, analyzed.snapshot);
  const candidate = selectPartialHeadingReachabilityCandidate(analyzed.result, analyzed.snapshot);
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: manifestRow.title,
    file: row.localFile ?? row.file ?? manifestRow.localFile,
    after: `${row.afterScore ?? analyzed.result.score}/${row.afterGrade ?? analyzed.result.grade}`,
    hasWrittenPdf: true,
    classification: disposition.classification,
    reasons: disposition.reasons,
    candidate: candidate
      ? {
        text: candidate.text,
        source: candidate.source,
        score: candidate.score,
        page: candidate.page,
        mcid: candidate.mcid,
        mcids: candidate.mcids,
        reasons: candidate.reasons,
      }
      : null,
    weakCandidate: weakCandidate(analyzed.result, analyzed.snapshot),
    scores: {
      heading_structure: scoreFor(analyzed.result.categories, 'heading_structure'),
      reading_order: scoreFor(analyzed.result.categories, 'reading_order'),
      alt_text: scoreFor(analyzed.result.categories, 'alt_text'),
      table_markup: scoreFor(analyzed.result.categories, 'table_markup'),
    },
    headingSignals: analyzed.snapshot.detectionProfile?.headingSignals,
    readingOrderSignals: analyzed.snapshot.detectionProfile?.readingOrderSignals,
    firstPageText: (analyzed.snapshot.textByPage[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
    firstPageMcidSamples: (analyzed.snapshot.mcidTextSpans ?? [])
      .filter(item => item.page === 0)
      .slice(0, 24)
      .map(item => ({
        mcid: item.mcid,
        text: String(item.resolvedText ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        snippet: item.snippet.slice(0, 160),
      })),
    paragraphSamples: (analyzed.snapshot.paragraphStructElems ?? [])
      .filter(item => item.page === 0)
      .slice(0, 10)
      .map(item => ({ page: item.page, text: String(item.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 160), structRef: item.structRef })),
    headingToolTimeline: headingTools(row),
  };
}

function renderMarkdown(rows: DiagnosticRow[]): string {
  const distribution = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# Stage 149 Partial-Heading Reachability Diagnostic',
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(distribution).sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | After | Class | Scores | Candidate | Weak candidate | Reasons |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const candidate = row.candidate
      ? `${row.candidate.text} (${row.candidate.score}, MCIDs ${(row.candidate.mcids ?? [row.candidate.mcid]).filter(value => value !== undefined).join('/')})`
      : 'none';
    const weak = row.weakCandidate
      ? `${row.weakCandidate.text} (${row.weakCandidate.source}, ${row.weakCandidate.score})`
      : 'none';
    lines.push(`| ${row.publicationId} | ${row.after} | ${row.classification} | ${Object.entries(row.scores).map(([key, value]) => `${key}:${value ?? 'n/a'}`).join(', ')} | ${candidate} | ${weak} | ${row.reasons.join(', ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const manifestRows = await loadEdgeMixManifest(args.manifest);
  const runRows = await readRows(args.referenceRun);
  const rows: DiagnosticRow[] = [];
  for (const manifestRow of manifestRows) {
    const row = runRows.get(manifestRow.publicationId) ?? runRows.get(manifestRow.id);
    if (!row || !shouldInclude(manifestRow, row, args)) continue;
    rows.push(await buildRow(manifestRow, row, args.referenceRun));
  }
  const report = { generatedAt: new Date().toISOString(), manifest: args.manifest, referenceRun: args.referenceRun, rows };
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage149-partial-heading-reachability-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage149-partial-heading-reachability-diagnostic.md'), renderMarkdown(rows), 'utf8');
  console.log(`Wrote Stage 149 partial-heading reachability diagnostic for ${rows.length} row(s): ${args.outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

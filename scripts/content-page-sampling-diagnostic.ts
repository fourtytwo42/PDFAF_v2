#!/usr/bin/env tsx
import 'dotenv/config';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const execFileAsync = promisify(execFile);
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-content-tagging-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `content-page-sampling-${timestampSlug()}`);

export type ContentPageSamplingClassification =
  | 'full_document_within_sample'
  | 'stratified_increases_content_debt'
  | 'stratified_same_content_debt'
  | 'stratified_reduces_content_debt'
  | 'sample_error';

export type ContentPageSamplingAction =
  | 'sampling_validation_candidate'
  | 'keep_current_sampling'
  | 'no_action'
  | 'keep_diagnostic';

export interface ContentAuditSample {
  strategy: string;
  pageStreamsChecked: number;
  totalPageStreams: number;
  sampledPageIndices: number[];
  directEventDebt: number;
  textOutside: number;
  imageOutside: number;
  pathOutside: number;
  boundaryDebt: number;
  formXObjectsChecked: number;
  totalFormXObjects: number;
  formXObjectParseErrorCount: number;
  formXObjectSampleLimitHitCount: number;
  error?: string;
}

export interface ContentPageSamplingRow extends ContentEventSourceRow {
  classification: ContentPageSamplingClassification;
  suggestedAction: ContentPageSamplingAction;
  reasons: string[];
  first: ContentAuditSample | null;
  stratified: ContentAuditSample | null;
}

export interface ContentPageSamplingReport {
  createdAt: string;
  outDir: string;
  maxPages: number;
  selectedRowCount: number;
  classificationDistribution: Record<ContentPageSamplingClassification, number>;
  suggestedActionDistribution: Record<ContentPageSamplingAction, number>;
  decision: {
    status:
      | 'plan_stratified_sampling_validation'
      | 'keep_page_sampling_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: ContentPageSamplingRow[];
}

interface Args {
  pdfs: string[];
  manifests: string[];
  ids: string[];
  outDir: string;
  limit?: number;
  maxPages: number;
  python: string;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/content-page-sampling-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --max-pages <n>    Sample size per strategy (default: 12)
  --python <cmd>     Python executable (default: python3)
  --help             Show this help

Diagnostic-only: compares native contentTaggingAudit first-page sampling to same-size stratified sampling. It does not change normal analyzer behavior, remediate PDFs, mutate PDFs, or call PAC/POC/ODL/Java.`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const pdfs: string[] = [];
  const manifests: string[] = [];
  const ids: string[] = [];
  let outDir = DEFAULT_OUT;
  let limit: number | undefined;
  let maxPages = 12;
  let python = 'python3';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --pdf\n${usage()}`);
      pdfs.push(resolve(value));
    } else if (arg === '--manifest') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --manifest\n${usage()}`);
      manifests.push(resolve(value));
    } else if (arg === '--id') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --id\n${usage()}`);
      ids.push(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--limit must be a positive integer');
      limit = Math.floor(value);
    } else if (arg === '--max-pages') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--max-pages must be a positive integer');
      maxPages = Math.floor(value);
    } else if (arg === '--python') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --python\n${usage()}`);
      python = value;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { pdfs, manifests, ids, outDir, limit, maxPages, python };
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringArrayNumber(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(numberValue).filter(value => Number.isFinite(value))
    : [];
}

function normalizeAudit(raw: Record<string, unknown>, strategy: string): ContentAuditSample {
  const textOutside = numberValue(raw['textOutsideMarkedContentOrArtifact']);
  const imageOutside = numberValue(raw['imageOutsideMarkedContentOrArtifact']);
  const pathOutside = numberValue(raw['pathOutsideMarkedContentOrArtifact']);
  const boundaryDebt =
    numberValue(raw['artifactInsideTaggedContent']) +
    numberValue(raw['taggedContentInsideArtifact']) +
    numberValue(raw['malformedMarkedContentStack']);
  return {
    strategy,
    pageStreamsChecked: numberValue(raw['pageStreamsChecked']),
    totalPageStreams: numberValue(raw['totalPageStreams']),
    sampledPageIndices: stringArrayNumber(raw['sampledPageIndices']),
    directEventDebt: textOutside + imageOutside + pathOutside + boundaryDebt,
    textOutside,
    imageOutside,
    pathOutside,
    boundaryDebt,
    formXObjectsChecked: numberValue(raw['formXObjectsChecked']),
    totalFormXObjects: numberValue(raw['totalFormXObjects']),
    formXObjectParseErrorCount: numberValue(raw['formXObjectParseErrorCount']),
    formXObjectSampleLimitHitCount: numberValue(raw['formXObjectSampleLimitHitCount']),
  };
}

async function runAudit(input: { python: string; pdfPath: string; strategy: string; maxPages: number }): Promise<ContentAuditSample> {
  const helper = resolve('python/pdf_analysis_helper.py');
  try {
    const { stdout } = await execFileAsync(input.python, [
      helper,
      '--dump-content-tagging-audit',
      input.pdfPath,
      input.strategy,
      String(input.maxPages),
    ], { maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof parsed['error'] === 'string') {
      return {
        ...normalizeAudit({}, input.strategy),
        error: parsed['error'],
      };
    }
    return normalizeAudit(parsed, input.strategy);
  } catch (error) {
    return {
      ...normalizeAudit({}, input.strategy),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function classifyContentPageSampling(input: {
  rowRole: 'focus' | 'control';
  first: ContentAuditSample | null;
  stratified: ContentAuditSample | null;
}): {
  classification: ContentPageSamplingClassification;
  suggestedAction: ContentPageSamplingAction;
  reasons: string[];
} {
  const { first, stratified } = input;
  if (!first || !stratified || first.error || stratified.error) {
    return {
      classification: 'sample_error',
      suggestedAction: 'keep_diagnostic',
      reasons: [first?.error, stratified?.error].filter(Boolean) as string[],
    };
  }
  const reasons = [
    `first_pages:${first.pageStreamsChecked}/${first.totalPageStreams}`,
    `stratified_pages:${stratified.pageStreamsChecked}/${stratified.totalPageStreams}`,
    `first_debt:${first.directEventDebt}`,
    `stratified_debt:${stratified.directEventDebt}`,
  ];
  if (first.pageStreamsChecked >= first.totalPageStreams) {
    return {
      classification: 'full_document_within_sample',
      suggestedAction: 'no_action',
      reasons,
    };
  }
  if (stratified.directEventDebt > first.directEventDebt) {
    return {
      classification: 'stratified_increases_content_debt',
      suggestedAction: input.rowRole === 'focus' ? 'sampling_validation_candidate' : 'keep_diagnostic',
      reasons: [...reasons, `debt_delta:${stratified.directEventDebt - first.directEventDebt}`],
    };
  }
  if (stratified.directEventDebt < first.directEventDebt) {
    return {
      classification: 'stratified_reduces_content_debt',
      suggestedAction: 'keep_current_sampling',
      reasons: [...reasons, `debt_delta:${stratified.directEventDebt - first.directEventDebt}`],
    };
  }
  return {
    classification: 'stratified_same_content_debt',
    suggestedAction: 'keep_current_sampling',
    reasons,
  };
}

export async function analyzeContentPageSamplingRow(
  row: ContentEventSourceRow,
  options: { python: string; maxPages: number },
): Promise<ContentPageSamplingRow> {
  const [first, stratified] = await Promise.all([
    runAudit({ python: options.python, pdfPath: row.pdfPath, strategy: 'first', maxPages: options.maxPages }),
    runAudit({ python: options.python, pdfPath: row.pdfPath, strategy: 'stratified', maxPages: options.maxPages }),
  ]);
  const classified = classifyContentPageSampling({ rowRole: row.role, first, stratified });
  return {
    ...row,
    classification: classified.classification,
    suggestedAction: classified.suggestedAction,
    reasons: classified.reasons,
    first,
    stratified,
  };
}

export function buildContentPageSamplingReport(
  outDir: string,
  maxPages: number,
  rows: ContentPageSamplingRow[],
): ContentPageSamplingReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const focusCandidates = rows.filter(row => row.role === 'focus' && row.classification === 'stratified_increases_content_debt').length;
  const controlCandidates = rows.filter(row => row.role === 'control' && row.classification === 'stratified_increases_content_debt').length;
  const errors = classificationDistribution.sample_error ?? 0;
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : focusCandidates >= 2 && controlCandidates === 0
      ? 'plan_stratified_sampling_validation'
      : 'keep_page_sampling_diagnostic_only';
  return {
    createdAt: new Date().toISOString(),
    outDir,
    maxPages,
    selectedRowCount: rows.length,
    classificationDistribution,
    suggestedActionDistribution,
    decision: {
      status,
      reasons: [
        `focus_candidates=${focusCandidates}`,
        `control_candidates=${controlCandidates}`,
        `sample_errors=${errors}`,
      ],
    },
    rows,
  };
}

function renderMarkdown(report: ContentPageSamplingReport): string {
  const lines = [
    '# Content Page Sampling Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Max pages per strategy: ${report.maxPages}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native content-stream audit comparison. Normal analyzer sampling, scoring, remediation, and PAC gates are unchanged.',
    '',
    '## Rows',
    '',
    '| Row | Role | First Pages | Stratified Pages | First Debt | Stratified Debt | Class | Action |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      `\`${row.id}\``,
      row.role,
      row.first ? `${row.first.pageStreamsChecked}/${row.first.totalPageStreams}` : 'ERR',
      row.stratified ? `${row.stratified.pageStreamsChecked}/${row.stratified.totalPageStreams}` : 'ERR',
      row.first?.directEventDebt ?? 'ERR',
      row.stratified?.directEventDebt ?? 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_stratified_sampling_validation') {
    lines.push('At least two focus rows gain direct content-event debt under same-size stratified sampling while controls do not. A later source change may validate runtime and score impact before promotion.');
  } else if (report.decision.status === 'keep_page_sampling_diagnostic_only') {
    lines.push('The sample does not justify changing normal content-event page sampling. Keep this lane diagnostic-only unless more rows show a clean same-budget gain.');
  } else {
    lines.push('Diagnostic errors must be resolved before making a page-sampling decision.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeContentPageSamplingReport(
  outDir: string,
  maxPages: number,
  rows: ContentPageSamplingRow[],
): Promise<ContentPageSamplingReport> {
  const report = buildContentPageSamplingReport(outDir, maxPages, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'content-page-sampling.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'content-page-sampling.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const sourceRows = await collectContentEventRows(args);
  if (sourceRows.length === 0) throw new Error('No rows matched the requested inputs.');
  const rows: ContentPageSamplingRow[] = [];
  for (const row of sourceRows) {
    const result = await analyzeContentPageSamplingRow(row, { python: args.python, maxPages: args.maxPages });
    rows.push(result);
    console.log(`[content-sampling] ${basename(row.pdfPath)} ${result.classification}`);
  }
  const report = await writeContentPageSamplingReport(args.outDir, args.maxPages, rows);
  console.log(`[content-sampling] wrote ${join(args.outDir, 'content-page-sampling.md')}`);
  console.log(`[content-sampling] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  analyzeContentEventRow,
  collectContentEventRows,
  type ContentEventDiagnosticRow,
  type ContentEventFeatures,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-content-tagging-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `content-stream-coverage-${timestampSlug()}`);

export type ContentStreamCoverageClassification =
  | 'verified_full_stream_coverage'
  | 'page_sample_limit_coverage_gap'
  | 'form_xobject_coverage_unknown'
  | 'parse_failure_or_unchecked_pages'
  | 'missing_structure_manual_review'
  | 'no_audit_or_empty_document'
  | 'analysis_error';

export type ContentStreamCoverageAction =
  | 'already_verified'
  | 'page_coverage_hardening_candidate'
  | 'form_xobject_metric_candidate'
  | 'keep_diagnostic'
  | 'no_action';

export interface ContentStreamCoverageFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  pageCount: number;
  hasStructure: boolean;
  auditConfidence: ContentEventFeatures['auditConfidence'];
  pageStreamsChecked: number;
  totalPageStreams: number;
  uncheckedPageStreams: number;
  formXObjectsChecked: number;
  directEventDebt: number;
  orphanMcidCount: number;
  contentScoreCapRules: string[];
}

export interface ContentStreamCoverageRow extends ContentEventSourceRow {
  classification: ContentStreamCoverageClassification;
  suggestedAction: ContentStreamCoverageAction;
  reasons: string[];
  features: ContentStreamCoverageFeatures | null;
  sourceClassification?: ContentEventDiagnosticRow['classification'];
  error?: string;
}

export interface ContentStreamCoverageReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<ContentStreamCoverageClassification, number>;
  suggestedActionDistribution: Record<ContentStreamCoverageAction, number>;
  decision: {
    status:
      | 'plan_form_xobject_coverage_metric'
      | 'plan_page_sample_coverage_validation'
      | 'keep_content_coverage_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: ContentStreamCoverageRow[];
}

interface Args {
  pdfs: string[];
  manifests: string[];
  ids: string[];
  outDir: string;
  limit?: number;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/content-stream-coverage-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and explains contentTaggingAudit coverage. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const pdfs: string[] = [];
  const manifests: string[] = [];
  const ids: string[] = [];
  let outDir = DEFAULT_OUT;
  let limit: number | undefined;

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
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { pdfs, manifests, ids, outDir, limit };
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function coverageFeatures(features: ContentEventFeatures): ContentStreamCoverageFeatures {
  return {
    score: features.score,
    grade: features.grade,
    pdfClass: features.pdfClass,
    pageCount: features.pageCount,
    hasStructure: features.hasStructure,
    auditConfidence: features.auditConfidence,
    pageStreamsChecked: features.pageStreamsChecked,
    totalPageStreams: features.totalPageStreams,
    uncheckedPageStreams: Math.max(0, features.totalPageStreams - features.pageStreamsChecked),
    formXObjectsChecked: features.formXObjectsChecked,
    directEventDebt: features.directEventDebt,
    orphanMcidCount: features.orphanMcidCount,
    contentScoreCapRules: features.contentScoreCapRules,
  };
}

export function classifyContentStreamCoverage(features: ContentStreamCoverageFeatures): {
  classification: ContentStreamCoverageClassification;
  suggestedAction: ContentStreamCoverageAction;
  reasons: string[];
} {
  const reasons = [
    `audit_confidence:${features.auditConfidence}`,
    `pages_checked:${features.pageStreamsChecked}/${features.totalPageStreams}`,
    `form_xobjects_checked:${features.formXObjectsChecked}`,
    `direct_event_debt:${features.directEventDebt}`,
  ];

  if (!features.hasStructure) {
    return {
      classification: 'missing_structure_manual_review',
      suggestedAction: 'keep_diagnostic',
      reasons: [...reasons, 'missing_structure_tree'],
    };
  }

  if (features.totalPageStreams <= 0) {
    return {
      classification: 'no_audit_or_empty_document',
      suggestedAction: 'keep_diagnostic',
      reasons,
    };
  }

  if (features.pageStreamsChecked < Math.min(features.totalPageStreams, 12)) {
    return {
      classification: 'parse_failure_or_unchecked_pages',
      suggestedAction: 'keep_diagnostic',
      reasons,
    };
  }

  if (features.formXObjectsChecked > 0) {
    return {
      classification: 'form_xobject_coverage_unknown',
      suggestedAction: features.directEventDebt > 0 ? 'form_xobject_metric_candidate' : 'keep_diagnostic',
      reasons: [...reasons, 'form_xobject_total_not_recorded'],
    };
  }

  if (features.pageStreamsChecked < features.totalPageStreams) {
    return {
      classification: 'page_sample_limit_coverage_gap',
      suggestedAction: features.directEventDebt > 0 ? 'page_coverage_hardening_candidate' : 'keep_diagnostic',
      reasons: [...reasons, 'bounded_first_12_page_sample'],
    };
  }

  return {
    classification: 'verified_full_stream_coverage',
    suggestedAction: features.directEventDebt > 0 ? 'already_verified' : 'no_action',
    reasons,
  };
}

export async function analyzeContentStreamCoverageRow(row: ContentEventSourceRow): Promise<ContentStreamCoverageRow> {
  const analyzed = await analyzeContentEventRow(row);
  if (!analyzed.features) {
    return {
      ...row,
      classification: 'analysis_error',
      suggestedAction: 'keep_diagnostic',
      reasons: analyzed.reasons,
      features: null,
      sourceClassification: analyzed.classification,
      error: analyzed.error,
    };
  }

  const features = coverageFeatures(analyzed.features);
  const classified = classifyContentStreamCoverage(features);
  return {
    ...row,
    classification: classified.classification,
    suggestedAction: classified.suggestedAction,
    reasons: classified.reasons,
    features,
    sourceClassification: analyzed.classification,
  };
}

export function buildContentStreamCoverageReport(outDir: string, rows: ContentStreamCoverageRow[]): ContentStreamCoverageReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const errors = classificationDistribution.analysis_error ?? 0;
  const formFocus = rows.filter(row => row.role === 'focus' && row.classification === 'form_xobject_coverage_unknown').length;
  const formControls = rows.filter(row => row.role === 'control' && row.classification === 'form_xobject_coverage_unknown').length;
  const sampleFocus = rows.filter(row => row.role === 'focus' && row.classification === 'page_sample_limit_coverage_gap').length;
  const sampleControls = rows.filter(row => row.role === 'control' && row.classification === 'page_sample_limit_coverage_gap').length;
  const parseFailures = classificationDistribution.parse_failure_or_unchecked_pages ?? 0;
  const verified = classificationDistribution.verified_full_stream_coverage ?? 0;
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : formFocus > 0 && formControls === 0
      ? 'plan_form_xobject_coverage_metric'
      : sampleFocus > 0 && sampleControls === 0
        ? 'plan_page_sample_coverage_validation'
        : 'keep_content_coverage_diagnostic_only';

  return {
    createdAt: new Date().toISOString(),
    outDir,
    selectedRowCount: rows.length,
    classificationDistribution,
    suggestedActionDistribution,
    decision: {
      status,
      reasons: [
        `form_focus=${formFocus}`,
        `form_controls=${formControls}`,
        `sample_focus=${sampleFocus}`,
        `sample_controls=${sampleControls}`,
        `parse_failures=${parseFailures}`,
        `verified_full_coverage=${verified}`,
        `analysis_errors=${errors}`,
      ],
    },
    rows,
  };
}

function renderMarkdown(report: ContentStreamCoverageReport): string {
  const lines = [
    '# Content-Stream Coverage Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native PDFAF analysis. No PAC/POC/ODL/Java call, remediation, PDF mutation, score change, or planner change.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Pages Checked | Forms Checked | Debt | Class | Action |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f ? `${f.pageStreamsChecked}/${f.totalPageStreams}` : 'ERR',
      f?.formXObjectsChecked ?? 'ERR',
      f?.directEventDebt ?? 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_form_xobject_coverage_metric') {
    lines.push('At least one focus row has content-event debt behind Form XObject coverage uncertainty while controls do not. A later source change should add native total/checked Form XObject coverage metrics before any scoring or remediation promotion.');
  } else if (report.decision.status === 'plan_page_sample_coverage_validation') {
    lines.push('At least one focus row has content-event debt behind the bounded first-12-page sample while controls do not. A later validation should test whether raising or stratifying the page sample is worth the runtime cost.');
  } else if (report.decision.status === 'keep_content_coverage_diagnostic_only') {
    lines.push('No clean coverage-hardening lane is separated from controls in this sample. Keep content-stream coverage diagnostic-only.');
  } else {
    lines.push('Diagnostic errors must be resolved before making a content-stream coverage decision.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeContentStreamCoverageReport(outDir: string, rows: ContentStreamCoverageRow[]): Promise<ContentStreamCoverageReport> {
  const report = buildContentStreamCoverageReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'content-stream-coverage.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'content-stream-coverage.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const rows = await collectContentEventRows(args);
  if (rows.length === 0) throw new Error('No rows matched the requested inputs.');
  const analyzed: ContentStreamCoverageRow[] = [];
  for (const row of rows) {
    const result = await analyzeContentStreamCoverageRow(row);
    analyzed.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[content-coverage] ${basename(row.pdfPath)} ${score} ${result.classification}`);
  }
  const report = await writeContentStreamCoverageReport(args.outDir, analyzed);
  console.log(`[content-coverage] wrote ${join(args.outDir, 'content-stream-coverage.md')}`);
  console.log(`[content-coverage] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

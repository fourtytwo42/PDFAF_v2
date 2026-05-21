#!/usr/bin/env tsx
import 'dotenv/config';

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult } from '../src/types.js';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const require = createRequire(import.meta.url);
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-contrast-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `rendered-contrast-opt-in-${timestampSlug()}`);
const DEFAULT_MAX_PAGES = 3;
const DEFAULT_MAX_TEXT_RUNS = 400;
const CONTRAST_THRESHOLD = 4.5;

export type RenderedContrastClassification =
  | 'low_contrast_candidate'
  | 'uncertain_contrast_evidence'
  | 'no_low_contrast_detected'
  | 'contrast_not_measured'
  | 'analysis_error';

export type RenderedContrastSuggestedAction =
  | 'contrast_validation_needed'
  | 'sampling_hardening_needed'
  | 'keep_diagnostic'
  | 'no_action';

export interface ContrastRunSample {
  page: number;
  text: string;
  ratio: number | null;
  bbox: [number, number, number, number];
  reason?: string;
}

export interface RenderedContrastFeatures {
  score: number;
  grade: string;
  colorContrastCategory: number | null;
  colorContrastApplicable: boolean | null;
  measured: boolean;
  sampledPageCount: number;
  sampledTextRunCount: number;
  measuredTextRunCount: number;
  lowContrastTextRunCount: number;
  uncertainTextRunCount: number;
  minContrastRatio: number | null;
  medianContrastRatio: number | null;
  confidenceReason: string;
  lowContrastSamples: ContrastRunSample[];
  uncertainSamples: ContrastRunSample[];
  measurementMs: number;
}

export interface RenderedContrastDiagnosticRow extends ContentEventSourceRow {
  classification: RenderedContrastClassification;
  suggestedAction: RenderedContrastSuggestedAction;
  reasons: string[];
  features: RenderedContrastFeatures | null;
  error?: string;
}

export interface RenderedContrastDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  maxPages: number;
  maxTextRuns: number;
  classificationDistribution: Record<RenderedContrastClassification, number>;
  suggestedActionDistribution: Record<RenderedContrastSuggestedAction, number>;
  decision: {
    status:
      | 'plan_rendered_contrast_validation'
      | 'plan_rendered_contrast_sampling_hardening'
      | 'keep_rendered_contrast_opt_in_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: RenderedContrastDiagnosticRow[];
}

interface Args {
  pdfs: string[];
  manifests: string[];
  ids: string[];
  outDir: string;
  limit?: number;
  maxPages: number;
  maxTextRuns: number;
}

interface TextRun {
  page: number;
  text: string;
  bbox: [number, number, number, number];
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/rendered-contrast-opt-in-diagnostic.ts [options]

Options:
  --pdf <path>          Add one PDF to analyze; repeatable
  --manifest <path>     Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>             Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>           Output directory (default: ${DEFAULT_OUT})
  --limit <n>           Limit rows after selection
  --max-pages <n>       Maximum sampled pages per PDF (default: ${DEFAULT_MAX_PAGES})
  --max-text-runs <n>   Maximum text runs per PDF (default: ${DEFAULT_MAX_TEXT_RUNS})
  --help                Show this help

Diagnostic-only and opt-in: renders bounded sampled pages and estimates text contrast from native pdf.js text geometry. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change default scoring behavior.`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const pdfs: string[] = [];
  const manifests: string[] = [];
  const ids: string[] = [];
  let outDir = DEFAULT_OUT;
  let limit: number | undefined;
  let maxPages = DEFAULT_MAX_PAGES;
  let maxTextRuns = DEFAULT_MAX_TEXT_RUNS;

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
      if (!Number.isFinite(value) || value < 1 || value > 12) throw new Error('--max-pages must be between 1 and 12');
      maxPages = Math.floor(value);
    } else if (arg === '--max-text-runs') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 10 || value > 5000) throw new Error('--max-text-runs must be between 10 and 5000');
      maxTextRuns = Math.floor(value);
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { pdfs, manifests, ids, outDir, limit, maxPages, maxTextRuns };
}

function categoryScore(analysis: AnalysisResult, key: string): { score: number | null; applicable: boolean | null } {
  const category = analysis.categories.find(row => row.key === key);
  return {
    score: category?.score ?? null,
    applicable: typeof category?.applicable === 'boolean' ? category.applicable : null,
  };
}

function samplePageIndices(pageCount: number, maxPages: number): number[] {
  const count = Math.min(pageCount, maxPages);
  if (count <= 0) return [];
  if (count >= pageCount) return Array.from({ length: pageCount }, (_, index) => index);
  const indices = new Set<number>([0, pageCount - 1]);
  if (count > 2) {
    const step = (pageCount - 1) / (count - 1);
    for (let index = 1; index < count - 1; index += 1) indices.add(Math.round(step * index));
  }
  return [...indices].sort((a, b) => a - b);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function srgb(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function contrastRatio(a: number, b: number): number {
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const index = clamp(Math.floor((sorted.length - 1) * pct), 0, sorted.length - 1);
  return sorted[index]!;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function sampleTextRunContrast(
  ctx: { getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray } },
  canvasWidth: number,
  canvasHeight: number,
  run: TextRun,
): { ratio: number | null; low: boolean; uncertain: boolean; reason?: string } {
  const [x0, y0, x1, y1] = run.bbox;
  const pad = 2;
  const left = Math.floor(clamp(x0 - pad, 0, canvasWidth - 1));
  const top = Math.floor(clamp(y0 - pad, 0, canvasHeight - 1));
  const right = Math.ceil(clamp(x1 + pad, left + 1, canvasWidth));
  const bottom = Math.ceil(clamp(y1 + pad, top + 1, canvasHeight));
  const width = right - left;
  const height = bottom - top;
  if (width < 3 || height < 3 || width * height < 30) {
    return { ratio: null, low: false, uncertain: true, reason: 'bbox_too_small' };
  }

  const image = ctx.getImageData(left, top, width, height).data;
  const values: number[] = [];
  const step = Math.max(1, Math.floor((width * height) / 1500));
  for (let index = 0, pixel = 0; index < image.length; index += 4, pixel += 1) {
    if (pixel % step !== 0) continue;
    const alpha = image[index + 3] ?? 255;
    if (alpha < 200) continue;
    values.push(luminance(image[index] ?? 255, image[index + 1] ?? 255, image[index + 2] ?? 255));
  }
  if (values.length < 30) {
    return { ratio: null, low: false, uncertain: true, reason: 'too_few_pixels' };
  }
  values.sort((a, b) => a - b);
  const lowLum = percentile(values, 0.1);
  const highLum = percentile(values, 0.9);
  if (Math.abs(highLum - lowLum) < 0.04) {
    return { ratio: null, low: false, uncertain: true, reason: 'insufficient_luminance_separation' };
  }
  const ratio = contrastRatio(lowLum, highLum);
  return {
    ratio: rounded(ratio),
    low: ratio < CONTRAST_THRESHOLD,
    uncertain: false,
  };
}

async function measureRenderedContrast(
  pdfPath: string,
  maxPages: number,
  maxTextRuns: number,
): Promise<Omit<RenderedContrastFeatures, 'score' | 'grade' | 'colorContrastCategory' | 'colorContrastApplicable'>> {
  const started = performance.now();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  const buffer = await readFile(pdfPath);
  const data = Uint8Array.from(buffer);
  const loadingTask = pdfjs.getDocument({ data, disableFontFace: true, verbosity: 0 });
  const pdf = await loadingTask.promise;
  const pageIndices = samplePageIndices(pdf.numPages, maxPages);
  const ratios: number[] = [];
  const lowContrastSamples: ContrastRunSample[] = [];
  const uncertainSamples: ContrastRunSample[] = [];
  let sampledTextRunCount = 0;
  let measuredTextRunCount = 0;
  let lowContrastTextRunCount = 0;
  let uncertainTextRunCount = 0;

  try {
    for (const pageIndex of pageIndices) {
      if (sampledTextRunCount >= maxTextRuns) break;
      const page = await pdf.getPage(pageIndex + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1200 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx as never, viewport }).promise;
      const textContent = await page.getTextContent();
      for (const item of textContent.items as Array<Record<string, unknown>>) {
        if (sampledTextRunCount >= maxTextRuns) break;
        const text = typeof item.str === 'string' ? item.str.trim() : '';
        if (text.length < 2) continue;
        const rawTransform = Array.isArray(item.transform) ? item.transform.map(Number) : [];
        if (rawTransform.length < 6) continue;
        const transformed = pdfjs.Util.transform(viewport.transform, rawTransform);
        const x = Number(transformed[4] ?? 0);
        const y = Number(transformed[5] ?? 0);
        const width = Math.abs(Number(item.width ?? 0) * scale);
        const height = Math.max(4, Math.abs(Number(item.height ?? 10) * scale));
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || width < 3) continue;
        const run: TextRun = {
          page: pageIndex,
          text,
          bbox: [
            clamp(x, 0, canvas.width),
            clamp(y - height, 0, canvas.height),
            clamp(x + width, 0, canvas.width),
            clamp(y + Math.max(2, height * 0.25), 0, canvas.height),
          ],
        };
        sampledTextRunCount += 1;
        const measured = sampleTextRunContrast(ctx, canvas.width, canvas.height, run);
        if (measured.uncertain) {
          uncertainTextRunCount += 1;
          if (uncertainSamples.length < 8) {
            uncertainSamples.push({
              page: pageIndex,
              text: text.slice(0, 80),
              ratio: null,
              bbox: run.bbox,
              reason: measured.reason,
            });
          }
          continue;
        }
        if (measured.ratio !== null) {
          measuredTextRunCount += 1;
          ratios.push(measured.ratio);
        }
        if (measured.low) {
          lowContrastTextRunCount += 1;
          if (lowContrastSamples.length < 8) {
            lowContrastSamples.push({
              page: pageIndex,
              text: text.slice(0, 80),
              ratio: measured.ratio,
              bbox: run.bbox,
            });
          }
        }
      }
      page.cleanup();
    }
  } finally {
    await pdf.destroy().catch(() => {});
  }

  ratios.sort((a, b) => a - b);
  const measured = measuredTextRunCount > 0;
  const confidenceReason = !measured
    ? 'no_measurable_text_runs'
    : uncertainTextRunCount > measuredTextRunCount
      ? 'many_uncertain_text_runs'
      : 'bounded_rendered_text_sampling';
  return {
    measured,
    sampledPageCount: pageIndices.length,
    sampledTextRunCount,
    measuredTextRunCount,
    lowContrastTextRunCount,
    uncertainTextRunCount,
    minContrastRatio: ratios.length ? ratios[0]! : null,
    medianContrastRatio: ratios.length ? ratios[Math.floor(ratios.length / 2)]! : null,
    confidenceReason,
    lowContrastSamples,
    uncertainSamples,
    measurementMs: Math.round(performance.now() - started),
  };
}

export function classifyRenderedContrast(features: RenderedContrastFeatures): Pick<RenderedContrastDiagnosticRow, 'classification' | 'suggestedAction' | 'reasons'> {
  const reasons: string[] = [];
  if (!features.measured) {
    return {
      classification: 'contrast_not_measured',
      suggestedAction: 'keep_diagnostic',
      reasons: [features.confidenceReason || 'contrast_not_measured'],
    };
  }
  if (features.lowContrastTextRunCount > 0) {
    reasons.push(`low_contrast_runs:${features.lowContrastTextRunCount}`);
    if (features.minContrastRatio !== null) reasons.push(`min_ratio:${features.minContrastRatio}`);
    return {
      classification: 'low_contrast_candidate',
      suggestedAction: 'contrast_validation_needed',
      reasons,
    };
  }
  const uncertainRatio = features.sampledTextRunCount > 0
    ? features.uncertainTextRunCount / features.sampledTextRunCount
    : 0;
  if (features.uncertainTextRunCount > 0 && uncertainRatio >= 0.5) {
    return {
      classification: 'uncertain_contrast_evidence',
      suggestedAction: 'sampling_hardening_needed',
      reasons: [`uncertain_ratio:${rounded(uncertainRatio)}`, features.confidenceReason],
    };
  }
  return {
    classification: 'no_low_contrast_detected',
    suggestedAction: 'no_action',
    reasons: ['no_low_contrast_detected_in_sample'],
  };
}

async function analyzeRow(row: ContentEventSourceRow, maxPages: number, maxTextRuns: number): Promise<RenderedContrastDiagnosticRow> {
  try {
    const [analysis, measured] = await Promise.all([
      analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true }),
      measureRenderedContrast(row.pdfPath, maxPages, maxTextRuns),
    ]);
    const color = categoryScore(analysis.result, 'color_contrast');
    const features: RenderedContrastFeatures = {
      score: analysis.result.score,
      grade: analysis.result.grade,
      colorContrastCategory: color.score,
      colorContrastApplicable: color.applicable,
      ...measured,
    };
    return {
      ...row,
      ...classifyRenderedContrast(features),
      features,
    };
  } catch (error) {
    return {
      ...row,
      classification: 'analysis_error',
      suggestedAction: 'keep_diagnostic',
      reasons: ['analysis_or_render_error'],
      features: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const CLASSIFICATIONS: readonly RenderedContrastClassification[] = [
  'low_contrast_candidate',
  'uncertain_contrast_evidence',
  'no_low_contrast_detected',
  'contrast_not_measured',
  'analysis_error',
];

const ACTIONS: readonly RenderedContrastSuggestedAction[] = [
  'contrast_validation_needed',
  'sampling_hardening_needed',
  'keep_diagnostic',
  'no_action',
];

function countBy<T extends string>(rows: Array<Record<string, unknown>>, key: string, values: readonly T[]): Record<T, number> {
  const out = Object.fromEntries(values.map(value => [value, 0])) as Record<T, number>;
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string' && value in out) out[value as T] += 1;
  }
  return out;
}

export function buildRenderedContrastReport(input: {
  outDir: string;
  rows: RenderedContrastDiagnosticRow[];
  maxPages: number;
  maxTextRuns: number;
  createdAt?: string;
}): RenderedContrastDiagnosticReport {
  const rows = [...input.rows].sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
  const lowFocus = rows.filter(row => row.role === 'focus' && row.classification === 'low_contrast_candidate').length;
  const lowControls = rows.filter(row => row.role === 'control' && row.classification === 'low_contrast_candidate').length;
  const uncertain = rows.filter(row => row.classification === 'uncertain_contrast_evidence').length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `low_focus=${lowFocus}`,
    `low_controls=${lowControls}`,
    `uncertain=${uncertain}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : lowFocus > 0 && lowControls === 0
      ? 'plan_rendered_contrast_validation'
      : uncertain > 0
        ? 'plan_rendered_contrast_sampling_hardening'
        : 'keep_rendered_contrast_opt_in_diagnostic_only';
  return {
    createdAt: input.createdAt ?? new Date().toISOString(),
    outDir: input.outDir,
    selectedRowCount: rows.length,
    maxPages: input.maxPages,
    maxTextRuns: input.maxTextRuns,
    classificationDistribution: countBy(rows, 'classification', CLASSIFICATIONS),
    suggestedActionDistribution: countBy(rows, 'suggestedAction', ACTIONS),
    decision: { status, reasons },
    rows,
  };
}

function mdRow(values: Array<string | number | null | undefined>): string {
  return `| ${values.map(value => String(value ?? '')).join(' | ')} |`;
}

function renderSamples(samples: ContrastRunSample[]): string {
  if (samples.length === 0) return 'none';
  return samples.map(sample => `p${sample.page + 1}:${sample.ratio ?? 'n/a'}:${sample.text.replace(/\|/g, '/')}`).join('; ');
}

export function renderMarkdown(report: RenderedContrastDiagnosticReport): string {
  const lines: string[] = [
    '# Rendered Contrast Opt-In Diagnostic',
    '',
    `Generated: \`${report.createdAt}\``,
    `Rows: ${report.selectedRowCount}`,
    `Sampling: maxPages=${report.maxPages}, maxTextRuns=${report.maxTextRuns}`,
    '',
    'Diagnostic-only opt-in rendered text contrast evidence. Default analyze/remediate/scoring paths are unchanged.',
    '',
    '## Decision',
    '',
    `- Status: \`${report.decision.status}\``,
    `- Reasons: ${report.decision.reasons.join(', ')}`,
    '',
    '## Rows',
    '',
    mdRow(['Row', 'Role', 'Score', 'Grade', 'Measured', 'Runs', 'Low', 'Uncertain', 'Min ratio', 'Median ratio', 'ms', 'Class', 'Action']),
    mdRow(['---', '---', '---:', '---', '---', '---:', '---:', '---:', '---:', '---:', '---:', '---', '---']),
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push(mdRow([
      row.id,
      row.role,
      f?.score,
      f?.grade,
      f ? String(f.measured) : 'ERR',
      f?.sampledTextRunCount,
      f?.lowContrastTextRunCount,
      f?.uncertainTextRunCount,
      f?.minContrastRatio,
      f?.medianContrastRatio,
      f?.measurementMs,
      row.classification,
      row.suggestedAction,
    ]));
  }
  lines.push('', '## Details');
  for (const row of report.rows) {
    lines.push('', `### ${row.id}`, '');
    lines.push(`- File: \`${row.pdfPath}\``);
    lines.push(`- Reasons: ${row.reasons.join('; ') || 'none'}`);
    if (row.error) lines.push(`- Error: \`${row.error}\``);
    if (row.features) {
      lines.push(`- Confidence: ${row.features.confidenceReason}`);
      lines.push(`- Low samples: ${renderSamples(row.features.lowContrastSamples)}`);
      lines.push(`- Uncertain samples: ${renderSamples(row.features.uncertainSamples)}`);
    }
  }
  lines.push('');
  if (report.decision.status === 'plan_rendered_contrast_validation') {
    lines.push('A later validation stage may compare these opt-in low-contrast candidates against visual controls and PAC/POC evidence. Do not make default color-contrast scoring active from this diagnostic alone.');
  } else if (report.decision.status === 'plan_rendered_contrast_sampling_hardening') {
    lines.push('Improve the opt-in sampling/foreground-background separation before considering any scoring or broad validation.');
  } else if (report.decision.status === 'diagnostic_errors_present') {
    lines.push('Resolve render/analyze errors before making a contrast-lane decision.');
  } else {
    lines.push('No rendered-contrast promotion is justified from this sample. Keep contrast opt-in/manual-review unless a stronger validation sample is produced.');
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const selected = await collectContentEventRows(args);
  const rows: RenderedContrastDiagnosticRow[] = [];
  for (const row of selected) {
    const result = await analyzeRow(row, args.maxPages, args.maxTextRuns);
    rows.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[contrast] ${result.id} ${score} ${result.classification}`);
  }
  const report = buildRenderedContrastReport({
    outDir: args.outDir,
    rows,
    maxPages: args.maxPages,
    maxTextRuns: args.maxTextRuns,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'rendered-contrast-opt-in.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'rendered-contrast-opt-in.md'), renderMarkdown(report), 'utf8');
  console.log(`[contrast] wrote ${join(args.outDir, 'rendered-contrast-opt-in.md')}`);
  console.log(`[contrast] decision ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

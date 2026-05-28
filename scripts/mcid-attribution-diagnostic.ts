#!/usr/bin/env tsx
import 'dotenv/config';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PYTHON_SCRIPT_PATH, REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';

const execFileAsync = promisify(execFile);
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';

type JsonRecord = Record<string, unknown>;

export type McidAttributionClassification =
  | 'current_collector_misses_stable_refs'
  | 'stable_traversal_changes_debt'
  | 'stable_matches_current'
  | 'analysis_error';

interface Args {
  pdfs: string[];
  outDir: string;
  controls: Set<string>;
}

export interface McidAttributionDiagnosticInput {
  error?: string | null;
  currentOrphanMcidCount?: number | null;
  stableOrphanMcidCount?: number | null;
  currentOrphanStableReferencedCount?: number | null;
  stableRefOnlyCount?: number | null;
  currentRefOnlyCount?: number | null;
}

interface McidAttributionRow {
  id: string;
  file: string;
  role: 'focus' | 'control';
  classification: McidAttributionClassification;
  diagnostic: JsonRecord | null;
  reasons: string[];
  error: string | null;
}

interface Report {
  generatedAt: string;
  outDir: string;
  rows: McidAttributionRow[];
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    classificationCounts: Record<string, number>;
    currentCollectorMissRows: string[];
    stableTraversalChangeRows: string[];
  };
  decision: {
    status: 'plan_current_collector_attribution_review' | 'diagnostic_only';
    reasons: string[];
  };
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/mcid-attribution-diagnostic.ts --pdf <path> [options]

Options:
  --pdf <path>      PDF to diagnose; repeatable
  --out <dir>       Output directory (default: ${DEFAULT_OUT_ROOT}/mcid-attribution-<timestamp>)
  --control <id>    Mark row id as a control; repeatable
  --help            Show this help.`;
}

function idForPdf(path: string): string {
  return basename(path).replace(/\.pdf$/i, '');
}

export function parseArgs(argv: string[], now = new Date()): Args {
  const pdfs: string[] = [];
  const controls = new Set<string>();
  let outDir = join(DEFAULT_OUT_ROOT, `mcid-attribution-${timestampSlug(now)}`);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--pdf') {
      const value = argv[++i];
      if (!value) throw new Error('--pdf requires a path');
      pdfs.push(resolve(value));
      continue;
    }
    if (arg === '--out') {
      const value = argv[++i];
      if (!value) throw new Error('--out requires a path');
      outDir = resolve(value);
      continue;
    }
    if (arg === '--control') {
      const value = argv[++i];
      if (!value) throw new Error('--control requires an id');
      controls.add(value.replace(/\.pdf$/i, ''));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (pdfs.length === 0) throw new Error('At least one --pdf is required');
  return { pdfs, outDir, controls };
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringKeys(value: unknown): string[] {
  return arrayValue(value)
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as JsonRecord;
      const page = numberValue(obj['page']);
      const mcid = numberValue(obj['mcid']);
      return page === null || mcid === null ? null : `${page}:${mcid}`;
    })
    .filter((item): item is string => Boolean(item));
}

export function classifyMcidAttribution(input: McidAttributionDiagnosticInput): { classification: McidAttributionClassification; reasons: string[] } {
  if (input.error) {
    return { classification: 'analysis_error', reasons: [input.error] };
  }
  const currentOrphanStableReferenced = input.currentOrphanStableReferencedCount ?? 0;
  const stableRefOnly = input.stableRefOnlyCount ?? 0;
  const currentRefOnly = input.currentRefOnlyCount ?? 0;
  const currentOrphans = input.currentOrphanMcidCount ?? 0;
  const stableOrphans = input.stableOrphanMcidCount ?? 0;
  if (currentOrphanStableReferenced > 0) {
    return {
      classification: 'current_collector_misses_stable_refs',
      reasons: [`current_orphan_stable_referenced:${currentOrphanStableReferenced}`],
    };
  }
  if (stableRefOnly > 0 || currentRefOnly > 0 || currentOrphans !== stableOrphans) {
    return {
      classification: 'stable_traversal_changes_debt',
      reasons: [
        `current_orphans:${currentOrphans}`,
        `stable_orphans:${stableOrphans}`,
        `stable_ref_only:${stableRefOnly}`,
        `current_ref_only:${currentRefOnly}`,
      ],
    };
  }
  return { classification: 'stable_matches_current', reasons: ['stable_and_current_traversal_match'] };
}

async function runPythonDiagnostic(pdfPath: string): Promise<JsonRecord> {
  try {
    const { stdout } = await execFileAsync(
      'python3',
      [PYTHON_SCRIPT_PATH, '--diagnose-mcid-attribution', pdfPath],
      {
        timeout: REMEDIATION_ANALYSIS_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    return JSON.parse(stdout) as JsonRecord;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function buildReport(args: Args): Promise<Report> {
  const rows: McidAttributionRow[] = [];
  for (const pdf of args.pdfs) {
    const id = idForPdf(pdf);
    const diagnostic = await runPythonDiagnostic(pdf);
    const error = typeof diagnostic['error'] === 'string' ? diagnostic['error'] : null;
    const classified = classifyMcidAttribution({
      error,
      currentOrphanMcidCount: numberValue(diagnostic['currentOrphanMcidCount']),
      stableOrphanMcidCount: numberValue(diagnostic['stableOrphanMcidCount']),
      currentOrphanStableReferencedCount: numberValue(diagnostic['currentOrphanStableReferencedCount']),
      stableRefOnlyCount: numberValue(diagnostic['stableRefOnlyCount']),
      currentRefOnlyCount: numberValue(diagnostic['currentRefOnlyCount']),
    });
    rows.push({
      id,
      file: basename(pdf),
      role: args.controls.has(id) ? 'control' : 'focus',
      classification: classified.classification,
      diagnostic: error ? null : diagnostic,
      reasons: classified.reasons,
      error,
    });
  }
  const classificationCounts: Record<string, number> = {};
  for (const row of rows) classificationCounts[row.classification] = (classificationCounts[row.classification] ?? 0) + 1;
  const currentCollectorMissRows = rows
    .filter(row => row.classification === 'current_collector_misses_stable_refs')
    .map(row => row.id);
  const stableTraversalChangeRows = rows
    .filter(row => row.classification === 'stable_traversal_changes_debt')
    .map(row => row.id);
  const reasons: string[] = [];
  if (currentCollectorMissRows.length > 0) reasons.push(`current_collector_miss_rows:${currentCollectorMissRows.length}`);
  if (stableTraversalChangeRows.length > 0) reasons.push(`stable_traversal_change_rows:${stableTraversalChangeRows.length}`);
  if (reasons.length === 0) reasons.push('no_current_vs_stable_attribution_gap');
  return {
    generatedAt: new Date().toISOString(),
    outDir: args.outDir,
    rows,
    summary: {
      rowCount: rows.length,
      focusCount: rows.filter(row => row.role === 'focus').length,
      controlCount: rows.filter(row => row.role === 'control').length,
      classificationCounts,
      currentCollectorMissRows,
      stableTraversalChangeRows,
    },
    decision: {
      status: currentCollectorMissRows.length > 0 || stableTraversalChangeRows.length > 0
        ? 'plan_current_collector_attribution_review'
        : 'diagnostic_only',
      reasons,
    },
  };
}

function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push('# MCID Attribution Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Decision: \`${report.decision.status}\``);
  lines.push(`Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ')}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Rows: ${report.summary.rowCount} (${report.summary.focusCount} focus / ${report.summary.controlCount} control)`);
  lines.push(`- Current collector miss rows: ${report.summary.currentCollectorMissRows.length ? report.summary.currentCollectorMissRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push(`- Stable traversal change rows: ${report.summary.stableTraversalChangeRows.length ? report.summary.stableTraversalChangeRows.map(id => `\`${id}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Row | Role | Class | Current orphan | Stable orphan | Stable-ref orphan sample | Table refs covering sample | Reasons |');
  lines.push('| --- | --- | --- | ---: | ---: | --- | --- | --- |');
  for (const row of report.rows) {
    const d = row.diagnostic ?? {};
    const sample = stringKeys(d['currentOrphanStableReferencedSample']).slice(0, 8).join(', ');
    const tableRefs = arrayValue(d['tableRefsCoveringCurrentOrphanStableRefs'])
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as JsonRecord;
        return typeof obj['ref'] === 'string' ? `${obj['ref']}(${numberValue(obj['coveredCount']) ?? '?'})` : null;
      })
      .filter((item): item is string => Boolean(item))
      .slice(0, 8)
      .join(', ');
    lines.push([
      `\`${row.id}\``,
      row.role,
      `\`${row.classification}\``,
      numberValue(d['currentOrphanMcidCount']) ?? 'n/a',
      numberValue(d['stableOrphanMcidCount']) ?? 'n/a',
      sample ? `\`${sample}\`` : 'none',
      tableRefs ? `\`${tableRefs}\`` : 'none',
      row.reasons.map(reason => `\`${reason}\``).join(', '),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });
  const report = await buildReport(args);
  await writeFile(join(args.outDir, 'mcid-attribution-diagnostic.json'), JSON.stringify(report, null, 2));
  await writeFile(join(args.outDir, 'mcid-attribution-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.outDir, 'mcid-attribution-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

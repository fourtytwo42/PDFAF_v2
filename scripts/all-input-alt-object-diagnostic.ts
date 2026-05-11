#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../src/types.js';

const DEFAULT_RUN = 'Output/goal-all-input-mean-2026-05-09-r1/run-alt-object-targets-2026-05-11-r1';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/alt-object-diagnostic-2026-05-11-r1';

export type AltObjectClassification =
  | 'direct_checker_alt_candidate'
  | 'role_visibility_or_ownership_gap'
  | 'alt_not_primary_blocker'
  | 'recovered_or_high'
  | 'protected_reanalysis_drift'
  | 'runtime_or_analysis_blocked';

export interface AltToolSummary {
  toolName: string;
  outcome: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  targetRef: string | null;
  note: string | null;
}

export interface AltObjectEvidenceInput {
  file: string;
  runScore: number | null;
  runGrade: string | null;
  score: number | null;
  grade: string | null;
  altTextScore: number | null;
  pdfUaScore: number | null;
  tableMarkupScore: number | null;
  checkerFigureCount: number;
  checkerMissingAltCount: number;
  rawReachableFigureCount: number;
  rawReachableMissingAltCount: number;
  nonFigureWithAltCount: number;
  nestedFigureAltCount: number;
  orphanedAltEmptyElementCount: number;
  figureToolAttempts: AltToolSummary[];
}

export interface AltObjectDiagnosticRow extends AltObjectEvidenceInput {
  classification: AltObjectClassification;
  recommendedNextAction: string;
  topMissingCheckerRefs: string[];
  topRawMissingRefs: string[];
}

export interface AltObjectDiagnostic {
  generatedAt: string;
  runDir: string;
  summary: {
    rowCount: number;
    byClassification: Record<AltObjectClassification, number>;
    candidateFiles: string[];
    recoveredFiles: string[];
  };
  rows: AltObjectDiagnosticRow[];
}

interface BaselineReport {
  rows?: BaselineRow[];
}

interface BaselineRow {
  file: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  categoryGap?: { after?: Array<{ key: CategoryKey; score: number; applicable?: boolean }> };
  appliedTools?: AppliedRemediationTool[];
  error?: string | null;
}

function parseArgs(argv: string[]): { runDir: string; out: string } {
  let runDir = DEFAULT_RUN;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--run' && next) {
      runDir = next;
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-alt-object-diagnostic.ts [--run <run-dir>] [--out <out-dir>]',
        `Defaults: --run ${DEFAULT_RUN} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { runDir, out };
}

function scoreFor(row: BaselineRow, key: CategoryKey): number | null {
  const match = row.categoryGap?.after?.find(category => category.key === key && category.applicable !== false);
  return typeof match?.score === 'number' ? match.score : null;
}

function safeBase(file: string): string {
  return basename(file).replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string' || !details.startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nestedRecord(input: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = input?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(input: unknown): string | null {
  return typeof input === 'string' && input.length > 0 ? input : null;
}

export function summarizeAltTools(tools: AppliedRemediationTool[] | undefined): AltToolSummary[] {
  return (tools ?? [])
    .filter(tool => /figure|alt/i.test(tool.toolName))
    .map(tool => {
      const details = parseDetails(tool.details);
      const invariants = nestedRecord(details, 'invariants');
      const debug = nestedRecord(details, 'debug');
      const candidate = nestedRecord(debug, 'candidate');
      return {
        toolName: tool.toolName,
        outcome: tool.outcome ?? null,
        scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
        scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
        delta: typeof tool.delta === 'number' ? tool.delta : null,
        targetRef: stringValue(invariants?.['targetRef']) ?? stringValue(candidate?.['structRef']),
        note: stringValue(details?.['note']) ?? stringValue(details?.['raw']),
      };
    });
}

export function classifyAltObjectEvidence(input: AltObjectEvidenceInput): {
  classification: AltObjectClassification;
  recommendedNextAction: string;
} {
  if (input.score === null || input.grade === null) {
    return {
      classification: 'runtime_or_analysis_blocked',
      recommendedNextAction: 'Inspect runtime trace before selecting an alt repair; no score state is available.',
    };
  }
  if ((input.runScore ?? input.score) >= 93 && input.score < 93) {
    return {
      classification: 'protected_reanalysis_drift',
      recommendedNextAction: 'Do not count the run score as recovered until protected reanalysis drift is explained.',
    };
  }
  if (input.score >= 93) {
    return {
      classification: 'recovered_or_high',
      recommendedNextAction: 'Treat as current-code recovery/control; no alt behavior change needed.',
    };
  }
  if ((input.altTextScore ?? 100) >= 80) {
    return {
      classification: 'alt_not_primary_blocker',
      recommendedNextAction: 'Alt is not the main remaining score deficit; classify via heading/table/PDF-UA lanes.',
    };
  }
  if (input.checkerMissingAltCount > 0) {
    return {
      classification: 'direct_checker_alt_candidate',
      recommendedNextAction: 'Inspect target refs and existing figure tool outcomes; a bounded set_figure_alt_text/retag route may be safe only with protected reanalysis improvement.',
    };
  }
  if (input.rawReachableMissingAltCount > 0 || input.nonFigureWithAltCount > 0 || input.nestedFigureAltCount > 0 || input.orphanedAltEmptyElementCount > 0) {
    return {
      classification: 'role_visibility_or_ownership_gap',
      recommendedNextAction: 'Alt evidence exists outside checker-visible figure ownership; route/role-map ownership diagnostic is needed before behavior.',
    };
  }
  return {
    classification: 'alt_not_primary_blocker',
    recommendedNextAction: 'No direct checker-visible missing-alt target remains; do not add alt repair behavior from this row.',
  };
}

function buildRow(input: {
  row: BaselineRow;
  result: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
}): AltObjectDiagnosticRow {
  const snapshot = input.snapshot;
  const checkerTargets = snapshot?.checkerFigureTargets ?? [];
  const rawFigures = snapshot?.figures ?? [];
  const checkerMissing = checkerTargets
    .filter(target => target.reachable && !target.isArtifact && !target.hasAlt);
  const rawMissing = rawFigures
    .filter(figure => figure.reachable !== false && !figure.isArtifact && !figure.hasAlt);
  const evidence: AltObjectEvidenceInput = {
    file: input.row.file,
    score: input.result?.score ?? input.row.afterScore ?? null,
    grade: input.result?.grade ?? input.row.afterGrade ?? null,
    altTextScore: input.result?.categories.find(category => category.key === 'alt_text')?.score ?? scoreFor(input.row, 'alt_text'),
    pdfUaScore: input.result?.categories.find(category => category.key === 'pdf_ua_compliance')?.score ?? scoreFor(input.row, 'pdf_ua_compliance'),
    tableMarkupScore: input.result?.categories.find(category => category.key === 'table_markup')?.score ?? scoreFor(input.row, 'table_markup'),
    checkerFigureCount: checkerTargets.filter(target => target.reachable && !target.isArtifact).length,
    checkerMissingAltCount: checkerMissing.length,
    rawReachableFigureCount: rawFigures.filter(figure => figure.reachable !== false && !figure.isArtifact).length,
    rawReachableMissingAltCount: rawMissing.length,
    nonFigureWithAltCount: snapshot?.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0,
    nestedFigureAltCount: snapshot?.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0,
    orphanedAltEmptyElementCount: snapshot?.acrobatStyleAltRisks?.orphanedAltEmptyElementCount ?? 0,
    figureToolAttempts: summarizeAltTools(input.row.appliedTools),
    runScore: input.row.afterScore ?? null,
    runGrade: input.row.afterGrade ?? null,
  };
  const classification = classifyAltObjectEvidence(evidence);
  return {
    ...evidence,
    ...classification,
    topMissingCheckerRefs: checkerMissing
      .map(target => target.structRef ?? `page-${target.page}`)
      .slice(0, 10),
    topRawMissingRefs: rawMissing
      .map(figure => figure.structRef ?? `page-${figure.page}`)
      .slice(0, 10),
  };
}

export async function buildAltObjectDiagnostic(input: {
  runDir: string;
  generatedAt?: string;
}): Promise<AltObjectDiagnostic> {
  const reportPath = join(input.runDir, 'baseline_report.json');
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as BaselineReport;
  const names = await readdir(input.runDir);
  const rows: AltObjectDiagnosticRow[] = [];

  for (const row of report.rows ?? []) {
    const pdfName = `${safeBase(row.file)}_remediated.pdf`;
    const remediatedName = names.find(name => name === pdfName) ??
      names.find(name => name.startsWith(safeBase(row.file)) && name.endsWith('.pdf'));
    let result: AnalysisResult | null = null;
    let snapshot: DocumentSnapshot | null = null;
    if (remediatedName) {
      try {
        const analyzed = await analyzePdf(join(input.runDir, remediatedName), row.file, {
          timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
          bypassCache: true,
        });
        result = analyzed.result;
        snapshot = analyzed.snapshot;
      } catch {
        result = null;
        snapshot = null;
      }
    }
    rows.push(buildRow({ row, result, snapshot }));
  }

  const byClassification = Object.fromEntries(
    (['direct_checker_alt_candidate', 'role_visibility_or_ownership_gap', 'alt_not_primary_blocker', 'recovered_or_high', 'runtime_or_analysis_blocked'] as AltObjectClassification[])
      .concat(['protected_reanalysis_drift'])
      .map(key => [key, rows.filter(row => row.classification === key).length]),
  ) as Record<AltObjectClassification, number>;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: input.runDir,
    summary: {
      rowCount: rows.length,
      byClassification,
      candidateFiles: rows
        .filter(row => row.classification === 'direct_checker_alt_candidate' || row.classification === 'role_visibility_or_ownership_gap')
        .map(row => row.file),
      recoveredFiles: rows
        .filter(row => row.classification === 'recovered_or_high')
        .map(row => row.file),
    },
    rows,
  };
}

function markdown(report: AltObjectDiagnostic): string {
  const lines = [
    '# All-Input Alt Object Diagnostic',
    '',
    `Generated: ${report.generatedAt}`,
    `Run: \`${report.runDir}\``,
    '',
    '## Summary',
    '',
    `Rows: ${report.summary.rowCount}`,
    `Candidates: ${report.summary.candidateFiles.length ? report.summary.candidateFiles.map(file => `\`${file}\``).join(', ') : 'none'}`,
    `Recovered/high: ${report.summary.recoveredFiles.length ? report.summary.recoveredFiles.map(file => `\`${file}\``).join(', ') : 'none'}`,
    '',
    '| classification | count |',
    '| --- | ---: |',
    ...Object.entries(report.summary.byClassification).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '## Rows',
    '',
    '| file | run score | reanalysis score | alt | checker missing | raw missing | risks | classification | next action |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const risks = [
      `nonFigureAlt=${row.nonFigureWithAltCount}`,
      `nestedFigureAlt=${row.nestedFigureAltCount}`,
      `orphanEmptyAlt=${row.orphanedAltEmptyElementCount}`,
    ].join('<br>');
    lines.push([
      `| \`${row.file}\``,
      row.runScore ?? 'n/a',
      row.score ?? 'n/a',
      row.altTextScore ?? 'n/a',
      `${row.checkerMissingAltCount}/${row.checkerFigureCount}`,
      `${row.rawReachableMissingAltCount}/${row.rawReachableFigureCount}`,
      risks,
      row.classification,
      row.recommendedNextAction,
    ].join(' | ') + ' |');
    const toolRows = row.figureToolAttempts
      .map(tool => `  - ${tool.toolName}/${tool.outcome ?? 'unknown'} ${tool.scoreBefore ?? '?'} -> ${tool.scoreAfter ?? '?'}${tool.targetRef ? ` target=${tool.targetRef}` : ''}${tool.note ? ` note=${tool.note}` : ''}`);
    if (toolRows.length > 0) {
      lines.push('', `<details><summary>${row.file} figure/alt tools</summary>`, '', ...toolRows, '', '</details>', '');
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildAltObjectDiagnostic({ runDir: args.runDir });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'all-input-alt-object-diagnostic.json'), JSON.stringify(report, null, 2));
  await writeFile(join(args.out, 'all-input-alt-object-diagnostic.md'), markdown(report));
  console.log(`Wrote ${join(args.out, 'all-input-alt-object-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

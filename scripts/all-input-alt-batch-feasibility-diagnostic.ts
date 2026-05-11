#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ALT_TEXT_THRESHOLDS } from '../src/config.js';
import type { AppliedRemediationTool, CategoryKey } from '../src/types.js';
import type { AltObjectDiagnostic, AltObjectDiagnosticRow } from './all-input-alt-object-diagnostic.js';

const DEFAULT_ALT_DIAGNOSTIC = 'Output/goal-all-input-mean-2026-05-09-r1/alt-object-diagnostic-r5-complete-2026-05-11-r1/all-input-alt-object-diagnostic.json';
const DEFAULT_SECOND_PASS = 'Output/goal-all-input-mean-2026-05-09-r1/run-alt-0136-secondpass-r5-complete-2026-05-11-r1/baseline_report.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/alt-batch-feasibility-r5-complete-2026-05-11-r1';

export type AltBatchFeasibilityClassification =
  | 'many_alt_batch_candidate'
  | 'protected_drift_blocked'
  | 'current_recovery_control'
  | 'not_alt_first'
  | 'insufficient_second_pass_proof';

export interface AltBatchProjection {
  threshold: 'LOW' | 'MODERATE' | 'HIGH' | 'FULL';
  ratio: number;
  requiredWithAlt: number;
  additionalNeeded: number;
}

export interface AltBatchSecondPassEvidence {
  scoreBefore: number | null;
  scoreAfter: number | null;
  gradeAfter: string | null;
  altTextAfter: number | null;
  durationMs: number | null;
  falsePositiveApplied: number;
  figureAltApplications: number;
  figureAltToolAttempts: number;
}

export interface AltBatchFeasibilityRow {
  file: string;
  currentScore: number | null;
  currentGrade: string | null;
  currentAltTextScore: number | null;
  checkerFigureCount: number;
  checkerMissingAltCount: number;
  checkerWithAltCount: number;
  currentClassification: string;
  secondPass: AltBatchSecondPassEvidence | null;
  projections: AltBatchProjection[];
  classification: AltBatchFeasibilityClassification;
  runtimeRisk: 'low' | 'medium' | 'high' | 'unknown';
  recommendedNextAction: string;
}

export interface AltBatchFeasibilityDiagnostic {
  generatedAt: string;
  altDiagnosticSource: string;
  secondPassSources: string[];
  summary: {
    rowCount: number;
    byClassification: Record<AltBatchFeasibilityClassification, number>;
    selectedCandidates: string[];
  };
  rows: AltBatchFeasibilityRow[];
}

interface BaselineReport {
  rows?: BaselineRow[];
}

interface BaselineRow {
  file: string;
  beforeScore?: number | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  falsePositiveApplied?: number | boolean | null;
  categoryGap?: {
    after?: Array<{ key: CategoryKey; score: number; applicable?: boolean }>;
  };
  appliedTools?: AppliedRemediationTool[];
}

interface CliArgs {
  altDiagnostic: string;
  secondPasses: string[];
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  let altDiagnostic = DEFAULT_ALT_DIAGNOSTIC;
  let out = DEFAULT_OUT;
  const secondPasses: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--alt-diagnostic' && next) {
      altDiagnostic = next;
      i++;
    } else if (arg === '--second-pass' && next) {
      secondPasses.push(next);
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-alt-batch-feasibility-diagnostic.ts [options]',
        '',
        `  --alt-diagnostic <json>  Alt object diagnostic JSON (default: ${DEFAULT_ALT_DIAGNOSTIC})`,
        `  --second-pass <json>     Second-pass baseline_report.json; repeatable (default: ${DEFAULT_SECOND_PASS})`,
        `  --out <dir>              Output directory (default: ${DEFAULT_OUT})`,
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (secondPasses.length === 0) secondPasses.push(DEFAULT_SECOND_PASS);
  return { altDiagnostic, secondPasses, out };
}

function baseKey(file: string): string {
  return basename(file);
}

function scoreFor(row: BaselineRow, key: CategoryKey): number | null {
  const match = row.categoryGap?.after?.find(category => category.key === key && category.applicable !== false);
  return typeof match?.score === 'number' ? match.score : null;
}

function falsePositiveCount(input: number | boolean | null | undefined): number {
  if (typeof input === 'number') return input;
  return input ? 1 : 0;
}

function toolAttempts(tools: AppliedRemediationTool[] | undefined, name: string): number {
  return (tools ?? []).filter(tool => tool.toolName === name).length;
}

function appliedToolAttempts(tools: AppliedRemediationTool[] | undefined, name: string): number {
  return (tools ?? []).filter(tool => tool.toolName === name && tool.outcome === 'applied').length;
}

function projectionsFor(row: AltObjectDiagnosticRow): AltBatchProjection[] {
  const total = row.checkerFigureCount;
  const withAlt = Math.max(0, total - row.checkerMissingAltCount);
  const thresholds: Array<AltBatchProjection['threshold']> = ['LOW', 'MODERATE', 'HIGH', 'FULL'];
  return thresholds.map(threshold => {
    const ratio = ALT_TEXT_THRESHOLDS[threshold];
    const requiredWithAlt = total > 0 ? Math.ceil(total * ratio) : 0;
    return {
      threshold,
      ratio,
      requiredWithAlt,
      additionalNeeded: Math.max(0, requiredWithAlt - withAlt),
    };
  });
}

function runtimeRisk(secondPass: AltBatchSecondPassEvidence | null): AltBatchFeasibilityRow['runtimeRisk'] {
  const duration = secondPass?.durationMs;
  if (typeof duration !== 'number') return 'unknown';
  if (duration >= 180_000) return 'high';
  if (duration >= 60_000) return 'medium';
  return 'low';
}

function classify(input: {
  row: AltObjectDiagnosticRow;
  secondPass: AltBatchSecondPassEvidence | null;
}): { classification: AltBatchFeasibilityClassification; recommendedNextAction: string } {
  const { row, secondPass } = input;
  if ((row.runScore ?? 0) >= 90 && (row.score ?? 0) < 93) {
    return {
      classification: 'protected_drift_blocked',
      recommendedNextAction: 'Do not batch alt from this row until protected/analyzer drift is explained.',
    };
  }
  if ((row.score ?? 0) >= 93) {
    return {
      classification: 'current_recovery_control',
      recommendedNextAction: 'Keep as a current-code recovery/control; no many-alt behavior needed.',
    };
  }
  if ((row.altTextScore ?? 100) >= 80 || row.checkerMissingAltCount === 0 || row.classification === 'alt_not_primary_blocker') {
    return {
      classification: 'not_alt_first',
      recommendedNextAction: 'Alt evidence is not the first score-moving blocker for this row.',
    };
  }
  if (!secondPass || secondPass.falsePositiveApplied > 0 || (secondPass.scoreAfter ?? 0) <= (row.score ?? 0) || (secondPass.altTextAfter ?? 0) <= (row.altTextScore ?? 0)) {
    return {
      classification: 'insufficient_second_pass_proof',
      recommendedNextAction: 'Direct missing-alt evidence exists, but there is no clean second-pass movement proof yet.',
    };
  }
  if (row.checkerMissingAltCount >= 20 && secondPass.figureAltApplications >= 3) {
    return {
      classification: 'many_alt_batch_candidate',
      recommendedNextAction: 'Design a bounded many-figure-alt batch probe with protected reanalysis, PAC/page/text/tag safety, and weak-alt/manual-review visibility.',
    };
  }
  return {
    classification: 'insufficient_second_pass_proof',
    recommendedNextAction: 'Movement proof exists, but target volume is too small or not enough figure-alt applications were observed to justify batching.',
  };
}

async function readSecondPassEvidence(paths: string[]): Promise<Map<string, AltBatchSecondPassEvidence>> {
  const map = new Map<string, AltBatchSecondPassEvidence>();
  for (const path of paths) {
    const report = JSON.parse(await readFile(path, 'utf8')) as BaselineReport;
    for (const row of report.rows ?? []) {
      const evidence: AltBatchSecondPassEvidence = {
        scoreBefore: typeof row.beforeScore === 'number' ? row.beforeScore : null,
        scoreAfter: typeof row.afterScore === 'number' ? row.afterScore : null,
        gradeAfter: row.afterGrade ?? null,
        altTextAfter: scoreFor(row, 'alt_text'),
        durationMs: typeof row.durationMs === 'number' ? row.durationMs : null,
        falsePositiveApplied: falsePositiveCount(row.falsePositiveApplied),
        figureAltApplications: appliedToolAttempts(row.appliedTools, 'set_figure_alt_text'),
        figureAltToolAttempts: toolAttempts(row.appliedTools, 'set_figure_alt_text'),
      };
      map.set(baseKey(row.file), evidence);
    }
  }
  return map;
}

export async function buildAltBatchFeasibilityDiagnostic(input: {
  altDiagnostic: AltObjectDiagnostic;
  altDiagnosticSource?: string;
  secondPassSources?: string[];
  secondPassByFile?: Map<string, AltBatchSecondPassEvidence>;
  generatedAt?: string;
}): Promise<AltBatchFeasibilityDiagnostic> {
  const secondPassByFile = input.secondPassByFile ?? await readSecondPassEvidence(input.secondPassSources ?? []);
  const rows = input.altDiagnostic.rows
    .map(row => {
      const secondPass = secondPassByFile.get(baseKey(row.file)) ?? null;
      const decision = classify({ row, secondPass });
      return {
        file: row.file,
        currentScore: row.score,
        currentGrade: row.grade,
        currentAltTextScore: row.altTextScore,
        checkerFigureCount: row.checkerFigureCount,
        checkerMissingAltCount: row.checkerMissingAltCount,
        checkerWithAltCount: Math.max(0, row.checkerFigureCount - row.checkerMissingAltCount),
        currentClassification: row.classification,
        secondPass,
        projections: projectionsFor(row),
        classification: decision.classification,
        runtimeRisk: runtimeRisk(secondPass),
        recommendedNextAction: decision.recommendedNextAction,
      } satisfies AltBatchFeasibilityRow;
    })
    .sort((a, b) => {
      const order: Record<AltBatchFeasibilityClassification, number> = {
        many_alt_batch_candidate: 0,
        protected_drift_blocked: 1,
        insufficient_second_pass_proof: 2,
        not_alt_first: 3,
        current_recovery_control: 4,
      };
      return order[a.classification] - order[b.classification] ||
        b.checkerMissingAltCount - a.checkerMissingAltCount ||
        a.file.localeCompare(b.file);
    });

  const classes: AltBatchFeasibilityClassification[] = [
    'many_alt_batch_candidate',
    'protected_drift_blocked',
    'current_recovery_control',
    'not_alt_first',
    'insufficient_second_pass_proof',
  ];
  const byClassification = Object.fromEntries(
    classes.map(classification => [classification, rows.filter(row => row.classification === classification).length]),
  ) as Record<AltBatchFeasibilityClassification, number>;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    altDiagnosticSource: input.altDiagnosticSource ?? '',
    secondPassSources: input.secondPassSources ?? [],
    summary: {
      rowCount: rows.length,
      byClassification,
      selectedCandidates: rows
        .filter(row => row.classification === 'many_alt_batch_candidate')
        .map(row => row.file),
    },
    rows,
  };
}

function renderMarkdown(report: AltBatchFeasibilityDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Alt Batch Feasibility Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Alt object diagnostic: \`${report.altDiagnosticSource}\``);
  lines.push(`Second-pass reports: ${report.secondPassSources.map(source => `\`${source}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`Rows: ${report.summary.rowCount}`);
  lines.push(`Selected candidates: ${report.summary.selectedCandidates.map(file => `\`${file}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('| classification | count |');
  lines.push('| --- | ---: |');
  for (const [classification, count] of Object.entries(report.summary.byClassification)) {
    lines.push(`| ${classification} | ${count} |`);
  }
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| file | current | alt | checker missing | second pass | set-alt applied | projections needed | class | runtime risk | next action |');
  lines.push('| --- | ---: | ---: | ---: | --- | ---: | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const projectionText = row.projections
      .map(projection => `${projection.threshold}:${projection.additionalNeeded}`)
      .join('<br>');
    const secondPassText = row.secondPass
      ? `${row.secondPass.scoreBefore ?? '?'} -> ${row.secondPass.scoreAfter ?? '?'}/${row.secondPass.gradeAfter ?? '?'} alt=${row.secondPass.altTextAfter ?? '?'}`
      : 'none';
    lines.push([
      `| \`${row.file}\``,
      `${row.currentScore ?? 'n/a'}/${row.currentGrade ?? 'n/a'}`,
      row.currentAltTextScore ?? 'n/a',
      `${row.checkerMissingAltCount}/${row.checkerFigureCount}`,
      secondPassText,
      row.secondPass?.figureAltApplications ?? 0,
      projectionText,
      row.classification,
      row.runtimeRisk,
      row.recommendedNextAction,
    ].join(' | ') + ' |');
  }
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  if (report.summary.selectedCandidates.length > 0) {
    lines.push('The diagnostic supports a later behavior probe for a bounded many-figure-alt batch on the selected candidate rows only. That later probe must still prove protected reanalysis improvement, preserve PAC/page/text/tag safety, keep `false_positive_applied = 0`, and keep weak/generated alternate text visible for review.');
  } else {
    lines.push('No many-figure-alt batch candidate is proven by the current artifacts.');
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const altDiagnostic = JSON.parse(await readFile(args.altDiagnostic, 'utf8')) as AltObjectDiagnostic;
  const report = await buildAltBatchFeasibilityDiagnostic({
    altDiagnostic,
    altDiagnosticSource: args.altDiagnostic,
    secondPassSources: args.secondPasses,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'all-input-alt-batch-feasibility-diagnostic.json'), JSON.stringify(report, null, 2));
  await writeFile(join(args.out, 'all-input-alt-batch-feasibility-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'all-input-alt-batch-feasibility-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { runSingleTool } from '../src/services/remediation/orchestrator.js';
import { buildDefaultParams } from '../src/services/remediation/planner.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot, PlannedRemediationTool } from '../src/types.js';

const DEFAULT_PDF = 'Input/from_sibling_pdfaf_v1_evolve_2/long_mixed/4614-an-evaluation-of-transitional-housing-programs-in-illinois-for-victims-o.pdf';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/0108-sequence-probe-2026-05-11-r1';

const SEQUENCES = [
  {
    name: 'heading_tab_link_parent',
    tools: [
      'create_heading_from_candidate',
      'normalize_annotation_tab_order',
      'repair_native_link_structure',
      'set_link_annotation_contents',
      'repair_top_level_parent_links',
    ],
  },
  {
    name: 'heading_link_tab_parent',
    tools: [
      'create_heading_from_candidate',
      'repair_native_link_structure',
      'set_link_annotation_contents',
      'normalize_annotation_tab_order',
      'repair_top_level_parent_links',
    ],
  },
] as const;

type Classification =
  | 'safe_transaction_candidate'
  | 'unsafe_alt_or_table_regression'
  | 'unsafe_pac_regression'
  | 'insufficient_score_or_heading_movement'
  | 'no_safe_sequence';

interface ScoreSummary {
  score: number;
  grade: string;
  heading: number | null;
  reading: number | null;
  alt: number | null;
  table: number | null;
  pdfua: number | null;
}

interface PacSummary {
  failedRules: string[];
  harmfulFailedRules: string[];
}

interface StepSummary {
  toolName: string;
  outcome: string;
  before: ScoreSummary;
  after: ScoreSummary;
  details: string | null;
  durationMs: number;
}

interface SequenceSummary {
  name: string;
  tools: string[];
  start: ScoreSummary;
  final: ScoreSummary;
  startPac: PacSummary;
  finalPac: PacSummary;
  steps: StepSummary[];
  classification: Classification;
  reason: string;
}

interface ProbeReport {
  generatedAt: string;
  pdf: string;
  sequences: SequenceSummary[];
  decision: 'behavior_probe_supported' | 'diagnostic_only_no_safe_sequence';
}

function parseArgs(argv: string[]): { pdf: string; out: string } {
  const args = { pdf: DEFAULT_PDF, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--pdf' && next) {
      args.pdf = next;
      index += 1;
    } else if (arg === '--out' && next) {
      args.out = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm exec tsx scripts/all-input-0108-sequence-probe.ts [--pdf <pdf>] [--out <dir>]');
      process.exit(0);
    }
  }
  return { pdf: resolve(args.pdf), out: resolve(args.out) };
}

function categoryScore(result: AnalysisResult, key: string): number | null {
  return result.categories.find(category => category.key === key)?.score ?? null;
}

function scoreSummary(result: AnalysisResult): ScoreSummary {
  return {
    score: result.score,
    grade: result.grade,
    heading: categoryScore(result, 'heading_structure'),
    reading: categoryScore(result, 'reading_order'),
    alt: categoryScore(result, 'alt_text'),
    table: categoryScore(result, 'table_markup'),
    pdfua: categoryScore(result, 'pdf_ua_compliance'),
  };
}

function pacSummary(snapshot: DocumentSnapshot): PacSummary {
  const failedRules = buildPacRuleEvidence(snapshot)
    .filter(row => row.status === 'fail')
    .map(row => row.ruleId)
    .sort((a, b) => a.localeCompare(b));
  const allowedTransient = new Set([
    'pdfua.annotations.tagged_annotations_present',
    'pdfua.content.orphan_mcids_absent',
  ]);
  return {
    failedRules,
    harmfulFailedRules: failedRules.filter(rule => !allowedTransient.has(rule)),
  };
}

async function analyzeBuffer(buffer: Buffer, filename: string): Promise<{ result: AnalysisResult; snapshot: DocumentSnapshot }> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-0108-sequence-'));
  const pdfPath = join(dir, filename);
  try {
    await writeFile(pdfPath, buffer);
    return await analyzePdf(pdfPath, filename, { bypassCache: true, timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function countNewHarmfulFailures(start: PacSummary, final: PacSummary): string[] {
  const before = new Set(start.harmfulFailedRules);
  return final.harmfulFailedRules.filter(rule => !before.has(rule));
}

export function classify0108Sequence(input: {
  start: ScoreSummary;
  final: ScoreSummary;
  startPac: PacSummary;
  finalPac: PacSummary;
}): { classification: Classification; reason: string } {
  if (input.final.score < 90 || input.final.score <= input.start.score) {
    return {
      classification: 'insufficient_score_or_heading_movement',
      reason: `score ${input.start.score}->${input.final.score} below 90/A transaction floor`,
    };
  }
  if ((input.final.heading ?? 0) <= (input.start.heading ?? 0) || (input.final.reading ?? 0) < (input.start.reading ?? 0)) {
    return {
      classification: 'insufficient_score_or_heading_movement',
      reason: `heading/reading movement insufficient (${input.start.heading}->${input.final.heading}, ${input.start.reading}->${input.final.reading})`,
    };
  }
  if ((input.final.alt ?? 0) < (input.start.alt ?? 0) || (input.final.table ?? 0) < (input.start.table ?? 0)) {
    return {
      classification: 'unsafe_alt_or_table_regression',
      reason: `alt/table regressed (${input.start.alt}->${input.final.alt}, ${input.start.table}->${input.final.table})`,
    };
  }
  const harmfulNew = countNewHarmfulFailures(input.startPac, input.finalPac);
  if (harmfulNew.length > 0) {
    return {
      classification: 'unsafe_pac_regression',
      reason: `new harmful PAC failures: ${harmfulNew.join(',')}`,
    };
  }
  return {
    classification: 'safe_transaction_candidate',
    reason: 'final transaction reaches 90/A floor with heading movement and no alt/table/harmful PAC regression',
  };
}

async function runSequence(
  name: string,
  tools: readonly string[],
  initialBuffer: Buffer,
  filename: string,
): Promise<SequenceSummary> {
  let buffer = initialBuffer;
  let current = await analyzeBuffer(buffer, filename);
  const start = scoreSummary(current.result);
  const startPac = pacSummary(current.snapshot);
  const steps: StepSummary[] = [];
  const applied: AppliedRemediationTool[] = [];

  for (const toolName of tools) {
    const params = buildDefaultParams(toolName, current.result, current.snapshot, applied);
    const before = scoreSummary(current.result);
    const planned: PlannedRemediationTool = {
      toolName,
      params,
      rationale: `all_input_0108_sequence_probe(${name})`,
    };
    const mutation = await runSingleTool(buffer, planned, current.snapshot, { timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS });
    buffer = mutation.buffer;
    current = await analyzeBuffer(buffer, filename);
    const after = scoreSummary(current.result);
    steps.push({
      toolName,
      outcome: mutation.outcome,
      before,
      after,
      details: typeof mutation.details === 'string' ? mutation.details.slice(0, 500) : null,
      durationMs: Math.round(mutation.durationMs),
    });
    applied.push({
      toolName,
      stage: 0,
      round: 0,
      scoreBefore: before.score,
      scoreAfter: after.score,
      delta: after.score - before.score,
      outcome: mutation.outcome,
      details: mutation.details,
      durationMs: mutation.durationMs,
    });
  }

  const final = scoreSummary(current.result);
  const finalPac = pacSummary(current.snapshot);
  const classified = classify0108Sequence({ start, final, startPac, finalPac });
  return {
    name,
    tools: [...tools],
    start,
    final,
    startPac,
    finalPac,
    steps,
    ...classified,
  };
}

function render(report: ProbeReport): string {
  const lines: string[] = [];
  lines.push('# All-Input 0108 Sequence Probe');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- PDF: \`${report.pdf}\``);
  lines.push(`- Decision: \`${report.decision}\``);
  lines.push('');
  lines.push('| Sequence | Start | Final | Classification | Reason |');
  lines.push('| --- | ---: | ---: | --- | --- |');
  for (const sequence of report.sequences) {
    lines.push(`| \`${sequence.name}\` | ${sequence.start.score}/${sequence.start.grade} | ${sequence.final.score}/${sequence.final.grade} | \`${sequence.classification}\` | ${sequence.reason} |`);
  }
  for (const sequence of report.sequences) {
    lines.push('');
    lines.push(`## ${sequence.name}`);
    lines.push('');
    lines.push('| Tool | Outcome | Score | Heading | Reading | Alt | Table | Duration ms |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | ---: |');
    for (const step of sequence.steps) {
      lines.push(`| \`${step.toolName}\` | \`${step.outcome}\` | ${step.before.score}->${step.after.score} | ${step.before.heading}->${step.after.heading} | ${step.before.reading}->${step.after.reading} | ${step.before.alt}->${step.after.alt} | ${step.before.table}->${step.after.table} | ${step.durationMs} |`);
    }
    lines.push('');
    lines.push(`Final harmful PAC failures: ${sequence.finalPac.harmfulFailedRules.map(rule => `\`${rule}\``).join(', ') || 'none'}`);
  }
  lines.push('');
  lines.push('This probe is diagnostic-only. Do not promote behavior unless targeted validation confirms the same final-safe route without accepting intermediate alt/table regressions.');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const filename = basename(args.pdf);
  const buffer = await readFile(args.pdf);
  const sequences: SequenceSummary[] = [];
  for (const sequence of SEQUENCES) {
    sequences.push(await runSequence(sequence.name, sequence.tools, buffer, filename));
  }
  const report: ProbeReport = {
    generatedAt: new Date().toISOString(),
    pdf: args.pdf,
    sequences,
    decision: sequences.some(sequence => sequence.classification === 'safe_transaction_candidate')
      ? 'behavior_probe_supported'
      : 'diagnostic_only_no_safe_sequence',
  };
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, '0108-sequence-probe.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.out, '0108-sequence-probe.md'), render(report), 'utf8');
  console.log(`Wrote ${join(args.out, '0108-sequence-probe.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

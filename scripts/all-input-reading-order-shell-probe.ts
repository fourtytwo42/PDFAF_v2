#!/usr/bin/env tsx
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildDefaultParams } from '../src/services/remediation/planner.js';
import {
  runSingleTool,
} from '../src/services/remediation/orchestrator.js';
import { pacRuleAcceptanceRegressions } from '../src/services/remediation/pacRuleAcceptanceGate.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  DocumentSnapshot,
  PlannedRemediationTool,
} from '../src/types.js';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';

const DEFAULT_PDF = 'Output/goal-all-input-mean-2026-05-09-r1/mcgruff-reading-inputs-2026-05-10-r1/0239-5ae8b49ab0aa-3530-illinois-criminal-justice-information-authority-biennial-report-1993-199.pdf';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/reading-order-shell-probe-2026-05-10-r1';

const SEED_TOOLS = [
  'bootstrap_struct_tree',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'artifact_repeating_page_furniture',
  'tag_native_text_blocks',
  'synthesize_basic_structure_from_layout',
] as const;

const CLEANUP_ORDERS = [
  ['repair_top_level_parent_links', 'remap_orphan_mcids_as_artifacts', 'set_pdfua_identification'],
  ['remap_orphan_mcids_as_artifacts', 'repair_top_level_parent_links', 'set_pdfua_identification'],
  ['remap_orphan_mcids_as_artifacts', 'set_pdfua_identification'],
  ['repair_top_level_parent_links', 'set_pdfua_identification'],
] as const;

type ProbeToolName = typeof SEED_TOOLS[number] | 'repair_degenerate_native_reading_order_shell' | typeof CLEANUP_ORDERS[number][number];

interface ProbeStep {
  toolName: string;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  headingBefore: number | null;
  headingAfter: number | null;
  readingBefore: number | null;
  readingAfter: number | null;
  pdfUaBefore: number | null;
  pdfUaAfter: number | null;
  orphanBefore: number | null;
  orphanAfter: number | null;
  pacRegressions: string[];
  durationMs: number;
  details?: string;
}

interface CleanupProbe {
  order: string[];
  accepted: boolean;
  rejectionReason: string | null;
  finalScore: number;
  finalGrade: string;
  finalHeading: number | null;
  finalReading: number | null;
  finalPdfUa: number | null;
  finalOrphans: number | null;
  pacRegressions: string[];
  steps: ProbeStep[];
}

interface ProbeReport {
  generatedAt: string;
  pdf: string;
  seedScore: number;
  seedGrade: string;
  shellScore: number | null;
  shellGrade: string | null;
  shellPacRegressions: string[];
  cleanupProbes: CleanupProbe[];
  recommendation: string;
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return row?.applicable === false ? null : row?.score ?? null;
}

function orphanCount(snapshot: DocumentSnapshot): number {
  return snapshot.detectionProfile?.pdfUaSignals?.orphanMcidCount ?? snapshot.orphanMcids?.length ?? 0;
}

function pageTextTagEvidencePreserved(before: DocumentSnapshot, after: DocumentSnapshot): boolean {
  if (before.pageCount !== after.pageCount) return false;
  if (after.textCharCount < Math.floor(before.textCharCount * 0.99)) return false;
  if (before.isTagged && !after.isTagged) return false;
  return true;
}

async function analyzeBuffer(buffer: Buffer, filename: string, label: string) {
  const tmp = join(tmpdir(), `pdfaf-reading-shell-probe-${label}-${randomUUID()}.pdf`);
  await writeFile(tmp, buffer);
  try {
    return await analyzePdf(tmp, filename, {
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
      bypassCache: true,
    });
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function plannedTool(toolName: string, analysis: AnalysisResult, snapshot: DocumentSnapshot, applied: AppliedRemediationTool[]): PlannedRemediationTool {
  return {
    toolName,
    params: buildDefaultParams(toolName, analysis, snapshot, applied),
    rationale: 'All-input reading-order shell proposal probe.',
  };
}

async function runAndAnalyze(input: {
  buffer: Buffer;
  filename: string;
  toolName: ProbeToolName;
  beforeAnalysis: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  applied: AppliedRemediationTool[];
  compareSnapshot: DocumentSnapshot;
}) {
  const result = await runSingleTool(
    input.buffer,
    plannedTool(input.toolName, input.beforeAnalysis, input.beforeSnapshot, input.applied),
    input.beforeSnapshot,
  );
  let nextBuffer = input.buffer;
  let nextAnalysis = input.beforeAnalysis;
  let nextSnapshot = input.beforeSnapshot;
  if (result.outcome === 'applied' && !result.buffer.equals(input.buffer)) {
    nextBuffer = result.buffer;
    const analyzed = await analyzeBuffer(nextBuffer, input.filename, input.toolName);
    nextAnalysis = analyzed.result;
    nextSnapshot = analyzed.snapshot;
  }
  const pacRegressions = pacRuleAcceptanceRegressions({
    beforeSnapshot: input.compareSnapshot,
    afterSnapshot: nextSnapshot,
    toolNames: [input.toolName],
  });
  const step: ProbeStep = {
    toolName: input.toolName,
    outcome: result.outcome,
    scoreBefore: input.beforeAnalysis.score,
    scoreAfter: nextAnalysis.score,
    headingBefore: categoryScore(input.beforeAnalysis, 'heading_structure'),
    headingAfter: categoryScore(nextAnalysis, 'heading_structure'),
    readingBefore: categoryScore(input.beforeAnalysis, 'reading_order'),
    readingAfter: categoryScore(nextAnalysis, 'reading_order'),
    pdfUaBefore: categoryScore(input.beforeAnalysis, 'pdf_ua_compliance'),
    pdfUaAfter: categoryScore(nextAnalysis, 'pdf_ua_compliance'),
    orphanBefore: orphanCount(input.beforeSnapshot),
    orphanAfter: orphanCount(nextSnapshot),
    pacRegressions: pacRegressions.map(row => row.ruleId),
    durationMs: result.durationMs,
    ...(result.details ? { details: result.details } : {}),
  };
  const row: AppliedRemediationTool = {
    toolName: input.toolName,
    stage: 0,
    round: 0,
    scoreBefore: input.beforeAnalysis.score,
    scoreAfter: nextAnalysis.score,
    delta: nextAnalysis.score - input.beforeAnalysis.score,
    outcome: result.outcome,
    details: result.details,
    durationMs: result.durationMs,
    source: 'planner',
  };
  return {
    buffer: nextBuffer,
    analysis: nextAnalysis,
    snapshot: nextSnapshot,
    step,
    appliedRow: row,
  };
}

function cleanupAccepted(input: {
  seedAnalysis: AnalysisResult;
  seedSnapshot: DocumentSnapshot;
  finalAnalysis: AnalysisResult;
  finalSnapshot: DocumentSnapshot;
  toolNames: string[];
}): { accepted: boolean; reason: string | null; pacRegressions: string[] } {
  const finalHeading = categoryScore(input.finalAnalysis, 'heading_structure');
  const seedHeading = categoryScore(input.seedAnalysis, 'heading_structure');
  const finalReading = categoryScore(input.finalAnalysis, 'reading_order');
  const seedReading = categoryScore(input.seedAnalysis, 'reading_order');
  const finalAlt = categoryScore(input.finalAnalysis, 'alt_text');
  const regressions = pacRuleAcceptanceRegressions({
    beforeSnapshot: input.seedSnapshot,
    afterSnapshot: input.finalSnapshot,
    toolNames: input.toolNames,
  });
  if (input.finalAnalysis.score < 93) return { accepted: false, reason: 'final_score_below_93', pacRegressions: regressions.map(row => row.ruleId) };
  if (input.finalAnalysis.score <= input.seedAnalysis.score) return { accepted: false, reason: 'final_score_not_improved', pacRegressions: regressions.map(row => row.ruleId) };
  if (seedHeading != null && finalHeading != null && finalHeading < seedHeading) return { accepted: false, reason: 'heading_regressed', pacRegressions: regressions.map(row => row.ruleId) };
  if (seedReading != null && finalReading != null && finalReading <= seedReading) return { accepted: false, reason: 'reading_not_improved', pacRegressions: regressions.map(row => row.ruleId) };
  if (finalAlt != null && finalAlt < 90) return { accepted: false, reason: 'alt_below_floor', pacRegressions: regressions.map(row => row.ruleId) };
  if (!pageTextTagEvidencePreserved(input.seedSnapshot, input.finalSnapshot)) return { accepted: false, reason: 'page_text_tag_regression', pacRegressions: regressions.map(row => row.ruleId) };
  if (regressions.length > 0) return { accepted: false, reason: 'final_pac_regression', pacRegressions: regressions.map(row => row.ruleId) };
  return { accepted: true, reason: null, pacRegressions: [] };
}

async function buildProbe(pdfPath: string): Promise<ProbeReport> {
  const filename = basename(pdfPath);
  let buffer = await readFile(pdfPath);
  let analyzed = await analyzeBuffer(buffer, filename, 'initial');
  const applied: AppliedRemediationTool[] = [];
  const seedSteps: ProbeStep[] = [];

  for (const toolName of SEED_TOOLS) {
    const next = await runAndAnalyze({
      buffer,
      filename,
      toolName,
      beforeAnalysis: analyzed.result,
      beforeSnapshot: analyzed.snapshot,
      applied,
      compareSnapshot: analyzed.snapshot,
    });
    seedSteps.push(next.step);
    applied.push(next.appliedRow);
    if (next.appliedRow.outcome === 'applied') {
      buffer = next.buffer;
      analyzed = { result: next.analysis, snapshot: next.snapshot };
    }
  }

  const seedBuffer = buffer;
  const seedAnalysis = analyzed.result;
  const seedSnapshot = analyzed.snapshot;
  const shell = await runAndAnalyze({
    buffer: seedBuffer,
    filename,
    toolName: 'repair_degenerate_native_reading_order_shell',
    beforeAnalysis: seedAnalysis,
    beforeSnapshot: seedSnapshot,
    applied,
    compareSnapshot: seedSnapshot,
  });

  const cleanupProbes: CleanupProbe[] = [];
  if (shell.appliedRow.outcome === 'applied') {
    for (const order of CLEANUP_ORDERS) {
      let cleanupBuffer = shell.buffer;
      let cleanupAnalysis = shell.analysis;
      let cleanupSnapshot = shell.snapshot;
      const cleanupApplied = [...applied, shell.appliedRow];
      const steps: ProbeStep[] = [shell.step];
      for (const toolName of order) {
        const next = await runAndAnalyze({
          buffer: cleanupBuffer,
          filename,
          toolName,
          beforeAnalysis: cleanupAnalysis,
          beforeSnapshot: cleanupSnapshot,
          applied: cleanupApplied,
          compareSnapshot: seedSnapshot,
        });
        steps.push(next.step);
        cleanupApplied.push(next.appliedRow);
        if (next.appliedRow.outcome === 'applied') {
          cleanupBuffer = next.buffer;
          cleanupAnalysis = next.analysis;
          cleanupSnapshot = next.snapshot;
        }
      }
      const decision = cleanupAccepted({
        seedAnalysis,
        seedSnapshot,
        finalAnalysis: cleanupAnalysis,
        finalSnapshot: cleanupSnapshot,
        toolNames: ['repair_degenerate_native_reading_order_shell', ...order],
      });
      cleanupProbes.push({
        order: [...order],
        accepted: decision.accepted,
        rejectionReason: decision.reason,
        finalScore: cleanupAnalysis.score,
        finalGrade: cleanupAnalysis.grade,
        finalHeading: categoryScore(cleanupAnalysis, 'heading_structure'),
        finalReading: categoryScore(cleanupAnalysis, 'reading_order'),
        finalPdfUa: categoryScore(cleanupAnalysis, 'pdf_ua_compliance'),
        finalOrphans: orphanCount(cleanupSnapshot),
        pacRegressions: decision.pacRegressions,
        steps,
      });
    }
  }

  const accepted = cleanupProbes.find(row => row.accepted);
  return {
    generatedAt: new Date().toISOString(),
    pdf: pdfPath,
    seedScore: seedAnalysis.score,
    seedGrade: seedAnalysis.grade,
    shellScore: shell.analysis.score,
    shellGrade: shell.analysis.grade,
    shellPacRegressions: shell.step.pacRegressions,
    cleanupProbes,
    recommendation: accepted
      ? `Promote only after targeted validation: accepted cleanup order ${accepted.order.join(' -> ')}.`
      : 'No final PAC-clean reading-order shell sequence was proven by this probe.',
  };
}

function renderMarkdown(report: ProbeReport): string {
  const lines: string[] = [];
  lines.push('# All-Input Reading-Order Shell Proposal Probe');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- PDF: \`${report.pdf}\``);
  lines.push(`- Seed score: ${report.seedScore}/${report.seedGrade}`);
  lines.push(`- Shell proposal score: ${report.shellScore ?? 'n/a'}/${report.shellGrade ?? 'n/a'}`);
  lines.push(`- Shell PAC regressions: ${report.shellPacRegressions.map(rule => `\`${rule}\``).join(', ') || 'none'}`);
  lines.push(`- Recommendation: ${report.recommendation}`);
  lines.push('');
  lines.push('| Cleanup order | Accepted | Final | Heading | Reading | PDF/UA | Orphans | Rejection | PAC regressions |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.cleanupProbes) {
    lines.push(`| ${row.order.map(tool => `\`${tool}\``).join(' -> ')} | ${row.accepted ? 'yes' : 'no'} | ${row.finalScore}/${row.finalGrade} | ${row.finalHeading ?? 'n/a'} | ${row.finalReading ?? 'n/a'} | ${row.finalPdfUa ?? 'n/a'} | ${row.finalOrphans ?? 'n/a'} | ${row.rejectionReason ?? 'none'} | ${row.pacRegressions.map(rule => `\`${rule}\``).join(', ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Step Details');
  lines.push('');
  for (const row of report.cleanupProbes) {
    lines.push(`### ${row.order.join(' -> ')}`);
    lines.push('');
    lines.push('| Tool | Outcome | Score | Heading | Reading | PDF/UA | Orphans | PAC regressions |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const step of row.steps) {
      lines.push(`| \`${step.toolName}\` | ${step.outcome} | ${step.scoreBefore} -> ${step.scoreAfter} | ${step.headingBefore ?? 'n/a'} -> ${step.headingAfter ?? 'n/a'} | ${step.readingBefore ?? 'n/a'} -> ${step.readingAfter ?? 'n/a'} | ${step.pdfUaBefore ?? 'n/a'} -> ${step.pdfUaAfter ?? 'n/a'} | ${step.orphanBefore ?? 'n/a'} -> ${step.orphanAfter ?? 'n/a'} | ${step.pacRegressions.map(rule => `\`${rule}\``).join(', ') || 'none'} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const pdfPath = argValue('--pdf') ?? DEFAULT_PDF;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const report = await buildProbe(pdfPath);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'reading-order-shell-probe.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'reading-order-shell-probe.md'), renderMarkdown(report));
  console.log(`Wrote ${join(outDir, 'reading-order-shell-probe.md')}`);
  console.log(JSON.stringify({
    pdf: report.pdf,
    seedScore: report.seedScore,
    shellScore: report.shellScore,
    acceptedOrders: report.cleanupProbes.filter(row => row.accepted).map(row => row.order),
    recommendation: report.recommendation,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

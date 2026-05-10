#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_TRACE = 'Output/goal-all-input-mean-2026-05-09-r1/run-mcgruff-reading-2026-05-10-r1/baseline_report.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/reading-order-shell-diagnostic-2026-05-10-r1';

const READING_TOOL = 'repair_degenerate_native_reading_order_shell';
const ORPHAN_RULE = 'pdfua.content.orphan_mcids_absent';
const CLEANUP_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'repair_top_level_parent_links',
  'repair_alt_text_structure',
  'set_pdfua_identification',
]);

type ToolOutcome = 'applied' | 'rejected' | 'no_effect' | 'failed' | string;

interface ToolRow {
  toolName: string;
  outcome?: ToolOutcome;
  status?: ToolOutcome;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
}

interface RunRow {
  id?: string | null;
  file?: string;
  title?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  appliedTools?: ToolRow[];
}

export type ReadingOrderShellProposalClass =
  | 'applied_safe_repair'
  | 'applied_with_final_orphan_debt'
  | 'pac_orphan_blocked_reading_candidate'
  | 'unsafe_mixed_pac_regression'
  | 'not_score_moving'
  | 'missing_replay_state';

export type ReadingOrderShellRowClass =
  | 'safe_route_control_observed'
  | 'sequence_candidate_needs_proposal_cleanup'
  | 'final_orphan_debt_after_recovery'
  | 'unsafe_or_no_score_movement'
  | 'missing_tool_timeline';

interface ReplayState {
  stateSignatureBefore?: string;
  stateSignatureAfter?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  categoryScoresBefore?: Record<string, number>;
  categoryScoresAfter?: Record<string, number>;
  detectionSignalsBefore?: Record<string, unknown>;
  detectionSignalsAfter?: Record<string, unknown>;
}

export interface ReadingOrderShellProposal {
  toolName: string;
  outcome: string;
  classification: ReadingOrderShellProposalClass;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  headingBefore: number | null;
  headingAfter: number | null;
  readingBefore: number | null;
  readingAfter: number | null;
  pdfUaBefore: number | null;
  pdfUaAfter: number | null;
  orphanBefore: number | null;
  orphanAfter: number | null;
  pacRuleIds: string[];
  recommendation: string;
}

export interface ReadingOrderShellDiagnosticRow {
  file: string;
  score: number | null;
  grade: string | null;
  classification: ReadingOrderShellRowClass;
  bestProposal: ReadingOrderShellProposal | null;
  proposals: ReadingOrderShellProposal[];
  cleanupTools: string[];
  finalObservedOrphanCount: number | null;
  recommendation: string;
}

export interface ReadingOrderShellDiagnostic {
  generatedAt: string;
  traceSource: string;
  summary: {
    rowCount: number;
    safeRouteControlCount: number;
    sequenceCandidateCount: number;
    finalOrphanDebtCount: number;
    selectedRows: string[];
  };
  rows: ReadingOrderShellDiagnosticRow[];
}

function parseArgs(argv: string[]): { trace: string; out: string } {
  let trace = DEFAULT_TRACE;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--trace' && next) {
      trace = next;
      i += 1;
    } else if (arg === '--out' && next) {
      out = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts [--trace <baseline_report.json>] [--out <dir>]',
        '',
        `Defaults: --trace ${DEFAULT_TRACE} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { trace, out };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDetails(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return asRecord(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function replayState(details: Record<string, unknown> | null): ReplayState | null {
  return asRecord(asRecord(details?.debug)?.replayState) as ReplayState | null;
}

function category(state: ReplayState | null, direction: 'before' | 'after', key: string): number | null {
  const scores = direction === 'before' ? state?.categoryScoresBefore : state?.categoryScoresAfter;
  return numberOrNull(scores?.[key]);
}

function signal(state: ReplayState | null, direction: 'before' | 'after', key: string): number | null {
  const signals = direction === 'before' ? state?.detectionSignalsBefore : state?.detectionSignalsAfter;
  return numberOrNull(signals?.[key]);
}

function pacRuleIds(details: Record<string, unknown> | null): string[] {
  const ids = new Set<string>();
  const note = stringOrNull(details?.note) ?? stringOrNull(details?.raw);
  const match = note?.match(/pac_rule_regressed\(([^)]+)\)/);
  if (match?.[1]) ids.add(match[1]);
  const single = stringOrNull(asRecord(details?.pacRuleRegression)?.ruleId);
  if (single) ids.add(single);
  const many = Array.isArray(details?.pacRuleRegressions) ? details.pacRuleRegressions : [];
  for (const item of many) {
    const id = stringOrNull(asRecord(item)?.ruleId);
    if (id) ids.add(id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function finalObservedOrphanCount(tools: ToolRow[]): number | null {
  let count: number | null = null;
  for (const tool of tools) {
    const outcome = String(tool.outcome ?? tool.status ?? '');
    if (outcome !== 'applied' && outcome !== 'no_effect') continue;
    const state = replayState(parseDetails(tool.details));
    const after = signal(state, 'after', 'orphanMcidCount');
    if (after != null) count = after;
  }
  return count;
}

function proposalFromTool(tool: ToolRow): ReadingOrderShellProposal | null {
  if (tool.toolName !== READING_TOOL) return null;
  const details = parseDetails(tool.details);
  const state = replayState(details);
  const rules = pacRuleIds(details);
  const scoreBefore = numberOrNull(state?.scoreBefore) ?? numberOrNull(tool.scoreBefore);
  const scoreAfter = numberOrNull(state?.scoreAfter) ?? numberOrNull(tool.scoreAfter);
  const headingBefore = category(state, 'before', 'heading_structure');
  const headingAfter = category(state, 'after', 'heading_structure');
  const readingBefore = category(state, 'before', 'reading_order');
  const readingAfter = category(state, 'after', 'reading_order');
  const pdfUaBefore = category(state, 'before', 'pdf_ua_compliance');
  const pdfUaAfter = category(state, 'after', 'pdf_ua_compliance');
  const orphanBefore = signal(state, 'before', 'orphanMcidCount');
  const orphanAfter = signal(state, 'after', 'orphanMcidCount');
  const outcome = String(tool.outcome ?? tool.status ?? '');
  const scoreMoving = scoreBefore != null && scoreAfter != null && scoreAfter > scoreBefore;
  const readingImproved = readingBefore != null && readingAfter != null && readingAfter > readingBefore;
  const headingPreserved = headingBefore != null && headingAfter != null && headingAfter >= headingBefore;
  const orphanOnly = rules.length > 0 && rules.every(rule => rule === ORPHAN_RULE);
  let classification: ReadingOrderShellProposalClass;
  let recommendation: string;
  if (!state?.stateSignatureBefore || !state.stateSignatureAfter) {
    classification = 'missing_replay_state';
    recommendation = 'Regenerate with replay-state instrumentation before behavior changes.';
  } else if (!scoreMoving || !readingImproved || !headingPreserved) {
    classification = 'not_score_moving';
    recommendation = 'Do not recover; the replay state does not prove score plus reading movement with heading preserved.';
  } else if (outcome === 'applied') {
    if ((orphanAfter ?? 0) === 0 && (pdfUaAfter ?? 0) >= (pdfUaBefore ?? 0)) {
      classification = 'applied_safe_repair';
      recommendation = 'Safe direct route observed; use as control evidence for sequence design.';
    } else {
      classification = 'applied_with_final_orphan_debt';
      recommendation = 'Score route recovered but final PAC orphan debt remains visible; do not treat as PAC-clean completion.';
    }
  } else if (outcome === 'rejected' && orphanOnly) {
    classification = 'pac_orphan_blocked_reading_candidate';
    recommendation = 'Candidate for proposal-buffer plus bounded orphan/parent cleanup; final state must clear harmful PAC debt.';
  } else {
    classification = 'unsafe_mixed_pac_regression';
    recommendation = 'Do not recover; PAC blockers are mixed or missing.';
  }
  return {
    toolName: tool.toolName,
    outcome,
    classification,
    stateSignatureBefore: state?.stateSignatureBefore ?? null,
    stateSignatureAfter: state?.stateSignatureAfter ?? null,
    scoreBefore,
    scoreAfter,
    headingBefore,
    headingAfter,
    readingBefore,
    readingAfter,
    pdfUaBefore,
    pdfUaAfter,
    orphanBefore,
    orphanAfter,
    pacRuleIds: rules,
    recommendation,
  };
}

function rowDecision(proposals: ReadingOrderShellProposal[], finalOrphanCount: number | null): {
  classification: ReadingOrderShellRowClass;
  recommendation: string;
} {
  if (proposals.length === 0) {
    return {
      classification: 'missing_tool_timeline',
      recommendation: 'No degenerate native reading-order shell attempts are visible.',
    };
  }
  if (proposals.some(row => row.classification === 'applied_with_final_orphan_debt')) {
    return {
      classification: 'final_orphan_debt_after_recovery',
      recommendation: 'Recovered score route still carries PAC orphan debt; use as caution/control, not broad acceptance proof.',
    };
  }
  if ((finalOrphanCount ?? 0) > 0 && proposals.some(row => row.classification === 'applied_safe_repair')) {
    return {
      classification: 'final_orphan_debt_after_recovery',
      recommendation: 'Initial reading-order repair was safe, but later accepted work reintroduced PAC orphan debt.',
    };
  }
  if (proposals.some(row => row.classification === 'applied_safe_repair')) {
    return {
      classification: 'safe_route_control_observed',
      recommendation: 'Safe route observed; compare blocked rows against this state shape.',
    };
  }
  if (proposals.some(row => row.classification === 'pac_orphan_blocked_reading_candidate')) {
    return {
      classification: 'sequence_candidate_needs_proposal_cleanup',
      recommendation: 'Run a bounded proposal-buffer cleanup probe; accept only a final PAC-safe state.',
    };
  }
  return {
    classification: 'unsafe_or_no_score_movement',
    recommendation: 'No safe score-moving reading-order shell recovery is proven.',
  };
}

function fileLabel(row: RunRow): string {
  return row.file ?? row.id ?? row.title ?? 'unknown';
}

export function buildReadingOrderShellDiagnostic(input: {
  rows: RunRow[];
  traceSource?: string;
  generatedAt?: string;
}): ReadingOrderShellDiagnostic {
  const rows = input.rows.map(row => {
    const tools = row.appliedTools ?? [];
    const proposals = tools
      .map(proposalFromTool)
      .filter((item): item is ReadingOrderShellProposal => Boolean(item))
      .sort((a, b) =>
        Number(b.classification === 'pac_orphan_blocked_reading_candidate') - Number(a.classification === 'pac_orphan_blocked_reading_candidate') ||
        (b.scoreAfter ?? -1) - (a.scoreAfter ?? -1) ||
        (b.readingAfter ?? -1) - (a.readingAfter ?? -1) ||
        a.outcome.localeCompare(b.outcome)
      );
    const finalOrphanCount = finalObservedOrphanCount(tools);
    const decision = rowDecision(proposals, finalOrphanCount);
    return {
      file: fileLabel(row),
      score: row.afterScore ?? row.reanalyzedScore ?? null,
      grade: row.afterGrade ?? row.reanalyzedGrade ?? null,
      classification: decision.classification,
      bestProposal: proposals[0] ?? null,
      proposals,
      cleanupTools: [...new Set(tools.filter(tool => CLEANUP_TOOLS.has(tool.toolName)).map(tool => tool.toolName))].sort((a, b) => a.localeCompare(b)),
      finalObservedOrphanCount: finalOrphanCount,
      recommendation: decision.recommendation,
    };
  }).sort((a, b) =>
    Number(b.classification === 'sequence_candidate_needs_proposal_cleanup') - Number(a.classification === 'sequence_candidate_needs_proposal_cleanup') ||
    Number(b.classification === 'final_orphan_debt_after_recovery') - Number(a.classification === 'final_orphan_debt_after_recovery') ||
    a.file.localeCompare(b.file)
  );
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    traceSource: input.traceSource ?? '',
    summary: {
      rowCount: rows.length,
      safeRouteControlCount: rows.filter(row => row.classification === 'safe_route_control_observed').length,
      sequenceCandidateCount: rows.filter(row => row.classification === 'sequence_candidate_needs_proposal_cleanup').length,
      finalOrphanDebtCount: rows.filter(row => row.classification === 'final_orphan_debt_after_recovery').length,
      selectedRows: rows
        .filter(row => row.classification === 'sequence_candidate_needs_proposal_cleanup')
        .map(row => row.file),
    },
    rows,
  };
}

function normalizedRows(parsed: unknown): RunRow[] {
  if (Array.isArray(parsed)) return parsed as RunRow[];
  const record = asRecord(parsed);
  if (!record) return [];
  if (Array.isArray(record.rows)) return record.rows as RunRow[];
  if (Array.isArray(record.results)) return record.results as RunRow[];
  return [];
}

function renderMarkdown(report: ReadingOrderShellDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Reading-Order Shell Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Trace source: \`${report.traceSource}\``);
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Sequence candidates needing proposal cleanup: ${report.summary.sequenceCandidateCount}`);
  lines.push(`- Safe route controls: ${report.summary.safeRouteControlCount}`);
  lines.push(`- Recovered routes with final orphan debt: ${report.summary.finalOrphanDebtCount}`);
  lines.push('');
  lines.push('| File | Score | Class | Best proposal | State | Orphans | Cleanup tools | Recommendation |');
  lines.push('| --- | ---: | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const best = row.bestProposal;
    const bestText = best
      ? `${best.outcome} ${best.scoreBefore ?? 'n/a'}->${best.scoreAfter ?? 'n/a'} reading ${best.readingBefore ?? 'n/a'}->${best.readingAfter ?? 'n/a'}`
      : 'none';
    const orphanText = best ? `${best.orphanBefore ?? 'n/a'}->${best.orphanAfter ?? 'n/a'}; final ${row.finalObservedOrphanCount ?? 'n/a'}` : `final ${row.finalObservedOrphanCount ?? 'n/a'}`;
    lines.push(`| \`${row.file}\` | ${row.score ?? 'n/a'}/${row.grade ?? 'n/a'} | ${row.classification} | ${bestText} | \`${best?.stateSignatureBefore ?? 'n/a'} -> ${best?.stateSignatureAfter ?? 'n/a'}\` | ${orphanText} | ${row.cleanupTools.map(tool => `\`${tool}\``).join(', ') || 'none'} | ${row.recommendation} |`);
  }
  lines.push('');
  lines.push('## Proposal Details');
  lines.push('');
  for (const row of report.rows) {
    lines.push(`### ${row.file}`);
    lines.push('');
    if (row.proposals.length === 0) {
      lines.push('No degenerate native reading-order shell attempts were present.');
      lines.push('');
      continue;
    }
    lines.push('| Outcome | Class | Score | Heading | Reading | PDF/UA | Orphans | PAC rules | State |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const proposal of row.proposals) {
      lines.push(`| ${proposal.outcome} | ${proposal.classification} | ${proposal.scoreBefore ?? 'n/a'} -> ${proposal.scoreAfter ?? 'n/a'} | ${proposal.headingBefore ?? 'n/a'} -> ${proposal.headingAfter ?? 'n/a'} | ${proposal.readingBefore ?? 'n/a'} -> ${proposal.readingAfter ?? 'n/a'} | ${proposal.pdfUaBefore ?? 'n/a'} -> ${proposal.pdfUaAfter ?? 'n/a'} | ${proposal.orphanBefore ?? 'n/a'} -> ${proposal.orphanAfter ?? 'n/a'} | ${proposal.pacRuleIds.map(rule => `\`${rule}\``).join(', ') || 'none'} | \`${proposal.stateSignatureBefore ?? 'n/a'} -> ${proposal.stateSignatureAfter ?? 'n/a'}\` |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const parsed = JSON.parse(await readFile(args.trace, 'utf8')) as unknown;
  const report = buildReadingOrderShellDiagnostic({
    rows: normalizedRows(parsed),
    traceSource: args.trace,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'reading-order-shell-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'reading-order-shell-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'reading-order-shell-diagnostic.md')}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

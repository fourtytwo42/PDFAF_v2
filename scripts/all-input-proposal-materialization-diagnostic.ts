#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CategoryKey } from '../src/types.js';

const DEFAULT_TRACE = 'Output/goal-all-input-mean-2026-05-09-r1/run-0306-tagged-heading-target-2026-05-10-r2/baseline_report.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/proposal-materialization-diagnostic-0306-2026-05-10-r1';

const STRUCTURE_TOOLS = new Set([
  'bridge_native_title_text_owner',
  'create_heading_from_candidate',
  'create_heading_from_tagged_visible_anchor',
  'normalize_heading_hierarchy',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'tag_native_text_blocks',
]);

const CLEANUP_TOOLS = new Set([
  'normalize_annotation_tab_order',
  'remap_orphan_mcids_as_artifacts',
  'repair_native_link_structure',
  'set_link_annotation_contents',
  'set_pdfua_identification',
  'tag_unowned_annotations',
]);

const ALLOWED_INTERMEDIATE_PAC_RULES = new Set([
  'pdfua.annotations.tagged_annotations_present',
  'pdfua.content.orphan_mcids_absent',
]);

type ProposalMaterializationClassification =
  | 'cleanup_from_proposal_observed'
  | 'requires_intermediate_buffer'
  | 'unsafe_intermediate'
  | 'not_score_moving'
  | 'missing_replay_state';

type RowMaterializationClassification =
  | 'materialization_candidate'
  | 'requires_rejected_proposal_buffer'
  | 'unsafe_intermediate'
  | 'no_score_moving_proposal'
  | 'missing_tool_timeline';

interface TraceToolRow {
  toolName: string;
  outcome: string;
  scoreBefore?: number;
  scoreAfter?: number;
  details?: unknown;
}

interface TraceRunRow {
  file: string;
  afterScore?: number;
  afterGrade?: string;
  appliedTools?: TraceToolRow[];
}

export interface MaterializationProposal {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  headingBefore: number | null;
  headingAfter: number | null;
  readingBefore: number | null;
  readingAfter: number | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  pacRuleIds: string[];
  cleanupFromProposalCount: number;
  cleanupFromProposalTools: string[];
  hasTargetEvidence: boolean;
  classification: ProposalMaterializationClassification;
  recommendation: string;
}

export interface MaterializationDiagnosticRow {
  file: string;
  score: number | null;
  grade: string | null;
  classification: RowMaterializationClassification;
  bestProposal: MaterializationProposal | null;
  proposals: MaterializationProposal[];
  cleanupAttemptCount: number;
  recommendation: string;
}

export interface ProposalMaterializationDiagnostic {
  generatedAt: string;
  traceSource: string;
  summary: {
    rowCount: number;
    materializationCandidateCount: number;
    requiresRejectedProposalBufferCount: number;
    unsafeIntermediateCount: number;
    selectedRows: string[];
  };
  rows: MaterializationDiagnosticRow[];
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
        'Usage: pnpm exec tsx scripts/all-input-proposal-materialization-diagnostic.ts [--trace <baseline_report.json|trace.results.json>] [--out <dir>]',
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

function categoryScores(value: unknown): Partial<Record<CategoryKey, number>> {
  const record = asRecord(value);
  const out: Partial<Record<CategoryKey, number>> = {};
  if (!record) return out;
  for (const [key, score] of Object.entries(record)) {
    if (typeof score === 'number') out[key as CategoryKey] = score;
  }
  return out;
}

function replay(details: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(asRecord(details?.debug)?.replayState);
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

function hasTargetEvidence(details: Record<string, unknown> | null, state: Record<string, unknown> | null): boolean {
  const invariants = asRecord(details?.invariants);
  return Boolean(
    stringOrNull(invariants?.targetRef) ||
    stringOrNull(invariants?.targetResolved) ||
    stringOrNull(state?.targetRef) ||
    stringOrNull(state?.targetRole)
  );
}

function cleanupAttemptsFromState(tools: TraceToolRow[], stateSignature: string | null): TraceToolRow[] {
  if (!stateSignature) return [];
  return tools.filter(tool => {
    if (!CLEANUP_TOOLS.has(tool.toolName)) return false;
    const details = parseDetails(tool.details);
    const state = replay(details);
    return stringOrNull(state?.stateSignatureBefore) === stateSignature;
  });
}

function proposalFromTool(tool: TraceToolRow, tools: TraceToolRow[]): MaterializationProposal | null {
  if (!STRUCTURE_TOOLS.has(tool.toolName) || tool.outcome !== 'rejected') return null;
  const details = parseDetails(tool.details);
  const state = replay(details);
  const before = categoryScores(state?.categoryScoresBefore);
  const after = categoryScores(state?.categoryScoresAfter);
  const scoreBefore = numberOrNull(state?.scoreBefore) ?? numberOrNull(tool.scoreBefore);
  const scoreAfter = numberOrNull(state?.scoreAfter) ?? numberOrNull(tool.scoreAfter);
  const headingBefore = before.heading_structure ?? null;
  const headingAfter = after.heading_structure ?? null;
  const readingBefore = before.reading_order ?? null;
  const readingAfter = after.reading_order ?? null;
  const stateSignatureBefore = stringOrNull(state?.stateSignatureBefore);
  const stateSignatureAfter = stringOrNull(state?.stateSignatureAfter);
  const rules = pacRuleIds(details);
  const cleanupFromProposal = cleanupAttemptsFromState(tools, stateSignatureAfter);
  const scoreMoving = scoreAfter != null && scoreBefore != null && scoreAfter > scoreBefore &&
    headingAfter != null && headingBefore != null && headingAfter > headingBefore;
  const allowedIntermediate = rules.length > 0 && rules.every(rule => ALLOWED_INTERMEDIATE_PAC_RULES.has(rule));
  let classification: ProposalMaterializationClassification;
  let recommendation: string;
  if (!stateSignatureBefore || !stateSignatureAfter) {
    classification = 'missing_replay_state';
    recommendation = 'Regenerate with replay-state instrumentation before considering proposal replay.';
  } else if (!scoreMoving) {
    classification = 'not_score_moving';
    recommendation = 'Do not materialize this proposal; replay evidence does not show score plus heading movement.';
  } else if (!allowedIntermediate) {
    classification = 'unsafe_intermediate';
    recommendation = 'Do not materialize this proposal; intermediate PAC regressions include non-annotation/non-orphan blockers.';
  } else if (cleanupFromProposal.length > 0) {
    classification = 'cleanup_from_proposal_observed';
    recommendation = 'Cleanup already ran from the proposed state; inspect final PAC-safe acceptance rather than adding materialization.';
  } else {
    classification = 'requires_intermediate_buffer';
    recommendation = hasTargetEvidence(details, state)
      ? 'Proposal is score-moving and PAC-bounded, but cleanup never ran from its proposed buffer.'
      : 'Proposal is score-moving and PAC-bounded, but artifacts lack target evidence and cleanup never ran from its proposed buffer.';
  }
  return {
    toolName: tool.toolName,
    outcome: tool.outcome,
    scoreBefore,
    scoreAfter,
    headingBefore,
    headingAfter,
    readingBefore,
    readingAfter,
    stateSignatureBefore,
    stateSignatureAfter,
    pacRuleIds: rules,
    cleanupFromProposalCount: cleanupFromProposal.length,
    cleanupFromProposalTools: [...new Set(cleanupFromProposal.map(row => row.toolName))].sort((a, b) => a.localeCompare(b)),
    hasTargetEvidence: hasTargetEvidence(details, state),
    classification,
    recommendation,
  };
}

function rowClassification(proposals: MaterializationProposal[], cleanupAttemptCount: number): {
  classification: RowMaterializationClassification;
  recommendation: string;
} {
  if (proposals.length === 0) {
    return {
      classification: 'missing_tool_timeline',
      recommendation: 'No rejected structural proposals are visible in this artifact.',
    };
  }
  if (proposals.some(item => item.classification === 'cleanup_from_proposal_observed')) {
    return {
      classification: 'materialization_candidate',
      recommendation: 'At least one rejected proposal already has cleanup from its proposed state; validate final PAC-safe sequence behavior.',
    };
  }
  if (proposals.some(item => item.classification === 'requires_intermediate_buffer')) {
    return {
      classification: 'requires_rejected_proposal_buffer',
      recommendation: cleanupAttemptCount > 0
        ? 'Cleanup ran only from the pre-proposal route; a future behavior stage must materialize the rejected proposal buffer first.'
        : 'No cleanup ran; a future behavior stage must materialize the rejected proposal buffer and then run bounded cleanup.',
    };
  }
  if (proposals.some(item => item.classification === 'unsafe_intermediate')) {
    return {
      classification: 'unsafe_intermediate',
      recommendation: 'Do not replay; score-moving proposals are blocked by PAC regressions outside the allowed sequence envelope.',
    };
  }
  return {
    classification: 'no_score_moving_proposal',
    recommendation: 'No rejected structural proposal shows score plus heading movement.',
  };
}

export function buildProposalMaterializationDiagnostic(input: {
  rows: TraceRunRow[];
  traceSource?: string;
  generatedAt?: string;
}): ProposalMaterializationDiagnostic {
  const rows = input.rows.map(row => {
    const tools = row.appliedTools ?? [];
    const proposals = tools
      .map(tool => proposalFromTool(tool, tools))
      .filter((item): item is MaterializationProposal => Boolean(item))
      .sort((a, b) =>
        Number(b.classification === 'requires_intermediate_buffer') - Number(a.classification === 'requires_intermediate_buffer') ||
        (b.scoreAfter ?? -1) - (a.scoreAfter ?? -1) ||
        a.toolName.localeCompare(b.toolName)
      );
    const cleanupAttemptCount = tools.filter(tool => CLEANUP_TOOLS.has(tool.toolName)).length;
    const decision = rowClassification(proposals, cleanupAttemptCount);
    return {
      file: row.file,
      score: row.afterScore ?? null,
      grade: row.afterGrade ?? null,
      classification: decision.classification,
      bestProposal: proposals[0] ?? null,
      proposals,
      cleanupAttemptCount,
      recommendation: decision.recommendation,
    };
  }).sort((a, b) =>
    Number(b.classification === 'requires_rejected_proposal_buffer') - Number(a.classification === 'requires_rejected_proposal_buffer') ||
    Number(b.classification === 'materialization_candidate') - Number(a.classification === 'materialization_candidate') ||
    a.file.localeCompare(b.file)
  );
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    traceSource: input.traceSource ?? '',
    summary: {
      rowCount: rows.length,
      materializationCandidateCount: rows.filter(row => row.classification === 'materialization_candidate').length,
      requiresRejectedProposalBufferCount: rows.filter(row => row.classification === 'requires_rejected_proposal_buffer').length,
      unsafeIntermediateCount: rows.filter(row => row.classification === 'unsafe_intermediate').length,
      selectedRows: rows
        .filter(row => row.classification === 'requires_rejected_proposal_buffer' || row.classification === 'materialization_candidate')
        .map(row => row.file),
    },
    rows,
  };
}

function normalizedRows(parsed: unknown): TraceRunRow[] {
  if (Array.isArray(parsed)) return parsed as TraceRunRow[];
  const record = asRecord(parsed);
  if (!record) return [];
  if (Array.isArray(record.rows)) return record.rows as TraceRunRow[];
  if (Array.isArray(record.results)) return record.results as TraceRunRow[];
  return [];
}

function renderMarkdown(report: ProposalMaterializationDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Proposal Materialization Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Trace source: \`${report.traceSource}\``);
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Materialization candidates with observed cleanup: ${report.summary.materializationCandidateCount}`);
  lines.push(`- Rows requiring rejected proposal buffer: ${report.summary.requiresRejectedProposalBufferCount}`);
  lines.push(`- Unsafe intermediate rows: ${report.summary.unsafeIntermediateCount}`);
  lines.push('');
  lines.push('| File | Score | Class | Cleanup attempts | Best proposal | Proposal state | Target evidence | Recommendation |');
  lines.push('| --- | ---: | --- | ---: | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const best = row.bestProposal;
    const bestText = best
      ? `${best.toolName} ${best.scoreBefore ?? 'n/a'}->${best.scoreAfter ?? 'n/a'} heading ${best.headingBefore ?? 'n/a'}->${best.headingAfter ?? 'n/a'} reading ${best.readingBefore ?? 'n/a'}->${best.readingAfter ?? 'n/a'}`
      : 'none';
    lines.push(`| \`${row.file}\` | ${row.score ?? 'n/a'} | ${row.classification} | ${row.cleanupAttemptCount} | ${bestText} | \`${best?.stateSignatureBefore ?? 'n/a'} -> ${best?.stateSignatureAfter ?? 'n/a'}\` | ${best?.hasTargetEvidence ? 'yes' : 'no'} | ${row.recommendation} |`);
  }
  lines.push('');
  lines.push('## Proposal Details');
  lines.push('');
  for (const row of report.rows) {
    lines.push(`### ${row.file}`);
    lines.push('');
    if (row.proposals.length === 0) {
      lines.push('No rejected structural proposals were present.');
      lines.push('');
      continue;
    }
    lines.push('| Tool | Class | Score | Heading | Reading | PAC rules | Proposed state | Cleanup from proposed state | Target evidence |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const proposal of row.proposals) {
      lines.push(`| \`${proposal.toolName}\` | ${proposal.classification} | ${proposal.scoreBefore ?? 'n/a'} -> ${proposal.scoreAfter ?? 'n/a'} | ${proposal.headingBefore ?? 'n/a'} -> ${proposal.headingAfter ?? 'n/a'} | ${proposal.readingBefore ?? 'n/a'} -> ${proposal.readingAfter ?? 'n/a'} | ${proposal.pacRuleIds.map(id => `\`${id}\``).join(', ') || 'none'} | \`${proposal.stateSignatureBefore ?? 'n/a'} -> ${proposal.stateSignatureAfter ?? 'n/a'}\` | ${proposal.cleanupFromProposalTools.map(name => `\`${name}\``).join(', ') || 'none'} | ${proposal.hasTargetEvidence ? 'yes' : 'no'} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const parsed = JSON.parse(await readFile(args.trace, 'utf8')) as unknown;
  const report = buildProposalMaterializationDiagnostic({
    rows: normalizedRows(parsed),
    traceSource: args.trace,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'proposal-materialization-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'proposal-materialization-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'proposal-materialization-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

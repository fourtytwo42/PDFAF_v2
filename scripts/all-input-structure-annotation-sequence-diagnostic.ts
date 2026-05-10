#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CategoryKey } from '../src/types.js';

const DEFAULT_TRACE = 'Output/goal-all-input-mean-2026-05-09-r1/focused-heading-reading-traces-r1/trace.results.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/structure-annotation-sequence-diagnostic-r1';

const STRUCTURE_TOOLS = new Set([
  'create_heading_from_candidate',
  'create_heading_from_tagged_visible_anchor',
  'normalize_heading_hierarchy',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'tag_native_text_blocks',
]);

const CLEANUP_TOOLS = new Set([
  'repair_native_link_structure',
  'set_link_annotation_contents',
  'tag_unowned_annotations',
  'normalize_annotation_tab_order',
]);

export type SequenceDiagnosticClassification =
  | 'sequence_probe_candidate'
  | 'proposal_buffer_route_gap'
  | 'existing_recovery_observed'
  | 'runtime_route_heavy'
  | 'annotation_blocked_no_score_movement'
  | 'mixed_non_annotation_pac_blockers'
  | 'cleanup_unproven_or_regressive'
  | 'no_annotation_blocked_structure'
  | 'missing_tool_timeline';

export interface TraceToolRow {
  toolName: string;
  outcome: string;
  scoreBefore?: number;
  scoreAfter?: number;
  details?: string;
}

export interface TraceRunRow {
  file: string;
  beforeScore?: number;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: CategoryKey | string; score: number; applicable?: boolean }>;
  categoryGap?: {
    after?: Array<{ key: CategoryKey | string; score: number; applicable?: boolean }>;
  };
  durationMs?: number;
  appliedTools?: TraceToolRow[];
}

export interface SequenceProposal {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  headingBefore: number | null;
  headingAfter: number | null;
  readingBefore: number | null;
  readingAfter: number | null;
  stateSignatureBefore: string | null;
  pacRuleIds: string[];
}

export interface SequenceDiagnosticRow {
  file: string;
  score: number | null;
  grade: string | null;
  categories: Partial<Record<CategoryKey, number>>;
  classification: SequenceDiagnosticClassification;
  recommendation: string;
  annotationBlockedProposalCount: number;
  scoreMovingProposalCount: number;
  cleanupAttemptCount: number;
  cleanupRegressiveCount: number;
  bestProposal: SequenceProposal | null;
  proposals: SequenceProposal[];
}

export interface StructureAnnotationSequenceDiagnostic {
  generatedAt: string;
  traceSource: string;
  summary: {
    rowCount: number;
    sequenceProbeCandidateCount: number;
    annotationBlockedNoScoreMovementCount: number;
    selectedRows: string[];
  };
  rows: SequenceDiagnosticRow[];
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
        'Usage: pnpm exec tsx scripts/all-input-structure-annotation-sequence-diagnostic.ts [--trace <trace.results.json>] [--out <dir>]',
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

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return asRecord(parsed);
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

function rowCategoryScores(row: TraceRunRow): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const category of row.afterCategories ?? row.categoryGap?.after ?? []) {
    if (typeof category.score === 'number') out[category.key as CategoryKey] = category.score;
  }
  return out;
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

function proposal(tool: TraceToolRow): SequenceProposal | null {
  if (!STRUCTURE_TOOLS.has(tool.toolName) || tool.outcome !== 'rejected') return null;
  const details = parseDetails(tool.details);
  const replay = asRecord(asRecord(details?.debug)?.replayState);
  const before = categoryScores(replay?.categoryScoresBefore);
  const after = categoryScores(replay?.categoryScoresAfter);
  return {
    toolName: tool.toolName,
    outcome: tool.outcome,
    scoreBefore: numberOrNull(replay?.scoreBefore) ?? numberOrNull(tool.scoreBefore),
    scoreAfter: numberOrNull(replay?.scoreAfter) ?? numberOrNull(tool.scoreAfter),
    headingBefore: before.heading_structure ?? null,
    headingAfter: after.heading_structure ?? null,
    readingBefore: before.reading_order ?? null,
    readingAfter: after.reading_order ?? null,
    stateSignatureBefore: stringOrNull(replay?.stateSignatureBefore),
    pacRuleIds: pacRuleIds(details),
  };
}

function isScoreMoving(item: SequenceProposal): boolean {
  return (item.scoreAfter ?? -1) > (item.scoreBefore ?? -1) &&
    (item.headingAfter ?? -1) > (item.headingBefore ?? -1);
}

function isRegressiveCleanup(tool: TraceToolRow): boolean {
  if (!CLEANUP_TOOLS.has(tool.toolName)) return false;
  const details = parseDetails(tool.details);
  const note = stringOrNull(details?.raw) ?? stringOrNull(details?.note) ?? '';
  return note.includes('regressed_score') || note.includes('regressed_category');
}

function classify(row: TraceRunRow, proposals: SequenceProposal[], cleanupAttemptCount: number, cleanupRegressiveCount: number): {
  classification: SequenceDiagnosticClassification;
  recommendation: string;
} {
  if (!row.appliedTools?.length) {
    return {
      classification: 'missing_tool_timeline',
      recommendation: 'Regenerate the trace with appliedTools before considering sequence behavior.',
    };
  }
  if ((row.afterScore ?? 0) >= 90) {
    return {
      classification: 'existing_recovery_observed',
      recommendation: 'Already recovered in this run; keep as a control rather than adding behavior.',
    };
  }
  const annotationBlocked = proposals.filter(item => item.pacRuleIds.includes('pdfua.annotations.tagged_annotations_present'));
  if (annotationBlocked.length === 0) {
    if ((row.durationMs ?? 0) >= 240_000) {
      return {
        classification: 'runtime_route_heavy',
        recommendation: 'No annotation-blocked structural proposal is visible; inspect runtime/checkpoint traces before adding behavior.',
      };
    }
    return {
      classification: 'no_annotation_blocked_structure',
      recommendation: 'No rejected structural proposal is blocked by tagged-annotation PAC debt.',
    };
  }
  const scoreMoving = annotationBlocked.filter(isScoreMoving);
  if (scoreMoving.length === 0) {
    return {
      classification: 'annotation_blocked_no_score_movement',
      recommendation: 'Do not add behavior yet; annotation-blocked structural proposals did not show score plus heading movement in replay evidence.',
    };
  }
  const allowedOnly = scoreMoving.filter(item => item.pacRuleIds.every(ruleId =>
    ruleId === 'pdfua.annotations.tagged_annotations_present' ||
    ruleId === 'pdfua.content.orphan_mcids_absent'
  ));
  const mixed = allowedOnly.length === 0 && scoreMoving.some(item => item.pacRuleIds.some(ruleId =>
    ruleId !== 'pdfua.annotations.tagged_annotations_present' &&
    ruleId !== 'pdfua.content.orphan_mcids_absent'
  ));
  if (mixed) {
    return {
      classification: 'mixed_non_annotation_pac_blockers',
      recommendation: 'Do not add a structure-annotation sequence from this row; score-moving proposals include non-annotation/non-orphan PAC blockers.',
    };
  }
  if (cleanupAttemptCount === 0 || cleanupRegressiveCount > 0) {
    if (cleanupAttemptCount === 0) {
      return {
        classification: 'proposal_buffer_route_gap',
        recommendation: 'Score-moving proposal is visible only in rejected replay evidence; diagnose a proposal-buffer cleanup path before adding behavior.',
      };
    }
    return {
      classification: 'cleanup_unproven_or_regressive',
      recommendation: 'A sequence could be investigated, but current cleanup attempts are missing or regressive; run a bounded cleanup proof first.',
    };
  }
  return {
    classification: 'sequence_probe_candidate',
    recommendation: 'Candidate for a bounded structure-then-annotation sequence proof with final PAC-safe reanalysis.',
  };
}

export function buildStructureAnnotationSequenceDiagnostic(input: {
  rows: TraceRunRow[];
  traceSource?: string;
  generatedAt?: string;
}): StructureAnnotationSequenceDiagnostic {
  const rows = input.rows.map(row => {
    const proposals = (row.appliedTools ?? [])
      .map(proposal)
      .filter((item): item is SequenceProposal => Boolean(item))
      .sort((a, b) => (b.scoreAfter ?? -1) - (a.scoreAfter ?? -1) || a.toolName.localeCompare(b.toolName));
    const annotationBlocked = proposals.filter(item => item.pacRuleIds.includes('pdfua.annotations.tagged_annotations_present'));
    const scoreMoving = annotationBlocked.filter(isScoreMoving);
    const cleanupAttemptCount = (row.appliedTools ?? []).filter(tool => CLEANUP_TOOLS.has(tool.toolName)).length;
    const cleanupRegressiveCount = (row.appliedTools ?? []).filter(isRegressiveCleanup).length;
    const decision = classify(row, proposals, cleanupAttemptCount, cleanupRegressiveCount);
    return {
      file: row.file,
      score: row.afterScore ?? null,
      grade: row.afterGrade ?? null,
      categories: rowCategoryScores(row),
      classification: decision.classification,
      recommendation: decision.recommendation,
      annotationBlockedProposalCount: annotationBlocked.length,
      scoreMovingProposalCount: scoreMoving.length,
      cleanupAttemptCount,
      cleanupRegressiveCount,
      bestProposal: scoreMoving[0] ?? annotationBlocked[0] ?? null,
      proposals,
    };
  }).sort((a, b) =>
    Number(b.classification === 'sequence_probe_candidate') - Number(a.classification === 'sequence_probe_candidate') ||
    b.scoreMovingProposalCount - a.scoreMovingProposalCount ||
    b.annotationBlockedProposalCount - a.annotationBlockedProposalCount ||
    a.file.localeCompare(b.file)
  );
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    traceSource: input.traceSource ?? '',
    summary: {
      rowCount: rows.length,
      sequenceProbeCandidateCount: rows.filter(row => row.classification === 'sequence_probe_candidate').length,
      annotationBlockedNoScoreMovementCount: rows.filter(row => row.classification === 'annotation_blocked_no_score_movement').length,
      selectedRows: rows.filter(row => row.classification === 'sequence_probe_candidate').map(row => row.file),
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

function renderMarkdown(report: StructureAnnotationSequenceDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Structure/Annotation Sequence Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Trace source: \`${report.traceSource}\``);
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Sequence probe candidates: ${report.summary.sequenceProbeCandidateCount}`);
  lines.push(`- Annotation-blocked no-score-movement rows: ${report.summary.annotationBlockedNoScoreMovementCount}`);
  const classificationCounts = new Map<string, number>();
  for (const row of report.rows) {
    classificationCounts.set(row.classification, (classificationCounts.get(row.classification) ?? 0) + 1);
  }
  lines.push(`- Classifications: ${[...classificationCounts.entries()].map(([key, count]) => `${key}=${count}`).join(', ') || 'none'}`);
  lines.push('');
  lines.push('| File | Score | Class | Annotation-blocked | Score-moving | Cleanup attempts | Cleanup regressions | Best proposal | Recommendation |');
  lines.push('| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows) {
    const best = row.bestProposal
      ? `${row.bestProposal.toolName} ${row.bestProposal.scoreBefore ?? 'n/a'}->${row.bestProposal.scoreAfter ?? 'n/a'} heading ${row.bestProposal.headingBefore ?? 'n/a'}->${row.bestProposal.headingAfter ?? 'n/a'}`
      : 'none';
    lines.push(`| \`${row.file}\` | ${row.score ?? 'n/a'} | ${row.classification} | ${row.annotationBlockedProposalCount} | ${row.scoreMovingProposalCount} | ${row.cleanupAttemptCount} | ${row.cleanupRegressiveCount} | ${best} | ${row.recommendation} |`);
  }
  lines.push('');
  lines.push('## Proposal Details');
  lines.push('');
  for (const row of report.rows) {
    lines.push(`### ${row.file}`);
    lines.push('');
    if (row.proposals.length === 0) {
      lines.push('No rejected structural proposals in the trace.');
      lines.push('');
      continue;
    }
    lines.push('| Tool | Score | Heading | Reading | PAC rules | State |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of row.proposals) {
      lines.push(`| \`${item.toolName}\` | ${item.scoreBefore ?? 'n/a'} -> ${item.scoreAfter ?? 'n/a'} | ${item.headingBefore ?? 'n/a'} -> ${item.headingAfter ?? 'n/a'} | ${item.readingBefore ?? 'n/a'} -> ${item.readingAfter ?? 'n/a'} | ${item.pacRuleIds.map(id => `\`${id}\``).join(', ') || 'none'} | \`${item.stateSignatureBefore ?? 'n/a'}\` |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const parsed = JSON.parse(await readFile(args.trace, 'utf8')) as unknown;
  const report = buildStructureAnnotationSequenceDiagnostic({
    rows: normalizedRows(parsed),
    traceSource: args.trace,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'structure-annotation-sequence-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'structure-annotation-sequence-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'structure-annotation-sequence-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

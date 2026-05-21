#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { pacRuleScoringCap } from '../src/services/scorer/finalizeEvidence.js';
import type { AnalysisResult, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';
import {
  collectContentEventRows,
  type ContentEventSourceRow,
} from './content-event-tagging-fidelity-diagnostic.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-list-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `list-toc-note-parity-${timestampSlug()}`);

const LIST_TOC_NOTE_RULES = new Set([
  'pdfua.list.li_parent_valid',
  'pdfua.list.lbl_lbody_parent_valid',
  'pdfua.list.items_present',
  'pdfua.toc.toci_links_valid',
  'pdfua.note.ids_unique',
]);

const SCORE_ACTIVE_LIST_RULES = new Set([
  'pdfua.list.li_parent_valid',
  'pdfua.list.lbl_lbody_parent_valid',
  'pdfua.list.items_present',
]);

export type ListTocNoteClassification =
  | 'list_repair_behavior_candidate'
  | 'list_lbl_lbody_repair_gap'
  | 'list_score_active_only'
  | 'toc_note_diagnostic_gap'
  | 'list_toc_note_noise_or_control'
  | 'no_list_toc_note_debt'
  | 'analysis_error';

export type ListTocNoteSuggestedAction =
  | 'list_behavior_validation_needed'
  | 'list_repair_design_needed'
  | 'toc_note_evidence_hardening_needed'
  | 'already_score_active'
  | 'keep_diagnostic'
  | 'no_action';

export interface ListTocNoteFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  pageCount: number;
  readingOrder: number;
  bookmarks: number;
  pdfUaCompliance: number;
  hasStructure: boolean;
  listCount: number;
  listItemCount: number;
  listItemMisplacedCount: number;
  lblBodyMisplacedCount: number;
  listsWithoutItems: number;
  repairableListDebt: number;
  tocItemsChecked: number;
  notesChecked: number;
  tocItemMissingLinkCount: number;
  tocDestinationMissingCount: number;
  noteMissingIdCount: number;
  duplicateNoteIdCount: number;
  noteMissingLabelOrReferenceCount: number;
  tocDebt: number;
  noteDebt: number;
  pacFailures: string[];
  pacWarnings: string[];
  scoreCapRules: string[];
  failRulesWithScoringCap: string[];
  failRulesMissingScoreCap: string[];
}

export interface ListTocNoteDiagnosticRow extends ContentEventSourceRow {
  classification: ListTocNoteClassification;
  suggestedAction: ListTocNoteSuggestedAction;
  reasons: string[];
  features: ListTocNoteFeatures | null;
  error?: string;
}

export interface ListTocNoteDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<ListTocNoteClassification, number>;
  suggestedActionDistribution: Record<ListTocNoteSuggestedAction, number>;
  decision: {
    status:
      | 'plan_list_behavior_validation'
      | 'plan_list_repair_design'
      | 'plan_toc_note_evidence_hardening'
      | 'keep_list_toc_note_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: ListTocNoteDiagnosticRow[];
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
  return `Usage: pnpm exec tsx scripts/list-toc-note-parity-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and reports PAC/POC-style list, TOC, and Note evidence. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
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

function categoryScore(analysis: AnalysisResult, key: string): number {
  return analysis.categories.find(category => category.key === key)?.score ?? 100;
}

function scoreCapRules(analysis: AnalysisResult): string[] {
  const caps: ScoreCapApplied[] = [
    ...(analysis.scoreCapsApplied ?? []),
    ...analysis.categories.flatMap(category => category.scoreCapsApplied ?? []),
  ];
  const rules = new Set<string>();
  for (const cap of caps) {
    const match = cap.reason.match(/PAC rule failure: ([^\s]+)/);
    if (match?.[1] && LIST_TOC_NOTE_RULES.has(match[1])) rules.add(match[1]);
  }
  return [...rules].sort();
}

export function extractListTocNoteFeatures(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): ListTocNoteFeatures {
  const list = snapshot.listStructureAudit;
  const toc = snapshot.tocNoteAudit;
  const pacRules = buildPacRuleEvidence(snapshot).filter(rule => LIST_TOC_NOTE_RULES.has(rule.ruleId));
  const failures = pacRules.filter(rule => rule.status === 'fail').map(rule => rule.ruleId).sort();
  const warnings = pacRules.filter(rule => rule.status === 'warn').map(rule => rule.ruleId).sort();
  const caps = scoreCapRules(analysis);
  const failRulesWithScoringCap = failures.filter(ruleId => pacRuleScoringCap(ruleId) !== null).sort();
  const failRulesMissingScoreCap = failRulesWithScoringCap.filter(ruleId => !caps.includes(ruleId)).sort();
  const repairableListDebt = (list?.listItemMisplacedCount ?? 0) + (list?.listsWithoutItems ?? 0);
  const tocDebt = (toc?.tocItemMissingLinkCount ?? 0) + (toc?.tocDestinationMissingCount ?? 0);
  const noteDebt =
    (toc?.noteMissingIdCount ?? 0) +
    (toc?.duplicateNoteIdCount ?? 0) +
    (toc?.noteMissingLabelOrReferenceCount ?? 0);

  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    pageCount: snapshot.pageCount,
    readingOrder: categoryScore(analysis, 'reading_order'),
    bookmarks: categoryScore(analysis, 'bookmarks'),
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    hasStructure: snapshot.structureTree !== null,
    listCount: list?.listCount ?? 0,
    listItemCount: list?.listItemCount ?? 0,
    listItemMisplacedCount: list?.listItemMisplacedCount ?? 0,
    lblBodyMisplacedCount: list?.lblBodyMisplacedCount ?? 0,
    listsWithoutItems: list?.listsWithoutItems ?? 0,
    repairableListDebt,
    tocItemsChecked: toc?.tocItemsChecked ?? 0,
    notesChecked: toc?.notesChecked ?? 0,
    tocItemMissingLinkCount: toc?.tocItemMissingLinkCount ?? 0,
    tocDestinationMissingCount: toc?.tocDestinationMissingCount ?? 0,
    noteMissingIdCount: toc?.noteMissingIdCount ?? 0,
    duplicateNoteIdCount: toc?.duplicateNoteIdCount ?? 0,
    noteMissingLabelOrReferenceCount: toc?.noteMissingLabelOrReferenceCount ?? 0,
    tocDebt,
    noteDebt,
    pacFailures: failures,
    pacWarnings: warnings,
    scoreCapRules: caps,
    failRulesWithScoringCap,
    failRulesMissingScoreCap,
  };
}

export function classifyListTocNoteEvidence(features: ListTocNoteFeatures): {
  classification: ListTocNoteClassification;
  suggestedAction: ListTocNoteSuggestedAction;
  reasons: string[];
} {
  const reasons: string[] = [];
  const listDebt = features.repairableListDebt + features.lblBodyMisplacedCount;
  if (features.repairableListDebt > 0) reasons.push(`repairable_list_debt:${features.repairableListDebt}`);
  if (features.lblBodyMisplacedCount > 0) reasons.push(`lbl_lbody_debt:${features.lblBodyMisplacedCount}`);
  if (features.tocDebt > 0) reasons.push(`toc_debt:${features.tocDebt}`);
  if (features.noteDebt > 0) reasons.push(`note_debt:${features.noteDebt}`);
  if (features.failRulesMissingScoreCap.length > 0) {
    reasons.push(`missing_score_cap:${features.failRulesMissingScoreCap.join('+')}`);
  }

  if (features.repairableListDebt > 0 && features.readingOrder < 90) {
    return {
      classification: 'list_repair_behavior_candidate',
      suggestedAction: 'list_behavior_validation_needed',
      reasons,
    };
  }

  if (features.repairableListDebt === 0 && features.lblBodyMisplacedCount > 0) {
    return {
      classification: 'list_lbl_lbody_repair_gap',
      suggestedAction: 'list_repair_design_needed',
      reasons,
    };
  }

  if (features.tocDebt + features.noteDebt > 0) {
    return {
      classification: 'toc_note_diagnostic_gap',
      suggestedAction: 'toc_note_evidence_hardening_needed',
      reasons,
    };
  }

  if (
    features.scoreCapRules.some(rule => SCORE_ACTIVE_LIST_RULES.has(rule)) ||
    features.failRulesWithScoringCap.some(rule => SCORE_ACTIVE_LIST_RULES.has(rule))
  ) {
    return {
      classification: 'list_score_active_only',
      suggestedAction: 'already_score_active',
      reasons: reasons.length ? reasons : ['list_debt_already_score_active'],
    };
  }

  if (listDebt > 0 || features.listCount > 0 || features.tocItemsChecked > 0 || features.notesChecked > 0) {
    return {
      classification: 'list_toc_note_noise_or_control',
      suggestedAction: 'keep_diagnostic',
      reasons: reasons.length ? reasons : ['list_toc_note_evidence_without_promotable_debt'],
    };
  }

  return {
    classification: 'no_list_toc_note_debt',
    suggestedAction: 'no_action',
    reasons: ['no_list_toc_note_debt'],
  };
}

export async function analyzeListTocNoteRow(row: ContentEventSourceRow): Promise<ListTocNoteDiagnosticRow> {
  try {
    const analyzed = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractListTocNoteFeatures(analyzed.result, analyzed.snapshot);
    const classification = classifyListTocNoteEvidence(features);
    return {
      ...row,
      classification: classification.classification,
      suggestedAction: classification.suggestedAction,
      reasons: classification.reasons,
      features,
    };
  } catch (error) {
    return {
      ...row,
      classification: 'analysis_error',
      suggestedAction: 'keep_diagnostic',
      reasons: ['analysis_error'],
      features: null,
      error: (error as Error).message,
    };
  }
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function buildListTocNoteReport(
  outDir: string,
  rows: ListTocNoteDiagnosticRow[],
): ListTocNoteDiagnosticReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const repairFocus = rows.filter(row => row.role === 'focus' && row.classification === 'list_repair_behavior_candidate').length;
  const repairControls = rows.filter(row => row.role === 'control' && row.classification === 'list_repair_behavior_candidate').length;
  const designFocus = rows.filter(row => row.role === 'focus' && row.classification === 'list_lbl_lbody_repair_gap').length;
  const designControls = rows.filter(row => row.role === 'control' && row.classification === 'list_lbl_lbody_repair_gap').length;
  const tocFocus = rows.filter(row => row.role === 'focus' && row.classification === 'toc_note_diagnostic_gap').length;
  const tocControls = rows.filter(row => row.role === 'control' && row.classification === 'toc_note_diagnostic_gap').length;
  const errors = rows.filter(row => row.classification === 'analysis_error').length;
  const reasons = [
    `repair_focus=${repairFocus}`,
    `repair_controls=${repairControls}`,
    `design_focus=${designFocus}`,
    `design_controls=${designControls}`,
    `toc_focus=${tocFocus}`,
    `toc_controls=${tocControls}`,
    `analysis_errors=${errors}`,
  ];
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : repairFocus >= 2 && repairControls === 0
      ? 'plan_list_behavior_validation'
      : designFocus >= 2 && designControls === 0
        ? 'plan_list_repair_design'
        : tocFocus >= 2 && tocControls === 0
          ? 'plan_toc_note_evidence_hardening'
          : 'keep_list_toc_note_diagnostic_only';
  return {
    createdAt: new Date().toISOString(),
    outDir,
    selectedRowCount: rows.length,
    classificationDistribution,
    suggestedActionDistribution,
    decision: { status, reasons },
    rows,
  };
}

function renderMarkdown(report: ListTocNoteDiagnosticReport): string {
  const lines = [
    '# List/TOC/Note PAC Parity Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native PDFAF list, TOC, and Note evidence. No PAC/POC/ODL/Java call, remediation, PDF mutation, scoring change, or planner routing change was performed.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Reading | Lists/LI | Misplaced LI | Lbl/LBody | Empty L | TOC/Note | Class | Action |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f ? String(f.readingOrder) : 'ERR',
      f ? `${f.listCount}/${f.listItemCount}` : 'ERR',
      f ? String(f.listItemMisplacedCount) : 'ERR',
      f ? String(f.lblBodyMisplacedCount) : 'ERR',
      f ? String(f.listsWithoutItems) : 'ERR',
      f ? `${f.tocDebt}/${f.noteDebt}` : 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'plan_list_behavior_validation') {
    lines.push('A later behavior proof may be justified for existing `repair_list_li_wrong_parent`, using targeted positives, controls, and final PAC/list debt checks.');
  } else if (report.decision.status === 'plan_list_repair_design') {
    lines.push('Native evidence shows repeated Lbl/LBody debt, but the existing list repair only covers misplaced LI or empty L. A separate design stage is needed before behavior.');
  } else if (report.decision.status === 'plan_toc_note_evidence_hardening') {
    lines.push('TOC/Note evidence appears repeatedly in focus rows and should be hardened diagnostically before any scoring or remediation change.');
  } else if (report.decision.status === 'diagnostic_errors_present') {
    lines.push('Resolve diagnostic errors before making a list/TOC/Note lane decision.');
  } else {
    lines.push('No list/TOC/Note promotion is justified from this sample. Keep the lane diagnostic-only or choose a more specific object-backed sample.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeListTocNoteReport(
  outDir: string,
  rows: ListTocNoteDiagnosticRow[],
): Promise<ListTocNoteDiagnosticReport> {
  const report = buildListTocNoteReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'list-toc-note-parity.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'list-toc-note-parity.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const sourceRows = await collectContentEventRows(args);
  if (sourceRows.length === 0) throw new Error('No rows matched the requested inputs.');
  const rows: ListTocNoteDiagnosticRow[] = [];
  for (const row of sourceRows) {
    const result = await analyzeListTocNoteRow(row);
    rows.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[list-toc-note] ${result.id} ${score} ${result.classification}`);
  }
  const report = await writeListTocNoteReport(args.outDir, rows);
  console.log(`[list-toc-note] wrote ${join(args.outDir, 'list-toc-note-parity.md')}`);
  console.log(`[list-toc-note] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';

type JsonRecord = Record<string, unknown>;

export type SideEffectFamily =
  | 'figure_alt'
  | 'orphan_mcid'
  | 'link_annotation'
  | 'reading_order'
  | 'unknown';

export type SideEffectRowClassification =
  | 'side_effect_cleanup_candidate'
  | 'control_side_effect_blocker'
  | 'wrong_ref_precondition'
  | 'table_only_cleanup_candidate'
  | 'runtime_or_analyzer_debt'
  | 'no_table_side_effect_evidence';

export interface TablePacSideEffectAttempt {
  toolName: string;
  outcome: string | null;
  note: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  requestedRefs: string[];
  changedRefs: string[];
  wrongRefs: string[];
  tablePacRegressions: string[];
  nonTablePacRegressions: string[];
  nonTableFamilies: SideEffectFamily[];
  tableEvidenceImproved: boolean;
}

export interface TablePacSideEffectRow {
  id: string;
  file: string;
  role: 'focus' | 'control';
  score: number | null;
  grade: string | null;
  error: string | null;
  timedOut: boolean;
  classification: SideEffectRowClassification;
  promotionSupported: boolean;
  reasons: string[];
  sideEffectFamilies: SideEffectFamily[];
  attempts: TablePacSideEffectAttempt[];
}

export interface TablePacSideEffectReport {
  generatedAt: string;
  run: string;
  outDir: string;
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    byClassification: Record<SideEffectRowClassification, number>;
    byFamily: Record<SideEffectFamily, number>;
    cleanupCandidates: string[];
    controlBlockers: string[];
    wrongRefRows: string[];
  };
  decision: {
    status: 'plan_side_effect_cleanup_behavior' | 'diagnostic_only';
    reasons: string[];
  };
  rows: TablePacSideEffectRow[];
}

interface ParsedArgs {
  run: string;
  outDir: string;
  controls: Set<string>;
}

interface BoundedRow {
  file?: unknown;
  afterScore?: unknown;
  afterGrade?: unknown;
  appliedTools?: unknown;
  error?: unknown;
  boundedRunner?: unknown;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-pac-side-effect-diagnostic.ts --run <baseline_report.json> [options]

Options:
  --out <dir>       Output directory (default: ${DEFAULT_OUT_ROOT}/table-pac-side-effect-<timestamp>)
  --control <id>    Mark row id as a control; repeatable
  --help            Show this help.`;
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()): ParsedArgs {
  let run = '';
  let outDir = join(DEFAULT_OUT_ROOT, `table-pac-side-effect-${timestampSlug(now)}`);
  const controls = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--run') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --run value\n${usage()}`);
      run = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--control') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --control value\n${usage()}`);
      controls.add(value.replace(/\.pdf$/i, ''));
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  if (!run) throw new Error(`Missing --run\n${usage()}`);
  return { run, outDir, controls };
}

function objectValue(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseJsonObject(value: unknown): JsonRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return objectValue(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function normalizeRole(value: unknown): string | null {
  const role = stringValue(value);
  return role ? role.replace(/^\//, '').trim() : null;
}

function idFromFile(file: string): string {
  return basename(file).replace(/\.pdf$/i, '');
}

function asStringArray(value: unknown): string[] {
  const out: string[] = [];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of values) {
    const text = stringValue(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function mergeRefs(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const ref of asStringArray(value)) {
      if (!out.includes(ref)) out.push(ref);
    }
  }
  return out;
}

function ruleIds(value: unknown): string[] {
  const ids: string[] = [];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of values) {
    const id = stringValue(objectValue(item)?.['ruleId']);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function collectPacRegressions(details: JsonRecord | null): string[] {
  const ids: string[] = [];
  const visit = (value: unknown): void => {
    const obj = objectValue(value);
    if (!obj) return;
    for (const id of [...ruleIds(obj['pacRuleRegression']), ...ruleIds(obj['pacRuleRegressions'])]) {
      if (!ids.includes(id)) ids.push(id);
    }
    for (const key of ['originalDetails', 'mutation']) visit(obj[key]);
  };
  visit(details);
  return ids;
}

export function pacSideEffectFamily(ruleId: string): SideEffectFamily | 'table_header' {
  const id = ruleId.toLowerCase();
  if (id.includes('table') || id.includes('header_association') || id.includes('header_cells')) return 'table_header';
  if (id.includes('figure') || id.includes('alt')) return 'figure_alt';
  if (id.includes('orphan') || id.includes('mcid')) return 'orphan_mcid';
  if (id.includes('link') || id.includes('annotation') || id.includes('annot')) return 'link_annotation';
  if (id.includes('reading') || id.includes('order')) return 'reading_order';
  return 'unknown';
}

function uniqueFamilies(ruleIdsIn: string[]): SideEffectFamily[] {
  const out: SideEffectFamily[] = [];
  for (const ruleId of ruleIdsIn) {
    const family = pacSideEffectFamily(ruleId);
    if (family !== 'table_header' && !out.includes(family)) out.push(family);
  }
  return out;
}

function targetDetailObjects(details: JsonRecord | null): JsonRecord[] {
  const invariants = objectValue(details?.['invariants']);
  const mutation = objectValue(details?.['mutation']);
  const mutationInvariants = objectValue(mutation?.['invariants']);
  const mutationDebug = objectValue(mutation?.['debug']);
  const debug = objectValue(details?.['debug']);
  return [
    ...arrayValue(invariants?.['targetRefDetails']),
    ...arrayValue(invariants?.['targetRefDetailsAfter']),
    ...arrayValue(invariants?.['targetRefDetailsBefore']),
    ...arrayValue(mutationInvariants?.['targetRefDetails']),
    ...arrayValue(mutationInvariants?.['targetRefDetailsAfter']),
    ...arrayValue(mutationInvariants?.['targetRefDetailsBefore']),
    ...arrayValue(debug?.['targetRefDetails']),
    ...arrayValue(debug?.['skippedTargetRefDetails']),
    ...arrayValue(mutationDebug?.['targetRefDetails']),
    ...arrayValue(mutationDebug?.['skippedTargetRefDetails']),
  ].map(objectValue).filter((item): item is JsonRecord => Boolean(item));
}

function wrongRefsFromDetails(details: JsonRecord | null): string[] {
  const wrong: string[] = [];
  for (const detail of targetDetailObjects(details)) {
    const ref = stringValue(detail['ref']) ?? stringValue(detail['targetRef']);
    if (!ref) continue;
    const rawRole = normalizeRole(detail['rawRole']);
    const resolvedRole = normalizeRole(detail['resolvedRole']);
    const isTable = boolValue(detail['isTable']);
    const resolvedIsTable = boolValue(detail['resolvedIsTable']);
    const targetResolved = boolValue(detail['targetResolved']);
    const targetReachable = boolValue(detail['targetReachable']);
    const skipReason = stringValue(detail['skipReason']);
    const tableRole = rawRole?.toUpperCase() === 'TABLE' || resolvedRole?.toUpperCase() === 'TABLE';
    const valid = targetResolved !== false && targetReachable !== false && (isTable === true || resolvedIsTable === true || tableRole);
    if (!valid || skipReason === 'not_table') wrong.push(ref);
  }
  return [...new Set(wrong)];
}

function nestedObject(root: JsonRecord | null, path: string[]): JsonRecord | null {
  let current: unknown = root;
  for (const part of path) {
    const obj = objectValue(current);
    if (!obj) return null;
    current = obj[part];
  }
  return objectValue(current);
}

function countDrops(replay: JsonRecord | null, signal: string): boolean {
  const before = numberValue(nestedObject(replay, ['detectionSignalsBefore'])?.[signal]);
  const after = numberValue(nestedObject(replay, ['detectionSignalsAfter'])?.[signal]);
  return before !== null && after !== null && after < before;
}

function countIncreases(replay: JsonRecord | null, signal: string): boolean {
  const before = numberValue(nestedObject(replay, ['detectionSignalsBefore'])?.[signal]);
  const after = numberValue(nestedObject(replay, ['detectionSignalsAfter'])?.[signal]);
  return before !== null && after !== null && after > before;
}

function categoryDrops(replay: JsonRecord | null, category: string): boolean {
  const before = numberValue(nestedObject(replay, ['categoryScoresBefore'])?.[category]);
  const after = numberValue(nestedObject(replay, ['categoryScoresAfter'])?.[category]);
  return before !== null && after !== null && after < before;
}

function tableEvidenceImproved(details: JsonRecord | null): boolean {
  const invariants = objectValue(details?.['invariants']);
  const mutation = objectValue(details?.['mutation']);
  const mutationInvariants = objectValue(mutation?.['invariants']);
  const structuralBenefits = objectValue(details?.['structuralBenefits']) ?? objectValue(mutation?.['structuralBenefits']);
  const inv = mutationInvariants ?? invariants;
  const improvedByCount = (beforeKey: string, afterKey: string, direction: 'down' | 'up'): boolean => {
    const before = numberValue(inv?.[beforeKey]);
    const after = numberValue(inv?.[afterKey]);
    if (before === null || after === null) return false;
    return direction === 'down' ? after < before : after > before;
  };
  return boolValue(structuralBenefits?.['tableValidityImproved']) === true ||
    improvedByCount('directCellsUnderTableBefore', 'directCellsUnderTableAfter', 'down') ||
    improvedByCount('irregularRowsBefore', 'irregularRowsAfter', 'down') ||
    improvedByCount('headerAssociationMissingCountBefore', 'headerAssociationMissingCountAfter', 'down') ||
    improvedByCount('dataCellsWithoutHeaderCountBefore', 'dataCellsWithoutHeaderCountAfter', 'down') ||
    improvedByCount('dataCellsWithHeadersCountBefore', 'dataCellsWithHeadersCountAfter', 'up') ||
    improvedByCount('headerCellsWithScopeCountBefore', 'headerCellsWithScopeCountAfter', 'up');
}

export function extractTableSideEffectAttempt(tool: JsonRecord): TablePacSideEffectAttempt | null {
  const toolName = stringValue(tool['toolName']);
  if (!toolName || !TABLE_TOOLS.has(toolName)) return null;
  const details = parseJsonObject(tool['details']);
  const invariants = objectValue(details?.['invariants']);
  const mutation = objectValue(details?.['mutation']);
  const mutationInvariants = objectValue(mutation?.['invariants']);
  const mutationDebug = objectValue(mutation?.['debug']);
  const debug = objectValue(details?.['debug']);
  const replay = nestedObject(details, ['debug', 'replayState']);
  const pacRegressions = collectPacRegressions(details);
  const tablePacRegressions = pacRegressions.filter(id => pacSideEffectFamily(id) === 'table_header');
  const nonTablePacRegressions = pacRegressions.filter(id => pacSideEffectFamily(id) !== 'table_header');
  const inferredFamilies = uniqueFamilies(nonTablePacRegressions);
  if (categoryDrops(replay, 'alt_text') || countDrops(replay, 'checkerVisibleFigureAltCount')) {
    if (!inferredFamilies.includes('figure_alt')) inferredFamilies.push('figure_alt');
  }
  if (countIncreases(replay, 'orphanMcidCount')) {
    if (!inferredFamilies.includes('orphan_mcid')) inferredFamilies.push('orphan_mcid');
  }
  return {
    toolName,
    outcome: stringValue(tool['outcome']) ?? stringValue(details?.['outcome']),
    note: stringValue(details?.['note']) ?? stringValue(mutation?.['note']),
    scoreBefore: numberValue(tool['scoreBefore']),
    scoreAfter: numberValue(tool['scoreAfter']),
    requestedRefs: mergeRefs(
      details?.['requestedTargetRefs'],
      invariants?.['requestedTargetRefs'],
      mutation?.['requestedTargetRefs'],
      mutationInvariants?.['requestedTargetRefs'],
      details?.['targetRef'],
      details?.['targetRefs'],
      invariants?.['targetRef'],
      invariants?.['targetRefs'],
      mutationDebug?.['targetRef'],
      mutationDebug?.['targetRefs'],
    ),
    changedRefs: mergeRefs(
      details?.['changedTargetRefs'],
      debug?.['changedTargetRefs'],
      mutation?.['changedTargetRefs'],
      mutationDebug?.['changedTargetRefs'],
    ),
    wrongRefs: wrongRefsFromDetails(details),
    tablePacRegressions,
    nonTablePacRegressions,
    nonTableFamilies: inferredFamilies,
    tableEvidenceImproved: tableEvidenceImproved(details),
  };
}

function rowTimedOut(row: BoundedRow): boolean {
  return boolValue(objectValue(row.boundedRunner)?.['timedOut']) === true;
}

function rowError(row: BoundedRow): string | null {
  return stringValue(row.error);
}

export function classifyTablePacSideEffectRow(input: {
  id: string;
  role: 'focus' | 'control';
  score: number | null;
  error: string | null;
  timedOut: boolean;
  attempts: TablePacSideEffectAttempt[];
}): Pick<TablePacSideEffectRow, 'classification' | 'promotionSupported' | 'reasons' | 'sideEffectFamilies'> {
  const reasons: string[] = [];
  if (input.timedOut || input.error) {
    if (input.timedOut) reasons.push('row_timeout');
    if (input.error) reasons.push(`row_error:${input.error}`);
    return { classification: 'runtime_or_analyzer_debt', promotionSupported: false, reasons, sideEffectFamilies: [] };
  }
  if (input.attempts.length === 0) {
    reasons.push('no_table_tools_attempted');
    return { classification: 'no_table_side_effect_evidence', promotionSupported: false, reasons, sideEffectFamilies: [] };
  }

  const wrongRefs = input.attempts.flatMap(attempt => attempt.wrongRefs);
  if (wrongRefs.length > 0) {
    reasons.push(`wrong_ref:${[...new Set(wrongRefs)].join(',')}`);
    return { classification: 'wrong_ref_precondition', promotionSupported: false, reasons, sideEffectFamilies: [] };
  }

  const sideEffectFamilies = input.attempts.flatMap(attempt => attempt.nonTableFamilies)
    .filter((family, index, array) => array.indexOf(family) === index);
  if (sideEffectFamilies.length > 0) {
    for (const family of sideEffectFamilies) reasons.push(`non_table_side_effect:${family}`);
    if (input.role === 'control') {
      return { classification: 'control_side_effect_blocker', promotionSupported: false, reasons, sideEffectFamilies };
    }
    const hasTableImprovement = input.attempts.some(attempt => attempt.tableEvidenceImproved);
    if (hasTableImprovement) reasons.push('table_evidence_improved_before_side_effect');
    return {
      classification: 'side_effect_cleanup_candidate',
      promotionSupported: hasTableImprovement,
      reasons,
      sideEffectFamilies,
    };
  }

  const tablePac = input.attempts.flatMap(attempt => attempt.tablePacRegressions);
  const improved = input.attempts.some(attempt => attempt.tableEvidenceImproved);
  if (tablePac.length > 0 || improved) {
    if (tablePac.length > 0) reasons.push(`table_pac_only:${[...new Set(tablePac)].join(',')}`);
    if (improved) reasons.push('table_evidence_improved_without_non_table_side_effect');
    return { classification: 'table_only_cleanup_candidate', promotionSupported: input.role === 'focus' && improved, reasons, sideEffectFamilies: [] };
  }

  reasons.push('table_attempts_no_side_effect_or_table_gain');
  return { classification: 'no_table_side_effect_evidence', promotionSupported: false, reasons, sideEffectFamilies: [] };
}

function emptyClassificationCounts(): Record<SideEffectRowClassification, number> {
  return {
    side_effect_cleanup_candidate: 0,
    control_side_effect_blocker: 0,
    wrong_ref_precondition: 0,
    table_only_cleanup_candidate: 0,
    runtime_or_analyzer_debt: 0,
    no_table_side_effect_evidence: 0,
  };
}

function emptyFamilyCounts(): Record<SideEffectFamily, number> {
  return {
    figure_alt: 0,
    orphan_mcid: 0,
    link_annotation: 0,
    reading_order: 0,
    unknown: 0,
  };
}

export async function buildReport(args: ParsedArgs): Promise<TablePacSideEffectReport> {
  const parsed = JSON.parse(await readFile(args.run, 'utf8')) as { rows?: unknown };
  const rows = arrayValue(parsed.rows).map(objectValue).filter((row): row is BoundedRow & JsonRecord => Boolean(row));
  const diagnostics: TablePacSideEffectRow[] = [];
  for (const row of rows) {
    const file = stringValue(row.file) ?? 'unknown.pdf';
    const id = idFromFile(file);
    const role = args.controls.has(id) ? 'control' : 'focus';
    const attempts = arrayValue(row.appliedTools)
      .map(objectValue)
      .filter((tool): tool is JsonRecord => Boolean(tool))
      .map(extractTableSideEffectAttempt)
      .filter((attempt): attempt is TablePacSideEffectAttempt => Boolean(attempt));
    const classified = classifyTablePacSideEffectRow({
      id,
      role,
      score: numberValue(row.afterScore),
      error: rowError(row),
      timedOut: rowTimedOut(row),
      attempts,
    });
    diagnostics.push({
      id,
      file,
      role,
      score: numberValue(row.afterScore),
      grade: stringValue(row.afterGrade),
      error: rowError(row),
      timedOut: rowTimedOut(row),
      attempts,
      ...classified,
    });
  }

  const byClassification = emptyClassificationCounts();
  const byFamily = emptyFamilyCounts();
  for (const row of diagnostics) {
    byClassification[row.classification] += 1;
    for (const family of row.sideEffectFamilies) byFamily[family] += 1;
  }
  const cleanupCandidates = diagnostics.filter(row => row.classification === 'side_effect_cleanup_candidate').map(row => row.id);
  const controlBlockers = diagnostics.filter(row => row.classification === 'control_side_effect_blocker').map(row => row.id);
  const wrongRefRows = diagnostics.filter(row => row.classification === 'wrong_ref_precondition').map(row => row.id);
  const candidateFamilies = diagnostics
    .filter(row => row.classification === 'side_effect_cleanup_candidate')
    .flatMap(row => row.sideEffectFamilies)
    .filter((family, index, array) => array.indexOf(family) === index);
  const controlFamilies = diagnostics
    .filter(row => row.classification === 'control_side_effect_blocker')
    .flatMap(row => row.sideEffectFamilies)
    .filter((family, index, array) => array.indexOf(family) === index);
  const reasons: string[] = [];
  if (cleanupCandidates.length < 2) reasons.push('fewer_than_two_side_effect_cleanup_candidates');
  if (wrongRefRows.length > 0) reasons.push('wrong_ref_precondition_still_present');
  if (controlBlockers.length > 0) reasons.push('controls_have_non_table_side_effects');
  if (candidateFamilies.length !== 1) reasons.push('candidate_side_effect_family_not_single');
  if (candidateFamilies.some(family => controlFamilies.includes(family))) reasons.push('candidate_family_also_hits_controls');
  const status = reasons.length === 0 ? 'plan_side_effect_cleanup_behavior' : 'diagnostic_only';

  return {
    generatedAt: new Date().toISOString(),
    run: args.run,
    outDir: args.outDir,
    summary: {
      rowCount: diagnostics.length,
      focusCount: diagnostics.filter(row => row.role === 'focus').length,
      controlCount: diagnostics.filter(row => row.role === 'control').length,
      byClassification,
      byFamily,
      cleanupCandidates,
      controlBlockers,
      wrongRefRows,
    },
    decision: {
      status,
      reasons: reasons.length > 0 ? reasons : ['single_family_focus_side_effect_cleanup_has_no_control_or_wrong_ref_blockers'],
    },
    rows: diagnostics,
  };
}

function renderMarkdown(report: TablePacSideEffectReport): string {
  const lines = [
    '# Table PAC Side-Effect Diagnostic',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Run: \`${report.run}\``,
    `- Decision: \`${report.decision.status}\``,
    `- Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ')}`,
    `- Rows: ${report.summary.rowCount} (${report.summary.focusCount} focus / ${report.summary.controlCount} control)`,
    `- Cleanup candidates: ${report.summary.cleanupCandidates.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Control blockers: ${report.summary.controlBlockers.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Wrong-ref rows: ${report.summary.wrongRefRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '## Families',
    '',
    '| Family | Rows |',
    '| --- | ---: |',
  ];
  for (const [family, count] of Object.entries(report.summary.byFamily)) {
    lines.push(`| \`${family}\` | ${count} |`);
  }
  lines.push('', '## Rows', '', '| Row | Role | Score | Classification | Families | Reasons |', '| --- | --- | ---: | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| \`${row.id}\` | ${row.role} | ${row.score ?? 'n/a'}/${row.grade ?? '?'} | \`${row.classification}\` | ${row.sideEffectFamilies.map(family => `\`${family}\``).join(', ') || ''} | ${row.reasons.map(reason => `\`${reason}\``).join(', ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await buildReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'table-pac-side-effect.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'table-pac-side-effect.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'table-pac-side-effect.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

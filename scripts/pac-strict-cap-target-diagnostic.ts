#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import type { CategoryKey, ScoreCapApplied, ScoredCategory } from '../src/types.js';

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-pac-strict-grader-fixed50-2026-05-08-r1';
const DEFAULT_FIVE_REVIEW = 'Output/review-five-a-pdfs-2026-05-08-r1/pac-gap-diagnostic';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-strict-cap-target-diagnostic-2026-05-08-r1';
const PAC_CAP_REASON_PREFIX = 'PAC rule failure: ';
const TARGET_SCORE = 90;

const PARKED_RUNTIME_IDS = new Set(['structure-4438']);
const ANALYZER_VOLATILITY_IDS = new Set(['structure-4076']);
const STRICT_CAP_MAX = 79;

export type StrictCapClassification =
  | 'repair_candidate'
  | 'already_high_grade'
  | 'runtime_or_parked_debt'
  | 'analyzer_volatility'
  | 'diagnostic_only'
  | 'needs_object_identity';

export interface FiveReviewRuleLink {
  ruleId: string;
  files: string[];
  buckets: string[];
  leafFamilies: string[];
}

export interface StrictCapTargetRow {
  runDir: string;
  fileId: string;
  file: string;
  cohort: string;
  ruleId: string;
  family: string;
  category: CategoryKey;
  cap: number;
  phase: 'after' | 'reanalyzed';
  score: number | null;
  grade: string | null;
  categoryScore: number | null;
  categoryApplicable: boolean | null;
  scoreGapTo90: number;
  lowScore: boolean;
  runtimeMs: number | null;
  appliedTools: string[];
  fiveReviewFiles: string[];
  fiveReviewBuckets: string[];
  fiveReviewLeafFamilies: string[];
  classification: StrictCapClassification;
  classificationReason: string;
}

export interface StrictCapRuleSummary {
  ruleId: string;
  family: string;
  category: CategoryKey;
  cap: number;
  count: number;
  fileCount: number;
  lowScoreCount: number;
  repairCandidateCount: number;
  alreadyHighGradeCount: number;
  parkedCount: number;
  analyzerVolatilityCount: number;
  needsObjectIdentityCount: number;
  fiveReviewFileCount: number;
  avgScoreGapTo90: number;
  files: string[];
  targetFiles: string[];
  recommendation: 'select_next' | 'track' | 'park' | 'diagnostic_only' | 'needs_object_identity';
}

export interface StrictCapFamilySummary {
  family: string;
  count: number;
  fileCount: number;
  lowScoreCount: number;
  repairCandidateCount: number;
  alreadyHighGradeCount: number;
  parkedCount: number;
  analyzerVolatilityCount: number;
  fiveReviewFileCount: number;
  avgScoreGapTo90: number;
  rules: string[];
  targetFiles: string[];
  recommendation: 'select_next' | 'track' | 'park' | 'diagnostic_only' | 'needs_object_identity';
}

export interface StrictCapTargetDiagnostic {
  generatedAt: string;
  runDirs: string[];
  fiveReviewSource: string | null;
  summary: {
    rowCount: number;
    strictCapRowCount: number;
    strictCapRuleCount: number;
    strictCapFamilyCount: number;
    repairCandidateCount: number;
    alreadyHighGradeCount: number;
    parkedRuntimeCount: number;
    analyzerVolatilityCount: number;
    diagnosticOnlyCount: number;
    needsObjectIdentityCount: number;
    selectedFamily: string | null;
    selectedRuleIds: string[];
    selectedTargetFiles: string[];
  };
  rows: StrictCapTargetRow[];
  ruleSummaries: StrictCapRuleSummary[];
  familySummaries: StrictCapFamilySummary[];
  fiveReviewRuleLinks: FiveReviewRuleLink[];
}

interface BuildInput {
  runDirs: string[];
  rowsByRun: Array<{ runDir: string; rows: RemediateBenchmarkRow[] }>;
  fiveReview?: unknown;
  fiveReviewSource?: string | null;
  generatedAt?: string;
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/pac-strict-cap-target-diagnostic.ts [--run <benchmark-run-dir>]... [--five-review <diagnostic-dir-or-json>] [--out <dir>]',
    '',
    `Defaults: --run ${DEFAULT_RUN} --five-review ${DEFAULT_FIVE_REVIEW} --out ${DEFAULT_OUT}`,
  ].join('\n');
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function pacRuleIdFromCap(cap: ScoreCapApplied): string | null {
  return cap.reason.startsWith(PAC_CAP_REASON_PREFIX)
    ? cap.reason.slice(PAC_CAP_REASON_PREFIX.length).trim()
    : null;
}

function effectiveScore(row: RemediateBenchmarkRow): number | null {
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function effectiveGrade(row: RemediateBenchmarkRow): string | null {
  return row.reanalyzedGrade ?? row.afterGrade ?? null;
}

function effectiveCaps(row: RemediateBenchmarkRow): { phase: 'after' | 'reanalyzed'; caps: ScoreCapApplied[] } {
  if (row.reanalyzedScoreCapsApplied?.length) {
    return { phase: 'reanalyzed', caps: row.reanalyzedScoreCapsApplied };
  }
  return { phase: 'after', caps: row.afterScoreCapsApplied ?? [] };
}

function effectiveCategories(row: RemediateBenchmarkRow): ScoredCategory[] {
  if (row.reanalyzedCategories?.length) return row.reanalyzedCategories;
  return row.afterCategories ?? [];
}

function categoryFor(row: RemediateBenchmarkRow, key: CategoryKey): { score: number | null; applicable: boolean | null } {
  const found = effectiveCategories(row).find(category => category.key === key);
  if (!found) return { score: null, applicable: null };
  return {
    score: typeof found.score === 'number' ? found.score : null,
    applicable: found.applicable !== false,
  };
}

function runtimeFor(row: RemediateBenchmarkRow): number | null {
  return row.wallRemediateMs ?? row.totalPipelineMs ?? row.runtimeSummary?.wallMs ?? null;
}

export function strictCapFamily(ruleId: string, category: CategoryKey): string {
  if (ruleId.startsWith('pdfua.table.')) return 'table_header_structure';
  if (ruleId.startsWith('pdfua.parent_tree.')) return 'parent_tree_structure';
  if (ruleId.startsWith('pdfua.structure.')) {
    if (ruleId.includes('parent_links') || ruleId.includes('mcr_objr') || ruleId.includes('rolemap') || ruleId.includes('child_roles')) {
      return 'structure_syntax';
    }
    return 'structure_elements';
  }
  if (ruleId.startsWith('pdfua.content.')) return 'content_tagging';
  if (ruleId.startsWith('pdfua.annotations.') || ruleId.startsWith('pdfua.annotation.')) return 'annotation_structure';
  if (ruleId.startsWith('pdfua.heading.')) return 'heading_structure';
  if (ruleId.startsWith('pdfua.list.')) return 'list_structure';
  if (ruleId.startsWith('pdfua.figure.')) return 'figure_alt_or_structure';
  if (ruleId.startsWith('pdfua.form.')) return 'form_accessibility';
  if (ruleId.startsWith('pdfua.metadata.') || ruleId.startsWith('pdfua.language.') || ruleId.startsWith('pdfua.settings.')) return 'baseline_pdfua_prerequisites';
  if (category === 'table_markup') return 'table_header_structure';
  return 'other_pac_strict_cap';
}

function hasExistingRepairCoverage(ruleId: string, category: CategoryKey): boolean {
  const family = strictCapFamily(ruleId, category);
  return [
    'table_header_structure',
    'annotation_structure',
    'heading_structure',
    'list_structure',
    'figure_alt_or_structure',
  ].includes(family);
}

function isStrictNumericCap(cap: ScoreCapApplied): boolean {
  return cap.cap <= STRICT_CAP_MAX;
}

function classificationFor(input: {
  row: RemediateBenchmarkRow;
  ruleId: string;
  category: CategoryKey;
  cap: ScoreCapApplied;
  score: number | null;
  categoryScore: number | null;
}): { classification: StrictCapClassification; reason: string } {
  const { row, ruleId, category, cap, score, categoryScore } = input;
  if (!isStrictNumericCap(cap)) {
    return { classification: 'diagnostic_only', reason: `PAC cap ${cap.cap} is a baseline/conservative cap, not a strict 79 blocker cap.` };
  }
  if (PARKED_RUNTIME_IDS.has(row.id) || row.error) {
    return { classification: 'runtime_or_parked_debt', reason: 'Row is parked runtime/checkpoint debt or errored in the benchmark.' };
  }
  if (ANALYZER_VOLATILITY_IDS.has(row.id)) {
    return { classification: 'analyzer_volatility', reason: 'Row is documented analyzer/table-applicability volatility and should not drive a fixer.' };
  }
  if (score !== null && score >= TARGET_SCORE) {
    return { classification: 'already_high_grade', reason: 'Strict PAC cap is present, but the row is already A-grade/high enough for remediation target selection.' };
  }
  if (hasExistingRepairCoverage(ruleId, category) && (score ?? 0) < TARGET_SCORE && (categoryScore === null || categoryScore < TARGET_SCORE)) {
    return { classification: 'repair_candidate', reason: 'Strict cap is score-moving, category-relevant, and maps to an existing deterministic repair family.' };
  }
  return { classification: 'needs_object_identity', reason: 'Strict cap is score-moving but needs stable object identity or a proven repair path before behavior.' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function extractFiveReviewRuleLinks(value: unknown): FiveReviewRuleLink[] {
  if (!isRecord(value) || !Array.isArray(value.files)) return [];
  const byRule = new Map<string, { files: Set<string>; buckets: Set<string>; leafFamilies: Set<string> }>();
  for (const file of value.files) {
    if (!isRecord(file)) continue;
    const fileId = typeof file.id === 'string' ? file.id : typeof file.pdf === 'string' ? file.pdf : 'unknown';
    const leafCoverage = Array.isArray(file.leafCoverage) ? file.leafCoverage : [];
    for (const leaf of leafCoverage) {
      if (!isRecord(leaf)) continue;
      const bucket = typeof leaf.bucket === 'string' ? leaf.bucket : '';
      const family = typeof leaf.family === 'string' ? leaf.family : '';
      const scoreInfluencingRuleIds = stringsFrom(leaf.scoreInfluencingRuleIds);
      const activeRules = Array.isArray(leaf.activeScoreInfluencingRules) ? leaf.activeScoreInfluencingRules : [];
      const activeIds = activeRules
        .filter(isRecord)
        .map(rule => (typeof rule.ruleId === 'string' ? rule.ruleId : ''))
        .filter(Boolean);
      for (const ruleId of sortedUnique([...scoreInfluencingRuleIds, ...activeIds])) {
        const current = byRule.get(ruleId) ?? { files: new Set<string>(), buckets: new Set<string>(), leafFamilies: new Set<string>() };
        current.files.add(fileId);
        if (bucket) current.buckets.add(bucket);
        if (family) current.leafFamilies.add(family);
        byRule.set(ruleId, current);
      }
    }
  }
  return [...byRule.entries()]
    .map(([ruleId, sets]) => ({
      ruleId,
      files: sortedUnique(sets.files),
      buckets: sortedUnique(sets.buckets),
      leafFamilies: sortedUnique(sets.leafFamilies),
    }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function fiveReviewLinkMap(links: FiveReviewRuleLink[]): Map<string, FiveReviewRuleLink> {
  return new Map(links.map(link => [link.ruleId, link]));
}

function rowKey(row: Pick<StrictCapTargetRow, 'runDir' | 'fileId' | 'ruleId' | 'category' | 'cap'>): string {
  return `${row.runDir}:${row.fileId}:${row.ruleId}:${row.category}:${row.cap}`;
}

export function buildStrictCapTargetDiagnostic(input: BuildInput): StrictCapTargetDiagnostic {
  const fiveReviewRuleLinks = extractFiveReviewRuleLinks(input.fiveReview);
  const reviewLinks = fiveReviewLinkMap(fiveReviewRuleLinks);
  const rows: StrictCapTargetRow[] = [];

  for (const run of input.rowsByRun) {
    for (const row of run.rows) {
      const score = effectiveScore(row);
      const grade = effectiveGrade(row);
      const { phase, caps } = effectiveCaps(row);
      for (const cap of caps) {
        const ruleId = pacRuleIdFromCap(cap);
        if (!ruleId) continue;
        const family = strictCapFamily(ruleId, cap.category);
        const categorySnapshot = categoryFor(row, cap.category);
        const reviewLink = reviewLinks.get(ruleId);
        const classification = classificationFor({
          row,
          ruleId,
          category: cap.category,
          cap,
          score,
          categoryScore: categorySnapshot.score,
        });
        rows.push({
          runDir: run.runDir,
          fileId: row.id,
          file: row.file,
          cohort: row.cohort,
          ruleId,
          family,
          category: cap.category,
          cap: cap.cap,
          phase,
          score,
          grade,
          categoryScore: categorySnapshot.score,
          categoryApplicable: categorySnapshot.applicable,
          scoreGapTo90: score === null ? 0 : Math.max(0, TARGET_SCORE - score),
          lowScore: score !== null && score < TARGET_SCORE,
          runtimeMs: runtimeFor(row),
          appliedTools: sortedUnique((row.appliedTools ?? []).map(tool => tool.toolName)),
          fiveReviewFiles: reviewLink?.files ?? [],
          fiveReviewBuckets: reviewLink?.buckets ?? [],
          fiveReviewLeafFamilies: reviewLink?.leafFamilies ?? [],
          classification: classification.classification,
          classificationReason: classification.reason,
        });
      }
    }
  }

  rows.sort((a, b) =>
    a.classification.localeCompare(b.classification)
    || a.family.localeCompare(b.family)
    || a.ruleId.localeCompare(b.ruleId)
    || a.fileId.localeCompare(b.fileId)
    || a.runDir.localeCompare(b.runDir),
  );

  const dedupedRows = [...new Map(rows.map(row => [rowKey(row), row])).values()];
  const ruleSummaries = summarizeByRule(dedupedRows);
  const familySummaries = summarizeByFamily(dedupedRows);
  const selectedFamily = familySummaries.find(summary => summary.recommendation === 'select_next') ?? null;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDirs: input.runDirs,
    fiveReviewSource: input.fiveReviewSource ?? null,
    summary: {
      rowCount: input.rowsByRun.reduce((sum, run) => sum + run.rows.length, 0),
      strictCapRowCount: dedupedRows.length,
      strictCapRuleCount: ruleSummaries.length,
      strictCapFamilyCount: familySummaries.length,
      repairCandidateCount: dedupedRows.filter(row => row.classification === 'repair_candidate').length,
      alreadyHighGradeCount: dedupedRows.filter(row => row.classification === 'already_high_grade').length,
      parkedRuntimeCount: dedupedRows.filter(row => row.classification === 'runtime_or_parked_debt').length,
      analyzerVolatilityCount: dedupedRows.filter(row => row.classification === 'analyzer_volatility').length,
      diagnosticOnlyCount: dedupedRows.filter(row => row.classification === 'diagnostic_only').length,
      needsObjectIdentityCount: dedupedRows.filter(row => row.classification === 'needs_object_identity').length,
      selectedFamily: selectedFamily?.family ?? null,
      selectedRuleIds: selectedFamily?.rules ?? [],
      selectedTargetFiles: selectedFamily?.targetFiles ?? [],
    },
    rows: dedupedRows,
    ruleSummaries,
    familySummaries,
    fiveReviewRuleLinks,
  };
}

function summarizeByRule(rows: StrictCapTargetRow[]): StrictCapRuleSummary[] {
  const groups = new Map<string, StrictCapTargetRow[]>();
  for (const row of rows) {
    const key = `${row.ruleId}:${row.category}:${row.cap}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .map(group => {
      const first = group[0]!;
      const summaryBase = summarizeRows(group);
      const recommendation = recommendationForSummary(summaryBase);
      return {
        ruleId: first.ruleId,
        family: first.family,
        category: first.category,
        cap: first.cap,
        ...summaryBase,
        recommendation,
      };
    })
    .sort(compareRuleSummaries);
}

function summarizeByFamily(rows: StrictCapTargetRow[]): StrictCapFamilySummary[] {
  const groups = new Map<string, StrictCapTargetRow[]>();
  for (const row of rows) groups.set(row.family, [...(groups.get(row.family) ?? []), row]);
  const summaries = [...groups.entries()]
    .map(([family, group]) => {
      const base = summarizeRows(group);
      return {
        family,
        count: base.count,
        fileCount: base.fileCount,
        lowScoreCount: base.lowScoreCount,
        repairCandidateCount: base.repairCandidateCount,
        alreadyHighGradeCount: base.alreadyHighGradeCount,
        parkedCount: base.parkedCount,
        analyzerVolatilityCount: base.analyzerVolatilityCount,
        fiveReviewFileCount: base.fiveReviewFileCount,
        avgScoreGapTo90: base.avgScoreGapTo90,
        rules: sortedUnique(group.map(row => row.ruleId)),
        targetFiles: base.targetFiles,
        recommendation: recommendationForSummary(base),
      };
    })
    .sort(compareFamilySummaries);
  const firstSelectable = summaries.find(summary => summary.recommendation === 'select_next');
  if (firstSelectable) {
    for (const summary of summaries) {
      if (summary !== firstSelectable && summary.recommendation === 'select_next') {
        summary.recommendation = 'track';
      }
    }
  }
  return summaries;
}

function summarizeRows(group: StrictCapTargetRow[]): Omit<StrictCapRuleSummary, 'ruleId' | 'family' | 'category' | 'cap' | 'recommendation'> {
  const repairRows = group.filter(row => row.classification === 'repair_candidate');
  const gaps = group.map(row => row.scoreGapTo90).filter(gap => gap > 0);
  return {
    count: group.length,
    fileCount: new Set(group.map(row => row.fileId)).size,
    lowScoreCount: group.filter(row => row.lowScore).length,
    repairCandidateCount: repairRows.length,
    alreadyHighGradeCount: group.filter(row => row.classification === 'already_high_grade').length,
    parkedCount: group.filter(row => row.classification === 'runtime_or_parked_debt').length,
    analyzerVolatilityCount: group.filter(row => row.classification === 'analyzer_volatility').length,
    needsObjectIdentityCount: group.filter(row => row.classification === 'needs_object_identity').length,
    fiveReviewFileCount: new Set(group.flatMap(row => row.fiveReviewFiles)).size,
    avgScoreGapTo90: gaps.length ? Number((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length).toFixed(2)) : 0,
    files: sortedUnique(group.map(row => row.fileId)),
    targetFiles: sortedUnique(repairRows.map(row => row.fileId)),
  };
}

function recommendationForSummary(summary: Pick<StrictCapRuleSummary, 'repairCandidateCount' | 'alreadyHighGradeCount' | 'parkedCount' | 'analyzerVolatilityCount' | 'needsObjectIdentityCount' | 'count'>): StrictCapRuleSummary['recommendation'] {
  if (summary.repairCandidateCount > 0) return 'select_next';
  if (summary.parkedCount === summary.count || summary.analyzerVolatilityCount === summary.count) return 'park';
  if (summary.needsObjectIdentityCount > 0) return 'needs_object_identity';
  if (summary.alreadyHighGradeCount === summary.count) return 'track';
  return 'diagnostic_only';
}

function compareRuleSummaries(a: StrictCapRuleSummary, b: StrictCapRuleSummary): number {
  return b.repairCandidateCount - a.repairCandidateCount
    || b.lowScoreCount - a.lowScoreCount
    || b.avgScoreGapTo90 - a.avgScoreGapTo90
    || b.fiveReviewFileCount - a.fiveReviewFileCount
    || b.count - a.count
    || a.ruleId.localeCompare(b.ruleId)
    || a.category.localeCompare(b.category);
}

function compareFamilySummaries(a: StrictCapFamilySummary, b: StrictCapFamilySummary): number {
  return b.repairCandidateCount - a.repairCandidateCount
    || b.lowScoreCount - a.lowScoreCount
    || b.avgScoreGapTo90 - a.avgScoreGapTo90
    || b.fiveReviewFileCount - a.fiveReviewFileCount
    || b.count - a.count
    || a.family.localeCompare(b.family);
}

function tableRow(values: Array<string | number | null | undefined>): string {
  return `| ${values.map(value => String(value ?? '')).join(' | ')} |`;
}

function renderList(values: string[], limit = 8): string {
  if (values.length === 0) return 'none';
  const shown = values.slice(0, limit).join(', ');
  return values.length > limit ? `${shown}, +${values.length - limit} more` : shown;
}

export function renderStrictCapTargetMarkdown(report: StrictCapTargetDiagnostic): string {
  const lines: string[] = [];
  lines.push('# PAC Strict-Cap Remediation Target Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Runs: ${report.runDirs.join(', ')}`);
  lines.push(`Five-PDF source: ${report.fiveReviewSource ?? 'not supplied'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Benchmark rows read: ${report.summary.rowCount}`);
  lines.push(`- PAC score-cap rows: ${report.summary.strictCapRowCount}`);
  lines.push(`- Repair candidates: ${report.summary.repairCandidateCount}`);
  lines.push(`- Already high-grade cap rows: ${report.summary.alreadyHighGradeCount}`);
  lines.push(`- Parked/runtime cap rows: ${report.summary.parkedRuntimeCount}`);
  lines.push(`- Analyzer-volatility cap rows: ${report.summary.analyzerVolatilityCount}`);
  lines.push(`- Needs object identity: ${report.summary.needsObjectIdentityCount}`);
  lines.push(`- Selected family: ${report.summary.selectedFamily ?? 'none'}`);
  lines.push(`- Selected target files: ${renderList(report.summary.selectedTargetFiles)}`);
  lines.push('');
  lines.push('## Family Ranking');
  lines.push('');
  lines.push(tableRow(['family', 'recommendation', 'count', 'files', 'low', 'repair', 'avg gap', 'five-PDF files', 'rules', 'targets']));
  lines.push(tableRow(['---', '---', '---:', '---:', '---:', '---:', '---:', '---:', '---', '---']));
  for (const summary of report.familySummaries) {
    lines.push(tableRow([
      summary.family,
      summary.recommendation,
      summary.count,
      summary.fileCount,
      summary.lowScoreCount,
      summary.repairCandidateCount,
      summary.avgScoreGapTo90,
      summary.fiveReviewFileCount,
      renderList(summary.rules, 4),
      renderList(summary.targetFiles, 6),
    ]));
  }
  lines.push('');
  lines.push('## Rule Ranking');
  lines.push('');
  lines.push(tableRow(['rule', 'category', 'cap', 'recommendation', 'count', 'low', 'repair', 'avg gap', 'five-PDF files', 'targets']));
  lines.push(tableRow(['---', '---', '---:', '---', '---:', '---:', '---:', '---:', '---:', '---']));
  for (const summary of report.ruleSummaries.slice(0, 30)) {
    lines.push(tableRow([
      summary.ruleId,
      summary.category,
      summary.cap,
      summary.recommendation,
      summary.count,
      summary.lowScoreCount,
      summary.repairCandidateCount,
      summary.avgScoreGapTo90,
      summary.fiveReviewFileCount,
      renderList(summary.targetFiles, 6),
    ]));
  }
  lines.push('');
  lines.push('## Repair Candidate Rows');
  lines.push('');
  lines.push(tableRow(['file', 'score', 'grade', 'rule', 'category', 'category score', 'family', 'five-PDF buckets']));
  lines.push(tableRow(['---', '---:', '---', '---', '---', '---:', '---', '---']));
  for (const row of report.rows.filter(item => item.classification === 'repair_candidate')) {
    lines.push(tableRow([
      row.fileId,
      row.score,
      row.grade,
      row.ruleId,
      row.category,
      row.categoryScore,
      row.family,
      renderList(row.fiveReviewBuckets, 4),
    ]));
  }
  lines.push('');
  lines.push('## Excluded Or Tracked Rows');
  lines.push('');
  lines.push(tableRow(['file', 'score', 'grade', 'rule', 'classification', 'reason']));
  lines.push(tableRow(['---', '---:', '---', '---', '---', '---']));
  for (const row of report.rows.filter(item => item.classification !== 'repair_candidate').slice(0, 50)) {
    lines.push(tableRow([row.fileId, row.score, row.grade, row.ruleId, row.classification, row.classificationReason]));
  }
  lines.push('');
  return lines.join('\n');
}

async function readJsonMaybe(path: string): Promise<unknown> {
  const resolved = resolve(path);
  const jsonPath = resolved.endsWith('.json') ? resolved : join(resolved, 'pac-review-gap-diagnostic.json');
  return JSON.parse(await readFile(jsonPath, 'utf8')) as unknown;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runs: string[] = [];
  let fiveReview = DEFAULT_FIVE_REVIEW;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run') runs.push(args[++index] ?? '');
    else if (arg === '--five-review') fiveReview = args[++index] ?? '';
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const runDirs = runs.filter(Boolean).length ? runs.filter(Boolean) : [DEFAULT_RUN];
  const loadedRuns = await Promise.all(runDirs.map(async runDir => {
    const loaded = await loadBenchmarkRowsFromRunDir(runDir);
    return { runDir, rows: loaded.remediateResults };
  }));
  const fiveReviewData = fiveReview ? await readJsonMaybe(fiveReview) : null;
  const report = buildStrictCapTargetDiagnostic({
    runDirs,
    rowsByRun: loadedRuns,
    fiveReview: fiveReviewData,
    fiveReviewSource: fiveReview || null,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-strict-cap-target-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-strict-cap-target-diagnostic.md'), renderStrictCapTargetMarkdown(report), 'utf8');
  console.log(`Wrote PAC strict-cap target diagnostic to ${outDir}`);
  console.log(`Selected family: ${report.summary.selectedFamily ?? 'none'}`);
  console.log(`Selected targets: ${report.summary.selectedTargetFiles.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

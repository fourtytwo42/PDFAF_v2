#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  type PacPromotionReadinessSummary,
} from './pac-promotion-readiness.js';
import type { CategoryKey } from '../src/types.js';
import type { PocStrongAreaFamily } from './poc-strong-areas-diagnostic.js';

const DEFAULT_OUT = 'Output/pac-promotion-readiness/rollup';

export type PacPromotionRollupDecision =
  | 'ready_for_scoring_candidate'
  | 'ready_for_gate_candidate'
  | 'needs_more_evidence'
  | 'diagnostic_only_optional';

export interface PacPromotionRollupSource {
  corpusId: string;
  path: string;
  summary: PacPromotionReadinessSummary;
}

export interface PacPromotionRollupRule {
  ruleId: string;
  family: PocStrongAreaFamily;
  category: CategoryKey;
  decision: PacPromotionRollupDecision;
  files: string[];
  corpusIds: string[];
  corpusFamilies: string[];
  verifiedFailCount: number;
  categoryPassGapCount: number;
  scoringCandidateCount: number;
  gateCandidateCount: number;
  noisyCount: number;
  blockedCount: number;
  diagnosticOnlyCount: number;
  originalExperimentGapCount: number;
}

export interface PacPromotionReadinessRollup {
  generatedAt: string;
  sourceCount: number;
  fileCount: number;
  scoringCandidates: PacPromotionRollupRule[];
  gateCandidates: PacPromotionRollupRule[];
  noisyRules: PacPromotionRollupRule[];
  blockedRules: PacPromotionRollupRule[];
  diagnosticOnlyRules: PacPromotionRollupRule[];
}

interface MutableRuleBucket extends Omit<PacPromotionRollupRule, 'decision' | 'files' | 'corpusIds' | 'corpusFamilies'> {
  files: Set<string>;
  corpusIds: Set<string>;
  corpusFamilies: Set<string>;
}

export function buildPacPromotionReadinessRollup(sources: PacPromotionRollupSource[]): PacPromotionReadinessRollup {
  const buckets = new Map<string, MutableRuleBucket>();
  let fileCount = 0;
  for (const source of sources) {
    fileCount += source.summary.fileCount;
    const corpusFamily = familyForCorpusId(source.corpusId);
    for (const row of source.summary.ruleRows) {
      const key = `${row.category}\u0000${row.ruleId}`;
      const bucket = buckets.get(key) ?? {
        ruleId: row.ruleId,
        family: row.family,
        category: row.category,
        files: new Set<string>(),
        corpusIds: new Set<string>(),
        corpusFamilies: new Set<string>(),
        verifiedFailCount: 0,
        categoryPassGapCount: 0,
        scoringCandidateCount: 0,
        gateCandidateCount: 0,
        noisyCount: 0,
        blockedCount: 0,
        diagnosticOnlyCount: 0,
        originalExperimentGapCount: 0,
      };
      const contributesEvidence = row.status !== 'pass' || row.noisy;
      if (contributesEvidence) {
        bucket.files.add(`${source.corpusId}:${row.fileId}`);
        bucket.corpusIds.add(source.corpusId);
        bucket.corpusFamilies.add(corpusFamily);
      }
      if (row.status === 'fail' && row.confidence === 'verified') bucket.verifiedFailCount += 1;
      if (row.categoryPassGap) bucket.categoryPassGapCount += 1;
      const scoringCandidateEvidence = row.scoringEligible ||
        (row.family === 'fonts_cmap' && row.categoryPassGap && row.status === 'fail' && row.confidence === 'verified');
      if (scoringCandidateEvidence) bucket.scoringCandidateCount += 1;
      if (row.gateEligible) bucket.gateCandidateCount += 1;
      if (row.noisy) bucket.noisyCount += 1;
      if (row.status === 'fail' && !scoringCandidateEvidence && !row.gateEligible) bucket.blockedCount += 1;
      if (row.readiness === 'diagnostic_only_optional') bucket.diagnosticOnlyCount += 1;
      if (row.categoryPassGap && source.corpusId === 'experiment-corpus') bucket.originalExperimentGapCount += 1;
      buckets.set(key, bucket);
    }
  }

  const rules = [...buckets.values()].map(freezeRule).sort(sortRollupRule);
  return {
    generatedAt: new Date().toISOString(),
    sourceCount: sources.length,
    fileCount,
    scoringCandidates: rules.filter(rule => rule.decision === 'ready_for_scoring_candidate').sort(sortPromotionRule),
    gateCandidates: rules.filter(isGateReady).sort(sortPromotionRule),
    noisyRules: rules.filter(rule => rule.noisyCount > 0).sort((a, b) => b.noisyCount - a.noisyCount || sortRollupRule(a, b)),
    blockedRules: rules.filter(rule => rule.blockedCount > 0).sort((a, b) => b.blockedCount - a.blockedCount || sortRollupRule(a, b)),
    diagnosticOnlyRules: rules.filter(rule => rule.decision === 'diagnostic_only_optional').sort(sortRollupRule),
  };
}

export function renderPacPromotionReadinessRollupMarkdown(rollup: PacPromotionReadinessRollup): string {
  const lines = [
    '# PAC Promotion Readiness Corpus Rollup',
    '',
    `Generated: \`${rollup.generatedAt}\``,
    `Readiness sources: ${rollup.sourceCount}`,
    `Files represented: ${rollup.fileCount}`,
    '',
    '## Decision',
    '',
    decisionText(rollup),
    '',
    '## Scoring-Cap Candidates',
    '',
  ];
  appendRollupTable(lines, rollup.scoringCandidates, 'No corpus-level scoring-cap candidates met the readiness threshold.');
  lines.push('## Remediation-Gate Candidates', '');
  appendRollupTable(lines, rollup.gateCandidates, 'No corpus-level remediation-gate candidates met the readiness threshold.');
  lines.push('## Noisy Or Manual-Review Evidence', '');
  appendRollupTable(lines, rollup.noisyRules.slice(0, 30), 'No noisy/manual-review evidence found.');
  lines.push('## Blocked Rules Needing Evidence', '');
  appendRollupTable(lines, rollup.blockedRules.slice(0, 30), 'No blocked fail rules found.');
  lines.push('## Optional Diagnostic Areas', '');
  appendRollupTable(
    lines,
    [...rollup.diagnosticOnlyRules, ...rollup.noisyRules]
      .filter(rule => rule.family === 'contrast_link_ai_placeholders')
      .sort(sortRollupRule)
      .slice(0, 30),
    'No optional contrast/link/AI rows found.',
  );
  lines.push(
    '## Next Stage Recommendation',
    '',
    rollup.scoringCandidates.length > 0 || rollup.gateCandidates.length > 0
      ? 'Use a separate behavior stage to promote only the listed verified candidates. Keep the existing 89-point cap model for scoring and regression-only logic for gates.'
      : 'Do not promote PAC rules yet. Add another evidence-hardening stage for the most frequent blocked/noisy rules before changing scoring or gates.',
    '',
    'Rendered contrast, link reachability, and AI visual-tag mismatch remain opt-in/manual-review because they depend on optional rendering, network, or semantic inference paths that are not deterministic enough for default scoring or acceptance gates.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function freezeRule(bucket: MutableRuleBucket): PacPromotionRollupRule {
  const base = {
    ...bucket,
    files: [...bucket.files].sort((a, b) => a.localeCompare(b)),
    corpusIds: [...bucket.corpusIds].sort((a, b) => a.localeCompare(b)),
    corpusFamilies: [...bucket.corpusFamilies].sort((a, b) => a.localeCompare(b)),
  };
  return { ...base, decision: decisionForRule(base) };
}

function decisionForRule(rule: Omit<PacPromotionRollupRule, 'decision'>): PacPromotionRollupDecision {
  const repeatedScoring = rule.scoringCandidateCount >= 2 && rule.corpusFamilies.length >= 2;
  const originalExperimentStructuralGap = rule.originalExperimentGapCount > 0 &&
    rule.scoringCandidateCount > 0 &&
    rule.family !== 'fonts_cmap';
  if (repeatedScoring || originalExperimentStructuralGap) return 'ready_for_scoring_candidate';
  if (isGateReady(rule)) return 'ready_for_gate_candidate';
  if (rule.verifiedFailCount === 0 && rule.blockedCount === 0 && rule.noisyCount === 0) return 'diagnostic_only_optional';
  return 'needs_more_evidence';
}

function isGateReady(rule: Pick<PacPromotionRollupRule, 'gateCandidateCount'>): boolean {
  return rule.gateCandidateCount >= 2;
}

function decisionText(rollup: PacPromotionReadinessRollup): string {
  if (rollup.scoringCandidates.length === 0 && rollup.gateCandidates.length === 0) {
    return 'No PAC rule met the corpus-level promotion threshold. This stage remains data-only and recommends evidence hardening before scoring or gate promotion.';
  }
  return 'Corpus evidence identified promotion candidates, but this stage remains data-only. The next stage should promote only the listed candidates through existing conservative scoring-cap or regression-gate paths.';
}

function appendRollupTable(lines: string[], rows: PacPromotionRollupRule[], emptyMessage: string): void {
  if (rows.length === 0) {
    lines.push(emptyMessage, '');
    return;
  }
  lines.push('| Family | Category | Rule | Decision | Files | Corpus families | Pass gaps | Scoring | Gates | Noisy | Blocked |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    lines.push(`| ${row.family} | ${row.category} | \`${row.ruleId}\` | ${row.decision} | ${row.files.length} | ${row.corpusFamilies.length} | ${row.categoryPassGapCount} | ${row.scoringCandidateCount} | ${row.gateCandidateCount} | ${row.noisyCount} | ${row.blockedCount} |`);
  }
  lines.push('');
}

function familyForCorpusId(corpusId: string): string {
  if (corpusId === 'experiment-corpus') return 'experiment';
  if (corpusId.includes('edge_mix')) return 'edge_mix';
  if (corpusId.includes('holdout')) return 'holdout';
  if (corpusId.includes('hard')) return 'hard';
  return corpusId;
}

function sortRollupRule(a: PacPromotionRollupRule, b: PacPromotionRollupRule): number {
  return a.family.localeCompare(b.family) ||
    a.category.localeCompare(b.category) ||
    a.ruleId.localeCompare(b.ruleId);
}

function sortPromotionRule(a: PacPromotionRollupRule, b: PacPromotionRollupRule): number {
  return b.scoringCandidateCount - a.scoringCandidateCount ||
    b.gateCandidateCount - a.gateCandidateCount ||
    b.categoryPassGapCount - a.categoryPassGapCount ||
    sortRollupRule(a, b);
}

function repeatedArg(name: string): string[] {
  const out: string[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) out.push(process.argv[index + 1]);
  }
  return out;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function corpusIdForPath(path: string): string {
  const parts = resolve(path).split('/');
  const readinessIndex = parts.lastIndexOf('readiness');
  if (readinessIndex > 0) return parts[readinessIndex - 1];
  const parent = basename(dirname(path));
  return parent === 'rollup' ? basename(path, '.json') : parent;
}

async function readSource(path: string): Promise<PacPromotionRollupSource> {
  const absolute = resolve(path);
  const summary = JSON.parse(await readFile(absolute, 'utf8')) as PacPromotionReadinessSummary;
  return { corpusId: corpusIdForPath(absolute), path: absolute, summary };
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/pac-promotion-readiness-rollup.ts --readiness <pac-promotion-readiness.json> [--readiness <...>] [--out <dir>]';
}

async function main(): Promise<void> {
  const readinessPaths = repeatedArg('--readiness');
  if (readinessPaths.length === 0) throw new Error(usage());
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const sources = await Promise.all(readinessPaths.map(readSource));
  const rollup = buildPacPromotionReadinessRollup(sources);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-promotion-readiness-rollup.json'), `${JSON.stringify(rollup, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-promotion-readiness-rollup.md'), renderPacPromotionReadinessRollupMarkdown(rollup), 'utf8');
  console.log(`Wrote PAC promotion readiness rollup for ${sources.length} source(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

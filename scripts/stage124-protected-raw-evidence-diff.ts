#!/usr/bin/env tsx
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PYTHON_SCRIPT_PATH, PYTHON_TIMEOUT_MS } from '../src/config.js';
import {
  protectedReanalysisUnsafeReason,
  sha256Buffer,
  type ProtectedReanalysisBaseline,
} from '../src/services/benchmark/protectedReanalysisSelection.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult } from '../src/types.js';

type JsonRecord = Record<string, unknown>;

export type Stage124CheckpointClass =
  | 'stable_floor_safe'
  | 'stable_below_floor'
  | 'raw_python_structural_variance'
  | 'raw_python_category_specific_variance'
  | 'typescript_scoring_variance'
  | 'no_safe_checkpoint_available';

type EvidenceFamily =
  | 'headings'
  | 'tables'
  | 'figures'
  | 'checkerFigureTargets'
  | 'paragraphStructElems'
  | 'orphanMcids'
  | 'mcidTextSpans'
  | 'annotationAccessibility'
  | 'linkScoringRows';

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  afterScore?: number;
  reanalyzedScore?: number;
  afterCategories?: AnalysisResult['categories'];
  reanalyzedCategories?: AnalysisResult['categories'];
  afterScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
  reanalyzedScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
}

interface ProtectedStateMetadata {
  rowId: string;
  file: string;
  reason: string;
  sequence: number;
  bufferSha256: string;
  score: number;
  grade: string;
  floorScore: number | null;
  floorReached: boolean;
  protectedRunSafe: boolean;
  appliedToolCount: number;
  categories: Record<string, number>;
}

export interface Stage124ExternalRepeat {
  repeat: number;
  score: number | null;
  grade?: string | null;
  protectedUnsafeReason: string | null;
  categories: Record<string, number>;
  runtimeMs?: number;
  error?: string;
}

export interface Stage124RawRepeat {
  repeat: number;
  signature: string | null;
  familySignatures: Partial<Record<EvidenceFamily, string>>;
  familyCounts: Partial<Record<EvidenceFamily, number>>;
  evidence?: Partial<Record<EvidenceFamily, JsonRecord[]>>;
  runtimeMs?: number;
  stderr?: string;
  error?: string;
}

interface FamilyDiff {
  family: EvidenceFamily;
  countRange: [number, number];
  signatureCount: number;
  stableCount: number;
  highOnly: JsonRecord[];
  lowOnly: JsonRecord[];
}

interface CheckpointReport {
  rowId: string;
  checkpoint: string;
  pdfPath: string;
  metadataPath: string;
  bufferSha256: string;
  metadata: ProtectedStateMetadata;
  classification: Stage124CheckpointClass;
  classificationReason: string;
  changedFamilies: EvidenceFamily[];
  correlatedCategories: string[];
  topCategorySwings: Array<{ category: string; min: number; max: number; range: number }>;
  familyDiffs: FamilyDiff[];
  externalRepeats: Stage124ExternalRepeat[];
  rawRepeats: Stage124RawRepeat[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-stage124-target-protected-2026-04-26-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage124-protected-raw-evidence-diff-2026-04-26-r1';
const DEFAULT_IDS = ['long-4516', 'short-4176', 'long-4683', 'structure-3775', 'font-4156', 'font-4172', 'font-4699'];
const DEFAULT_REPEATS = 5;
const EVIDENCE_FAMILIES: EvidenceFamily[] = [
  'headings',
  'tables',
  'figures',
  'checkerFigureTargets',
  'paragraphStructElems',
  'orphanMcids',
  'mcidTextSpans',
  'annotationAccessibility',
  'linkScoringRows',
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage124-protected-raw-evidence-diff.ts [options]',
    `  --run <dir>           Run dir with protected-states artifacts (default: ${DEFAULT_RUN})`,
    `  --baseline-run <dir>  Stage 42 protected baseline (default: ${DEFAULT_BASELINE_RUN})`,
    `  --out <dir>           Output directory (default: ${DEFAULT_OUT})`,
    `  --ids <csv>           Row ids (default: ${DEFAULT_IDS.join(',')})`,
    '  --repeats <n>         External/Python repeat count, capped at 5 (default: 5)',
  ].join('\n');
}

function parseArgs(argv: string[]): {
  runDir: string;
  baselineRun: string;
  out: string;
  ids: string[];
  repeats: number;
} {
  const args = {
    runDir: DEFAULT_RUN,
    baselineRun: DEFAULT_BASELINE_RUN,
    out: DEFAULT_OUT,
    ids: DEFAULT_IDS,
    repeats: DEFAULT_REPEATS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--run') args.runDir = next;
    else if (arg === '--baseline-run') args.baselineRun = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--repeats') args.repeats = Math.max(1, Math.min(5, Number.parseInt(next, 10) || DEFAULT_REPEATS));
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signature(value: unknown): string {
  return createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 20);
}

function categoryMap(categories: AnalysisResult['categories'] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? []).map(category => [category.key, category.score]));
}

function normalizeText(value: unknown, limit = 160): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, limit) : undefined;
}

function pickNumber(value: JsonRecord, key: string): number | undefined {
  const raw = value[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function pickBool(value: JsonRecord, key: string): boolean | undefined {
  const raw = value[key];
  return typeof raw === 'boolean' ? raw : undefined;
}

function pickString(value: JsonRecord, key: string): string | undefined {
  const raw = value[key];
  return raw == null ? undefined : String(raw);
}

function compactRecord(value: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

function parentPath(value: JsonRecord): string[] | undefined {
  const raw = value['parentPath'];
  return Array.isArray(raw) ? raw.map(item => String(item)).slice(0, 8) : undefined;
}

function evidenceArray(raw: JsonRecord, key: EvidenceFamily): JsonRecord[] {
  if (key === 'annotationAccessibility') {
    const annotation = raw['annotationAccessibility'];
    return annotation && typeof annotation === 'object' && !Array.isArray(annotation)
      ? [annotation as JsonRecord]
      : [];
  }
  const value = raw[key];
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
}

function normalizeEvidenceItem(family: EvidenceFamily, item: JsonRecord): JsonRecord {
  if (family === 'headings') {
    return compactRecord({
      structRef: pickString(item, 'structRef'),
      level: pickNumber(item, 'level'),
      page: pickNumber(item, 'page'),
      text: normalizeText(item['text']),
      parentPath: parentPath(item),
    });
  }
  if (family === 'tables') {
    return compactRecord({
      structRef: pickString(item, 'structRef'),
      page: pickNumber(item, 'page'),
      hasHeaders: pickBool(item, 'hasHeaders'),
      headerCount: pickNumber(item, 'headerCount'),
      totalCells: pickNumber(item, 'totalCells'),
      rowCount: pickNumber(item, 'rowCount'),
      cellsMisplacedCount: pickNumber(item, 'cellsMisplacedCount'),
      irregularRows: pickNumber(item, 'irregularRows'),
      dominantColumnCount: pickNumber(item, 'dominantColumnCount'),
      reachable: pickBool(item, 'reachable'),
      directContent: pickBool(item, 'directContent'),
      subtreeMcidCount: pickNumber(item, 'subtreeMcidCount'),
      parentPath: parentPath(item),
    });
  }
  if (family === 'figures' || family === 'checkerFigureTargets') {
    return compactRecord({
      structRef: pickString(item, 'structRef'),
      page: pickNumber(item, 'page'),
      role: pickString(item, 'role'),
      rawRole: pickString(item, 'rawRole'),
      resolvedRole: pickString(item, 'resolvedRole'),
      hasAlt: pickBool(item, 'hasAlt'),
      altText: normalizeText(item['altText'], 120),
      isArtifact: pickBool(item, 'isArtifact'),
      reachable: pickBool(item, 'reachable'),
      directContent: pickBool(item, 'directContent'),
      subtreeMcidCount: pickNumber(item, 'subtreeMcidCount'),
      evidenceState: pickString(item, 'evidenceState'),
      parentPath: parentPath(item),
    });
  }
  if (family === 'paragraphStructElems') {
    return compactRecord({
      structRef: pickString(item, 'structRef'),
      tag: pickString(item, 'tag'),
      page: pickNumber(item, 'page'),
      text: normalizeText(item['text']),
      reachable: pickBool(item, 'reachable'),
      directContent: pickBool(item, 'directContent'),
      subtreeMcidCount: pickNumber(item, 'subtreeMcidCount'),
      evidenceState: pickString(item, 'evidenceState'),
      parentPath: parentPath(item),
    });
  }
  if (family === 'orphanMcids') {
    return compactRecord({
      page: pickNumber(item, 'page'),
      mcid: pickNumber(item, 'mcid'),
    });
  }
  if (family === 'mcidTextSpans') {
    return compactRecord({
      page: pickNumber(item, 'page'),
      mcid: pickNumber(item, 'mcid'),
      snippet: normalizeText(item['snippet'], 120),
    });
  }
  if (family === 'linkScoringRows') {
    return compactRecord({
      page: pickNumber(item, 'page'),
      subtype: pickString(item, 'subtype'),
      effectiveText: normalizeText(item['effectiveText'], 120),
      contents: normalizeText(item['contents'], 120),
      uri: normalizeText(item['uri'], 120),
      hasStructParent: pickBool(item, 'hasStructParent'),
      hasStructure: pickBool(item, 'hasStructure'),
    });
  }
  return compactRecord(Object.fromEntries(Object.entries(item).sort()));
}

function normalizedEvidence(raw: JsonRecord): Record<EvidenceFamily, JsonRecord[]> {
  return Object.fromEntries(EVIDENCE_FAMILIES.map(family => {
    const rows = evidenceArray(raw, family).map(item => normalizeEvidenceItem(family, item));
    rows.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    return [family, rows];
  })) as Record<EvidenceFamily, JsonRecord[]>;
}

function evidenceSignatures(evidence: Record<EvidenceFamily, JsonRecord[]>): Record<EvidenceFamily, string> {
  return Object.fromEntries(EVIDENCE_FAMILIES.map(family => [family, signature(evidence[family])])) as Record<EvidenceFamily, string>;
}

function evidenceCounts(evidence: Record<EvidenceFamily, JsonRecord[]>): Record<EvidenceFamily, number> {
  return Object.fromEntries(EVIDENCE_FAMILIES.map(family => [family, evidence[family].length])) as Record<EvidenceFamily, number>;
}

async function readBaselineRows(runDir: string): Promise<Map<string, ProtectedReanalysisBaseline>> {
  const rows = JSON.parse(await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
  const out = new Map<string, ProtectedReanalysisBaseline>();
  for (const row of rows) {
    const id = String(row.id ?? row.publicationId ?? '');
    const score = row.reanalyzedScore ?? row.afterScore;
    if (!id || typeof score !== 'number' || !Number.isFinite(score)) continue;
    const categories = row.reanalyzedCategories?.length ? row.reanalyzedCategories : row.afterCategories ?? [];
    out.set(id, {
      score,
      scoreCapsApplied: row.reanalyzedScoreCapsApplied?.length ? row.reanalyzedScoreCapsApplied : row.afterScoreCapsApplied ?? [],
      categories: categoryMap(categories),
    });
  }
  return out;
}

async function listCheckpoints(runDir: string, id: string): Promise<Array<{ pdfPath: string; metadataPath: string; metadata: ProtectedStateMetadata }>> {
  const dir = join(resolve(runDir), 'protected-states', id);
  const names = await readdir(dir).catch(() => []);
  const metadataNames = names.filter(name => name.endsWith('.json')).sort();
  const out = [];
  for (const name of metadataNames) {
    const metadataPath = join(dir, name);
    const pdfPath = join(dir, name.replace(/\.json$/, '.pdf'));
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as ProtectedStateMetadata;
    out.push({ pdfPath, metadataPath, metadata });
  }
  return out;
}

async function analyzeExternalRepeat(input: {
  pdfPath: string;
  filename: string;
  repeat: number;
  baseline?: ProtectedReanalysisBaseline;
}): Promise<Stage124ExternalRepeat> {
  const started = Date.now();
  try {
    const analyzed = await analyzePdf(input.pdfPath, input.filename, { bypassCache: true });
    return {
      repeat: input.repeat,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      protectedUnsafeReason: input.baseline
        ? protectedReanalysisUnsafeReason({ baseline: input.baseline, analysis: analyzed.result })
        : 'protected_baseline_missing',
      categories: categoryMap(analyzed.result.categories),
      runtimeMs: Date.now() - started,
    };
  } catch (error) {
    return {
      repeat: input.repeat,
      score: null,
      grade: null,
      protectedUnsafeReason: 'analysis_failed',
      categories: {},
      runtimeMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPythonRaw(pdfPath: string, repeat: number): Promise<Stage124RawRepeat> {
  const started = Date.now();
  return new Promise(resolveRun => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (result: Stage124RawRepeat) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun(result);
    };
    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, pdfPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({ repeat, signature: null, familySignatures: {}, familyCounts: {}, runtimeMs: Date.now() - started, stderr, error: `timeout_${PYTHON_TIMEOUT_MS}ms` });
    }, PYTHON_TIMEOUT_MS);
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => {
      done({ repeat, signature: null, familySignatures: {}, familyCounts: {}, runtimeMs: Date.now() - started, stderr, error: error.message });
    });
    proc.on('close', code => {
      if (settled) return;
      try {
        const raw = JSON.parse(stdout) as JsonRecord;
        const evidence = normalizedEvidence(raw);
        const familySignatures = evidenceSignatures(evidence);
        done({
          repeat,
          runtimeMs: Date.now() - started,
          signature: signature(familySignatures),
          familySignatures,
          familyCounts: evidenceCounts(evidence),
          evidence,
          stderr,
          ...(code === 0 ? {} : { error: `python_exit_${code}` }),
        });
      } catch (error) {
        done({
          repeat,
          signature: null,
          familySignatures: {},
          familyCounts: {},
          runtimeMs: Date.now() - started,
          stderr,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}

function range(values: number[]): { min: number; max: number; range: number } | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, range: max - min };
}

function changedFamilies(rawRepeats: Stage124RawRepeat[]): EvidenceFamily[] {
  return EVIDENCE_FAMILIES.filter(family => {
    const signatures = rawRepeats
      .filter(repeat => !repeat.error && repeat.familySignatures[family])
      .map(repeat => repeat.familySignatures[family]);
    return signatures.length >= 2 && new Set(signatures).size > 1;
  });
}

function topCategorySwings(externalRepeats: Stage124ExternalRepeat[]): Array<{ category: string; min: number; max: number; range: number }> {
  const categories = new Set<string>();
  for (const repeat of externalRepeats) {
    for (const category of Object.keys(repeat.categories)) categories.add(category);
  }
  return [...categories].map(category => {
    const values = externalRepeats
      .map(repeat => repeat.categories[category])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const valuesRange = range(values) ?? { min: 0, max: 0, range: 0 };
    return { category, ...valuesRange };
  }).filter(row => row.range > 0).sort((a, b) => b.range - a.range || a.category.localeCompare(b.category));
}

function categoryFamilies(category: string): EvidenceFamily[] {
  if (category === 'table_markup') return ['tables'];
  if (category === 'heading_structure') return ['headings', 'paragraphStructElems'];
  if (category === 'alt_text') return ['figures', 'checkerFigureTargets'];
  if (category === 'link_quality') return ['annotationAccessibility', 'linkScoringRows'];
  if (category === 'reading_order') return ['paragraphStructElems', 'orphanMcids', 'mcidTextSpans', 'annotationAccessibility', 'linkScoringRows'];
  if (category === 'pdf_ua_compliance') return [...EVIDENCE_FAMILIES];
  return [];
}

function correlatedCategories(changed: EvidenceFamily[], swings: Array<{ category: string; range: number }>): string[] {
  const changedSet = new Set(changed);
  return swings
    .filter(swing => categoryFamilies(swing.category).some(family => changedSet.has(family)))
    .map(swing => swing.category);
}

export function classifyStage124Checkpoint(input: {
  floorScore: number | null;
  inRunScore: number | null;
  externalRepeats: Stage124ExternalRepeat[];
  rawRepeats: Stage124RawRepeat[];
}): {
  classification: Stage124CheckpointClass;
  reason: string;
  changedFamilies: EvidenceFamily[];
  correlatedCategories: string[];
  topCategorySwings: Array<{ category: string; min: number; max: number; range: number }>;
} {
  const externalSuccess = input.externalRepeats.filter(repeat => repeat.score != null);
  if (externalSuccess.length === 0 || input.floorScore == null) {
    return {
      classification: 'no_safe_checkpoint_available',
      reason: externalSuccess.length === 0 ? 'no_successful_external_repeats' : 'protected_floor_missing',
      changedFamilies: changedFamilies(input.rawRepeats),
      correlatedCategories: [],
      topCategorySwings: [],
    };
  }
  const changed = changedFamilies(input.rawRepeats);
  const swings = topCategorySwings(externalSuccess);
  const correlated = correlatedCategories(changed, swings);
  const scores = externalSuccess.map(repeat => repeat.score).filter((score): score is number => typeof score === 'number');
  const scoreRange = range(scores)?.range ?? 0;
  const unsafeReasons = new Set(externalSuccess.map(repeat => repeat.protectedUnsafeReason ?? 'safe'));
  const floorSafeCount = externalSuccess.filter(repeat => repeat.protectedUnsafeReason === null).length;

  if (changed.length > 0) {
    if (scoreRange > 0 || swings.length > 0 || unsafeReasons.size > 1) {
      if (correlated.length > 0) {
        return {
          classification: 'raw_python_category_specific_variance',
          reason: `families=${changed.join(',')};categories=${correlated.join(',')}`,
          changedFamilies: changed,
          correlatedCategories: correlated,
          topCategorySwings: swings,
        };
      }
      return {
        classification: 'raw_python_structural_variance',
        reason: `families=${changed.join(',')};score_range=${scoreRange}`,
        changedFamilies: changed,
        correlatedCategories: correlated,
        topCategorySwings: swings,
      };
    }
    return {
      classification: 'raw_python_structural_variance',
      reason: `families=${changed.join(',')};score_stable`,
      changedFamilies: changed,
      correlatedCategories: correlated,
      topCategorySwings: swings,
    };
  }

  if (scoreRange > 0 || swings.length > 0 || unsafeReasons.size > 1) {
    return {
      classification: 'typescript_scoring_variance',
      reason: `score_range=${scoreRange};category_swings=${swings.map(swing => swing.category).join(',') || 'none'}`,
      changedFamilies: changed,
      correlatedCategories: correlated,
      topCategorySwings: swings,
    };
  }

  if (floorSafeCount === externalSuccess.length) {
    return {
      classification: 'stable_floor_safe',
      reason: `external_scores=${scores.join(',')}`,
      changedFamilies: changed,
      correlatedCategories: correlated,
      topCategorySwings: swings,
    };
  }

  return {
    classification: 'stable_below_floor',
    reason: `external_scores=${scores.join(',')}`,
    changedFamilies: changed,
    correlatedCategories: correlated,
    topCategorySwings: swings,
  };
}

function evidenceKeys(items: JsonRecord[] | undefined): Set<string> {
  return new Set((items ?? []).map(item => stableStringify(item)));
}

function itemFromKey(key: string): JsonRecord {
  try {
    return JSON.parse(key) as JsonRecord;
  } catch {
    return { key };
  }
}

function unionSets(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const set of sets) {
    for (const value of set) out.add(value);
  }
  return out;
}

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  const out = new Set(sets[0]);
  for (const set of sets.slice(1)) {
    for (const value of [...out]) {
      if (!set.has(value)) out.delete(value);
    }
  }
  return out;
}

function diffFamily(input: {
  family: EvidenceFamily;
  externalRepeats: Stage124ExternalRepeat[];
  rawRepeats: Stage124RawRepeat[];
}): FamilyDiff {
  const counts = input.rawRepeats
    .map(repeat => input.family in repeat.familyCounts ? repeat.familyCounts[input.family] : undefined)
    .filter((count): count is number => typeof count === 'number');
  const countRange = range(counts) ?? { min: 0, max: 0, range: 0 };
  const signatures = input.rawRepeats
    .map(repeat => repeat.familySignatures[input.family])
    .filter((value): value is string => Boolean(value));
  const scoreValues = input.externalRepeats
    .map(repeat => repeat.score)
    .filter((score): score is number => typeof score === 'number');
  const minScore = scoreValues.length > 0 ? Math.min(...scoreValues) : null;
  const maxScore = scoreValues.length > 0 ? Math.max(...scoreValues) : null;
  const rawByRepeat = new Map(input.rawRepeats.map(repeat => [repeat.repeat, repeat]));
  const highRepeatSets = input.externalRepeats
    .filter(repeat => repeat.score === maxScore)
    .map(repeat => evidenceKeys(rawByRepeat.get(repeat.repeat)?.evidence?.[input.family]));
  const lowRepeatSets = input.externalRepeats
    .filter(repeat => repeat.score === minScore)
    .map(repeat => evidenceKeys(rawByRepeat.get(repeat.repeat)?.evidence?.[input.family]));
  const highUnion = unionSets(highRepeatSets);
  const lowUnion = unionSets(lowRepeatSets);
  const highOnly = [...highUnion].filter(key => !lowUnion.has(key)).slice(0, 12).map(itemFromKey);
  const lowOnly = [...lowUnion].filter(key => !highUnion.has(key)).slice(0, 12).map(itemFromKey);
  const allSets = input.rawRepeats.map(repeat => evidenceKeys(repeat.evidence?.[input.family]));

  return {
    family: input.family,
    countRange: [countRange.min, countRange.max],
    signatureCount: new Set(signatures).size,
    stableCount: intersectSets(allSets).size,
    highOnly,
    lowOnly,
  };
}

async function buildCheckpointReport(input: {
  rowId: string;
  checkpoint: { pdfPath: string; metadataPath: string; metadata: ProtectedStateMetadata };
  baseline?: ProtectedReanalysisBaseline;
  repeats: number;
}): Promise<CheckpointReport> {
  const buffer = await readFile(input.checkpoint.pdfPath);
  const bufferSha256 = sha256Buffer(buffer);
  const externalRepeats: Stage124ExternalRepeat[] = [];
  const rawRepeats: Stage124RawRepeat[] = [];
  for (let repeat = 1; repeat <= input.repeats; repeat += 1) {
    externalRepeats.push(await analyzeExternalRepeat({
      pdfPath: input.checkpoint.pdfPath,
      filename: basename(input.checkpoint.pdfPath),
      repeat,
      baseline: input.baseline,
    }));
    rawRepeats.push(await runPythonRaw(input.checkpoint.pdfPath, repeat));
  }
  const classification = classifyStage124Checkpoint({
    floorScore: input.checkpoint.metadata.floorScore,
    inRunScore: input.checkpoint.metadata.score,
    externalRepeats,
    rawRepeats,
  });
  const familyDiffs = EVIDENCE_FAMILIES
    .map(family => diffFamily({ family, externalRepeats, rawRepeats }))
    .filter(diff => diff.signatureCount > 1 || diff.countRange[0] !== diff.countRange[1] || diff.highOnly.length > 0 || diff.lowOnly.length > 0);

  return {
    rowId: input.rowId,
    checkpoint: basename(input.checkpoint.pdfPath, '.pdf'),
    pdfPath: input.checkpoint.pdfPath,
    metadataPath: input.checkpoint.metadataPath,
    bufferSha256,
    metadata: input.checkpoint.metadata,
    classification: classification.classification,
    classificationReason: classification.reason,
    changedFamilies: classification.changedFamilies,
    correlatedCategories: classification.correlatedCategories,
    topCategorySwings: classification.topCategorySwings,
    familyDiffs,
    externalRepeats,
    rawRepeats,
  };
}

function summarizeEvidenceItem(item: JsonRecord): string {
  const preferred = ['structRef', 'page', 'level', 'tag', 'role', 'resolvedRole', 'hasAlt', 'hasHeaders', 'headerCount', 'totalCells', 'mcid', 'effectiveText', 'text'];
  const pairs = preferred
    .filter(key => item[key] !== undefined)
    .map(key => `${key}=${String(Array.isArray(item[key]) ? (item[key] as unknown[]).join('/') : item[key]).slice(0, 70)}`);
  return pairs.length > 0 ? pairs.join(';') : stableStringify(item).slice(0, 160);
}

function renderMarkdown(report: { runDir: string; baselineRun: string; rows: CheckpointReport[] }): string {
  const lines = [
    '# Stage 124 Protected Raw Evidence Diff',
    '',
    `- Run: \`${report.runDir}\``,
    `- Baseline: \`${report.baselineRun}\``,
    '',
    '| Row | Checkpoint | In-run | External scores | Class | Changed families | Top category swings |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      row.rowId,
      row.checkpoint,
      row.metadata.score,
      row.externalRepeats.map(repeat => repeat.score ?? 'err').join(', '),
      row.classification,
      row.changedFamilies.join(', ') || 'none',
      row.topCategorySwings.slice(0, 4).map(swing => `${swing.category}:${swing.min}->${swing.max}`).join(', ') || 'none',
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('', '## Evidence Diffs', '');
  for (const row of report.rows.filter(row => row.familyDiffs.length > 0)) {
    lines.push(`### ${row.rowId} / ${row.checkpoint}`, '');
    for (const diff of row.familyDiffs) {
      lines.push(`- ${diff.family}: count ${diff.countRange[0]}-${diff.countRange[1]}, signatures ${diff.signatureCount}, stable ${diff.stableCount}`);
      if (diff.highOnly.length > 0) {
        lines.push(`  - high-only: ${diff.highOnly.slice(0, 3).map(summarizeEvidenceItem).join(' | ')}`);
      }
      if (diff.lowOnly.length > 0) {
        lines.push(`  - low-only: ${diff.lowOnly.slice(0, 3).map(summarizeEvidenceItem).join(' | ')}`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baselineRows = await readBaselineRows(args.baselineRun);
  const rows: CheckpointReport[] = [];
  for (const id of args.ids) {
    const checkpoints = await listCheckpoints(args.runDir, id);
    for (const checkpoint of checkpoints) {
      const row = await buildCheckpointReport({
        rowId: id,
        checkpoint,
        baseline: baselineRows.get(id),
        repeats: args.repeats,
      });
      rows.push(row);
      console.log(`${id}/${row.checkpoint}: ${row.classification} (${row.classificationReason})`);
    }
  }
  const out = resolve(args.out);
  const report = {
    generatedAt: new Date().toISOString(),
    runDir: resolve(args.runDir),
    baselineRun: resolve(args.baselineRun),
    repeats: args.repeats,
    pythonScriptPath: PYTHON_SCRIPT_PATH,
    rows,
  };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage124-protected-raw-evidence-diff.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage124-protected-raw-evidence-diff.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

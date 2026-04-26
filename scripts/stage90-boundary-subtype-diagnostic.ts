#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
type SourceName = 'stage87' | 'stage88' | 'stage89';
type BoundarySubtype =
  | 'contentless_reachable_boundary'
  | 'unreachable_content_bearing_boundary'
  | 'mixed_boundary';
type BoundaryStability =
  | 'stable_across_all_reports'
  | 'stable_but_intermittent'
  | 'mixed_across_reports';

interface BoundaryGroupSnapshot {
  source: SourceName;
  rowId: string;
  groupKey: string;
  repeatIndexes: number[];
  subtype: BoundarySubtype;
  merged: {
    reachable: boolean | null;
    directContent: boolean | null;
    subtreeMcidCount: number | null;
    parentPath: string[];
  };
}

interface SourceSummary {
  source: SourceName;
  input: string;
  boundaryRowCount: number;
  boundaryGroupCount: number;
  stableSubtypes: string[];
  intermittentRows: string[];
}

interface BoundaryGroupSummary {
  rowId: string;
  groupKey: string;
  subtype: BoundarySubtype;
  stability: BoundaryStability;
  presentSources: SourceName[];
  missingSources: SourceName[];
  repeatIndexesBySource: Partial<Record<SourceName, number[]>>;
  mergedBySource: Partial<Record<SourceName, BoundaryGroupSnapshot['merged']>>;
  decisionReason: string;
}

interface Stage90Report {
  generatedAt: string;
  inputs: Record<SourceName, string>;
  sourceSummaries: SourceSummary[];
  boundaryGroups: BoundaryGroupSummary[];
  counts: {
    totalBoundaryGroups: number;
    stableContentlessReachableGroups: number;
    intermittentUnreachableContentBearingGroups: number;
    mixedGroups: number;
  };
  decision: {
    classification: 'diagnostic_only';
    recommendedNextStage: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage90-boundary-subtype-diagnostic-2026-04-26-r1';
const DEFAULT_STAGE87 = 'Output/experiment-corpus-baseline/stage87-boundary-repeat-diagnostic-2026-04-26-r1/stage86-checker-evidence-classifier.json';
const DEFAULT_STAGE88 = 'Output/experiment-corpus-baseline/stage88-boundary-repeat-diagnostic-2026-04-26-r1/stage86-checker-evidence-classifier.json';
const DEFAULT_STAGE89 = 'Output/experiment-corpus-baseline/stage89-boundary-repeat-diagnostic-2026-04-26-r1/stage86-checker-evidence-classifier.json';

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage90-boundary-subtype-diagnostic.ts [options]',
    `  --out <dir>        Default: ${DEFAULT_OUT}`,
    `  --stage87 <path>   Default: ${DEFAULT_STAGE87}`,
    `  --stage88 <path>   Default: ${DEFAULT_STAGE88}`,
    `  --stage89 <path>   Default: ${DEFAULT_STAGE89}`,
  ].join('\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const args = {
    out: DEFAULT_OUT,
    stage87: DEFAULT_STAGE87,
    stage88: DEFAULT_STAGE88,
    stage89: DEFAULT_STAGE89,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--out') args.out = next;
    else if (arg === '--stage87') args.stage87 = next;
    else if (arg === '--stage88') args.stage88 = next;
    else if (arg === '--stage89') args.stage89 = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
}

async function readJson(path: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as JsonRecord;
}

function arr(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function rowId(row: JsonRecord): string {
  return str(row['id']) || str(row['publicationId']) || str(row['file']);
}

function boundarySubtype(merged: JsonRecord): BoundarySubtype {
  const reachable = bool(merged['reachable']);
  const directContent = bool(merged['directContent']);
  const subtreeMcidCount = num(merged['subtreeMcidCount']) ?? 0;
  if (reachable === true && directContent === false && subtreeMcidCount === 0) return 'contentless_reachable_boundary';
  if (reachable === false && directContent === true && subtreeMcidCount > 0) return 'unreachable_content_bearing_boundary';
  return 'mixed_boundary';
}

function mergedShape(merged: JsonRecord): BoundaryGroupSnapshot['merged'] {
  return {
    reachable: bool(merged['reachable']),
    directContent: bool(merged['directContent']),
    subtreeMcidCount: num(merged['subtreeMcidCount']),
    parentPath: Array.isArray(merged['parentPath']) ? merged['parentPath'].map(String) : [],
  };
}

function extractBoundaryGroups(report: JsonRecord, source: SourceName): BoundaryGroupSnapshot[] {
  const rows = arr(report['rows']);
  const groups: BoundaryGroupSnapshot[] = [];
  for (const row of rows) {
    const id = rowId(row);
    for (const group of arr(row['paragraphGroups'])) {
      if (str(group['classification']) !== 'boundary_candidate') continue;
      const merged = group['merged'] && typeof group['merged'] === 'object' ? group['merged'] as JsonRecord : {};
      groups.push({
        source,
        rowId: id,
        groupKey: str(group['key']),
        repeatIndexes: Array.isArray(group['repeatIndexes']) ? group['repeatIndexes'].filter(item => typeof item === 'number' && Number.isFinite(item)) as number[] : [],
        subtype: boundarySubtype(merged),
        merged: mergedShape(merged),
      });
    }
  }
  return groups;
}

function uniqueSorted<T>(items: T[]): T[] {
  return [...new Set(items)].sort() as T[];
}

function summarizeSource(source: SourceName, input: string, groups: BoundaryGroupSnapshot[]): SourceSummary {
  const sourceGroups = groups.filter(group => group.source === source);
  const sourceRepeatCount = Math.max(0, ...sourceGroups.map(group => group.repeatIndexes.length));
  return {
    source,
    input,
    boundaryRowCount: uniqueSorted(sourceGroups.map(group => group.rowId)).length,
    boundaryGroupCount: sourceGroups.length,
    stableSubtypes: uniqueSorted(sourceGroups.filter(group => group.subtype !== 'mixed_boundary').map(group => group.subtype)),
    intermittentRows: uniqueSorted(sourceGroups.filter(group => group.repeatIndexes.length < sourceRepeatCount).map(group => group.rowId)),
  };
}

function summarizeGroups(groups: BoundaryGroupSnapshot[]): BoundaryGroupSummary[] {
  const byKey = new Map<string, BoundaryGroupSnapshot[]>();
  for (const group of groups) {
    const key = `${group.rowId}::${group.groupKey}`;
    byKey.set(key, [...(byKey.get(key) ?? []), group]);
  }

  return [...byKey.entries()]
    .map(([compoundKey, entries]) => {
      const [rowIdValue, groupKey] = compoundKey.split('::');
      const presentSources = uniqueSorted(entries.map(entry => entry.source)) as SourceName[];
      const missingSources = (['stage87', 'stage88', 'stage89'] as SourceName[]).filter(source => !presentSources.includes(source));
      const subtypes = uniqueSorted(entries.map(entry => entry.subtype));
      const subtype = subtypes.length === 1 ? subtypes[0]! : 'mixed_boundary';
      const stability: BoundaryStability = presentSources.length === 3
        ? (subtype === 'mixed_boundary' ? 'mixed_across_reports' : 'stable_across_all_reports')
        : (subtype === 'mixed_boundary' ? 'mixed_across_reports' : 'stable_but_intermittent');
      const repeatIndexesBySource = Object.fromEntries(entries.map(entry => [entry.source, entry.repeatIndexes])) as Partial<Record<SourceName, number[]>>;
      const mergedBySource = Object.fromEntries(entries.map(entry => [entry.source, entry.merged])) as Partial<Record<SourceName, BoundaryGroupSnapshot['merged']>>;
      const decisionReason = subtype === 'contentless_reachable_boundary'
        ? stability === 'stable_across_all_reports'
          ? 'stable contentless-reachable boundary candidate remains parked across all sampled boundary reports'
          : 'contentless-reachable boundary candidate remains parked but is not yet present in every sampled report'
        : subtype === 'unreachable_content_bearing_boundary'
          ? 'intermittent unreachable-but-content-bearing boundary candidate still needs a repeat-preserving subtype policy'
          : 'boundary evidence remains mixed and is not safe for promotion';
      return {
        rowId: rowIdValue ?? '',
        groupKey,
        subtype,
        stability,
        presentSources,
        missingSources,
        repeatIndexesBySource,
        mergedBySource,
        decisionReason,
      };
    })
    .sort((a, b) => a.rowId.localeCompare(b.rowId) || a.groupKey.localeCompare(b.groupKey));
}

function renderMarkdown(report: Stage90Report): string {
  const rows = report.boundaryGroups.map(group => [
    `| \`${group.rowId}\` | \`${group.groupKey}\` | ${group.subtype} | ${group.stability} | ${group.presentSources.map(source => `\`${source}\``).join(', ')} | ${group.missingSources.length ? group.missingSources.map(source => `\`${source}\``).join(', ') : 'none'} | ${group.decisionReason} |`,
  ]).flat();

  return [
    '# Stage 90 Boundary Subtype Diagnostic',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Decision: \`${report.decision.classification}\``,
    `Recommended next stage: \`${report.decision.recommendedNextStage}\``,
    '',
    '## Decision Reasons',
    '',
    ...report.decision.reasons.map(reason => `- ${reason}`),
    '',
    '## Source Summaries',
    '',
    '| Source | Boundary rows | Boundary groups | Stable subtypes | Intermittent rows |',
    '| --- | ---: | ---: | --- | --- |',
    ...report.sourceSummaries.map(summary => `| ${summary.source} | ${summary.boundaryRowCount} | ${summary.boundaryGroupCount} | ${summary.stableSubtypes.map(item => `\`${item}\``).join(', ') || 'none'} | ${summary.intermittentRows.map(item => `\`${item}\``).join(', ') || 'none'} |`),
    '',
    '## Boundary Groups',
    '',
    '| Row | Group key | Subtype | Stability | Present sources | Missing sources | Decision reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [stage87, stage88, stage89] = await Promise.all([
    readJson(args.stage87!),
    readJson(args.stage88!),
    readJson(args.stage89!),
  ]);

  const groups = [
    ...extractBoundaryGroups(stage87, 'stage87'),
    ...extractBoundaryGroups(stage88, 'stage88'),
    ...extractBoundaryGroups(stage89, 'stage89'),
  ];

  const boundaryGroups = summarizeGroups(groups);
  const sourceSummaries: SourceSummary[] = [
    summarizeSource('stage87', args.stage87!, groups),
    summarizeSource('stage88', args.stage88!, groups),
    summarizeSource('stage89', args.stage89!, groups),
  ];

  const counts = {
    totalBoundaryGroups: boundaryGroups.length,
    stableContentlessReachableGroups: boundaryGroups.filter(group => group.subtype === 'contentless_reachable_boundary' && group.stability === 'stable_across_all_reports').length,
    intermittentUnreachableContentBearingGroups: boundaryGroups.filter(group => group.subtype === 'unreachable_content_bearing_boundary' && group.stability !== 'stable_across_all_reports').length,
    mixedGroups: boundaryGroups.filter(group => group.subtype === 'mixed_boundary').length,
  };

  const reasons = [
    `the stable contentless-reachable boundary candidate remains parked across stage87/stage88/stage89: ${boundaryGroups.filter(group => group.subtype === 'contentless_reachable_boundary').map(group => `\`${group.rowId}\``).join(', ') || 'none'}`,
    `the unreachable-but-content-bearing boundary candidate still appears intermittently rather than as a repeat-stable accept/reuse target: ${boundaryGroups.filter(group => group.subtype === 'unreachable_content_bearing_boundary').map(group => `\`${group.rowId}\``).join(', ') || 'none'}`,
    'no wrapper/path groups were introduced, so this remains a subtype diagnostic rather than an implementation signal',
    'do not add boundary handling, route guards, or scorer changes from this evidence alone',
  ];

  const report: Stage90Report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      stage87: args.stage87!,
      stage88: args.stage88!,
      stage89: args.stage89!,
    },
    sourceSummaries,
    boundaryGroups,
    counts,
    decision: {
      classification: 'diagnostic_only',
      recommendedNextStage: 'Stage 91 repeat-preserving subtype-aware boundary policy design',
      reasons,
    },
  };

  const out = resolve(args.out!);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage90-boundary-subtype-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(out, 'stage90-boundary-subtype-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(out, 'stage90-boundary-subtype-diagnostic.json')}`);
  console.log(`Wrote ${join(out, 'stage90-boundary-subtype-diagnostic.md')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

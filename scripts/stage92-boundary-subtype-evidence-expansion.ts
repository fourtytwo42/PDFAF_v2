#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
type SourceName = 'stage85' | 'stage86' | 'stage87' | 'stage88' | 'stage89' | 'stage90' | 'stage91';
type SourceFamily = 'raw' | 'repeat' | 'policy';
type BoundarySubtype =
  | 'contentless_reachable_boundary'
  | 'unreachable_content_bearing_boundary'
  | 'mixed_boundary';
type BoundaryStability =
  | 'stable_across_all_reports'
  | 'stable_but_intermittent'
  | 'mixed_across_reports';

interface BoundaryObservation {
  source: SourceName;
  family: SourceFamily;
  rowId: string;
  groupKey: string;
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
  family: SourceFamily;
  input: string;
  boundaryRows: number;
  boundaryGroups: number;
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
  rawSupportSources: SourceName[];
  repeatSupportSources: SourceName[];
  policySupportSources: SourceName[];
  mergedBySource: Partial<Record<SourceName, BoundaryObservation['merged']>>;
  decisionReason: string;
}

interface Stage92Report {
  generatedAt: string;
  inputs: Record<SourceName, string>;
  sourceSummaries: SourceSummary[];
  boundaryGroups: BoundaryGroupSummary[];
  counts: {
    totalBoundaryGroups: number;
    stableContentlessReachableGroups: number;
    intermittentUnreachableContentBearingGroups: number;
    mixedGroups: number;
    rawBoundarySources: number;
    repeatBoundarySources: number;
    policyBoundarySources: number;
  };
  decision: {
    classification: 'blocked';
    recommendedNextStage: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage92-boundary-subtype-evidence-expansion-2026-04-26-r1';
const DEFAULT_STAGE85 = 'Output/experiment-corpus-baseline/stage85-checker-evidence-classifier-2026-04-26-r1/stage85-checker-evidence-classifier.json';
const DEFAULT_STAGE86 = 'Output/experiment-corpus-baseline/stage86-checker-evidence-classifier-2026-04-26-r1/stage86-checker-evidence-classifier.json';
const DEFAULT_STAGE87 = 'Output/experiment-corpus-baseline/stage87-boundary-repeat-diagnostic-2026-04-26-r1/stage86-checker-evidence-classifier.json';
const DEFAULT_STAGE88 = 'Output/experiment-corpus-baseline/stage88-boundary-repeat-diagnostic-2026-04-26-r1/stage86-checker-evidence-classifier.json';
const DEFAULT_STAGE89 = 'Output/experiment-corpus-baseline/stage89-boundary-repeat-diagnostic-2026-04-26-r1/stage86-checker-evidence-classifier.json';
const DEFAULT_STAGE90 = 'Output/experiment-corpus-baseline/stage90-boundary-subtype-diagnostic-2026-04-26-r1/stage90-boundary-subtype-diagnostic.json';
const DEFAULT_STAGE91 = 'Output/experiment-corpus-baseline/stage91-repeat-preserving-subtype-policy-design-2026-04-26-r1/stage91-boundary-policy-design.json';

const SOURCE_FAMILY: Record<SourceName, SourceFamily> = {
  stage85: 'raw',
  stage86: 'raw',
  stage87: 'repeat',
  stage88: 'repeat',
  stage89: 'repeat',
  stage90: 'policy',
  stage91: 'policy',
};

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage92-boundary-subtype-evidence-expansion.ts [options]',
    `  --out <dir>        Default: ${DEFAULT_OUT}`,
    `  --stage85 <path>   Default: ${DEFAULT_STAGE85}`,
    `  --stage86 <path>   Default: ${DEFAULT_STAGE86}`,
    `  --stage87 <path>   Default: ${DEFAULT_STAGE87}`,
    `  --stage88 <path>   Default: ${DEFAULT_STAGE88}`,
    `  --stage89 <path>   Default: ${DEFAULT_STAGE89}`,
    `  --stage90 <path>   Default: ${DEFAULT_STAGE90}`,
    `  --stage91 <path>   Default: ${DEFAULT_STAGE91}`,
  ].join('\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const args = {
    out: DEFAULT_OUT,
    stage85: DEFAULT_STAGE85,
    stage86: DEFAULT_STAGE86,
    stage87: DEFAULT_STAGE87,
    stage88: DEFAULT_STAGE88,
    stage89: DEFAULT_STAGE89,
    stage90: DEFAULT_STAGE90,
    stage91: DEFAULT_STAGE91,
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
    else if (arg === '--stage85') args.stage85 = next;
    else if (arg === '--stage86') args.stage86 = next;
    else if (arg === '--stage87') args.stage87 = next;
    else if (arg === '--stage88') args.stage88 = next;
    else if (arg === '--stage89') args.stage89 = next;
    else if (arg === '--stage90') args.stage90 = next;
    else if (arg === '--stage91') args.stage91 = next;
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

function uniqueSorted<T>(items: T[]): T[] {
  return [...new Set(items)].sort() as T[];
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

function mergedShape(merged: JsonRecord): BoundaryObservation['merged'] {
  return {
    reachable: bool(merged['reachable']),
    directContent: bool(merged['directContent']),
    subtreeMcidCount: num(merged['subtreeMcidCount']),
    parentPath: Array.isArray(merged['parentPath']) ? merged['parentPath'].map(String) : [],
  };
}

function extractRawBoundaryObservations(report: JsonRecord, source: Exclude<SourceName, 'stage90' | 'stage91'>): BoundaryObservation[] {
  const rows = arr(report['rows']);
  const observations: BoundaryObservation[] = [];
  for (const row of rows) {
    const id = rowId(row);
    for (const kind of ['tableGroups', 'paragraphGroups'] as const) {
      for (const group of arr(row[kind])) {
        const classification = str(group['classification']);
        if (classification !== 'boundary_candidate' && classification !== 'mixed_boundary') continue;
        const merged = group['merged'] && typeof group['merged'] === 'object' ? group['merged'] as JsonRecord : {};
        observations.push({
          source,
          family: SOURCE_FAMILY[source],
          rowId: id,
          groupKey: str(group['key']),
          subtype: boundarySubtype(merged),
          merged: mergedShape(merged),
        });
      }
    }
  }
  return observations;
}

function extractPolicyBoundaryObservations(report: JsonRecord, source: Extract<SourceName, 'stage90' | 'stage91'>): BoundaryObservation[] {
  const groups = arr(report['boundaryGroups']);
  const observations: BoundaryObservation[] = [];
  for (const group of groups) {
    const mergedBySource = group['mergedBySource'] && typeof group['mergedBySource'] === 'object'
      ? group['mergedBySource'] as JsonRecord
      : {};
    const rawMerged = mergedBySource[source];
    const merged = rawMerged && typeof rawMerged === 'object' ? rawMerged as JsonRecord : {};
    observations.push({
      source,
      family: SOURCE_FAMILY[source],
      rowId: str(group['rowId']),
      groupKey: str(group['groupKey']),
      subtype: str(group['subtype']) as BoundarySubtype,
      merged: mergedShape(merged),
    });
  }
  return observations;
}

function summarizeSource(
  source: SourceName,
  input: string,
  observations: BoundaryObservation[],
  boundaryGroups: BoundaryGroupSummary[],
): SourceSummary {
  const sourceObservations = observations.filter(observation => observation.source === source);
  const sourceGroups = boundaryGroups.filter(group => group.presentSources.includes(source));
  return {
    source,
    family: SOURCE_FAMILY[source],
    input,
    boundaryRows: uniqueSorted(sourceObservations.map(observation => observation.rowId)).length,
    boundaryGroups: sourceObservations.length,
    stableSubtypes: uniqueSorted(sourceObservations.filter(observation => observation.subtype !== 'mixed_boundary').map(observation => observation.subtype)),
    intermittentRows: uniqueSorted(sourceGroups.filter(group => group.stability !== 'stable_across_all_reports').map(group => group.rowId)),
  };
}

function summarizeBoundaryGroups(observations: BoundaryObservation[]): BoundaryGroupSummary[] {
  const byKey = new Map<string, BoundaryObservation[]>();
  for (const observation of observations) {
    const key = `${observation.rowId}::${observation.groupKey}`;
    byKey.set(key, [...(byKey.get(key) ?? []), observation]);
  }

  const allSources: SourceName[] = ['stage85', 'stage86', 'stage87', 'stage88', 'stage89', 'stage90', 'stage91'];

  return [...byKey.entries()]
    .map(([compoundKey, entries]) => {
      const [rowIdValue, groupKey] = compoundKey.split('::');
      const presentSources = uniqueSorted(entries.map(entry => entry.source)) as SourceName[];
      const missingSources = allSources.filter(source => !presentSources.includes(source));
      const subtypeSet = uniqueSorted(entries.map(entry => entry.subtype));
      const subtype = subtypeSet.length === 1 ? subtypeSet[0]! : 'mixed_boundary';
      const stability: BoundaryStability = presentSources.length === allSources.length
        ? (subtype === 'mixed_boundary' ? 'mixed_across_reports' : 'stable_across_all_reports')
        : (subtype === 'mixed_boundary' ? 'mixed_across_reports' : 'stable_but_intermittent');
      const rawSupportSources = uniqueSorted(entries.filter(entry => entry.family === 'raw').map(entry => entry.source)) as SourceName[];
      const repeatSupportSources = uniqueSorted(entries.filter(entry => entry.family === 'repeat').map(entry => entry.source)) as SourceName[];
      const policySupportSources = uniqueSorted(entries.filter(entry => entry.family === 'policy').map(entry => entry.source)) as SourceName[];
      const mergedBySource = Object.fromEntries(entries.map(entry => [entry.source, entry.merged])) as Partial<Record<SourceName, BoundaryObservation['merged']>>;
      const decisionReason = subtype === 'contentless_reachable_boundary'
        ? stability === 'stable_across_all_reports'
          ? 'stable contentless-reachable boundary is now supported by raw, repeat, and policy evidence, but it stays parked'
          : 'contentless-reachable boundary stays parked until all sampled sources agree on repeat-stable reuse'
        : subtype === 'unreachable_content_bearing_boundary'
          ? 'intermittent unreachable-but-content-bearing boundary remains repeat-sensitive and stays parked'
          : 'boundary evidence remains mixed and should not be collapsed into accept/reuse logic';
      return {
        rowId: rowIdValue ?? '',
        groupKey,
        subtype,
        stability,
        presentSources,
        missingSources,
        rawSupportSources,
        repeatSupportSources,
        policySupportSources,
        mergedBySource,
        decisionReason,
      };
    })
    .sort((a, b) => a.rowId.localeCompare(b.rowId) || a.groupKey.localeCompare(b.groupKey));
}

function renderMarkdown(report: Stage92Report): string {
  const rows = report.boundaryGroups.map(group => `| \`${group.rowId}\` | \`${group.groupKey}\` | ${group.subtype} | ${group.stability} | ${group.presentSources.map(source => `\`${source}\``).join(', ')} | ${group.missingSources.length ? group.missingSources.map(source => `\`${source}\``).join(', ') : 'none'} | ${group.rawSupportSources.length ? group.rawSupportSources.map(source => `\`${source}\``).join(', ') : 'none'} | ${group.repeatSupportSources.length ? group.repeatSupportSources.map(source => `\`${source}\``).join(', ') : 'none'} | ${group.policySupportSources.length ? group.policySupportSources.map(source => `\`${source}\``).join(', ') : 'none'} | ${group.decisionReason} |`);

  return [
    '# Stage 92 Boundary Subtype Evidence Expansion',
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
    '| Source | Family | Boundary rows | Boundary groups | Stable subtypes | Intermittent rows |',
    '| --- | --- | ---: | ---: | --- | --- |',
    ...report.sourceSummaries.map(summary => `| ${summary.source} | ${summary.family} | ${summary.boundaryRows} | ${summary.boundaryGroups} | ${summary.stableSubtypes.map(item => `\`${item}\``).join(', ') || 'none'} | ${summary.intermittentRows.map(item => `\`${item}\``).join(', ') || 'none'} |`),
    '',
    '## Boundary Groups',
    '',
    '| Row | Group key | Subtype | Stability | Present sources | Missing sources | Raw support | Repeat support | Policy support | Decision reason |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Counts',
    '',
    `- Total boundary groups: ${report.counts.totalBoundaryGroups}`,
    `- Stable contentless-reachable groups: ${report.counts.stableContentlessReachableGroups}`,
    `- Intermittent unreachable-content-bearing groups: ${report.counts.intermittentUnreachableContentBearingGroups}`,
    `- Mixed groups: ${report.counts.mixedGroups}`,
    `- Raw boundary sources represented: ${report.counts.rawBoundarySources}`,
    `- Repeat boundary sources represented: ${report.counts.repeatBoundarySources}`,
    `- Policy boundary sources represented: ${report.counts.policyBoundarySources}`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });

  const [stage85, stage86, stage87, stage88, stage89, stage90, stage91] = await Promise.all([
    readJson(args.stage85),
    readJson(args.stage86),
    readJson(args.stage87),
    readJson(args.stage88),
    readJson(args.stage89),
    readJson(args.stage90),
    readJson(args.stage91),
  ]);

  const inputs: Record<SourceName, string> = {
    stage85: args.stage85,
    stage86: args.stage86,
    stage87: args.stage87,
    stage88: args.stage88,
    stage89: args.stage89,
    stage90: args.stage90,
    stage91: args.stage91,
  };

  const observations = [
    ...extractRawBoundaryObservations(stage85, 'stage85'),
    ...extractRawBoundaryObservations(stage86, 'stage86'),
    ...extractRawBoundaryObservations(stage87, 'stage87'),
    ...extractRawBoundaryObservations(stage88, 'stage88'),
    ...extractRawBoundaryObservations(stage89, 'stage89'),
    ...extractPolicyBoundaryObservations(stage90, 'stage90'),
    ...extractPolicyBoundaryObservations(stage91, 'stage91'),
  ];

  const boundaryGroups = summarizeBoundaryGroups(observations);
  const sourceSummaries = [
    summarizeSource('stage85', args.stage85, observations, boundaryGroups),
    summarizeSource('stage86', args.stage86, observations, boundaryGroups),
    summarizeSource('stage87', args.stage87, observations, boundaryGroups),
    summarizeSource('stage88', args.stage88, observations, boundaryGroups),
    summarizeSource('stage89', args.stage89, observations, boundaryGroups),
    summarizeSource('stage90', args.stage90, observations, boundaryGroups),
    summarizeSource('stage91', args.stage91, observations, boundaryGroups),
  ];

  const counts = {
    totalBoundaryGroups: boundaryGroups.length,
    stableContentlessReachableGroups: boundaryGroups.filter(group => group.subtype === 'contentless_reachable_boundary' && group.stability === 'stable_across_all_reports').length,
    intermittentUnreachableContentBearingGroups: boundaryGroups.filter(group => group.subtype === 'unreachable_content_bearing_boundary' && group.stability !== 'stable_across_all_reports').length,
    mixedGroups: boundaryGroups.filter(group => group.subtype === 'mixed_boundary').length,
    rawBoundarySources: uniqueSorted(observations.filter(observation => observation.family === 'raw').map(observation => observation.source)).length,
    repeatBoundarySources: uniqueSorted(observations.filter(observation => observation.family === 'repeat').map(observation => observation.source)).length,
    policyBoundarySources: uniqueSorted(observations.filter(observation => observation.family === 'policy').map(observation => observation.source)).length,
  };

  const report: Stage92Report = {
    generatedAt: new Date().toISOString(),
    inputs,
    sourceSummaries,
    boundaryGroups,
    counts,
    decision: {
      classification: 'blocked',
      recommendedNextStage: 'Rerun Stage 92 with --model-policy xhigh if a repeat-preserving boundary policy needs to be designed',
      reasons: [
        'the stable contentless-reachable boundary candidate is now corroborated by raw stage85/stage86 evidence, repeat stage87-stage89 evidence, and policy stage90-stage91 evidence, but it remains parked',
        'the unreachable-but-content-bearing boundary candidate remains intermittent and repeat-sensitive, so it is still not safe for acceptance reuse',
        'no wrapper/path groups were introduced by the expanded sample, so the remaining work is still subtype-aware policy design rather than a routing shortcut',
        'do not add boundary handling, route guards, scorer changes, or any accept/reuse collapse from this evidence alone',
      ],
    },
  };

  await writeFile(join(outDir, 'stage92-boundary-subtype-evidence-expansion.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'stage92-boundary-subtype-evidence-expansion.md'), `${renderMarkdown(report)}\n`);

  console.log(`Wrote ${join(outDir, 'stage92-boundary-subtype-evidence-expansion.json')}`);
  console.log(`Wrote ${join(outDir, 'stage92-boundary-subtype-evidence-expansion.md')}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

interface SourceShape {
  emitsReachable: boolean;
  emitsDirectContent: boolean;
  emitsSubtreeMcidCount: boolean;
  emitsParentPath: boolean;
}

interface Stage83KindSummary {
  kind: 'table' | 'paragraph';
  rowCount: number;
  topUnstableGroupCount: number;
  intermittentGroupCount: number;
  rows: string[];
  sourceShape: SourceShape;
  currentClassification: 'unclassifiable_current_output' | 'candidate_for_checker_policy';
  reason: string;
}

interface Stage83Report {
  generatedAt: string;
  inputs: {
    stage81: string;
    stage82: string;
    pythonHelper: string;
  };
  legacy: {
    stage78HardFailures: string[];
    protectedRegressionRows: string[];
    intermittentTableRows: string[];
    stableControlRows: string[];
  };
  edgeMix: {
    currentAbCount: number | null;
    totalRows: number | null;
    targetAbCount: number | null;
    reachableWithoutParkedOrManualRows: boolean | null;
    parkedAnalyzerRows: string[];
    manualScannedRows: string[];
    rejectedStableCandidateRows: string[];
  };
  policy: {
    kindSummaries: Stage83KindSummary[];
    checkerFacingRuleDraft: string[];
    artifactRuleDraft: string[];
    requiredBeforeImplementation: string[];
  };
  decision: {
    classification: 'diagnostic_only';
    recommendedNextStage: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage83-checker-evidence-policy-2026-04-26-r1';
const DEFAULT_STAGE81 = 'Output/experiment-corpus-baseline/stage81-evidence-diff-diagnostic-2026-04-26-r1/stage81-evidence-diff-diagnostic.json';
const DEFAULT_STAGE82 = 'Output/experiment-corpus-baseline/stage82-checker-policy-selection-2026-04-26-r1/stage82-checker-policy-selection.json';
const DEFAULT_PYTHON_HELPER = 'python/pdf_analysis_helper.py';

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage83-checker-evidence-policy.ts [options]',
    `  --out <dir>              Default: ${DEFAULT_OUT}`,
    `  --stage81 <path>         Default: ${DEFAULT_STAGE81}`,
    `  --stage82 <path>         Default: ${DEFAULT_STAGE82}`,
    `  --python-helper <path>   Default: ${DEFAULT_PYTHON_HELPER}`,
  ].join('\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const args = {
    out: DEFAULT_OUT,
    stage81: DEFAULT_STAGE81,
    stage82: DEFAULT_STAGE82,
    pythonHelper: DEFAULT_PYTHON_HELPER,
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
    else if (arg === '--stage81') args.stage81 = next;
    else if (arg === '--stage82') args.stage82 = next;
    else if (arg === '--python-helper') args.pythonHelper = next;
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
  return typeof value === 'string' ? value : '';
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function sourceBlock(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  if (start < 0) return '';
  const end = source.indexOf(endNeedle, start);
  return source.slice(start, end < 0 ? undefined : end);
}

function sourceShape(block: string): SourceShape {
  return {
    emitsReachable: /["']reachable["']\s*:/.test(block),
    emitsDirectContent: /["']directContent["']\s*:/.test(block),
    emitsSubtreeMcidCount: /["']subtreeMcidCount["']\s*:/.test(block),
    emitsParentPath: /["']parentPath["']\s*:/.test(block),
  };
}

function allShapeFields(shape: SourceShape): boolean {
  return shape.emitsReachable && shape.emitsDirectContent && shape.emitsSubtreeMcidCount && shape.emitsParentPath;
}

function summarizeKind(stage81Rows: JsonRecord[], kind: 'table' | 'paragraph', sourceShapeForKind: SourceShape): Stage83KindSummary {
  const rowsWithGroups = stage81Rows.filter(row => arr(row['topUnstableGroups']).some(group => group['kind'] === kind));
  const groups = rowsWithGroups.flatMap(row => arr(row['topUnstableGroups']).filter(group => group['kind'] === kind));
  const intermittent = groups.filter(group => group['intermittent'] === true);
  const sourceComplete = allShapeFields(sourceShapeForKind);
  return {
    kind,
    rowCount: rowsWithGroups.length,
    topUnstableGroupCount: groups.length,
    intermittentGroupCount: intermittent.length,
    rows: rowsWithGroups.map(rowId).filter(Boolean),
    sourceShape: sourceShapeForKind,
    currentClassification: sourceComplete ? 'candidate_for_checker_policy' : 'unclassifiable_current_output',
    reason: sourceComplete
      ? 'raw analyzer records expose enough root-reachability/content fields for a checker-facing policy experiment'
      : 'raw analyzer records do not expose explicit root-reachability/content fields, so merged false values may mean unknown rather than artifact',
  };
}

function renderMarkdown(report: Stage83Report): string {
  const kindRows = report.policy.kindSummaries.map(summary =>
    `| ${summary.kind} | ${summary.rowCount} | ${summary.topUnstableGroupCount} | ${summary.intermittentGroupCount} | ${summary.currentClassification} | reachable=${summary.sourceShape.emitsReachable}, direct=${summary.sourceShape.emitsDirectContent}, subtree=${summary.sourceShape.emitsSubtreeMcidCount}, parentPath=${summary.sourceShape.emitsParentPath} | ${summary.rows.map(row => `\`${row}\``).join(', ') || 'none'} |`,
  );
  return `${[
    '# Stage 83 Checker Evidence Policy',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Decision: \`${report.decision.classification}\``,
    `Recommended next stage: \`${report.decision.recommendedNextStage}\``,
    '',
    '## Decision Reasons',
    '',
    ...report.decision.reasons.map(reason => `- ${reason}`),
    '',
    '## Evidence Shape',
    '',
    '| Kind | Rows | Top unstable groups | Intermittent groups | Classification | Source fields | Rows |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |',
    ...kindRows,
    '',
    '## Draft Checker-Aligned Policy',
    '',
    ...report.policy.checkerFacingRuleDraft.map(rule => `- ${rule}`),
    '',
    '## Draft Artifact Policy',
    '',
    ...report.policy.artifactRuleDraft.map(rule => `- ${rule}`),
    '',
    '## Required Before Implementation',
    '',
    ...report.policy.requiredBeforeImplementation.map(item => `- ${item}`),
    '',
    '## Legacy Context',
    '',
    `- Stage 78 hard failures: ${report.legacy.stage78HardFailures.map(item => `\`${item}\``).join(', ') || 'none'}`,
    `- Protected regression rows: ${report.legacy.protectedRegressionRows.map(item => `\`${item}\``).join(', ') || 'none'}`,
    `- Intermittent-table rows: ${report.legacy.intermittentTableRows.map(item => `\`${item}\``).join(', ') || 'none'}`,
    `- Stable controls: ${report.legacy.stableControlRows.map(item => `\`${item}\``).join(', ') || 'none'}`,
    '',
    '## V1 Edge Context',
    '',
    `- A/B math: ${report.edgeMix.currentAbCount ?? 'n/a'}/${report.edgeMix.totalRows ?? 'n/a'} current, target ${report.edgeMix.targetAbCount ?? 'n/a'}`,
    `- Reachable without parked/manual rows: ${report.edgeMix.reachableWithoutParkedOrManualRows === null ? 'n/a' : report.edgeMix.reachableWithoutParkedOrManualRows ? 'yes' : 'no'}`,
    `- Parked analyzer rows: ${report.edgeMix.parkedAnalyzerRows.map(item => `\`${item}\``).join(', ') || 'none'}`,
    `- Manual/scanned rows: ${report.edgeMix.manualScannedRows.map(item => `\`${item}\``).join(', ') || 'none'}`,
    `- Rejected stable candidates: ${report.edgeMix.rejectedStableCandidateRows.map(item => `\`${item}\``).join(', ') || 'none'}`,
    '',
  ].join('\n')}\n`;
}

async function buildReport(args: Record<string, string>): Promise<Stage83Report> {
  const [stage81, stage82, pythonHelper] = await Promise.all([
    readJson(args.stage81!),
    readJson(args.stage82!),
    readFile(resolve(args.pythonHelper!), 'utf8'),
  ]);

  const tableBlock = sourceBlock(pythonHelper, 'elif tag == "Table"', 'tables_out.append(row)');
  const paragraphBlock = sourceBlock(pythonHelper, 'Paragraph-like struct elems', 'paragraph_struct_elems.append(prow)');
  const stage81Rows = arr(stage81['rows']);
  const kindSummaries = [
    summarizeKind(stage81Rows, 'table', sourceShape(tableBlock)),
    summarizeKind(stage81Rows, 'paragraph', sourceShape(paragraphBlock)),
  ];

  const legacy = stage82['legacy'] && typeof stage82['legacy'] === 'object' ? stage82['legacy'] as JsonRecord : {};
  const edgeMix = stage82['edgeMix'] && typeof stage82['edgeMix'] === 'object' ? stage82['edgeMix'] as JsonRecord : {};
  const missingExplicitMetadata = kindSummaries.filter(summary => summary.currentClassification === 'unclassifiable_current_output');

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      stage81: args.stage81!,
      stage82: args.stage82!,
      pythonHelper: args.pythonHelper!,
    },
    legacy: {
      stage78HardFailures: stringArray(legacy['stage78HardFailures']),
      protectedRegressionRows: stringArray(legacy['protectedRegressionRows']),
      intermittentTableRows: stringArray(legacy['intermittentTableRows']),
      stableControlRows: stringArray(legacy['stableControlRows']),
    },
    edgeMix: {
      currentAbCount: num(edgeMix['currentAbCount']),
      totalRows: num(edgeMix['totalRows']),
      targetAbCount: num(edgeMix['targetAbCount']),
      reachableWithoutParkedOrManualRows: bool(edgeMix['reachableWithoutParkedOrManualRows']),
      parkedAnalyzerRows: stringArray(edgeMix['parkedAnalyzerRows']),
      manualScannedRows: stringArray(edgeMix['manualScannedRows']),
      rejectedStableCandidateRows: stringArray(edgeMix['rejectedStableCandidateRows']),
    },
    policy: {
      kindSummaries,
      checkerFacingRuleDraft: [
        'Treat table/paragraph observations as checker-facing only when the raw analyzer explicitly proves root reachability and either direct MCID content or nonzero subtree MCID content.',
        'For tables, require normal table structural evidence after reachability is proven: more than one row or multiple cells, plus header/regularity signals only from reachable table nodes.',
        'For paragraphs, use paragraphStructElems as reading-order/heading bootstrap support only when the paragraph-like node is root-reachable and content-bearing.',
      ],
      artifactRuleDraft: [
        'Treat explicitly unreachable or contentless table/paragraph observations as wrapper/path artifacts for deterministic aggregation and policy selection.',
        'Do not infer artifact status from missing metadata; current missing fields are unknown, not proof of non-checker-facing structure.',
      ],
      requiredBeforeImplementation: [
        'Add metadata-only raw analyzer instrumentation for table and paragraph records: reachable, directContent, subtreeMcidCount, and parentPath.',
        'Repeat the Stage 81 raw same-buffer diagnostic on protected rows and stable font/short controls.',
        'Only then test a narrow aggregation/filter policy; preserve Stage 75 font gains, Stage 78 p95 pass, and false-positive applied 0.',
      ],
    },
    decision: {
      classification: 'diagnostic_only',
      recommendedNextStage: 'Stage 84 metadata-only analyzer instrumentation for table/paragraph checker evidence',
      reasons: [
        `${missingExplicitMetadata.map(summary => summary.kind).join(' and ')} unstable evidence lacks explicit checker-facing metadata in current raw analyzer records.`,
        'Stage 81 merged false reachability/content values are not safe policy evidence because missing fields and explicit false values collapse together in the diagnostic projection.',
        'Stage 82 already ruled out v1-edge structural cleanup as a reachable path without parked/manual rows.',
        'No remediation, scorer, gate, or route guard change is justified before metadata-only analyzer evidence exists.',
      ],
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport(args);
  const out = resolve(args.out!);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage83-checker-evidence-policy.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(out, 'stage83-checker-evidence-policy.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out!, 'stage83-checker-evidence-policy.json')}`);
  console.log(`Wrote ${join(args.out!, 'stage83-checker-evidence-policy.md')}`);
  console.log(`Decision: ${report.decision.classification}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

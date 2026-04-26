#!/usr/bin/env tsx
import 'dotenv/config';

import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
type EvidenceState = 'checker_facing' | 'wrapper_path_artifact' | 'boundary_candidate';
type EvidenceKind = 'table' | 'paragraph';

interface Observation {
  kind: EvidenceKind;
  key: string;
  repeat: number;
  evidenceState: EvidenceState;
  derivedState: EvidenceState;
  item: JsonRecord;
}

interface GroupSummary {
  key: string;
  kind: EvidenceKind;
  repeatIndexes: number[];
  observationCount: number;
  variantCount: number;
  checkerFacingCount: number;
  wrapperPathCount: number;
  boundaryCount: number;
  classification: EvidenceState;
  intermittent: boolean;
  stateMatchesAnalyzerField: boolean;
  merged: JsonRecord;
}

interface RowReport {
  id: string;
  pdfPath: string;
  filename: string;
  score: number | null;
  grade: string | null;
  repeatCount: number;
  tableGroups: GroupSummary[];
  paragraphGroups: GroupSummary[];
  checkerFacingGroupCount: number;
  wrapperPathGroupCount: number;
  boundaryGroupCount: number;
  analyzerFieldCoverage: number;
  decisionReason: string;
}

interface Stage86Report {
  generatedAt: string;
  repeatCount: number;
  inputs: Array<{ id: string; pdfPath: string }>;
  rows: RowReport[];
  decision: {
    classification: 'implemented';
    recommendedNextWork: string;
    reasons: string[];
  };
}

const DEFAULT_REPEAT_COUNT = 2;
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage86-checker-evidence-classifier-2026-04-26-r1';
const DEFAULT_INPUTS = [
  { id: 'structure-4076', pdfPath: 'Input/experiment-corpus/30-structure-reading-order/4076-Juvenile Justice Data 2004 Annual Report APPENDIX H Data Tables.pdf' },
  { id: 'long-4683', pdfPath: 'Input/experiment-corpus/50-long-report-mixed/4683-Illinois Higher Education in Prison Task Force 2022 Report.pdf' },
  { id: 'long-4470', pdfPath: 'Input/experiment-corpus/50-long-report-mixed/4470-Co-occurring Mental Health and Substance Use Disorders of Women in Prison_ An Evaluation of the WestCare Foundation_s Dual Diagnosis Program in Illinois.pdf' },
  { id: 'fixture-teams-remediated', pdfPath: 'Input/experiment-corpus/00-fixtures/Microsoft_Teams_Quickstart (1)-remediated.pdf' },
  { id: 'font-4172', pdfPath: 'Input/experiment-corpus/40-font-extractability/4172-Illinois Drug Trends Drug Crime Lab Submissions 19972007.pdf' },
  { id: 'short-4214', pdfPath: 'Input/experiment-corpus/10-short-near-pass/4214-Illinois Crime Victim Trends Reported Elder Abuse 20002009.pdf' },
  { id: '4700', pdfPath: 'Input/from_sibling_pdfaf_v1_edge_mix_2/table_font_link/4700-r3-2022-annual-report.pdf' },
  { id: '4699', pdfPath: 'Input/from_sibling_pdfaf_v1_edge_mix_2/table_font_link/4699-criminal-history-record-checks-for-federally-assisted-housin.pdf' },
  { id: '4722', pdfPath: 'Input/from_sibling_pdfaf_v1_edge_mix_2/long_mixed/4722-police-use-of-discretion-in-encounters-with-people-with-opio.pdf' },
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage86-checker-evidence-classifier.ts [options]',
    `  --out <dir>         Default: ${DEFAULT_OUT}`,
    `  --repeat <n>        Default: ${DEFAULT_REPEAT_COUNT}`,
    '  --pdf <path>        Repeatable. Defaults to representative legacy and v1-edge PDFs.',
    '  --id <label>        Optional label for the most recent --pdf path.',
  ].join('\n');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as JsonRecord;
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signature(value: unknown): string {
  let hash = 0;
  const text = stableStringify(value);
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function derivedEvidenceState(item: JsonRecord): EvidenceState {
  const reachable = bool(item['reachable']);
  const directContent = bool(item['directContent']);
  const subtreeMcidCount = num(item['subtreeMcidCount']);
  if (reachable && (directContent || subtreeMcidCount > 0)) return 'checker_facing';
  if (!reachable && !directContent && subtreeMcidCount === 0) return 'wrapper_path_artifact';
  return 'boundary_candidate';
}

function evidenceState(item: JsonRecord): EvidenceState {
  const raw = str(item['evidenceState']);
  if (raw === 'checker_facing' || raw === 'wrapper_path_artifact' || raw === 'boundary_candidate') {
    return raw;
  }
  return derivedEvidenceState(item);
}

function observationKey(kind: EvidenceKind, item: JsonRecord): string {
  const ref = str(item['structRef']);
  if (ref) return `${kind}:ref:${ref}`;
  const page = num(item['page']);
  const parent = arr(item['parentPath']).map(String).join('/');
  if (kind === 'table') {
    return `${kind}:inline:${page}:${num(item['rowCount'])}:${num(item['totalCells'])}:${num(item['headerCount'])}:${num(item['dominantColumnCount'])}:${parent}`;
  }
  const text = str(item['text'] ?? item['altText']).replace(/\s+/g, ' ').slice(0, 96);
  return `${kind}:inline:${page}:${text}:${parent}`;
}

function mergeObservations(kind: EvidenceKind, observations: Observation[]): JsonRecord {
  const merged: JsonRecord = { ...observations.slice().sort((a, b) => stableStringify(b.item).localeCompare(stableStringify(a.item)))[0]?.item };
  for (const obs of observations) {
    const item = obs.item;
    for (const key of ['text', 'altText'] as const) {
      const current = str(merged[key]);
      const candidate = str(item[key]);
      if (candidate.length > current.length) merged[key] = candidate;
    }
    for (const key of ['reachable', 'directContent', 'hasAlt'] as const) merged[key] = bool(merged[key]) || bool(item[key]);
    for (const key of ['subtreeMcidCount', 'headerCount', 'totalCells', 'rowCount', 'cellsMisplacedCount', 'irregularRows', 'dominantColumnCount'] as const) {
      merged[key] = Math.max(num(merged[key]), num(item[key]));
    }
    if (!Array.isArray(merged['bbox']) && Array.isArray(item['bbox'])) merged['bbox'] = item['bbox'];
    if (arr(item['parentPath']).length > arr(merged['parentPath']).length) merged['parentPath'] = item['parentPath'];
    if (!str(merged['evidenceState'])) merged['evidenceState'] = item['evidenceState'];
  }
  merged['stage86MergedKind'] = kind;
  return merged;
}

function summarizeGroup(kind: EvidenceKind, observations: Observation[], repeatCount: number): GroupSummary {
  const repeatIndexes = [...new Set(observations.map(obs => obs.repeat))].sort((a, b) => a - b);
  const variants = new Set(observations.map(obs => signature(obs.item)));
  const checkerFacingCount = observations.filter(obs => obs.evidenceState === 'checker_facing').length;
  const wrapperPathCount = observations.filter(obs => obs.evidenceState === 'wrapper_path_artifact').length;
  const boundaryCount = observations.filter(obs => obs.evidenceState === 'boundary_candidate').length;
  const classification: EvidenceState = checkerFacingCount && !wrapperPathCount && !boundaryCount
    ? 'checker_facing'
    : wrapperPathCount && !checkerFacingCount && !boundaryCount
      ? 'wrapper_path_artifact'
      : 'boundary_candidate';
  const merged = mergeObservations(kind, observations);
  return {
    key: observations[0]!.key,
    kind,
    repeatIndexes,
    observationCount: observations.length,
    variantCount: variants.size,
    checkerFacingCount,
    wrapperPathCount,
    boundaryCount,
    classification,
    intermittent: repeatIndexes.length !== repeatCount || variants.size > 1,
    stateMatchesAnalyzerField: observations.every(obs => obs.evidenceState === obs.derivedState),
    merged,
  };
}

function groupObservations(observations: Observation[], repeatCount: number): GroupSummary[] {
  const groups = new Map<string, Observation[]>();
  for (const obs of observations) {
    const key = `${obs.kind}:${obs.key}`;
    groups.set(key, [...(groups.get(key) ?? []), obs]);
  }
  return [...groups.values()]
    .map(group => summarizeGroup(group[0]!.kind, group, repeatCount))
    .sort((a, b) => a.kind.localeCompare(b.kind) || b.observationCount - a.observationCount || a.key.localeCompare(b.key));
}

function summarizeRow(id: string, pdfPath: string, repeats: Array<{ repeat: number; score: number | null; grade: string | null; snapshot: JsonRecord }>, repeatCount: number): RowReport {
  const observations: Observation[] = [];
  let analyzerFieldCoverage = 0;
  for (const repeat of repeats) {
    const tables = arr(repeat.snapshot['tables']) as JsonRecord[];
    const paragraphs = arr(repeat.snapshot['paragraphStructElems']) as JsonRecord[];
    for (const item of tables) {
      const derivedState = derivedEvidenceState(item);
      const rawState = evidenceState(item);
      if (str(item['evidenceState'])) analyzerFieldCoverage += 1;
      observations.push({
        kind: 'table',
        key: observationKey('table', item),
        repeat: repeat.repeat,
        evidenceState: rawState,
        derivedState,
        item,
      });
    }
    for (const item of paragraphs) {
      const derivedState = derivedEvidenceState(item);
      const rawState = evidenceState(item);
      if (str(item['evidenceState'])) analyzerFieldCoverage += 1;
      observations.push({
        kind: 'paragraph',
        key: observationKey('paragraph', item),
        repeat: repeat.repeat,
        evidenceState: rawState,
        derivedState,
        item,
      });
    }
  }

  const tableGroups = groupObservations(observations.filter(obs => obs.kind === 'table'), repeatCount);
  const paragraphGroups = groupObservations(observations.filter(obs => obs.kind === 'paragraph'), repeatCount);
  const checkerFacingGroupCount = [...tableGroups, ...paragraphGroups].filter(group => group.classification === 'checker_facing').length;
  const wrapperPathGroupCount = [...tableGroups, ...paragraphGroups].filter(group => group.classification === 'wrapper_path_artifact').length;
  const boundaryGroupCount = [...tableGroups, ...paragraphGroups].filter(group => group.classification === 'boundary_candidate').length;
  const score = repeats[0]?.score ?? null;
  const grade = repeats[0]?.grade ?? null;
  const name = basename(pdfPath);
  const decisionReason = boundaryGroupCount > 0
    ? 'raw analyzer evidenceState now isolates parked boundary candidates instead of folding them into wrapper/path artifacts'
    : 'raw analyzer evidenceState cleanly separates checker-facing evidence from wrapper/path artifacts in this sample';

  return {
    id,
    pdfPath,
    filename: name,
    score,
    grade,
    repeatCount,
    tableGroups,
    paragraphGroups,
    checkerFacingGroupCount,
    wrapperPathGroupCount,
    boundaryGroupCount,
    analyzerFieldCoverage,
    decisionReason,
  };
}

function renderMarkdown(report: Stage86Report): string {
  const rows = report.rows.map(row => [
    `### ${row.id}`,
    '',
    `- File: \`${row.pdfPath}\``,
    `- Score: ${row.score ?? 'n/a'} ${row.grade ?? ''}`.trim(),
    `- Repeats: \`${row.repeatCount}\``,
    `- Analyzer field coverage: \`${row.analyzerFieldCoverage}\``,
    `- Checker-facing groups: \`${row.checkerFacingGroupCount}\``,
    `- Wrapper/path groups: \`${row.wrapperPathGroupCount}\``,
    `- Boundary groups: \`${row.boundaryGroupCount}\``,
    `- Decision: ${row.decisionReason}`,
    '',
    row.tableGroups.length ? '| Table key | Classification | Repeats | Checker-facing | Wrapper/path | Boundary | Field match |' : '',
    row.tableGroups.length ? '| --- | --- | ---: | ---: | ---: | ---: | --- |' : '',
    ...row.tableGroups.map(group => `| \`${group.key}\` | ${group.classification} | ${group.repeatIndexes.map(String).join(', ') || 'none'} | ${group.checkerFacingCount} | ${group.wrapperPathCount} | ${group.boundaryCount} | ${group.stateMatchesAnalyzerField ? 'yes' : 'no'} |`),
    row.tableGroups.length ? '' : '',
    row.paragraphGroups.length ? '| Paragraph key | Classification | Repeats | Checker-facing | Wrapper/path | Boundary | Field match |' : '',
    row.paragraphGroups.length ? '| --- | --- | ---: | ---: | ---: | ---: | --- |' : '',
    ...row.paragraphGroups.map(group => `| \`${group.key}\` | ${group.classification} | ${group.repeatIndexes.map(String).join(', ') || 'none'} | ${group.checkerFacingCount} | ${group.wrapperPathCount} | ${group.boundaryCount} | ${group.stateMatchesAnalyzerField ? 'yes' : 'no'} |`),
    '',
  ].filter(Boolean).join('\n')).join('\n');

  return [
    '# Stage 86 Checker Evidence Classifier',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Decision: \`${report.decision.classification}\``,
    `Recommended next work: \`${report.decision.recommendedNextWork}\``,
    '',
    '## Decision Reasons',
    '',
    ...report.decision.reasons.map(reason => `- ${reason}`),
    '',
    '## Row Summaries',
    '',
    rows,
    '',
  ].join('\n');
}

function parseArgs(argv: string[]): { out: string; repeatCount: number; inputs: Array<{ id: string; pdfPath: string }> } {
  const args = {
    out: DEFAULT_OUT,
    repeatCount: DEFAULT_REPEAT_COUNT,
    inputs: [...DEFAULT_INPUTS],
  };
  let pendingId: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const next = argv[i + 1];
    if (arg === '--out') {
      if (!next) throw new Error('Missing value for --out');
      args.out = next;
      i += 1;
      continue;
    }
    if (arg === '--repeat') {
      if (!next) throw new Error('Missing value for --repeat');
      args.repeatCount = Math.max(1, Number.parseInt(next, 10) || DEFAULT_REPEAT_COUNT);
      i += 1;
      continue;
    }
    if (arg === '--pdf') {
      if (!next) throw new Error('Missing value for --pdf');
      pendingId = `pdf-${args.inputs.length + 1}`;
      args.inputs.push({ id: pendingId, pdfPath: next });
      i += 1;
      continue;
    }
    if (arg === '--id') {
      if (!next) throw new Error('Missing value for --id');
      if (!pendingId) throw new Error('--id must follow --pdf');
      args.inputs[args.inputs.length - 1]!.id = next;
      pendingId = null;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });

  const rows: RowReport[] = [];
  for (const input of args.inputs) {
    const repeats: Array<{ repeat: number; score: number | null; grade: string | null; snapshot: JsonRecord }> = [];
    for (let repeat = 1; repeat <= args.repeatCount; repeat += 1) {
      const outcome = await analyzePdf(resolve(input.pdfPath), basename(input.pdfPath), { bypassCache: true });
      repeats.push({
        repeat,
        score: outcome.result.score ?? null,
        grade: outcome.result.grade ?? null,
        snapshot: outcome.snapshot as unknown as JsonRecord,
      });
    }
    rows.push(summarizeRow(input.id, input.pdfPath, repeats, args.repeatCount));
  }

  const checkerFacingGroupCount = rows.reduce((sum, row) => sum + row.checkerFacingGroupCount, 0);
  const wrapperPathGroupCount = rows.reduce((sum, row) => sum + row.wrapperPathGroupCount, 0);
  const boundaryGroupCount = rows.reduce((sum, row) => sum + row.boundaryGroupCount, 0);
  const fieldCoverage = rows.reduce((sum, row) => sum + row.analyzerFieldCoverage, 0);
  const reasons = boundaryGroupCount > 0
    ? [
        'the analyzer now emits an explicit evidenceState field for table/paragraph records, and the parked boundary candidate remains separate from wrapper/path artifacts',
        'this remains a narrow classifier implementation only; no routing, scorer, or gate semantics changed',
        `sampled counts: checker-facing=${checkerFacingGroupCount}, wrapper/path=${wrapperPathGroupCount}, boundary=${boundaryGroupCount}, analyzer-field-coverage=${fieldCoverage}`,
      ]
    : [
        'the analyzer now emits an explicit evidenceState field for table/paragraph records and the sampled corpus contains only checker-facing and wrapper/path states',
        'this remains a narrow classifier implementation only; no routing, scorer, or gate semantics changed',
        `sampled counts: checker-facing=${checkerFacingGroupCount}, wrapper/path=${wrapperPathGroupCount}, boundary=${boundaryGroupCount}, analyzer-field-coverage=${fieldCoverage}`,
      ];

  const report: Stage86Report = {
    generatedAt: new Date().toISOString(),
    repeatCount: args.repeatCount,
    inputs: args.inputs.map(input => ({ id: input.id, pdfPath: input.pdfPath })),
    rows,
    decision: {
      classification: 'implemented',
      recommendedNextWork: 'Stage 87 boundary handling or acceptance reuse only after the parked boundary candidate is explained in repeat evidence',
      reasons,
    },
  };

  await writeFile(join(outDir, 'stage86-checker-evidence-classifier.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'stage86-checker-evidence-classifier.md'), `${renderMarkdown(report)}\n`);

  console.log(`Wrote ${join(args.out, 'stage86-checker-evidence-classifier.json')}`);
  console.log(`Wrote ${join(args.out, 'stage86-checker-evidence-classifier.md')}`);
  console.log(`Decision: ${report.decision.classification}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

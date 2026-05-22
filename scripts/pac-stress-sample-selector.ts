#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_PARITY_MAP = 'Output/pac-poc-parity-gap-map-2026-05-22-r1/pac-poc-parity-gap-map.json';
const DEFAULT_LANE_ROLLUP = 'Output/pac-poc-lane-rollup-2026-05-22-r1/pac-poc-lane-rollup.json';
const DEFAULT_VALIDATION = 'Output/pac-poc-validation-checkpoint-2026-05-22-r2/pac-poc-validation-checkpoint.json';
const DEFAULT_OUTSIDE_LOW_ROW = '/mnt/pdf-review/pdfaf-validation/virginia-dcjs-low-row-diagnostic-2026-05-21-r1/outside-holdout-low-row-diagnostic.json';
const DEFAULT_TABLE_TARGET = '/mnt/pdf-review/pdfaf-table-diagnostics/table-target-resolution-2026-05-21-r1/table-target-resolution-diagnostic.json';
const DEFAULT_FONT_CMAP = '/mnt/pdf-review/pdfaf-font-cmap-diagnostics/font-cmap-scoring-hardening-2026-05-21-r1/font-cmap-scoring-hardening.json';
const DEFAULT_CONTRAST = '/mnt/pdf-review/pdfaf-contrast-diagnostics/rendered-contrast-opt-in-2026-05-21-r1/rendered-contrast-opt-in.json';
const DEFAULT_OUT = 'Output/pac-stress-sample-selector-2026-05-22-r1';

export type PacStressCandidateKind =
  | 'object_backed_table_parenttree_targets'
  | 'true_rendered_contrast_controls'
  | 'direct_language_parts_syntax'
  | 'font_cmap_unicode_extraction';

export type PacStressCandidateStatus =
  | 'sample_ready'
  | 'needs_better_controls'
  | 'no_current_positive_evidence'
  | 'already_covered_or_low_impact';

export type PacStressDecisionStatus =
  | 'build_object_backed_table_parenttree_stress_sample'
  | 'build_contrast_ground_truth_sample'
  | 'build_direct_language_syntax_sample'
  | 'validation_first'
  | 'no_sample_ready';

export interface PacStressSampleCandidate {
  kind: PacStressCandidateKind;
  status: PacStressCandidateStatus;
  priority: number;
  behaviorReady: boolean;
  estimatedRecoverablePoints: number;
  reasons: string[];
  positives: string[];
  blockers: string[];
  controls: string[];
  requiredEvidence: string[];
  promotionGate: string[];
}

export interface PacStressSampleSelectorReport {
  generatedAt: string;
  inputs: Record<string, string | null>;
  sourceDecisions: {
    parityMap: string | null;
    laneRollup: string | null;
    validation: string | null;
  };
  decision: {
    status: PacStressDecisionStatus;
    selectedKind: PacStressCandidateKind | null;
    reasons: string[];
  };
  candidates: PacStressSampleCandidate[];
}

interface SelectorInputs {
  parityMap?: unknown;
  laneRollup?: unknown;
  validation?: unknown;
  outsideLowRow?: unknown;
  tableTarget?: unknown;
  fontCmap?: unknown;
  contrast?: unknown;
  inputPaths?: Record<string, string | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function decisionStatus(raw: unknown): string | null {
  if (!isRecord(raw) || !isRecord(raw['decision'])) return null;
  return stringValue(raw['decision']['status']);
}

function laneById(raw: unknown, id: string): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  return records(raw['lanes']).find(lane => lane['id'] === id) ?? null;
}

function validationFailedScopes(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  return records(raw['scopes'])
    .filter(scope => scope['status'] === 'fail')
    .map(scope => stringValue(scope['scope']) ?? 'unknown');
}

function candidateClassPoints(raw: unknown, candidateClass: string): number {
  if (!isRecord(raw)) return 0;
  return records(raw['laneSummary'])
    .filter(row => row['candidateClass'] === candidateClass)
    .reduce((sum, row) => sum + numberValue(row['rawPointsToTarget']), 0);
}

function candidateClassFiles(raw: unknown, candidateClass: string): string[] {
  if (!isRecord(raw)) return [];
  return records(raw['laneSummary'])
    .filter(row => row['candidateClass'] === candidateClass)
    .flatMap(row => stringArray(row['files']));
}

function lowRowsWithClass(raw: unknown, classes: Set<string>): string[] {
  if (!isRecord(raw)) return [];
  return records(raw['lowRows'])
    .filter(row => typeof row['candidateClass'] === 'string' && classes.has(row['candidateClass']))
    .map(row => stringValue(row['file']) ?? 'unknown');
}

function parseReasonCount(reasons: unknown, prefix: string): number {
  for (const reason of stringArray(reasons)) {
    if (reason.startsWith(prefix)) {
      const value = Number(reason.slice(prefix.length));
      return Number.isFinite(value) ? value : 0;
    }
  }
  return 0;
}

function controlRowsFromTableTarget(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  return records(raw['rows'])
    .filter(row => row['role'] === 'control')
    .map(row => stringValue(row['id']) ?? 'unknown');
}

function nonTableRowsFromTableTarget(raw: unknown): string[] {
  if (!isRecord(raw) || !isRecord(raw['summary'])) return [];
  return stringArray(raw['summary']['nonTableAttemptRows']);
}

function stableFocusRowsFromTableTarget(raw: unknown): string[] {
  if (!isRecord(raw) || !isRecord(raw['summary'])) return [];
  return stringArray(raw['summary']['stableFocusCandidates']);
}

function unsafeControlRowsFromTableTarget(raw: unknown): string[] {
  if (!isRecord(raw) || !isRecord(raw['summary'])) return [];
  return stringArray(raw['summary']['unsafeControlCandidates']);
}

function firstMatchingCandidate(
  candidates: PacStressSampleCandidate[],
  kinds: PacStressCandidateKind[],
): PacStressSampleCandidate | null {
  return candidates
    .filter(candidate => candidate.status === 'sample_ready')
    .sort((a, b) => b.priority - a.priority || b.estimatedRecoverablePoints - a.estimatedRecoverablePoints)
    .find(candidate => kinds.includes(candidate.kind)) ?? null;
}

export function buildPacStressSampleSelectorReport(inputs: SelectorInputs): PacStressSampleSelectorReport {
  const parityMapDecision = decisionStatus(inputs.parityMap);
  const laneRollupDecision = decisionStatus(inputs.laneRollup);
  const validationDecision = decisionStatus(inputs.validation);
  const failedScopes = validationFailedScopes(inputs.validation);
  const tableLane = laneById(inputs.parityMap, 'table_header_transaction');
  const tableRollupLane = laneById(inputs.laneRollup, 'table_header_transaction');
  const contrastRollupLane = laneById(inputs.laneRollup, 'rendered_contrast_opt_in');
  const fontRollupLane = laneById(inputs.laneRollup, 'font_cmap_scoring_hardening');
  const languageLane = laneById(inputs.parityMap, 'language_parts_validation');

  const tablePoints = candidateClassPoints(inputs.outsideLowRow, 'table_target_resolution_needed');
  const tableNearMissPoints = candidateClassPoints(inputs.outsideLowRow, 'near_miss_monitor');
  const tablePositiveFiles = [
    ...candidateClassFiles(inputs.outsideLowRow, 'table_target_resolution_needed'),
    ...lowRowsWithClass(inputs.outsideLowRow, new Set(['near_miss_monitor']))
      .filter(file => file.includes('traffic-stop') || file.includes('table')),
  ];
  const stableTableRows = stableFocusRowsFromTableTarget(inputs.tableTarget);
  const nonTableRows = nonTableRowsFromTableTarget(inputs.tableTarget);
  const unsafeTableControls = unsafeControlRowsFromTableTarget(inputs.tableTarget);
  const tableControls = controlRowsFromTableTarget(inputs.tableTarget);
  const tableLaneStatus = stringValue(tableLane?.['status']) ?? 'unknown';
  const tableLatestDecision = stringValue(tableRollupLane?.['latestDecision']) ?? 'unknown';
  const tableAcceptedBaseline =
    tableLaneStatus === 'mostly_aligned_monitor' &&
    tableLatestDecision === 'accept_report_scale_object_backed_table_proof';
  const tableSampleReady =
    !tableAcceptedBaseline &&
    tablePoints >= 20 &&
    nonTableRows.length > 0 &&
    unsafeTableControls.length === 0;

  const contrastReasons = isRecord(inputs.contrast) && isRecord(inputs.contrast['decision'])
    ? inputs.contrast['decision']['reasons']
    : [];
  const contrastLowFocus = parseReasonCount(contrastReasons, 'low_focus=');
  const contrastLowControls = parseReasonCount(contrastReasons, 'low_controls=');

  const fontReasons = isRecord(inputs.fontCmap) && isRecord(inputs.fontCmap['decision'])
    ? inputs.fontCmap['decision']['reasons']
    : [];
  const fontCandidateFocus = parseReasonCount(fontReasons, 'candidate_focus=');
  const replacementScoreActive = parseReasonCount(fontReasons, 'replacement_score_active=');

  const candidates: PacStressSampleCandidate[] = [
    {
      kind: 'object_backed_table_parenttree_targets',
      status: tableSampleReady ? 'sample_ready' : 'no_current_positive_evidence',
      priority: 100,
      behaviorReady: false,
      estimatedRecoverablePoints: tablePoints + tableNearMissPoints,
      reasons: [
        `table_lane_status=${tableLaneStatus}`,
        `table_rollup=${tableLatestDecision}`,
        `accepted_table_baseline=${tableAcceptedBaseline}`,
        `outside_table_points=${tablePoints}`,
        `stable_table_rows=${stableTableRows.length}`,
        `non_table_blockers=${nonTableRows.length}`,
        `unsafe_table_controls=${unsafeTableControls.length}`,
      ],
      positives: [...new Set([...tablePositiveFiles, ...stableTableRows])],
      blockers: nonTableRows,
      controls: tableControls,
      requiredEvidence: [
        'native analysis confirms requested target refs resolve to /Table immediately before mutation',
        'PAC table/header debt is present before mutation and reduced after the existing table tool sequence',
        'dense row-band evidence is only supporting evidence, not the admission predicate',
        'pre-mutation object refs are stable across at least two positives',
      ],
      promotionGate: [
        'at least two positive rows get accepted final table/PAC debt reduction',
        'zero original/control rows schedule the table transaction from layout evidence alone',
        'false_positive_applied=0',
        'no new hard timeout or p95 regression beyond max(3%, 5s)',
        'fresh original-50 deterministic validation before acceptance',
      ],
    },
    {
      kind: 'true_rendered_contrast_controls',
      status: contrastLowControls > 0 ? 'needs_better_controls' : 'no_current_positive_evidence',
      priority: 72,
      behaviorReady: false,
      estimatedRecoverablePoints: 0,
      reasons: [
        `contrast_rollup=${stringValue(contrastRollupLane?.['latestDecision']) ?? 'unknown'}`,
        `low_focus=${contrastLowFocus}`,
        `low_controls=${contrastLowControls}`,
      ],
      positives: contrastLowFocus > 0 ? ['existing focus rows need visual ground truth before scoring'] : [],
      blockers: contrastLowControls > 0 ? ['current sampler flags clean/accessibility controls'] : [],
      controls: contrastLowControls > 0 ? ['Teams/accessibility controls from contrast diagnostic'] : [],
      requiredEvidence: [
        'known true low-contrast positives with visual confirmation',
        'known clean controls that do not trigger',
        'foreground/background sampling excludes glyph antialiasing and page furniture artifacts',
      ],
      promotionGate: [
        'opt-in diagnostic remains separate from default analyze/remediate',
        'no score-active contrast cap until clean controls pass',
      ],
    },
    {
      kind: 'direct_language_parts_syntax',
      status: stringValue(languageLane?.['status']) === 'mostly_aligned_monitor'
        ? 'already_covered_or_low_impact'
        : 'no_current_positive_evidence',
      priority: 58,
      behaviorReady: false,
      estimatedRecoverablePoints: 0,
      reasons: [
        `language_lane_status=${stringValue(languageLane?.['status']) ?? 'unknown'}`,
        'direct_document_and_structure_lang_syntax_already_score_active',
        'heuristic_language_parts_have_no_safe_positive_sample',
      ],
      positives: [],
      blockers: ['no malformed explicit language-of-parts sample is currently identified'],
      controls: [],
      requiredEvidence: [
        'explicit malformed /Lang on structure, text object, alt/actual text, annotation, form, or outline object',
        'inherited language context is resolved without semantic language guessing',
      ],
      promotionGate: [
        'direct explicit syntax only; no semantic language detection in deterministic scoring',
        'controls with inherited valid language remain stable',
      ],
    },
    {
      kind: 'font_cmap_unicode_extraction',
      status: fontCandidateFocus > 0 || replacementScoreActive > 0
        ? 'sample_ready'
        : 'no_current_positive_evidence',
      priority: 52,
      behaviorReady: false,
      estimatedRecoverablePoints: 0,
      reasons: [
        `font_rollup=${stringValue(fontRollupLane?.['latestDecision']) ?? 'unknown'}`,
        `candidate_focus=${fontCandidateFocus}`,
        `replacement_score_active=${replacementScoreActive}`,
      ],
      positives: fontCandidateFocus > 0 ? ['font/CMap focus rows with true extraction debt'] : [],
      blockers: fontCandidateFocus === 0 ? ['sampled CMap syntax debt has clean extracted text and zero replacement-character ratio'] : [],
      controls: [],
      requiredEvidence: [
        'Unicode extraction failure beyond U+FFFD replacement-character ratio',
        'controls with syntax-only CMap debt and clean extracted text stay stable',
      ],
      promotionGate: [
        'do not cap syntax-only CMap debt',
        'score movement must be reported as stricter text-extraction grading',
      ],
    },
  ];

  const selected = firstMatchingCandidate(candidates, [
    'object_backed_table_parenttree_targets',
    'true_rendered_contrast_controls',
    'direct_language_parts_syntax',
    'font_cmap_unicode_extraction',
  ]);
  const decisionStatusForSelected: PacStressDecisionStatus = selected?.kind === 'object_backed_table_parenttree_targets'
    ? 'build_object_backed_table_parenttree_stress_sample'
    : selected?.kind === 'true_rendered_contrast_controls'
      ? 'build_contrast_ground_truth_sample'
      : selected?.kind === 'direct_language_parts_syntax'
        ? 'build_direct_language_syntax_sample'
        : failedScopes.length > 0
          ? 'validation_first'
          : 'no_sample_ready';

  return {
    generatedAt: new Date().toISOString(),
    inputs: inputs.inputPaths ?? {},
    sourceDecisions: {
      parityMap: parityMapDecision,
      laneRollup: laneRollupDecision,
      validation: validationDecision,
    },
    decision: {
      status: decisionStatusForSelected,
      selectedKind: selected?.kind ?? null,
      reasons: [
        `parity=${parityMapDecision ?? 'unknown'}`,
        `rollup=${laneRollupDecision ?? 'unknown'}`,
        `validation=${validationDecision ?? 'unknown'}`,
        failedScopes.length ? `failed_scopes=${failedScopes.join(',')}` : 'failed_scopes=none',
        selected ? `selected=${selected.kind}` : 'selected=none',
      ],
    },
    candidates,
  };
}

function mdEscape(value: string | number | boolean | null | undefined): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function inlineList(values: string[]): string {
  return values.length ? values.map(value => `\`${value}\``).join(', ') : 'none';
}

function blockList(values: string[]): string[] {
  return values.length ? values.map(value => `- ${value}`) : ['- none'];
}

export function renderPacStressSampleSelectorMarkdown(report: PacStressSampleSelectorReport): string {
  const lines = [
    '# PAC Stress Sample Selector',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Decision: \`${report.decision.status}\``,
    `- Selected kind: ${report.decision.selectedKind ? `\`${report.decision.selectedKind}\`` : '`none`'}`,
    `- Source decisions: parity=\`${report.sourceDecisions.parityMap ?? 'unknown'}\`, rollup=\`${report.sourceDecisions.laneRollup ?? 'unknown'}\`, validation=\`${report.sourceDecisions.validation ?? 'unknown'}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'This selector is diagnostic/planning only. It reads existing JSON reports and does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java, call semantic AI, or change production scoring/planning behavior.',
    '',
    '## Candidate Summary',
    '',
    '| Priority | Kind | Status | Behavior Ready | Est. Points | Positives | Blockers | Controls |',
    '| ---: | --- | --- | --- | ---: | --- | --- | --- |',
  ];
  for (const candidate of [...report.candidates].sort((a, b) => b.priority - a.priority)) {
    lines.push([
      candidate.priority,
      `\`${candidate.kind}\``,
      candidate.status,
      String(candidate.behaviorReady),
      candidate.estimatedRecoverablePoints,
      inlineList(candidate.positives.slice(0, 6)),
      inlineList(candidate.blockers.slice(0, 6)),
      inlineList(candidate.controls.slice(0, 6)),
    ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Selected Sample Plan', '');
  const selected = report.candidates.find(candidate => candidate.kind === report.decision.selectedKind);
  if (!selected) {
    lines.push('No sample is ready from the current evidence.', '');
  } else {
    lines.push(
      `### ${selected.kind}`,
      '',
      `- Status: \`${selected.status}\``,
      `- Behavior ready now: \`${selected.behaviorReady}\``,
      `- Estimated recoverable points: \`${selected.estimatedRecoverablePoints}\``,
      `- Reasons: ${selected.reasons.map(reason => `\`${reason}\``).join(', ')}`,
      '',
      'Required positives:',
      ...blockList(selected.positives),
      '',
      'Known blockers / negative examples:',
      ...blockList(selected.blockers),
      '',
      'Controls:',
      ...blockList(selected.controls),
      '',
      'Required evidence before any behavior stage:',
      ...blockList(selected.requiredEvidence),
      '',
      'Promotion gates:',
      ...blockList(selected.promotionGate),
      '',
    );
  }
  lines.push('## Inputs', '');
  for (const [key, value] of Object.entries(report.inputs)) {
    lines.push(`- ${key}: ${value ? `\`${value}\`` : '`missing`'}`);
  }
  return `${lines.join('\n')}\n`;
}

async function readJsonIfPresent(path: string | undefined): Promise<unknown> {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  } catch {
    return null;
  }
}

export async function writePacStressSampleSelectorReport(paths: Record<string, string>, outDir: string): Promise<PacStressSampleSelectorReport> {
  const inputPaths = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, value ? resolve(value) : null]));
  const report = buildPacStressSampleSelectorReport({
    parityMap: await readJsonIfPresent(paths.parityMap),
    laneRollup: await readJsonIfPresent(paths.laneRollup),
    validation: await readJsonIfPresent(paths.validation),
    outsideLowRow: await readJsonIfPresent(paths.outsideLowRow),
    tableTarget: await readJsonIfPresent(paths.tableTarget),
    fontCmap: await readJsonIfPresent(paths.fontCmap),
    contrast: await readJsonIfPresent(paths.contrast),
    inputPaths,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-stress-sample-selector.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-stress-sample-selector.md'), renderPacStressSampleSelectorMarkdown(report), 'utf8');
  return report;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/pac-stress-sample-selector.ts [options]

Options:
  --parity-map <path>      PAC/POC parity gap map JSON
  --lane-rollup <path>     PAC/POC lane rollup JSON
  --validation <path>      PAC/POC validation checkpoint JSON
  --outside-low-row <path> outside holdout low-row diagnostic JSON
  --table-target <path>    table target-resolution diagnostic JSON
  --font-cmap <path>       font/CMap diagnostic JSON
  --contrast <path>        rendered contrast diagnostic JSON
  --out <dir>              output directory (default: ${DEFAULT_OUT})
  --help                   show this help`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const paths = {
    parityMap: argValue('--parity-map') ?? DEFAULT_PARITY_MAP,
    laneRollup: argValue('--lane-rollup') ?? DEFAULT_LANE_ROLLUP,
    validation: argValue('--validation') ?? DEFAULT_VALIDATION,
    outsideLowRow: argValue('--outside-low-row') ?? DEFAULT_OUTSIDE_LOW_ROW,
    tableTarget: argValue('--table-target') ?? DEFAULT_TABLE_TARGET,
    fontCmap: argValue('--font-cmap') ?? DEFAULT_FONT_CMAP,
    contrast: argValue('--contrast') ?? DEFAULT_CONTRAST,
  };
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const report = await writePacStressSampleSelectorReport(paths, outDir);
  console.log(`[pac-stress-selector] wrote ${join(outDir, 'pac-stress-sample-selector.md')}`);
  console.log(`[pac-stress-selector] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

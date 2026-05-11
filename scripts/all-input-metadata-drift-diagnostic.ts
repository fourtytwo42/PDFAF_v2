#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_SEARCH_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/metadata-drift-diagnostic-r5-complete-2026-05-11-r1';

const METADATA_TOOLS = new Set(['set_document_language', 'set_document_title']);

type MetadataDriftClass =
  | 'same_state_alternate_applied'
  | 'metadata_reanalysis_drift_candidate'
  | 'unsafe_or_inconclusive_metadata_regression';

interface BaselineReport {
  rows?: BaselineRow[];
}

interface BaselineRow {
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  durationMs?: number;
  falsePositiveApplied?: number;
  appliedTools?: ToolRow[];
}

interface ToolRow {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  details?: string;
}

interface ReplayState {
  stateSignatureBefore?: string;
  stateSignatureAfter?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  categoryScoresBefore?: Record<string, number>;
  categoryScoresAfter?: Record<string, number>;
  detectionSignalsBefore?: Record<string, number | boolean>;
  detectionSignalsAfter?: Record<string, number | boolean>;
}

interface ParsedTool {
  file: string;
  runDir: string;
  toolName: string;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  rawReason: string;
  replayState: ReplayState | null;
}

export interface MetadataDriftRow {
  file: string;
  runDir: string;
  toolName: string;
  replayState: string;
  scoreBefore: number;
  attemptedScoreAfter: number;
  titleLanguageBefore: number | null;
  titleLanguageAfter: number | null;
  headingBefore: number | null;
  headingAfter: number | null;
  readingBefore: number | null;
  readingAfter: number | null;
  rawReason: string;
  alternateAppliedRun: string | null;
  alternateAppliedScoreAfter: number | null;
  classification: MetadataDriftClass;
  rationale: string;
}

export interface MetadataDriftReport {
  generatedAt: string;
  searchRoot: string;
  summary: {
    reportCount: number;
    rejectedMetadataRows: number;
    sameStateAlternateApplied: number;
    metadataReanalysisDriftCandidates: number;
    unsafeOrInconclusive: number;
    affectedFiles: string[];
  };
  rows: MetadataDriftRow[];
}

function parseArgs(argv: string[]): { searchRoot: string; out: string } {
  let searchRoot = DEFAULT_SEARCH_ROOT;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--search-root' && next) {
      searchRoot = next;
      i += 1;
    } else if (arg === '--out' && next) {
      out = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-metadata-drift-diagnostic.ts [--search-root <dir>] [--out <dir>]',
        '',
        `Defaults: --search-root ${DEFAULT_SEARCH_ROOT} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { searchRoot, out };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseDetails(details: string | undefined): { rawReason: string; replayState: ReplayState | null } {
  if (!details) return { rawReason: '', replayState: null };
  try {
    const parsed = JSON.parse(details) as unknown;
    if (!isRecord(parsed)) return { rawReason: details, replayState: null };
    const debug = isRecord(parsed.debug) ? parsed.debug : {};
    const replay = isRecord(debug.replayState) ? debug.replayState as ReplayState : null;
    return {
      rawReason: typeof parsed.raw === 'string' ? parsed.raw : typeof parsed.outcome === 'string' ? parsed.outcome : '',
      replayState: replay,
    };
  } catch {
    return { rawReason: details, replayState: null };
  }
}

function category(replay: ReplayState | null, phase: 'before' | 'after', key: string): number | null {
  const scores = phase === 'before' ? replay?.categoryScoresBefore : replay?.categoryScoresAfter;
  return numberOrNull(scores?.[key]);
}

function score(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function findReports(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name === 'baseline_report.json') out.push(path);
    }
  }
  await visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function readRows(reportPath: string): Promise<BaselineRow[]> {
  const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as BaselineReport | BaselineRow[];
  return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
}

function toolKey(file: string, tool: string, state: string): string {
  return `${basename(file)}::${tool}::${state}`;
}

function parseTool(row: BaselineRow, runDir: string, tool: ToolRow): ParsedTool | null {
  if (!row.file || !tool.toolName || !METADATA_TOOLS.has(tool.toolName)) return null;
  const details = parseDetails(tool.details);
  return {
    file: row.file,
    runDir,
    toolName: tool.toolName,
    outcome: tool.outcome ?? '',
    scoreBefore: score(tool.scoreBefore),
    scoreAfter: score(tool.scoreAfter),
    rawReason: details.rawReason,
    replayState: details.replayState,
  };
}

function classifyRejected(tool: ParsedTool, alternate: ParsedTool | undefined): Pick<MetadataDriftRow, 'classification' | 'rationale'> {
  const replay = tool.replayState;
  const titleBefore = category(replay, 'before', 'title_language') ?? 0;
  const titleAfter = category(replay, 'after', 'title_language') ?? 0;
  const headingBefore = category(replay, 'before', 'heading_structure') ?? 0;
  const headingAfter = category(replay, 'after', 'heading_structure') ?? 0;
  const hasMetadataGain = titleAfter > titleBefore;
  const hasUnrelatedStructureDrop = headingAfter < headingBefore;

  if (alternate) {
    return {
      classification: 'same_state_alternate_applied',
      rationale: 'The same file/tool/replay state was accepted in another run, so this is a concrete same-state analyzer-drift probe candidate.',
    };
  }
  if (hasMetadataGain && hasUnrelatedStructureDrop && /^stage_regressed_score/.test(tool.rawReason)) {
    return {
      classification: 'metadata_reanalysis_drift_candidate',
      rationale: 'Metadata improved while unrelated heading evidence dropped during reanalysis; needs PDF/object proof before any acceptance change.',
    };
  }
  return {
    classification: 'unsafe_or_inconclusive_metadata_regression',
    rationale: 'Rejected metadata mutation does not show a clean metadata-gain plus unrelated-structure-drop shape.',
  };
}

export async function buildMetadataDriftReport(input: {
  searchRoot: string;
  generatedAt?: string;
}): Promise<MetadataDriftReport> {
  const reports = await findReports(input.searchRoot);
  const metadataTools: ParsedTool[] = [];
  for (const reportPath of reports) {
    const runDir = reportPath.replace(/\/baseline_report\.json$/, '');
    for (const row of await readRows(reportPath)) {
      for (const tool of row.appliedTools ?? []) {
        const parsed = parseTool(row, runDir, tool);
        if (parsed) metadataTools.push(parsed);
      }
    }
  }

  const appliedByState = new Map<string, ParsedTool>();
  for (const tool of metadataTools) {
    const state = tool.replayState?.stateSignatureBefore;
    if (!state || tool.outcome !== 'applied') continue;
    const key = toolKey(tool.file, tool.toolName, state);
    const old = appliedByState.get(key);
    if (!old || tool.scoreAfter > old.scoreAfter) appliedByState.set(key, tool);
  }

  const rawRows: MetadataDriftRow[] = [];
  for (const tool of metadataTools) {
    if (tool.outcome !== 'rejected') continue;
    const state = tool.replayState?.stateSignatureBefore;
    if (!state) continue;
    const alternate = appliedByState.get(toolKey(tool.file, tool.toolName, state));
    const decision = classifyRejected(tool, alternate);
    rawRows.push({
      file: tool.file,
      runDir: tool.runDir,
      toolName: tool.toolName,
      replayState: state,
      scoreBefore: tool.scoreBefore,
      attemptedScoreAfter: tool.replayState?.scoreAfter ?? tool.scoreAfter,
      titleLanguageBefore: category(tool.replayState, 'before', 'title_language'),
      titleLanguageAfter: category(tool.replayState, 'after', 'title_language'),
      headingBefore: category(tool.replayState, 'before', 'heading_structure'),
      headingAfter: category(tool.replayState, 'after', 'heading_structure'),
      readingBefore: category(tool.replayState, 'before', 'reading_order'),
      readingAfter: category(tool.replayState, 'after', 'reading_order'),
      rawReason: tool.rawReason,
      alternateAppliedRun: alternate?.runDir ?? null,
      alternateAppliedScoreAfter: alternate?.scoreAfter ?? null,
      classification: decision.classification,
      rationale: decision.rationale,
    });
  }

  const deduped = new Map<string, MetadataDriftRow>();
  for (const row of rawRows) {
    const key = `${basename(row.file)}::${row.toolName}::${row.replayState}::${row.classification}::${row.rawReason}`;
    const old = deduped.get(key);
    if (!old ||
      row.scoreBefore > old.scoreBefore ||
      (row.scoreBefore === old.scoreBefore && (row.alternateAppliedScoreAfter ?? -1) > (old.alternateAppliedScoreAfter ?? -1))) {
      deduped.set(key, row);
    }
  }

  const rows = [...deduped.values()].sort((a, b) =>
    a.classification.localeCompare(b.classification) ||
    b.scoreBefore - a.scoreBefore ||
    a.file.localeCompare(b.file) ||
    a.toolName.localeCompare(b.toolName));

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    searchRoot: input.searchRoot,
    summary: {
      reportCount: reports.length,
      rejectedMetadataRows: rows.length,
      sameStateAlternateApplied: rows.filter(row => row.classification === 'same_state_alternate_applied').length,
      metadataReanalysisDriftCandidates: rows.filter(row => row.classification === 'metadata_reanalysis_drift_candidate').length,
      unsafeOrInconclusive: rows.filter(row => row.classification === 'unsafe_or_inconclusive_metadata_regression').length,
      affectedFiles: [...new Set(rows.map(row => row.file))].sort((a, b) => a.localeCompare(b)),
    },
    rows,
  };
}

function tableCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function renderMarkdown(report: MetadataDriftReport): string {
  const lines: string[] = [];
  lines.push('# All-Input Metadata Drift Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Search root: \`${report.searchRoot}\``);
  lines.push(`- Reports scanned: \`${report.summary.reportCount}\``);
  lines.push(`- Rejected metadata rows with replay state: \`${report.summary.rejectedMetadataRows}\``);
  lines.push(`- Same-state alternate-applied candidates: \`${report.summary.sameStateAlternateApplied}\``);
  lines.push(`- Metadata reanalysis drift candidates: \`${report.summary.metadataReanalysisDriftCandidates}\``);
  lines.push(`- Unsafe/inconclusive: \`${report.summary.unsafeOrInconclusive}\``);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Class | File | Tool | Score | Title language | Heading | Reading | State | Alternate | Reason |');
  lines.push('| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows.slice(0, 100)) {
    lines.push([
      `\`${row.classification}\``,
      `\`${tableCell(row.file)}\``,
      `\`${row.toolName}\``,
      `${row.scoreBefore}->${row.attemptedScoreAfter}`,
      `${row.titleLanguageBefore ?? ''}->${row.titleLanguageAfter ?? ''}`,
      `${row.headingBefore ?? ''}->${row.headingAfter ?? ''}`,
      `${row.readingBefore ?? ''}->${row.readingAfter ?? ''}`,
      `\`${row.replayState}\``,
      row.alternateAppliedRun ? `\`${row.alternateAppliedRun}\`` : '',
      tableCell(row.rawReason),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  lines.push('## Decision Use');
  lines.push('');
  lines.push('This diagnostic is evidence-only. A metadata acceptance change would still need a targeted probe proving that the PDF bytes only changed document metadata, final page/text/tag/PAC evidence stays safe, and the resulting source reanalysis is stable.');
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const report = await buildMetadataDriftReport({ searchRoot: args.searchRoot });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'metadata-drift-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.out, 'metadata-drift-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

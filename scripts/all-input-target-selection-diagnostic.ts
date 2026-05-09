#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AllInputMeanDiagnostic, AllInputSummaryRow } from './all-input-mean-diagnostic.js';

const DEFAULT_ALL_INPUT = 'Output/goal-all-input-mean-2026-05-09-r1/all-input-mean-diagnostic.json';
const DEFAULT_POC = 'Output/goal-all-input-mean-2026-05-09-r1/poc-strong-lowest-40/poc-strong-rule-matrix.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/target-selection-diagnostic';

export type TargetSelectionClass =
  | 'heading_reading_recovery_target'
  | 'table_header_recovery_target'
  | 'content_tagging_recovery_target'
  | 'alt_recovery_target'
  | 'near_pass_runtime_target'
  | 'parked_runtime_debt'
  | 'needs_more_pac_object_evidence';

export interface PocRuleSignal {
  ruleId: string;
  category: string;
  confidence: string;
  status: string;
}

export interface TargetSelectionRow {
  file: string;
  score: number;
  grade: string;
  family: string;
  deficitTo93: number;
  durationMs: number | null;
  pocFailRules: PocRuleSignal[];
  pocFamilies: string[];
  classification: TargetSelectionClass;
  priority: number;
  rationale: string;
}

export interface TargetSelectionFamilySummary {
  classification: TargetSelectionClass;
  count: number;
  deficitTo93: number;
  files: string[];
}

export interface AllInputTargetSelectionDiagnostic {
  generatedAt: string;
  allInputSource: string;
  pocSource: string;
  summary: {
    candidateRows: number;
    selectedDirection: string;
    selectedPrimaryTargets: string[];
    selectedControlHints: string[];
  };
  rows: TargetSelectionRow[];
  familySummaries: TargetSelectionFamilySummary[];
}

interface PocFile {
  file: string;
  rules?: PocRuleSignal[];
}

function parseArgs(argv: string[]): { allInput: string; poc: string; out: string } {
  let allInput = DEFAULT_ALL_INPUT;
  let poc = DEFAULT_POC;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--all-input' && next) {
      allInput = next;
      i++;
    } else if (arg === '--poc' && next) {
      poc = next;
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-target-selection-diagnostic.ts [--all-input <all-input-mean-diagnostic.json>] [--poc <poc-rule-matrix.json>] [--out <dir>]',
        '',
        `Defaults: --all-input ${DEFAULT_ALL_INPUT} --poc ${DEFAULT_POC} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { allInput, poc, out };
}

function round(value: number, digits = 2): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function pocFamily(ruleId: string): string {
  if (ruleId.startsWith('pdfua.table.')) return 'table_headers';
  if (ruleId.startsWith('pdfua.content.')) return 'content_tagging';
  if (ruleId.startsWith('pdfua.structure.')) return 'structure_syntax_rolemap';
  if (ruleId.startsWith('pdfua.parent_tree.')) return 'parent_tree';
  if (ruleId.startsWith('pdfua.font.')) return 'fonts_cmap';
  if (ruleId.startsWith('pdfua.figure.')) return 'figure_alt';
  return 'other';
}

function buildPocByBasename(pocMatrix: unknown): Map<string, PocRuleSignal[]> {
  const files = ((pocMatrix as { files?: PocFile[] }).files ?? []);
  const map = new Map<string, PocRuleSignal[]>();
  for (const file of files) {
    const key = basename(file.file);
    const fails = (file.rules ?? [])
      .filter(rule => rule.status === 'fail')
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
    map.set(key, fails);
  }
  return map;
}

function classify(row: AllInputSummaryRow, pocFailRules: PocRuleSignal[]): { classification: TargetSelectionClass; rationale: string; priority: number } {
  const pocFamilies = new Set(pocFailRules.map(rule => pocFamily(rule.ruleId)));
  const duration = row.durationMs ?? 0;
  if (row.file.includes('structure-4438') || (row.score < 70 && duration >= 600_000)) {
    return {
      classification: 'parked_runtime_debt',
      rationale: 'Low score is entangled with known or extreme runtime/checkpoint debt; do not choose as first broad fixer target.',
      priority: 0,
    };
  }
  if (row.family === 'table_debt' || row.family === 'table_alt_mixed') {
    if (pocFamilies.has('table_headers')) {
      return {
        classification: 'table_header_recovery_target',
        rationale: 'Score deficit includes table debt and POC/PAC reports direct table header-association failures.',
        priority: row.deficitTo93 + 12,
      };
    }
    return {
      classification: 'needs_more_pac_object_evidence',
      rationale: 'Table-like score debt lacks matching lowest-40 PAC table evidence in the current matrix.',
      priority: row.deficitTo93,
    };
  }
  if (row.family === 'heading_reading_order') {
    if (pocFamilies.has('content_tagging') || pocFamilies.has('structure_syntax_rolemap') || pocFamilies.has('parent_tree')) {
      return {
        classification: 'heading_reading_recovery_target',
        rationale: 'Largest score family and PAC/POC shows structural/content evidence that can guide a safe object-level route diagnostic.',
        priority: row.deficitTo93 + 16,
      };
    }
    return {
      classification: 'heading_reading_recovery_target',
      rationale: 'Largest score family; needs remediated trace/object diagnostic before behavior.',
      priority: row.deficitTo93 + 8,
    };
  }
  if (row.family === 'alt_debt') {
    return {
      classification: 'alt_recovery_target',
      rationale: 'Alt score debt is score-moving but should be selected after checking figure object identity and PAC alt leaves.',
      priority: row.deficitTo93 + 6,
    };
  }
  if (pocFamilies.has('content_tagging')) {
    return {
      classification: 'content_tagging_recovery_target',
      rationale: 'PAC/POC reports direct text/image/path tagging failures that may explain reading/PDF-UA debt.',
      priority: row.deficitTo93 + 10,
    };
  }
  if (row.score >= 85) {
    return {
      classification: 'near_pass_runtime_target',
      rationale: 'Near-pass row; useful for p95/attempt cleanup after score-moving rows are selected.',
      priority: Math.max(1, row.deficitTo93 - 8),
    };
  }
  return {
    classification: 'needs_more_pac_object_evidence',
    rationale: 'Score-moving row needs more object-level PAC evidence before a safe behavior stage.',
    priority: row.deficitTo93,
  };
}

export function buildAllInputTargetSelectionDiagnostic(input: {
  allInput: AllInputMeanDiagnostic;
  pocMatrix?: unknown;
  allInputSource?: string;
  pocSource?: string;
  generatedAt?: string;
}): AllInputTargetSelectionDiagnostic {
  const pocByBase = buildPocByBasename(input.pocMatrix ?? {});
  const rows = input.allInput.lowestRows
    .map(row => {
      const pocFailRules = pocByBase.get(basename(row.file)) ?? [];
      const decision = classify(row, pocFailRules);
      return {
        file: row.file,
        score: row.score,
        grade: row.grade,
        family: row.family,
        deficitTo93: row.deficitTo93,
        durationMs: row.durationMs,
        pocFailRules,
        pocFamilies: sortedUnique(pocFailRules.map(rule => pocFamily(rule.ruleId))),
        classification: decision.classification,
        priority: round(decision.priority, 2),
        rationale: decision.rationale,
      };
    })
    .sort((a, b) => b.priority - a.priority || b.deficitTo93 - a.deficitTo93 || a.file.localeCompare(b.file));

  const familySummaries = sortedUnique(rows.map(row => row.classification))
    .map(classification => {
      const matching = rows.filter(row => row.classification === classification);
      return {
        classification,
        count: matching.length,
        deficitTo93: round(matching.reduce((sum, row) => sum + row.deficitTo93, 0), 1),
        files: matching.slice(0, 10).map(row => row.file),
      };
    })
    .sort((a, b) => b.deficitTo93 - a.deficitTo93 || b.count - a.count || a.classification.localeCompare(b.classification));

  const selectedDirection = familySummaries[0]?.classification ?? 'none';
  const selectedPrimaryTargets = rows
    .filter(row => row.classification === selectedDirection)
    .slice(0, 12)
    .map(row => row.file);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    allInputSource: input.allInputSource ?? '',
    pocSource: input.pocSource ?? '',
    summary: {
      candidateRows: rows.length,
      selectedDirection,
      selectedPrimaryTargets,
      selectedControlHints: input.allInput.lowestRows
        .filter(row => row.score >= 90)
        .slice(0, 8)
        .map(row => row.file),
    },
    rows,
    familySummaries,
  };
}

function renderMarkdown(report: AllInputTargetSelectionDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Target Selection Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- All-input source: \`${report.allInputSource}\``);
  lines.push(`- POC/PAC source: \`${report.pocSource}\``);
  lines.push(`- Candidate rows: ${report.summary.candidateRows}`);
  lines.push(`- Selected direction: \`${report.summary.selectedDirection}\``);
  lines.push('');
  lines.push('## Classification Summary');
  lines.push('');
  lines.push('| Classification | Count | Deficit | Top Files |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const item of report.familySummaries) {
    lines.push(`| ${item.classification} | ${item.count} | ${item.deficitTo93} | ${item.files.map(file => `\`${file}\``).join('<br>')} |`);
  }
  lines.push('');
  lines.push('## Ranked Rows');
  lines.push('');
  lines.push('| Priority | Score | Deficit | Class | File | POC Families | Top POC Fails |');
  lines.push('| ---: | ---: | ---: | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const rules = row.pocFailRules.slice(0, 5).map(rule => `\`${rule.ruleId}\``).join('<br>');
    lines.push(`| ${row.priority} | ${row.score} | ${row.deficitTo93} | ${row.classification} | \`${row.file}\` | ${row.pocFamilies.join(', ')} | ${rules} |`);
  }
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push('Use this report to choose a focused target subset before any behavior change. The selected direction is the highest-deficit class with PAC/POC evidence, not a mandate to mutate every row in that class.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const allInput = JSON.parse(await readFile(args.allInput, 'utf8')) as AllInputMeanDiagnostic;
  const pocMatrix = JSON.parse(await readFile(args.poc, 'utf8')) as unknown;
  const report = buildAllInputTargetSelectionDiagnostic({
    allInput,
    pocMatrix,
    allInputSource: args.allInput,
    pocSource: args.poc,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'target-selection-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'target-selection-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'target-selection-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage193SemanticAlt,
  type Stage193SemanticAltClass,
} from '../src/services/remediation/stage193SemanticAlt.js';
import type { CategoryKey } from '../src/types.js';

const DEFAULT_STAGE192 = 'Output/stage192-true-missing-alt-diagnostic-2026-05-03-r2/stage192-true-missing-alt-diagnostic.json';
const DEFAULT_OUT = 'Output/stage193-semantic-alt-diagnostic-2026-05-03-r1';

interface Stage192Record {
  id: string;
  publicationId?: string;
  title?: string;
  role?: string;
  analyzedPdf?: string;
  benchmark?: { falsePositiveApplied?: number };
}

interface Stage192Report {
  records: Stage192Record[];
}

const ALL_CLASSES: Stage193SemanticAltClass[] = [
  'semantic_alt_candidate',
  'rolemap_semantic_alt_candidate',
  'semantic_alt_blocked_by_structure',
  'semantic_alt_no_context',
  'semantic_alt_not_needed',
  'protected_or_analyzer_volatility',
  'no_semantic_alt_candidate',
];

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage193-semantic-alt-diagnostic.ts [options]

Options:
  --stage192 <path>  Stage192 diagnostic JSON (default: ${DEFAULT_STAGE192})
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --help             Show this help`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function categoryScore(categories: Array<{ key?: string; score?: number; applicable?: boolean }>, key: CategoryKey): number | null {
  const row = categories.find(category => category.key === key);
  return row?.applicable === false ? null : typeof row?.score === 'number' ? row.score : null;
}

function increment<T extends string>(map: Record<T, number>, key: T, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function mdTable(rows: string[][]): string {
  return rows.map(row => `| ${row.join(' | ')} |`).join('\n');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(usage());
    return;
  }
  const stage192Path = resolve(argValue('--stage192') ?? DEFAULT_STAGE192);
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const report = JSON.parse(await readFile(stage192Path, 'utf8')) as Stage192Report;
  await mkdir(outDir, { recursive: true });

  const rowDistribution = Object.fromEntries(ALL_CLASSES.map(key => [key, 0])) as Record<Stage193SemanticAltClass, number>;
  const contextDistribution = Object.fromEntries(ALL_CLASSES.map(key => [key, 0])) as Record<Stage193SemanticAltClass, number>;
  const records = [];

  for (const record of report.records ?? []) {
    const pdf = record.analyzedPdf ? resolve(record.analyzedPdf) : '';
    if (!pdf || !(await exists(pdf))) {
      records.push({
        ...record,
        analyzed: null,
        stage193: null,
        error: 'analyzed PDF unavailable',
      });
      continue;
    }
    const { result, snapshot } = await analyzePdf(pdf, basename(pdf));
    const decision = classifyStage193SemanticAlt({
      analysis: result,
      snapshot,
      filename: basename(pdf),
      parked: record.role === 'parked',
      falsePositiveApplied: record.benchmark?.falsePositiveApplied ?? 0,
    });
    increment(rowDistribution, decision.rowClassification);
    for (const context of decision.contexts) increment(contextDistribution, context.classification);
    records.push({
      ...record,
      analyzed: {
        score: result.score,
        grade: result.grade,
        pdfClass: result.pdfClass,
      },
      categories: {
        heading_structure: categoryScore(result.categories, 'heading_structure'),
        reading_order: categoryScore(result.categories, 'reading_order'),
        alt_text: categoryScore(result.categories, 'alt_text'),
        table_markup: categoryScore(result.categories, 'table_markup'),
        pdf_ua_compliance: categoryScore(result.categories, 'pdf_ua_compliance'),
        link_quality: categoryScore(result.categories, 'link_quality'),
      },
      stage193: decision,
    });
  }

  const behaviorCandidateRows = records
    .filter(row => row.stage193?.behaviorCandidate)
    .map(row => row.publicationId ?? row.id);
  const output = {
    generatedAt: new Date().toISOString(),
    stage192Path,
    records,
    decision: {
      rowDistribution,
      contextDistribution,
      behaviorCandidateRows,
      recommendedDirection: behaviorCandidateRows.length > 0
        ? 'semantic_alt_focused_pilot'
        : 'diagnostic_only_no_semantic_alt_candidates',
    },
  };
  await writeFile(join(outDir, 'stage193-semantic-alt-diagnostic.json'), JSON.stringify(output, null, 2));

  const lines: string[] = [];
  lines.push('# Stage 193 Semantic Alt Diagnostic', '');
  lines.push(`Stage192 input: \`${stage192Path}\``, '');
  lines.push(mdTable([
    ['Row class', 'Count'],
    ['---', '---:'],
    ...Object.entries(rowDistribution).map(([key, value]) => [key, String(value)]),
  ]), '');
  lines.push(mdTable([
    ['Context class', 'Count'],
    ['---', '---:'],
    ...Object.entries(contextDistribution).map(([key, value]) => [key, String(value)]),
  ]), '');
  lines.push(`Recommended direction: **${output.decision.recommendedDirection}**`);
  lines.push(`Behavior candidate rows: ${behaviorCandidateRows.length ? behaviorCandidateRows.map(id => `\`${id}\``).join(', ') : 'none'}`, '');
  lines.push(mdTable([
    ['Row', 'Role', 'Grade', 'Row class', 'Alt', 'Contexts', 'Reason'],
    ['---', '---', '---:', '---', '---:', '---:', '---'],
    ...records.map(row => [
      `\`${row.publicationId ?? row.id}\``,
      row.role ?? '',
      row.analyzed ? `${row.analyzed.score}/${row.analyzed.grade}` : 'n/a',
      row.stage193?.rowClassification ?? 'error',
      String(row.categories?.alt_text ?? 'n/a'),
      String(row.stage193?.contexts.length ?? 0),
      row.stage193?.reason ?? row.error ?? '',
    ]),
  ]));
  for (const row of records.filter(item => item.stage193?.contexts.length)) {
    lines.push('', `## ${row.publicationId ?? row.id}`, '');
    for (const context of row.stage193!.contexts.slice(0, 20)) {
      lines.push(`- ${context.structRef}@p${context.page + 1}: ${context.classification}; ${context.ownershipSummary}; ${context.reason}`);
      if (context.surroundingText.trim()) lines.push(`  - Context: ${context.surroundingText.slice(0, 240)}`);
    }
    if (row.stage193!.contexts.length > 20) lines.push(`- ... ${row.stage193!.contexts.length - 20} more context(s) omitted`);
  }
  await writeFile(join(outDir, 'stage193-semantic-alt-diagnostic.md'), `${lines.join('\n')}\n`);
  console.log(`Wrote Stage 193 semantic-alt diagnostic to ${outDir}`);
  console.log(JSON.stringify(output.decision, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});


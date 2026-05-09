#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { buildAllInputMeanDiagnostic, type BaselineCorpusRow } from './all-input-mean-diagnostic.js';

const DEFAULT_BASELINE_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1/shard-runs';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-latest';
const DEFAULT_TARGET_MEAN = 93;

interface OverlayRun {
  path: string;
  rows: BaselineCorpusRow[];
}

interface OverlayRow {
  file: string;
  baselineScore: number;
  overlayScore: number;
  delta: number;
  baselineGrade?: string;
  overlayGrade?: string;
  sourceRun: string;
  falsePositiveApplied: number;
}

interface CliArgs {
  baselineRoot: string;
  out: string;
  targetMean: number;
  overlays: string[];
}

function parseArgs(argv: string[]): CliArgs {
  let baselineRoot = DEFAULT_BASELINE_ROOT;
  let out = DEFAULT_OUT;
  let targetMean = DEFAULT_TARGET_MEAN;
  const overlays: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--baseline-root' && next) {
      baselineRoot = next;
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--target-mean' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed)) targetMean = parsed;
      i++;
    } else if (arg === '--overlay-run' && next) {
      overlays.push(next);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-progress-overlay.ts [options]',
        '',
        `  --baseline-root <dir>  Baseline shard-run root (default: ${DEFAULT_BASELINE_ROOT})`,
        `  --overlay-run <dir>    Targeted run directory with baseline_report.json; repeatable`,
        `  --out <dir>            Output directory (default: ${DEFAULT_OUT})`,
        `  --target-mean <score>  Target mean (default: ${DEFAULT_TARGET_MEAN})`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { baselineRoot, out, targetMean, overlays };
}

function round(value: number, digits = 2): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

async function findBaselineReports(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name === 'baseline_report.json') {
        out.push(path);
      }
    }
  }
  await visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function readRows(reportPath: string): Promise<BaselineCorpusRow[]> {
  const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as { rows?: BaselineCorpusRow[] } | BaselineCorpusRow[];
  return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
}

async function readBaselineRows(root: string): Promise<BaselineCorpusRow[]> {
  const reports = await findBaselineReports(root);
  const rows: BaselineCorpusRow[] = [];
  for (const report of reports) rows.push(...await readRows(report));
  return rows;
}

async function readOverlayRun(runDir: string): Promise<OverlayRun> {
  return {
    path: runDir,
    rows: await readRows(join(runDir, 'baseline_report.json')),
  };
}

function mergeRows(input: { baselineRows: BaselineCorpusRow[]; overlayRuns: OverlayRun[] }): {
  rows: BaselineCorpusRow[];
  overlaysApplied: OverlayRow[];
  skippedOverlays: OverlayRow[];
} {
  const byBase = new Map<string, BaselineCorpusRow>();
  for (const row of input.baselineRows) byBase.set(basename(row.file), row);
  const overlaysApplied: OverlayRow[] = [];
  const skippedOverlays: OverlayRow[] = [];

  for (const run of input.overlayRuns) {
    for (const row of run.rows) {
      const key = basename(row.file);
      const current = byBase.get(key);
      if (!current) continue;
      const candidateFalsePositive = row.falsePositiveApplied ?? 0;
      const overlay: OverlayRow = {
        file: row.file,
        baselineScore: current.afterScore,
        overlayScore: row.afterScore,
        delta: row.afterScore - current.afterScore,
        baselineGrade: current.afterGrade,
        overlayGrade: row.afterGrade,
        sourceRun: run.path,
        falsePositiveApplied: candidateFalsePositive,
      };
      if (candidateFalsePositive === 0 && row.afterScore >= current.afterScore) {
        byBase.set(key, row);
        overlaysApplied.push(overlay);
      } else {
        skippedOverlays.push(overlay);
      }
    }
  }

  return {
    rows: [...byBase.values()].sort((a, b) => a.file.localeCompare(b.file)),
    overlaysApplied: overlaysApplied.sort((a, b) => b.delta - a.delta || a.file.localeCompare(b.file)),
    skippedOverlays: skippedOverlays.sort((a, b) => a.file.localeCompare(b.file)),
  };
}

function renderMarkdown(report: {
  generatedAt: string;
  baselineRoot: string;
  overlayRuns: string[];
  before: ReturnType<typeof buildAllInputMeanDiagnostic>['summary'];
  after: ReturnType<typeof buildAllInputMeanDiagnostic>['summary'];
  overlaysApplied: OverlayRow[];
  skippedOverlays: OverlayRow[];
  familySummaries: ReturnType<typeof buildAllInputMeanDiagnostic>['familySummaries'];
  lowestRows: ReturnType<typeof buildAllInputMeanDiagnostic>['lowestRows'];
}): string {
  const lines: string[] = [];
  lines.push('# All-Input Progress Overlay');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Baseline root: \`${report.baselineRoot}\``);
  lines.push(`- Overlay runs: ${report.overlayRuns.map(run => `\`${run}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Baseline | Overlay | Delta |');
  lines.push('| --- | ---: | ---: | ---: |');
  lines.push(`| Mean | ${report.before.mean} | ${report.after.mean} | ${round(report.after.mean - report.before.mean, 4)} |`);
  lines.push(`| Median | ${report.before.median} | ${report.after.median} | ${round(report.after.median - report.before.median, 2)} |`);
  lines.push(`| Rows below target | ${report.before.rowsBelowTarget} | ${report.after.rowsBelowTarget} | ${report.after.rowsBelowTarget - report.before.rowsBelowTarget} |`);
  lines.push(`| Points needed for target mean | ${report.before.pointsNeededForTargetMean} | ${report.after.pointsNeededForTargetMean} | ${round(report.after.pointsNeededForTargetMean - report.before.pointsNeededForTargetMean, 1)} |`);
  lines.push(`| Runtime p95 ms | ${report.before.runtimeP95Ms} | ${report.after.runtimeP95Ms} | ${round(report.after.runtimeP95Ms - report.before.runtimeP95Ms, 1)} |`);
  lines.push('');
  lines.push('## Applied Overlays');
  lines.push('');
  lines.push('| Delta | Baseline | Overlay | File | Source |');
  lines.push('| ---: | --- | --- | --- | --- |');
  for (const row of report.overlaysApplied) {
    lines.push(`| ${row.delta >= 0 ? '+' : ''}${row.delta} | ${row.baselineScore}/${row.baselineGrade ?? ''} | ${row.overlayScore}/${row.overlayGrade ?? ''} | \`${row.file}\` | \`${row.sourceRun}\` |`);
  }
  if (report.overlaysApplied.length === 0) lines.push('|  |  |  | none |  |');
  if (report.skippedOverlays.length > 0) {
    lines.push('');
    lines.push('## Skipped Overlays');
    lines.push('');
    lines.push('| Delta | False positives | File | Source |');
    lines.push('| ---: | ---: | --- | --- |');
    for (const row of report.skippedOverlays) {
      lines.push(`| ${row.delta >= 0 ? '+' : ''}${row.delta} | ${row.falsePositiveApplied} | \`${row.file}\` | \`${row.sourceRun}\` |`);
    }
  }
  lines.push('');
  lines.push('## Remaining Below-Target Families');
  lines.push('');
  lines.push('| Family | Count | Deficit | Avg | Median | Top files |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |');
  for (const family of report.familySummaries) {
    lines.push(`| ${family.family} | ${family.count} | ${family.deficitTo93} | ${family.avgScore} | ${family.medianScore} | ${family.topFiles.map(file => `\`${file}\``).join('<br>')} |`);
  }
  lines.push('');
  lines.push('## Lowest Remaining Rows');
  lines.push('');
  lines.push('| Score | Grade | Family | Deficit | File | Weakest | Runtime ms |');
  lines.push('| ---: | --- | --- | ---: | --- | --- | ---: |');
  for (const row of report.lowestRows.slice(0, 30)) {
    lines.push(`| ${row.score} | ${row.grade} | ${row.family} | ${row.deficitTo93} | \`${row.file}\` | ${row.weakest.map(item => `${item.key}:${item.score}`).join(', ')} | ${row.durationMs ?? ''} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const baselineRows = await readBaselineRows(args.baselineRoot);
  const overlayRuns = await Promise.all(args.overlays.map(readOverlayRun));
  const before = buildAllInputMeanDiagnostic({
    rows: baselineRows,
    sourceRoot: args.baselineRoot,
    targetMean: args.targetMean,
  });
  const merged = mergeRows({ baselineRows, overlayRuns });
  const after = buildAllInputMeanDiagnostic({
    rows: merged.rows,
    sourceRoot: args.baselineRoot,
    targetMean: args.targetMean,
  });
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    baselineRoot: args.baselineRoot,
    overlayRuns: args.overlays,
    before: before.summary,
    after: after.summary,
    overlaysApplied: merged.overlaysApplied,
    skippedOverlays: merged.skippedOverlays,
    familySummaries: after.familySummaries,
    lowestRows: after.lowestRows,
  };
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'all-input-progress-overlay.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.out, 'all-input-progress-overlay.md'), renderMarkdown(report), 'utf8');
  await writeFile(join(args.out, 'all-input-mean-diagnostic.merged.json'), `${JSON.stringify(after, null, 2)}\n`, 'utf8');
  await writeFile(join(args.out, 'all-input-rows.merged.json'), `${JSON.stringify(merged.rows, null, 2)}\n`, 'utf8');
  console.log(`Wrote all-input progress overlay: ${args.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

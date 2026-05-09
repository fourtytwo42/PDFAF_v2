#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-long4516-metadata-confirm-fixed50-2026-05-09-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/short4074-protected-drift-diagnostic-2026-05-09-r1';
const ROW_ID = 'short-4074';

export type Short4074ProtectedDriftClassification =
  | 'protected_reanalysis_figure_applicability_drift'
  | 'safe_checkpoint_candidate'
  | 'real_figure_alt_debt'
  | 'insufficient_evidence';

export interface Short4074ProtectedDriftDiagnostic {
  generatedAt: string;
  runDir: string;
  rowId: string;
  classification: Short4074ProtectedDriftClassification;
  recommendation: string;
  score: {
    after: number | null;
    afterGrade: string | null;
    reanalyzed: number | null;
    reanalyzedGrade: string | null;
    delta: number | null;
  };
  evidence: {
    afterExtractedFigures: number | null;
    reanalyzedExtractedFigures: number | null;
    afterTreeFigures: number | null;
    reanalyzedTreeFigures: number | null;
    afterAltScore: number | null;
    reanalyzedAltScore: number | null;
    afterAltApplicable: boolean | null;
    reanalyzedAltApplicable: boolean | null;
    afterPacReasons: string[];
    reanalyzedPacReasons: string[];
    newPacReasons: string[];
  };
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/short4074-protected-drift-diagnostic.ts [options]',
    '  --run <run-dir>',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoreFor(row: RemediateBenchmarkRow, key: string, source: 'after' | 'reanalyzed'): number | null {
  const categories = source === 'after' ? row.afterCategories : row.reanalyzedCategories;
  return categories?.find(category => category.key === key)?.score ?? null;
}

function applicableFor(row: RemediateBenchmarkRow, key: string, source: 'after' | 'reanalyzed'): boolean | null {
  const categories = source === 'after' ? row.afterCategories : row.reanalyzedCategories;
  const found = categories?.find(category => category.key === key);
  return typeof found?.applicable === 'boolean' ? found.applicable : null;
}

function figureCount(row: RemediateBenchmarkRow, source: 'after' | 'reanalyzed', kind: 'extracted' | 'tree'): number | null {
  const profile = source === 'after' ? row.afterDetectionProfile : row.reanalyzedDetectionProfile;
  const signals = profile?.figureSignals;
  return numberOrNull(kind === 'extracted' ? signals?.extractedFigureCount : signals?.treeFigureCount);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function buildShort4074ProtectedDriftDiagnostic(input: {
  runDir: string;
  row?: RemediateBenchmarkRow;
  generatedAt?: string;
}): Short4074ProtectedDriftDiagnostic {
  const row = input.row;
  const afterPacReasons = unique(stringList(row?.afterManualReviewReasons).filter(reason => reason.includes('PAC rule failure')));
  const reanalyzedPacReasons = unique(stringList(row?.reanalyzedManualReviewReasons).filter(reason => reason.includes('PAC rule failure')));
  const newPacReasons = reanalyzedPacReasons.filter(reason => !afterPacReasons.includes(reason));
  const afterAltScore = row ? scoreFor(row, 'alt_text', 'after') : null;
  const reanalyzedAltScore = row ? scoreFor(row, 'alt_text', 'reanalyzed') : null;
  const afterAltApplicable = row ? applicableFor(row, 'alt_text', 'after') : null;
  const reanalyzedAltApplicable = row ? applicableFor(row, 'alt_text', 'reanalyzed') : null;
  const afterExtractedFigures = row ? figureCount(row, 'after', 'extracted') : null;
  const reanalyzedExtractedFigures = row ? figureCount(row, 'reanalyzed', 'extracted') : null;
  const scoreDelta = typeof row?.afterScore === 'number' && typeof row?.reanalyzedScore === 'number'
    ? row.afterScore - row.reanalyzedScore
    : null;

  let classification: Short4074ProtectedDriftClassification = 'insufficient_evidence';
  let recommendation = 'Run a focused protected repeat with debug states before changing behavior.';
  if (
    row &&
    (row.afterScore ?? 0) >= 90 &&
    (row.reanalyzedScore ?? 100) < 80 &&
    afterAltApplicable === false &&
    reanalyzedAltApplicable === true &&
    (afterExtractedFigures ?? 0) === 0 &&
    (reanalyzedExtractedFigures ?? 0) > 0 &&
    newPacReasons.some(reason => reason.includes('pdfua.figure.alt_present'))
  ) {
    classification = 'protected_reanalysis_figure_applicability_drift';
    recommendation = 'Do not patch yet; run a focused same-buffer protected repeat to decide whether this is analyzer applicability drift or real newly measurable figure-alt debt.';
  } else if (row && (row.afterScore ?? 0) >= 90 && (row.reanalyzedScore ?? 0) >= 90) {
    classification = 'safe_checkpoint_candidate';
    recommendation = 'Row is currently floor-safe; no behavior needed.';
  } else if (reanalyzedAltApplicable === true && (reanalyzedAltScore ?? 100) < 80) {
    classification = 'real_figure_alt_debt';
    recommendation = 'Treat as real figure-alt debt unless repeat evidence proves same-buffer analyzer volatility.';
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: input.runDir,
    rowId: ROW_ID,
    classification,
    recommendation,
    score: {
      after: row?.afterScore ?? null,
      afterGrade: row?.afterGrade ?? null,
      reanalyzed: row?.reanalyzedScore ?? null,
      reanalyzedGrade: row?.reanalyzedGrade ?? null,
      delta: scoreDelta,
    },
    evidence: {
      afterExtractedFigures,
      reanalyzedExtractedFigures,
      afterTreeFigures: row ? figureCount(row, 'after', 'tree') : null,
      reanalyzedTreeFigures: row ? figureCount(row, 'reanalyzed', 'tree') : null,
      afterAltScore,
      reanalyzedAltScore,
      afterAltApplicable,
      reanalyzedAltApplicable,
      afterPacReasons,
      reanalyzedPacReasons,
      newPacReasons,
    },
  };
}

function markdown(report: Short4074ProtectedDriftDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Short-4074 Protected Drift Diagnostic', '');
  lines.push(`- Run: \`${report.runDir}\``);
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Recommendation: ${report.recommendation}`);
  lines.push(`- Score: \`${report.score.after}/${report.score.afterGrade}\` -> \`${report.score.reanalyzed}/${report.score.reanalyzedGrade}\` (drop ${report.score.delta ?? 'n/a'})`);
  lines.push(`- Extracted figures: \`${report.evidence.afterExtractedFigures}\` -> \`${report.evidence.reanalyzedExtractedFigures}\``);
  lines.push(`- Tree figures: \`${report.evidence.afterTreeFigures}\` -> \`${report.evidence.reanalyzedTreeFigures}\``);
  lines.push(`- Alt score/applicable: \`${report.evidence.afterAltScore}/${report.evidence.afterAltApplicable}\` -> \`${report.evidence.reanalyzedAltScore}/${report.evidence.reanalyzedAltApplicable}\``);
  lines.push(`- New PAC reasons: ${report.evidence.newPacReasons.map(reason => `\`${reason}\``).join(', ') || 'none'}`);
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let runDir = DEFAULT_RUN;
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--run' && value) {
      runDir = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const rows = await loadBenchmarkRowsFromRunDir(runDir);
  const report = buildShort4074ProtectedDriftDiagnostic({
    runDir,
    row: rows.remediateResults.find(row => row.id === ROW_ID),
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'short4074-protected-drift-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'short4074-protected-drift-diagnostic.md'), markdown(report));
  console.log(`Wrote short-4074 protected drift diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

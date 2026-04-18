import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildBenchmarkSummary,
  makeManifestSnapshot,
  renderBenchmarkSummaryMarkdown,
  validateBenchmarkArtifacts,
  validateExperimentCorpusManifest,
  type AnalyzeBenchmarkRow,
  type ExperimentCorpusManifestEntry,
  type RemediateBenchmarkRow,
} from '../../src/services/benchmark/experimentCorpus.js';
import type { AnalysisResult, Finding, ScoredCategory } from '../../src/types.js';

function makeCategory(key: ScoredCategory['key'], score: number): ScoredCategory {
  return {
    key,
    score,
    weight: 1,
    applicable: true,
    severity: score === 100 ? 'pass' : 'moderate',
    findings: score === 100 ? [] : [{ category: key, severity: 'moderate', wcag: '1.3.1', message: `${key} issue` }],
  };
}

function makeAnalysisResult(score: number, grade: AnalysisResult['grade'], pdfClass: AnalysisResult['pdfClass']): AnalysisResult {
  const categories: ScoredCategory[] = [
    makeCategory('reading_order', score),
    makeCategory('pdf_ua_compliance', Math.max(0, score - 10)),
  ];
  const findings: Finding[] = categories.flatMap(category => category.findings);
  return {
    id: `analysis-${score}-${grade}`,
    timestamp: '2026-04-18T00:00:00.000Z',
    filename: 'sample.pdf',
    pageCount: 3,
    pdfClass,
    score,
    grade,
    categories,
    findings,
    analysisDurationMs: 123,
  };
}

function makeAnalyzeRow(input: {
  id: string;
  file: string;
  cohort: AnalyzeBenchmarkRow['cohort'];
  score: number;
  grade: AnalyzeBenchmarkRow['grade'];
  pdfClass: AnalyzeBenchmarkRow['pdfClass'];
  wallAnalyzeMs: number;
}): AnalyzeBenchmarkRow {
  const analysis = makeAnalysisResult(input.score, input.grade ?? 'A', input.pdfClass ?? 'native_tagged');
  return {
    id: input.id,
    file: input.file,
    cohort: input.cohort,
    sourceType: 'fixture',
    intent: 'test',
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    pageCount: analysis.pageCount,
    categories: analysis.categories,
    findings: analysis.findings,
    analysisDurationMs: analysis.analysisDurationMs,
    wallAnalyzeMs: input.wallAnalyzeMs,
  };
}

function makeRemediateRow(input: {
  id: string;
  file: string;
  cohort: RemediateBenchmarkRow['cohort'];
  beforeScore: number;
  afterScore: number;
  reanalyzedScore?: number | null;
  totalPipelineMs: number;
}): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file,
    cohort: input.cohort,
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: input.beforeScore,
    beforeGrade: 'B',
    beforePdfClass: 'native_untagged',
    afterScore: input.afterScore,
    afterGrade: 'A',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedScore == null ? null : 'A',
    reanalyzedPdfClass: input.reanalyzedScore == null ? null : 'native_tagged',
    delta: input.afterScore - input.beforeScore,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 120,
    remediationDurationMs: 250,
    wallRemediateMs: 275,
    analysisAfterMs: input.reanalyzedScore == null ? null : 130,
    totalPipelineMs: input.totalPipelineMs,
  };
}

async function createCorpusFixtureRoot(): Promise<{
  root: string;
  manifest: ExperimentCorpusManifestEntry[];
}> {
  const root = await mkdtemp(join(tmpdir(), 'pdfaf-experiment-corpus-test-'));
  const manifest: ExperimentCorpusManifestEntry[] = [];
  for (let i = 0; i < 50; i++) {
    const cohort = i < 10
      ? '00-fixtures'
      : i < 20
        ? '10-short-near-pass'
        : i < 30
          ? '20-figure-ownership'
          : i < 40
            ? '30-structure-reading-order'
            : i < 45
              ? '40-font-extractability'
              : '50-long-report-mixed';
    const relativeDir = cohort;
    const filename = `file-${i + 1}.pdf`;
    await mkdir(join(root, relativeDir), { recursive: true });
    await writeFile(join(root, relativeDir, filename), `%PDF-1.7\nfixture-${i + 1}\n`, 'utf8');
    manifest.push({
      id: `doc-${i + 1}`,
      file: `${relativeDir}/${filename}`,
      cohort,
      sourceType: 'fixture',
      intent: 'test_case',
    });
  }
  return { root, manifest };
}

describe('experiment corpus helpers', () => {
  let tempRoot: string;
  let manifest: ExperimentCorpusManifestEntry[];

  beforeEach(async () => {
    const fixture = await createCorpusFixtureRoot();
    tempRoot = fixture.root;
    manifest = fixture.manifest;
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('validates a complete 50-file manifest', async () => {
    const entries = await validateExperimentCorpusManifest(manifest, { corpusRoot: tempRoot, checkFiles: true });
    expect(entries).toHaveLength(50);
    expect(entries[0]?.filename).toBe('file-1.pdf');
  });

  it('rejects duplicate ids', async () => {
    const dup = manifest.map(entry => ({ ...entry }));
    dup[1] = { ...dup[1]!, id: dup[0]!.id };
    await expect(
      validateExperimentCorpusManifest(dup, { corpusRoot: tempRoot, checkFiles: false }),
    ).rejects.toThrow('duplicate id');
  });

  it('rejects unknown cohorts', async () => {
    const bad = manifest.map(entry => ({ ...entry }));
    bad[0] = { ...bad[0]!, cohort: 'unknown-cohort' as never };
    await expect(
      validateExperimentCorpusManifest(bad, { corpusRoot: tempRoot, checkFiles: false }),
    ).rejects.toThrow('unknown cohort');
  });

  it('rejects missing files when file checks are enabled', async () => {
    const bad = manifest.map(entry => ({ ...entry }));
    bad[0] = { ...bad[0]!, file: '00-fixtures/missing.pdf' };
    await expect(
      validateExperimentCorpusManifest(bad, { corpusRoot: tempRoot, checkFiles: true }),
    ).rejects.toThrow('missing file');
  });

  it('builds stable summary stats and markdown', () => {
    const analyzeRows: AnalyzeBenchmarkRow[] = [
      makeAnalyzeRow({
        id: 'doc-1',
        file: '00-fixtures/a.pdf',
        cohort: '00-fixtures',
        score: 91,
        grade: 'A',
        pdfClass: 'native_tagged',
        wallAnalyzeMs: 100,
      }),
      makeAnalyzeRow({
        id: 'doc-2',
        file: '10-short-near-pass/b.pdf',
        cohort: '10-short-near-pass',
        score: 73,
        grade: 'C',
        pdfClass: 'native_untagged',
        wallAnalyzeMs: 200,
      }),
    ];
    const remediateRows: RemediateBenchmarkRow[] = [
      makeRemediateRow({
        id: 'doc-1',
        file: '00-fixtures/a.pdf',
        cohort: '00-fixtures',
        beforeScore: 91,
        afterScore: 96,
        reanalyzedScore: 96,
        totalPipelineMs: 410,
      }),
      makeRemediateRow({
        id: 'doc-2',
        file: '10-short-near-pass/b.pdf',
        cohort: '10-short-near-pass',
        beforeScore: 73,
        afterScore: 82,
        reanalyzedScore: 80,
        totalPipelineMs: 610,
      }),
    ];

    const summary = buildBenchmarkSummary({
      runId: 'run-1',
      generatedAt: '2026-04-18T00:00:00.000Z',
      mode: 'full',
      semanticEnabled: false,
      writePdfs: false,
      selectedFileIds: ['doc-1', 'doc-2'],
      manifestEntries: 50,
      analyzeRows,
      remediateRows,
    });

    expect(summary.counts.selectedEntries).toBe(2);
    expect(summary.analyze.score.mean).toBe(82);
    expect(summary.analyze.wallAnalyzeMs.p95).toBe(200);
    expect(summary.remediate?.delta.mean).toBe(7);
    expect(summary.analyze.gradeDistribution).toEqual({ A: 1, C: 1 });

    const markdown = renderBenchmarkSummaryMarkdown(summary);
    expect(markdown).toContain('# Experiment corpus benchmark summary');
    expect(markdown).toContain('## Slowest Analyze Files');
    expect(markdown).toContain('## Highest Delta Files');
  });

  it('validates artifact bundles against manifest and summaries', () => {
    const selectedEntries = manifest.slice(0, 2).map(entry => ({
      ...entry,
      absolutePath: join(tempRoot, entry.file),
      filename: entry.file.split('/').pop() ?? entry.file,
    }));
    const analyzeRows = [
      makeAnalyzeRow({
        id: 'doc-1',
        file: manifest[0]!.file,
        cohort: manifest[0]!.cohort,
        score: 90,
        grade: 'A',
        pdfClass: 'native_tagged',
        wallAnalyzeMs: 100,
      }),
      makeAnalyzeRow({
        id: 'doc-2',
        file: manifest[1]!.file,
        cohort: manifest[1]!.cohort,
        score: 60,
        grade: 'D',
        pdfClass: 'native_untagged',
        wallAnalyzeMs: 120,
      }),
    ];
    const remediateRows = [
      makeRemediateRow({
        id: 'doc-1',
        file: manifest[0]!.file,
        cohort: manifest[0]!.cohort,
        beforeScore: 90,
        afterScore: 94,
        reanalyzedScore: 94,
        totalPipelineMs: 300,
      }),
      makeRemediateRow({
        id: 'doc-2',
        file: manifest[1]!.file,
        cohort: manifest[1]!.cohort,
        beforeScore: 60,
        afterScore: 78,
        reanalyzedScore: 77,
        totalPipelineMs: 340,
      }),
    ];
    const summary = buildBenchmarkSummary({
      runId: 'run-2',
      generatedAt: '2026-04-18T00:00:00.000Z',
      mode: 'full',
      semanticEnabled: false,
      writePdfs: false,
      selectedFileIds: selectedEntries.map(entry => entry.id),
      manifestEntries: 50,
      analyzeRows,
      remediateRows,
    });
    const manifestSnapshot = makeManifestSnapshot({
      runId: 'run-2',
      generatedAt: '2026-04-18T00:00:00.000Z',
      manifestPath: join(tempRoot, 'manifest.json'),
      corpusRoot: tempRoot,
      mode: 'full',
      semanticEnabled: false,
      writePdfs: false,
      selectedEntries,
    });

    expect(
      validateBenchmarkArtifacts({
        manifest: manifestSnapshot,
        analyzeResults: analyzeRows,
        remediateResults: remediateRows,
        summary,
      }),
    ).toEqual({ ok: true, errors: [] });

    const broken = validateBenchmarkArtifacts({
      manifest: manifestSnapshot,
      analyzeResults: analyzeRows.slice(0, 1),
      remediateResults: remediateRows,
      summary,
    });
    expect(broken.ok).toBe(false);
    expect(broken.errors.join('\n')).toContain('Missing analyze row');
  });
});

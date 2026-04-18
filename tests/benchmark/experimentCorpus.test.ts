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
import { compareBenchmarkSummaries, renderBenchmarkComparisonMarkdown } from '../../src/services/benchmark/compareRuns.js';
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
    verificationLevel: 'mixed',
    manualReviewRequired: true,
    manualReviewReasons: ['Contrast not machine-verified.'],
    scoreCapsApplied: [{ category: 'reading_order', cap: 89, rawScore: 100, finalScore: 89, reason: 'heuristic cap' }],
    structuralClassification: {
      structureClass: input.pdfClass === 'native_untagged' ? 'untagged_digital' : 'partially_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: input.pdfClass !== 'native_untagged',
        hasBookmarks: false,
        hasFigures: false,
        hasTables: false,
        hasForms: false,
        annotationRisk: true,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low',
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'medium',
    },
    failureProfile: {
      deterministicIssues: ['reading_order'],
      semanticIssues: [],
      manualOnlyIssues: ['reading_order'],
      primaryFailureFamily: 'structure_reading_order_heavy',
      secondaryFailureFamilies: [],
      routingHints: ['prefer_structure_bootstrap'],
    },
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
  primaryRoute?: string;
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
    beforeCategories: [],
    beforeVerificationLevel: 'heuristic',
    beforeManualReviewRequired: true,
    beforeManualReviewReasons: ['Before reason'],
    beforeScoreCapsApplied: [],
    beforeStructuralClassification: null,
    beforeFailureProfile: null,
    afterScore: input.afterScore,
    afterGrade: 'A',
    afterPdfClass: 'native_tagged',
    afterCategories: [
      {
        key: 'reading_order',
        score: input.afterScore,
        weight: 1,
        applicable: true,
        severity: 'minor',
        findings: [],
        evidence: 'heuristic',
        verificationLevel: 'heuristic',
        manualReviewRequired: true,
        manualReviewReasons: ['After reason'],
      },
    ],
    afterVerificationLevel: 'heuristic',
    afterManualReviewRequired: true,
    afterManualReviewReasons: ['After reason'],
    afterScoreCapsApplied: [{ category: 'reading_order', cap: 89, rawScore: 95, finalScore: 89, reason: 'heuristic cap' }],
    afterStructuralClassification: {
      structureClass: 'native_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: false,
        hasTables: false,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low',
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'medium',
    },
    afterFailureProfile: {
      deterministicIssues: ['reading_order'],
      semanticIssues: [],
      manualOnlyIssues: ['reading_order'],
      primaryFailureFamily: 'structure_reading_order_heavy',
      secondaryFailureFamilies: [],
      routingHints: ['prefer_structure_bootstrap'],
    },
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedScore == null ? null : 'A',
    reanalyzedPdfClass: input.reanalyzedScore == null ? null : 'native_tagged',
    reanalyzedCategories: [],
    reanalyzedVerificationLevel: input.reanalyzedScore == null ? null : 'heuristic',
    reanalyzedManualReviewRequired: input.reanalyzedScore == null ? null : true,
    reanalyzedManualReviewReasons: input.reanalyzedScore == null ? [] : ['Reanalyzed reason'],
    reanalyzedScoreCapsApplied: input.reanalyzedScore == null ? [] : [{ category: 'reading_order', cap: 89, rawScore: 95, finalScore: 89, reason: 'heuristic cap' }],
    reanalyzedStructuralClassification: input.reanalyzedScore == null ? null : {
      structureClass: 'native_tagged',
      contentProfile: {
        pageBucket: '1-5',
        dominantContent: 'text',
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: false,
        hasTables: false,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low',
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'medium',
    },
    reanalyzedFailureProfile: input.reanalyzedScore == null ? null : {
      deterministicIssues: ['reading_order'],
      semanticIssues: [],
      manualOnlyIssues: ['reading_order'],
      primaryFailureFamily: 'structure_reading_order_heavy',
      secondaryFailureFamilies: [],
      routingHints: ['prefer_structure_bootstrap'],
    },
    delta: input.afterScore - input.beforeScore,
    appliedTools: [],
    rounds: [],
    planningSummary: {
      primaryRoute: (input.primaryRoute as RemediateBenchmarkRow['planningSummary']['primaryRoute']) ?? 'structure_bootstrap',
      secondaryRoutes: ['safe_cleanup'],
      triggeringSignals: ['missing_structure_tree'],
      scheduledTools: ['bootstrap_struct_tree', 'mark_untagged_content_as_artifact'],
      skippedTools: [{ toolName: 'set_figure_alt_text', reason: 'semantic_deferred' }],
      semanticDeferred: true,
    },
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
    expect(summary.analyze.manualReviewRequiredCount).toBe(2);
    expect(summary.analyze.structureClassDistribution.partially_tagged).toBe(1);
    expect(summary.analyze.structureClassDistribution.untagged_digital).toBe(1);
    expect(summary.analyze.primaryFailureFamilyDistribution.structure_reading_order_heavy).toBe(2);
    expect(summary.analyze.deterministicIssueFrequency[0]?.key).toBe('reading_order');
    expect(summary.analyze.manualReviewReasonFrequency[0]?.key).toContain('Contrast');
    expect(summary.remediate?.afterCategoryManualReviewFrequency[0]?.key).toBe('reading_order');
    expect(summary.remediate?.primaryRouteDistribution.structure_bootstrap).toBe(2);
    expect(summary.remediate?.skippedToolReasonFrequency[0]?.key).toBe('semantic_deferred');
    expect(summary.remediate?.scheduledToolFrequency[0]?.key).toBe('bootstrap_struct_tree');

    const markdown = renderBenchmarkSummaryMarkdown(summary);
    expect(markdown).toContain('# Experiment corpus benchmark summary');
    expect(markdown).toContain('## Slowest Analyze Files');
    expect(markdown).toContain('## Highest Delta Files');
    expect(markdown).toContain('Analyze manual-review reasons');
    expect(markdown).toContain('Analyze structure class');
    expect(markdown).toContain('Failure Family Stability');
    expect(markdown).toContain('Remediation primary routes');
    expect(markdown).toContain('Remediation skipped-tool reasons');
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

  it('compares benchmark summaries and renders markdown', () => {
    const before = buildBenchmarkSummary({
      runId: 'before',
      generatedAt: '2026-04-18T00:00:00.000Z',
      mode: 'full',
      semanticEnabled: false,
      writePdfs: false,
      selectedFileIds: ['doc-1'],
      manifestEntries: 50,
      analyzeRows: [
        makeAnalyzeRow({
          id: 'doc-1',
          file: '00-fixtures/a.pdf',
          cohort: '00-fixtures',
          score: 80,
          grade: 'B',
          pdfClass: 'native_tagged',
          wallAnalyzeMs: 100,
        }),
      ],
      remediateRows: [
        makeRemediateRow({
          id: 'doc-1',
          file: '00-fixtures/a.pdf',
          cohort: '00-fixtures',
          beforeScore: 80,
          afterScore: 90,
          reanalyzedScore: 88,
          totalPipelineMs: 300,
        }),
      ],
    });
    const after = buildBenchmarkSummary({
      runId: 'after',
      generatedAt: '2026-04-18T00:00:00.000Z',
      mode: 'full',
      semanticEnabled: false,
      writePdfs: false,
      selectedFileIds: ['doc-1'],
      manifestEntries: 50,
      analyzeRows: [
        makeAnalyzeRow({
          id: 'doc-1',
          file: '00-fixtures/a.pdf',
          cohort: '00-fixtures',
          score: 85,
          grade: 'A',
          pdfClass: 'native_tagged',
          wallAnalyzeMs: 110,
        }),
      ],
      remediateRows: [
        makeRemediateRow({
          id: 'doc-1',
          file: '00-fixtures/a.pdf',
          cohort: '00-fixtures',
          beforeScore: 85,
          afterScore: 93,
          reanalyzedScore: 91,
          totalPipelineMs: 320,
        }),
      ],
    });
    const comparison = compareBenchmarkSummaries(before, after);
    expect(comparison.analyze.scoreMeanDelta).toBe(5);
    expect(comparison.remediate?.afterMeanDelta).toBe(3);
    const markdown = renderBenchmarkComparisonMarkdown(comparison);
    expect(markdown).toContain('# Experiment corpus benchmark comparison');
    expect(markdown).toContain('Analyze score mean delta');
  });
});

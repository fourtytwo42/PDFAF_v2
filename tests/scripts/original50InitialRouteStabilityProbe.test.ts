import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  writeInitialRouteProbeDiagnostic,
} from '../../scripts/original50-initial-route-stability-probe.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function details(input: {
  before: string;
  after: string;
  scoreBefore: number;
  scoreAfter: number;
  note?: string;
  pac?: string[];
}) {
  return JSON.stringify({
    note: input.note,
    pacRuleRegressions: (input.pac ?? []).map(ruleId => ({ ruleId })),
    debug: {
      replayState: {
        stateSignatureBefore: input.before,
        stateSignatureAfter: input.after,
        scoreBefore: input.scoreBefore,
        scoreAfter: input.scoreAfter,
      },
    },
  });
}

function tool(
  stage: number,
  toolName: string,
  outcome: string,
  before: string,
  after: string,
  scoreBefore = 59,
  scoreAfter = 59,
  extra: { note?: string; pac?: string[] } = {},
) {
  return {
    stage,
    toolName,
    outcome,
    scoreBefore,
    scoreAfter,
    details: details({ before, after, scoreBefore, scoreAfter, ...extra }),
  };
}

function analysisRow(id: string, score: number, categoryOverrides: Record<string, number> = {}, signalOverrides: Record<string, number> = {}) {
  return {
    id,
    file: `${id}.pdf`,
    score,
    grade: score >= 90 ? 'A' : 'F',
    pdfClass: 'native_tagged',
    categories: [
      category('heading_structure', categoryOverrides.heading_structure ?? 80),
      category('alt_text', categoryOverrides.alt_text ?? 20),
      category('table_markup', categoryOverrides.table_markup ?? 100),
      category('reading_order', categoryOverrides.reading_order ?? 100),
      category('pdf_ua_compliance', categoryOverrides.pdf_ua_compliance ?? 79),
    ],
    structuralClassification: {
      structureClass: 'partially_tagged',
      contentProfile: { hasStructureTree: true, hasFigures: true, hasTables: true },
      confidence: 'medium',
    },
    failureProfile: {
      primaryFailureFamily: 'mixed_structural',
      deterministicIssues: ['pdf_ua_compliance'],
      manualOnlyIssues: ['alt_text'],
      routingHints: ['prefer_structure_bootstrap'],
    },
    detectionProfile: {
      headingSignals: {
        extractedHeadingCount: signalOverrides.extractedHeadingCount ?? 10,
        treeHeadingCount: signalOverrides.treeHeadingCount ?? 10,
        rootReachableHeadingCount: signalOverrides.rootReachableHeadingCount ?? 10,
        layoutHeadingCandidateCount: signalOverrides.layoutHeadingCandidateCount ?? 20,
      },
      figureSignals: {
        extractedFigureCount: signalOverrides.extractedFigureCount ?? 4,
        treeFigureCount: signalOverrides.treeFigureCount ?? 4,
        captionCandidateCount: 0,
      },
      tableSignals: {
        irregularTableCount: signalOverrides.irregularTableCount ?? 0,
        stronglyIrregularTableCount: signalOverrides.stronglyIrregularTableCount ?? 0,
        layoutTableCandidateCount: 0,
        denseRowBandTableCandidateCount: 0,
      },
      pdfUaSignals: { orphanMcidCount: 64, suspectedPathPaintOutsideMc: 0 },
      annotationSignals: { pagesMissingTabsS: 0 },
      readingOrderSignals: { geometryOrderRiskPages: 0, suspiciousPageCount: 0 },
    },
  };
}

function remediateRow(id: string, score: number, tools: ReturnType<typeof tool>[], categories = [
  category('heading_structure', 80),
  category('alt_text', score >= 90 ? 100 : 20),
  category('table_markup', 100),
  category('reading_order', 100),
  category('pdf_ua_compliance', 79),
]) {
  return {
    id,
    file: `${id}.pdf`,
    beforeScore: 59,
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : 'F',
    falsePositiveApplied: 0,
    afterCategories: categories,
    planningSummary: {
      primaryRoute: 'post_bootstrap_heading_convergence',
      scheduledTools: ['set_document_language', 'remap_orphan_mcids_as_artifacts'],
      triggeringSignals: ['title_language_debt'],
      routeSummaries: [{ route: 'structure_bootstrap', status: 'active' }],
    },
    appliedTools: tools,
  };
}

async function writeRun(dir: string, analysisRows: unknown[], remediateRows: unknown[]) {
  await writeFile(join(dir, 'analyze.results.json'), JSON.stringify(analysisRows), 'utf8');
  await writeFile(join(dir, 'remediate.results.json'), JSON.stringify(remediateRows), 'utf8');
}

describe('original50 initial route stability probe', () => {
  it('classifies stable low analysis with replay signature drift', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-initial-route-'));
    try {
      const r1 = join(dir, 'r1');
      const r2 = join(dir, 'r2');
      const ref = join(dir, 'ref.json');
      await mkdir(r1);
      await mkdir(r2);
      await writeRun(r1, [analysisRow('4680', 59)], [remediateRow('4680', 59, [tool(1, 'set_document_language', 'applied', 'low-a', 'low-a2')])]);
      await writeRun(r2, [analysisRow('4680', 59)], [remediateRow('4680', 59, [tool(1, 'set_document_language', 'applied', 'low-b', 'low-b2')])]);
      await writeFile(ref, JSON.stringify({ rows: [remediateRow('4680', 98, [tool(1, 'set_document_language', 'applied', 'high-a', 'high-a2')])] }), 'utf8');

      const diagnostic = await writeInitialRouteProbeDiagnostic({
        observations: [{ label: 'r1', path: r1 }, { label: 'r2', path: r2 }],
        references: [{ label: 'high', path: ref }],
        rows: ['4680'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('stable_low_replay_signature_drift');
      expect(diagnostic.decision.status).toBe('diagnose_analyzer_or_replay_state_before_behavior');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('classifies unstable initial analysis from repeated category and signal swings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-initial-analysis-'));
    try {
      const r1 = join(dir, 'r1');
      const r2 = join(dir, 'r2');
      const ref = join(dir, 'ref.json');
      await mkdir(r1);
      await mkdir(r2);
      await writeRun(r1, [analysisRow('4683', 59, { heading_structure: 99 })], [remediateRow('4683', 59, [tool(1, 'set_document_language', 'applied', 'same', 'same2')])]);
      await writeRun(r2, [analysisRow('4683', 48, { heading_structure: 43, table_markup: 6 }, { extractedHeadingCount: 22, irregularTableCount: 3 })], [remediateRow('4683', 59, [tool(1, 'set_document_language', 'applied', 'same', 'same2')])]);
      await writeFile(ref, JSON.stringify({ rows: [remediateRow('4683', 99, [tool(1, 'set_document_language', 'applied', 'same', 'same2')])] }), 'utf8');

      const diagnostic = await writeInitialRouteProbeDiagnostic({
        observations: [{ label: 'r1', path: r1 }, { label: 'r2', path: r2 }],
        references: [{ label: 'high', path: ref }],
        rows: ['4683'],
        outDir: join(dir, 'out'),
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.classification).toBe('unstable_initial_analysis');
      expect(diagnostic.rows[0]?.analysisCategoryDeltas.some(delta => delta.key === 'heading_structure')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes JSON and Markdown for early structural PAC-guard drift', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-early-structural-'));
    try {
      const r1 = join(dir, 'r1');
      const r2 = join(dir, 'r2');
      const ref = join(dir, 'ref.json');
      await mkdir(r1);
      await mkdir(r2);
      const lowTools = [
        tool(1, 'set_document_language', 'applied', 'same', 'meta'),
        tool(2, 'remap_orphan_mcids_as_artifacts', 'rejected', 'meta', 'bad', 59, 59, { pac: ['pdfua.figure.alt_present'] }),
      ];
      const highTools = [
        tool(1, 'set_document_language', 'applied', 'same', 'meta'),
        tool(2, 'remap_orphan_mcids_as_artifacts', 'applied', 'meta', 'good', 59, 94),
      ];
      await writeRun(r1, [analysisRow('4754', 59)], [remediateRow('4754', 59, lowTools)]);
      await writeRun(r2, [analysisRow('4754', 59)], [remediateRow('4754', 59, lowTools)]);
      await writeFile(ref, JSON.stringify({ rows: [remediateRow('4754', 94, highTools)] }), 'utf8');

      const outDir = join(dir, 'out');
      const diagnostic = await writeInitialRouteProbeDiagnostic({
        observations: [{ label: 'r1', path: r1 }, { label: 'r2', path: r2 }],
        references: [{ label: 'high', path: ref }],
        rows: ['4754'],
        outDir,
        targetScore: 93,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-initial-route-stability-probe.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-initial-route-stability-probe.md'), 'utf8');

      expect(diagnostic.rows[0]?.classification).toBe('early_structural_pac_guard_drift');
      expect(json).toMatchObject({ summary: { rowCount: 1 } });
      expect(md).toContain('Original-50 Initial Route Stability Probe');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

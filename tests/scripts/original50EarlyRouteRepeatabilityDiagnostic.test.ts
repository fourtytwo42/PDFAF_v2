import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOriginal50EarlyRouteDiagnostic,
  renderOriginal50EarlyRouteMarkdown,
  writeOriginal50EarlyRouteDiagnostic,
} from '../../scripts/original50-early-route-repeatability-diagnostic.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function details(input: {
  note?: string;
  beforeSig?: string;
  afterSig?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  targetRef?: string;
  pac?: string[];
}) {
  return JSON.stringify({
    note: input.note,
    pacRuleRegressions: (input.pac ?? []).map(ruleId => ({ ruleId })),
    debug: {
      replayState: {
        stateSignatureBefore: input.beforeSig,
        stateSignatureAfter: input.afterSig,
        scoreBefore: input.scoreBefore,
        scoreAfter: input.scoreAfter,
        targetRef: input.targetRef,
      },
    },
  });
}

function tool(
  stage: number,
  toolName: string,
  outcome: string,
  beforeSig: string,
  afterSig: string,
  scoreBefore: number,
  scoreAfter: number,
  extra: { note?: string; targetRef?: string; pac?: string[] } = {},
) {
  return {
    stage,
    toolName,
    outcome,
    scoreBefore,
    scoreAfter,
    details: details({
      beforeSig,
      afterSig,
      scoreBefore,
      scoreAfter,
      ...extra,
    }),
  };
}

function row(file: string, score: number, tools: ReturnType<typeof tool>[], categories = [
  category('alt_text', score >= 90 ? 100 : 20),
  category('heading_structure', 100),
  category('reading_order', 100),
  category('table_markup', 100),
  category('pdf_ua_compliance', score >= 90 ? 100 : 79),
]) {
  return {
    file,
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : 'F',
    durationMs: 1000,
    falsePositiveApplied: 0,
    categoryGap: { after: categories },
    appliedTools: tools,
  };
}

function report(rows: ReturnType<typeof row>[]) {
  return { rows };
}

describe('original50 early route repeatability diagnostic', () => {
  it('classifies initial analysis signature variance before behavior promotion', () => {
    const diagnostic = buildOriginal50EarlyRouteDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([
        row('4680-current.pdf', 59, [
          tool(1, 'set_document_language', 'applied', 'low-initial', 'low-meta', 59, 59),
        ]),
      ]),
      referenceInputs: [
        {
          label: 'accepted',
          path: '/accepted.json',
          report: report([
            row('4680-current.pdf', 98, [
              tool(1, 'set_document_language', 'applied', 'high-initial', 'high-meta', 59, 59),
            ]),
          ]),
        },
      ],
      rows: ['4680'],
    });

    expect(diagnostic.rows[0]?.classification).toBe('initial_analysis_variance');
    expect(diagnostic.decision.status).toBe('diagnose_early_route_variance_before_behavior');
  });

  it('classifies metadata-stage route variance when initial signatures match', () => {
    const diagnostic = buildOriginal50EarlyRouteDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([
        row('4683-current.pdf', 59, [
          tool(1, 'set_document_language', 'rejected', 'same-initial', 'same-initial', 48, 48, {
            note: 'stage_regressed_category(reading_order:100->96)',
          }),
        ]),
      ]),
      referenceInputs: [
        {
          label: 'accepted',
          path: '/accepted.json',
          report: report([
            row('4683-current.pdf', 99, [
              tool(1, 'set_document_language', 'applied', 'same-initial', 'same-meta', 48, 59),
            ]),
          ]),
        },
      ],
      rows: ['4683'],
    });

    expect(diagnostic.rows[0]?.classification).toBe('metadata_stage_route_variance');
    expect(diagnostic.rows[0]?.metadataDecisionStableWithBest).toBe(false);
  });

  it('classifies family-specific figure blockers after stable early route', () => {
    const early = [
      tool(1, 'set_document_language', 'applied', 'same-initial', 'same-meta', 59, 59),
      tool(4, 'normalize_heading_hierarchy', 'no_effect', 'same-meta', 'same-heading', 59, 59),
    ];
    const diagnostic = buildOriginal50EarlyRouteDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([
        row('4754-current.pdf', 59, [
          ...early,
          tool(6, 'set_figure_alt_text', 'rejected', 'same-heading', 'figure-bad', 59, 59, {
            pac: ['pdfua.figure.alt_present'],
            targetRef: '324_0',
          }),
        ]),
      ]),
      referenceInputs: [
        {
          label: 'accepted',
          path: '/accepted.json',
          report: report([
            row('4754-current.pdf', 94, [
              ...early,
              tool(6, 'set_figure_alt_text', 'applied', 'same-heading', 'figure-good', 59, 94, {
                targetRef: '324_0',
              }),
            ]),
          ]),
        },
      ],
      rows: ['4754'],
    });

    expect(diagnostic.rows[0]?.classification).toBe('figure_alt_route_blocker');
    expect(renderOriginal50EarlyRouteMarkdown(diagnostic)).toContain('figure_alt_route_blocker');
  });

  it('writes JSON and Markdown from raw remediate result arrays', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-early-route-'));
    try {
      const gatePath = join(dir, 'remediate.results.json');
      const refPath = join(dir, 'baseline_report.json');
      await writeFile(gatePath, JSON.stringify([
        row('4680-current.pdf', 59, [
          tool(1, 'set_document_language', 'applied', 'raw-low', 'raw-low-meta', 59, 59),
        ], [
          category('alt_text', 0),
          category('heading_structure', 79),
          category('reading_order', 96),
          category('table_markup', 100),
          category('pdf_ua_compliance', 79),
        ]),
      ]), 'utf8');
      await writeFile(refPath, JSON.stringify(report([
        row('4680-current.pdf', 98, [
          tool(1, 'set_document_language', 'applied', 'raw-high', 'raw-high-meta', 59, 59),
        ]),
      ])), 'utf8');
      const outDir = join(dir, 'out');

      const diagnostic = await writeOriginal50EarlyRouteDiagnostic({
        gate: gatePath,
        references: [{ label: 'accepted', path: refPath }],
        rows: ['4680'],
        outDir,
        targetScore: 93,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-early-route-repeatability-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-early-route-repeatability-diagnostic.md'), 'utf8');

      expect(diagnostic.rows[0]?.gate.categories.alt_text).toBe(0);
      expect(json).toMatchObject({ summary: { rowCount: 1 } });
      expect(md).toContain('Original-50 Early Route Repeatability Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

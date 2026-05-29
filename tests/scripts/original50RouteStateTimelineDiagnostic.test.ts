import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOriginal50RouteStateTimelineDiagnostic,
  renderOriginal50RouteStateTimelineMarkdown,
  writeOriginal50RouteStateTimelineDiagnostic,
} from '../../scripts/original50-route-state-timeline-diagnostic.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function details(input: {
  reason?: string;
  beforeSig?: string;
  afterSig?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  before?: Record<string, number>;
  after?: Record<string, number>;
  pac?: string[];
}) {
  return JSON.stringify({
    note: input.reason,
    pacRuleRegressions: (input.pac ?? []).map(ruleId => ({ ruleId })),
    debug: {
      replayState: {
        stateSignatureBefore: input.beforeSig,
        stateSignatureAfter: input.afterSig,
        scoreBefore: input.scoreBefore,
        scoreAfter: input.scoreAfter,
        categoryScoresBefore: input.before,
        categoryScoresAfter: input.after,
      },
    },
  });
}

function tool(toolName: string, outcome: string, d: string) {
  return {
    toolName,
    outcome,
    stage: 4,
    scoreBefore: 59,
    scoreAfter: 59,
    details: d,
  };
}

function row(file: string, score: number, extra: Record<string, unknown> = {}) {
  return {
    file,
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
    durationMs: 1000,
    falsePositiveApplied: 0,
    categoryGap: {
      after: [
        category('heading_structure', 100),
        category('alt_text', 100),
        category('table_markup', 100),
        category('reading_order', 100),
        category('pdf_ua_compliance', 100),
      ],
    },
    ...extra,
  };
}

function report(rows: ReturnType<typeof row>[]) {
  return { rows };
}

describe('original50 route-state timeline diagnostic', () => {
  it('detects same-state accepted/rejected divergence', () => {
    const rejected = details({
      reason: 'pac_rule_regressed(pdfua.table.header_association_present)',
      beforeSig: 'same-a',
      afterSig: 'same-b',
      scoreBefore: 85,
      scoreAfter: 94,
      before: { heading_structure: 44, table_markup: 79 },
      after: { heading_structure: 86, table_markup: 79 },
      pac: ['pdfua.table.header_association_present'],
    });
    const accepted = details({
      reason: 'heading_reachability_improved',
      beforeSig: 'same-a',
      afterSig: 'same-b',
      scoreBefore: 85,
      scoreAfter: 94,
      before: { heading_structure: 44, table_markup: 79 },
      after: { heading_structure: 86, table_markup: 79 },
    });

    const diagnostic = buildOriginal50RouteStateTimelineDiagnostic({
      generatedAt: '2026-05-29T00:00:00.000Z',
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([row('4754-route.pdf', 85, { appliedTools: [tool('normalize_heading_hierarchy', 'rejected', rejected)] })]),
      referenceInputs: [
        { label: 'repeat', path: '/repeat.json', report: report([row('4754-route.pdf', 94, { appliedTools: [tool('normalize_heading_hierarchy', 'applied', accepted)] })]) },
      ],
    });

    expect(diagnostic.rows[0]).toMatchObject({
      key: '4754',
      classification: 'same_state_acceptance_divergence',
    });
    expect(diagnostic.rows[0]?.sameStateDivergences).toHaveLength(1);
    expect(diagnostic.decision.status).toBe('investigate_acceptance_determinism_first');
  });

  it('classifies high candidates blocked by PAC regression', () => {
    const diagnostic = buildOriginal50RouteStateTimelineDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([
        row('4516-route.pdf', 59, {
          appliedTools: [
            tool('repair_alt_text_structure', 'rejected', details({
              reason: 'pac_rule_regressed(pdfua.figure.alt_present)',
              beforeSig: 'a',
              afterSig: 'b',
              scoreBefore: 59,
              scoreAfter: 94,
              before: { alt_text: 0, table_markup: 100 },
              after: { alt_text: 100, table_markup: 100 },
              pac: ['pdfua.figure.alt_present'],
            })),
          ],
        }),
      ]),
      referenceInputs: [
        { label: 'accepted', path: '/accepted.json', report: report([row('4516-route.pdf', 92)]) },
      ],
    });

    expect(diagnostic.rows[0]?.classification).toBe('guarded_high_candidate_pac_blocked');
    expect(diagnostic.rows[0]?.rejectedHighCandidates[0]?.pacRegressions).toContain('pdfua.figure.alt_present');
  });

  it('classifies upstream variance when no high candidate explains the spread', () => {
    const diagnostic = buildOriginal50RouteStateTimelineDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([row('4076-route.pdf', 69, { appliedTools: [tool('normalize_annotation_tab_order', 'applied', details({ beforeSig: 'low-a', afterSig: 'low-b', scoreBefore: 55, scoreAfter: 69 }))] })]),
      referenceInputs: [
        { label: 'accepted', path: '/accepted.json', report: report([row('4076-route.pdf', 90, { appliedTools: [tool('normalize_annotation_tab_order', 'applied', details({ beforeSig: 'high-a', afterSig: 'high-b', scoreBefore: 55, scoreAfter: 90 }))] })]) },
      ],
    });

    expect(diagnostic.rows[0]?.classification).toBe('upstream_state_variance');
    expect(renderOriginal50RouteStateTimelineMarkdown(diagnostic)).toContain('upstream_state_variance');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-route-state-'));
    try {
      const gatePath = join(dir, 'gate.json');
      const refPath = join(dir, 'ref.json');
      await writeFile(gatePath, JSON.stringify(report([row('4683-route.pdf', 62)])), 'utf8');
      await writeFile(refPath, JSON.stringify(report([row('4683-route.pdf', 99)])), 'utf8');
      const outDir = join(dir, 'out');

      const diagnostic = await writeOriginal50RouteStateTimelineDiagnostic({
        gate: gatePath,
        references: [{ label: 'accepted', path: refPath }],
        rows: [],
        outDir,
        targetScore: 93,
        timeoutMs: 300000,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-route-state-timeline-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-route-state-timeline-diagnostic.md'), 'utf8');

      expect(diagnostic.summary.rowCount).toBe(1);
      expect(json).toMatchObject({ summary: { rowCount: 1 } });
      expect(md).toContain('Original-50 Route-State Timeline Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads raw remediate result arrays and current reanalyzed categories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-route-state-raw-'));
    try {
      const gatePath = join(dir, 'remediate.results.json');
      await writeFile(gatePath, JSON.stringify([
        {
          file: '4754-route.pdf',
          afterScore: 59,
          afterGrade: 'F',
          durationMs: 1000,
          falsePositiveApplied: 0,
          reanalyzedCategories: [
            category('heading_structure', 44),
            category('alt_text', 20),
            category('table_markup', 79),
            category('reading_order', 100),
            category('pdf_ua_compliance', 71),
          ],
        },
      ]), 'utf8');
      const outDir = join(dir, 'out');

      const diagnostic = await writeOriginal50RouteStateTimelineDiagnostic({
        gate: gatePath,
        references: [],
        rows: ['4754'],
        outDir,
        targetScore: 93,
        timeoutMs: 300000,
      });

      expect(diagnostic.rows[0]?.gate.categories.heading_structure).toBe(44);
      expect(diagnostic.summary.rowCount).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

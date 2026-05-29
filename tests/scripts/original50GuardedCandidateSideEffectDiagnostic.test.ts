import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildGuardedCandidateSideEffectDiagnostic,
  renderGuardedCandidateSideEffectMarkdown,
  writeGuardedCandidateSideEffectDiagnostic,
} from '../../scripts/original50-guarded-candidate-side-effect-diagnostic.js';

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
  signalsBefore?: Record<string, number | boolean>;
  signalsAfter?: Record<string, number | boolean>;
  pac?: Array<{ ruleId: string; category?: string; beforeCount?: number; afterCount?: number }>;
}) {
  return JSON.stringify({
    note: input.reason,
    pacRuleRegressions: input.pac ?? [],
    debug: {
      replayState: {
        stateSignatureBefore: input.beforeSig,
        stateSignatureAfter: input.afterSig,
        scoreBefore: input.scoreBefore,
        scoreAfter: input.scoreAfter,
        categoryScoresBefore: input.before,
        categoryScoresAfter: input.after,
        detectionSignalsBefore: input.signalsBefore,
        detectionSignalsAfter: input.signalsAfter,
      },
    },
  });
}

function tool(toolName: string, outcome: string, d: string) {
  return {
    toolName,
    outcome,
    stage: 4,
    scoreBefore: 85,
    scoreAfter: 94,
    details: d,
  };
}

function row(file: string, score: number, tools: ReturnType<typeof tool>[] = []) {
  return {
    file,
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
    falsePositiveApplied: 0,
    categoryGap: {
      after: [
        category('heading_structure', score >= 90 ? 86 : 44),
        category('alt_text', 100),
        category('table_markup', 79),
        category('reading_order', 100),
        category('pdf_ua_compliance', 71),
      ],
    },
    appliedTools: tools,
  };
}

function report(rows: ReturnType<typeof row>[]) {
  return { rows };
}

describe('original50 guarded candidate side-effect diagnostic', () => {
  it('detects a rejected candidate that matches an accepted reference final state', () => {
    const sameState = details({
      reason: 'pac_rule_regressed(pdfua.table.header_association_present)',
      beforeSig: 'before',
      afterSig: 'accepted-final',
      scoreBefore: 85,
      scoreAfter: 94,
      before: { heading_structure: 44, table_markup: 79 },
      after: { heading_structure: 86, table_markup: 79 },
      pac: [{ ruleId: 'pdfua.table.header_association_present', category: 'table_markup', beforeCount: 21, afterCount: 22 }],
    });
    const diagnostic = buildGuardedCandidateSideEffectDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([row('4754-route.pdf', 85, [tool('normalize_heading_hierarchy', 'rejected', sameState)])]),
      referenceInputs: [
        {
          label: 'accepted',
          path: '/accepted.json',
          report: report([row('4754-route.pdf', 94, [tool('normalize_heading_hierarchy', 'applied', sameState)])]),
        },
      ],
    });

    expect(diagnostic.rows[0]?.attempts[0]).toMatchObject({
      classification: 'accepted_reference_same_state_context_divergence',
    });
    expect(diagnostic.decision.status).toBe('diagnose_acceptance_context_determinism');
  });

  it('separates structure-stable analysis count drift from real cleanup proof', () => {
    const drift = details({
      reason: 'stage_regressed_category(reading_order:100->96)',
      beforeSig: 'a',
      afterSig: 'b',
      scoreBefore: 59,
      scoreAfter: 98,
      before: { reading_order: 100, heading_structure: 99 },
      after: { reading_order: 96, heading_structure: 99 },
      signalsBefore: { treeHeadingCount: 22, structureTreeDepth: 4, orphanMcidCount: 64, extractedHeadingCount: 20 },
      signalsAfter: { treeHeadingCount: 22, structureTreeDepth: 4, orphanMcidCount: 64, extractedHeadingCount: 1 },
    });
    const diagnostic = buildGuardedCandidateSideEffectDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([row('4683-route.pdf', 62, [tool('retag_as_figure', 'rejected', drift)])]),
      referenceInputs: [{ label: 'accepted', path: '/accepted.json', report: report([row('4683-route.pdf', 99)]) }],
    });

    expect(diagnostic.rows[0]?.attempts[0]?.classification).toBe('structure_stable_analysis_count_drift');
    expect(renderGuardedCandidateSideEffectMarkdown(diagnostic)).toContain('structure_stable_analysis_count_drift');
  });

  it('classifies PAC count increments without category score drops', () => {
    const pac = details({
      reason: 'pac_rule_regressed(pdfua.table.header_association_present)',
      beforeSig: 'a',
      afterSig: 'b',
      scoreBefore: 85,
      scoreAfter: 94,
      before: { heading_structure: 44, table_markup: 79 },
      after: { heading_structure: 86, table_markup: 79 },
      pac: [{ ruleId: 'pdfua.table.header_association_present', category: 'table_markup', beforeCount: 21, afterCount: 22 }],
    });
    const diagnostic = buildGuardedCandidateSideEffectDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([row('4754-route.pdf', 85, [tool('repair_native_table_headers', 'rejected', pac)])]),
      referenceInputs: [{ label: 'accepted', path: '/accepted.json', report: report([row('4754-route.pdf', 94)]) }],
    });

    expect(diagnostic.rows[0]?.attempts[0]).toMatchObject({
      classification: 'pac_count_increment_without_score_drop',
      sideEffectFamilies: ['table_header_pac_regression'],
    });
  });

  it('does not treat rejected reference candidate states as accepted final states', () => {
    const rejectedAfter = details({
      reason: 'pac_rule_regressed(pdfua.table.header_association_present)',
      beforeSig: 'before',
      afterSig: 'rejected-only',
      scoreBefore: 85,
      scoreAfter: 94,
      before: { heading_structure: 44, table_markup: 79 },
      after: { heading_structure: 86, table_markup: 79 },
      pac: [{ ruleId: 'pdfua.table.header_association_present', category: 'table_markup', beforeCount: 21, afterCount: 22 }],
    });
    const diagnostic = buildGuardedCandidateSideEffectDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([row('4754-route.pdf', 85, [tool('normalize_heading_hierarchy', 'rejected', rejectedAfter)])]),
      referenceInputs: [
        {
          label: 'reference',
          path: '/reference.json',
          report: report([row('4754-route.pdf', 94, [
            tool('embed_local_font_substitutes', 'rejected', rejectedAfter),
          ])]),
        },
      ],
    });

    expect(diagnostic.rows[0]?.attempts[0]?.matchingAcceptedReferences).toHaveLength(0);
    expect(diagnostic.rows[0]?.attempts[0]?.classification).toBe('pac_count_increment_without_score_drop');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-guarded-side-effect-'));
    try {
      const gatePath = join(dir, 'gate.json');
      const refPath = join(dir, 'ref.json');
      await writeFile(gatePath, JSON.stringify(report([
        row('4683-route.pdf', 62, [tool('retag_as_figure', 'rejected', details({
          reason: 'stage_regressed_category(reading_order:100->96)',
          beforeSig: 'a',
          afterSig: 'b',
          scoreBefore: 59,
          scoreAfter: 98,
          before: { reading_order: 100 },
          after: { reading_order: 96 },
        }))]),
      ])), 'utf8');
      await writeFile(refPath, JSON.stringify(report([row('4683-route.pdf', 99)])), 'utf8');
      const outDir = join(dir, 'out');

      const diagnostic = await writeGuardedCandidateSideEffectDiagnostic({
        gate: gatePath,
        references: [{ label: 'accepted', path: refPath }],
        rows: ['4683'],
        outDir,
        targetScore: 93,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-guarded-candidate-side-effect-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-guarded-candidate-side-effect-diagnostic.md'), 'utf8');

      expect(diagnostic.summary.highBlockedAttemptCount).toBe(1);
      expect(json).toMatchObject({ summary: { highBlockedAttemptCount: 1 } });
      expect(md).toContain('Original-50 Guarded Candidate Side-Effect Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads raw remediate result arrays and current after categories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-guarded-side-effect-raw-'));
    try {
      const gatePath = join(dir, 'remediate.results.json');
      await writeFile(gatePath, JSON.stringify([
        {
          file: '4683-route.pdf',
          afterScore: 59,
          afterGrade: 'F',
          falsePositiveApplied: 0,
          afterCategories: [
            category('reading_order', 96),
            category('heading_structure', 99),
            category('alt_text', 20),
            category('table_markup', 100),
            category('pdf_ua_compliance', 57),
          ],
          appliedTools: [
            tool('retag_as_figure', 'rejected', details({
              reason: 'stage_regressed_category(reading_order:100->96)',
              beforeSig: 'a',
              afterSig: 'b',
              scoreBefore: 59,
              scoreAfter: 98,
              before: { reading_order: 100 },
              after: { reading_order: 96 },
            })),
          ],
        },
      ]), 'utf8');
      const outDir = join(dir, 'out');

      const diagnostic = await writeGuardedCandidateSideEffectDiagnostic({
        gate: gatePath,
        references: [],
        rows: ['4683'],
        outDir,
        targetScore: 93,
      });

      expect(diagnostic.rows[0]?.key).toBe('4683');
      expect(diagnostic.summary.highBlockedAttemptCount).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

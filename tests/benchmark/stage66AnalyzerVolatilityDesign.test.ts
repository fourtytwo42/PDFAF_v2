import { describe, expect, it } from 'vitest';
import {
  buildStage66Report,
  type Stage66EvidenceSummary,
  type Stage66ReportInput,
} from '../../scripts/stage66-analyzer-volatility-design.js';

const inputs: Stage66ReportInput = { stage65ReportPath: 'stage65.json', analysisReportPaths: [], boundaryReportPaths: [] };

function stage65Row(input: {
  id: string;
  klass?: string;
  family?: string;
  range?: { min: number; max: number; delta: number };
  scores?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    id: input.id,
    corpus: input.id === 'v1-4171' ? 'edge_mix_2' : 'edge_mix_1',
    class: input.klass ?? 'parked_analyzer_volatility',
    residualFamily: input.family ?? 'mixed',
    scoreRange: input.range ?? { min: 59, max: 94, delta: 35 },
    scores: input.scores ?? [
      { label: 'r1', score: 59, grade: 'F', categories: { heading_structure: 0, alt_text: 20 } },
      { label: 'r2', score: 94, grade: 'A', categories: { heading_structure: 95, alt_text: 80 } },
    ],
  };
}

function evidence(input: Partial<Stage66EvidenceSummary>): Stage66EvidenceSummary {
  return {
    source: input.source ?? 'source.json',
    kind: input.kind ?? 'analysis_repeat',
    classification: input.classification,
    decisionStatus: input.decisionStatus,
    scoreRange: input.scoreRange ?? { min: 40, max: 59, delta: 19 },
    changedFields: input.changedFields ?? [],
    nonCanonicalFields: input.nonCanonicalFields ?? [],
    canonicalizableFields: input.canonicalizableFields ?? [],
  };
}

function mapFor(id: string, items: Stage66EvidenceSummary[]): Map<string, Stage66EvidenceSummary[]> {
  return new Map([[id, items]]);
}

describe('Stage 66 analyzer volatility design', () => {
  it('classifies count/drop structural variance as non-canonicalizable analyzer debt', () => {
    const report = buildStage66Report({
      stage65: { rows: [stage65Row({ id: 'v1-4683' })] },
      analysisEvidence: mapFor('v1-4683', [evidence({ classification: 'python_structure_variance', changedFields: ['pythonStructure'] })]),
      boundaryEvidence: mapFor('v1-4683', [evidence({
        kind: 'structural_boundary',
        decisionStatus: 'non_canonicalizable_variance',
        changedFields: ['paragraphStructElems:duplicate_drop_variation'],
        nonCanonicalFields: ['paragraphStructElems'],
      })]),
      inputs,
      generatedAt: 'now',
    });
    expect(report.rows[0]?.rootCause).toBe('python_structural_drop_or_count_variance');
    expect(report.rows[0]?.decision).toBe('non_canonicalizable_analyzer_debt');
    expect(report.decision.status).toBe('diagnostic_only');
  });

  it('classifies pure ordering variance as canonicalizable', () => {
    const report = buildStage66Report({
      stage65: { rows: [stage65Row({ id: 'v1-4122' })] },
      analysisEvidence: mapFor('v1-4122', [evidence({ classification: 'python_structure_variance' })]),
      boundaryEvidence: mapFor('v1-4122', [evidence({
        kind: 'structural_boundary',
        decisionStatus: 'canonicalization_candidate',
        changedFields: ['headings:pure_ordering'],
        canonicalizableFields: ['headings'],
      })]),
      inputs,
      generatedAt: 'now',
    });
    expect(report.rows[0]?.rootCause).toBe('python_structural_order_only_variance');
    expect(report.rows[0]?.decision).toBe('canonicalizable');
    expect(report.decision.status).toBe('canonicalization_candidate');
  });

  it('separates initial-analysis variance from remediation-path variance', () => {
    const report = buildStage66Report({
      stage65: { rows: [stage65Row({ id: 'v1-4215' })] },
      analysisEvidence: mapFor('v1-4215', [evidence({ classification: 'stable_analysis', scoreRange: { min: 39, max: 39, delta: 0 } })]),
      boundaryEvidence: new Map(),
      inputs,
      generatedAt: 'now',
    });
    expect(report.rows[0]?.rootCause).toBe('remediation_path_variance_after_stable_analysis');
    expect(report.rows[0]?.decision).toBe('remediation_path_debt');
  });

  it('fails closed when repeat detail is missing', () => {
    const report = buildStage66Report({
      stage65: { rows: [stage65Row({ id: 'v1-4567' })] },
      analysisEvidence: new Map(),
      boundaryEvidence: new Map(),
      inputs,
      generatedAt: 'now',
    });
    expect(report.rows[0]?.rootCause).toBe('inconclusive_missing_repeat_detail');
    expect(report.rows[0]?.decision).toBe('inconclusive');
    expect(report.decision.status).toBe('inconclusive');
  });

  it('preserves manual/scanned rows as policy debt', () => {
    const report = buildStage66Report({
      stage65: { rows: [stage65Row({ id: 'v1-3479', klass: 'manual_scanned_debt', family: 'manual_scanned', range: { min: 52, max: 52, delta: 0 } })] },
      analysisEvidence: mapFor('v1-3479', [evidence({ classification: 'stable_analysis' })]),
      boundaryEvidence: new Map(),
      inputs,
      generatedAt: 'now',
    });
    expect(report.rows[0]?.rootCause).toBe('manual_scanned_or_policy_debt');
    expect(report.rows[0]?.decision).toBe('policy_debt');
  });
});

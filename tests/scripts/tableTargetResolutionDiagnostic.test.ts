import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTableTargetResolutionReport,
  classifyTableTargetResolution,
  loadManifestRows,
  loadPriorTableAttempts,
  parseArgs,
  type PriorTableAttempt,
  type TableTargetResolutionFeatures,
  type TableTargetResolutionInputRow,
} from '../../scripts/table-target-resolution-diagnostic.js';
import type { RankedTableHeaderBatchTarget } from '../../scripts/pac-table-header-batch-diagnostic.js';
import type { TableEvidenceRow } from '../../scripts/pac-table-header-target-diagnostic.js';

function inputRow(role: 'focus' | 'control' = 'focus'): TableTargetResolutionInputRow {
  return {
    id: role === 'focus' ? 'va-11' : 'fixture-accessible',
    pdfPath: `/tmp/${role}.pdf`,
    role,
  };
}

function features(overrides: Partial<TableTargetResolutionFeatures> = {}): TableTargetResolutionFeatures {
  return {
    score: 59,
    grade: 'F',
    pageCount: 10,
    tableMarkup: 79,
    pdfUaCompliance: 80,
    tableCount: 1,
    stableTableCount: 1,
    stableNormalizeTargetCount: 0,
    stableHeaderAssociationTargetCount: 1,
    selectedAssociationRefs: ['15_0'],
    estimatedAssociationTdDebt: 5,
    tableHeaderDebt: true,
    tableShapeDebt: false,
    tableScoreDebt: true,
    strictTablePacRules: ['pdfua.table.header_association_present'],
    pacTableFailures: ['pdfua.table.header_cells_associated'],
    layoutTableCandidateCount: 0,
    denseRowBandTableCandidateCount: 0,
    undersegmentedTableCandidateCount: 0,
    priorTableAttemptCount: 0,
    priorNonTableAttemptCount: 0,
    priorAppliedTableCount: 0,
    priorResolvedTableAttemptCount: 0,
    ...overrides,
  };
}

function normalizeTarget(overrides: Partial<TableEvidenceRow> = {}): TableEvidenceRow {
  return {
    structRef: '20_0',
    page: 0,
    rowCount: 4,
    totalCells: 20,
    headerCount: 0,
    hasHeaders: false,
    cellsMisplacedCount: 0,
    irregularRows: 0,
    ...overrides,
  };
}

function assocTarget(overrides: Partial<RankedTableHeaderBatchTarget> = {}): RankedTableHeaderBatchTarget {
  return {
    structRef: '15_0',
    page: 0,
    rowCount: 2,
    totalCells: 12,
    headerCount: 7,
    estimatedTdDebt: 5,
    ...overrides,
  };
}

function prior(overrides: Partial<PriorTableAttempt> = {}): PriorTableAttempt {
  return {
    toolName: 'normalize_table_structure',
    outcome: 'no_effect',
    targetRef: '584_0',
    targetResolved: true,
    resolvedRole: 'Figure',
    note: 'no_structural_change',
    ...overrides,
  };
}

describe('table target-resolution diagnostic', () => {
  it('parses manifest, run, inline pdfs, and limit options', () => {
    const args = parseArgs([
      '--manifest', '/tmp/manifest.json',
      '--run', '/tmp/remediate.results.json',
      '--out', '/tmp/out',
      '--limit', '2',
      '--pdf', 'va-11=/tmp/va-11.pdf',
      '--control', '/tmp/access.pdf',
    ], new Date('2026-05-21T00:00:00Z'));

    expect(args.manifest).toBe('/tmp/manifest.json');
    expect(args.run).toBe('/tmp/remediate.results.json');
    expect(args.outDir).toBe('/tmp/out');
    expect(args.limit).toBe(2);
    expect(args.rows).toEqual([
      { id: 'va-11', pdfPath: '/tmp/va-11.pdf', role: 'focus' },
      { id: 'access', pdfPath: '/tmp/access.pdf', role: 'control' },
    ]);
  });

  it('classifies stable header-association targets as promotable focus evidence', () => {
    const result = classifyTableTargetResolution({
      row: inputRow('focus'),
      features: features(),
      normalizeTargets: [],
      associationTargets: [assocTarget()],
      priorAttempts: [],
    });

    expect(result.classification).toBe('stable_header_assoc_target');
    expect(result.promotionSupported).toBe(true);
    expect(result.reasons).toContain('stable_table_header_association_target');
  });

  it('classifies stable shape targets as normalize candidates', () => {
    const result = classifyTableTargetResolution({
      row: inputRow('focus'),
      features: features({
        tableHeaderDebt: false,
        tableShapeDebt: true,
        stableNormalizeTargetCount: 1,
        stableHeaderAssociationTargetCount: 0,
      }),
      normalizeTargets: [normalizeTarget()],
      associationTargets: [],
      priorAttempts: [],
    });

    expect(result.classification).toBe('stable_normalize_target');
    expect(result.promotionSupported).toBe(true);
  });

  it('parks rows whose prior table attempt resolved to a non-table role', () => {
    const result = classifyTableTargetResolution({
      row: inputRow('focus'),
      features: features({ priorTableAttemptCount: 1, priorNonTableAttemptCount: 1 }),
      normalizeTargets: [normalizeTarget()],
      associationTargets: [assocTarget()],
      priorAttempts: [prior()],
    });

    expect(result.classification).toBe('non_table_target_attempt');
    expect(result.promotionSupported).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'prior_table_tool_target_resolved_as_non_table',
      'normalize_table_structure:584_0:Figure',
    ]));
  });

  it('parks layout-only table evidence without stable struct refs', () => {
    const result = classifyTableTargetResolution({
      row: inputRow('focus'),
      features: features({
        stableTableCount: 0,
        stableHeaderAssociationTargetCount: 0,
        tableHeaderDebt: false,
        tableShapeDebt: false,
        layoutTableCandidateCount: 10,
        denseRowBandTableCandidateCount: 8,
      }),
      normalizeTargets: [],
      associationTargets: [],
      priorAttempts: [],
    });

    expect(result.classification).toBe('layout_only_no_table_target');
    expect(result.promotionSupported).toBe(false);
  });

  it('rejects high-grade controls even with residual table debt', () => {
    const result = classifyTableTargetResolution({
      row: inputRow('control'),
      features: features({ score: 96, grade: 'A' }),
      normalizeTargets: [],
      associationTargets: [assocTarget()],
      priorAttempts: [],
    });

    expect(result.classification).toBe('control_or_high_grade_noise');
    expect(result.promotionSupported).toBe(false);
  });

  it('plans behavior proof only with two stable focus candidates and no matching controls', () => {
    const stableRow = (id: string, role: 'focus' | 'control' = 'focus') => ({
      id,
      pdfPath: `/tmp/${id}.pdf`,
      role,
      classification: 'stable_header_assoc_target' as const,
      promotionSupported: role === 'focus',
      reasons: [],
      features: features(),
      topNormalizeTargets: [],
      topAssociationTargets: [assocTarget()],
      priorAttempts: [],
    });
    const report = buildTableTargetResolutionReport({
      manifest: '/tmp/manifest.json',
      run: '/tmp/run.json',
      outDir: '/tmp/out',
      rows: [
        stableRow('a'),
        stableRow('b'),
      ],
    });

    expect(report.decision.status).toBe('plan_table_target_behavior_proof');

    const unsafe = buildTableTargetResolutionReport({
      manifest: '/tmp/manifest.json',
      run: '/tmp/run.json',
      outDir: '/tmp/out',
      rows: [
        stableRow('a'),
        stableRow('b'),
        stableRow('control', 'control'),
      ],
    });
    expect(unsafe.decision.status).toBe('keep_table_target_resolution_diagnostic_only');
  });

  it('loads manifest rows and prior table attempts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-table-target-'));
    try {
      const manifest = join(dir, 'manifest.json');
      const run = join(dir, 'remediate.results.json');
      await writeFile(manifest, JSON.stringify([
        { id: 'va-11', file: '/tmp/va-11.pdf', intent: 'table_transaction_positive' },
        { id: 'fixture-accessible', file: '/tmp/access.pdf', intent: 'table_transaction_control' },
      ]));
      await writeFile(run, JSON.stringify([
        {
          id: 'v1-va-11',
          file: '/tmp/va-11.pdf',
          appliedTools: [{
            toolName: 'set_table_header_cells',
            outcome: 'applied',
            details: JSON.stringify({
              note: 'table_header_association_improved',
              invariants: {
                targetRef: '15_0',
                targetResolved: true,
                resolvedRole: 'Table',
              },
            }),
          }],
        },
      ]));

      const rows = await loadManifestRows(manifest);
      expect(rows).toEqual([
        { id: 'va-11', pdfPath: '/tmp/va-11.pdf', role: 'focus', intent: 'table_transaction_positive' },
        { id: 'fixture-accessible', pdfPath: '/tmp/access.pdf', role: 'control', intent: 'table_transaction_control' },
      ]);

      const attempts = await loadPriorTableAttempts(run);
      expect(attempts.get('va-11')).toEqual([{
        toolName: 'set_table_header_cells',
        outcome: 'applied',
        targetRef: '15_0',
        targetResolved: true,
        resolvedRole: 'Table',
        note: 'table_header_association_improved',
      }]);

      const markdown = await readFile(manifest, 'utf8');
      expect(markdown).toContain('va-11');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

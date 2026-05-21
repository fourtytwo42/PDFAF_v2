import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyTableTransactionRow,
  loadBenchmarkEvidence,
  parseArgs,
  runTableUndersegmentationDiagnostic,
  type BenchmarkEvidence,
  type TableSidecarRow,
} from '../../scripts/table-undersegmentation-transaction-diagnostic.js';

function sidecarRow(overrides: Partial<TableSidecarRow> = {}): TableSidecarRow {
  return {
    id: 'outside-dense-table',
    pdfPath: '/tmp/outside-dense-table.pdf',
    title: 'outside-dense-table.pdf',
    pdfaf: {
      status: 'ok',
      summary: {
        score: 52,
        grade: 'F',
        pageCount: 12,
        categoryScores: {
          text_extractability: 96,
          reading_order: 90,
          heading_structure: 90,
          alt_text: 100,
          table_markup: 0,
          pdf_ua_compliance: 67,
        },
        tableCount: 6,
        tableShapes: [{ rows: 9, columns: 8, totalCells: 65 }],
        detectionProfile: {
          tableSignals: {
            tablesWithMisplacedCells: 0,
            misplacedCellCount: 0,
            irregularTableCount: 4,
            stronglyIrregularTableCount: 4,
            directCellUnderTableCount: 0,
            layoutTableCandidateCount: 12,
            denseRowBandTableCandidateCount: 8,
          },
        },
        layoutAudit: {
          sampledPageCount: 12,
          layoutTableCandidateCount: 12,
          denseRowBandTableCandidateCount: 8,
          undersegmentedTableCandidateCount: 10,
          repeatedHeaderFooterPageCount: 12,
        },
      },
    },
    odl: {
      status: 'ok',
      summary: {
        tableCount: 100,
        denseTableHintCount: 8,
        undersegmentedTableHintCount: 10,
      },
    },
    comparison: {
      supportedLane: 'table_structure',
      tableDelta: 94,
      reason: 'ODL/native table evidence',
    },
    scoringCalibration: {
      suggestedScoringAction: 'table_undersegmentation_candidate',
      reason: 'table lane',
    },
    ...overrides,
  };
}

function evidence(overrides: Partial<BenchmarkEvidence> = {}): BenchmarkEvidence {
  return {
    id: 'outside-dense-table',
    sourceRun: '/tmp/run/baseline_report.json',
    score: 0,
    grade: null,
    tableMarkup: null,
    durationMs: 300_000,
    hardError: true,
    error: 'per_pdf_timeout_300000ms',
    falsePositiveApplied: false,
    tableToolCount: 0,
    appliedTableToolCount: 0,
    ...overrides,
  };
}

describe('table undersegmentation transaction diagnostic', () => {
  it('parses sidecar, run, and control options', () => {
    const args = parseArgs([
      '--sidecar', '/tmp/comparison-report.json',
      '--run', '/tmp/baseline_report.json',
      '--out', '/tmp/out',
      '--limit', '3',
      '--no-controls',
    ]);

    expect(args.sidecar).toBe('/tmp/comparison-report.json');
    expect(args.runs).toEqual(['/tmp/baseline_report.json']);
    expect(args.outDir).toBe('/tmp/out');
    expect(args.limit).toBe(3);
    expect(args.includeControls).toBe(false);
  });

  it('classifies dense outside table evidence as transaction-ready and normalizes first', () => {
    const row = classifyTableTransactionRow({
      row: { ...sidecarRow(), role: 'focus' },
    });

    expect(row.classification).toBe('transaction_ready_dense_table');
    expect(row.promotionSupported).toBe(true);
    expect(row.recommendedFirstTool).toBe('normalize_table_structure');
    expect(row.reasons).toEqual(expect.arrayContaining([
      'native_dense_row_band_evidence',
      'odl_native_table_lane',
      'all_dense_table_transaction_evidence_present',
    ]));
  });

  it('separates irregular table shape from full dense transaction evidence', () => {
    const row = classifyTableTransactionRow({
      row: {
        ...sidecarRow({
          pdfaf: {
            ...sidecarRow().pdfaf,
            summary: {
              ...sidecarRow().pdfaf!.summary!,
              layoutAudit: {
                sampledPageCount: 2,
                layoutTableCandidateCount: 1,
                denseRowBandTableCandidateCount: 0,
                undersegmentedTableCandidateCount: 0,
              },
            },
          },
          comparison: { supportedLane: 'no_safe_lane', tableDelta: 1, reason: 'native shape only' },
          scoringCalibration: { suggestedScoringAction: 'no_action', reason: 'not sidecar dense' },
        }),
        role: 'focus',
      },
    });

    expect(row.classification).toBe('irregular_shape_first');
    expect(row.recommendedFirstTool).toBe('normalize_table_structure');
  });

  it('separates header-association-only debt from irregular shape debt', () => {
    const base = sidecarRow();
    const row = classifyTableTransactionRow({
      row: {
        ...base,
        pdfaf: {
          ...base.pdfaf,
          summary: {
            ...base.pdfaf!.summary!,
            categoryScores: { ...base.pdfaf!.summary!.categoryScores!, table_markup: 79 },
            detectionProfile: {
              tableSignals: {
                irregularTableCount: 0,
                stronglyIrregularTableCount: 0,
                directCellUnderTableCount: 0,
                misplacedCellCount: 0,
                tablesWithMisplacedCells: 0,
                layoutTableCandidateCount: 1,
                denseRowBandTableCandidateCount: 0,
              },
            },
            layoutAudit: {
              sampledPageCount: 1,
              layoutTableCandidateCount: 1,
              denseRowBandTableCandidateCount: 0,
              undersegmentedTableCandidateCount: 0,
            },
          },
        },
        comparison: { supportedLane: 'table_structure', tableDelta: 10, reason: 'header debt' },
        role: 'focus',
      },
    });

    expect(row.classification).toBe('header_assoc_only');
    expect(row.recommendedFirstTool).toBe('set_table_header_cells');
  });

  it('rejects accessible table-heavy controls as layout noise', () => {
    const row = classifyTableTransactionRow({
      row: {
        ...sidecarRow({
          id: 'pdfaf_fixture_accessible',
          pdfPath: '/home/hendo420/PDFAF_v2/Input/experiment-corpus/00-fixtures/pdfaf_fixture_accessible.pdf',
          title: 'pdfaf_fixture_accessible.pdf',
          pdfaf: {
            ...sidecarRow().pdfaf,
            summary: {
              ...sidecarRow().pdfaf!.summary!,
              score: 96,
              grade: 'A',
              categoryScores: { ...sidecarRow().pdfaf!.summary!.categoryScores!, table_markup: 79 },
            },
          },
          scoringCalibration: { suggestedScoringAction: 'no_action', reason: 'control' },
        }),
        role: 'control',
      },
    });

    expect(row.classification).toBe('layout_table_control_noise');
    expect(row.promotionSupported).toBe(false);
    expect(row.reasons).toContain('control_row_not_safe_for_table_admission');
  });

  it('parks timeout and analyzer failure evidence before table behavior classification', () => {
    const row = classifyTableTransactionRow({
      row: { ...sidecarRow(), role: 'focus' },
      benchmarkEvidence: [evidence()],
    });

    expect(row.classification).toBe('runtime_or_analyzer_debt');
    expect(row.promotionSupported).toBe(false);
  });

  it('loads benchmark run evidence and counts table tools', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-table-run-'));
    try {
      const runPath = join(dir, 'baseline_report.json');
      await writeFile(runPath, JSON.stringify({
        rows: [{
          file: 'sample.pdf',
          afterScore: 69,
          afterGrade: 'D',
          afterCategories: [{ key: 'table_markup', score: 0 }],
          durationMs: 1200,
          falsePositiveApplied: false,
          appliedTools: [
            { toolName: 'normalize_table_structure', outcome: 'applied' },
            { toolName: 'set_document_title', outcome: 'applied' },
          ],
        }],
      }));

      const rows = await loadBenchmarkEvidence(runPath);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'sample',
        score: 69,
        grade: 'D',
        tableMarkup: 0,
        tableToolCount: 1,
        appliedTableToolCount: 1,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes JSON and Markdown reports without calling ODL or remediation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-table-diagnostic-'));
    try {
      const sidecarPath = join(dir, 'comparison-report.json');
      const outDir = join(dir, 'out');
      await writeFile(sidecarPath, JSON.stringify({
        rows: [
          sidecarRow(),
          sidecarRow({
            id: 'pdfaf_fixture_accessible',
            pdfPath: '/home/hendo420/PDFAF_v2/Input/experiment-corpus/00-fixtures/pdfaf_fixture_accessible.pdf',
            title: 'pdfaf_fixture_accessible.pdf',
            pdfaf: {
              ...sidecarRow().pdfaf,
              summary: {
                ...sidecarRow().pdfaf!.summary!,
                score: 96,
                grade: 'A',
                categoryScores: { ...sidecarRow().pdfaf!.summary!.categoryScores!, table_markup: 79 },
              },
            },
            scoringCalibration: { suggestedScoringAction: 'no_action', reason: 'control' },
          }),
        ],
      }));

      const report = await runTableUndersegmentationDiagnostic({
        sidecar: sidecarPath,
        runs: [],
        outDir,
        includeControls: true,
      });

      expect(report.decision.status).toBe('diagnostic_only_insufficient_evidence');
      const json = await readFile(join(outDir, 'table-undersegmentation-transaction.json'), 'utf8');
      const md = await readFile(join(outDir, 'table-undersegmentation-transaction.md'), 'utf8');
      expect(json).toContain('transaction_ready_dense_table');
      expect(md).toContain('# Table Undersegmentation Transaction Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

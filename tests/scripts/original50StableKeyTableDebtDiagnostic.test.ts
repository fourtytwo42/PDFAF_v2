import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStableKeyTableDebtDiagnostic,
  writeStableKeyTableDebtDiagnostic,
} from '../../scripts/original50-stable-key-table-debt-diagnostic.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function categories(input: Record<string, number>) {
  return Object.entries(input).map(([key, score]) => category(key, score));
}

function profile(input: {
  irregular?: number;
  strong?: number;
  dense?: number;
}) {
  return {
    tableSignals: {
      irregularTableCount: input.irregular ?? 0,
      stronglyIrregularTableCount: input.strong ?? 0,
      denseRowBandTableCandidateCount: input.dense ?? 0,
      layoutTableCandidateCount: input.dense ?? 0,
    },
  };
}

function row(id: string, input: {
  before?: number;
  after?: number;
  reanalyzed?: number;
  beforeTable?: number;
  afterTable?: number;
  afterHeading?: number;
  afterAlt?: number;
  afterReading?: number;
  tableTools?: Array<{ toolName: string; outcome: string }>;
}) {
  return {
    id,
    file: `${id}.pdf`,
    beforeScore: input.before ?? 43,
    afterScore: input.after ?? 69,
    reanalyzedScore: input.reanalyzed ?? input.after ?? 69,
    beforeGrade: 'F',
    afterGrade: 'D',
    reanalyzedGrade: 'D',
    beforeCategories: categories({
      table_markup: input.beforeTable ?? 0,
      heading_structure: 44,
      alt_text: 0,
      reading_order: 79,
      pdf_ua_compliance: 38,
    }),
    afterCategories: categories({
      table_markup: input.afterTable ?? 0,
      heading_structure: input.afterHeading ?? 100,
      alt_text: input.afterAlt ?? 85,
      reading_order: input.afterReading ?? 100,
      pdf_ua_compliance: 71,
    }),
    reanalyzedCategories: categories({
      table_markup: input.afterTable ?? 0,
      heading_structure: input.afterHeading ?? 100,
      alt_text: input.afterAlt ?? 85,
      reading_order: input.afterReading ?? 100,
      pdf_ua_compliance: 71,
    }),
    reanalyzedDetectionProfile: profile({ irregular: 9, strong: 4, dense: 18 }),
    runtimeSummary: {
      toolTimings: input.tableTools ?? [
        { toolName: 'normalize_table_structure', outcome: 'no_effect', stage: 4, round: 1 },
      ],
      boundedWork: {
        deterministicEarlyExitReasons: [{ key: 'round_no_improvement', count: 1 }],
      },
    },
    remediationOutcomeSummary: {
      familySummaries: [{
        family: 'tables',
        status: 'needs_manual_review',
        beforeSignalCount: 14,
        afterSignalCount: 14,
        residualSignals: ['irregular_tables', 'strongly_irregular_tables', 'table_markup_category'],
      }],
    },
  };
}

function boundary(key: string, score = 43) {
  return {
    key,
    repeats: [1, 2, 3].map(index => ({
      index,
      analyze: {
        ok: true,
        score,
        grade: 'F',
        categories: { table_markup: 0 },
      },
      structure: {
        ok: true,
        signals: {
          headingCount: 34,
          figureCount: 25,
          tableCount: 17,
          paragraphStructElemCount: 2000,
          tableHeaderAssociationMissingCount: 2,
          tableDataCellsWithoutHeaderCount: 2,
          tableOrphanHeaderCellCount: 0,
        },
      },
    })),
  };
}

describe('original50 stable-key table debt diagnostic', () => {
  it('classifies a stable-key focus row whose non-table categories recover but table tools no-effect', () => {
    const diagnostic = buildStableKeyTableDebtDiagnostic({
      runDir: '/tmp/run',
      boundaryJson: '/tmp/boundary.json',
      outDir: '/tmp/out',
      remediationRows: [row('long-4516', {})],
      boundaryReport: { rows: [boundary('4516')] },
    });

    expect(diagnostic.rows[0]?.classification).toBe('stable_key_table_header_debt_blocker');
    expect(diagnostic.rows[0]?.reasons).toContain('heading_reading_alt_recovered_enough_to_expose_table_wall');
    expect(diagnostic.decision.status).toBe('park_stable_key_until_table_recovery_proof');
  });

  it('classifies original controls with table debt separately', () => {
    const diagnostic = buildStableKeyTableDebtDiagnostic({
      runDir: '/tmp/run',
      boundaryJson: '/tmp/boundary.json',
      outDir: '/tmp/out',
      controls: ['4438'],
      remediationRows: [row('structure-4438', {
        afterHeading: 94,
        afterAlt: 50,
        afterReading: 79,
        tableTools: [{ toolName: 'normalize_table_structure', outcome: 'applied' }],
      })],
      boundaryReport: { rows: [boundary('4438', 59)] },
    });

    expect(diagnostic.rows[0]?.role).toBe('control');
    expect(diagnostic.rows[0]?.classification).toBe('stable_key_control_table_debt');
    expect(diagnostic.summary.controlsWithTableDebt).toEqual(['structure-4438']);
  });

  it('writes JSON and Markdown from artifact files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stable-key-table-'));
    try {
      const runDir = join(dir, 'run');
      const outDir = join(dir, 'out');
      await mkdir(runDir);
      await writeFile(join(runDir, 'remediate.results.json'), JSON.stringify([row('long-4516', {})]), 'utf8');
      const boundaryJson = join(dir, 'boundary.json');
      await writeFile(boundaryJson, JSON.stringify({ rows: [boundary('4516')] }), 'utf8');

      const diagnostic = await writeStableKeyTableDebtDiagnostic({
        runDir,
        boundaryJson,
        outDir,
        controls: new Set(),
        targetScore: 93,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-stable-key-table-debt-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-stable-key-table-debt-diagnostic.md'), 'utf8');

      expect(diagnostic.summary.blockers).toEqual(['long-4516']);
      expect(json).toMatchObject({ summary: { rowCount: 1 } });
      expect(md).toContain('Original-50 Stable-Key Table Debt Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

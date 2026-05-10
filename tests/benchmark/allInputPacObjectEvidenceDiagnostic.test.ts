import { describe, expect, it } from 'vitest';
import { buildPacObjectEvidenceDiagnostic } from '../../scripts/all-input-pac-object-evidence-diagnostic.js';

function target(input: {
  file: string;
  score: number;
  family?: string;
  deficitTo93?: number;
  durationMs?: number;
  pocFailRules?: Array<{ ruleId: string; category?: string }>;
  pocFamilies?: string[];
}) {
  return {
    file: input.file,
    score: input.score,
    grade: input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : input.score >= 70 ? 'C' : input.score >= 60 ? 'D' : 'F',
    family: input.family ?? 'aggregate_near_pass_or_unknown',
    deficitTo93: input.deficitTo93 ?? Math.max(0, 93 - input.score),
    durationMs: input.durationMs ?? 1000,
    pocFailRules: input.pocFailRules ?? [],
    pocFamilies: input.pocFamilies ?? [],
    classification: 'needs_more_pac_object_evidence',
    priority: 1,
    rationale: '',
  };
}

function mergedRow(file: string, score: number, categories: Record<string, number>) {
  return {
    file,
    afterScore: score,
    afterGrade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    categoryGap: {
      after: Object.entries(categories).map(([key, value]) => ({
        key,
        score: value,
        applicable: true,
      })),
    },
  };
}

describe('all-input PAC object evidence diagnostic', () => {
  it('keeps direct font/CMap-only evidence out of behavior selection', async () => {
    const report = await buildPacObjectEvidenceDiagnostic({
      targetSelection: {
        rows: [
          target({
            file: '0034-v1-4716.pdf',
            score: 36,
            deficitTo93: 57,
            pocFamilies: ['fonts_cmap'],
            pocFailRules: [
              { ruleId: 'pdfua.font.to_unicode_cmap_present' },
              { ruleId: 'pdfua.font.to_unicode_cmap_valid' },
            ],
          }),
        ],
      },
      allInputRows: [mergedRow('0034-v1-4716.pdf', 36, { text_extractability: 65, heading_structure: 0 })],
      runRoot: null,
      generatedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'font_only_no_safe_action',
      pocReferenceFamilies: ['font_cmap'],
    }));
    expect(report.summary.selectedClassification).toBe('font_only_no_safe_action');
  });

  it('selects runtime checkpoint candidates when expensive rows already have a useful observed score', async () => {
    const report = await buildPacObjectEvidenceDiagnostic({
      targetSelection: {
        rows: [
          target({
            file: 'long-4516.pdf',
            score: 65,
            family: 'table_alt_mixed',
            durationMs: 520_000,
          }),
        ],
      },
      allInputRows: [mergedRow('long-4516.pdf', 65, { table_markup: 50, alt_text: 60 })],
      runRoot: null,
      generatedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'table_or_parenttree_object_candidate',
    }));
  });

  it('uses table PAC families and table-shaped score debt as object diagnostic candidates', async () => {
    const report = await buildPacObjectEvidenceDiagnostic({
      targetSelection: {
        rows: [
          target({
            file: '4567-safe-passage.pdf',
            score: 79,
            family: 'aggregate_near_pass_or_unknown',
            pocFamilies: ['table_headers', 'parent_tree'],
            pocFailRules: [
              { ruleId: 'pdfua.table.header_association_present' },
              { ruleId: 'pdfua.parent_tree.annotation_object_refs_consistent' },
            ],
          }),
          target({
            file: '4178-table.pdf',
            score: 83,
            family: 'table_debt',
          }),
        ],
      },
      allInputRows: [
        mergedRow('4567-safe-passage.pdf', 79, { table_markup: 0, link_quality: 79 }),
        mergedRow('4178-table.pdf', 83, { table_markup: 60 }),
      ],
      runRoot: null,
      generatedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(report.rows.map(row => `${row.file}:${row.classification}`).sort()).toEqual([
      '4178-table.pdf:table_or_parenttree_object_candidate',
      '4567-safe-passage.pdf:table_or_parenttree_object_candidate',
    ]);
    expect(report.summary.selectedTargets).toContain('4567-safe-passage.pdf');
  });

  it('classifies heading and reading weak rows as semantic candidates without better observed routes', async () => {
    const report = await buildPacObjectEvidenceDiagnostic({
      targetSelection: {
        rows: [
          target({
            file: '0283-newsletter.pdf',
            score: 52,
          }),
        ],
      },
      allInputRows: [mergedRow('0283-newsletter.pdf', 52, { heading_structure: 0, reading_order: 52 })],
      runRoot: null,
      generatedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'semantic_source_candidate',
      pocReferenceFamilies: ['heading_structure', 'annotation_link_structure'],
    }));
  });

  it('includes POC decompiled reference families in the report', async () => {
    const report = await buildPacObjectEvidenceDiagnostic({
      targetSelection: { rows: [] },
      allInputRows: [],
      runRoot: null,
      generatedAt: '2026-05-10T00:00:00.000Z',
    });

    expect(report.pocReferenceMap.map(item => item.family)).toEqual([
      'font_cmap',
      'parent_tree',
      'heading_structure',
      'table_headers',
      'annotation_link_structure',
    ]);
    expect(report.pocReferenceMap.find(item => item.family === 'parent_tree')?.decompiledReference)
      .toContain('Research/POC-decompiled');
  });
});

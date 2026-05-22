import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPacStressSampleSelectorReport,
  renderPacStressSampleSelectorMarkdown,
  writePacStressSampleSelectorReport,
} from '../../scripts/pac-stress-sample-selector.js';

const parityMap = {
  decision: { status: 'evidence_map_only' },
  lanes: [
    { id: 'table_header_transaction', status: 'parked_no_safe_predicate' },
    { id: 'language_parts_validation', status: 'mostly_aligned_monitor' },
  ],
};

const laneRollup = {
  decision: { status: 'no_safe_high_impact_lane_ready' },
  lanes: [
    { id: 'table_header_transaction', latestDecision: 'park_table_header_transaction_behavior' },
    { id: 'rendered_contrast_opt_in', latestDecision: 'keep_rendered_contrast_opt_in_diagnostic_only' },
    { id: 'font_cmap_scoring_hardening', latestDecision: 'keep_font_cmap_diagnostic_only' },
  ],
};

const validation = {
  decision: { status: 'validation_not_passing' },
  scopes: [
    { scope: 'original_50', status: 'pass' },
    { scope: 'all_unique', status: 'fail' },
    { scope: 'outside_holdout', status: 'pass' },
  ],
};

const outsideLowRow = {
  laneSummary: [
    {
      candidateClass: 'table_target_resolution_needed',
      rawPointsToTarget: 24,
      files: ['va-15-table.pdf'],
    },
    {
      candidateClass: 'near_miss_monitor',
      rawPointsToTarget: 4,
      files: ['va-17-traffic-stop-table.pdf'],
    },
  ],
  lowRows: [
    { file: 'va-15-table.pdf', candidateClass: 'table_target_resolution_needed' },
    { file: 'va-17-traffic-stop-table.pdf', candidateClass: 'near_miss_monitor' },
  ],
};

const tableTarget = {
  summary: {
    stableFocusCandidates: ['va-11'],
    nonTableAttemptRows: ['va-08', 'va-09', 'va-10'],
    unsafeControlCandidates: [],
  },
  rows: [
    { id: 'pdfaf_fixture_accessible', role: 'control' },
    { id: 'ADAM2', role: 'control' },
  ],
};

const contrast = {
  decision: { reasons: ['low_focus=3', 'low_controls=2', 'uncertain=0'] },
};

const fontCmap = {
  decision: { reasons: ['candidate_focus=0', 'candidate_controls=0', 'replacement_score_active=0'] },
};

describe('PAC stress sample selector', () => {
  it('selects an object-backed table/ParentTree stress sample when table behavior is parked but positive pressure exists', () => {
    const report = buildPacStressSampleSelectorReport({
      parityMap,
      laneRollup,
      validation,
      outsideLowRow,
      tableTarget,
      contrast,
      fontCmap,
    });

    expect(report.decision.status).toBe('build_object_backed_table_parenttree_stress_sample');
    expect(report.decision.selectedKind).toBe('object_backed_table_parenttree_targets');
    const table = report.candidates.find(candidate => candidate.kind === 'object_backed_table_parenttree_targets');
    expect(table?.status).toBe('sample_ready');
    expect(table?.behaviorReady).toBe(false);
    expect(table?.positives).toEqual(expect.arrayContaining(['va-15-table.pdf', 'va-11']));
    expect(table?.blockers).toEqual(['va-08', 'va-09', 'va-10']);
    expect(table?.controls).toEqual(expect.arrayContaining(['pdfaf_fixture_accessible', 'ADAM2']));
  });

  it('keeps contrast as control-hardening work when controls trigger', () => {
    const report = buildPacStressSampleSelectorReport({
      parityMap,
      laneRollup,
      validation,
      outsideLowRow,
      tableTarget,
      contrast,
      fontCmap,
    });

    const contrastCandidate = report.candidates.find(candidate => candidate.kind === 'true_rendered_contrast_controls');
    expect(contrastCandidate?.status).toBe('needs_better_controls');
    expect(contrastCandidate?.blockers).toContain('current sampler flags clean/accessibility controls');
  });

  it('falls back to validation-first when no sample has positive evidence', () => {
    const report = buildPacStressSampleSelectorReport({
      parityMap,
      laneRollup,
      validation,
      outsideLowRow: { laneSummary: [], lowRows: [] },
      tableTarget: { summary: { stableFocusCandidates: [], nonTableAttemptRows: [], unsafeControlCandidates: [] }, rows: [] },
      contrast: { decision: { reasons: ['low_focus=0', 'low_controls=0'] } },
      fontCmap,
    });

    expect(report.decision.status).toBe('validation_first');
    expect(report.decision.selectedKind).toBeNull();
  });

  it('does not reselect table stress work after the report-scale object-backed table proof is accepted', () => {
    const acceptedTableMap = {
      ...parityMap,
      lanes: [
        { id: 'table_header_transaction', status: 'mostly_aligned_monitor' },
        { id: 'language_parts_validation', status: 'mostly_aligned_monitor' },
      ],
    };
    const acceptedTableRollup = {
      ...laneRollup,
      lanes: [
        { id: 'table_header_transaction', latestDecision: 'accept_report_scale_object_backed_table_proof' },
        { id: 'rendered_contrast_opt_in', latestDecision: 'keep_rendered_contrast_opt_in_diagnostic_only' },
        { id: 'font_cmap_scoring_hardening', latestDecision: 'keep_font_cmap_diagnostic_only' },
      ],
    };

    const report = buildPacStressSampleSelectorReport({
      parityMap: acceptedTableMap,
      laneRollup: acceptedTableRollup,
      validation,
      outsideLowRow,
      tableTarget,
      contrast,
      fontCmap,
    });

    expect(report.decision.status).toBe('validation_first');
    expect(report.decision.selectedKind).toBeNull();
    const table = report.candidates.find(candidate => candidate.kind === 'object_backed_table_parenttree_targets');
    expect(table?.status).toBe('no_current_positive_evidence');
    expect(table?.reasons).toContain('accepted_table_baseline=true');
  });

  it('renders Markdown with selected sample gates', () => {
    const markdown = renderPacStressSampleSelectorMarkdown(buildPacStressSampleSelectorReport({
      parityMap,
      laneRollup,
      validation,
      outsideLowRow,
      tableTarget,
      contrast,
      fontCmap,
    }));

    expect(markdown).toContain('# PAC Stress Sample Selector');
    expect(markdown).toContain('object_backed_table_parenttree_targets');
    expect(markdown).toContain('Required evidence before any behavior stage');
    expect(markdown).toContain('false_positive_applied=0');
  });

  it('writes JSON and Markdown artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-pac-stress-selector-'));
    try {
      const writeJson = async (name: string, value: unknown) => {
        const path = join(dir, name);
        await writeFile(path, `${JSON.stringify(value)}\n`, 'utf8');
        return path;
      };
      const out = join(dir, 'out');
      const report = await writePacStressSampleSelectorReport({
        parityMap: await writeJson('parity.json', parityMap),
        laneRollup: await writeJson('rollup.json', laneRollup),
        validation: await writeJson('validation.json', validation),
        outsideLowRow: await writeJson('low.json', outsideLowRow),
        tableTarget: await writeJson('table.json', tableTarget),
        fontCmap: await writeJson('font.json', fontCmap),
        contrast: await writeJson('contrast.json', contrast),
      }, out);

      const json = await readFile(join(out, 'pac-stress-sample-selector.json'), 'utf8');
      const md = await readFile(join(out, 'pac-stress-sample-selector.md'), 'utf8');
      expect(report.decision.status).toBe('build_object_backed_table_parenttree_stress_sample');
      expect(JSON.parse(json)).toMatchObject({
        decision: { selectedKind: 'object_backed_table_parenttree_targets' },
      });
      expect(md).toContain('PAC Stress Sample Selector');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

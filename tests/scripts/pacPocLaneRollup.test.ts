import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPacPocLaneRollup,
  PAC_POC_LANE_ROLLUP_ITEMS,
  renderPacPocLaneRollupMarkdown,
  writePacPocLaneRollup,
} from '../../scripts/pac-poc-lane-rollup.js';

describe('PAC/POC lane rollup', () => {
  it('summarizes the current lane state without a ready high-impact behavior lane', () => {
    const rollup = buildPacPocLaneRollup();

    expect(rollup.laneCount).toBeGreaterThanOrEqual(12);
    expect(rollup.highImpactSafeImplementationNowCount).toBe(0);
    expect(rollup.decision.status).toBe('no_safe_high_impact_lane_ready');
    expect(rollup.decision.nextStep).toBe('validation_checkpoint_or_new_pac_stress_sample');
  });

  it('records accepted and parked outcomes from the latest source docs', () => {
    const rollup = buildPacPocLaneRollup();
    const content = rollup.lanes.find(lane => lane.id === 'content_form_xobject_confidence');
    const table = rollup.lanes.find(lane => lane.id === 'table_header_transaction');
    const annotation = rollup.lanes.find(lane => lane.id === 'annotation_form_existing_behavior');
    const contrast = rollup.lanes.find(lane => lane.id === 'rendered_contrast_opt_in');
    const language = rollup.lanes.find(lane => lane.id === 'language_parts_validation');

    expect(content?.outcome).toBe('accepted_native_evidence');
    expect(table?.outcome).toBe('parked_behavior_failed');
    expect(table?.safeImplementationNow).toBe(false);
    expect(annotation?.outcome).toBe('existing_behavior_aligned');
    expect(contrast?.latestDecision).toBe('keep_rendered_contrast_opt_in_diagnostic_only');
    expect(language?.outcome).toBe('accepted_native_evidence');
    expect(language?.latestDecision).toBe('provisional_direct_language_syntax_scoring_hardening');
  });

  it('renders Markdown with guardrails and next-step direction', () => {
    const markdown = renderPacPocLaneRollupMarkdown(buildPacPocLaneRollup(PAC_POC_LANE_ROLLUP_ITEMS));

    expect(markdown).toContain('# PAC/POC Lane Rollup');
    expect(markdown).toContain('diagnostic/planning output only');
    expect(markdown).toContain('Research/POC-decompiled');
    expect(markdown).toContain('validation_checkpoint_or_new_pac_stress_sample');
    expect(markdown).toContain('table_header_transaction');
    expect(markdown).toContain('direct language syntax score hardening');
  });

  it('writes JSON and Markdown artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-pac-poc-rollup-'));
    try {
      const rollup = await writePacPocLaneRollup(dir);
      const json = await readFile(join(dir, 'pac-poc-lane-rollup.json'), 'utf8');
      const md = await readFile(join(dir, 'pac-poc-lane-rollup.md'), 'utf8');

      expect(rollup.decision.status).toBe('no_safe_high_impact_lane_ready');
      expect(JSON.parse(json)).toMatchObject({
        decision: { status: 'no_safe_high_impact_lane_ready' },
      });
      expect(md).toContain('PAC/POC Lane Rollup');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

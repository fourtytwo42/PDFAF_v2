import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPacPocParityGapMap,
  PAC_POC_PARITY_LANES,
  renderPacPocParityGapMapMarkdown,
  writePacPocParityGapMap,
  type PacPocFamily,
} from '../../scripts/pac-poc-parity-gap-map.js';

describe('PAC/POC parity gap map', () => {
  it('covers the objective families with prioritized lanes', () => {
    const map = buildPacPocParityGapMap();
    const families = new Set<PacPocFamily>(map.familiesCovered);

    expect(families.size).toBeGreaterThanOrEqual(10);
    expect(families.has('parent_tree')).toBe(true);
    expect(families.has('content_tagging')).toBe(true);
    expect(families.has('table_headers')).toBe(true);
    expect(families.has('headings_reading_order')).toBe(true);
    expect(families.has('figures_alt')).toBe(true);
    expect(families.has('lists')).toBe(true);
    expect(families.has('annotations_forms')).toBe(true);
    expect(families.has('fonts_cmap')).toBe(true);
    expect(families.has('artifacts_page_furniture')).toBe(true);
    expect(families.has('language')).toBe(true);
    expect(families.has('catalog_syntax_optional')).toBe(true);

    expect(map.currentTopLane).toBeNull();
    expect(map.decision.status).toBe('evidence_map_only');
  });

  it('separates score-active rules from diagnostic-only rules', () => {
    const map = buildPacPocParityGapMap();
    const table = map.lanes.find(lane => lane.id === 'table_header_transaction');
    const font = map.lanes.find(lane => lane.id === 'font_cmap_scoring_hardening');
    const contrast = map.lanes.find(lane => lane.id === 'rendered_contrast_opt_in');
    const language = map.lanes.find(lane => lane.id === 'language_parts_validation');

    expect(table?.status).toBe('mostly_aligned_monitor');
    expect(table?.scoreActiveRuleIds).toEqual(expect.arrayContaining([
      'pdfua.table.header_association_present',
      'pdfua.table.header_cells_associated',
    ]));
    expect(font?.diagnosticRuleIds).toEqual(expect.arrayContaining([
      'pdfua.font.to_unicode_cmap_present',
      'pdfua.font.to_unicode_cmap_valid',
    ]));
    expect(contrast?.diagnosticRuleIds).toContain('wcag.contrast.text_contrast_measured');
    expect(language?.scoreActiveRuleIds).toEqual(expect.arrayContaining([
      'pdfua.language.document_lang_syntax_valid',
      'pdfua.language.structure_lang_valid',
    ]));
  });

  it('renders Markdown with the top lane and guardrail language', () => {
    const markdown = renderPacPocParityGapMapMarkdown(buildPacPocParityGapMap(PAC_POC_PARITY_LANES));

    expect(markdown).toContain('# PAC/POC Parity Gap Map');
    expect(markdown).toContain('`table_header_transaction`');
    expect(markdown).toContain('`evidence_map_only`');
    expect(markdown).toContain('diagnostic/planning output only');
    expect(markdown).toContain('Research/POC-decompiled');
    expect(markdown).toContain('report-scale object-backed table proof');
  });

  it('writes JSON and Markdown artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-pac-poc-map-'));
    try {
      const map = await writePacPocParityGapMap(dir);
      const json = await readFile(join(dir, 'pac-poc-parity-gap-map.json'), 'utf8');
      const md = await readFile(join(dir, 'pac-poc-parity-gap-map.md'), 'utf8');

      expect(map.currentTopLane).toBeNull();
      expect(JSON.parse(json)).toMatchObject({ currentTopLane: null });
      expect(md).toContain('PAC/POC Parity Gap Map');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

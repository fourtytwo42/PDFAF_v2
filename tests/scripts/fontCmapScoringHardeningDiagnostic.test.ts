import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFontCmapDiagnosticReport,
  classifyFontCmapScoringEvidence,
  collectSourceRows,
  type FontCmapFeatures,
} from '../../scripts/font-cmap-scoring-hardening-diagnostic.js';

function features(overrides: Partial<FontCmapFeatures> = {}): FontCmapFeatures {
  return {
    score: 98,
    grade: 'A',
    pdfClass: 'native_tagged',
    textExtractability: 100,
    pageCount: 10,
    textCharCount: 5_000,
    charsPerPage: 500,
    fontsChecked: 2,
    fontCount: 2,
    encodingRiskFontCount: 0,
    missingUnicodeFontCount: 0,
    unembeddedFontCount: 0,
    missingToUnicodeCMapCount: 0,
    invalidToUnicodeCMapCount: 0,
    emptyToUnicodeCMapCount: 0,
    unicodeCmapDebtCount: 0,
    cidToGidMapRiskCount: 0,
    trueTypeEncodingMismatchCount: 0,
    wModeMismatchCount: 0,
    externalCMapReferenceCount: 0,
    type0DescendantFontRiskCount: 0,
    replacementCharacterCount: 0,
    replacementCharacterRatio: 0,
    highReplacementCharacterPageCount: 0,
    replacementRiskCap: null,
    pacFontFailures: [],
    pacFontWarnings: [],
    ...overrides,
  };
}

describe('font/CMap scoring-hardening classifier', () => {
  it('treats replacement-character debt as already score-active', () => {
    const result = classifyFontCmapScoringEvidence(features({
      replacementCharacterCount: 250,
      replacementCharacterRatio: 0.05,
      replacementRiskCap: 70,
    }));

    expect(result.classification).toBe('replacement_character_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('keeps missing ToUnicode evidence diagnostic when text extraction is dense and clean', () => {
    const result = classifyFontCmapScoringEvidence(features({
      missingToUnicodeCMapCount: 1,
      unicodeCmapDebtCount: 1,
    }));

    expect(result.classification).toBe('font_cmap_syntax_only');
    expect(result.suggestedAction).toBe('keep_diagnostic');
    expect(result.reasons).toContain('dense_text_layer_no_replacement_characters');
  });

  it('classifies low native text density plus verified CMap debt as a scoring candidate', () => {
    const result = classifyFontCmapScoringEvidence(features({
      textCharCount: 320,
      charsPerPage: 32,
      missingToUnicodeCMapCount: 2,
      unicodeCmapDebtCount: 2,
      encodingRiskFontCount: 2,
      missingUnicodeFontCount: 2,
    }));

    expect(result.classification).toBe('font_cmap_true_debt_candidate');
    expect(result.suggestedAction).toBe('score_cap_candidate_requires_controls');
    expect(result.reasons).toEqual(expect.arrayContaining(['dominant_font_mapping_risk']));
  });

  it('does not propose a new cap when text extractability is already low', () => {
    const result = classifyFontCmapScoringEvidence(features({
      textExtractability: 65,
      missingToUnicodeCMapCount: 2,
      unicodeCmapDebtCount: 2,
    }));

    expect(result.classification).toBe('font_cmap_existing_low_text_score');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('keeps CID/TrueType-only risk as manual-review diagnostic', () => {
    const result = classifyFontCmapScoringEvidence(features({
      cidToGidMapRiskCount: 1,
      trueTypeEncodingMismatchCount: 1,
    }));

    expect(result.classification).toBe('font_cmap_manual_review_only');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('plans scoring validation only with focus candidates and clean controls', () => {
    const candidate = {
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      title: 'focus',
      role: 'focus' as const,
      classification: 'font_cmap_true_debt_candidate' as const,
      suggestedAction: 'score_cap_candidate_requires_controls' as const,
      reasons: [],
      features: features(),
    };
    const report = buildFontCmapDiagnosticReport('/tmp/out', [
      candidate,
      { ...candidate, id: 'focus2' },
      { ...candidate, id: 'focus3' },
      {
        ...candidate,
        id: 'control',
        role: 'control',
        classification: 'font_cmap_syntax_only',
        suggestedAction: 'keep_diagnostic',
      },
    ]);

    expect(report.decision.status).toBe('plan_font_cmap_scoring_validation');
  });

  it('loads experiment and edge-mix manifests without requiring committed PDFs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'font-cmap-manifest-'));
    try {
      const experimentManifest = join(dir, 'experiment.json');
      const edgeManifest = join(dir, 'edge.json');
      await writeFile(experimentManifest, JSON.stringify([
        { id: 'fixture-accessible', file: 'fixture.pdf', intent: 'control' },
      ]));
      await writeFile(edgeManifest, JSON.stringify({
        rows: [
          { publicationId: 'v1-1', localFile: 'row.pdf', title: 'Row', problemMix: ['font'] },
        ],
      }));

      const rows = await collectSourceRows({
        pdfs: [],
        manifests: [experimentManifest, edgeManifest],
        ids: [],
        outDir: dir,
      });

      expect(rows.map(row => row.id)).toEqual(['fixture-accessible', 'v1-1']);
      expect(rows[0]?.role).toBe('control');
      expect(rows[1]?.role).toBe('focus');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes a compact report model suitable for JSON serialization', async () => {
    const report = buildFontCmapDiagnosticReport('/tmp/out', []);
    const json = JSON.parse(JSON.stringify(report)) as typeof report;
    expect(json.decision.status).toBe('keep_font_cmap_diagnostic_only');
  });
});

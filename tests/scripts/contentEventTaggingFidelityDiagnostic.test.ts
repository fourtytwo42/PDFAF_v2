import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildContentEventDiagnosticReport,
  classifyContentEventFidelity,
  collectContentEventRows,
  type ContentEventFeatures,
} from '../../scripts/content-event-tagging-fidelity-diagnostic.js';

function features(overrides: Partial<ContentEventFeatures> = {}): ContentEventFeatures {
  return {
    score: 95,
    grade: 'A',
    pdfClass: 'native_tagged',
    pageCount: 12,
    hasStructure: true,
    pageStreamsChecked: 12,
    totalPageStreams: 12,
    formXObjectsChecked: 0,
    totalFormXObjects: 0,
    formXObjectParseErrorCount: 0,
    formXObjectSampleLimitHitCount: 0,
    auditConfidence: 'verified',
    textOutside: 0,
    imageOutside: 0,
    pathOutside: 0,
    artifactInsideTaggedContent: 0,
    taggedContentInsideArtifact: 0,
    malformedMarkedContentStack: 0,
    contentOutsidePageBounds: 0,
    orphanMcidCount: 0,
    directEventDebt: 0,
    boundaryDebt: 0,
    contentScoreCapRules: [],
    directEventScoreCapRules: [],
    directEventFailRules: [],
    directEventFailCategories: [],
    directEventCategoriesAtOrBelowStrictCap: [],
    directEventMissingScoreCapRules: [],
    ...overrides,
  };
}

describe('content-event tagging fidelity diagnostic', () => {
  it('treats verified direct content debt with an applied PAC cap as already score-active', () => {
    const result = classifyContentEventFidelity(features({
      textOutside: 3,
      directEventDebt: 3,
      contentScoreCapRules: ['pdfua.content.text_tagged_or_artifacted'],
      directEventScoreCapRules: ['pdfua.content.text_tagged_or_artifacted'],
      directEventFailRules: ['pdfua.content.text_tagged_or_artifacted'],
      directEventFailCategories: ['reading_order'],
    }));

    expect(result.classification).toBe('verified_content_debt_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
    expect(result.reasons).toContain('score_caps:pdfua.content.text_tagged_or_artifacted');
  });

  it('does not call a low already-capped category a missing score cap', () => {
    const result = classifyContentEventFidelity(features({
      score: 70,
      grade: 'C',
      imageOutside: 2,
      directEventDebt: 2,
      directEventFailRules: ['pdfua.content.image_tagged_or_artifacted'],
      directEventFailCategories: ['pdf_ua_compliance'],
      directEventCategoriesAtOrBelowStrictCap: ['pdf_ua_compliance'],
    }));

    expect(result.classification).toBe('verified_content_debt_score_active');
    expect(result.reasons).toContain('category_already_at_or_below_strict_cap:pdf_ua_compliance');
  });

  it('flags verified direct content debt with no cap evidence as a validation candidate', () => {
    const result = classifyContentEventFidelity(features({
      pathOutside: 1,
      directEventDebt: 1,
      directEventFailRules: ['pdfua.content.path_paint_tagged_or_artifacted'],
      directEventFailCategories: ['pdf_ua_compliance'],
      directEventMissingScoreCapRules: ['pdfua.content.path_paint_tagged_or_artifacted'],
    }));

    expect(result.classification).toBe('verified_content_debt_missing_score_cap');
    expect(result.suggestedAction).toBe('score_cap_validation_needed');
  });

  it('keeps partial stream coverage diagnostic-only', () => {
    const result = classifyContentEventFidelity(features({
      pageStreamsChecked: 4,
      totalPageStreams: 10,
      auditConfidence: 'heuristic',
      textOutside: 4,
      directEventDebt: 4,
    }));

    expect(result.classification).toBe('heuristic_content_debt_keep_diagnostic');
    expect(result.suggestedAction).toBe('harden_native_audit_coverage');
  });

  it('separates orphan-MCID debt from the direct content-event lane', () => {
    const result = classifyContentEventFidelity(features({
      orphanMcidCount: 8,
    }));

    expect(result.classification).toBe('orphan_mcid_only_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
    expect(result.reasons).toContain('not_content_event_tagging_lane');
  });

  it('plans scoring validation only when a missing-cap row is present', () => {
    const row = {
      id: 'focus',
      pdfPath: '/tmp/focus.pdf',
      title: 'focus',
      role: 'focus' as const,
      classification: 'verified_content_debt_missing_score_cap' as const,
      suggestedAction: 'score_cap_validation_needed' as const,
      reasons: [],
      features: features(),
    };

    const report = buildContentEventDiagnosticReport('/tmp/out', [row]);
    expect(report.decision.status).toBe('plan_content_score_cap_validation');
  });

  it('loads experiment and edge-mix manifests without requiring committed PDFs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'content-event-manifest-'));
    try {
      const experimentManifest = join(dir, 'experiment.json');
      const edgeManifest = join(dir, 'edge.json');
      await writeFile(experimentManifest, JSON.stringify([
        { id: 'fixture-accessible', file: 'fixture.pdf', intent: 'control' },
      ]));
      await writeFile(edgeManifest, JSON.stringify({
        rows: [
          { publicationId: 'v1-1', localFile: 'row.pdf', title: 'Row', problemMix: ['content'] },
        ],
      }));

      const rows = await collectContentEventRows({
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
    const report = buildContentEventDiagnosticReport('/tmp/out', []);
    const json = JSON.parse(await Promise.resolve(JSON.stringify(report))) as typeof report;
    expect(json.decision.status).toBe('content_scoring_already_aligned');
  });
});

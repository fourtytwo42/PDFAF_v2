import { describe, expect, it } from 'vitest';
import { classifyStage124Checkpoint, type Stage124ExternalRepeat, type Stage124RawRepeat } from '../../scripts/stage124-protected-raw-evidence-diff.js';

function external(
  repeat: number,
  score: number,
  categories: Record<string, number>,
  protectedUnsafeReason: string | null = score >= 87 ? null : 'protected_baseline_floor',
): Stage124ExternalRepeat {
  return { repeat, score, protectedUnsafeReason, categories };
}

function raw(
  repeat: number,
  familySignatures: Stage124RawRepeat['familySignatures'],
): Stage124RawRepeat {
  return {
    repeat,
    signature: JSON.stringify(familySignatures),
    familySignatures,
    familyCounts: Object.fromEntries(Object.keys(familySignatures).map(key => [key, 1])),
  };
}

describe('classifyStage124Checkpoint', () => {
  it('classifies table evidence disappearance as category-specific raw variance', () => {
    const result = classifyStage124Checkpoint({
      floorScore: 87,
      inRunScore: 89,
      externalRepeats: [
        external(1, 89, { table_markup: 100, heading_structure: 78 }),
        external(2, 67, { table_markup: 0, heading_structure: 78 }),
      ],
      rawRepeats: [
        raw(1, { tables: 'table-rich', headings: 'heading-a' }),
        raw(2, { tables: 'table-empty', headings: 'heading-a' }),
      ],
    });

    expect(result.classification).toBe('raw_python_category_specific_variance');
    expect(result.changedFamilies).toContain('tables');
    expect(result.correlatedCategories).toContain('table_markup');
  });

  it('classifies heading evidence variance as category-specific raw variance', () => {
    const result = classifyStage124Checkpoint({
      floorScore: 87,
      inRunScore: 89,
      externalRepeats: [
        external(1, 89, { heading_structure: 90 }),
        external(2, 69, { heading_structure: 44 }),
      ],
      rawRepeats: [
        raw(1, { headings: 'headings-rich', paragraphStructElems: 'p-a' }),
        raw(2, { headings: 'headings-poor', paragraphStructElems: 'p-a' }),
      ],
    });

    expect(result.classification).toBe('raw_python_category_specific_variance');
    expect(result.changedFamilies).toContain('headings');
    expect(result.correlatedCategories).toContain('heading_structure');
  });

  it('classifies annotation/link evidence variance as category-specific raw variance', () => {
    const result = classifyStage124Checkpoint({
      floorScore: 87,
      inRunScore: 91,
      externalRepeats: [
        external(1, 91, { link_quality: 100, reading_order: 94 }),
        external(2, 79, { link_quality: 58, reading_order: 80 }),
      ],
      rawRepeats: [
        raw(1, { annotationAccessibility: 'ann-good', linkScoringRows: 'links-good' }),
        raw(2, { annotationAccessibility: 'ann-bad', linkScoringRows: 'links-good' }),
      ],
    });

    expect(result.classification).toBe('raw_python_category_specific_variance');
    expect(result.changedFamilies).toContain('annotationAccessibility');
    expect(result.correlatedCategories).toContain('link_quality');
  });

  it('classifies stable below-floor checkpoints', () => {
    const result = classifyStage124Checkpoint({
      floorScore: 87,
      inRunScore: 79,
      externalRepeats: [
        external(1, 79, { table_markup: 0 }),
        external(2, 79, { table_markup: 0 }),
      ],
      rawRepeats: [
        raw(1, { tables: 'table-a' }),
        raw(2, { tables: 'table-a' }),
      ],
    });

    expect(result.classification).toBe('stable_below_floor');
  });

  it('classifies TypeScript-only variance when raw evidence is stable', () => {
    const result = classifyStage124Checkpoint({
      floorScore: 87,
      inRunScore: 89,
      externalRepeats: [
        external(1, 89, { table_markup: 100 }),
        external(2, 67, { table_markup: 0 }),
      ],
      rawRepeats: [
        raw(1, { tables: 'table-a', headings: 'heading-a' }),
        raw(2, { tables: 'table-a', headings: 'heading-a' }),
      ],
    });

    expect(result.classification).toBe('typescript_scoring_variance');
  });

  it('classifies stable floor-safe checkpoints', () => {
    const result = classifyStage124Checkpoint({
      floorScore: 87,
      inRunScore: 93,
      externalRepeats: [
        external(1, 93, { table_markup: 100 }, null),
        external(2, 93, { table_markup: 100 }, null),
      ],
      rawRepeats: [
        raw(1, { tables: 'table-a' }),
        raw(2, { tables: 'table-a' }),
      ],
    });

    expect(result.classification).toBe('stable_floor_safe');
  });

  it('classifies missing external analysis as no safe checkpoint available', () => {
    const result = classifyStage124Checkpoint({
      floorScore: 87,
      inRunScore: 93,
      externalRepeats: [
        { repeat: 1, score: null, protectedUnsafeReason: 'analysis_failed', categories: {} },
      ],
      rawRepeats: [
        raw(1, { tables: 'table-a' }),
      ],
    });

    expect(result.classification).toBe('no_safe_checkpoint_available');
  });
});

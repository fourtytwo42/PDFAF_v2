import { describe, expect, it } from 'vitest';
import { classifyStage158Row, type Stage158AcceptedToolHarm } from '../../scripts/stage158-active-tail-repeatability-triage.js';

const harm: Stage158AcceptedToolHarm = {
  runLabel: 'repeat',
  toolName: 'normalize_table_structure',
  targetRef: '12_0',
  targetCategory: 'table_markup',
  targetDelta: 0,
  droppedCategory: 'reading_order',
  droppedDelta: -45,
  stateSignatureBefore: 'a',
  stateSignatureAfter: 'b',
};

describe('Stage 158 active-tail repeatability triage', () => {
  it('parks manual and OCR rows before route decisions', () => {
    const result = classifyStage158Row({
      id: 'v1-v1-3451',
      representative: { localFile: 'manual_scanned/3451.pdf', afterScore: 59 },
      repeatScores: [59, 59],
      allScores: [59, 59],
      finalScore: 59,
      finalGrade: 'F',
      finalCategories: { heading_structure: 0 },
      firstAcceptedToolHarm: harm,
      finalPdfReanalysisMismatch: false,
    });

    expect(result.class).toBe('manual_or_ocr_parked');
  });

  it('classifies final-PDF reanalysis mismatches as analyzer variance', () => {
    const result = classifyStage158Row({
      id: 'v1-v1-4519',
      representative: { localFile: 'figure_alt/4519.pdf' },
      repeatScores: [80, 80],
      allScores: [80, 80],
      finalScore: 80,
      finalGrade: 'B',
      finalCategories: { table_markup: 100 },
      firstAcceptedToolHarm: null,
      finalPdfReanalysisMismatch: true,
    });

    expect(result.class).toBe('same_buffer_analyzer_variance');
  });

  it('classifies accepted tool category drops before generic route variance', () => {
    const result = classifyStage158Row({
      id: 'v1-v1-4690',
      representative: { localFile: 'table_link_annotation/4690.pdf' },
      repeatScores: [92, 61],
      allScores: [92, 61],
      finalScore: 61,
      finalGrade: 'D',
      finalCategories: { table_markup: 0, reading_order: 100 },
      firstAcceptedToolHarm: harm,
      finalPdfReanalysisMismatch: false,
    });

    expect(result.class).toBe('accepted_tool_harm');
  });

  it('classifies repeat score swings as route/order variance', () => {
    const result = classifyStage158Row({
      id: 'v1-v1-4519',
      representative: { localFile: 'figure_alt/4519.pdf' },
      repeatScores: [67, 91, 55],
      allScores: [67, 91, 55],
      finalScore: 55,
      finalGrade: 'F',
      finalCategories: { alt_text: 20, table_markup: 23, heading_structure: 45, reading_order: 45 },
      firstAcceptedToolHarm: null,
      finalPdfReanalysisMismatch: false,
    });

    expect(result.class).toBe('route_order_variance');
  });

  it('selects stable low-grade rows as stable fixer candidates', () => {
    const result = classifyStage158Row({
      id: 'v1-v1-4147',
      representative: { localFile: 'structure/4147.pdf' },
      repeatScores: [69, 69, 70],
      allScores: [69, 69, 70],
      finalScore: 69,
      finalGrade: 'D',
      finalCategories: { table_markup: 0, heading_structure: 94, reading_order: 96 },
      firstAcceptedToolHarm: null,
      finalPdfReanalysisMismatch: false,
    });

    expect(result.class).toBe('stable_fix_candidate');
  });
});

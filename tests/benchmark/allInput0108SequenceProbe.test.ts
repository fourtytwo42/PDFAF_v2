import { describe, expect, it } from 'vitest';
import { classify0108Sequence } from '../../scripts/all-input-0108-sequence-probe.js';

const pac = (harmfulFailedRules: string[] = []) => ({
  failedRules: harmfulFailedRules,
  harmfulFailedRules,
});

const score = (overrides: Partial<{
  score: number;
  grade: string;
  heading: number | null;
  reading: number | null;
  alt: number | null;
  table: number | null;
  pdfua: number | null;
}> = {}) => ({
  score: 59,
  grade: 'F',
  heading: 0,
  reading: 79,
  alt: 84,
  table: 100,
  pdfua: 57,
  ...overrides,
});

describe('all-input 0108 sequence probe classifier', () => {
  it('selects only final A-grade transactions with heading movement and preserved alt/table evidence', () => {
    expect(classify0108Sequence({
      start: score(),
      final: score({ score: 94, grade: 'A', heading: 94, reading: 96, alt: 100, table: 100, pdfua: 79 }),
      startPac: pac(['pdfua.content.orphan_mcids_absent']),
      finalPac: pac(['pdfua.content.orphan_mcids_absent']),
    })).toMatchObject({
      classification: 'safe_transaction_candidate',
    });
  });

  it('rejects the known unsafe alt/table-regressed intermediate', () => {
    expect(classify0108Sequence({
      start: score(),
      final: score({ score: 91, grade: 'A', heading: 94, reading: 96, alt: 0, table: 72 }),
      startPac: pac(),
      finalPac: pac(),
    })).toMatchObject({
      classification: 'unsafe_alt_or_table_regression',
    });
  });

  it('rejects new harmful PAC failures even when score moves', () => {
    expect(classify0108Sequence({
      start: score(),
      final: score({ score: 94, grade: 'A', heading: 94, reading: 96, alt: 100, table: 100 }),
      startPac: pac(),
      finalPac: pac(['pdfua.table.header_association_present']),
    })).toMatchObject({
      classification: 'unsafe_pac_regression',
    });
  });
});

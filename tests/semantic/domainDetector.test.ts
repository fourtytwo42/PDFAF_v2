import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectDomain } from '../../src/services/semantic/domainDetector.js';

const here = dirname(fileURLToPath(import.meta.url));
const govFixture = join(here, '../fixtures/government/icjia-style-excerpt.txt');

describe('detectDomain', () => {
  it('detects government from Illinois / policy keywords', () => {
    expect(
      detectDomain('Illinois Annual Report', 'This fiscal year the agency policy grant program appropriations.'),
    ).toBe('government');
  });

  it('detects legal from court keywords', () => {
    expect(detectDomain(null, 'The plaintiff filed in court regarding jurisdiction and sentencing.')).toBe('legal');
  });

  it('returns general for empty input', () => {
    expect(detectDomain(null, '')).toBe('general');
    expect(detectDomain('   ', '   ')).toBe('general');
  });

  it('detects medical', () => {
    expect(detectDomain('Clinical notes', 'Patient diagnosis treatment hospital medication.')).toBe('medical');
  });

  it('detects government from committed ICJIA-style government fixture text', () => {
    const text = readFileSync(govFixture, 'utf-8');
    expect(detectDomain('Illinois Criminal Justice Information Authority', text)).toBe('government');
  });
});

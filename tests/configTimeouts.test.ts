import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadConfigWithEnv(env: Record<string, string | undefined>) {
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import('../src/config.js');
}

describe('timeout configuration', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('keeps check analysis fast while giving remediation reanalysis a larger default budget', async () => {
    const config = await loadConfigWithEnv({
      PDFAF_CHECK_ANALYSIS_TIMEOUT_MS: undefined,
      PDFAF_REMEDIATION_ANALYSIS_TIMEOUT_MS: undefined,
      PDFAF_REMEDIATION_PDF_TIMEOUT_MS: undefined,
      PDFAF_EXPENSIVE_NO_GAIN_RUNTIME_SUPPRESSION_MS: undefined,
      PDFAF_REMEDIATION_REANALYSIS_SOFT_CAP_MS: undefined,
      PDFAF_REMEDIATION_SOFT_DEADLINE_BUFFER_MS: undefined,
      REQUEST_TIMEOUT_ANALYZE_MS: '15000',
      REQUEST_TIMEOUT_REMEDIATE_MS: '300000',
    });

    expect(config.CHECK_ANALYSIS_TIMEOUT_MS).toBe(15_000);
    expect(config.REQUEST_TIMEOUT_ANALYZE_MS).toBe(15_000);
    expect(config.REMEDIATION_ANALYSIS_TIMEOUT_MS).toBe(45_000);
    expect(config.REMEDIATION_PDF_TIMEOUT_MS).toBe(300_000);
    expect(config.REQUEST_TIMEOUT_REMEDIATE_MS).toBe(300_000);
    expect(config.EXPENSIVE_NO_GAIN_RUNTIME_SUPPRESSION_MS).toBe(12_000);
    expect(config.REMEDIATION_REANALYSIS_SOFT_CAP_MS).toBe(135_000);
    expect(config.REMEDIATION_SOFT_DEADLINE_BUFFER_MS).toBe(50_000);
  });

  it('lets remediation analysis and whole-PDF remediation be raised independently', async () => {
    const config = await loadConfigWithEnv({
      PDFAF_CHECK_ANALYSIS_TIMEOUT_MS: '15000',
      PDFAF_REMEDIATION_ANALYSIS_TIMEOUT_MS: '90000',
      PDFAF_REMEDIATION_PDF_TIMEOUT_MS: '600000',
      PDFAF_EXPENSIVE_NO_GAIN_RUNTIME_SUPPRESSION_MS: '25000',
      PDFAF_REMEDIATION_REANALYSIS_SOFT_CAP_MS: '180000',
      PDFAF_REMEDIATION_SOFT_DEADLINE_BUFFER_MS: '70000',
      REQUEST_TIMEOUT_ANALYZE_MS: undefined,
      REQUEST_TIMEOUT_REMEDIATE_MS: undefined,
    });

    expect(config.CHECK_ANALYSIS_TIMEOUT_MS).toBe(15_000);
    expect(config.REQUEST_TIMEOUT_ANALYZE_MS).toBe(15_000);
    expect(config.REMEDIATION_ANALYSIS_TIMEOUT_MS).toBe(90_000);
    expect(config.REMEDIATION_PDF_TIMEOUT_MS).toBe(600_000);
    expect(config.REQUEST_TIMEOUT_REMEDIATE_MS).toBe(600_000);
    expect(config.EXPENSIVE_NO_GAIN_RUNTIME_SUPPRESSION_MS).toBe(25_000);
    expect(config.REMEDIATION_REANALYSIS_SOFT_CAP_MS).toBe(180_000);
    expect(config.REMEDIATION_SOFT_DEADLINE_BUFFER_MS).toBe(70_000);
  });

  it('clamps readability auto-repair timeout independently from review timeout', async () => {
    const config = await loadConfigWithEnv({
      PDFAF_READABILITY_AUTO_REPAIR_TIMEOUT_MS: '900000',
      PDFAF_READABILITY_REVIEW_TIMEOUT_MS: '45000',
    });

    expect(config.READABILITY_REVIEW_TIMEOUT_MS).toBe(45_000);
    expect(config.READABILITY_AUTO_REPAIR_TIMEOUT_MS).toBe(600_000);
  });

  it('uses a higher default readability auto-repair timeout for default API options', async () => {
    const config = await loadConfigWithEnv({
      PDFAF_REMEDIATE_DEFAULT_READABILITY_AUTO_REPAIR: '1',
      PDFAF_READABILITY_AUTO_REPAIR_TIMEOUT_MS: undefined,
    });

    expect(config.READABILITY_AUTO_REPAIR_TIMEOUT_MS).toBe(600_000);
    expect(config.getDefaultRemediateReadabilityOptions()).toMatchObject({
      readabilityReview: true,
      readabilityAutoRepair: true,
      readabilityAutoRepairTimeoutMs: 600_000,
    });
  });
});

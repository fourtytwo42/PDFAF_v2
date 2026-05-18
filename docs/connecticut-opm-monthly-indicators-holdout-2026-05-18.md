# Connecticut OPM Monthly Indicators Outside-Corpus Holdout

Date: 2026-05-18

## Scope

This outside-corpus check uses public PDFs from the State of Connecticut Office of Policy and Management, Criminal Justice Policy and Planning Division / Statistical Analysis Center.

Source page: https://portal.ct.gov/opm/cj-about/cj-sac/cj-research-sac/monthly-indicators/monthly-indicators

Local input set:

`Input/ct_opm_monthly_indicators_holdout_2026_05_18/`

The folder contained 20 public Monthly Indicators Report PDFs from 2017-2018. Every PDF was below 10 MB; the full sample was about 8.1 MB. PDFs and generated artifacts are temporary local benchmark inputs and must not be committed.

## Run

Command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 2400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/ct_opm_monthly_indicators_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/ct-opm-monthly-indicators-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

## Summary

- PDFs processed: 20/20
- Mean: 59.00 -> 99.10
- Median: 59 -> 99
- Rows below 93: 0
- Rows below 95: 0
- Errors: 0
- `false_positive_applied`: 0
- Total deterministic runtime: 275,053 ms
- p95 runtime: 16,004 ms
- Max runtime: 16,107 ms

## Row Results

| File | Before | After | Duration ms |
|---|---:|---:|---:|
| `01-ct-opm-2018-december.pdf` | 59/F | 99/A | 13,263 |
| `02-ct-opm-2018-november.pdf` | 59/F | 99/A | 12,535 |
| `03-ct-opm-2018-october.pdf` | 59/F | 99/A | 13,293 |
| `04-ct-opm-2018-september.pdf` | 59/F | 99/A | 13,955 |
| `05-ct-opm-2018-august.pdf` | 59/F | 99/A | 13,387 |
| `06-ct-opm-2018-june.pdf` | 59/F | 99/A | 13,271 |
| `07-ct-opm-2018-may.pdf` | 59/F | 99/A | 13,107 |
| `08-ct-opm-2018-april.pdf` | 59/F | 99/A | 16,107 |
| `09-ct-opm-2018-march.pdf` | 59/F | 99/A | 13,347 |
| `10-ct-opm-2018-february.pdf` | 59/F | 99/A | 14,044 |
| `11-ct-opm-2018-january.pdf` | 59/F | 99/A | 13,293 |
| `12-ct-opm-2017-december.pdf` | 59/F | 99/A | 13,946 |
| `13-ct-opm-2017-november.pdf` | 59/F | 99/A | 14,055 |
| `14-ct-opm-2017-october.pdf` | 59/F | 99/A | 15,033 |
| `15-ct-opm-2017-september.pdf` | 59/F | 100/A | 15,149 |
| `16-ct-opm-2017-august.pdf` | 59/F | 100/A | 14,705 |
| `17-ct-opm-2017-july.pdf` | 59/F | 99/A | 12,535 |
| `18-ct-opm-2017-june.pdf` | 59/F | 99/A | 11,969 |
| `19-ct-opm-2017-may.pdf` | 59/F | 99/A | 12,055 |
| `20-ct-opm-2017-april.pdf` | 59/F | 99/A | 16,004 |

## Findings

1. This template is already well covered.

All 20 rows start at the same `59/F` shape and converge to `99/A` or `100/A` with deterministic remediation only. No semantic remediation or remediated PDF output was needed.

2. Runtime is healthy.

The full set finished in about 4.6 minutes. p95 was about 16 seconds and the slowest row was about 16.1 seconds.

3. No new fixer is justified.

There are no below-target residuals, no false-positive mutation truth issues, and no runtime tail in this sample. This set should be treated as a generalization pass for current deterministic behavior, not a source for new remediation changes.

## Decision

No behavior change was made or accepted from this source set. Generated public PDFs and public-source benchmark artifacts are removed after extracting the source-tracked metrics above.

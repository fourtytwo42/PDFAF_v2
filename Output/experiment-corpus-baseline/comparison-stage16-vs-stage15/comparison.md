# Experiment corpus benchmark comparison

- **Before run:** `run-2026-04-19T05-30-39-879Z`
- **After run:** `run-2026-04-19T06-07-38-044Z`
- **Generated:** 2026-04-19T06:23:11.191Z

## Overall

- **Analyze score mean delta:** -0.36
- **Analyze score median delta:** 0.00
- **Analyze score p95 delta:** 2.00
- **Analyze runtime median delta:** -3.65 ms
- **Analyze runtime p95 delta:** -8.69 ms
- **Analyze manual-review delta:** 0
- **Analyze score-cap delta:** alt_text:-1
- **Remediation after-score mean delta:** 0.74
- **Remediation reanalyzed mean delta:** 0.76
- **Remediation runtime median delta:** -278.09 ms
- **Remediation runtime p95 delta:** -921.45 ms
- **Remediation manual-review delta (before/after/reanalyzed): 0 / 0 / 0
- **Remediation score-cap delta:** text_extractability:+0
- **Remediation score/sec delta:** 0.059
- **Remediation confidence/sec delta:** -0.000

## Per Cohort

| Cohort | Analyze mean Δ | Analyze runtime median Δ ms | Manual-review Δ | Remediation delta mean Δ | Remediation runtime median Δ ms | Score/sec Δ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 00-fixtures | 0.83 | 1.56 | 0 | -0.17 | 15.04 | -0.256 |
| 10-short-near-pass | -0.75 | 5.37 | 0 | 4.13 | 69.16 | 0.819 |
| 20-figure-ownership | 0.00 | 11.14 | 0 | 0.00 | 143.80 | -0.060 |
| 30-structure-reading-order | -2.30 | 36.45 | 0 | 2.40 | 130.48 | 0.042 |
| 40-font-extractability | 0.38 | -4.82 | 0 | 0.25 | -183.26 | 0.042 |
| 50-long-report-mixed | 0.38 | -1.60 | 0 | -0.38 | -76.74 | 0.019 |

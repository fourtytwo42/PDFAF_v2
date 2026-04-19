# Experiment corpus benchmark comparison

- **Before run:** `run-2026-04-19T04-48-46-340Z`
- **After run:** `run-2026-04-19T05-30-39-879Z`
- **Generated:** 2026-04-19T05:46:11.404Z

## Overall

- **Analyze score mean delta:** -0.20
- **Analyze score median delta:** 0.00
- **Analyze score p95 delta:** 0.00
- **Analyze runtime median delta:** 5.75 ms
- **Analyze runtime p95 delta:** 7.35 ms
- **Analyze manual-review delta:** 0
- **Analyze score-cap delta:** alt_text:+0
- **Remediation after-score mean delta:** 16.92
- **Remediation reanalyzed mean delta:** 16.92
- **Remediation runtime median delta:** -592.19 ms
- **Remediation runtime p95 delta:** 1033.43 ms
- **Remediation manual-review delta (before/after/reanalyzed): 0 / -13 / -13
- **Remediation score-cap delta:** text_extractability:+3
- **Remediation score/sec delta:** 0.982
- **Remediation confidence/sec delta:** -0.002

## Per Cohort

| Cohort | Analyze mean Δ | Analyze runtime median Δ ms | Manual-review Δ | Remediation delta mean Δ | Remediation runtime median Δ ms | Score/sec Δ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 00-fixtures | -0.17 | 12.84 | 0 | 18.00 | 87.97 | 3.840 |
| 10-short-near-pass | 0.00 | 3.67 | 0 | 22.75 | 6.67 | 4.055 |
| 20-figure-ownership | 0.00 | 7.30 | 0 | 9.60 | -502.64 | 1.275 |
| 30-structure-reading-order | 0.80 | -16.23 | 0 | 21.30 | -1102.86 | 0.628 |
| 40-font-extractability | 0.00 | 3.11 | 0 | 30.00 | 1178.75 | 0.972 |
| 50-long-report-mixed | -2.13 | 11.98 | 0 | 2.13 | -63.62 | 0.109 |

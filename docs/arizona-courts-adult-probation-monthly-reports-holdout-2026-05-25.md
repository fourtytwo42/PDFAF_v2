# Arizona Courts Adult Probation Monthly Reports Holdout - 2026-05-25

## Source

- Public source page: `https://www.azcourts.gov/apsd/Data-and-Research/Monthly-Reports`
- Public archive page: `https://www.azcourts.gov/apsd/Data-and-Research/Monthly-Reports/Archive`
- Source type: Arizona Courts Adult Probation Services Division monthly/statistical report PDFs.
- Sampling rule: first 20 valid report-family PDF links discovered from the current monthly reports page plus archive, all under 10 MiB.
- Discovery result: 68 report-family PDF links found, 20 valid PDFs downloaded. One blank-label source row was skipped by the local downloader, then the next archive PDF filled the 20-row sample.
- Local scratch root during validation: `/mnt/pdf-review/public-holdouts/arizona-courts-adult-probation-monthly-reports-2026-05-25`.

The downloaded PDFs and generated validation artifacts are local-only scratch data and are not source-tracked.

## Validation

Validation used deterministic remediation only:

- `scripts/bounded-holdout-validation.ts`
- Node 22
- `--no-semantic`
- `--no-pdfs`
- Per-PDF timeout: default 300000 ms

Local report:

- `/mnt/pdf-review/public-holdouts/arizona-courts-adult-probation-monthly-reports-2026-05-25/run-r1/baseline_report.json`

Metrics:

- Rows processed: 20/20
- Mean before: 63.2500
- Mean after: 88.8000
- Median after: 90.0000
- Grades after: 18 A / 0 B / 0 C / 2 D / 0 F
- Rows below 93: 16
- `false_positive_applied`: 0
- Timeout/error rows: 0
- Runtime p50/p95/max: 15775 ms / 20320 ms / 20554 ms

The source does not clear the requested 93+ mean/median target.

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/arizona-courts-adult-probation-monthly-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean 93: 84

Low-row split:

- `table_target_resolution_needed`: 2 rows, 48 raw points to target
- `near_miss_monitor`: 14 rows, 42 raw points to target

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/arizona-courts-adult-probation-monthly-reports-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Focus rows: `azprob-12`, `azprob-19`
- Controls: same-source higher rows `azprob-17`, `azprob-18`, `azprob-20`, `azprob-21`, plus accessible and Teams fixtures.
- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `azprob-12`, `azprob-19`
- Unsafe control candidates: none

The table-target classifier found object-backed table targets on the two D-grade lows, but this was not enough to accept behavior. Same-source controls included non-table target attempts (`Workbook`), and fully fixing the two D rows would still not recover the 84 raw points needed for mean 93.

Table/structure sequence probe:

- Local artifact: `/mnt/pdf-review/public-holdouts/arizona-courts-adult-probation-monthly-reports-2026-05-25/table-sequence-probe-r1/table-structure-sequence-probe.md`
- Focus rows: `azprob-12`, `azprob-19`
- Sequence candidates: 0
- Harmful PAC regressions: 10
- No useful movement: 4

The best observed movements reached only `88/B` and were classified as harmful because non-target PAC failure counts increased. Current table/header/annotation sequences therefore do not provide an acceptable production path.

## Decision

No source behavior change was accepted from this holdout. No original-50 validation was required because grading/remediation code did not change.

This source reinforces the parked real table/header transaction lane: safe behavior would need to preserve or rebuild table/header associations and avoid orphan-MCID or other non-target PAC regressions. It does not justify Arizona/source/report-family gates, scorer masking, PAC relaxations, broad table admission, or target fallback.

Downloaded PDFs and generated artifacts were removed after metrics extraction.

# Minnesota DOC Adult Population Summary Public Holdout

Date: 2026-05-24

Source: Minnesota Department of Corrections Historical Population Profile Reports page: `https://mn.gov/doc/transparency-center/statistics/historical-population-summary-reports/`

This was a 20-PDF public holdout sample from official Minnesota DOC adult population summary/profile reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the newest 20 adult population report PDFs from the source page, from `1-1-26` through `7-1-16`.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `120 KB` to `824 KB`.
- Validation: two bounded deterministic 20-file runs, a two-row low-repeat check, low-row diagnostics, and a focused table target-resolution diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Results

Initial local run before cleanup: `/mnt/pdf-review/public-holdouts/minnesota-doc-adult-population-summary-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `73.75 -> 91.50`.
- Grades after remediation: `18 A / 0 B / 0 C / 2 D / 0 F`.
- Rows below 93: `11`.
- Runtime p50/p95/max: `11914ms / 18381ms / 19086ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

Fresh source rerun before cleanup: `/mnt/pdf-review/public-holdouts/minnesota-doc-adult-population-summary-2026-05-24/run-r2/baseline_report.json`

- Processed: `20/20`.
- Mean: `74.30 -> 93.70`.
- Median after remediation: `92`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `10`.
- Runtime p50/p95/max: `11979ms / 16474ms / 20699ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

The two r1 D-grade rows were `mndocpop-08` and `mndocpop-09`. A focused repeat of those two rows reached `92/A` and `92/A`, confirming that the r1 mean shortfall was route/analyzer volatility rather than a stable score floor.

## Diagnostics

The r1 low-row diagnostic selected `table_target_resolution_needed`:

- Raw points needed for 93 mean: `30`.
- High-impact rows: `mndocpop-08` and `mndocpop-09`, carrying `48` raw points to target.
- Near-miss monitor rows: `9`, carrying `11` raw points.

The table target-resolution diagnostic rejected behavior promotion:

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `0`.
- Prior non-table target rows: `mndocpop-08`, `mndocpop-09`.
- Unsafe control candidates: `mndocpop-20`.

The r2 low-row diagnostic classified the source as `holdout_target_met` with recommended lane `none`.

## Decision

No source behavior change is accepted from this source.

Minnesota is a source-passing holdout on the fresh rerun, but it shows route volatility around two 2022 table-heavy rows. The targeted table evidence is not safe enough for production behavior because the low rows had prior non-table table-target attempts and a same-source control also matched stable normalize-target shape.

No original-50 regression validation was required because no source behavior changed.

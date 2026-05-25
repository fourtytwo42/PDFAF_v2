# Texas DPS Crime In Texas Public Holdout

Date: 2026-05-25

Sources:

- Texas Department of Public Safety Crime in Texas page: `https://www.dps.texas.gov/section/crime-records/crime-texas`
- Direct official report host: `https://www.dps.texas.gov/crimereports/` and `https://www.dps.texas.gov/sites/default/files/documents/crimereports/`

This was a 20-PDF public holdout sample from official Texas DPS Crime in Texas PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: first 20 unique valid PDF downloads from the Crime in Texas page after enforcing the 10 MB file cap.
- Report mix: 2024, 2023, 2022, and 2021 annual Crime in Texas reports, the 2020 drug report, 2018 report chapters, and two 2017 report sections.
- Size cap: all 20 selected PDFs were under `10 MB`; `2020cit.pdf` and `cit2019.pdf` were skipped because curl hit the 10 MB cap.
- Validation: one bounded deterministic 20-file run, the standard low-row diagnostic, focused table target-resolution diagnostic, reading-order shell diagnostic, figure/alt diagnostic, and a small PDF/UA catalog syntax diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/texas-dps-crime-in-texas-2026-05-25/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `57.75 -> 89.40`.
- Median after remediation: `94`.
- Grades after remediation: `14 A / 2 B / 0 C / 3 D / 1 F`.
- Rows below `93`: `7`.
- Runtime p50/p95/max: `15706ms / 260233ms / 268934ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

The below-`93` rows were `txdpscit-01.pdf`, `txdpscit-02.pdf`, `txdpscit-03.pdf`, `txdpscit-04.pdf`, `txdpscit-05.pdf`, `txdpscit-11.pdf`, and `txdpscit-14.pdf`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic` with recommended lane `table_target_resolution_needed`.

- Raw points needed for a mean of `93`: `72`.
- Table target-resolution rows: `4`, carrying `75` raw points.
- Metadata/PDF-UA row: `txdpscit-01.pdf`, carrying `34` raw points.
- Reading/link-order row: `txdpscit-02.pdf`, carrying `8` raw points.
- Figure/alt row: `txdpscit-05.pdf`, carrying `4` raw points.

The table lane could theoretically close the source by itself, so it was the primary diagnostic lane.

## Table Target Diagnostic

Focused table target-resolution diagnostic returned `keep_table_target_resolution_diagnostic_only`.

- Stable focus candidates: `txdpscit-04` and `txdpscit-14`.
- Unsafe control candidates: `txdpscit-08` and `txdpscit-16`.
- Prior non-table target rows: `txdpscit-03`, `txdpscit-10`, and `txdpscit-11`.
- Classification counts: `4` stable normalize targets, `3` non-table target attempts, and `2` control/high-grade noise rows.

The focus rows have real table-shape and PAC table-header debt, but the same stable-table predicate also appears on same-source A-grade controls. Several low/control rows also show prior `set_table_header_cells` targets resolving to `TD` or `P` rather than a safe `/Table` target. This is not clean enough for planner promotion.

## Secondary Diagnostics

Reading-order shell diagnostic:

- Local artifact before cleanup: `/mnt/pdf-review/public-holdouts/texas-dps-crime-in-texas-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `0`
- Selected rows: none

Figure/alt diagnostic:

- Local artifact before cleanup: `/mnt/pdf-review/public-holdouts/texas-dps-crime-in-texas-2026-05-25/figure-alt-r1/outside-figure-alt-no-gain-diagnostic.md`
- Decision: `keep_figure_alt_diagnostic_only`
- Focus rows: `3`
- Scoring candidates: `0`
- Behavior candidates: `0`

PDF/UA catalog syntax diagnostic:

- Local artifact before cleanup: `/mnt/pdf-review/public-holdouts/texas-dps-crime-in-texas-2026-05-25/pdfua-catalog-r1/pdfua-catalog-syntax.md`
- `txdpscit-01`, `txdpscit-02`, and `txdpscit-03` were classified as `catalog_baseline_score_active`; the metadata/PDF-UA debt is already visible to scoring.
- A-grade rows `txdpscit-06` and `txdpscit-19` showed display-title catalog settings candidates, but that does not justify a behavior promotion for this below-target source.

## Decision

No source behavior change is accepted from this source. Texas DPS Crime in Texas is a useful below-target statistical-report holdout with bounded runtime and `false_positive_applied=0`, but the supported lanes are not safe to promote:

- Table normalization/header repair is high impact but triggers same-source A-grade controls.
- Several table attempts still resolve to non-table targets or hit PAC table-header association guards.
- Reading/link-order diagnostics found no native shell path.
- Figure/alt diagnostics found no scoring or behavior candidates.
- Metadata/PDF-UA debt on the major lows is already score-active rather than a missing native evidence rule.

Do not add Texas/source/year/PDF-specific gates, scorer masking, PAC relaxation, broader table admission, or broad heading creation from this evidence. A future table lane still needs a stricter object-backed table/header transaction predicate that excludes high-grade table-heavy controls and proves final PAC table/header debt reduction without header-association regressions.

Because no source behavior changed, no original-50 regression validation was required for this source.

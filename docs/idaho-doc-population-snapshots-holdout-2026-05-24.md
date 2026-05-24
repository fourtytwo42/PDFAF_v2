# Idaho DOC Population Reports Public Holdout

Date: 2026-05-24

Sources:

- Idaho Department of Correction Research and Statistics archives: `https://www.idoc.idaho.gov/content/about-us/research-and-statistics/archives`

This was a 20-PDF public holdout sample from official Idaho Department of Correction population report and population snapshot PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 eligible `/content/document/...` PDFs parsed from the official archives page, newest first.
- Report mix: FY 2025 through FY 2019 population reports/overviews, FY 2018 overview, then February 2018 through October 2017 population snapshots.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `140 KB` to `950 KB`.
- Validation: one bounded deterministic 20-file run, the standard low-row diagnostic, focused figure/alt diagnostic, and focused table target-resolution diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/idaho-doc-population-snapshots-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `58.00 -> 91.80`.
- Median after remediation: `93`.
- Grades after remediation: `13 A / 7 B / 0 C / 0 D / 0 F`.
- Rows below 93: `10`.
- Runtime p50/p95/max: `19901ms / 237115ms / 285631ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

The longest rows were the larger annual population reports: `iddocpop-13.pdf` completed in `285631ms` at `81/B`, and `iddocpop-15.pdf` completed in `237115ms` at `81/B`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `plan_medium_impact_targeted_diagnostic` with recommended lane `figure_alt_object_candidate`.

- Raw points needed for a mean of 93: `24`.
- Figure/alt candidate rows: `iddocpop-13.pdf` and `iddocpop-15.pdf`, carrying exactly `24` raw points.
- No-safe-predicate low rows: `iddocpop-09.pdf`, `iddocpop-10.pdf`, `iddocpop-11.pdf`, `iddocpop-12.pdf`, and `iddocpop-14.pdf`.
- Near-miss monitor rows: `iddocpop-06.pdf`, `iddocpop-07.pdf`, and `iddocpop-08.pdf`.

## Figure/Alt Diagnostic

Focused figure/alt diagnostic returned `keep_figure_alt_diagnostic_only`.

- Behavior candidates: `0`.
- Scoring-calibration candidates: `0`.
- `iddocpop-13.pdf` and `iddocpop-15.pdf` were classified as `checker_alt_partial_existing_bound`: bounded figure-alt writes improved checker-visible coverage, but did not reach enough final coverage to move `alt_text`.
- `iddocpop-09.pdf` and `iddocpop-10.pdf` were classified as `figure_pac_regression_blocker`, so PAC guards are correctly preventing unsafe structural changes.

Do not broaden figure/alt writes, add PAC exceptions, or calibrate scoring from this evidence alone.

## Table Diagnostic

Focused table target-resolution diagnostic returned `keep_table_target_resolution_diagnostic_only`.

- Stable focus candidates: `iddocpop-09`, `iddocpop-10`, `iddocpop-11`, `iddocpop-12`, `iddocpop-13`, `iddocpop-14`, and `iddocpop-15`.
- Unsafe control candidates: `iddocpop-16`.
- Prior non-table target rows: `iddocpop-01`.

The low rows have real PAC/table-header association debt, but the same structural predicate also triggers on an A-grade same-source control and prior behavior shows a table tool resolving to a non-table target on another control. That is not clean enough for planner promotion.

## Decision

No source behavior change is accepted from this source. Idaho DOC population reports are a useful below-target holdout (`91.80` mean, `93` median) with no false-positive applications and no hard timeout, but the score-moving lanes are not safe to promote:

- Figure/alt evidence is bounded by existing checker-visible coverage and PAC guards.
- Table/header evidence is real but control-triggering.
- Near-miss heading/table rows do not provide enough independently safe points.

Do not add Idaho/source/year/PDF-specific gates, scorer masking, PAC relaxation, broader figure-alt writes, or broad table admission from this evidence. A future safe improvement would need a cleaner object-backed table/header predicate that excludes high-grade controls, or a more precise figure-alt continuation path that improves final coverage without PAC regressions.

Because no source behavior changed, no original-50 regression validation was required for this source.

# Delaware DOC Community Confinement PREA Audits Holdout - 2026-05-24

## Source

- Source page: `https://doc.delaware.gov/views/prea.blade.shtml`
- Source data: Delaware DOC `prea_ccaudit.json` community confinement audit feed
- Agency: Delaware Department of Correction
- Sample: first 20 valid Community Confinement PREA audit PDFs from the official feed
- Constraint: all counted PDFs were official Delaware DOC PDFs and below 10 MB by actual downloaded size
- Skipped stale source link: `2017 MCCC PREA Audit Report` (`PREA_Audit_Report_MCCC_2017.pdf`) returned 404 during collection

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/delaware-doc-community-prea-audits-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `48.60 -> 83.90`
- Median after remediation: `90.5`
- Grades after remediation: `11 A / 2 B / 0 C / 6 D / 1 F`
- Rows below `93`: `11`
- Runtime p50/p95/max: `26646ms / 70313ms / 81100ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `dedocpreacc-01` | 2026 SCCC PREA Audit Report | 636055 |
| `dedocpreacc-02` | 2025 CCTC PREA Audit Report | 601978 |
| `dedocpreacc-03` | 2022 CCTC PREA Audit Report | 1197063 |
| `dedocpreacc-04` | 2019 CVOP PREA Final Audit Report | 809222 |
| `dedocpreacc-05` | 2017 CVOP PREA Audit Report | 2203156 |
| `dedocpreacc-06` | 2024 HDP PREA Audit Report | 597178 |
| `dedocpreacc-07` | 2021 HDP PREA Audit Report | 361477 |
| `dedocpreacc-08` | 2018 HDP PREA Audit Report | 726897 |
| `dedocpreacc-09` | 2015 HDP PREA Audit Report | 1294023 |
| `dedocpreacc-10` | 2019 MCCC PREA Final Audit Report | 817900 |
| `dedocpreacc-11` | 2024 PCCC PREA Audit Report | 600681 |
| `dedocpreacc-12` | 2021 PCCC PREA Audit Report | 366730 |
| `dedocpreacc-13` | 2018 PCCC PREA Audit Report | 1064336 |
| `dedocpreacc-14` | 2015 PCCC PREA Audit Report | 2848725 |
| `dedocpreacc-15` | 2023 SCCC PREA Audit Report | 450438 |
| `dedocpreacc-16` | 2020 SCCC PREA Audit Report | 178537 |
| `dedocpreacc-17` | 2017 SWRC PREA Audit Report | 844075 |
| `dedocpreacc-18` | 2015 SWRC PREA Audit Report | 578820 |
| `dedocpreacc-19` | 2017 SVOP PREA Audit Report | 383016 |
| `dedocpreacc-20` | 2015 SVOP PREA Audit Report | 629803 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `182`
- Lane split: `10` table-target rows carrying `161` points, plus `1` figure/alt row carrying `34` points
- Timeout/error rows: `0`

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `dedocpreacc-01`, `dedocpreacc-02`, `dedocpreacc-03`, `dedocpreacc-06`, `dedocpreacc-08`, `dedocpreacc-10`, `dedocpreacc-11`, `dedocpreacc-15`
- Unsafe same-source control candidate: `dedocpreacc-13`
- Prior non-table target rows: `dedocpreacc-17`, `dedocpreacc-18`, `dedocpreacc-20`
- Classification counts: `9 stable_normalize_target`, `3 non_table_target_attempt`, `12 control_or_high_grade_noise`

Figure/alt no-gain diagnostic:

- Decision: `keep_figure_alt_diagnostic_only`
- Focus rows: `1`
- Candidate behavior rows: `0`
- Candidate scoring rows: `0`
- `dedocpreacc-04` classified as `checker_alt_partial_existing_bound`: bounded object-backed alt writes improved checker-visible coverage to `6/55`, but not enough to move final `alt_text=20`

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The Delaware community PREA sample exposes useful table-header transaction and figure/alt residual debt, but the table predicate is not safe because a same-source A-grade control matches the stable table-target shape, and the single figure/alt row does not justify a new general behavior rule. The existing PAC table-header and figure-alt guards remain visible and were not relaxed.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

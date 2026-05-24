# Nevada DOC Quarterly Reports Public Holdout

Date: 2026-05-24

Source: Nevada Department of Corrections, Quarterly Reports by Fiscal Year page: `https://doc.nv.gov/About/Statistics/Quarterly_Reports_by_Fiscal_Year/Quarterly_Reports_by_Fiscal_Year/`

This was a 20-PDF public holdout sample from official Nevada DOC quarterly statistics PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 quarterly-statistics PDFs from the source page, from FY 2026 back through FY 2019.
- Validation: one bounded deterministic 20-file run plus focused replay diagnostics over the produced benchmark JSON.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/nevada-doc-quarterly-reports-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `36.15 -> 85.80`.
- Median after remediation: `94.5`.
- Grades after remediation: `14 A / 1 B / 0 C / 1 D / 4 F`.
- Points needed for mean 93: `144`.
- Runtime p50/p95/max: `33499ms / 176056ms / 203732ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `figure_alt_object_candidate` for the newest low rows and `table_target_resolution_needed` for the remaining lows.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Figure/alt object candidate | `4` | `143` | FY2025/FY2026 rows with low alt, table, PDF/UA, reading, and heading scores. |
| Table target resolution needed | `2` | `36` | `nvdoc-02` and `nvdoc-03` retained table/PDF-UA debt after remediation. |

The source has a clear version boundary: FY2024 and older rows mostly remediated to A-grade, while FY2025/FY2026 rows remained low and slower.

## Figure/Alt Diagnostic

The figure/alt no-gain diagnostic decided `keep_figure_alt_diagnostic_only`.

The four focus rows had partial checker-visible alt coverage after bounded writes, but no scoring or behavior candidates:

- `nvdoc-01`: checker-visible alt `6/51`, `alt_text=20`, `3` alt tools.
- `nvdoc-04`: checker-visible alt `6/52`, `alt_text=20`, `3` alt tools.
- `nvdoc-05`: checker-visible alt `3/52`, `alt_text=0`, `0` accepted alt tools.
- `nvdoc-06`: checker-visible alt `6/52`, `alt_text=20`, `3` alt tools.

This does not justify broader figure-alt fanout or PAC exceptions. The existing bounded writes improve some checker-visible evidence but do not reach enough coverage, and the rows also carry table, reading-order, link, and PDF/UA debt.

## Table Target Diagnostic

The table target-resolution diagnostic decided `plan_table_target_behavior_proof`:

- Stable object-backed table targets were found on all six low rows.
- No selected same-source controls matched the table target predicate.
- Prior non-table target rows: `0`.

This is a useful future behavior-proof lane, but no source change is accepted from this run. Current table mutations on the low rows still reject on honest PAC regressions such as `pdfua.figure.alt_present`, `pdfua.table.header_association_present`, and `pdfua.table.rows_regular`, or return no structural change. A safe fix needs a real table/header/figure transaction that preserves figure-alt evidence while repairing table header association and row regularity.

## Decision

No source behavior change is accepted from this source. The source fails the 93+ mean target with no hard errors and no false-positive applications, but the evidence supports a future general behavior proof rather than an immediate threshold tweak.

Do not patch with Nevada/source/fiscal-year/PDF gates, scorer masking, PAC relaxations, broad table admission, or broader figure-alt fanout from this evidence. Any future accepted change should be object-backed, control-validated, and must pass original-50 quality and speed validation.

Because no source behavior changed, no original-50 regression validation was required for this source.

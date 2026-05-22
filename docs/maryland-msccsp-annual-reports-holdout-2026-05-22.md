# Maryland MSCCSP Annual Reports Public Holdout

Date: 2026-05-22

Source: https://msccsp.org/reports/annual-reports/

This is a public-source outside-corpus diagnostic run. It used 20 unique annual report PDFs from the Maryland State Commission on Criminal Sentencing Policy annual reports archive, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: `ar2025.pdf` through `ar2006.pdf`.
- Validation: four bounded five-file shards, merged after completion.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `48.65 -> 86.75`.
- Median after remediation: `93`.
- Grades after remediation: `13 A / 1 B / 0 C / 6 D / 0 F`.
- Points needed for mean 93: `125`.
- Runtime p50/p95/max: `59022ms / 273839ms / 296534ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed` as the high-impact lane.

| Group | Rows | Notes |
| --- | ---: | --- |
| Table target-resolution rows | `8` | `msccsp-01`, `02`, `03`, `04`, `06`, `07`, `08`, and `09` carried `150` raw points-to-target. |
| Near miss | `1` | `msccsp-19` was `91/A` and table-adjacent but not a behavior target. |

The six D rows were all annual reports from 2025, 2024, 2023, 2022, 2019, and 2018. Their residual debt was table/PDF-UA centered, with some heading or link debt mixed in.

## Table Target-Resolution Diagnostic

An explicit table probe was run for the low rows with same-source controls plus `pdfaf_fixture_accessible`.

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `msccsp-01`, `msccsp-02`, `msccsp-03`, `msccsp-06`, `msccsp-08`, `msccsp-09`.
- Unsafe control candidate: `msccsp-10`.
- Prior non-table target rows: `msccsp-04`, `msccsp-05`, `msccsp-07`, `msccsp-11`, `msccsp-12`.
- Repeated rejection shape: current table tools hit PAC table-header regressions such as `pac_rule_regressed(pdfua.table.header_association_present)`.
- The table-heavy same-source control `msccsp-10` also classified as `stable_normalize_target`, so object-backed table evidence alone is too broad for behavior promotion.

## Figure/Alt Diagnostic

- Decision: `keep_figure_alt_diagnostic_only`.
- Focus rows: `4`.
- Scoring candidates: `0`.
- Behavior candidates: `0`.
- Final alt evidence was already high on the focus rows.

## Decision

No source behavior change is accepted from this source. Maryland strongly reinforces the high-impact statistical/report table lane, but it also reinforces the current blocker: a valid future table transaction must preserve final PAC table-header evidence, avoid non-table target refs, and reject table-heavy controls that already score well.

Because no source behavior changed, no original-50 regression validation was required for this source. The downloaded PDFs and generated local diagnostics remain non-source artifacts and were removed after this report.

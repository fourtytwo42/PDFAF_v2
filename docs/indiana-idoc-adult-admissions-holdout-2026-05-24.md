# Indiana DOC Adult New Admissions Public Holdout

Date: 2026-05-24

Source: https://www.in.gov/idoc/policies-and-statistics/statistical-data/adult-new-admissions/

This is a public-source outside-corpus diagnostic run. It used 20 public Indiana Department of Correction Adult New Admissions PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: Adult New Admissions reports for calendar years `2024` through `2005`.
- Excluded from the selected sample: `2025`, to keep a stable 20-row historical sample.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `51.10 -> 85.00`.
- Median after remediation: `95`.
- Grades after remediation: `15 A / 0 B / 0 C / 0 D / 5 F`.
- Points needed for mean 93: `160`.
- Runtime p50/p95/max: `14077ms / 27265ms / 65465ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed` as the recommended high-impact lane.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target-resolution needed | `3` | `115` | `2024`, `2023`, and `2021` reports, all with `heading_structure=0` and low table markup. |
| No safe predicate | `2` | `68` | `2019` and `2007` reports, both with `heading_structure=0`; the 2007 row showed native marked-content shell symptoms but no safe behavior path. |
| Near-miss monitor | `3` | `9` | `2018`, `2016`, and `2014` reports at `90/A`, with table/PDF-UA header-association residuals. |

## Table Target-Resolution Diagnostic

The explicit table probe included low rows plus same-source high-grade controls.

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `inadm-01`, `inadm-02`, `inadm-04`, `inadm-06`, `inadm-07`, `inadm-09`, `inadm-11`, and `inadm-18`.
- Unsafe control candidates: `inadm-12` and `inadm-15`.
- Prior non-table target rows: `inadm-05` and `inadm-08`.
- Repeated blocker: final table/header work still lacks a safe transaction that preserves or rebuilds PAC-visible table header association after structure normalization.

This is not safe for behavior promotion. The table-like predicate is too broad for this source because it also fires on controls, and prior table tool targets sometimes resolve to `Span` or `TD` instead of stable `/Table` objects.

## Decision

No source behavior change is accepted from this source. Indiana DOC strengthens the same parked general lane seen across several public statistical report sets:

- a real table/header transaction that normalizes dense or irregular table structures while preserving final `/Scope`, `/ID`, and `/Headers` evidence;
- safer table target identity checks immediately before mutation;
- a separate native marked-content shell heading lane for rows that have zero headings but no safe table-first path.

Because no source behavior changed, no original-50 regression validation was required for this source. The downloaded PDFs and generated local diagnostics remain non-source artifacts and were removed after this report.

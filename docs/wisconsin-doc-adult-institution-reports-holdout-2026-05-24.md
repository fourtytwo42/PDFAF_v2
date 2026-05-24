# Wisconsin DOC Adult Institution Reports Public Holdout

Date: 2026-05-24

Sources:

- https://doc.wi.gov/Pages/OffenderInformation/AdultInstitutions/AnnualReports.aspx
- https://doc.wi.gov/Pages/DataResearch/DataAndReports.aspx

This is a public-source outside-corpus diagnostic run. It used 20 public Wisconsin Department of Corrections adult institution annual report PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: 20 adult institution annual reports from the official Wisconsin DOC annual reports page.
- Validation: one bounded deterministic 20-file run plus a focused repeat on the low-row family.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `57.55 -> 86.85`.
- Median after remediation: `94`.
- Grades after remediation: `13 A / 2 B / 0 C / 4 D / 1 F`.
- Points needed for mean 93: `123`.
- Runtime p50/p95/max: `17060ms / 51990ms / 61535ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed`, but the follow-up table diagnostic kept the lane diagnostic-only.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target-resolution needed | `5` | `105` | `widoc-05`, `widoc-09`, `widoc-16`, `widoc-17`, and `widoc-19`. |
| Reading/link-order candidate | `1` | `42` | `widoc-01` repeated as a stable `51/F` zero-heading/reading-order failure. |
| Near-miss monitor | `2` | `5` | `widoc-15` and `widoc-12`. |

The table target-resolution diagnostic found stable object-backed focus candidates on `widoc-05`, `widoc-09`, `widoc-16`, and `widoc-19`, but same-source A-grade controls also triggered (`widoc-02`, `widoc-03`, `widoc-06`, `widoc-18`). It also found prior non-table target resolution on `widoc-17` and control `widoc-20`. Decision: `keep_table_target_resolution_diagnostic_only`.

## Focus Repeat

| File | Source score | Repeat score | Notes |
| --- | ---: | ---: | --- |
| `widoc-01-bce-annual-report.pdf` | `51/F` | `51/F` | Stable zero-heading/reading-order failure. |
| `widoc-02-cci-annual-report.pdf` | `95/A` | `96/A` | Same-source control stayed A-grade while also showing table target evidence. |
| `widoc-05-flci-annual-report.pdf` | `69/D` | `92/A` | Table row improved in repeat, showing route/context volatility. |
| `widoc-09-nlci-annual-report.pdf` | `84/B` | `84/B` | Stable table/heading residual. |
| `widoc-16-sci-annual-report.pdf` | `69/D` | `69/D` | Stable table/heading residual. |
| `widoc-17-wccs-annual-report.pdf` | `69/D` | `69/D` | Stable mixed table/alt/PDF-UA residual with prior non-table target issue. |
| `widoc-19-wspf-annual-report.pdf` | `69/D` | `69/D` | Stable mixed table/alt/PDF-UA residual. |
| `widoc-20-msdf-annual-report.pdf` | `96/A` | `96/A` | Same-source control stayed A-grade despite prior non-table table-target attempt. |

Direct source-only analysis of the repeated failures showed:

- `widoc-01`: `13` pages, initial `28/F`, `heading_structure=0`, `reading_order=30`, `pdf_ua_compliance=0`, and text present.
- `widoc-05`, `widoc-16`, `widoc-17`, `widoc-19`: short to medium institution reports with real table/PDF-UA debt, often mixed with alt or heading debt.

## Decision

No source behavior change is accepted from this source. Wisconsin is useful evidence for two parked general lanes:

- a native zero-heading/reading-order marked-content shell lane for rows like `widoc-01`;
- a real table/header transaction lane that preserves PAC table-header and orphan-MCID truth while excluding A-grade controls.

The current evidence is not selective enough for a production table change, because same-source controls trigger the same stable target classes and prior table operations still resolve to non-table targets on some rows. The reading/heading row is a single stable positive without enough controls for a new behavior stage.

Because no source behavior changed, no original-50 regression validation was required for this source.

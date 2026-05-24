# Iowa DOC Reports And Handbooks Public Holdout

Date: 2026-05-24

Sources:

- https://doc.iowa.gov/about-us/reports-manuals
- https://doc.iowa.gov/districts-prisons

This is a public-source outside-corpus diagnostic run. It used 20 public Iowa Department of Corrections PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: FY2025 Iowa DOC annual report, under-cap FY2024 district/facility annual reports, one DOC manual, and district residential handbooks.
- Excluded by the under-10MB rule during sample construction: oversized FY2024 district/facility annual reports from the same source pages.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `43.70 -> 93.55`.
- Median after remediation: `93.5`.
- Grades after remediation: `18 A / 2 B / 0 C / 0 D / 0 F`.
- Points needed for mean 93: `0`.
- Runtime p50/p95/max: `17872ms / 67143ms / 96169ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` and recommended no behavior lane.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| No safe predicate | `2` | `16` | `ia-doc-06` finished `83/B` with low text extractability and reading-order debt; `ia-doc-05` finished `87/B` with heading/PDF-UA/table debt. |
| Near-miss monitor | `2` | `3` | `ia-doc-04` and `ia-doc-01` finished `91-92/A`. |

## Decision

No source behavior change is accepted from this source. The accepted engine already clears the 93+ mean target on this mixed Iowa DOC public sample with bounded runtime and no false-positive applications.

The two B-grade rows expose useful diagnostic hints around text extractability, reading order, heading structure, and table/PDF-UA cleanup, but this source does not provide a safe high-impact predicate for scoring, planner, mutator, PAC-gate, timeout, or semantic behavior changes. Because no source behavior changed, no original-50 regression validation was required for this source.

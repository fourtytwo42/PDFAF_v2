# North Dakota DOCR PREA Audits Public Holdout

Date: 2026-05-24

Source: North Dakota Department of Corrections and Rehabilitation, DOCR PREA Audit Reports and Annual Reports page: `https://www.docr.nd.gov/prison-rape-elimination-act-overview/docr-prea-audit-reports-and-annual-reports`

This was a 20-PDF public holdout sample from official North Dakota DOCR PREA report PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 under-cap PREA/audit/annual PDFs linked from the source page, after filtering out navigation handbook links.
- Excluded by the under-10MB rule during sample construction: the 2014 North Dakota Youth Correctional Center final audit report.
- Validation: one bounded deterministic 20-file run plus a focused low-row/control repeat.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/north-dakota-docr-prea-audits-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `55.95 -> 88.70`.
- Median after remediation: `94`.
- Grades after remediation: `15 A / 0 B / 0 C / 5 D / 0 F`.
- Points needed for mean 93: `86`.
- Runtime p50/p95/max: `15741ms / 40139ms / 41960ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed`.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target resolution needed | `5` | `120` | `nddocr-12` through `nddocr-16` finished `69/D` with `table_markup=0`, `heading_structure=59-60`, and `pdf_ua_compliance=71`. |
| Near-miss monitor | `1` | `2` | `nddocr-09` finished `91/A` in the full run and repeated at `96/A`. |

The focused repeat confirmed the low-row cluster:

- `nddocr-12`: `69/D -> 69/D`.
- `nddocr-13`: `69/D -> 69/D`.
- `nddocr-14`: `69/D -> 69/D`.
- `nddocr-15`: `69/D -> 69/D`.
- `nddocr-16`: `69/D -> 69/D`.
- Same-source controls `nddocr-08`, `nddocr-09`, `nddocr-11`, `nddocr-17`, and `nddocr-18` stayed A-grade in the repeat.

## Table Target Diagnostic

The table target-resolution diagnostic classified all five D-grade rows as stable table-shape targets with PAC table/header debt. It also found stable normalize targets on A-grade same-source controls `nddocr-08` and `nddocr-11`.

Decision: `keep_table_target_resolution_diagnostic_only`.

Reason: the focus rows expose real table/header/PDF-UA debt, but the available native predicate is too broad because it also matches same-source A-grade controls. Existing table tools on focus rows reject on `pdfua.table.header_association_present` or return no structural change, so broadening admission would not be an honest accepted fix.

## Decision

No source behavior change is accepted from this source. The source fails the 93+ mean target, but the current evidence does not support a safe general production change.

This source strengthens the parked table/header transaction lane: future work needs a native transaction that preserves or rebuilds table header association evidence after shape normalization, and it must separate D-grade table/header debt from A-grade controls before original-50 quality and speed validation. Do not patch with North Dakota/source/facility/year/PDF gates, scorer masking, PAC relaxations, or broad table admission from this evidence.

Because no source behavior changed, no original-50 regression validation was required for this source.

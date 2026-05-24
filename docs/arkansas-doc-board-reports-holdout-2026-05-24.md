# Arkansas DOC Board Reports Public Holdout

Date: 2026-05-24

Sources:

- Arkansas Department of Corrections Board of Corrections page: `https://doc.arkansas.gov/board-of-corrections/`
- Direct official report host: `https://media.ark.org/doc/`

This was a 20-PDF public holdout sample from official Arkansas Department of Corrections `DOC Shared Services Board Report` PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 accessible board-report PDFs found on the official Arkansas media host, newest first.
- Report mix: January 2026 through May 2026, selected 2025 monthly board reports, then January 2024 through June 2024.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `517 KB` to `3.16 MB`.
- Validation: one bounded deterministic 20-file run, the standard low-row diagnostic, one deterministic low-row repeat, and a lightweight native analysis comparison.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/arkansas-doc-board-reports-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `28.50 -> 93.75`.
- Median after remediation: `96`.
- Grades after remediation: `19 A / 0 B / 0 C / 0 D / 1 F`.
- Rows below 93: `1`.
- Runtime p50/p95/max: `16742ms / 19991ms / 20142ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` with recommended residual lane `reading_link_order_candidate`.

- Raw points needed for a mean of 93: `0`.
- Low row: `ardocboard-06.pdf`, `34/F -> 51/F`.
- Repeat: a deterministic one-row repeat reproduced `51/F`.

Native analysis of `ardocboard-06.pdf` showed:

- `pdfClass=native_untagged`, missing structure tree, `pageCount=13`, and `textCharCount=37011`.
- Category shape after baseline remediation: `heading_structure=0`, `reading_order=30`, `pdf_ua_compliance=100`, `table_markup=100`, `link_quality=100`.
- Native layout evidence: `layoutHeadingCandidateCount=286`, `repeatedHeaderFooterPageCount=12`, `geometryOrderRiskPages=4`, `layoutTableCandidateCount=13`.
- Existing heading/layout tools reported `existing_marked_content_blocks_without_promotable_structure` or `no_structural_change`.

Adjacent same-source control `ardocboard-07.pdf` remediated to `96/A` and has a different initial structure route, so this single row does not prove a safe production predicate for creating headings or structure from raw layout text.

## Decision

No source behavior change is accepted from this source. The source already passes the 93+ mean and median target with no hard errors, no false-positive applications, and bounded runtime. The lone reproducible low row is real heading/reading debt, but current evidence does not separate a safe general behavior predicate from a one-row layout recovery problem.

Do not add Arkansas/source/date/PDF-specific gates, raw-layout heading creation, scorer masking, or PAC relaxation from this evidence. A future reading/heading lane should require object-backed or visible-anchor-backed structure targets plus controls before behavior promotion.

Because no source behavior changed, no original-50 regression validation was required for this source.

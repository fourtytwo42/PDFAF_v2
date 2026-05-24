# D.C. DOC Publications Public Holdout

Date: 2026-05-24

Source: District of Columbia Department of Corrections publications page: `https://doc.dc.gov/publications`

This was a 20-PDF public holdout sample from official D.C. Department of Corrections publications under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 PDF publication attachments in source-page order.
- Source mix: current population/facts-and-figures PDFs, PREA reports, annual reports, and facility audit reports.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `70 KB` to `985 KB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, and focused table target-resolution diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/dc-doc-publications-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `54.55 -> 93.25`.
- Median after remediation: `95`.
- Grades after remediation: `17 A / 2 B / 0 C / 1 D / 0 F`.
- Rows below 93: `3`.
- Runtime p50/p95/max: `15127ms / 37248ms / 42227ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `holdout_target_met`, while still identifying table target-resolution as the residual lane:

- Raw points needed for 93 mean: `0`.
- Residual table rows: `4`.
- Candidate raw points to 93 on residual rows: `44`.

The table target-resolution diagnostic rejected behavior promotion:

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `dcdoc-12`, `dcdoc-13`, `dcdoc-15`, `dcdoc-16`.
- Unsafe same-source controls: `dcdoc-10`, `dcdoc-19`.
- Prior non-table target rows: `0`.

## Decision

No source behavior change is accepted from this source.

D.C. passes the 93+ source target with no hard errors and no false-positive applications. The residual low rows reinforce the parked table target/transaction lane, but same-source A-grade controls also trigger stable normalize-target shape, so broadening table admission would not be safe.

Because no source behavior changed, no original-50 regression validation was required for this source.

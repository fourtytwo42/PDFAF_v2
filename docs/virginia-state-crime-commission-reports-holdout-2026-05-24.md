# Virginia State Crime Commission Reports Public Holdout

Date: 2026-05-24

Source: Virginia State Crime Commission reports archive: `https://vscc.virginia.gov/reports.asp`

This was a 20-PDF public holdout sample from official Virginia State Crime Commission report PDFs under 10 MiB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: first 20 unique report PDFs from the VSCC reports archive after excluding the website privacy policy and skipping two oversized annual report PDFs above `10 MiB`.
- Selected IDs: `vscc-01` through `vscc-20`.
- Size cap: all 20 selected PDFs were under `10 MiB`; selected files were about `141 KB` to `4.7 MB`.
- Validation: one bounded deterministic 20-file run plus low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/virginia-state-crime-commission-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `59.25 -> 95.25`.
- Median after remediation: `95`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `4`.
- Runtime p50/p95/max: `13072ms / 233897ms / 289762ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `holdout_target_met`:

- Raw points needed for 93 mean: `0`.
- Recommended lane: `none`.
- Near-miss monitor rows: `4`, carrying `6` raw points to 93.

The low rows were:

- `vscc-15`: `90/A`; lowest evidence included `heading_structure=76`, `link_quality=79`, `table_markup=79`, and `pdf_ua_compliance=67`.
- `vscc-02`: `92/A`; lowest evidence included `heading_structure=79` and `table_markup=79`.
- `vscc-03`: `92/A`; lowest evidence included `heading_structure=80`, `table_markup=79`, and `reading_order=94`.
- `vscc-08`: `92/A`; lowest evidence included `heading_structure=80`, `table_markup=79`, and `reading_order=94`.

## Decision

No source behavior change is accepted from this source.

VSCC reports are a strong outside-corpus pass: all 20 rows finished as A-grade, the source mean is above 93, and `false_positive_applied=0`. The runtime tail is notable on larger annual reports but still stayed inside the bounded per-PDF timeout. The remaining sub-93 rows are low-priority near misses and do not justify a new scoring, planner, or mutation rule.

Because no source behavior changed, no original-50 regression validation was required for this source.

# Oregon DOC Data Analytics and Issue Briefs Public Holdout

Date: 2026-05-24

Sources:

- Oregon Department of Corrections Data Analytics & Reporting: `https://www.oregon.gov/doc/research-and-requests/pages/research-and-statistics.aspx`
- Oregon Department of Corrections DOC Issue Briefs: `https://www.oregon.gov/doc/about/pages/doc-issue-briefs.aspx`

This was a 20-PDF public holdout sample from official Oregon DOC report and issue-brief PDFs under 10 MiB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: first 20 unique official PDF links from the Oregon DOC Data Analytics & Reporting page plus DOC Issue Briefs page, excluding the research application form.
- Selected IDs: `ordoc-01` through `ordoc-20`.
- Size cap: all 20 selected PDFs were under `10 MiB`; selected files were about `92 KB` to `1.3 MB`.
- Validation: one bounded deterministic 20-file run plus low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/oregon-doc-data-analytics-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `54.00 -> 94.35`.
- Median after remediation: `95`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `4`.
- Runtime p50/p95/max: `7478ms / 15929ms / 27407ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `holdout_target_met`:

- Raw points needed for 93 mean: `0`.
- Recommended lane: `none`.
- Near-miss monitor rows: `4`, carrying `7` raw points to 93.

The low rows were:

- `ordoc-17`: `92/A`; lowest evidence included `reading_order=70`, `table_markup=79`, `pdf_ua_compliance=79`, and `bookmarks=63`.
- `ordoc-18`: `91/A`; lowest evidence included `heading_structure=80` and `pdf_ua_compliance=79`.
- `ordoc-19`: `91/A`; lowest evidence included `heading_structure=80` and `pdf_ua_compliance=79`.
- `ordoc-20`: `91/A`; lowest evidence included `heading_structure=80` and `pdf_ua_compliance=79`.

## Decision

No source behavior change is accepted from this source.

Oregon DOC reports and issue briefs are a clean outside-corpus pass: all 20 rows finished as A-grade, the source mean is above 93, runtime is healthy, and `false_positive_applied=0`. The remaining sub-93 rows are low-priority near misses. They do not justify a new scoring, planner, or mutation rule.

Because no source behavior changed, no original-50 regression validation was required for this source.

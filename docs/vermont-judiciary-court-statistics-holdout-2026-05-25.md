# Vermont Judiciary Court Statistics Holdout - 2026-05-25

## Source

- Public source: Vermont Judiciary court statistics and reports page.
- Source page: `https://www.vtcourts.gov/about-vermont-judiciary/court-statistics-and-reports`
- Sample: 20 unique public report PDFs in page order that downloaded successfully through the page's `/media/<id>` document links, verified as PDFs, and were under 10 MiB.
- Download note: `FY25 Annual Statistical Report` was skipped because it exceeded the 10 MiB gate; the retained sample included the guide for legislators, FY2024/FY2023/FY2021-FY2015 statistical reports, appendices, and county/statewide data PDFs.
- Size gate: every retained PDF was under 10 MiB; largest retained file was about `8.0 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/vermont-judiciary-court-statistics-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/vermont-judiciary-court-statistics-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `93.8000`
- Median: `96`
- Grades: `19 A / 0 B / 0 C / 1 D / 0 F`
- Rows below `93`: `1`
- Runtime p50/p95/max: `29105ms / 145054ms / 205163ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

Low row:

| Row | Score | Notes |
| --- | ---: | --- |
| `vtjud-02-FY2024-Narrative-Statistical-Report.pdf` | `69/D` | Table/header-association debt; source already passed mean/median. |

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/vermont-judiciary-court-statistics-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `0`
- Residual table lane raw points: `24`

## Decision

This holdout passed without behavior changes. The source met the target with mean `93.8000`, median `96`, `19` A-grade rows, no hard failures, and `false_positive_applied=0`.

The single residual D row is real table/header-association debt, but it is not enough to justify a behavior stage:

- the source already passes the required mean and median;
- the residual table lane is a single high-cost row;
- recent public-holdout table diagnostics repeatedly show that current table tools can expose stable targets while still regressing final PAC table-header evidence;
- accepting this row would require the broader table/header transaction project, not a one-source or one-row rule.

No source behavior changed, so no original-50 regression validation was required. Downloaded PDFs and generated artifacts should be deleted after metrics extraction.

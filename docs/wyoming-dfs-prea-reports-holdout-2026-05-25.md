# Wyoming DFS PREA Reports Holdout - 2026-05-25

## Source

- Public source: Wyoming Department of Family Services PREA data and reports page.
- Source page: `https://dfs.wyo.gov/about/data-and-reports/prison-rape-elimination-act-prea/`
- Sample: 20 public PDFs: Wyoming PREA annual reports from 2025 through 2014, plus Boys' School and Girls' School final/preliminary audit reports.
- Download note: the source page links to public Google Drive PDF files; downloads used the direct public Drive download endpoint with bounded requests.
- Size gate: every downloaded PDF was under 10 MiB; largest file was about `6.2 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/wyoming-dfs-prea-reports-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/wyoming-dfs-prea-reports-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `93.4500`
- Median: `94.5`
- Grades: `17 A / 2 B / 0 C / 1 D / 0 F`
- Rows below `93`: `3`
- Runtime p50/p95/max: `14136ms / 38498ms / 76907ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/wyoming-dfs-prea-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended residual lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `0`

Low rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `wydfsprea-13` / Wyoming Boys' School Final Audit Report, 2025 | `69/D` | `table_target_resolution_needed` | Stable table/PDF-UA debt; source already passed. |
| `wydfsprea-15` / Wyoming Boys' School Final Audit Report, 2019 | `87/B` | `table_target_resolution_needed` | Stable low-priority table debt. |
| `wydfsprea-19` / Wyoming Girls' School Final Audit Report, 2018 | `87/B` | `table_target_resolution_needed` | Stable low-priority table debt. |

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/wyoming-dfs-prea-reports-2026-05-25/low-repeat-r1/baseline_report.json`
- Rows: `wydfsprea-13`, `wydfsprea-15`, `wydfsprea-19`
- Scores: `69`, `87`, `87`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

## Decision

This holdout passed without behavior changes. The source met the target mean at `93.4500`, with bounded runtime, no hard failures, and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. The residual audit-report table debt is repeat-supported and may be useful future table-target evidence, but the passed source and small number of residual rows do not justify a behavior lane by themselves. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.

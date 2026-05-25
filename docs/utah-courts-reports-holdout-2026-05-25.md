# Utah Courts Reports Holdout - 2026-05-25

## Source

- Public source: Utah State Courts court reports/publications page.
- Source page: `https://www.utcourts.gov/en/court-records-publications/publications/court-publications/court-reports.html`
- Sample: first 20 unique official court-report PDFs from the page that downloaded successfully, verified as PDFs, and were under 10 MiB.
- Download note: retained documents included court-scam guidance, the Utah State Courts strategic plan, annual reports, State of the Judiciary addresses, and court committee/task-force reports.
- Size gate: every retained PDF was under 10 MiB; largest retained file was about `9.8 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/utah-courts-reports-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/utah-courts-reports-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `94.9000`
- Median: `95`
- Grades: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `2`
- Runtime p50/p95/max: `13426ms / 105955ms / 210594ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/utah-courts-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`

Near-miss rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `utcourts-14` / `ABA-OPC_Report.pdf` | `90/A` | `near_miss_monitor` | Heading/link/PDF-UA near miss; source already passed. |
| `utcourts-16` / `Pretrial Release and Supervision Practices Final Report.pdf` | `90/A` | `near_miss_monitor` | Heading/table/link/PDF-UA near miss; source already passed. |

## Decision

This holdout passed without behavior changes. The source met the target mean at `94.9000` and median `95`, with all rows A-grade, no hard failures, and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. The two sub-93 rows are low-priority near misses, not a safe standalone remediation lane. Downloaded PDFs and generated artifacts should be deleted after metrics extraction.

# Louisiana DPS&C Public Information Holdout - 2026-05-25

## Source

- Public source: Louisiana Department of Public Safety & Corrections public information page.
- Source page: `https://doc.la.gov/public-programs-resources/public-information/`
- Sample: first 20 unique official PDF links from the page that downloaded successfully, verified as PDFs, and were under 10 MiB.
- Download note: one oversized annual report and one unreachable CDN duplicate were skipped cleanly.
- Size gate: every retained PDF was under 10 MiB; largest retained file was about `4.4 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/louisiana-dps-public-information-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/louisiana-dps-public-information-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `94.0500`
- Median: `95`
- Grades: `19 A / 0 B / 0 C / 1 D / 0 F`
- Rows below `93`: `3`
- Runtime p50/p95/max: `12223ms / 84260ms / 147809ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/louisiana-dps-public-information-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended residual lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `0`

Low rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `ladpspub-19` / Department of Public Safety & Corrections Bench Book | `69/D` | `table_target_resolution_needed` | Stable table/PDF-UA debt; source already passed and the single-row upside is not enough to justify a behavior lane. |
| `ladpspub-03` / Volunteer Orientation Training Manual | `90/A` | `near_miss_monitor` | Stable A-grade near miss. |
| `ladpspub-06` / Rules and Guidelines for Volunteers or Guests Form | `92/A` | `near_miss_monitor` | Stable A-grade near miss. |

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/louisiana-dps-public-information-2026-05-25/low-repeat-r1/baseline_report.json`
- Rows: `ladpspub-03`, `ladpspub-06`, `ladpspub-19`
- Scores: `91`, `92`, `69`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

## Decision

This holdout passed without behavior changes. The source met the target mean at `94.0500` and median `95`, with bounded runtime, no hard failures, and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. The bench book is useful future table evidence, but a single `24`-point residual row does not justify a table behavior promotion by itself, especially given recent table-header PAC regression risk on similar outside-corpus sources. Downloaded PDFs and generated artifacts should be deleted after metrics extraction.

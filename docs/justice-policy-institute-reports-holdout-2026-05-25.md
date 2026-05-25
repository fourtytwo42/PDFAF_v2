# Justice Policy Institute Reports Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using Justice Policy Institute PDF publications. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://justicepolicy.org/research/`
- Source index: `https://justicepolicy.org/wp-json/wp/v2/media?mime_type=application/pdf`
- Sample: first 20 unique JPI PDF media attachments that downloaded successfully and were under 10MB, excluding annual-report, 990, and financial PDFs
- Duplicate handling: PDF downloads were de-duplicated by SHA-256 before counting the sample
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/justice-policy-institute-reports-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `51.95 -> 89.10`
- Median: `56.5 -> 96.5`
- Minimum final score: `59`
- Grades after remediation: `16 A / 0 B / 0 C / 0 D / 4 F`
- Rows below `93`: `6`
- Runtime p50/p95/max: `9037ms / 37635ms / 56751ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `jpi-01.pdf` | Sentenced to Grow Old | `59/F` | `no_safe_predicate` |
| `jpi-02.pdf` | Unlocking Virginia's Workforce | `92/A` | `near_miss_monitor` |
| `jpi-04.pdf` | DC Dir of Emerging Adult Services | `59/F` | `reading_link_order_candidate` |
| `jpi-05.pdf` | JPI DC FY26 Budget Oversight Testimony | `59/F` | `no_safe_predicate` |
| `jpi-19.pdf` | VA Senate Bill 1262 Testimony | `59/F` | `no_safe_predicate` |
| `jpi-20.pdf` | Comparing Second Look and Geriatric-Medical Parole | `90/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/justice-policy-institute-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `78`
- Lane split:
  - `no_safe_predicate`: `3` rows, `102` raw points
  - `reading_link_order_candidate`: `1` row, `34` raw points
  - `near_miss_monitor`: `2` rows, `4` raw points

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/justice-policy-institute-reports-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `0`
- `jpi-04.pdf` had visible reading debt, but every degenerate shell proposal was `no_effect` with no reading, heading, or score movement.

Figure/alt diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/justice-policy-institute-reports-2026-05-25/figure-alt-r1/outside-figure-alt-no-gain-diagnostic.md`
- Decision: `keep_figure_alt_diagnostic_only`
- Scoring candidates: `0`
- Behavior candidates: `0`
- Focus rows: `jpi-01.pdf` and `jpi-04.pdf`, both classified as `alt_high_or_not_focus`.

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/justice-policy-institute-reports-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: none
- Unsafe control candidates: none
- Prior non-table target rows: `jpi-01`
- `jpi-01.pdf` has real table/PAC debt, but the prior `set_table_header_cells` target resolved as `P`, not `/Table`, so there is no safe table transaction to promote from this evidence.

Low-row repeat:

- Local artifact: `/mnt/pdf-review/public-holdouts/justice-policy-institute-reports-2026-05-25/repeat-low-r1/baseline_report.json`
- Repeated rows: `jpi-01`, `jpi-02`, `jpi-04`, `jpi-05`, `jpi-19`, `jpi-20`
- Repeat result: `jpi-01` improved from `59/F` to `93/A`, while `jpi-04`, `jpi-05`, `jpi-19`, and `jpi-20` stayed at their original final scores and `jpi-02` stayed `92/A`.
- The repeat supports route/analyzer volatility on `jpi-01`, but it does not recover enough points to make the source pass and does not justify a production change.

Heading-zero spot check:

- Native source analysis on `jpi-04`, `jpi-05`, and `jpi-19` classified each as `manual_no_safe_heading` with no visible, tagged, or partial heading anchor candidate. These rows are parked as no-safe-heading-anchor debt rather than accepted behavior evidence.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed the requested source mean target: `89.10` versus `93`.
- The highest-confidence diagnostic lane, reading-order shell recovery, had no score-moving proposal.
- Figure/alt had no score-active or behavior candidate.
- Table diagnostics did not find a stable object-backed focus target to promote.
- Persistent `59/F` rows had heading-zero debt but no content-backed safe heading anchor.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

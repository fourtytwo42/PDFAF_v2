# FBI Reports And Publications Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using FBI reports-and-publications repository PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://www.fbi.gov/file-repository/reports-and-publications/`
- Sample: first 20 direct PDF candidates that downloaded successfully and were under 10MB
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/fbi-reports-publications-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `53.50 -> 89.05`
- Median: `54 -> 93.5`
- Minimum final score: `69`
- Grades after remediation: `15 A / 1 B / 1 C / 3 D / 0 F`
- Rows below `93`: `7`
- Runtime p50/p95/max: `16936ms / 37919ms / 192914ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `fbireport-05.pdf` | bank crime statistics 2021 | `69/D` | `table_target_resolution_needed` |
| `fbireport-11.pdf` | sandy hook advisory commission final report | `69/D` | `table_target_resolution_needed` |
| `fbireport-12.pdf` | bank crime statistics 2023 091724 | `69/D` | `table_target_resolution_needed` |
| `fbireport-01.pdf` | active shooter incidents in the us 2021 052422 | `78/C` | `reading_link_order_candidate` |
| `fbireport-19.pdf` | active shooter incidents in the us 2019 042820 | `80/B` | `figure_alt_target_discovery_needed` |
| `fbireport-14.pdf` | quick look map incidents 2018 | `90/A` | `near_miss_monitor` |
| `fbireport-08.pdf` | body worn camera policy 082322 | `91/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/fbi-reports-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `79`
- Lane split:
  - `table_target_resolution_needed`: `3` rows, `72` raw points
  - `reading_link_order_candidate`: `1` row, `15` raw points
  - `figure_alt_target_discovery_needed`: `1` row, `13` raw points
  - `near_miss_monitor`: `2` rows, `5` raw points

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/fbi-reports-publications-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `fbireport-05`, `fbireport-11`, `fbireport-12`
- Unsafe control candidates: none
- Prior non-table target rows: none

This was a cleaner admission signal than several earlier public table holdouts, but it still did not justify a source behavior change in this pass. The baseline already exercised existing table tools on the three focus rows and they still finished at `69/D`. The two bank-stat rows had stable table/header-association evidence, but their estimated unassociated-cell debt was below the accepted Stage 180 report-table threshold; lowering that threshold would recover at most `48` raw points if both rows became A-grade, still short of the `79` raw points needed and too speculative without a final-PDF transaction proof. The Sandy Hook row exposed a deeper no-header table reconstruction problem: existing normalization/header tools applied or no-effected without resolving final table/PDF-UA debt.

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/fbi-reports-publications-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `1`
- Selected rows: none

Figure/alt diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/fbi-reports-publications-2026-05-25/figure-alt-r1/outside-figure-alt-no-gain-diagnostic.md`
- Decision: `keep_figure_alt_diagnostic_only`
- Focus rows: `2`
- Behavior candidates: `0`
- Scoring-calibration candidates: `0`

The figure/alt diagnostic classified both `fbireport-01` and `fbireport-19` as `alt_high_or_not_focus`. Replay evidence showed checker-visible figure alt coverage was already complete in the available trace (`21/21` and `6/6`), so the low final alt category does not currently expose a safe object-backed target discovery fix.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed mean `93` by `79` raw points, but no lane produced a general, score-moving behavior proof.
- Table admission was clean, but existing table/header mutations already fired and still left the focus rows at `69/D`.
- Lowering Stage 180 table thresholds would be speculative and insufficient on its own to clear the source mean.
- The reading/link row exposed no native shell candidate.
- The figure/alt row exposed no behavior or scoring calibration candidate from replay evidence.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

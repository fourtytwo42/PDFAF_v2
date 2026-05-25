# FBI CJIS File Repository Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using FBI Criminal Justice Information Services file-repository PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://www.fbi.gov/file-repository/cjis/`
- Sample: first 20 direct PDF candidates from the CJIS file repository that downloaded successfully and were under 10MB
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/fbi-cjis-file-repository-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `63.70 -> 88.50`
- Median: `69 -> 93`
- Minimum final score: `69`
- Grades after remediation: `14 A / 2 B / 0 C / 4 D / 0 F`
- Rows below `93`: `9`
- Runtime p50/p95/max: `14382ms / 184478ms / 208236ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `fbicjis-12.pdf` | active entries in the nics indices as of january 3 2023 | `69/D` | `table_target_resolution_needed` |
| `fbicjis-13.pdf` | cjis_security_policy_v5 9 1_20221001 | `69/D` | `table_target_resolution_needed` |
| `fbicjis-15.pdf` | active entries in the nics indices by state | `69/D` | `table_target_resolution_needed` |
| `fbicjis-19.pdf` | cjis_security_policy_v5 9_20200601 | `69/D` | `table_target_resolution_needed` |
| `fbicjis-10.pdf` | req comp doc_v5 9 1_20221001 | `88/B` | `table_target_resolution_needed` |
| `fbicjis-06.pdf` | ncjits channeler policy reference guide 100119 | `89/B` | `reading_link_order_candidate` |
| `fbicjis-03.pdf` | ncjits authorized recipient policy reference guide october 2019 | `90/A` | `near_miss_monitor` |
| `fbicjis-09.pdf` | ncjits policy reference guide 100119 | `90/A` | `near_miss_monitor` |
| `fbicjis-16.pdf` | active_records_in_the_nics indices | `90/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/fbi-cjis-file-repository-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `90`
- Lane split:
  - `table_target_resolution_needed`: `5` rows, `101` raw points
  - `near_miss_monitor`: `3` rows, `9` raw points
  - `reading_link_order_candidate`: `1` row, `4` raw points

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/fbi-cjis-file-repository-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `fbicjis-10`, `fbicjis-12`, `fbicjis-13`, `fbicjis-15`, `fbicjis-19`
- Unsafe same-source control candidates: `fbicjis-05`, `fbicjis-08`, `fbicjis-11`, `fbicjis-14`
- Prior non-table target rows: none

The table lane is high-impact but not safe to promote from this set. The same stable table-target shape appears on multiple same-source controls, including rows that remediated to A-grade in the baseline. This matches the broader parked statistical/table family: table debt is real, but admission is still too broad unless a later transaction proof can predict final PAC table/header debt reduction without also triggering on high-grade controls.

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/fbi-cjis-file-repository-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `1`
- Recovered routes with final orphan debt: `0`
- Selected rows: none

The lone reading/link low row, `fbicjis-06`, did not expose a native shell candidate. Even if it had, it represented only `4` raw points and could not carry the holdout to mean `93`.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed mean `93` by `90` raw points, but the only high-impact lane was table target resolution.
- Stable object-backed table targets appeared on all five table lows, but also on same-source controls `fbicjis-05`, `fbicjis-08`, `fbicjis-11`, and `fbicjis-14`.
- Reading/link diagnostics found no existing native shell repair path for `fbicjis-06`.
- Near-miss rows were not enough to justify a speculative behavior change.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

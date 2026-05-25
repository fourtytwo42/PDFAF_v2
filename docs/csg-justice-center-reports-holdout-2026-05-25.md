# CSG Justice Center Reports Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using Council of State Governments Justice Center PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source pages: `https://csgjusticecenter.org/publications/publication-type/report/`, `brief/`, and `white-paper/`
- Sample: first 20 unique CSG-hosted direct PDF downloads that completed successfully and were under 10MB
- Duplicate handling: PDF downloads were de-duplicated by SHA-256 before counting the sample
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/csg-justice-center-reports-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `69.10 -> 94.00`
- Median: `78.5 -> 94`
- Minimum final score: `79`
- Grades after remediation: `18 A / 1 B / 1 C / 0 D / 0 F`
- Rows below `93`: `5`
- Runtime p50/p95/max: `10842ms / 31068ms / 31119ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `csgjc-08.pdf` | Strategies for States to Increase Critical Partnerships for Community Responder Program Sustainability | `79/C` | `reading_link_order_candidate` |
| `csgjc-14.pdf` | Planning, Implementing, and Assessing Law Enforcement Responses to Homelessness | `89/B` | `no_safe_predicate` |
| `csgjc-04.pdf` | How Courts Can Best Support Post-Dispositional Success for Challenging Delinquency Cases | `91/A` | `near_miss_monitor` |
| `csgjc-05.pdf` | Judicial Decision-Making for High-Risk Youth Bench Card | `91/A` | `no_safe_predicate` |
| `csgjc-06.pdf` | Research and Resource Companion for High-Risk Youth and Challenging Cases Bench Cards | `91/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/csg-justice-center-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `0`
- Lane split:
  - `reading_link_order_candidate`: `1` row, `14` raw points
  - `no_safe_predicate`: `2` rows, `6` raw points
  - `near_miss_monitor`: `2` rows, `4` raw points

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/csg-justice-center-reports-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `0`
- Selected rows: none

The only material low row, `csgjc-08.pdf`, had reading/link-order debt in the completed run, but the focused native shell diagnostic found no existing route or sequence candidate to promote. The other below-`93` rows were either near misses or lacked a safe predicate from this run artifact alone.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source already exceeded the requested source mean target: `94.00`.
- Median was also above target at `94`.
- The single medium-priority low row did not expose a safe native behavior path.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

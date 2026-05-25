# The Sentencing Project Publications Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using The Sentencing Project PDF publications. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://www.sentencingproject.org/reports/`
- Source index: `https://www.sentencingproject.org/wp-json/wp/v2/media?mime_type=application/pdf`
- Sample: first 20 unique Sentencing Project PDF media attachments that downloaded successfully and were under 10MB, excluding annual-report, 990, audit, and financial PDFs
- Duplicate handling: PDF downloads were de-duplicated by SHA-256 before counting the sample
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/sentencing-project-publications-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `44.40 -> 89.60`
- Median: `40 -> 96`
- Minimum final score: `59`
- Grades after remediation: `16 A / 0 B / 0 C / 1 D / 3 F`
- Rows below `93`: `4`
- Runtime p50/p95/max: `12442ms / 20612ms / 30388ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `tsp-06.pdf` | Sentencing Project Webinar 03 25 26 | `69/D` | `reading_link_order_candidate` |
| `tsp-11.pdf` | Incarcerated Women and Girls | `59/F` | `no_safe_predicate` |
| `tsp-14.pdf` | Kentucky SB 80 Support Letter - The Sentencing Project (2026) | `59/F` | `no_safe_predicate` |
| `tsp-15.pdf` | Kentucky memo 3.2.26 | `59/F` | `no_safe_predicate` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/sentencing-project-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `68`
- Lane split:
  - `no_safe_predicate`: `3` rows, `102` raw points
  - `reading_link_order_candidate`: `1` row, `24` raw points

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/sentencing-project-publications-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `0`
- `tsp-06.pdf` had a degenerate native reading-order shell attempt, but every proposal was `no_effect` and the best replay stayed `69 -> 69` with `reading_order 35 -> 35`.

Low-row repeat:

- Local artifact: `/mnt/pdf-review/public-holdouts/sentencing-project-publications-2026-05-25/repeat-low-r1/baseline_report.json`
- Repeated rows: `tsp-06`, `tsp-11`, `tsp-14`, `tsp-15`
- Repeat result: all four low rows reproduced exactly: `69`, `59`, `59`, and `59`.
- This rules out a simple route-volatility explanation for the source miss.

Heading-zero spot check:

- `tsp-11.pdf`: source analysis classified it as `structure_bootstrap_required`; it starts untagged with `structure_depth=0` and no content-backed heading owner.
- `tsp-14.pdf`: classified as `manual_no_safe_heading`; no visible, tagged, or partial heading anchor was available.
- `tsp-15.pdf`: source analysis found a tagged visible first-page heading anchor, but the baseline already attempted `create_heading_from_tagged_visible_anchor` and rejected it on PAC orphan-MCID regression and later structural-confidence regression. This is not safe to accept without a new mutation design.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed the requested source mean target: `89.60` versus `93`.
- The only reading-order focus row had no score-moving native shell proposal.
- The persistent zero-heading rows did not expose a safe general repair: two lacked content-backed heading anchors, and the one anchor-backed row already hit PAC/structural guards.
- The low-row repeat reproduced the same scores, so repeating the run did not recover the source.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

# Vera Institute Publications Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using Vera Institute publication PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source sitemap: `https://www.vera.org/sitemap.xml`
- Publication pages: `https://www.vera.org/sitemaps-1-section-publications-1-sitemap-p1.xml`
- PDF source: Vera publication download links under `https://vera-institute.files.svdcdn.com/production/downloads/publications/`
- Sample: first 20 direct PDF downloads discovered from publication pages that completed successfully and were under 10MB
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/vera-publications-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `47.20 -> 91.80`
- Median: `35.5 -> 94`
- Minimum final score: `59`
- Grades after remediation: `16 A / 3 B / 0 C / 0 D / 1 F`
- Rows below `93`: `6`
- Runtime p50/p95/max: `15935ms / 42867ms / 50423ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `vera-03.pdf` | Jail Population First Quarterly Report Jan March_web | `59/F` | `no_safe_predicate` |
| `vera-19.pdf` | unaccompanied children resource spanish glossary part1 | `84/B` | `table_target_resolution_needed` |
| `vera-12.pdf` | Police Perspectives: Building Trust in a Diverse Nation - No. 3. How to Support Trust Building in Your Agency | `86/B` | `table_target_resolution_needed` |
| `vera-11.pdf` | Police Perspectives: Building Trust in a Diverse Nation - No. 2. How to Serve Diverse Communities | `87/B` | `table_target_resolution_needed` |
| `vera-10.pdf` | Police Perspectives: Building Trust in a Diverse Nation - No. 1. How to Increase Cultural Understanding | `90/A` | `near_miss_monitor` |
| `vera-17.pdf` | incarceration trends data and methods | `92/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/vera-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_medium_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `24`
- Lane split:
  - `no_safe_predicate`: `1` row, `34` raw points
  - `table_target_resolution_needed`: `3` rows, `22` raw points
  - `near_miss_monitor`: `2` rows, `4` raw points

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/vera-publications-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `vera-11`, `vera-12`, `vera-19`
- Unsafe control candidates: none
- Prior non-table target rows: none
- Classification split: `1` stable header-association target, `2` stable normalize targets, `17` controls/high-grade noise

This was a clean target-resolution signal, but it did not justify a source behavior change by itself. The three table focus rows were then run through the existing table/structure sequence probe on temporary buffers:

- Local artifact: `/mnt/pdf-review/public-holdouts/vera-publications-2026-05-25/table-sequence-probe-r1/table-structure-sequence-probe.md`
- Rows probed: `vera-11`, `vera-12`, `vera-19`
- Sequence candidates: `0`
- No useful movement: `21`
- Best observed outcomes stayed no-score-movement on all three rows.

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/vera-publications-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `1`
- Recovered routes with final orphan debt: `1`
- Selected rows: none

Figure/alt diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/vera-publications-2026-05-25/figure-alt-r1/outside-figure-alt-no-gain-diagnostic.md`
- Decision: `keep_figure_alt_diagnostic_only`
- Focus rows: `3`
- Behavior candidates: `0`
- Scoring-calibration candidates: `0`

The figure/alt diagnostic classified `vera-10`, `vera-11`, and `vera-12` as `alt_high_or_not_focus`; replay checker-visible alt coverage was complete for those rows.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed mean `93` by `24` raw points, but the highest-impact table lane did not produce a score-moving transaction proof.
- `vera-03` has severe zero-heading debt, but the run artifact exposed no safe object-backed heading/reading lane.
- Table target resolution was clean, with no unsafe controls, but the temporary table/structure sequence probe found `0` safe candidates and `21` no-useful-movement outcomes.
- Reading-order shell diagnostics selected no rows.
- Figure/alt replay evidence exposed no behavior or scoring calibration candidate.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

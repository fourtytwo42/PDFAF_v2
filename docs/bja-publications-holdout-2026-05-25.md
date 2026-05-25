# BJA Publications Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using Bureau of Justice Assistance publication detail pages. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://bja.ojp.gov/library/publications/list`
- Sample: first 20 successfully downloadable PDF candidates from the BJA publication listing/detail pages, all under 10MB
- Note: some BJA detail pages link to partner-hosted PDFs; expired-certificate external candidates were skipped
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/bja-publications-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `62.00 -> 92.55`
- Median: `59 -> 94`
- Minimum final score: `69`
- Grades after remediation: `17 A / 1 B / 1 C / 1 D / 0 F`
- Rows below `93`: `4`
- Runtime p50/p95/max: `15316ms / 32146ms / 251574ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Score | Class |
| --- | ---: | --- |
| `bjapub-04.pdf` | `69/D` | `reading_link_order_candidate` |
| `bjapub-02.pdf` | `77/C` | `reading_link_order_candidate` |
| `bjapub-12.pdf` | `86/B` | `no_safe_predicate` |
| `bjapub-13.pdf` | `91/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/bja-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `9`

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/bja-publications-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `0`
- Selected rows: none

The two main low rows, `bjapub-04` and `bjapub-02`, had reading/link-order debt in the run artifact, but the reading-order shell diagnostic found no existing score-moving native shell repair path. `bjapub-12` was a mixed heading/alt/PDF-UA row with no safe predicate visible from the artifact, and `bjapub-13` was a two-point near miss.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The holdout missed mean `93` by only `9` raw points, but the available diagnostic evidence did not identify a safe general repair lane.
- Reading/link-order rows did not expose an existing native shell sequence candidate.
- The remaining rows were mixed or near-miss cases where a speculative behavior change would not be justified.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and should be deleted after this diagnostic set is documented.

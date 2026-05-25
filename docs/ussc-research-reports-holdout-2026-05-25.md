# USSC Research Reports Public Holdout - 2026-05-25

## Source And Sample

- Source: `https://www.ussc.gov/topic/research-reports`
- Sample: `20` public United States Sentencing Commission research-report PDFs, each verified under `10MB`.
- Selection notes: crawled research-report detail pages, selected one full research-publication PDF per page, and skipped oversized reports.
- Local artifact root: `/mnt/pdf-review/public-holdouts/ussc-research-reports-2026-05-25`
- Validation mode: deterministic bounded holdout, Node 22, `--no-semantic --no-pdfs`, row artifacts cleaned.

## Full-Source Result

Run: `/mnt/pdf-review/public-holdouts/ussc-research-reports-2026-05-25/run-r1/baseline_report.json`

- Completed: `20/20`
- Mean: `35.35 -> 88.30`
- Median after: `94`
- Grades after: `15 A / 2 B / 0 C / 0 D / 3 F`
- Rows below `93`: `6`
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Runtime p50/p95/max: `63423ms / 173847ms / 207975ms`

Low rows:

| Row | Score | Dominant Debt |
| --- | ---: | --- |
| `usscrr-13.pdf` | `59/F` | stable `heading_structure=0`; reading/table mostly recovered |
| `usscrr-18.pdf` | `59/F` | stable `heading_structure=0`; reading/table mostly recovered |
| `usscrr-20.pdf` | `59/F` | stable `heading_structure=0`; residual PDF/UA debt |
| `usscrr-04.pdf` | `87/B` | reading/link/table/heading mixed tail; recovered on repeat |
| `usscrr-17.pdf` | `89/B` | reading/link mixed tail; stable on repeat |
| `usscrr-12.pdf` | `91/A` | near miss; recovered on repeat |

## Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/ussc-research-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `no_safe_low_row_lane`
- Recommended residual lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `94`

Lane split:

| Candidate Class | Rows | Raw Points To Target | Files |
| --- | ---: | ---: | --- |
| `no_safe_predicate` | `3` | `102` | `usscrr-13.pdf`, `usscrr-18.pdf`, `usscrr-20.pdf` |
| `reading_link_order_candidate` | `1` | `6` | `usscrr-04.pdf` |
| `near_miss_monitor` | `2` | `6` | `usscrr-17.pdf`, `usscrr-12.pdf` |

The high-impact miss is the three stable zero-heading rows, not the small reading/link lane. Existing tool timelines show repeated `create_heading_from_candidate:no_effect` on those rows, so there is not enough evidence here to broaden heading creation safely. The behavior would need an object-backed native heading target predicate, not a source/report-family rule.

## Low-Row Repeat

Repeat run: `/mnt/pdf-review/public-holdouts/ussc-research-reports-2026-05-25/low-repeat-r1/baseline_report.json`

- Completed: `6/6`
- Mean: `75.8333`
- Grades: `2 A / 1 B / 0 C / 0 D / 3 F`
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Runtime p50/p95/max: `120209ms / 155922ms / 155922ms`

Repeat outcomes:

| Row | Full Run | Repeat | Interpretation |
| --- | ---: | ---: | --- |
| `usscrr-04.pdf` | `87/B` | `93/A` | route/analyzer volatility, not a stable behavior proof |
| `usscrr-12.pdf` | `91/A` | `96/A` | near-miss volatility recovered |
| `usscrr-13.pdf` | `59/F` | `59/F` | stable zero-heading debt |
| `usscrr-17.pdf` | `89/B` | `89/B` | stable reading/link mixed tail |
| `usscrr-18.pdf` | `59/F` | `59/F` | stable zero-heading debt |
| `usscrr-20.pdf` | `59/F` | `59/F` | stable zero-heading debt |

## Decision

This source is diagnostic-only. No engine behavior was accepted and no original-50 validation was required because there were no source changes.

The source missed the `93` mean target, but the only lane large enough to recover it is stable zero-heading recovery on `usscrr-13`, `usscrr-18`, and `usscrr-20`. The current evidence does not expose a safe, general paragraph/MCID/native-title target. Do not add filename, source, report-family, URL, hash, or corpus-specific behavior for these rows.

Recommended follow-up, if this lane is revisited: build a native zero-heading object-target diagnostic for tagged reports whose reading order and table structure recover but heading structure remains `0`. Promotion should require object-backed visible/structured heading anchors and controls from prior successful USSC report rows.

## Cleanup

Downloaded PDFs and generated artifacts were local-only and were deleted after metrics extraction.

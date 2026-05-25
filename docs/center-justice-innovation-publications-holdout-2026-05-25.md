# Center For Justice Innovation Publications Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using Center for Justice Innovation resource PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source sitemap: `https://www.innovatingjustice.org/sitemap.xml`
- Resource sitemaps: `https://www.innovatingjustice.org/resource-sitemap.xml` and `https://www.innovatingjustice.org/resource-sitemap2.xml`
- Sample: first 20 unique direct PDF downloads discovered from resource pages that completed successfully and were under 10MB
- Duplicate handling: alternate legacy URLs were de-duplicated by SHA-256 before counting the sample
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/center-justice-innovation-publications-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `30.70 -> 94.35`
- Median: `34 -> 94`
- Minimum final score: `92`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `1`
- Runtime p50/p95/max: `9147ms / 12198ms / 19997ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `cji-18.pdf` | prosecutor as ps | `92/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/center-justice-innovation-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Lane split:
  - `near_miss_monitor`: `1` row, `1` raw point

The lone below-`93` row was already A-grade with only a one-point near miss. Its lowest category was `heading_structure=79`; the diagnostic recommended keeping it as low-priority monitor evidence unless a broader general lane reaches it naturally.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source already exceeded the requested source mean target: `94.35`.
- All 20 rows finished A-grade.
- The only below-`93` row was a one-point near miss, not a high-impact lane.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

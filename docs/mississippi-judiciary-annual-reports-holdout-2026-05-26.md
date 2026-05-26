# Mississippi Judiciary Annual Reports Holdout - 2026-05-26

## Source

- Public source: Mississippi Department of Archives and History Digital Archives judicial report series
- Supreme Court/Judiciary annual-report series: `https://da.mdah.ms.gov/series/mssc/mssc-ar`
- Commission on Judicial Performance annual-report series: `https://da.mdah.ms.gov/series/mcjp/mcjp-ar`
- Sample: 20 public PDF reports under the decimal `10,000,000` byte cap
  - 15 Supreme Court/Judiciary annual reports: `2012`, `2011`, `2010`, `2009`, and `2008` through `1998`
  - 5 Commission on Judicial Performance annual reports: `2023` through `2019`
- Newer Supreme Court annual reports from `2013` through `2024` and scanned early reports `1995` through `1997` were excluded because they exceeded the 10MB cap.
- Local artifacts were kept under `/mnt/pdf-review/public-holdouts/mississippi-judiciary-annual-reports-2026-05-26/` during analysis and deleted after metrics extraction.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/mississippi-judiciary-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/mississippi-judiciary-annual-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `37.65 -> 95.35`
- Median after remediation: `95`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Rows below `95`: `7`
- Hard errors/timeouts: `0`
- `false_positive_applied`: `0`
- Runtime p50/p95/max: `9886ms / 23481ms / 27631ms`

## Diagnostics

`outside-holdout-low-row-diagnostic` returned:

- Decision: `holdout_target_met`
- Recommended lane: `none`

Residual sub-95 rows were all A-grade near misses with mild reading-order, PDF/UA, text-extractability, or bookmark debt. No source behavior change was justified.

## Decision

This holdout passed without behavior changes.

No original-50 validation was required because no production behavior changed. Downloaded PDFs and generated artifacts were deleted after metrics extraction.

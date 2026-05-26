# Indiana Judicial Branch Reports Holdout - 2026-05-26

## Source

- Source family: Indiana Judicial Branch trial court and probation reports.
- Source index: `https://secure.in.gov/courts/iocs/statistics/trial-probation/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used direct PDF links from the Indiana Judicial Branch trial court statistics page. Selection took the direct Judicial Year in Review / Executive Summary PDFs newest first, then probation statewide summaries to reach 20 under-cap rows.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Run mode:

- deterministic
- `--no-semantic`
- `--no-pdfs`
- single bounded holdout worker

Results:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean before | 34.40 |
| Mean after | 82.25 |
| Median after | 93 |
| Grades after | 13 A / 0 B / 0 C / 0 D / 7 F |
| Rows below 93 | 8 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 25,296 ms |
| Runtime p95 | 53,496 ms |
| Runtime max | 57,135 ms |

Rows below 93:

| Row | Baseline after | Primary residual |
| --- | ---: | --- |
| `incourts-01.pdf` | 59/F | `heading_structure=0` |
| `incourts-02.pdf` | 59/F | `heading_structure=0` |
| `incourts-03.pdf` | 59/F | `heading_structure=0` |
| `incourts-04.pdf` | 59/F | `heading_structure=0` |
| `incourts-05.pdf` | 59/F | `heading_structure=0` |
| `incourts-17.pdf` | 59/F | `heading_structure=0` |
| `incourts-18.pdf` | 59/F | `heading_structure=0` |
| `incourts-19.pdf` | 92/A | Low-priority near miss |

## Sample

The 20 valid under-10MiB PDFs downloaded from Indiana Judicial Branch reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `incourts-01` | 2012 Judicial Year in Review | 3,388,174 |
| `incourts-02` | 2011 Judicial Year in Review | 4,089,300 |
| `incourts-03` | 2010 Judicial Year in Review | 4,121,051 |
| `incourts-04` | 2009 Judicial Year in Review | 6,058,499 |
| `incourts-05` | 2008 Executive Summary | 3,384,195 |
| `incourts-06` | 2007 Executive Summary | 3,014,562 |
| `incourts-07` | 2006 Executive Summary | 2,505,721 |
| `incourts-08` | 2005 Executive Summary | 2,291,479 |
| `incourts-09` | 2004 Executive Summary | 6,225,596 |
| `incourts-10` | 2003 Executive Summary | 5,292,400 |
| `incourts-11` | 2002 Executive Summary | 1,404,825 |
| `incourts-12` | 2001 Executive Summary | 1,419,965 |
| `incourts-13` | 2000 Executive Summary | 393,229 |
| `incourts-14` | 1999 Executive Summary | 575,702 |
| `incourts-15` | 1998 Executive Summary | 958,185 |
| `incourts-16` | 2012 Probation Statewide Summary | 1,043,211 |
| `incourts-17` | 2011 Probation Statewide Summary | 532,744 |
| `incourts-18` | 2010 Probation Statewide Summary | 2,270,591 |
| `incourts-19` | 2007 Probation Statewide Summary | 1,127,658 |
| `incourts-20` | 2006 Probation Statewide Summary | 811,413 |

Skipped candidates:

| Title | Reason |
| --- | --- |
| 2009 Probation Statewide Summary | Capped download failed or exceeded 10 MiB |
| 2008 Probation Statewide Summary | Capped download failed or exceeded 10 MiB |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `no_safe_low_row_lane`

Recommended lane: `none`

Raw points needed for mean 93: `215`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 7 | 238 |
| `near_miss_monitor` | 1 | 1 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, and `0` recovered routes with final orphan debt. The seven `59/F` rows had no degenerate native reading-order shell attempts visible.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/indiana-judicial-branch-reports-2026-05-26/run-low-repeat-r1 \
  --limit 8 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after |
| --- | ---: | ---: |
| `incourts-01.pdf` | 59/F | 59/F |
| `incourts-02.pdf` | 59/F | 59/F |
| `incourts-03.pdf` | 59/F | 59/F |
| `incourts-04.pdf` | 59/F | 59/F |
| `incourts-05.pdf` | 59/F | 59/F |
| `incourts-17.pdf` | 59/F | 59/F |
| `incourts-18.pdf` | 59/F | 59/F |
| `incourts-19.pdf` | 92/A | 92/A |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The low rows are stable and score-significant, but all seven are zero-heading residuals with no object-backed safe heading/reading route exposed by current diagnostics.
- The adjacent rows in the same source family include many A-grade controls, so a broad heading rule would be high-risk without a stronger discriminator.
- The single `92/A` row is a low-priority near miss and does not justify behavior breadth.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.

This source is useful evidence for future zero-heading/title-anchor diagnostics, not for an immediate production remediation change.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.

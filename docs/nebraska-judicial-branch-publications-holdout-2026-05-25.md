# Nebraska Judicial Branch Publications Holdout - 2026-05-25

## Source

- Source family: Nebraska Judicial Branch publications and reports.
- Source index: `https://nebraskajudicial.gov/administration/publications-reports`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

The crawler fetched the publications/reports listing and pagination pages, then used the first 20 valid under-cap PDF links. The sample is dominated by Nebraska Judicial Branch quarterly probation/problem-solving court reports.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/run-r1 \
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
| Mean before | 58.25 |
| Mean after | 87.85 |
| Median after | 91 |
| Grades after | 11 A / 7 B / 0 C / 0 D / 2 F |
| Rows below 93 | 15 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 12,280 ms |
| Runtime p95 | 16,312 ms |
| Runtime max | 19,311 ms |

Rows below 93:

| Class | Rows | Raw points |
| --- | ---: | ---: |
| `near_miss_monitor` | 13 | 40 |
| `figure_alt_object_candidate` | 1 | 34 |
| `no_safe_predicate` | 1 | 34 |

## Sample

The 20 valid under-10MiB PDFs downloaded from Nebraska Judicial Branch publications were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `nejudpub-01` | `2026, Quarter 1 - Adult` | 286,294 |
| `nejudpub-02` | `2026, Quarter 1 - Juvenile` | 1,012,774 |
| `nejudpub-03` | `2026, Quarter 1 - Post-Release Supervision` | 221,149 |
| `nejudpub-04` | `2026, Quarter 1 - Problem-Solving Courts` | 236,760 |
| `nejudpub-05` | `2025, Quarter 1 - Adult` | 256,740 |
| `nejudpub-06` | `2025, Quarter 1 - Juvenile` | 923,770 |
| `nejudpub-07` | `2025, Quarter 1 - Post-Release Supervision` | 206,359 |
| `nejudpub-08` | `2025, Quarter 1 - Problem-Solving Courts` | 219,439 |
| `nejudpub-09` | `2025, Quarter 1 - Specialized Substance Abuse Supervision` | 221,795 |
| `nejudpub-10` | `2025, Quarter 2 - Adult` | 399,704 |
| `nejudpub-11` | `2025, Quarter 2 - Juvenile` | 1,044,719 |
| `nejudpub-12` | `2025, Quarter 2 - Post-Release Supervision` | 235,621 |
| `nejudpub-13` | `2025, Quarter 2 - Problem-Solving Courts` | 335,452 |
| `nejudpub-14` | `2025, Quarter 2 - Specialized Substance Abuse Supervision` | 372,629 |
| `nejudpub-15` | `2025, Quarter 3 - Adult` | 329,375 |
| `nejudpub-16` | `2025, Quarter 3 - Juvenile` | 1,028,702 |
| `nejudpub-17` | `2025, Quarter 3 - Post-Release Supervision` | 264,375 |
| `nejudpub-18` | `2025, Quarter 3 - Problem-Solving Courts` | 270,539 |
| `nejudpub-19` | `2025, Quarter 3 - Specialized Substance Abuse Supervision` | 281,432 |
| `nejudpub-20` | `2025, Quarter 4 - Adult` | 328,752 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `figure_alt_object_candidate`

Raw points needed for mean 93: `103`

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

The diagnostic found `0` scoring candidates and `0` behavior candidates. The only figure/alt focus row, `nejudpub-15`, was classified as `checker_alt_partial_existing_bound`: existing bounded figure-alt writes improved checker-visible coverage to `6/13`, but not enough to move final `alt_text`.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/low-repeat-input \
  /mnt/pdf-review/public-holdouts/nebraska-judicial-branch-publications-2026-05-25/low-repeat-r1 \
  --limit 15 \
  --cleanup-row-artifacts
```

Repeat result over the 15 sub-93 baseline rows:

| Metric | Value |
| --- | ---: |
| Rows | 15 |
| Mean after | 90.5333 |
| Median after | 91 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p95 | 20,449 ms |

The repeat showed route variance on the two baseline F rows:

| Row | Baseline after | Repeat after |
| --- | ---: | ---: |
| `nejudpub-01.pdf` | 59/F | 93/A |
| `nejudpub-15.pdf` | 59/F | 89/B |

Most remaining sub-93 rows repeated in the `89-91` range with mild heading/PDF-UA debt.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source does not clear the 93 mean target: mean `87.85`, median `91`.
- The only high-upside diagnostic lane was figure/alt, but focused evidence found no scoring or behavior candidate.
- The two baseline F rows were route-volatile in repeat, so they do not support a stable object-backed production rule.
- The remaining lows are mostly low-upside `89-91` near misses with repeated heading/PDF-UA debt and no safe predicate from this artifact alone.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.

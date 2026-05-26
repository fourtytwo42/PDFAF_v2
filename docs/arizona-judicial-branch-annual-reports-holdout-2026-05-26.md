# Arizona Judicial Branch Annual Reports Holdout - 2026-05-26

## Source

- Source family: Arizona Judicial Branch annual judicial data reports.
- Source page: `https://www.azcourts.gov/annualreport/Past-Annual-Data-Reports`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The source page exposes older direct PDF annual data reports plus newer flipbook/download links. This holdout used the 20 direct official PDF links from FY2021 through FY2002 so the sample stayed deterministic and under the 10 MiB cap.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 45.80 |
| Mean after | 88.60 |
| Median after | 94 |
| Grades after | 16 A / 1 B / 0 C / 0 D / 3 F |
| Rows below 93 | 4 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 16,423 ms |
| Runtime p95 | 32,998 ms |
| Runtime max | 154,532 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `azcourtsar-02.pdf` | 81/B | 32,998 ms | Stable figure-alt partial coverage after bounded existing writes |
| `azcourtsar-06.pdf` | 59/F | 26,162 ms | Route-volatile zero-heading residual; repeat recovered to 96/A |
| `azcourtsar-09.pdf` | 59/F | 21,797 ms | Stable zero-heading residual with no safe new heading predicate |
| `azcourtsar-18.pdf` | 59/F | 154,532 ms | Stable slow zero-heading/link residual with no safe new heading predicate |

## Sample

The 20 valid under-10MiB PDFs were:

| Row | Report | Bytes |
| --- | --- | ---: |
| `azcourtsar-01` | 2021 Fiscal Year Annual Judicial Data Report | 6,671,799 |
| `azcourtsar-02` | 2020 Fiscal Year Annual Judicial Data Report | 604,489 |
| `azcourtsar-03` | 2019 Fiscal Year Annual Judicial Data Report | 712,358 |
| `azcourtsar-04` | 2018 Fiscal Year Annual Judicial Data Report | 689,286 |
| `azcourtsar-05` | 2017 Fiscal Year Annual Judicial Data Report | 1,123,092 |
| `azcourtsar-06` | 2016 Fiscal Year Annual Judicial Data Report | 1,121,440 |
| `azcourtsar-07` | 2015 Fiscal Year Annual Judicial Data Report | 587,198 |
| `azcourtsar-08` | 2014 Fiscal Year Annual Judicial Data Report | 503,243 |
| `azcourtsar-09` | 2013 Fiscal Year Annual Judicial Data Report | 1,178,275 |
| `azcourtsar-10` | 2012 Fiscal Year Annual Judicial Data Report | 564,094 |
| `azcourtsar-11` | 2011 Fiscal Year Annual Judicial Data Report | 661,562 |
| `azcourtsar-12` | 2010 Fiscal Year Annual Judicial Data Report | 710,621 |
| `azcourtsar-13` | 2009 Fiscal Year Annual Judicial Data Report | 575,783 |
| `azcourtsar-14` | 2008 Fiscal Year Annual Judicial Data Report | 497,304 |
| `azcourtsar-15` | 2007 Fiscal Year Annual Judicial Data Report | 3,066,851 |
| `azcourtsar-16` | 2006 Fiscal Year Annual Judicial Data Report | 1,044,339 |
| `azcourtsar-17` | 2005 Fiscal Year Annual Judicial Data Report | 751,622 |
| `azcourtsar-18` | 2004 Fiscal Year Annual Judicial Data Report | 1,519,040 |
| `azcourtsar-19` | 2003 Fiscal Year Annual Judicial Data Report | 1,391,004 |
| `azcourtsar-20` | 2002 Fiscal Year Annual Judicial Data Report | 1,235,690 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_medium_impact_targeted_diagnostic`

Recommended lane: `figure_alt_object_candidate`

Raw points needed for mean 93: `88`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 3 | 102 |
| `figure_alt_object_candidate` | 1 | 12 |

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

Evidence:

- `azcourtsar-02` classified as `checker_alt_partial_existing_bound`.
- Existing bounded figure-alt writes improved checker-visible coverage, but did not produce enough final alt-text coverage to move the row above B.
- This is a 12-point medium row and cannot close the source mean gap alone.

Visible-title/heading-anchor diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts \
  --all-input /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/visible-title-input.json \
  --input-root /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/input \
  --out /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/visible-title-anchor-r1 \
  --file azcourtsar-06 \
  --file azcourtsar-09 \
  --file azcourtsar-18
```

Result:

- all three rows classified as `existing_internal_anchor_candidate`
- recommendation was to use existing visible-heading paths, not add a new source-text fallback

This does not justify a new heading fallback. The baseline tool timeline shows existing heading attempts already no-effected or were rejected by PAC guards.

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/arizona-judicial-branch-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 4 \
  --cleanup-row-artifacts
```

The four sub-93 rows repeated with mean `73.7500`, no errors/timeouts, and `false_positive_applied=0`. Repeated results were `azcourtsar-02 81/B`, `azcourtsar-06 96/A`, `azcourtsar-09 59/F`, and `azcourtsar-18 59/F`.

## Decision

No source behavior was accepted from this holdout.

The source misses the 93 mean target by `88` raw points. The dominant miss is zero-heading debt, but the existing visible-heading path already sees internal candidates and the failed rows do not prove a new safe general predicate. `azcourtsar-06` is route-volatile and recovered on repeat, while `azcourtsar-09` and `azcourtsar-18` stayed stable 59/F. `azcourtsar-02` exposes real figure-alt partial coverage, but current bounded figure-alt behavior already ran and the row is too low-upside to close the source gap.

No original-50 regression validation was required because no scoring, planning, analyzer, or remediation behavior changed. Downloaded public PDFs and generated artifacts should remain local only and were deleted after metrics extraction.

# Wisconsin Court of Appeals Reports Holdout - 2026-05-26

## Summary

This holdout sampled 20 public annual report PDFs from the Wisconsin Court System Court of Appeals statistical reports page:

- Source: `https://www.wicourts.gov/other/appeals/statistical.jsp`
- Selection: newest 20 Court of Appeals Annual Report PDFs, all under a strict decimal `10,000,000` byte cap.
- Validation mode: deterministic no-semantic/no-remediated-PDF bounded holdout validation.
- Decision: passed without behavior changes.

The source clears the 93 mean target with bounded runtime and no false-positive applications. Two older reports have stable reading-order residuals, but the source already passes and the reading-order shell diagnostic found no safe existing sequence candidate.

## Sample

| Row | File | Source Report |
| --- | --- | --- |
| `wicoa-01` | `wicoa-01.pdf` | Court of Appeals Annual Report - 2025 |
| `wicoa-02` | `wicoa-02.pdf` | Court of Appeals Annual Report - 2024 |
| `wicoa-03` | `wicoa-03.pdf` | Court of Appeals Annual Report - 2023 |
| `wicoa-04` | `wicoa-04.pdf` | Court of Appeals Annual Report - 2022 |
| `wicoa-05` | `wicoa-05.pdf` | Court of Appeals Annual Report - 2021 |
| `wicoa-06` | `wicoa-06.pdf` | Court of Appeals Annual Report - 2020 |
| `wicoa-07` | `wicoa-07.pdf` | Court of Appeals Annual Report - 2019 |
| `wicoa-08` | `wicoa-08.pdf` | Court of Appeals Annual Report - 2018 |
| `wicoa-09` | `wicoa-09.pdf` | Court of Appeals Annual Report - 2017 |
| `wicoa-10` | `wicoa-10.pdf` | Court of Appeals Annual Report - 2016 |
| `wicoa-11` | `wicoa-11.pdf` | Court of Appeals Annual Report - 2015 |
| `wicoa-12` | `wicoa-12.pdf` | Court of Appeals Annual Report - 2014 |
| `wicoa-13` | `wicoa-13.pdf` | Court of Appeals Annual Report - 2013 |
| `wicoa-14` | `wicoa-14.pdf` | Court of Appeals Annual Report - 2012 |
| `wicoa-15` | `wicoa-15.pdf` | Court of Appeals Annual Report - 2011 |
| `wicoa-16` | `wicoa-16.pdf` | Court of Appeals Annual Report - 2010 |
| `wicoa-17` | `wicoa-17.pdf` | Court of Appeals Annual Report - 2009 |
| `wicoa-18` | `wicoa-18.pdf` | Court of Appeals Annual Report - 2008 |
| `wicoa-19` | `wicoa-19.pdf` | Court of Appeals Annual Report - 2007 |
| `wicoa-20` | `wicoa-20.pdf` | Court of Appeals Annual Report - 2006 |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/wisconsin-court-appeals-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/wisconsin-court-appeals-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean | 93.45 |
| Median | 97 |
| Grades | 18 A / 0 B / 0 C / 2 D / 0 F |
| Rows below 93 | 2 |
| Errors / timeouts | 0 / 0 |
| `false_positive_applied` | 0 |
| Runtime p50 / p95 / max | 14.045s / 16.281s / 17.314s |
| Raw points needed for mean 93 | 0 |

Rows below 93:

| Row | Score | Lowest Residual Categories |
| --- | ---: | --- |
| `wicoa-12.pdf` | 69/D | `reading_order=35`, `pdf_ua_compliance=79`, `form_accessibility=89`, `heading_structure=97` |
| `wicoa-13.pdf` | 69/D | `reading_order=35`, `pdf_ua_compliance=79`, `form_accessibility=89`, `heading_structure=97` |

## Focused Repeat

The two rows below 93 were repeated sequentially with the same deterministic bounded validation mode.

| Row | Primary | Repeat |
| --- | ---: | ---: |
| `wicoa-12.pdf` | 69/D | 69/D |
| `wicoa-13.pdf` | 69/D | 69/D |

Repeat subset result:

| Metric | Value |
| --- | ---: |
| Processed | 2/2 |
| Mean | 69 |
| Median | 69 |
| Grades | 0 A / 0 B / 0 C / 2 D / 0 F |
| Errors / timeouts | 0 / 0 |
| `false_positive_applied` | 0 |
| Runtime p50 / p95 / max | 16.325s / 16.561s / 16.561s |

## Diagnostics

Primary low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed: `0`
- Residual rows: `wicoa-12`, `wicoa-13`

Repeat low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for the two-row subset: `48`
- The two residual rows repeated exactly at `69/D`.

Reading-order shell diagnostic:

- Rows: `20`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `0`
- Selected rows: none

## Decision

No production behavior was accepted from this holdout.

This is a useful outside-court validation pass: the source clears mean and median targets, runs quickly, and preserves `false_positive_applied=0`. The two stable D rows are reading-order residuals, but there is no safe existing reading-order repair sequence visible in the run artifact, and the source already meets the mean target.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts remain local only and were cleaned after metrics extraction.

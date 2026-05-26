# Wisconsin Supreme Court Statistical Reports Holdout - 2026-05-26

## Summary

This holdout sampled 20 public PDFs from the Wisconsin Supreme Court statistical reports page:

- Source: `https://www.wicourts.gov/supreme/sc_statistical.jsp`
- Selection: all 18 available Supreme Court Annual Statistical Report PDFs plus the two newest Monthly Statistical Report PDFs, all under a strict decimal `10,000,000` byte cap.
- Validation mode: deterministic no-semantic/no-remediated-PDF bounded holdout validation.
- Decision: diagnostic-only; no source behavior change accepted.

The source misses mean 93 by seven raw points because two annual reports reproduce as stable zero-heading `59/F` rows. A focused heading-anchor probe classified both lows as `no_safe_candidate`, so there is no safe general heading behavior to promote from this source.

## Sample

| Row | File | Source Report |
| --- | --- | --- |
| `wiscsc-01` | `wiscsc-01.pdf` | Annual Statistical Report - 2024-2025 Term |
| `wiscsc-02` | `wiscsc-02.pdf` | Annual Statistical Report - 2023-2024 Term |
| `wiscsc-03` | `wiscsc-03.pdf` | Annual Statistical Report - 2022-2023 Term |
| `wiscsc-04` | `wiscsc-04.pdf` | Annual Statistical Report - 2021-2022 Term |
| `wiscsc-05` | `wiscsc-05.pdf` | Annual Statistical Report - 2020-2021 Term |
| `wiscsc-06` | `wiscsc-06.pdf` | Annual Statistical Report - 2019-2020 Term |
| `wiscsc-07` | `wiscsc-07.pdf` | Annual Statistical Report - 2018-2019 Term |
| `wiscsc-08` | `wiscsc-08.pdf` | Annual Statistical Report - 2017-2018 Term |
| `wiscsc-09` | `wiscsc-09.pdf` | Annual Statistical Report - 2016-2017 Term |
| `wiscsc-10` | `wiscsc-10.pdf` | Annual Statistical Report - 2015-2016 Term |
| `wiscsc-11` | `wiscsc-11.pdf` | Annual Statistical Report - 2014-2015 Term |
| `wiscsc-12` | `wiscsc-12.pdf` | Annual Statistical Report - 2013-2014 Term |
| `wiscsc-13` | `wiscsc-13.pdf` | Annual Statistical Report - 2012-2013 Term |
| `wiscsc-14` | `wiscsc-14.pdf` | Annual Statistical Report - 2011-2012 Term |
| `wiscsc-15` | `wiscsc-15.pdf` | Annual Statistical Report - 2010-2011 Term |
| `wiscsc-16` | `wiscsc-16.pdf` | Annual Statistical Report - 2009-2010 Term |
| `wiscsc-17` | `wiscsc-17.pdf` | Annual Statistical Report - 2008-2009 Term |
| `wiscsc-18` | `wiscsc-18.pdf` | Annual Statistical Report - 2007-2008 Term |
| `wiscsc-19` | `wiscsc-19.pdf` | Monthly Statistical Report - April 2026 |
| `wiscsc-20` | `wiscsc-20.pdf` | Monthly Statistical Report - March 2026 |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/wisconsin-supreme-court-statistical-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/wisconsin-supreme-court-statistical-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean | 92.65 |
| Median | 96 |
| Grades | 18 A / 0 B / 0 C / 0 D / 2 F |
| Rows below 93 | 2 |
| Errors / timeouts | 0 / 0 |
| `false_positive_applied` | 0 |
| Runtime p50 / p95 / max | 12.088s / 16.467s / 16.763s |
| Raw points needed for mean 93 | 7 |

Rows below 93:

| Row | Score | Lowest Residual Categories |
| --- | ---: | --- |
| `wiscsc-11.pdf` | 59/F | `heading_structure=0`, `pdf_ua_compliance=79`, `reading_order=79`, `form_accessibility=89` |
| `wiscsc-12.pdf` | 59/F | `heading_structure=0`, `pdf_ua_compliance=79`, `reading_order=79`, `form_accessibility=89` |

## Focused Repeat

The two rows below 93 were repeated sequentially with the same deterministic bounded validation mode.

| Row | Primary | Repeat |
| --- | ---: | ---: |
| `wiscsc-11.pdf` | 59/F | 59/F |
| `wiscsc-12.pdf` | 59/F | 59/F |

Repeat subset result:

| Metric | Value |
| --- | ---: |
| Processed | 2/2 |
| Mean | 59 |
| Median | 59 |
| Grades | 0 A / 0 B / 0 C / 0 D / 2 F |
| Errors / timeouts | 0 / 0 |
| `false_positive_applied` | 0 |

## Diagnostics

Primary low-row diagnostic:

- Decision: `no_safe_low_row_lane`
- Recommended lane: `none`
- Raw points needed: `7`
- Residual rows: `wiscsc-11`, `wiscsc-12`
- Lane split: `no_safe_predicate` for both lows.

Repeat low-row diagnostic:

- Decision: `no_safe_low_row_lane`
- Recommended lane: `none`
- Raw points needed for the two-row subset: `68`
- Both residual rows reproduced exactly at `59/F`.

Heading-anchor probe:

- `wiscsc-11`: `no_safe_candidate`; reason `no_high_confidence_visible_content_anchor`
- `wiscsc-12`: `no_safe_candidate`; reason `no_high_confidence_visible_content_anchor`

The probe analyzed the source PDFs with the native visible-heading-anchor classifier. It found no content-backed target suitable for promoting existing heading repair behavior.

## Decision

No production behavior was accepted from this holdout.

The source is close to target and runs quickly, but the only score-moving opportunity is a pair of stable zero-heading rows with no safe visible-anchor candidate. Broadening heading recovery from this evidence would be source/year fitting and would violate the object-backed remediation standard.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts remain local only and were cleaned after metrics extraction.

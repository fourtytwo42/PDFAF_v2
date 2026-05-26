# Colorado Judicial Discipline Annual Reports Holdout - 2026-05-26

## Source

- Source pages:
  - https://ccjd.colorado.gov/annual-reports
  - https://spl.cde.state.co.us/artemis/scserials/sc51internet/
- Sample: newest 20 annual-report PDFs from the Colorado State Library mirror of Colorado Commission on Judicial Discipline annual reports.
- Size gate: every selected PDF was verified as an actual PDF under the strict decimal `10,000,000` byte cap before validation.
- Selection note: reports from 2024 through 2005. The official agency page was not directly fetchable from this VM, so the public Colorado State Library mirror was used for downloads.

## Sample

| Row | PDF |
| --- | --- |
| `cojdisc-01` | 2024 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-02` | 2023 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-03` | 2022 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-04` | 2021 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-05` | 2020 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-06` | 2019 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-07` | 2018 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-08` | 2017 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-09` | 2016 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-10` | 2015 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-11` | 2014 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-12` | 2013 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-13` | 2012 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-14` | 2011 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-15` | 2010 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-16` | 2009 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-17` | 2008 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-18` | 2007 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-19` | 2006 Colorado Commission on Judicial Discipline Annual Report |
| `cojdisc-20` | 2005 Colorado Commission on Judicial Discipline Annual Report |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/colorado-judicial-discipline-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/colorado-judicial-discipline-annual-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `96.30`
- Median: `97`
- Grades: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `1`
- Rows below `95`: `3`
- p50/p95/max: `9165ms / 14231ms / 21503ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Rows:

| Row | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| `cojdisc-01` | `73/C` | `96/A` | `12635ms` |
| `cojdisc-02` | `59/F` | `92/A` | `21503ms` |
| `cojdisc-03` | `59/F` | `97/A` | `14231ms` |
| `cojdisc-04` | `48/F` | `97/A` | `10575ms` |
| `cojdisc-05` | `59/F` | `98/A` | `6608ms` |
| `cojdisc-06` | `39/F` | `97/A` | `11764ms` |
| `cojdisc-07` | `39/F` | `97/A` | `12109ms` |
| `cojdisc-08` | `39/F` | `97/A` | `9743ms` |
| `cojdisc-09` | `39/F` | `97/A` | `11426ms` |
| `cojdisc-10` | `62/D` | `93/A` | `9165ms` |
| `cojdisc-11` | `34/F` | `95/A` | `7481ms` |
| `cojdisc-12` | `39/F` | `97/A` | `9813ms` |
| `cojdisc-13` | `10/F` | `94/A` | `11655ms` |
| `cojdisc-14` | `28/F` | `100/A` | `7154ms` |
| `cojdisc-15` | `28/F` | `100/A` | `7194ms` |
| `cojdisc-16` | `10/F` | `99/A` | `8142ms` |
| `cojdisc-17` | `34/F` | `95/A` | `7954ms` |
| `cojdisc-18` | `34/F` | `95/A` | `8568ms` |
| `cojdisc-19` | `34/F` | `95/A` | `7405ms` |
| `cojdisc-20` | `34/F` | `95/A` | `7452ms` |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for source mean `93`: `0`
- Timeout/error rows: `0`
- The only below-93 row was `cojdisc-02` at `92/A`, classified as `near_miss_monitor`.
- Lowest categories for `cojdisc-02`: `heading_structure=79`, `pdf_ua_compliance=79`, `table_markup=79`, `text_extractability=96`, `alt_text=100`, `bookmarks=100`.

## Decision

No source change was accepted for this holdout.

The engine handles this small judiciary annual-report set well: every row reached A grade, the mean is comfortably above `93`, there were no hard errors, and the p95 runtime stayed low. The lone near miss does not expose enough general, object-backed evidence to justify a scoring or remediation change.

No original-50 validation was required because no scoring, planning, remediation, API, or Docker behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.

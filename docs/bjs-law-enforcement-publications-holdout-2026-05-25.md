# BJS Law Enforcement Publications Holdout - 2026-05-25

## Summary

This was a public outside-source holdout against Bureau of Justice Statistics law-enforcement publication PDFs. The sample used 20 unique BJS publication PDFs under 10 MB discovered from official BJS law-enforcement publication list/detail pages.

This source did not pass. It exposes a broad table/header transaction debt pattern similar to prior BJS/statistical-report table misses.

- Local run before cleanup: `/mnt/pdf-review/public-holdouts/bjs-law-enforcement-publications-2026-05-25/run-r1`
- PDFs processed: `20/20`
- Mean: `69.80 -> 77.10`
- Median after: `69`
- Grades after: `4 A / 3 B / 1 C / 12 D / 0 F`
- Rows below `93`: `16`
- Runtime p50/p95/max: `54611ms / 173107ms / 176052ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

## Sample

| Row | Publication page | PDF URL | Bytes |
| --- | --- | --- | ---: |
| `bjsle-01` | `https://bjs.ojp.gov/library/publications/federal-law-enforcement-officers-2023-statistical-tables` | `https://bjs.ojp.gov/document/fleo23st.pdf` | `844912` |
| `bjsle-02` | `https://bjs.ojp.gov/library/publications/hiring-and-retention-state-and-local-law-enforcement-officers-2020-statistical-tables` | `https://bjs.ojp.gov/document/hrslleo20st.pdf` | `929894` |
| `bjsle-03` | `https://bjs.ojp.gov/library/publications/state-local-law-enforcement-training-academies-training-topics-instructors-2022-statistical-tables` | `https://bjs.ojp.gov/document/slletatti22st.pdf` | `558623` |
| `bjsle-04` | `https://bjs.ojp.gov/library/publications/crime-known-law-enforcement-2024` | `https://bjs.ojp.gov/document/ckle24.pdf` | `908337` |
| `bjsle-05` | `https://bjs.ojp.gov/library/publications/health-and-wellness-resources-available-law-enforcement-2022` | `https://bjs.ojp.gov/document/hwrale22.pdf` | `836094` |
| `bjsle-06` | `https://bjs.ojp.gov/library/publications/crime-known-law-enforcement-2023` | `https://bjs.ojp.gov/document/ckle23.pdf` | `1704573` |
| `bjsle-07` | `https://bjs.ojp.gov/library/publications/human-trafficking-incidents-reported-law-enforcement-2022-statistical-tables` | `https://bjs.ojp.gov/document/htirle22st.pdf` | `650549` |
| `bjsle-08` | `https://bjs.ojp.gov/library/publications/national-law-enforcement-accountability-database-2018-2023` | `https://bjs.ojp.gov/document/nlead1823.pdf` | `474805` |
| `bjsle-09` | `https://bjs.ojp.gov/library/publications/state-and-local-law-enforcement-training-academies-and-recruits-2022` | `https://bjs.ojp.gov/document/slletar22st.pdf` | `562937` |
| `bjsle-10` | `https://bjs.ojp.gov/library/publications/campus-law-enforcement-agencies-serving-4-year-institutions-2021-2022` | `https://bjs.ojp.gov/document/cleas4i2122st.pdf` | `1023688` |
| `bjsle-11` | `https://bjs.ojp.gov/library/publications/primary-state-law-enforcement-agencies-personnel-2020` | `https://bjs.ojp.gov/document/psleap20.pdf` | `663689` |
| `bjsle-12` | `https://bjs.ojp.gov/library/publications/tribal-law-enforcement-united-states-2018` | `https://bjs.ojp.gov/document/tleus18.pdf` | `858495` |
| `bjsle-13` | `https://bjs.ojp.gov/library/publications/law-enforcement-agencies-employ-school-resource-officers-2019` | `https://bjs.ojp.gov/media/leaesro19.pdf` | `905843` |
| `bjsle-14` | `https://bjs.ojp.gov/library/publications/federal-law-enforcement-officers-2020-statistical-tables` | `https://bjs.ojp.gov/document/fleo20st.pdf` | `936282` |
| `bjsle-15` | `https://bjs.ojp.gov/library/publications/state-and-local-law-enforcement-training-academies-2018-statistical-tables` | `https://bjs.ojp.gov/sites/g/files/xyckuh236/files/media/document/slleta18st.pdf` | `819027` |
| `bjsle-16` | `https://bjs.ojp.gov/library/publications/law-enforcement-officers-killed-and-assaulted-2019-tables` | `https://bjs.ojp.gov/redirect-legacy/content/pub/pdf/leoka19_tables_rev.pdf` | `751172` |
| `bjsle-17` | `https://bjs.ojp.gov/library/publications/offenses-known-law-enforcement-large-cities-2018` | `https://bjs.ojp.gov/document/oklelc18.pdf` | `1131457` |
| `bjsle-18` | `https://bjs.ojp.gov/library/publications/federal-law-enforcement-officers-2016-statistical-tables` | `https://bjs.ojp.gov/document/fleo16st.pdf` | `597141` |
| `bjsle-19` | `https://bjs.ojp.gov/library/publications/sheriffs-offices-procedures-policies-and-technology-2020-statistical-tables` | `https://bjs.ojp.gov/document/soppt20st.pdf` | `866652` |
| `bjsle-20` | `https://bjs.ojp.gov/library/publications/local-police-departments-procedures-policies-and-technology-2020-statistical` | `https://bjs.ojp.gov/document/lpdppt20st.pdf` | `913842` |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `318`
- Table-target rows: `14`, carrying `317` raw points
- Reading/link-order rows: `2`, carrying `10` raw points

Focused table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `bjsle-01`, `bjsle-02`, `bjsle-03`, `bjsle-04`, `bjsle-06`, `bjsle-08`, `bjsle-09`, `bjsle-10`, `bjsle-11`, `bjsle-12`, `bjsle-13`, `bjsle-18`, `bjsle-19`, `bjsle-20`
- Unsafe control candidates: `bjsle-05`, `bjsle-07`, `bjsle-14`, `bjsle-16`, `bjsle-17`
- Prior non-table target rows: `none`
- Classification counts: `17` stable normalize targets, `2` stable header-association targets, `1` control/high-grade noise

Representative table/structure sequence probe:

- Rows probed: `bjsle-01`, `bjsle-03`, `bjsle-08`, `bjsle-13`
- Sequence candidates: `1`
- Table-header cleanup insufficient: `2`
- Harmful PAC regressions: `3`
- No useful movement outcomes: `50`
- `bjsle-01` stayed `69/D` with no score movement.
- `bjsle-03` stayed `69/D` with no score movement.
- `bjsle-08` had a table-normalization path to `81/B`, but it was classified as harmful because non-target PAC failure counts increased.
- `bjsle-13` had one tiny sequence candidate from a remediated state, moving `67/D -> 69/D`; it increased table score but lost heading score and was not material enough for behavior acceptance.

## Decision

No source behavior was changed or accepted.

This source is useful high-impact evidence for the parked table/header transaction lane, but it does not justify accepting a new general fix yet:

- The failure pattern is broad and real, but target predicates also trigger on same-source controls.
- Existing table/header tools already fire on many rows and still leave most lows at `69/D`.
- The representative sequence probe found mostly no movement, insufficient header cleanup, or PAC regressions.
- The only sequence candidate remained D-grade and lost heading score, so it is not a safe promotion signal.

No original-50 validation was required because no behavior changed.

Generated PDFs and benchmark artifacts were local-only and deleted after metrics extraction.

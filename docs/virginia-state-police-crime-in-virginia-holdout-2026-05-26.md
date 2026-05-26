# Virginia State Police CJIS/Publications Holdout - 2026-05-26

## Source

- Official source page: https://vsp.virginia.gov/sections-units-bureaus/bass/criminal-justice-information-services/uniform-crime-reporting/
- Supplemental official publications page: https://vsp.virginia.gov/news-and-alerts/publications/
- Local source fetch note: this VM could not validate the `vsp.virginia.gov` certificate chain with the local CA store, so the source pages and PDFs were fetched with `curl -k`. The source domain and links are official Virginia State Police URLs.
- Selection: newest available official Virginia State Police PDFs under the strict decimal `10,000,000` byte cap, prioritizing `Crime in Virginia` annual reports. Only 11 `Crime in Virginia` PDFs were under cap, so the sample was filled to 20 with same-source CJIS/photo-speed/technical public PDFs.
- Oversized `Crime in Virginia` annual-report PDFs were skipped rather than compressed or partially counted.

## Sample

| ID | File | Bytes | Description |
| --- | --- | ---: | --- |
| `vspcrime-01` | `vspcrime-01.pdf` | 1,823,006 | Crime in Virginia 2023 |
| `vspcrime-02` | `vspcrime-02.pdf` | 1,402,819 | Crime in Virginia 2022 |
| `vspcrime-03` | `vspcrime-03.pdf` | 2,582,804 | Crime in Virginia 2017 |
| `vspcrime-04` | `vspcrime-04.pdf` | 2,582,162 | Crime in Virginia 2016 |
| `vspcrime-05` | `vspcrime-05.pdf` | 3,224,203 | Crime in Virginia 2015 |
| `vspcrime-06` | `vspcrime-06.pdf` | 2,566,991 | Crime in Virginia 2014 |
| `vspcrime-07` | `vspcrime-07.pdf` | 632,935 | Crime in Virginia 2013 |
| `vspcrime-08` | `vspcrime-08.pdf` | 1,250,001 | Crime in Virginia 2012 |
| `vspcrime-09` | `vspcrime-09.pdf` | 2,681,368 | Crime in Virginia 2011 |
| `vspcrime-10` | `vspcrime-10.pdf` | 3,878,129 | Crime in Virginia 2002 |
| `vspcrime-11` | `vspcrime-11.pdf` | 1,087,197 | Crime in Virginia 2001 |
| `vspcrime-12` | `vspcrime-12.pdf` | 230,616 | Photo Speed Monitoring Report 2025 |
| `vspcrime-13` | `vspcrime-13.pdf` | 640,082 | Photo Speed Monitoring Report 2024 |
| `vspcrime-14` | `vspcrime-14.pdf` | 55,811 | Photo Speed Monitoring Report 2023 |
| `vspcrime-15` | `vspcrime-15.pdf` | 256,896 | Photo Speed Monitoring Report 2022 |
| `vspcrime-16` | `vspcrime-16.pdf` | 740,674 | Community Policing Data Collection Instructions and Technical Specifications v6 |
| `vspcrime-17` | `vspcrime-17.pdf` | 2,270,649 | 2025.2 Virginia NIBRS Technical Specification |
| `vspcrime-18` | `vspcrime-18.pdf` | 1,738,217 | 2025.2 Virginia IBR User Manual |
| `vspcrime-19` | `vspcrime-19.pdf` | 1,086,445 | IBR Statute Conversion Table |
| `vspcrime-20` | `vspcrime-20.pdf` | 1,563,945 | Likely Code of Virginia Statute by IBR Offense |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/virginia-state-police-crime-in-virginia-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/virginia-state-police-crime-in-virginia-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Completed: `20/20`
- Mean: `50.85 -> 74.75`
- Median after: `69`
- Grades after: `7 A / 1 B / 0 C / 5 D / 7 F`
- Rows below `93`: `14`
- Rows below `95`: `16`
- p50/p95/max runtime: `24634ms / 269469ms / 288079ms`
- Hard timeouts/errors: `0`
- `false_positive_applied=0`

Lowest rows:

| File | Result | Main residual evidence |
| --- | --- | --- |
| `vspcrime-19.pdf` | `51/F` | `heading_structure=0`, `table_markup=0`, `pdf_ua_compliance=79` |
| `vspcrime-20.pdf` | `57/F` | `heading_structure=0`, `table_markup=16`, `pdf_ua_compliance=71` |
| `vspcrime-03.pdf` | `59/F` | `heading_structure=0`, `pdf_ua_compliance=79` |
| `vspcrime-04.pdf` | `59/F` | `heading_structure=0`, `pdf_ua_compliance=79` |
| `vspcrime-05.pdf` | `59/F` | `heading_structure=0`, `pdf_ua_compliance=79` |
| `vspcrime-06.pdf` | `59/F` | `heading_structure=0`, `pdf_ua_compliance=79` |
| `vspcrime-07.pdf` | `59/F` | `heading_structure=0`, `reading_order=80` |
| `vspcrime-18.pdf` | `68/D` | `table_markup=0`, `heading_structure=35`, `pdf_ua_compliance=63` |
| `vspcrime-01.pdf` | `69/D` | `table_markup=0`, `heading_structure=48`, `pdf_ua_compliance=63` |
| `vspcrime-02.pdf` | `69/D` | `table_markup=16`, `pdf_ua_compliance=71` |
| `vspcrime-09.pdf` | `69/D` | `table_markup=0`, `bookmarks=68`, `pdf_ua_compliance=71` |
| `vspcrime-17.pdf` | `69/D` | `table_markup=0`, `heading_structure=52`, `pdf_ua_compliance=63` |
| `vspcrime-15.pdf` | `83/B` | `text_extractability=62`, `reading_order=79` |
| `vspcrime-10.pdf` | `92/A` | one-point near miss |

## Diagnostics

`outside-holdout-low-row-diagnostic` returned:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `365`
- Lane split:
  - `table_target_resolution_needed`: `7` rows, `199` points
  - `no_safe_predicate`: `6` rows, `180` points
  - `near_miss_monitor`: `1` row, `1` point

`table-target-resolution-diagnostic` returned:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `vspcrime-01`, `vspcrime-02`, `vspcrime-17`, `vspcrime-18`, `vspcrime-20`
- Unsafe same-source control candidates: `vspcrime-12`, `vspcrime-13`, `vspcrime-16`
- Prior non-table target row: `vspcrime-09`
- Reason: stable object-backed table targets are not sufficient because same-source controls also trigger, and prior non-table targeting explains part of the failure shape.

`all-input-visible-title-anchor-diagnostic` over zero-heading lows found:

- `vspcrime-03`, `vspcrime-04`, `vspcrime-05`, `vspcrime-06`, `vspcrime-07`, `vspcrime-19`, and `vspcrime-20` were all `not_zero_heading_native_gap`.
- Metadata title text exists for several rows, but the rows do not match the native untagged zero-heading/no-owner shape targeted by the visible-title fallback diagnostic.
- No new source-text or visible-title heading lane is supported.

`all-input-reading-order-shell-diagnostic` found:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`
- The only recovered route with final orphan-debt evidence was `vspcrime-11`, an already high-scoring control/caution row.

## Decision

This holdout is diagnostic-only. It exposes real outside-source debt in table/header transactions, zero-heading evidence, and runtime tail, but it does not justify a general behavior change:

- Table predicates are not clean because same-source A-grade/control rows also match stable table/header target shapes.
- Existing table tools already attempted several lows and hit PAC-visible header-association regressions or no-effect states.
- The zero-heading rows do not match the current safe visible-title/native-heading fallback predicate.
- Reading-order shell diagnostics found no safe sequence candidate.

No source change was accepted, so no original-50 regression validation was required for this set. Downloaded public PDFs and generated local artifacts were deleted after metrics extraction.

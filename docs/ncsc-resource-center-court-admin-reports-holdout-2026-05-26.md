# NCSC Resource Center Court Administration Reports Holdout - 2026-05-26

## Source

- Public source API: https://ncsc.contentdm.oclc.org/digital/api/search/collection/ctadmin/field/all/searchterm/report/maxRecords/100
- Source collection: National Center for State Courts Resource Center, Court Administration collection.
- Selection: first 20 PDF items from the public `report` search that downloaded as valid PDFs under the strict decimal `10,000,000` byte cap.
- Oversized candidates skipped by `curl --max-filesize 10000000`: item `2409` and item `610`.

## Sample

| ID | File | Bytes | Item ID | Year | Description |
| --- | --- | ---: | --- | --- | --- |
| `ncsc-01` | `ncsc-01.pdf` | 2,088,668 | `1852` | `2005` | The Mosaic of Institutional Culture and Performance: Trial Courts as Organizations |
| `ncsc-02` | `ncsc-02.pdf` | 4,694,712 | `561` | `1984` | Catalog of Statistics Publications in the NCSC Library |
| `ncsc-03` | `ncsc-03.pdf` | 1,344,071 | `234` | `1980` | State Court Model Annual Report |
| `ncsc-04` | `ncsc-04.pdf` | 6,024,827 | `266` | `1990` | Philadelphia Management Audit: A Review of Recommended Management Reforms: Final Report |
| `ncsc-05` | `ncsc-05.pdf` | 3,091,142 | `2411` | `2015` | Eugene Municipal Court Caseflow Management Assessment: Final Report |
| `ncsc-06` | `ncsc-06.pdf` | 2,081,513 | `247` | `1997` | Traffic Violations Bureau Operations and Workflow Analysis: Revised Final Report |
| `ncsc-07` | `ncsc-07.pdf` | 3,438,803 | `132` | `1976` | Virginia Circuit Court Caseload Reporting Study: Requirements Document |
| `ncsc-08` | `ncsc-08.pdf` | 4,630,383 | `569` | `1982` | Implementing the Model Annual Report: National Court Statistics Project |
| `ncsc-09` | `ncsc-09.pdf` | 5,518,567 | `190` | `1977` | Virginia Circuit Court Caseload Reporting Study: Final Report |
| `ncsc-10` | `ncsc-10.pdf` | 1,302,643 | `1491` | `2008` | Update and Review of Maryland's District and Circuit Court Judicial Standards and Development of Circuit Court Master Standards |
| `ncsc-11` | `ncsc-11.pdf` | 6,587,462 | `742` | `1996` | Kansas: A Statistical Management Review: Appendices |
| `ncsc-12` | `ncsc-12.pdf` | 2,574,677 | `780` | `1987` | A Brief Review of Connecticut Judicial Department Biennial Reports for the Years 1982-1984 and 1984-1986: A Technical Assistance Report |
| `ncsc-13` | `ncsc-13.pdf` | 8,163,871 | `709` | `2004` | Achieving Excellence in the Georgia Superior Court in Chatham County: Report of An Organization and Management Review |
| `ncsc-14` | `ncsc-14.pdf` | 2,916,006 | `37` | `1999` | Michigan Trial Court Consolidation: Final Evaluation Report |
| `ncsc-15` | `ncsc-15.pdf` | 5,341,800 | `876` | `1997` | Hennepin County District Court Fourth Judicial District Minneapolis, Minnesota: Division Two Operations and Workflow Analysis: Final Published Report |
| `ncsc-16` | `ncsc-16.pdf` | 5,246,760 | `877` | `1997` | Hennepin County District Court Fourth Judicial District Minneapolis, Minnesota: Division Three Operations and Workflow Analysis: Final Published Report |
| `ncsc-17` | `ncsc-17.pdf` | 5,103,701 | `2014` | `1998` | Judicial Retention Evaluation in Four States: A Report with Recommendations |
| `ncsc-18` | `ncsc-18.pdf` | 1,853,746 | `743` | `1996` | Kansas: A Statistical Management Review: Final Report |
| `ncsc-19` | `ncsc-19.pdf` | 5,561,411 | `188` | `1976` | Virginia Circuit Court Caseload Reporting Study: General Design Document |
| `ncsc-20` | `ncsc-20.pdf` | 5,365,531 | `878` | `1997` | Hennepin County District Court Fourth Judicial District Minneapolis, Minnesota: Division Four Operations and Workflow Analysis: Final Published Report |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/ncsc-resource-center-court-admin-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/ncsc-resource-center-court-admin-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Completed: `20/20`
- Mean: `32.40 -> 92.45`
- Median after: `93`
- Grades after: `19 A / 0 B / 0 C / 1 D / 0 F`
- Rows below `93`: `2`
- Rows below `95`: `18`
- p50/p95/max runtime: `20853ms / 205225ms / 254668ms`
- Hard timeouts/errors: `0`
- `false_positive_applied=0`

Low rows:

| File | Result | Main residual evidence |
| --- | --- | --- |
| `ncsc-05.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=71`, table/header PAC debt |
| `ncsc-10.pdf` | `92/A` | `reading_order=80`, `title_language=89`, one-point near miss |

A two-row low repeat reproduced both scores:

- `ncsc-05.pdf`: `69/D`
- `ncsc-10.pdf`: `92/A`

## Diagnostics

`outside-holdout-low-row-diagnostic` returned:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `11`
- Lane split:
  - `table_target_resolution_needed`: `1` row, `24` raw points
  - `near_miss_monitor`: `1` row, `1` raw point

`table-target-resolution-diagnostic` over `ncsc-05` and same-source controls returned:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: none
- Unsafe same-source control candidate: `ncsc-01`
- Prior non-table target rows: `ncsc-05`
- Classification counts: `7 control_or_high_grade_noise`, `1 stable_normalize_target`, `1 non_table_target_attempt`

The `ncsc-05` table debt is real, but the current table path is not safe enough for promotion:

- Existing table tools partially moved the row from `59` to `69`, but did not resolve the final table/PDF-UA debt.
- Later `normalize_table_structure` / `repair_native_table_headers` attempts rejected on `pac_rule_regressed(pdfua.table.header_association_present)`.
- `set_table_header_cells` resolved one target as `LBody`, so the diagnostic classified the focus row as a prior non-table target attempt.
- A same-source control, `ncsc-01`, also matched a stable table-shape target predicate.

## Decision

This holdout is diagnostic-only. It narrowly misses the source mean target by `11` raw points, but the only score-moving lane is a single table/header residual with non-table target-resolution risk and unsafe same-source control overlap. The evidence does not justify a general table behavior change, scorer masking, PAC relaxation, source-specific gate, row-specific gate, or timeout policy change.

No behavior was accepted, so no original-50 regression validation was required for this set. Downloaded public PDFs and generated local artifacts were deleted after metrics extraction.

# Missouri DOC PREA Audits Holdout - 2026-05-24

## Source

- Source pages:
  - `https://doc.mo.gov/programs/PREA/PREA-audits/2023`
  - `https://doc.mo.gov/programs/PREA/PREA-audits/2022`
  - `https://doc.mo.gov/programs/PREA/PREA-audits/2021`
- Agency: Missouri Department of Corrections
- Sample: 20 facility PREA audit report PDFs from the 2023, 2022, and 2021 public audit pages
- Constraint: all PDFs were official public-source PDFs and below 10 MB

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/missouri-doc-prea-audits-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `61.35 -> 69.65`
- Median after remediation: `69`
- Grades after remediation: `0 A / 1 B / 0 C / 19 D / 0 F`
- Rows below `93`: `20`
- Runtime p50/p95/max: `58301ms / 68038ms / 68572ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | year | facility | bytes |
| --- | ---: | --- | ---: |
| `modocprea-01` | 2023 | Boonville Correctional Center | 719881 |
| `modocprea-02` | 2023 | Eastern Reception, Diagnostic & Correctional Center | 736322 |
| `modocprea-03` | 2023 | Farmington Correctional Center | 484262 |
| `modocprea-04` | 2023 | Jefferson City Correctional Center | 704363 |
| `modocprea-05` | 2023 | Missouri Eastern Correctional Center | 459523 |
| `modocprea-06` | 2023 | Potosi Correctional Center | 720609 |
| `modocprea-07` | 2023 | Tipton Correctional Center | 724329 |
| `modocprea-08` | 2023 | Farmington Community Supervision Center | 459718 |
| `modocprea-09` | 2023 | Hannibal Community Supervision Center | 450251 |
| `modocprea-10` | 2022 | Chillicothe Correctional Center | 1430299 |
| `modocprea-11` | 2022 | Maryville Treatment Center | 1424155 |
| `modocprea-12` | 2022 | Moberly Correctional Center | 1454801 |
| `modocprea-13` | 2022 | Northeast Correctional Center | 1444929 |
| `modocprea-14` | 2022 | Southeast Correctional Center | 1434727 |
| `modocprea-15` | 2022 | Women's Eastern Reception, Diagnostic & Correctional Center | 1442279 |
| `modocprea-16` | 2022 | Kennett Community Supervision Center | 1283288 |
| `modocprea-17` | 2022 | Poplar Bluff Community Supervision Center | 1287982 |
| `modocprea-18` | 2022 | Transition Center of St. Louis | 1296729 |
| `modocprea-19` | 2021 | Farmington Correctional Center | 1985352 |
| `modocprea-20` | 2021 | Algoa Correctional Center | 1636130 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `467`
- Table-target rows: `20`
- Timeout/error rows: `0`

Table target-resolution diagnostic:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `modocprea-01`, `modocprea-02`, `modocprea-03`, `modocprea-04`, `modocprea-05`, `modocprea-06`, `modocprea-07`, `modocprea-08`, `modocprea-09`, `modocprea-10`, `modocprea-11`, `modocprea-12`, `modocprea-13`, `modocprea-14`, `modocprea-15`, `modocprea-16`, `modocprea-17`, `modocprea-18`, `modocprea-19`, `modocprea-20`
- Unsafe control candidates: `none`
- Prior non-table target rows: `none`
- Classification counts: `20 stable_normalize_target`, `5 control_or_high_grade_noise`

The table diagnostic is cleaner than several prior outside PREA/statistical-report samples because all focus rows expose stable object-backed table targets and the original controls did not match the unsafe target predicate. The failure is still not ready for acceptance because the baseline table tools already attempted the relevant lane and mostly rejected on PAC-visible table-header association regressions or no structural change. This points to a table/header transaction truth gap, not a missing broad routing gate.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

Missouri is a high-impact future table transaction proof source: it has 20/20 low rows, all with native stable table targets, no hard timeouts, no false positives, and no unsafe original-control trigger in the current discriminator. A valid future change would still need to prove that normalization and header association can be transacted together without suppressing `pdfua.table.header_association_present`, without PAC masking, and with original-50 quality and speed validation.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

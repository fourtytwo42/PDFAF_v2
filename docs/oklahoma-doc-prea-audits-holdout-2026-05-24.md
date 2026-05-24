# Oklahoma DOC PREA Audits Holdout - 2026-05-24

## Source

- Source page: `https://oklahoma.gov/doc/prison-rape-elimination-act.html`
- Agency: Oklahoma Department of Corrections
- Sample: first 20 usable facility PREA audit report PDFs from the public PREA report page
- Constraint: all counted PDFs were official public-source PDFs and below 10 MB
- Skip note: one 2024 Jess Dunn PDF was skipped because it was about 17.7 MB

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/oklahoma-doc-prea-audits-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `64.75 -> 69.35`
- Median after remediation: `69`
- Grades after remediation: `1 A / 0 B / 0 C / 18 D / 1 F`
- Rows below `93`: `19`
- Runtime p50/p95/max: `30174ms / 31407ms / 32024ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | year | facility | bytes |
| --- | --- | --- | ---: |
| `okdocprea-01` | 2025 | Allen Gamble Correctional Center | 492137 |
| `okdocprea-02` | 2025 | Lexington Assessment and Reception Center | 495161 |
| `okdocprea-03` | 2025 | Union City Community Corrections Center | 476160 |
| `okdocprea-04` | 2025 | Joseph Harp Correctional Center | 499061 |
| `okdocprea-05` | 2025 | Great Plains Correctional Center | 487508 |
| `okdocprea-06` | 2025 | Bill Johnson Correctional Center | 474025 |
| `okdocprea-07` | 2025 | Enid Community Corrections Center | 466373 |
| `okdocprea-08` | 2025 | James Crabtree Correctional Center | 463007 |
| `okdocprea-09` | 2024 | Jim E. Hamilton Correctional Center | 603411 |
| `okdocprea-10` | 2024 | Howard McLeod Correctional Center | 587333 |
| `okdocprea-11` | 2024 | Mack Alford Correctional Center | 592434 |
| `okdocprea-12` | 2024 | Oklahoma State Penitentiary | 526175 |
| `okdocprea-13` | 2024 | Jackie Brannon Correctional Center | 532104 |
| `okdocprea-14` | 2024 | Northeastern Oklahoma Community Corrections | 554582 |
| `okdocprea-15` | 2024 | Dick Conner Correctional Center | 547952 |
| `okdocprea-16` | 2024 | Oklahoma State Reformatory | 529516 |
| `okdocprea-17` | 2024 | Eddie Warrior Correctional Center | 697758 |
| `okdocprea-18` | 2024 | Lawton Community Corrections | 814198 |
| `okdocprea-19` | 2023 | Clara Waters Community Corrections Center | 492583 |
| `okdocprea-20` | 2023 | John H. Lilley Correctional Center | 517306 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `473`
- Table-target rows: `18`, carrying `435` raw points
- Reading/link-order rows: `1`, carrying `42` raw points
- Timeout/error rows: `0`

Table target-resolution diagnostic:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `okdocprea-01`, `okdocprea-02`, `okdocprea-03`, `okdocprea-04`, `okdocprea-05`, `okdocprea-06`, `okdocprea-07`, `okdocprea-08`, `okdocprea-09`, `okdocprea-10`, `okdocprea-11`, `okdocprea-12`, `okdocprea-13`, `okdocprea-14`, `okdocprea-15`, `okdocprea-16`, `okdocprea-17`, `okdocprea-18`
- Unsafe same-source control candidates: none
- Prior non-table target rows: none
- Classification counts: `18 stable_normalize_target`, `6 control_or_high_grade_noise`, `1 layout_only_no_table_target`

Observed table-tool outcomes in the baseline run:

- `88` `normalize_table_structure` attempts rejected.
- `72` `set_table_header_cells` attempts returned `no_effect`.
- `36` `repair_native_table_headers` attempts rejected.
- `36` `normalize_table_structure` attempts applied but did not move the table/PAC result enough to recover the row.
- `36` `repair_native_table_headers` attempts returned `no_effect`.
- The dominant PAC rejection string was `pac_rule_regressed(pdfua.table.header_association_present)` with `134` occurrences across table-related attempts.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

Oklahoma is the cleanest PREA-style table/header transaction proof source found so far: `18` low rows share stable object-backed table targets, the same-source A-grade control does not trigger, original controls do not trigger the target predicate, and runtime is bounded. That is useful evidence for the next table/header transaction design, but it is not enough by itself to change production behavior. Current table tools already attempt the lane and mostly fail honestly on PAC-visible table-header association regressions or no structural effect.

`okdocprea-20` is a separate reading/link-order residual (`51/F`, `heading_structure=0`, `reading_order=30`) but it is not the dominant raw-point lane for this source.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

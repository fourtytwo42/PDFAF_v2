# South Carolina DOC Policies Holdout - 2026-05-24

## Source

- Source page: `https://www.doc.sc.gov/policy/policy-listing`
- Agency: South Carolina Department of Corrections
- Sample: 20 PDFs selected by evenly sampling the official policy PDF list, excluding the non-policy FAQ link
- Constraint: all counted PDFs were official SCDC policy PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/south-carolina-doc-policies-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `51.40 -> 85.25`
- Median after remediation: `94.5`
- Grades after remediation: `14 A / 0 B / 0 C / 0 D / 6 F`
- Rows below `93`: `6`
- Runtime p50/p95/max: `12684ms / 21964ms / 77213ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `scdocpol-01` | ADM-11.01, "Employee and Service Provider ID Cards," (PDF) | 58818 |
| `scdocpol-02` | ADM-11.18, "Solicitation of Agency Employees," (PDF) | 178015 |
| `scdocpol-03` | ADM-11.33, "Employee Participation in Associations/Conferences," (PDF) | 15454 |
| `scdocpol-04` | ADM-13.01, "Requests for Construction, Renovation, Demolition, and Major Repair," (PDF) | 247189 |
| `scdocpol-05` | ADM-15.03, "Processing Requests for Automated Applications, Audiovisual Equipment, and Communications Equipment," (PDF) | 249635 |
| `scdocpol-06` | ADM-15.14, "E-Mail Retention, Backup, And Archival," (PDF) | 188265 |
| `scdocpol-07` | ADM-16.09, "Exposure Control Plan (Bloodborne Pathogens)," (PDF) | 66037 |
| `scdocpol-08` | ADM-17.06, "Training Advisory Councils," (PDF) | 176667 |
| `scdocpol-09` | BH-19.13, "Mental Health Services - Gilliam Psychiatric Hospital (GPH)" (PDF) | 98026 |
| `scdocpol-10` | GA-01.08, "Military Selective Service Act and Gun Control Act of1968" (PDF) | 20281 |
| `scdocpol-11` | GA-04.01, "Strategic Planning," (PDF) | 119808 |
| `scdocpol-12` | GA-06.11B, "Applying the Prison Rape Elimination Act (PREA)," (PDF) | 443705 |
| `scdocpol-13` | HS-18.01, "Specialized Health Services Programs," (PDF) | 358233 |
| `scdocpol-14` | HS-18.16, "Pharmaceuticals," (PDF) | 484555 |
| `scdocpol-15` | OP-21.04, "Inmate Classification Plan" (PDF) | 1556297 |
| `scdocpol-16` | OP-22.13, "Inmate Grooming Standards," (PDF) | 200896 |
| `scdocpol-17` | OP-22.31, "Color Guard/Honor Guard," (PDF) | 108676 |
| `scdocpol-18` | PS-08.01, "Mandatory Educational Attendance Program," (PDF) | 281707 |
| `scdocpol-19` | PS-10.06, "Inmate Hobbycraft Program," (PDF) | 458303 |
| `scdocpol-20` | SK-22.02, "Safekeepers," (PDF) | 230358 |

## Diagnostics

Low-row diagnostic:

- Decision: `no_safe_low_row_lane`
- Recommended lane: `none`
- Raw points needed for mean `93`: `155`
- Timeout/error rows: `0`
- Lane split: `6` rows classified as `no_safe_predicate`, carrying `204` raw points below `93`

Focused native heading/reading diagnostic:

- Distribution: `4` `no_safe_heading_anchor`, `1` `native_partial_heading_reachability_candidate`, `1` `mixed_alt_table_not_heading_first`
- Implementable row: `scdocpol-14` only
- Recommended direction: `run_focused_target_with_existing_safe_heading_tools`

Residual rows:

- `scdocpol-04`, `scdocpol-11`, `scdocpol-18`, and `scdocpol-20` stayed at `59/F` with `heading_structure=0` and no existing safe native heading-owner tool candidate.
- `scdocpol-14` stayed at `59/F`; the diagnostic found one tagged visible anchor candidate, but the benchmark already attempted `create_heading_from_tagged_visible_anchor` and rejected it without score gain.
- `scdocpol-15` stayed at `59/F` with mixed heading, table, and PDF/UA debt. It was not a heading-first behavior candidate.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

This source remains below the target mean under the current engine. The failure shape is real and useful: several tagged SCDC policy PDFs expose zero-heading residuals where the source text is visible but current native evidence does not provide a safe existing-owner heading mutation target. The focused diagnostic found only one implementable row, which is not enough to justify a broad behavior change or raise this source near the mean target.

No original-50 regression validation was required because no source behavior changed.

Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

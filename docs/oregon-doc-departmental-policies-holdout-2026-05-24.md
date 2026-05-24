# Oregon DOC Departmental Policies Holdout - 2026-05-24

## Source

- Source page: `https://www.oregon.gov/doc/rules-and-policies/pages/policies.aspx`
- Agency: Oregon Department of Corrections
- Sample: first 20 distinct main departmental policy PDFs from the official policy list, excluding attachments, forms, appendices, guides, and Spanish translations
- Constraint: all counted PDFs were official Oregon DOC PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/oregon-doc-departmental-policies-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `59.45 -> 94.35`
- Median after remediation: `94.5`
- Grades after remediation: `19 A / 1 B / 0 C / 0 D / 0 F`
- Rows below `93`: `6`
- Runtime p50/p95/max: `9604ms / 16638ms / 17731ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `ordocpol-01` | 10.1.2 Telecommunications | 875072 |
| `ordocpol-02` | 10.1.4 Resource Conservation | 161681 |
| `ordocpol-03` | 10.1.5 Honor Guard | 175222 |
| `ordocpol-04` | 10.1.6 State/Tribal Government to Government Relations | 142423 |
| `ordocpol-05` | 10.1.7 Secure Storage of Personal Handguns and Ammunition | 262910 |
| `ordocpol-06` | 10.1.8 Diversity and Inclusion | 140886 |
| `ordocpol-07` | 10.1.9 Public Records Management | 273698 |
| `ordocpol-08` | 10.1.12 Immigration and Citizenship | 230748 |
| `ordocpol-09` | 10.2.1 Internal Audit | 310153 |
| `ordocpol-10` | 10.3.1 Emergency Management | 235834 |
| `ordocpol-11` | 10.3.2 Bomb Threats/Suspected Bomb Threats/Suspicious Packages | 272980 |
| `ordocpol-12` | 10.3.3 Use of Naloxone Nasal Spray | 143742 |
| `ordocpol-13` | 10.4.1 Directive Development | 544148 |
| `ordocpol-14` | 10.4.2 Procedure Development | 314536 |
| `ordocpol-15` | List of Repealed DOC Policies and Direction to DAS Policies | 114217 |
| `ordocpol-16` | 20.1.1 Department Mission and Values | 183471 |
| `ordocpol-17` | 20.1.2 Code of Ethics | 151124 |
| `ordocpol-18` | 20.1.3 Code of Conduct | 168499 |
| `ordocpol-19` | 20.1.5 Essential Functions of DPSST Certifiable Positions | 251540 |
| `ordocpol-20` | 20.1.6 Dress Code | 219896 |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `metadata_pdfua_candidate`
- Raw points needed for mean `93`: `0`
- Timeout/error rows: `0`
- Lane split: `5` near-miss monitor rows carrying `14` raw points, plus `1` metadata/PDF-UA row carrying `1` raw point

Residual rows:

- `ordocpol-19` scored `89/B` with table, heading, PDF/UA, and reading-order near-miss debt.
- `ordocpol-10`, `ordocpol-14`, `ordocpol-05`, and `ordocpol-16` scored `90-91/A` and were classified as `near_miss_monitor`.
- `ordocpol-01` scored `92/A` and was classified as `metadata_pdfua_candidate`, but title and language were already fixed and the source needed zero raw points to clear the target.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The Oregon DOC policy PDFs pass the source mean target, run quickly, and preserve `false_positive_applied=0`. The residuals are low-priority near misses or a one-row metadata/PDF-UA candidate, so they do not justify a new general behavior lane or original-50 regression validation.

Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

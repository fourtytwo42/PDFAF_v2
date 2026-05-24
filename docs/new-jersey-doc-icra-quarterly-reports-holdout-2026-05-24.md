# New Jersey DOC ICRA Quarterly Reports Holdout - 2026-05-24

## Source

- Source page: `https://www.nj.gov/corrections/pages/Reports/IsolatedConfinementReports.html`
- Agency: New Jersey Department of Corrections
- Sample: first 20 `ICRA Quarterly Report` PDFs from the official NJDOC isolated-confinement reports page
- Constraint: all counted PDFs were official NJDOC PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/new-jersey-doc-icra-quarterly-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `53.30 -> 94.75`
- Median after remediation: `94`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `10913ms / 12038ms / 12771ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `njdocicra-01` | ICRA Quarterly Report FY26 Q1 | 255611 |
| `njdocicra-02` | ICRA Quarterly Report FY26 Q2 | 255485 |
| `njdocicra-03` | ICRA Quarterly Report FY26 Q3 | 265655 |
| `njdocicra-04` | ICRA Quarterly Report FY25 Q1 | 288516 |
| `njdocicra-05` | ICRA Quarterly Report FY25 Q2 | 290561 |
| `njdocicra-06` | ICRA Quarterly Report FY25 Q3 | 291082 |
| `njdocicra-07` | ICRA Quarterly Report FY25 Q4 | 290906 |
| `njdocicra-08` | ICRA Quarterly Report FY24 Q1 | 287505 |
| `njdocicra-09` | ICRA Quarterly Report FY24 Q2 | 288966 |
| `njdocicra-10` | ICRA Quarterly Report FY24 Q3 | 289656 |
| `njdocicra-11` | ICRA Quarterly Report FY23 Q1 | 291785 |
| `njdocicra-12` | ICRA Quarterly Report FY23 Q2 | 291173 |
| `njdocicra-13` | ICRA Quarterly Report FY23 Q3 | 289358 |
| `njdocicra-14` | ICRA Quarterly Report FY23 Q4 | 290859 |
| `njdocicra-15` | ICRA Quarterly Report FY22 Q1 | 151601 |
| `njdocicra-16` | ICRA Quarterly Report FY22 Q2 | 528944 |
| `njdocicra-17` | ICRA Quarterly Report FY22 Q3 | 529882 |
| `njdocicra-18` | ICRA Quarterly Report FY22 Q4 | 528980 |
| `njdocicra-19` | ICRA Quarterly Report FY21 Q1 | 213849 |
| `njdocicra-20` | ICRA Quarterly Report FY21 Q2 | 214011 |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Rows below `93`: `0`
- Timeout/error rows: `0`

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The New Jersey ICRA quarterly reports meet the mean/median target cleanly, run quickly, and preserve `false_positive_applied=0`. The source does not justify a new diagnostic lane or behavior change.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

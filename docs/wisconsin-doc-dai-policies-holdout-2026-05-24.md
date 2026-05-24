# Wisconsin DOC DAI Policies Holdout - 2026-05-24

## Source

- Source page: `https://doc.wi.gov/Pages/AboutDOC/DepartmentPolicies/DAIPolicies.aspx`
- Agency: Wisconsin Department of Corrections, Division of Adult Institutions
- Sample: first 20 distinct main DAI policy PDFs from the official policy index, excluding Spanish translations and attachments
- Constraint: all counted PDFs were official Wisconsin DOC PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/wisconsin-doc-dai-policies-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean after remediation: `96.65`
- Median after remediation: `97`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `7450ms / 11394ms / 11671ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `widocdai-01` | DAI Policy 3000001 | 396337 |
| `widocdai-02` | DAI Policy 3000002 | 354643 |
| `widocdai-03` | DAI Policy 3000003 | 809012 |
| `widocdai-04` | DAI Policy 3000004 | 364185 |
| `widocdai-05` | DAI Policy 3000005 | 415477 |
| `widocdai-06` | DAI Policy 3000007 | 382669 |
| `widocdai-07` | DAI Policy 3000008 | 160414 |
| `widocdai-08` | DAI Policy 3000009 | 433224 |
| `widocdai-09` | DAI Policy 3000010 | 435394 |
| `widocdai-10` | DAI Policy 3000011 | 331800 |
| `widocdai-11` | DAI Policy 3000012 | 348773 |
| `widocdai-12` | DAI Policy 3000013 | 282194 |
| `widocdai-13` | DAI Policy 3000015 | 171311 |
| `widocdai-14` | DAI Policy 3000019 | 385210 |
| `widocdai-15` | DAI Policy 3000021 | 347969 |
| `widocdai-16` | DAI Policy 3000022 | 140666 |
| `widocdai-17` | DAI Policy 3000024 | 352978 |
| `widocdai-18` | DAI Policy 3000025 | 488666 |
| `widocdai-19` | DAI Policy 3000026 | 360604 |
| `widocdai-20` | DAI Policy 3000027 | 91185 |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Timeout/error rows: `0`
- Rows below `93`: `0`

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The Wisconsin DAI policy PDFs meet the target cleanly, run quickly, and preserve `false_positive_applied=0`. The source does not justify a new diagnostic lane or behavior change.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

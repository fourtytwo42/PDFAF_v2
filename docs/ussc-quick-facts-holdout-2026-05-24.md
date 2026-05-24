# USSC Quick Facts Holdout - 2026-05-24

## Source

- Source page: `https://www.ussc.gov/research/quick-facts`
- Agency: United States Sentencing Commission
- Sample: first 20 Quick Facts topic pages from the index, each resolved to its official Quick Facts PDF
- Constraint: all counted PDFs were official USSC PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/ussc-quick-facts-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `40.25 -> 94.60`
- Median after remediation: `94`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `12384ms / 13548ms / 13674ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `usscqf-01` | Individuals in the Federal Bureau of Prisons | 490813 |
| `usscqf-02` | Career Offenders | 479642 |
| `usscqf-03` | Zero-Point Individuals | 516392 |
| `usscqf-04` | Supervised Release | 890909 |
| `usscqf-05` | Sentenced Organizations | 738932 |
| `usscqf-06` | Mandatory Minimum Penalties | 516280 |
| `usscqf-07` | Illegal Reentry | 475767 |
| `usscqf-08` | Alien Smuggling | 478394 |
| `usscqf-09` | Drug Trafficking | 576598 |
| `usscqf-10` | Methamphetamine Trafficking | 506032 |
| `usscqf-11` | Fentanyl Analogue Trafficking | 505558 |
| `usscqf-12` | Powder Cocaine Trafficking | 484430 |
| `usscqf-13` | Crack Cocaine Trafficking | 484083 |
| `usscqf-14` | Marijuana Trafficking | 482746 |
| `usscqf-15` | Oxycodone Trafficking | 473521 |
| `usscqf-16` | Heroin Trafficking | 483787 |
| `usscqf-17` | Theft, Property Destruction, and Fraud | 479304 |
| `usscqf-18` | Money Laundering | 476939 |
| `usscqf-19` | Health Care Fraud | 484297 |
| `usscqf-20` | Government Benefits Fraud | 617862 |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Rows below `93`: `0`
- Timeout/error rows: `0`

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The USSC Quick Facts set is a useful contrast to the PREA table-heavy public holdouts. These two-page federal statistical fact sheets start with low raw scores but remediate quickly and consistently to A-grade, with no false-positive-applied evidence and no runtime tail. This supports the current deterministic pipeline on compact publication-style statistical PDFs and does not expose a new safe improvement lane.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.

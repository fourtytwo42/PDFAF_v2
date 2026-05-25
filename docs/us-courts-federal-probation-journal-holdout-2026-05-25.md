# U.S. Courts Federal Probation Journal Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using U.S. Courts Federal Probation Journal article PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://www.uscourts.gov/probation-journal-topic/evidence-based-practices`
- Sample: first 20 unique official U.S. Courts PDF downloads from the evidence-based practices topic page that completed successfully and were under 10MB
- Duplicate handling: PDF downloads were de-duplicated by SHA-256 before counting the sample
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/us-courts-federal-probation-journal-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `34.00 -> 95.90`
- Median: `34 -> 95`
- Minimum final score: `93`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `6454ms / 8704ms / 9343ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Final scores:

| File | Pages | Size | Score |
| --- | ---: | ---: | ---: |
| `uscfp-01.pdf` | `10` | `225029` | `95/A` |
| `uscfp-02.pdf` | `5` | `95232` | `100/A` |
| `uscfp-03.pdf` | `8` | `154955` | `95/A` |
| `uscfp-04.pdf` | `7` | `583064` | `95/A` |
| `uscfp-05.pdf` | `6` | `175748` | `95/A` |
| `uscfp-06.pdf` | `9` | `138180` | `100/A` |
| `uscfp-07.pdf` | `10` | `155595` | `95/A` |
| `uscfp-08.pdf` | `8` | `242835` | `95/A` |
| `uscfp-09.pdf` | `5` | `79765` | `95/A` |
| `uscfp-10.pdf` | `4` | `110680` | `95/A` |
| `uscfp-11.pdf` | `13` | `308824` | `93/A` |
| `uscfp-12.pdf` | `11` | `179387` | `95/A` |
| `uscfp-13.pdf` | `7` | `231701` | `95/A` |
| `uscfp-14.pdf` | `5` | `151882` | `95/A` |
| `uscfp-15.pdf` | `3` | `85085` | `95/A` |
| `uscfp-16.pdf` | `5` | `107406` | `95/A` |
| `uscfp-17.pdf` | `6` | `184896` | `95/A` |
| `uscfp-18.pdf` | `6` | `131809` | `100/A` |
| `uscfp-19.pdf` | `11` | `185375` | `95/A` |
| `uscfp-20.pdf` | `6` | `125370` | `100/A` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/us-courts-federal-probation-journal-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Timeout/error rows: `0`

The sample was made of short native-untagged journal articles. The existing deterministic remediation path handled the set cleanly: PDF/UA metadata, basic structure synthesis, heading generation from layout, orphan MCID cleanup, and bookmark post-pass work were sufficient to move every row to an A grade.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source exceeded the requested source mean target: `95.90`.
- Median was also above target at `95`.
- There were no rows below `93`, no hard timeouts, and no errors.
- `false_positive_applied` stayed `0`.
- The low-row diagnostic recommended no scoring or remediation lane.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.

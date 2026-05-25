# New York DCJS Publications Holdout - 2026-05-25

## Summary

This was a public outside-source holdout against New York Division of Criminal Justice Services publication PDFs. The sample used 20 unique direct PDFs under 10 MB discovered from official DCJS publications/statistics pages, primarily `https://www.criminaljustice.ny.gov/crimnet/pubs.htm`.

The source passed on the first deterministic run without behavior changes.

- Local run before cleanup: `/mnt/pdf-review/public-holdouts/new-york-dcjs-publications-2026-05-25/run-r1`
- PDFs processed: `20/20`
- Mean: `46.80 -> 94.35`
- Median after: `95.5`
- Grades after: `19 A / 0 B / 0 C / 1 D / 0 F`
- Rows below `93`: `2`
- Runtime p50/p95/max: `22064ms / 73491ms / 94334ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

## Sample

| Row | Source URL | Bytes |
| --- | --- | ---: |
| `nydcjs-01` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/final-2024/FINAL%202024%20DCJS%20Annual%20Performance%20Report%20-%206-12-2025.pdf` | `767775` |
| `nydcjs-02` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/Crime%20in%20New%20York%20State%202023%20Final%20Data.pdf` | `2791578` |
| `nydcjs-03` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/FINAL%202024%20LEAAP%20Annual%20Report%20w%20appendices.pdf` | `1072098` |
| `nydcjs-04` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/2025%20Asset%20Forfeiture%20Report_FINAL.pdf` | `192776` |
| `nydcjs-05` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/2024%20Insurance%20Fraud%20Annual%20Report.pdf` | `699571` |
| `nydcjs-06` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/2024%20Environmental%20Conservation%20Law%20Annual%20Report.pdf` | `667823` |
| `nydcjs-07` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/dar/DAR_userguide.pdf` | `611093` |
| `nydcjs-08` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/dar/dar-3q-2025-newyorkstate.pdf` | `1020863` |
| `nydcjs-09` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/dar/dar-2q-2025-newyorkstate.pdf` | `1038213` |
| `nydcjs-10` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/dar/dar-1q-2025-newyorkstate.pdf` | `1037048` |
| `nydcjs-11` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/dar/dar-4q-2024-newyorkstate.pdf` | `1053392` |
| `nydcjs-12` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/dar/dar-4q-2023-newyorkstate.pdf` | `974062` |
| `nydcjs-13` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/FINAL%202022%20Domestic%20Homicide%20Report.pdf` | `1738347` |
| `nydcjs-14` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/FINAL%202021%20Domestic%20Homicide%20Report%207-18-23.pdf` | `697016` |
| `nydcjs-15` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/FINAL2020-Domestic-Homicide-Report12-21.pdf` | `497549` |
| `nydcjs-16` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/FINAL%202024%20Hate%20Crime%20Report%2005_06_26.pdf` | `445486` |
| `nydcjs-17` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/FINAL%202023%20Hate%20Crime%20Report.pdf` | `995465` |
| `nydcjs-18` | `https://www.criminaljustice.ny.gov/crimnet/ojsa/FINAL%202022%20Hate%20Crime%20Report.pdf` | `588970` |
| `nydcjs-19` | `https://www.criminaljustice.ny.gov/pio/humantrafficking/2024-Human-Traffiking-Report.pdf` | `2287509` |
| `nydcjs-20` | `https://www.criminaljustice.ny.gov/pio/humantrafficking/2023-Human-Trafficking-Report.pdf` | `2306572` |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `0`
- Residual table row: `nydcjs-07` at `69/D`
- Near miss: `nydcjs-19` at `92/A`

Focused table target-resolution diagnostic:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `nydcjs-07`, `nydcjs-19`
- Unsafe control candidates: `none`
- Prior non-table target rows among controls: `nydcjs-08`, `nydcjs-09`, `nydcjs-10`

This looked clean enough to justify a sequence probe, but not direct behavior promotion.

Table/structure sequence probe:

- Rows probed: `nydcjs-07`, `nydcjs-19`
- Sequence candidates: `0`
- Harmful PAC regressions: `7`
- No useful movement outcomes: `21`
- `nydcjs-07` remained `69/D`; best observed path was no score movement.
- `nydcjs-19` remained `92/A`; best observed path was no score movement.

## Decision

No source behavior was changed or accepted.

This source passed the holdout target, and the residual table debt does not currently support a safe general fix:

- The main D-grade row has real table/PAC debt, but existing table/header sequences do not move it.
- The near miss has stable table-header evidence, but sequence probing did not improve it.
- Several probes produced PAC regressions, including table-header and figure-alt regressions, so broadening table routing would risk repair honesty.
- Some same-family controls have prior non-table table-target attempts, so target resolution remains a known table-lane risk.

No original-50 validation was required because no behavior changed.

Generated PDFs and benchmark artifacts were local-only and deleted after metrics extraction.

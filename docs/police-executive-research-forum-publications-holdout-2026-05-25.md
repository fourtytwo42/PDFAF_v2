# Police Executive Research Forum Publications Holdout - 2026-05-25

## Summary

This was a public outside-source holdout against Police Executive Research Forum free online document PDFs. The sample used 20 unique direct PDFs under 10 MB discovered from `https://www.policeforum.org/free-online-documents`.

Two fresh deterministic runs reproduced the same all-row mean, below the target, with no false positives or hard failures.

- Local r1 run before cleanup: `/mnt/pdf-review/public-holdouts/police-executive-research-forum-publications-2026-05-25/run-r1`
- Local r2 run before cleanup: `/mnt/pdf-review/public-holdouts/police-executive-research-forum-publications-2026-05-25/run-r2`
- PDFs processed: `20/20` in both runs
- r1 mean: `39.50 -> 92.75`, median `95`
- r2 mean: `39.50 -> 92.75`, median `95`
- r2 grades after: `18 A / 0 B / 0 C / 2 D / 0 F`
- r2 rows below `93`: `3`
- r2 runtime p50/p95/max: `51091ms / 161284ms / 161977ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

## Sample

| Row | Source URL | Bytes |
| --- | --- | ---: |
| `perf-01` | `https://www.policeforum.org/assets/CommandPerformance.pdf` | `1898208` |
| `perf-02` | `https://www.policeforum.org/assets/LawEnforcementandSociety.pdf` | `9038245` |
| `perf-03` | `https://www.policeforum.org/assets/PolicingMassDemonstrations.pdf` | `3252773` |
| `perf-04` | `https://www.policeforum.org/assets/Traffic.pdf` | `5711475` |
| `perf-05` | `https://www.policeforum.org/assets/ThirdPartyPolicing.pdf` | `2392786` |
| `perf-06` | `https://www.policeforum.org/assets/PoliceMediaInteractions.pdf` | `5803938` |
| `perf-07` | `https://www.policeforum.org/assets/Carjacking.pdf` | `4567933` |
| `perf-08` | `https://www.policeforum.org/assets/Restraint.pdf` | `7552023` |
| `perf-09` | `https://www.policeforum.org/assets/Civilianization.pdf` | `7201206` |
| `perf-10` | `https://www.policeforum.org/assets/MPAAImplementation.pdf` | `10063982` |
| `perf-11` | `https://www.policeforum.org/assets/SpotlightSantaCruz.pdf` | `2861617` |
| `perf-12` | `https://www.policeforum.org/assets/ICATJails.pdf` | `4413183` |
| `perf-13` | `https://www.policeforum.org/assets/MBHResponse.pdf` | `4550239` |
| `perf-14` | `https://www.policeforum.org/assets/RecruitmentRetention.pdf` | `9429549` |
| `perf-15` | `https://www.policeforum.org/assets/WomenPoliceLeadership.pdf` | `6248601` |
| `perf-16` | `https://www.policeforum.org/assets/TransformingRecruitTraining.pdf` | `2112431` |
| `perf-17` | `https://www.policeforum.org/assets/DakotaCountySpotlight.pdf` | `982917` |
| `perf-18` | `https://www.policeforum.org/assets/ChiefsCompensation.pdf` | `1021607` |
| `perf-19` | `https://www.policeforum.org/assets/ChicagoExecutiveDevelopment.pdf` | `643416` |
| `perf-20` | `https://www.policeforum.org/assets/ResponseMassDemonstrations.pdf` | `2487414` |

## Diagnostics

r1 low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `5`
- Low rows: `perf-03` at `69/D`, `perf-05` at `69/D`, `perf-10` at `88/B`

r2 reproduced the source miss:

- `perf-03`: `69/D`
- `perf-05`: `69/D`
- `perf-10`: `91/A`
- Mean remained `92.75` because other row movement offset the `perf-10` gain.

Low-row repeat reproduced the table lows:

- `perf-03`: `69/D`
- `perf-05`: `69/D`
- `perf-10`: `88/B`

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `perf-03`, `perf-05`, `perf-10`
- Unsafe control candidate: `perf-09`
- Prior non-table target row: `perf-04`
- The focus rows have real stable object-backed table debt, but the predicate is not clean enough for behavior promotion because same-source controls also expose table-target risk.

Table/structure sequence probe:

- Rows probed: `perf-03`, `perf-05`, `perf-10`
- Sequence candidates: `1`
- Harmful PAC regressions: `16`
- No useful movement outcomes: `25`
- Only `perf-10` had a sequence candidate: remediated-state `repair_native_table_headers_then_header_cleanup`, moving `88/B -> 91/A` with table markup `79 -> 100` and table-header debt `24 -> 0`.
- `perf-03` and `perf-05` had no safe sequence candidate and stayed `69/D`.

## Decision

No source behavior was changed or accepted.

This source remains a useful below-target table-debt holdout. The engine is only `5` raw points short of mean `93`, but the available evidence does not justify broadening table normalization/header routing:

- The two D-grade rows are stable and real, but no existing sequence candidate moves them.
- The one sequence candidate on `perf-10` is only `+3` raw points and is not enough to clear the source.
- A same-source A-grade/control row also triggers stable table-header evidence.
- Several table/structure probes produce PAC regressions, so adding a table exception or fallback would risk repair honesty.

No original-50 validation was required because no behavior changed.

Generated PDFs and benchmark artifacts were local-only and deleted after metrics extraction.

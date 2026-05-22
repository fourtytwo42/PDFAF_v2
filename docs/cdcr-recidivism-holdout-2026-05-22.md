# CDCR Recidivism Reports Holdout

Date: 2026-05-22

## Scope

This was a public outside-corpus check against California Department of Corrections and Rehabilitation recidivism publications. The source is the official CDCR Offender Recidivism page:

https://www.cdcr.ca.gov/research/offender-outcomes-characteristics/offender-recidivism/

The sampled set contained 20 downloadable PDF reports from that page, all under 10 MB. The PDFs and generated benchmark artifacts were kept local under `/mnt/pdf-review` during the diagnostic and are not source assets.

## Run

The diagnostic run used four five-file bounded shards with Node 22, deterministic native remediation only, no semantic work, no remediated PDFs, `300000ms` per-PDF child timeout, and `10000ms` external grace.

## Summary

- PDFs processed: 20/20
- Mean: 70.00 -> 84.50
- Median after: 91
- Final grades: 10 A, 2 B, 0 C, 8 D, 0 F
- Raw points needed for mean 93: 170
- Timeouts/errors: 0
- `false_positive_applied`: 0
- Runtime p50/p95/max: 40.148s / 202.098s / 212.611s

This source set does not clear the current outside-source quality gate. The failures are concentrated in long statistical reports, not in the shorter EACP, parole-hearing, or fire-camp reports.

## Low-Row Shape

Ten rows were below 93. The eight D rows scored between 67 and 69 after remediation, and the two B rows scored 88. The repeated shape was table/PDF-UA debt:

- Most low rows had `table_markup=0`.
- The two B rows had `table_markup=70` but still showed PDF-UA table/header debt.
- Heading debt was present on many rows but was not the primary supported lane.
- Alt scores were low-looking on several rows, but checker-visible figure-alt coverage was already complete in replay evidence.

The high-impact lane is table structure/header association for annual statistical-report tables.

## Table Diagnostic

The low-row diagnostic recommended table target resolution. The table target-resolution diagnostic found stable object-backed table targets on all 10 low rows, but it did not justify production behavior:

- Stable focus candidates: `cdcr-01` through `cdcr-10`.
- Same-source high-grade/control rows `cdcr-11` through `cdcr-14` also had stable table target shape when analyzed from source.
- Original controls such as the accessible fixture and Teams variants did not promote, but the same-source overlap shows target existence alone is not a safe discriminator.
- Prior table tools on this family frequently hit `pac_rule_regressed(pdfua.table.header_association_present)` or related PAC table/header debt.

Decision: `keep_table_target_resolution_diagnostic_only`.

This reinforces the parked BJS/OJJDP table finding: table normalization can expose real object-backed targets and may raise scores, but it is not acceptable unless the final PAC table/header debt is reduced or preserved.

## Figure/Alt Diagnostic

A focused figure/alt no-gain diagnostic also stayed diagnostic-only:

- Focus rows: 9
- Behavior candidates: 0
- Scoring candidates: 0
- `false_positive_applied`: 0

The apparent alt weakness was not a safe behavior lane. Replay evidence showed checker-visible figure-alt coverage was already complete for the focus rows, such as `19/19`, `21/21`, `22/22`, `44/44`, and similar counts. The remaining scores are not primarily blocked by missing checker-visible figure alt.

## Decision

Decision: `diagnostic_only_table_lane_parked`.

No source behavior change is accepted from this source set. Original-50 validation was not rerun because no scoring, planner, mutator, API, or Docker behavior changed.

## Parked Lane

The table lane remains the best high-impact opportunity for this class of outside PDFs, but the next accepted change must prove more than target existence:

- at least two outside positive rows must share a general structural predicate,
- final PAC table/header debt must be reduced or preserved,
- same-source high-grade rows and original controls must not trigger unsafe changes,
- `false_positive_applied` must remain `0`,
- and original-50 quality and speed validation must pass before acceptance.

CDCR is useful as a hard holdout: it shows the current engine handles some official criminal-justice report families well, but still struggles on long statistical table-heavy report families where PAC-style table/header association truth is the gating risk.

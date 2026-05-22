# All-Unique Current Bounded Full Validation r3

Date: 2026-05-22

## Decision

Decision: `all_unique_validation_passing`.

This is a fresh deterministic all-unique validation from current source after the `structure-4438` Python analysis optimization and the bounded-runner grace fix. It used the existing `351` deduped PDF shard set, native PDFAF only, `--no-semantic`, `--no-pdfs`, child remediation timeout `300000ms`, external kill grace `10000ms`, `/mnt/pdf-review/pdfaf-tmp` for temporary files, and four shard workers at a time.

This replaces r39 and r2 as the best accepted fresh all-unique floor for the active goal.

## Artifacts

Generated artifacts stay local:

- Run root: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r3`
- Merged all-row baseline: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r3/merged/baseline_report.json`
- Mean diagnostic: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r3/diagnostic/all-input-mean-diagnostic.md`
- Checkpoint rollup: `/mnt/pdf-review/pdfaf-validation/pac-poc-validation-checkpoint-after-allunique-r3-2026-05-22-r1/pac-poc-validation-checkpoint.md`

The merged report uses only the eight shard-level `baseline_report.json` files and normalizes timeout/error rows to `afterScore=0` for the official all-row mean. There were no timeout/error rows in this run.

## Result

- PDFs processed: `351`
- Completed rows: `351`
- All-row mean: `93.5698`
- Median: `94`
- Grade distribution: `331 A / 1 B / 2 C / 7 D / 10 F`
- Rows below `93`: `32`
- Net raw points needed for mean `93`: `0`
- Raw buffer above mean `93`: `+200`
- Raw buffer above r39 accepted floor: `+201`
- `false_positive_applied=0`
- Timeout/error rows: `0`
- Runtime mean / median / p95 / max: `27112ms / 16304ms / 93139ms / 233587ms`

Runtime p95 is well below the prior r39-bound check:

- r39 p95 reference: `197611ms`
- allowed by `max(3%, 5s)`: `203539ms`
- current r3 p95: `93139ms`

## Movement From r2

r3 improves r2 by `+452` raw points:

- r2 all-row mean: `92.2821`
- r3 all-row mean: `93.5698`
- hard timeouts: `3 -> 0`
- p95: `188394ms -> 93139ms`

Largest useful recoveries versus r2:

- `0120/4690`: `0 -> 92`
- `0031/structure-4438`: `0 -> 69`
- `0135/4453`: `0 -> 69`
- `0073/4171`: `59 -> 99`
- `0325/4693`: `59 -> 98`
- `0236/4705`: `59 -> 97`
- `0306/4657`: `59 -> 95`
- `0033/4655`: `59 -> 94`
- `0136/4503`: `59 -> 93`
- `0317/4574`: `59 -> 93`
- `0019/long-4516`: `59 -> 92`
- `0028/structure-4076`: `68 -> 90`

Largest regressions versus r2 are still route/analyzer volatility rather than accepted behavior changes:

- `0284`: `98 -> 59`
- `0183`: `94 -> 59`
- `0297`: `94 -> 59`
- `0346`: `94 -> 59`
- `0127`: `89 -> 69`
- `0345`: `97 -> 79`
- `0108`: remained low at `59` despite focused repeat recovery to `94`
- `0020/long-4683`: remained low at `59` despite focused repeat recovery to `97`

Do not use these route-volatility rows to justify route guards, overlays, row-specific fallbacks, or score masking.

## Remaining Deficit Shape

Below-target families:

- Heading/reading-order: `9` rows, gross deficit `273`
- Table debt: `4` rows, gross deficit `106`
- Table/alt mixed: `4` rows, gross deficit `98`
- Alt debt: `2` rows, gross deficit `49`
- Link/reading debt: `5` rows, gross deficit `20`
- PDF/UA strict debt: `5` rows, gross deficit `10`
- Aggregate near-pass/unknown: `3` rows, gross deficit `6`

Lowest rows:

- `0020/long-4683`: `59/F`, alt/PDF-UA debt
- `0084/4139`: `59/F`, zero-heading debt
- `0085/4215`: `59/F`, zero-heading/link/PDF-UA debt
- `0108/4614`: `59/F`, zero-heading/link/PDF-UA debt
- `0149/4635`: `59/F`, zero-heading debt
- `0181/4519`: `59/F`, heading/table/PDF-UA debt
- `0183/4593`: `59/F`, zero-heading debt
- `0284`: `59/F`, zero-heading debt
- `0297`: `59/F`, zero-heading/PDF-UA debt
- `0346/4673`: `59/F`, zero-heading debt
- `0223/4105`: `67/D`, table/alt/PDF-UA mixed debt
- `0031/structure-4438`: `69/D`, table/alt/PDF-UA mixed debt
- `0113/4147`: `69/D`, table/PDF-UA debt
- `0127/4743`: `69/D`, table/heading/link/PDF-UA debt
- `0135/4453`: `69/D`, table/PDF-UA debt
- `0137/4678`: `69/D`, table/alt/link/PDF-UA mixed debt
- `0138/4735`: `69/D`, table/alt/PDF-UA mixed debt

## Checkpoint Rollup

The local PAC/POC validation checkpoint after this all-unique run reports `validation_gate_ready`:

- Original-50: `50/50`, mean `94.0000`, median `95.5`, `false_positive_applied=0`
- All-unique r3: `351/351`, mean `93.5698`, median `94`, `false_positive_applied=0`
- Outside Virginia holdout: `20/20`, mean `95.10`, median `95.5`, `false_positive_applied=0`

The original-50 artifact is `/mnt/pdf-review/pdfaf-validation/original50-after-structure4438-analysis-opt-2026-05-22-r1/baseline_report.json`.

The outside holdout artifact is `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-current-table-proof-full-2026-05-22-r1/baseline_report.json`.

## Interpretation

The active all-unique fresh-run quality gate is now satisfied honestly:

- no overlays;
- no shard-only claim;
- no virtual remix;
- no timeout/error rows;
- no false-positive applied mutations;
- no scorer/PAC masking or strictness reduction;
- runtime is bounded and p95 is materially better than r2/r39.

The broader PAC/POC alignment goal should remain open until the parity map and remaining remediation lanes are either exhausted or parked with evidence. The next work should use this r3 run as the accepted fresh all-unique floor and should not accept a future full-run regression below `93.5698` unless the team explicitly accepts it as stricter, more correct grading.

## Next Direction

Use r3's remaining low rows to choose future PAC/POC-aligned lanes:

1. heading/reading route volatility for zero-heading lows only if a native object-backed predicate is found;
2. table/alt mixed debt on `0223`, `0031`, `0113`, `0135`, `0137`, and `0138` only with stable table refs and controls;
3. alt/PDF-UA ownership debt on `0020` and `0296` only if final PAC-like evidence improves without route-specific fallback;
4. runtime/analyzer cleanup for the slowest residuals only if it reduces major regression risk without changing score truth.

Do not broaden behavior from route volatility alone.

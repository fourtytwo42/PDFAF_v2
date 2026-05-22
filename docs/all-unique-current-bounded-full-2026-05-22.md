# All-Unique Current Bounded Full Validation

Date: 2026-05-22

## Decision

Decision: `all_unique_validation_not_passing`.

This is a fresh deterministic all-unique validation from current source over the existing `351` deduped PDF shard set. It used native PDFAF only, `--no-semantic`, `--no-pdfs`, and a five-minute external per-PDF timeout through the bounded holdout runner.

The run is honest completion evidence for the active goal, and it does not pass the all-unique gate.

## Artifacts

- Shard root: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r1`
- Merged all-row baseline: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r1/merged/baseline_report.json`
- Mean diagnostic: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r1/diagnostic/all-input-mean-diagnostic.md`
- Validation checkpoint: `/mnt/pdf-review/pdfaf-validation/pac-poc-validation-checkpoint-2026-05-22-r3/pac-poc-validation-checkpoint.md`

Generated artifacts stay local and are not source-tracked.

## Result

- PDFs processed: `351`
- Completed rows: `345`
- All-row mean: `91.8832`
- Completed-row mean: `93.4812`
- Median: `94`
- Grade distribution: `322 A / 3 B / 2 C / 6 D / 12 F / 6 ?`
- Rows below `93`: `40`
- Points needed for mean `93`: `392`
- `false_positive_applied=0`
- Runtime mean / median / p95 / max: `39796.8ms / 16318ms / 206139ms / 300136ms`
- Runtime p95 reference: r39 `197611ms`
- Runtime p95 allowed by `max(3%, 5s)`: `203539ms`
- Runtime p95 status: fail, `206139ms > 203539ms`

## Timeout Rows

Six rows hit the external five-minute timeout and count as zero in the official all-row mean:

- `0019/long-4516`
- `0028/structure-4076`
- `0031/structure-4438`
- `0097/4694`
- `0120/4690`
- `0135/4453`

Compared with r39, current source did not preserve the one-point-near-pass state. The current run has `6` hard timeouts versus r39's `4`, and the all-row mean dropped from `92.9972` to `91.8832`.

One r39 hard blocker did improve in this run:

- `0208/4446` completed at `97/A`.

But the focused `0019` recovery did not hold in broad context:

- focused current diagnostic: `59/F`, then `85/B`;
- fresh all-unique bounded run: timeout.

## Deficit Shape

The current deficit is mostly runtime/analyzer boundedness plus repeatable low structural tails, not a missing broad scorer-calibration lane.

Top mean-loss families from the diagnostic:

- Timeout/runtime rows: `6` rows, `558` raw points lost to zeroes.
- Heading/reading rows: `9` rows, `243` points below `93`.
- Table/alt mixed rows: `5` rows, `134` points below `93`.
- Alt debt rows: `4` rows, `117` points below `93`.
- Table debt rows: `4` rows, `96` points below `93`.

The lowest non-timeout rows include:

- `0020/long-4683`: `59/F`, table/alt mixed debt.
- `0061/4680`: `59/F`, alt debt.
- `0085/4215`: `59/F`, heading/reading debt.
- `0088/3921`: `59/F`, alt debt.
- `0114/4587`: `59/F`, heading/reading debt.
- `0136/4503`: `59/F`, alt debt.
- `0181/4519`: `59/F`, heading/reading debt.
- `0223/4105`: `59/F`, table/alt mixed debt.
- `0297`: `59/F`, heading/reading debt.
- `0316/4553`: `59/F`, heading/reading debt.

## Interpretation

The active goal remains open. Original-50 and the Virginia outside holdout still pass their current gates, but the all-unique scope fails both quality and runtime:

- all-row mean is below `93`;
- runtime p95 is above the accepted bound;
- hard timeouts increased versus the best accepted fresh full-run floor;
- `false_positive_applied` remains clean at `0`.

This result means the next useful work should not be another scoring/remediation expansion based only on overlays or focused repeats. The next lane should target general runtime/analyzer recovery for the timeout family first, then use the completed-run deficit list for narrow structural lanes.

## Next Direction

Priority order after this run:

1. Runtime/analyzer recovery for timeout rows that can plausibly return verified states: `0019`, `0028`, `0031`, `0097`, `0120`, and `0135`.
2. If timeout recovery stalls, choose one repeatable non-timeout structural family with at least `25` plausible points and object-backed evidence, likely heading/reading zero rows or table/alt mixed debt.
3. Do not mark the active goal complete from r39 or the focused `0019` repeat. The current authoritative all-unique checkpoint is this bounded full run.

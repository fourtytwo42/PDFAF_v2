# All-Unique Current Bounded Full Validation r2

Date: 2026-05-22

## Decision

Decision: `all_unique_validation_not_passing`.

This is a fresh deterministic all-unique validation from current source after the bounded-runner grace fix. It used the existing `351` deduped PDF shard set, native PDFAF only, `--no-semantic`, `--no-pdfs`, child remediation timeout `300000ms`, external kill grace `10000ms`, and `/mnt/pdf-review/pdfaf-tmp` for temporary files.

The run improves the previous current-source bounded validation, but it does not pass the active all-unique mean gate and it does not replace r39 as the best accepted fresh full-run floor.

## Artifacts

Generated artifacts stay local:

- Run root: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2`
- Merged all-row baseline: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2/merged/baseline_report.json`
- Mean diagnostic: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2/diagnostic/all-input-mean-diagnostic.md`

The merged report uses only the eight shard-level `baseline_report.json` files and normalizes timeout/error rows to `afterScore=0` for the official all-row mean.

## Result

- PDFs processed: `351`
- Completed rows: `348`
- All-row mean: `92.2821`
- Completed-row mean: `93.0776`
- Median: `94`
- Grade distribution: `321 A / 4 B / 1 C / 7 D / 15 F / 3 ?`
- Rows below `93`: `38`
- Net raw points needed for mean `93`: `252`
- `false_positive_applied=0`
- Runtime mean / median / p95 / max: `38326ms / 16321ms / 188394ms / 300046ms`

Runtime p95 now passes the r39-bound check:

- r39 p95 reference: `197611ms`
- allowed by `max(3%, 5s)`: `203539ms`
- current r2 p95: `188394ms`

## Timeout Rows

Three rows still timed out and count as zero:

- `0031/structure-4438`
- `0120/4690`
- `0135/4453`

The runner grace fix recovered three rows that were external-kill zeroes in r1:

- `0019/long-4516`: `0 -> 59`
- `0028/structure-4076`: `0 -> 68`
- `0097/4694`: `0 -> 95`

The net current-source movement from r1 to r2 is `+140` raw points:

- r1 mean: `91.8832`
- r2 mean: `92.2821`
- timeouts: `6 -> 3`
- p95: `206139ms -> 188394ms`

This validates the runner-boundary fix, but it is not enough to pass the all-unique target.

## Important Regressions Versus r1

The r2 run also shows route/analyzer volatility on several non-timeout rows. Largest regressions versus r1:

- `0325`: `98 -> 59`
- `0236`: `97 -> 59`
- `0306`: `95 -> 59`
- `0317`: `95 -> 59`
- `0033`: `94 -> 59`
- `0073`: `91 -> 59`
- `0108`: `91 -> 59`
- `0084`: `94 -> 69`

Largest improvements versus r1:

- `0097`: `0 -> 95`
- `0028`: `0 -> 68`
- `0019`: `0 -> 59`
- `0316`: `59 -> 97`
- `0114`: `59 -> 96`
- `0194`: `59 -> 94`
- `0297`: `59 -> 94`
- `0061`: `59 -> 88`

## Current Deficit Shape

Gross below-target deficit is still concentrated in structural tails:

- Heading/reading-order family: `14` rows, gross deficit `457`
- Table/alt mixed family: `6` rows, gross deficit `292`
- Alt debt family: `6` rows, gross deficit `186`
- Table debt family: `2` rows, gross deficit `48`

Lowest rows:

- `0031`: `0/?`, timeout
- `0120`: `0/?`, timeout
- `0135`: `0/?`, timeout
- `0019`: `59/F`, alt/PDF-UA debt
- `0020`: `59/F`, alt/PDF-UA debt
- `0033`: `59/F`, zero-heading debt
- `0073`: `59/F`, alt/heading/PDF-UA debt
- `0085`: `59/F`, zero-heading/reading/PDF-UA debt
- `0088`: `59/F`, alt/PDF-UA/table debt
- `0108`: `59/F`, zero-heading/title/link/PDF-UA debt
- `0136`: `59/F`, alt/PDF-UA/table debt
- `0149`: `59/F`, zero-heading debt
- `0181`: `59/F`, zero-heading debt
- `0223`: `59/F`, table/alt/PDF-UA mixed debt
- `0236`: `59/F`, zero-heading debt
- `0306`: `59/F`, zero-heading/PDF-UA debt
- `0317`: `59/F`, zero-heading/reading debt
- `0325`: `59/F`, zero-heading/PDF-UA debt

## Interpretation

The active goal remains open.

This run proves the bounded-runner grace fix improved validation honesty and runtime accounting, but all-unique quality still falls short:

- all-row mean is below `93`;
- best accepted fresh full-run floor remains r39 at `92.9972`;
- three hard timeouts remain;
- non-timeout route/analyzer volatility caused enough low rows to offset much of the recovered timeout value;
- `false_positive_applied` remains clean at `0`.

## Timeout Checkpoint Follow-Up

Follow-up diagnostic:

- `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2/low-checkpoint-timeout-diagnostic-r1/low-checkpoint-timeout-diagnostic.md`

The existing low-checkpoint timeout diagnostic rejects a low-score checkpoint-return policy change:

- Hard-timeout rows: `3`
- Classification counts: `low_checkpoint_too_poor: 3`
- Projected recoverable points if safe: `0`
- `0120`: best checkpoint `59/F`, rejected by `checkpoint_below_floor(59<85)`
- `0135`: best checkpoint `59/F`, rejected by `checkpoint_below_floor(59<85)`
- `0031`: best checkpoint `36/F`, rejected by `checkpoint_below_floor(36<90)`

Do not lower checkpoint floors or count these partial states just to avoid zeroes. The timeout rows need real route/fixer recovery or remain parked as honest hard timeouts.

## Current-Source Timeout Repeat After 4438 Analyzer Fix

After the `structure-4438` Python analysis optimization, the three r2 hard-timeout rows were repeated with deterministic current source:

- Run: `/mnt/pdf-review/pdfaf-validation/allunique-hard-timeouts-after-4438-opt-2026-05-22-r1/baseline_report.json`
- Runtime traces: `/mnt/pdf-review/pdfaf-validation/allunique-hard-timeouts-after-4438-opt-2026-05-22-r1/runtime-traces/`
- Mode: `--no-semantic --no-pdfs --write-runtime-traces`
- `false_positive_applied=0`

Results:

| Row | r2 full-run result | Current focused repeat | Duration |
| --- | ---: | ---: | ---: |
| `0031/structure-4438` | `0/?` timeout | `83/B` | `208014ms` |
| `0120/4690` | `0/?` timeout | `92/A` | `86203ms` |
| `0135/4453` | `0/?` timeout | `69/D` | `73952ms` |

This is useful timeout recovery evidence, not completion evidence. Counting these three focused repeats against the r2 all-row run would recover `+244` raw points and project the mean from `92.2821` to about `92.9773`. That remains about `8` raw points short of strict `93.0000` and about `7` raw points below the accepted r39 fresh floor (`92.9972`).

The `0031` recovery is explained by the accepted native Python analyzer optimization. `0120` and `0135` no longer reproduce the optional-post-alt timeout in this focused run, but `0135` still only reaches `69/D`; do not add a timeout-return or checkpoint-floor relaxation from this evidence.

## Route-Volatility Repeat After 4438 Analyzer Fix

Follow-up deterministic repeat for five high-impact r2 route-volatility rows:

- Run: `/mnt/pdf-review/pdfaf-validation/allunique-route-volatility-repeat-after-4438-opt-2026-05-22-r1/baseline_report.json`
- Runtime traces: `/mnt/pdf-review/pdfaf-validation/allunique-route-volatility-repeat-after-4438-opt-2026-05-22-r1/runtime-traces/`
- Mode: `--no-semantic --no-pdfs --write-runtime-traces`
- `false_positive_applied=0`

Results:

| Row | r2 full-run result | Current focused repeat | Duration |
| --- | ---: | ---: | ---: |
| `0033/4655` | `59/F` | `94/A` | `27723ms` |
| `0108/4614` | `59/F` | `94/A` | `25871ms` |
| `0236/4705` | `59/F` | `97/A` | `12111ms` |
| `0306/4657` | `59/F` | `95/A` | `23453ms` |
| `0317/4574` | `59/F` | `93/A` | `13531ms` |

These rows were previously classified as upstream route volatility rather than safe behavior predicates. The repeat shows that the current source can still reach the stronger route state on these files, but it does not justify a route guard, row-specific fallback, or acceptance overlay.

Combining this repeat with the three-row timeout repeat gives focused-repeat planning evidence of `+422` raw points over r2:

- Timeout repeat gain: `+244`
- Route-volatility repeat gain: `+178`
- Projected all-row mean from r2: `92.2821 -> 93.4844`
- Raw buffer above strict `93.0000`: `+170`
- Raw buffer above accepted r39 fresh floor `92.9972`: `+170`
- Combined repeat `false_positive_applied=0`

This supports running a fresh all-unique validation from current source. It is still not completion evidence: only a fresh all-unique run can replace r2/r39 for the active goal.

## Next Direction

The next implementation-capable lane should not be another broad scorer/remediation expansion or a weaker timeout-return policy. The highest-value options are:

1. route-stability diagnostics for repeatable zero-heading regressions (`0325`, `0236`, `0306`, `0317`, `0033`, `0108`, `0149`, `0181`);
2. object-backed table/alt mixed tails such as `0223`, `0137`, `0138`, or `0287`;
3. deeper timeout/analyzer recovery for `0120` and `0135` only if it can produce a real verified repair above the current low checkpoint floors.

Do not mark the active goal complete from this run.

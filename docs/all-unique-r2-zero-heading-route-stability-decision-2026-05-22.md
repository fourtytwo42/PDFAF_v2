# All-Unique r2 Zero-Heading Route-Stability Decision

Date: 2026-05-22

## Decision

Decision: `park_zero_heading_route_guard_move_to_object_backed_table_alt`.

This is a diagnostic-only follow-up to the fresh all-unique r2 validation. It compares current-source r1 good routes against current-source r2 low routes for the largest zero-heading regressions, using only existing `baseline_report.json` artifacts.

No PDFs were analyzed, remediated, mutated, written, or scored. No PAC/POC/ODL/Java/semantic process was called. No scoring, planner routing, mutation, PAC gate, timeout, Docker, or API behavior changed.

## Inputs

- r2 all-unique doc: `docs/all-unique-current-bounded-full-2026-05-22-r2.md`
- Good-run input: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r1/merged/baseline_report.json`
- Bad-run input: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2/merged/baseline_report.json`
- Local route diagnostic root: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2/route-stability-r1-vs-r2/`

The r2 checkpoint remains below the active all-unique target:

- Rows: `351`
- Mean: `92.2821`
- Median: `94`
- `false_positive_applied=0`
- Hard timeouts: `0031`, `0120`, `0135`
- Points needed for mean `93`: `252`

## Current Route Comparisons

The current r1-vs-r2 route comparisons do not justify a same-state route guard.

| Row | r1 | r2 | Classification | Finding |
| --- | ---: | ---: | --- | --- |
| `0033` | `94/A` | `59/F` | `upstream_route_volatility` | Good route reaches `create_heading_from_candidate`; bad route starts from a different language/title state. |
| `0073` | `91/A` | `59/F` | `upstream_route_volatility` | Good route avoids the r2 artifact/remap path and later gets PDF/UA/font movement; no shared rejected score-moving state. |
| `0108` | `91/A` | `59/F` | `upstream_route_volatility` | Good route has heading/link movement; bad route starts after different language/title evidence. Older same-state-looking evidence was already rejected as unsafe. |
| `0236` | `97/A` | `59/F` | `upstream_route_volatility` | Good route runs `create_heading_from_candidate` and parent-link cleanup; r2 never proves the same final-safe path. |
| `0306` | `95/A` | `59/F` | `upstream_route_volatility` | Good route reaches heading creation from a different initial state. |
| `0317` | `95/A` | `59/F` | `upstream_route_volatility` | Good route begins with tagged-visible-anchor and orphan-MCID movement; r2 starts from a different lower state. |
| `0325` | `98/A` | `59/F` | `no_safe_route_proof` | The comparison still does not expose a narrow score-moving state that could be guarded safely. |

## Rows Not Promoted By This Stage

`0149`, `0181`, and `0085` remain current zero-heading lows, but they are not r2-specific route regressions with a current good paired route in these artifacts.

Prior source-tracked evidence also keeps them out of behavior promotion:

- `0149` has older `no_safe_route_proof` / volatile route diagnostics and no accepted same-state predicate.
- `0181` only showed small non-regressive movement in residual route evidence, not a target-reaching route.
- `0085` remains a zero-heading/native-structure residual with no object-backed heading target proof in the current all-unique lane.

These rows may be revisited only with a new object-backed heading/reading proof. They do not justify a route-preference patch from this r2 comparison.

## Interpretation

The route-stability lane is not a safe implementation lane right now.

The high-value r2 zero-heading lows are real accessibility failures in the scorer output, but the available good/bad comparisons mostly diverge upstream before the score-moving repair state. Encoding the good route would be a brittle route preference, not a PAC-style structural repair. That would violate the active goal's generalization constraint and risks hiding true failures.

The rejected older probes remain rejected:

- Do not reintroduce the broad tab-order deferral from Stage198.
- Do not reintroduce metadata-exposed zero-heading fallback from Stage195.
- Do not add a filename, row, shard, or known-corpus route guard for `0033`, `0108`, `0236`, `0306`, `0317`, or `0325`.

## Next Direction

Move the next implementation-capable work to object-backed table/alt evidence from the r2 low list, especially:

- `0223`: table `0`, alt `20`, PDF/UA `57`, score `59/F`
- `0137`: table `0`, alt `60`, score `69/D`
- `0138`: table `35`, alt `60`, score `69/D`
- `0287`: table `0`, PDF/UA `50`, score `69/D`

The next diagnostic should verify stable native `/Table` or figure/alt object targets immediately before considering planner changes. Dense layout evidence alone is not enough. Any behavior must still use general structural predicates, preserve `false_positive_applied=0`, keep controls stable, and pass original-50 deterministic validation before acceptance.

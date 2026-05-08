# Table Batch Route Volatility Diagnostic

Date: 2026-05-08

## Source Artifacts

- Good reference run: `Output/experiment-corpus-baseline/run-table-header-association-target-2026-05-08-r2`
- Bad batch validation run: `Output/experiment-corpus-baseline/run-table-header-batch-target-2026-05-08-r2`
- Local diagnostic: `Output/experiment-corpus-baseline/table-batch-route-volatility-diagnostic-2026-05-08-r1`

## Decision

No remediation behavior guard is accepted from this stage.

The diagnostic found no same-state guard candidate:

- `figure-4754` is `upstream_route_volatility`.
- `fixture-inaccessible` is `PAC_blocked_useful_repair`, but the first divergence is still upstream state drift rather than a same-state route decision.

That means the current evidence does not justify a new same-state guard, a PAC gate exception, table planner broadening, or a fixed-50 run.

## Findings

| Row | Classification | Score movement | First divergence |
| --- | --- | --- | --- |
| `figure-4754` | `upstream_route_volatility` | `78/C -> 67/D` | initial `set_document_language` replay state differs before table work |
| `fixture-inaccessible` | `PAC_blocked_useful_repair` | `95/A -> 79/C` | `artifact_repeating_page_furniture` reaches a different replay state; later native link repair is missing |

`long-4700` remains useful evidence for table batching because its association debt reduced materially, but the batch stage should not be promoted until the non-table route blockers are stable or explicitly parked by acceptance policy.

## Next Direction

Recommended next stage: **fixture-inaccessible PAC-blocked link recovery isolation**.

That stage should focus only on the link recovery loss:

- compare the good route where `repair_native_link_structure` applies against the bad route where it is missing;
- inspect the PAC orphan-MCID rejection chain before the missing link repair;
- add behavior only if a narrow same-state or same-family recovery rule can preserve link-quality improvement without broad PAC gate weakening.

`figure-4754` should remain parked as upstream analyzer/route volatility until repeat diagnostics produce a same-state decision point.

## Boundaries Preserved

- No PAC scoring cap changes.
- No PAC gate changes.
- No timeout default changes.
- No API or AI behavior changes.
- No table batch threshold changes.
- Generated PDFs and `Output/` artifacts remain untracked.

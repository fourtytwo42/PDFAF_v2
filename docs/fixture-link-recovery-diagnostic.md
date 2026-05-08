# Fixture-Inaccessible Link Recovery Diagnostic

Date: 2026-05-08

## Source Artifacts

- Good reference run: `Output/experiment-corpus-baseline/run-table-header-association-target-2026-05-08-r2`
- Bad table-batch run: `Output/experiment-corpus-baseline/run-table-header-batch-target-2026-05-08-r2`
- Local diagnostic: `Output/experiment-corpus-baseline/fixture-link-recovery-diagnostic-2026-05-08-r1`

## Decision

No remediation behavior is accepted from this stage.

The diagnostic classifies `fixture-inaccessible` as `upstream_route_volatility`, not a same-state guard candidate and not a direct rejected-link PAC recovery gap. The bad route never schedules `repair_native_link_structure`; the good route applies it with the existing `pac_orphan_mcid_recovery(repair_native_link_structure)` path.

## Findings

| Row | Classification | Score movement | Link repair | First divergence |
| --- | --- | --- | --- | --- |
| `fixture-inaccessible` | `upstream_route_volatility` | `95/A -> 79/C` | good `applied_with_pac_recovery`, bad `missing` | `artifact_repeating_page_furniture` starts from a different replay state |

The existing native-link orphan-MCID recovery is working when the tool reaches acceptance. In the bad route, `artifact_repeating_page_furniture` and `set_link_annotation_contents` reject from replay state `21a799afc3e88e9e92090553`, then `mark_untagged_content_as_artifact` applies with no score movement, and the later native link repair never appears.

Because the first divergence is upstream state drift rather than same-state outcome drift, a replay-state route guard or broader PAC exception would be speculative.

## Next Direction

Keep table batching limited to the current long-4700 observation path and do not run fixed-50 from this state.

Recommended next stage: **route repeatability collection for fixture-inaccessible and figure-4754**.

That stage should run a small repeat set on the two volatile rows and classify whether the bad routes repeat from stable replay states. Only then should a same-state guard or scheduling recovery be considered.

## Boundaries Preserved

- No PAC scoring cap changes.
- No PAC gate changes.
- No global orphan-MCID exception.
- No table batch threshold changes.
- No timeout, API, planner breadth, AI, or new repair-tool changes.
- Generated PDFs and `Output/` artifacts remain untracked.

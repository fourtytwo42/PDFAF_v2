# Runtime Reanalysis Policy Diagnostic

Date: 2026-05-21
Updated: 2026-05-22

This is a read-only diagnostic for runtime-tail rows after benchmark runtime telemetry was added. It reads existing `baseline_report.json` artifacts only; it does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.

Local artifacts:

- Initial diagnostic: `/mnt/pdf-review/pdfaf-validation/runtime-reanalysis-policy-diagnostic-2026-05-21-r1/runtime-reanalysis-policy-diagnostic.md`
- Current diagnostic: `/mnt/pdf-review/pdfaf-validation/runtime-reanalysis-policy-diagnostic-current-2026-05-22-r1/runtime-reanalysis-policy-diagnostic.md`

## Current Result

Decision: `keep_runtime_policy_parked`

The 2026-05-22 repeat with current original-50 telemetry reversed the earlier narrow `4683` interpretation. `4683` is now a high-quality route control, not a cutoff candidate: it reached `98/A` while still spending `103563ms` in stage reanalysis and `105102ms` in live analysis. Any broad no-gain or live-analysis cutoff would risk removing a route that produces a correct high score.

| Row | Classification | Meaning |
| --- | --- | --- |
| `4680` | `live_reanalysis_route_volatility_blocker` | Finished `59/F`, but live analysis included a score-gaining route (`59 -> 97`) before later route collapse. Diagnose route volatility before any cutoff policy. |
| `4683` | `live_reanalysis_positive_route_control` | Finished `98/A` and depends on substantial live analysis. Preserve this path in any future runtime policy. |
| `4076` | `structural_reanalysis_tail_monitor` | Finished `89/B`; tail is repeated structural reanalysis with no live-analysis lane, so it needs a separate policy design. |
| `4438` | `repeated_timeout_known_debt` | Known hard-timeout debt; no policy should infer a safe return state without trace/checkpoint evidence. |
| `4516` | `score_adjudication_not_runtime_policy` | Explicit stricter-score adjudication row; runtime policy must not mask the current lower score. |
| `4754` | `not_runtime_policy_candidate` | Runtime is visible, but telemetry does not support a policy predicate. |

## Earlier Result

The initial 2026-05-21 diagnostic had reported `plan_reanalysis_admission_probe`, mostly because `4683` completed at `59/F` with heavy reanalysis and checkpoint pressure. That was useful telemetry, but it was not stable enough to justify behavior. The current repeat shows the same family can also produce a high-quality route that depends on the very live-analysis work a cutoff might remove.

## Interpretation

No source behavior should be added from this runtime lane yet. The runtime evidence is real, but it currently mixes four different problems:

- hard timeout debt (`4438`);
- stricter score/adjudication debt (`4516`);
- low-score route volatility with a hidden score-gaining live route (`4680`);
- high-quality live-analysis dependency (`4683`);
- structural reanalysis tail work outside the live-analysis lane (`4076`).

Treat runtime policy as parked until a narrower predicate can prove it preserves high-score live-analysis routes, avoids stricter-score masking, and returns only PAC-honest verified states.

## Guardrails For A Future Probe

Any future behavior stage must be narrow and independently validated:

- require current runtime telemetry, including live-analysis before/after scores;
- reject rows where live analysis ever exposes a score-gaining path unless the later regression is separately explained;
- preserve high-score live-analysis controls such as `4683`;
- reject stricter-score adjudication rows such as `4516`;
- keep known hard-timeout rows such as `4438` parked until they have trace/checkpoint evidence;
- separate structural reanalysis tails such as `4076` from figure/alt live-analysis policy;
- require an already verified, PAC-honest checkpoint/final state, not a partial state chosen only to avoid a zero;
- preserve `false_positive_applied=0`, no new hard timeouts, and bounded p95 before acceptance.

## Decision

Keep runtime behavior parked. Continue PAC/POC alignment work through detection/remediation lanes with cleaner structural evidence rather than a broad runtime shortcut.

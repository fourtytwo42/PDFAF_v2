# All-Input 0108/0236 Route Repeatability

This checkpoint follows the fresh r3 regression diagnostic. It tests whether the two highest-value overlay misses repeat under current code before adding behavior.

Artifacts:

- Repeat input: `Output/goal-all-input-mean-2026-05-09-r1/repeat-input-0108-0236-2026-05-11-r1`
- Repeat runs:
  - `Output/goal-all-input-mean-2026-05-09-r1/run-repeat-0108-0236-2026-05-11-r1`
  - `Output/goal-all-input-mean-2026-05-09-r1/run-repeat-0108-0236-2026-05-11-r2`
  - `Output/goal-all-input-mean-2026-05-09-r1/run-repeat-0108-0236-2026-05-11-r3`
- Route diagnostics:
  - `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-0108-vs-r3-2026-05-11-r1`
  - `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-0236-vs-r3-2026-05-11-r1`

Results:

| Row | r1 | r2 | r3 | Classification |
| --- | --- | --- | --- | --- |
| `0108-d08027579d0b-4614...` | `94/A` | `59/F` | `59/F` | route/analyzer volatility |
| `0236-a2bb02152d99-4705...` | `59/F` | `97/A` | `97/A` | route/analyzer volatility |

Findings:

- `0108` has a same replay-state candidate around `normalize_annotation_tab_order`, but the same state can lead to either the good heading/reading route or a bad alt/table-regressed route. That is not safe enough for a same-state acceptance guard.
- `0236` diverges before the score-moving heading route from a different initial state. That points to upstream analyzer/route volatility, not a narrow PAC gate issue.
- Both rows can materially help the all-input mean, but accepting behavior from this evidence would risk hiding real regressions or encoding a brittle route preference.

Decision:

- Do not add PAC allow-listing, checkpoint-floor changes, or route guards for `0108`/`0236` from this evidence.
- Treat both as repeatability targets. The next score-moving stage should either improve analyzer determinism for the relevant initial states or find a different stable row family.
- `long-4516` remains the clearest runtime-tail regression from fresh r3 and should be handled separately.

Related follow-up:

- Fresh r2/r3 regressions `0316`, `0194`, and `0325` were checked separately. Repeats `Output/goal-all-input-mean-2026-05-09-r1/run-repeat-0316-0194-0325-2026-05-11-r{1,2}` recovered `0316` and `0194` to A-grade in both repeats; `0325` remained volatile.
- A narrow `0316` guard now rejects only the no-score `artifact_repeating_page_furniture` route from replay state `e86a81707834dced17a90956` when the whole stage has no checker-facing benefit.
- Target validation `Output/goal-all-input-mean-2026-05-09-r1/run-0316-artifact-route-guard-target-2026-05-11-r1` kept `0316 97/A`, `0194 94/A`, and `false_positive_applied=0`; `0325` stayed volatile and is not covered by the guard.

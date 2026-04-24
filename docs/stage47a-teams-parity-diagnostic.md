# Stage 47A: Teams Protected Parity Diagnostic

Stage 47A is diagnostic-only. Stage 47 r1 proved that directly quarantining Teams `repair_alt_text_structure` is not safe: it can preserve reading order while losing the alt recovery needed for `fixture-teams-remediated`.

Use the read-only diagnostic before adding another Teams protected-row guard:

```bash
pnpm run benchmark:teams-parity -- \
  Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7 \
  Output/experiment-corpus-baseline/run-stage45-full-2026-04-23-r2 \
  Output/experiment-corpus-baseline/run-stage47-target-2026-04-23-r1 \
  Output/experiment-corpus-baseline/stage47a-teams-parity-diagnostic-2026-04-24-r1
```

The report compares:
- `fixture-teams-original`
- `fixture-teams-remediated`
- `fixture-teams-targeted-wave1`

It reports final key category deltas, per-tool score timelines, parsed mutation notes/invariants, final detection signals, final ICJIA-parity signals, and whether same-run safe-state evidence exists.

Important limitation: benchmark rows do not store per-tool category snapshots. If a tool reaches the protected score floor but the final row has strong category regressions, the diagnostic marks same-run safe-state evidence as `inconclusive` rather than assuming the intermediate state was safe.

Stage 47 should only proceed if the diagnostic identifies a viable state or exact divergence that can preserve both Teams alt recovery and reading order. Do not retry the rejected r1 pattern of blocking alt cleanup solely because reading order drops.

Initial result from `stage47a-teams-parity-diagnostic-2026-04-24-r1`:
- `fixture-teams-original`: no same-run score state reaches the Stage 42 protected floor; final debt remains `heading_structure 100 -> 86`.
- `fixture-teams-remediated`: no same-run score state reaches the Stage 42 protected floor; Stage 45 keeps `alt_text 100` but leaves `reading_order 80`, while Stage 47 r1 keeps `reading_order 100` but drops `alt_text 20`.
- `fixture-teams-targeted-wave1`: safe in both compared runs and should be treated as a non-regression check, not the reason for more protected-row heuristics.

Conclusion: Stage 47 should stop unless new instrumentation can produce a same-run state that preserves both Teams alt recovery and reading order. The recommended next implementation stage is Stage 48 general D/F reduction.

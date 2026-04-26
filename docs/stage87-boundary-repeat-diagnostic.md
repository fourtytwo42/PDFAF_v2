# Stage 87 Boundary Repeat Diagnostic

Stage 87 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Next Work

Do not implement boundary handling or acceptance reuse yet. The parked
boundary evidence is repeat-stable in one case and intermittent in another, so
it is not ready for a broad policy change.

## Evidence

- Diagnostic output is local at
  `Output/experiment-corpus-baseline/stage87-boundary-repeat-diagnostic-2026-04-26-r1/stage86-checker-evidence-classifier.md`.
- The reachable/contentless boundary candidate on `4699`
  (`paragraph:ref:422_0`) stayed `boundary_candidate` across all 4 repeats with
  `reachable=true`, `directContent=false`, and `subtreeMcidCount=0`.
- A separate boundary candidate surfaced intermittently on `structure-4076`
  (`paragraph:ref:81928_0`) with `reachable=false`, `directContent=true`, and
  `subtreeMcidCount=1`.
- Checker-facing controls stayed checker-facing:
  - `long-4470`
  - `fixture-teams-remediated`
- No wrapper/path groups appeared in the repeat sample.

## Implication

Keep the boundary candidate parked. Any future implementation needs a
boundary-aware policy that can distinguish:

- contentless but reachable paragraph structure
- intermittent unreachable-but-content-bearing paragraph structure

without broadening aggregation or adding route guards.

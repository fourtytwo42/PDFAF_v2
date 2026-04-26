# Stage 90 Boundary Subtype Diagnostic

Stage 90 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep the parked boundary evidence excluded from aggregation and acceptance
reuse. Do not add boundary handling yet.

## Evidence

- Stage 90 evidence is local at
  `Output/experiment-corpus-baseline/stage90-boundary-subtype-diagnostic-2026-04-26-r1`.
- The comparison of Stage 87, Stage 88, and Stage 89 isolates two boundary
  subtypes:
  - stable contentless-reachable boundary: `4699` / `paragraph:ref:422_0`
  - intermittent unreachable-but-content-bearing boundary:
    `structure-4076` / `paragraph:ref:81928_0`
- `4699` stayed contentless-reachable and boundary-stable across all sampled
  reports. It remains parked, but it is still not a promotion target.
- `structure-4076` only appears intermittently as an unreachable content-bearing
  boundary candidate. That makes it repeat-sensitive and unsafe for any broad
  acceptance reuse policy.
- No wrapper/path groups were introduced by this comparison.

## Next Work

Any future boundary implementation needs a repeat-preserving subtype-aware
policy that can keep stable contentless-reachable evidence separate from the
intermittent unreachable-but-content-bearing case. Do not add a route guard or
scorer change before that policy exists.

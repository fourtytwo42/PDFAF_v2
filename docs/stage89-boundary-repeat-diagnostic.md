# Stage 89 Boundary Repeat Diagnostic

Stage 89 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep the parked boundary candidate excluded from aggregation and acceptance
reuse. Do not add a boundary-aware implementation yet.

## Evidence

- Diagnostic output is local at
  `Output/experiment-corpus-baseline/stage89-boundary-repeat-diagnostic-2026-04-26-r1`.
- The targeted legacy/v1-edge sample used six repeats over:
  - `structure-4076`
  - `long-4470`
  - `4699`
  - `4722`
- `4699` stayed `boundary_candidate` across all six repeats with
  `reachable=true`, `directContent=false`, and `subtreeMcidCount=0`.
- `structure-4076`, `long-4470`, and `4722` stayed clean in this sample, and
  no wrapper/path groups appeared.
- The run therefore confirms the boundary candidate is still parked and still
  not safe to promote into acceptance reuse.

## Next Work

Do not convert this into a boundary-aware implementation or a route guard.
If boundary handling resumes, it should be a repeat-preserving subtype policy
that can separate stable contentless-reachable evidence from intermittent
boundary variance without broadening aggregation.

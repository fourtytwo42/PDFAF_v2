# Stage 93 Boundary Subtype Parking

Stage 93 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep both boundary subtypes parked and excluded from acceptance reuse.

## Evidence

- The Stage 92 evidence expansion at
  `Output/experiment-corpus-baseline/stage92-boundary-subtype-evidence-expansion-2026-04-26-r1`
  still shows only two repeat-relevant boundary subtypes:
  - stable `contentless_reachable_boundary` on `4699`
  - intermittent `unreachable_content_bearing_boundary` on `structure-4076`
- `4699` remains corroborated by raw, repeat, and policy evidence, but it is
  still contentless and parked.
- `structure-4076` remains intermittent and repeat-sensitive, so it is still
  not safe for acceptance reuse.
- No wrapper/path groups were introduced by the expanded evidence, so the work
  remains subtype-aware policy design rather than implementation.

## Implication

Do not collapse the two boundary subtypes into one accept/reuse bucket. If
boundary handling resumes later, it should require fresh repeat-preserving
evidence that keeps the stable contentless-reachable case parked while still
excluding the intermittent unreachable-content-bearing case.

## Next Work

Keep both boundary subtypes parked. Do not implement a boundary policy from the
current evidence alone.

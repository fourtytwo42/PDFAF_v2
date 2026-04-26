# Stage 96 Boundary Subtype Parking

Stage 96 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep both boundary subtypes parked and excluded from acceptance reuse.

## Evidence

- The fresh Stage 94 evidence at
  `Output/experiment-corpus-baseline/stage94-boundary-subtype-fresh-evidence-2026-04-26-r1`
  added six sibling-v1 sample PDFs and still did not expose a safe promotion
  path.
- `evolve-4082` and `evolve-4184` both match the parked
  `contentless_reachable_boundary` shape.
- `evolve-4466`, `evolve-4482`, and `evolve-4485` stayed checker-facing only.
- `evolve-4770` showed no boundary groups in this sample.
- The intermittent `unreachable_content_bearing_boundary` subtype still has no
  repeat-preserving policy evidence strong enough for reuse.

## Implication

Do not implement boundary handling, route guards, scorer changes, or any
accept/reuse collapse from this evidence alone.

## Next Work

Keep both boundary subtypes parked. Resume only if future evidence shows a
repeat-preserving subtype-aware policy that keeps the stable contentless case
parked while still excluding the intermittent content-bearing case.

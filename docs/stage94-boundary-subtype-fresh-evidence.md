# Stage 94 Boundary Subtype Fresh Evidence

Stage 94 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep both boundary subtypes parked and excluded from acceptance reuse.

## Evidence

- Fresh evidence was gathered from a small sibling-v1 sample in
  `Output/experiment-corpus-baseline/stage94-boundary-subtype-fresh-evidence-2026-04-26-r1`.
- The fresh sample used six locally available report-style PDFs from the
  sibling candidate corpus:
  - `4082-original.pdf`
  - `4184-original.pdf`
  - `4466-original.pdf`
  - `4482-original.pdf`
  - `4485-original.pdf`
  - `4770-original.pdf`
- Two fresh rows now show the same parked stable subtype shape as the earlier
  `4699` boundary candidate:
  - `evolve-4082`
  - `evolve-4184`
- Both rows expose repeated paragraph groups with `reachable=true`,
  `directContent=false`, and `subtreeMcidCount=0` across all repeats.
- The newly sampled row `evolve-4466` stayed fully checker-facing with no
  boundary groups, and `evolve-4482` / `evolve-4485` also stayed
  checker-facing.
- `evolve-4770` did not surface boundary groups in this sample.
- No wrapper/path groups were introduced, and no repeat-preserving case for
  the intermittent unreachable-content-bearing subtype appeared.

## Implication

The fresh evidence strengthens the conclusion from Stages 91 through 93:
contentless-reachable boundary evidence remains parked, and there is still no
safe implementation path for boundary promotion.

## Next Work

Keep both boundary subtypes parked. Do not implement boundary handling, route
guards, or scorer changes from this evidence alone.

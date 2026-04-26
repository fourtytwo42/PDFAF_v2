# Stage 92 Boundary Subtype Evidence Expansion

Stage 92 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep the boundary subtypes parked. The expanded evidence is still not strong
enough to justify a repeat-preserving implementation, even under the Stage 92
xhigh review. This stage is diagnostic-only and does not promote boundary
evidence into acceptance reuse.

## Evidence

- Expanded evidence lives at
  `Output/experiment-corpus-baseline/stage92-boundary-subtype-evidence-expansion-2026-04-26-r1`.
- The combined stage85 through stage91 evidence keeps the two repeat-relevant
  subtypes distinct:
  - `contentless_reachable_boundary` on `4699`
  - `unreachable_content_bearing_boundary` on `structure-4076`
- `4699` is corroborated by raw, repeat, and policy evidence and stays parked.
- `structure-4076` still only appears intermittently in the repeat/policy
  samples and remains parked.
- No wrapper/path groups were introduced, so the remaining work is still
  boundary subtype policy design rather than an implementation signal.

## Implication

Do not collapse the two boundary subtypes into one accept/reuse bucket. If
boundary handling is resumed, it should be a repeat-preserving subtype-aware
policy validated with fresh evidence.

## Next Work

Stage 93 should either gather fresh subtype-policy evidence or keep both
boundary subtypes parked and excluded from acceptance reuse. Do not implement a
boundary policy from the current evidence alone.
